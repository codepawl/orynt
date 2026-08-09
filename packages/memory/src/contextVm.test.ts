import { mkdir, mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Database } from "bun:sqlite";

import { afterEach, describe, expect, it } from "bun:test";

import {
  contextVmSessionId,
  contextVmTaskId,
  type NewContextVmEventV1,
  type RepositoryEvidenceScopeV1,
  type RunEvent,
} from "@codepawl/shared";

import { canonicalTraceEventFromRunEvent } from "./canonicalTrace";
import {
  ContextVmFailure,
  LocalSqliteContextVmStore,
} from "./contextVm";

const roots: string[] = [];

async function store() {
  const root = await mkdtemp(path.join(os.tmpdir(), "orynt-contextvm-"));
  roots.push(root);
  const value = new LocalSqliteContextVmStore({ root });
  await value.initialize();
  return value;
}

function event(
  sourceId: string,
  overrides: Partial<NewContextVmEventV1> = {},
): NewContextVmEventV1 {
  return {
    sessionId: contextVmSessionId("run-contextvm-1"),
    taskId: contextVmTaskId("task-contextvm-1"),
    source: { kind: "test_fixture", id: sourceId },
    occurredAt: "2026-08-04T00:00:00.000Z",
    actor: { kind: "runtime", id: "contextvm-test" },
    kind: "tool_result",
    payload: { summary: "finished" },
    sensitivity: "internal",
    ...overrides,
  };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("LocalSqliteContextVmStore", () => {
  it("initializes WAL/foreign keys and appends a contiguous immutable stream", async () => {
    const runtime = await store();
    const first = await runtime.appendEvent(event("source-1"));
    const second = await runtime.appendEvent(event("source-2", {
      parentEventIds: [first.id],
    }));
    expect([first.sequenceNo, second.sequenceNo]).toEqual([1, 2]);
    expect(await runtime.scanSession({
      sessionId: first.sessionId,
      afterSequence: 1,
    })).toEqual([second]);
    expect(await runtime.status()).toMatchObject({
      health: "ready",
      journalMode: "wal",
      foreignKeys: true,
      eventCount: 2,
    });
    expect((await runtime.verify()).status).toBe("pass");
    runtime.close();
  });

  it("deduplicates post-redaction artifact bytes and fails conflicting source replay", async () => {
    const runtime = await store();
    const input = event("source-dedupe", {
      payload: { token: "sk-AAAAAAAAAAAA", result: "ok" },
      artifacts: [{
        mediaType: "text/plain",
        bytes: Buffer.from("result token=sk-BBBBBBBBBBBB\n".repeat(500)),
        sensitivity: "internal",
        label: "tool result",
      }],
    });
    const first = await runtime.appendEvent(input);
    const replay = await runtime.appendEvent(input);
    await runtime.appendEvent(event("source-shared-bytes", {
      artifacts: [{
        mediaType: "text/markdown",
        bytes: Buffer.from("result token=sk-BBBBBBBBBBBB\n".repeat(500)),
        sensitivity: "restricted",
      }],
    }));
    expect(replay.id).toBe(first.id);
    expect(first.redaction.applied).toBe(true);
    expect(first.artifacts[0]?.encoding).toBe("zstd");
    expect(await runtime.status()).toMatchObject({ eventCount: 2, artifactCount: 1 });
    const databaseBytes = await readFile(runtime.databasePath);
    expect(databaseBytes.toString("utf8")).not.toContain("AAAAAAAA");
    const report = await runtime.verify();
    expect(report).toMatchObject({ status: "pass", orphanArtifactCount: 0 });
    await expect(runtime.appendEvent(event("source-dedupe", {
      payload: { result: "different" },
    }))).rejects.toMatchObject<Partial<ContextVmFailure>>({
      code: "duplicate_conflict",
    });
    runtime.close();
  });

  it("rejects oversized inline payloads instead of hiding large evidence in SQLite", async () => {
    const runtime = await store();
    await expect(runtime.appendEvent(event("source-large-inline", {
      payload: { output: "x".repeat(70_000) },
    }))).rejects.toMatchObject<Partial<ContextVmFailure>>({
      code: "invalid_input",
    });
    runtime.close();
  });

  it("isolates owned memory and never admits secret-derived pages", async () => {
    const runtime = await store();
    const source = await runtime.appendEvent(event("source-owned-memory"));
    const base = {
      namespace: "access-test",
      kind: "fact" as const,
      status: "active" as const,
      summary: "Private operator preference",
      content: { preference: "compact output" },
      sources: [{ type: "event" as const, eventId: source.id }],
      entityIds: ["operator-preference"],
      taskIds: [],
      relations: [],
      validFrom: "2026-08-04T00:00:00.000Z",
      confidence: 1,
      importance: 1,
      evidencePriority: "current_user" as const,
      producer: "contextvm-test",
    };
    await runtime.putMemoryPage({
      ...base,
      sensitivity: "personal",
      ownerId: "operator-a",
    });
    await expect(runtime.putMemoryPage({
      ...base,
      summary: "Leaked secret",
      content: { value: "secret" },
      sensitivity: "secret",
    })).rejects.toMatchObject<Partial<ContextVmFailure>>({
      code: "invalid_input",
    });
    await expect(runtime.retrieveMemoryPages({
      namespace: "access-test",
      query: "operator preference",
    })).resolves.toMatchObject({ candidates: [] });
    await expect(runtime.retrieveMemoryPages({
      namespace: "access-test",
      query: "operator preference",
      principalId: "operator-b",
      allowedSensitivity: ["personal"],
    })).resolves.toMatchObject({ candidates: [] });
    await expect(runtime.retrieveMemoryPages({
      namespace: "access-test",
      query: "operator preference",
      principalId: "operator-a",
      allowedSensitivity: ["personal"],
    })).resolves.toMatchObject({
      candidates: [expect.objectContaining({
        page: expect.objectContaining({
          sensitivity: "personal",
          ownerId: "operator-a",
        }),
      })],
    });
    runtime.close();
  });

  it("detects a missing committed archive object after restart", async () => {
    const runtime = await store();
    const written = await runtime.appendEvent(event("source-corrupt", {
      artifacts: [{
        mediaType: "application/octet-stream",
        bytes: Buffer.from("binary evidence"),
        sensitivity: "restricted",
      }],
    }));
    const digest = written.artifacts[0]!.sha256;
    const objectPath = path.join(
      runtime.archiveRoot,
      digest.slice(0, 2),
      `${digest}.bin`,
    );
    runtime.close();
    await unlink(objectPath);
    const reopened = new LocalSqliteContextVmStore({ root: runtime.root });
    expect(await reopened.verify()).toMatchObject({ status: "fail" });
    reopened.close();
  });

  it("reports but never deletes an orphan created before a database commit", async () => {
    const runtime = await store();
    const orphanRoot = path.join(runtime.archiveRoot, "ff");
    await mkdir(orphanRoot, { recursive: true });
    const orphanPath = path.join(orphanRoot, `${"f".repeat(64)}.bin`);
    await writeFile(orphanPath, "orphan");
    const report = await runtime.verify();
    expect(report).toMatchObject({
      status: "pass",
      orphanArtifactCount: 1,
    });
    await expect(readFile(orphanPath, "utf8")).resolves.toBe("orphan");
    runtime.close();
  });

  it("keeps equal-priority facts unresolved and preserves their history", async () => {
    const runtime = await store();
    const source = await runtime.archiveArtifact({
      mediaType: "application/json",
      bytes: Buffer.from('{"source":"verified"}'),
      sensitivity: "internal",
    });
    const base = {
      namespace: "test-workspace",
      kind: "fact" as const,
      status: "active" as const,
      summary: "Runtime mode",
      subject: "runtime",
      predicate: "mode",
      sources: [{ type: "artifact" as const, artifactId: source.id }],
      entityIds: [],
      taskIds: [],
      relations: [],
      validFrom: "2026-08-04T00:00:00.000Z",
      confidence: 1,
      importance: 1,
      evidencePriority: "verified_tool" as const,
      producer: "contextvm-test",
    };
    const first = await runtime.putMemoryPage({
      ...base,
      content: { value: "safe" },
    });
    await runtime.putMemoryPage({
      ...base,
      content: { value: "fast" },
    });

    await expect(runtime.queryCurrentFact({
      namespace: base.namespace,
      subject: base.subject,
      predicate: base.predicate,
    })).resolves.toMatchObject({
      status: "conflicted",
      candidates: [{ id: first.id }, {}],
    });
    await expect(runtime.queryMemoryHistory({
      namespace: base.namespace,
      subject: base.subject,
      predicate: base.predicate,
    })).resolves.toHaveLength(2);
    await expect(runtime.verify()).resolves.toMatchObject({
      status: "pass",
      memoryPageCount: 2,
      unresolvedContradictionCount: 1,
    });
    runtime.close();
  });

  it("supersedes with higher-priority evidence and does not activate lower-priority conflicts", async () => {
    const runtime = await store();
    const source = await runtime.archiveArtifact({
      mediaType: "application/json",
      bytes: Buffer.from('{"source":"priority"}'),
      sensitivity: "internal",
    });
    const base = {
      namespace: "priority-workspace",
      kind: "fact" as const,
      status: "active" as const,
      summary: "Selected mode",
      subject: "runtime",
      predicate: "mode",
      sources: [{ type: "artifact" as const, artifactId: source.id }],
      entityIds: [],
      taskIds: [],
      relations: [],
      validFrom: "2026-08-04T00:00:00.000Z",
      confidence: 1,
      importance: 1,
      producer: "contextvm-test",
    };
    const derived = await runtime.putMemoryPage({
      ...base,
      content: { value: "derived" },
      evidencePriority: "derived_state",
    });
    const user = await runtime.putMemoryPage({
      ...base,
      content: { value: "user" },
      validFrom: "2026-08-04T01:00:00.000Z",
      evidencePriority: "current_user",
    });
    await runtime.putMemoryPage({
      ...base,
      content: { value: "inferred" },
      validFrom: "2026-08-04T02:00:00.000Z",
      evidencePriority: "model_inference",
    });

    await expect(runtime.queryCurrentFact({
      namespace: base.namespace,
      subject: base.subject,
      predicate: base.predicate,
    })).resolves.toMatchObject({
      status: "resolved",
      candidates: [{ id: user.id }],
    });
    await expect(runtime.getMemoryPage(derived.id)).resolves.toMatchObject({
      validUntil: "2026-08-04T01:00:00.000Z",
      supersededBy: user.id,
    });
    await expect(runtime.status()).resolves.toMatchObject({
      memoryPageCount: 3,
      unresolvedContradictionCount: 1,
    });
    runtime.close();
  });

  it("extracts supported events deterministically and retrieves exact identifiers through FTS5", async () => {
    const runtime = await store();
    const sessionId = contextVmSessionId("run-contextvm-extraction");
    await runtime.appendEvents([
      event("goal-source", {
        sessionId,
        kind: "user_message",
        payload: { goal: "Fix packages/cli/src/composer.ts" },
      }),
      event("test-source", {
        sessionId,
        kind: "test_result",
        payload: {
          summary: "composer test failed",
          command: "bun test packages/cli/src/composer.test.ts",
          exitCode: 1,
        },
      }),
      event("unsupported-source", {
        sessionId,
        kind: "assistant_message",
        payload: { summary: "transient prose" },
      }),
    ]);

    const first = await runtime.extractSession(sessionId, "contextvm-test");
    const second = await runtime.extractSession(sessionId, "contextvm-test");
    expect(second).toEqual(first);
    expect(first.candidates).toHaveLength(2);
    expect(first.unsupportedEventIds).toHaveLength(1);

    const result = await runtime.retrieveMemoryPages({
      namespace: "contextvm-test",
      query: "packages/cli/src/composer.ts",
      topK: 10,
    });
    expect(result.candidates[0]).toMatchObject({
      reasons: expect.arrayContaining(["exact_identifier"]),
      page: { summary: "Fix packages/cli/src/composer.ts" },
    });
    const warmCandidateIds = result.candidates.map(({ page }) => page.memoryId);
    const warmReasons = result.candidates.map(({ reasons }) => reasons);

    const rebuilt = await runtime.rebuildRetrievalIndex();
    expect(rebuilt).toMatchObject({
      indexVersion: 1,
      indexedMemoryPages: 2,
    });
    expect((await runtime.verify()).status).toBe("pass");
    const root = runtime.root;
    runtime.close();

    const reopened = new LocalSqliteContextVmStore({ root });
    const cold = await reopened.retrieveMemoryPages({
      namespace: "contextvm-test",
      query: "packages/cli/src/composer.ts",
      topK: 10,
    });
    expect(cold.candidates.map(({ page }) => page.memoryId)).toEqual(warmCandidateIds);
    expect(cold.candidates.map(({ reasons }) => reasons)).toEqual(warmReasons);
    expect(cold.cache.hits).toBe(0);
    expect(cold.cache.misses).toBeGreaterThan(0);
    reopened.close();
  });

  it("recovers a canonical projection suffix exactly once and rejects conflicting replay", async () => {
    const runtime = await store();
    const scope: RepositoryEvidenceScopeV1 = {
      schemaVersion: 1,
      localRepositoryId: "repo_projection",
      canonicalRepositoryPath: "/redacted/repository",
      headCommit: "a".repeat(40),
      branchRef: "refs/heads/main",
      dirty: false,
      workingStateDigest: null,
      revisionKey: `clean:${"a".repeat(40)}`,
      completeness: "complete",
      capturedAt: "2026-08-05T00:00:00.000Z",
    };
    const runEvents: RunEvent[] = [1, 2].map((sequence) => ({
      id: `run-projection-event-${sequence}`,
      runId: "run-projection",
      sequence,
      type: sequence === 1 ? "goal_received" : "memory_extraction_finished",
      timestamp: `2026-08-05T00:00:0${sequence}.000Z`,
      actor: { kind: "runtime", id: "projection-test" },
      payload: { summary: `event ${sequence}` },
      artifacts: [],
      redaction: { applied: false, redactedPaths: [], redactionCount: 0 },
    }));
    const first = canonicalTraceEventFromRunEvent({
      event: runEvents[0]!,
      taskId: "task-projection",
      workspaceId: "workspace-projection",
      repositoryScope: scope,
    });
    const second = canonicalTraceEventFromRunEvent({
      event: runEvents[1]!,
      taskId: "task-projection",
      workspaceId: "workspace-projection",
      repositoryScope: scope,
      previousEventId: first.eventId,
    });
    await expect(runtime.projectCanonicalTraceEvents([first])).resolves.toBe(1);
    await expect(runtime.canonicalProjectionWatermark("run-projection")).resolves.toBe(1);
    await expect(runtime.projectCanonicalTraceEvents([first, second])).resolves.toBe(2);
    await expect(runtime.projectCanonicalTraceEvents([first, second])).resolves.toBe(2);
    expect(await runtime.scanSession({
      sessionId: contextVmSessionId("run-projection"),
      limit: 10,
    })).toHaveLength(2);
    const extraction = await runtime.extractSession(
      contextVmSessionId("run-projection"),
      "projection-test",
    );
    const projectedSecond = await runtime.getCanonicalSourceEvent(
      second.sourceRunEventId,
    );
    expect(extraction.candidates.flatMap(({ sourceEventIds }) => sourceEventIds))
      .toContain(projectedSecond!.id);
    await expect(runtime.projectCanonicalTraceEvents([
      { ...second, contentHash: "b".repeat(64) },
    ])).rejects.toThrow();
    runtime.close();
  });

  it("checkpoints deterministic state and preserves in-doubt obligations during recovery", async () => {
    const runtime = await store();
    const sessionId = contextVmSessionId("run-contextvm-recovery");
    const taskId = contextVmTaskId("task-contextvm-recovery");
    await runtime.appendEvents([
      event("recovery-start", {
        sessionId,
        taskId,
        kind: "state_transition",
        payload: { eventType: "run_started", summary: "Start recovery task" },
      }),
      event("recovery-goal", {
        sessionId,
        taskId,
        kind: "user_message",
        payload: {
          eventType: "goal_received",
          summary: "Finish checkpoint recovery",
          constraints: ["Do not redispatch tools"],
        },
      }),
    ]);
    const checkpoint = await runtime.createStateCheckpoint({
      sessionId,
      reason: "explicit",
    });
    expect(checkpoint).toMatchObject({
      capturedThroughSequence: 2,
      state: {
        activeGoal: "Finish checkpoint recovery",
        throughSequence: 2,
      },
    });
    await expect(runtime.createStateCheckpoint({
      sessionId,
      reason: "explicit",
    })).resolves.toEqual(checkpoint);
    await runtime.appendEvent(event("recovery-tool-start", {
      sessionId,
      taskId,
      kind: "tool_request",
      payload: {
        eventType: "codex_execution_started",
        summary: "Dispatch repository tool",
      },
    }));
    const inDoubt = await runtime.recoverSessionState(sessionId);
    expect(inDoubt).toMatchObject({
      status: "recovery_required",
      source: "checkpoint",
      checkpointId: checkpoint.id,
    });
    expect(inDoubt.state?.obligations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "tool_transaction",
          status: "in_doubt",
        }),
      ]),
    );
    await runtime.appendEvent(event("recovery-tool-finish", {
      sessionId,
      taskId,
      kind: "tool_result",
      payload: {
        eventType: "codex_execution_finished",
        summary: "Repository tool completed",
      },
    }));
    const recovered = await runtime.recoverSessionState(sessionId);
    expect(recovered.status).not.toBe("recovery_required");
    expect(recovered.state?.obligations.some(
      ({ kind }) => kind === "tool_transaction",
    )).toBe(false);
    runtime.close();
  });

  it("falls back to an earlier checkpoint when the latest state is corrupt", async () => {
    const runtime = await store();
    const sessionId = contextVmSessionId("run-contextvm-fallback");
    await runtime.appendEvent(event("fallback-first", {
      sessionId,
      kind: "user_message",
      payload: { eventType: "goal_received", summary: "Original goal" },
    }));
    const first = await runtime.createStateCheckpoint({
      sessionId,
      reason: "explicit",
    });
    await runtime.appendEvent(event("fallback-next", {
      sessionId,
      kind: "constraint",
      payload: { summary: "Preserve raw evidence" },
    }));
    const latest = await runtime.createStateCheckpoint({
      sessionId,
      reason: "explicit",
    });
    const database = new Database(runtime.databasePath);
    database.query(
      "UPDATE state_checkpoints SET state_hash = ? WHERE id = ?",
    ).run("0".repeat(64), latest.id);
    database.close();

    const recovered = await runtime.recoverSessionState(sessionId);
    expect(recovered).toMatchObject({
      status: "recovered_with_fallback",
      source: "earlier_checkpoint",
      checkpointId: first.id,
    });
    expect(recovered.state?.constraints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ text: "Preserve raw evidence" }),
      ]),
    );
    const corruptAll = new Database(runtime.databasePath);
    corruptAll.query(
      "UPDATE state_checkpoints SET state_hash = ? WHERE id = ?",
    ).run("0".repeat(64), first.id);
    corruptAll.close();
    const fullReplay = await runtime.recoverSessionState(sessionId);
    expect(fullReplay).toMatchObject({
      status: "recovered_with_fallback",
      source: "full_replay",
    });
    const controller = new AbortController();
    controller.abort();
    await expect(
      runtime.recoverSessionState(sessionId, controller.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
    runtime.close();
  });

  it("consolidates only direct structured evidence and regenerates discarded output", async () => {
    const runtime = await store();
    const sessionId = contextVmSessionId("run-contextvm-consolidation");
    const taskId = contextVmTaskId("task-contextvm-consolidation");
    await runtime.appendEvents([
      event("consolidation-goal", {
        sessionId,
        taskId,
        kind: "user_message",
        payload: { eventType: "goal_received", summary: "Stabilize recovery" },
      }),
      ...Array.from({ length: 3 }, (_, index) => event(
        `consolidation-failure-${index}`,
        {
          sessionId,
          taskId,
          kind: "error",
          payload: {
            eventType: "codex_execution_failed",
            summary: "Provider process exited before completion",
          },
        },
      )),
      event("consolidation-finished", {
        sessionId,
        taskId,
        kind: "state_transition",
        payload: { eventType: "run_finished", summary: "Recovery stabilized" },
      }),
    ]);
    const first = await runtime.consolidateSession({
      sessionId,
      namespace: "contextvm-consolidation-test",
      trigger: "repeated_pattern",
      taskId,
    });
    expect(first.outputMemoryIds.length).toBeGreaterThanOrEqual(2);
    expect(first.rejected).toEqual([]);
    const repeated = await runtime.consolidateSession({
      sessionId,
      namespace: "contextvm-consolidation-test",
      trigger: "repeated_pattern",
      taskId,
    });
    expect(repeated).toEqual(first);

    const discarded = first.outputMemoryIds[0]!;
    await runtime.discardConsolidatedMemory(discarded);
    const regenerated = await runtime.consolidateSession({
      sessionId,
      namespace: "contextvm-consolidation-test",
      trigger: "repeated_pattern",
      taskId,
    });
    expect(regenerated.outputMemoryIds).not.toContain(discarded);
    const verification = await runtime.verify();
    expect(verification.checks.filter(({ status }) => status === "fail")).toEqual([]);
    runtime.close();
  });
});
