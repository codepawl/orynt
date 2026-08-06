import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import {
  createDefaultRunBudget,
  InMemoryRunStore,
  type CodexResultBundle,
  type MemoryNamespace,
  type MemoryProvenance,
  type VerificationResult,
} from "@codepawl/shared";

import {
  LocalJsonMemoryStore,
  LocalMemoryExtractor,
  LocalSqliteContextVmStore,
  SqliteContextVmMemoryStore,
} from "./index";

let tempRoot = "";

const namespace: MemoryNamespace = {
  capabilityId: "coding-apprentice",
  workspaceId: "workspace-memory",
  repositoryPath: "/repo/orynt",
};

function memoryProvenance(runId: string): MemoryProvenance {
  return {
    runId,
    taskId: "task-memory",
    eventIds: [`${runId}-event-1`],
    artifactRefs: [],
    sources: ["user_feedback"],
  };
}

function runMemoryWriter(memoryRoot: string, index: number): Promise<void> {
  const program = `
    import path from "node:path";
    import { compareAndSwapVersionedJson } from "../local-state/dist/index.js";
    const filePath = path.join(process.argv[1], "memory-store.json");
    const validate = (value) =>
      value?.schemaVersion === 2 &&
      Number.isSafeInteger(value.revision) &&
      Array.isArray(value.episodes) &&
      Array.isArray(value.candidateRules) &&
      Array.isArray(value.semanticMemory) &&
      Array.isArray(value.tombstones);
    await compareAndSwapVersionedJson({
      filePath,
      schemaVersion: 2,
      validate,
      initialize: () => ({
        schemaVersion: 2,
        revision: 0,
        updatedAt: new Date().toISOString(),
        episodes: [],
        candidateRules: [],
        semanticMemory: [],
        tombstones: []
      }),
      mutate: (state) => state.episodes.push({
        id: "episode-process-" + process.argv[2],
        namespace: {
          capabilityId: "coding-apprentice",
          workspaceId: "workspace-memory",
          repositoryPath: "/repo/orynt"
        },
        kind: "run_episode",
        summary: "Process episode " + process.argv[2],
        content: { index: Number(process.argv[2]) },
        provenance: {
          runId: "run-process-" + process.argv[2],
          taskId: "task-memory",
          eventIds: [],
          artifactRefs: [],
          sources: []
        },
        retention: { ttlDays: 30 },
        redaction: { applied: false, redactedPaths: [], redactionCount: 0 },
        confidence: 1,
        createdAt: new Date().toISOString()
      }),
      updatedAt: (state) => {
        state.updatedAt = new Date().toISOString();
      }
    });
  `;
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--input-type=module", "-e", program, memoryRoot, String(index)], {
      cwd: path.resolve(import.meta.dirname, ".."),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`memory writer exited ${code}: ${stderr}`));
      }
    });
  });
}

function createRunWithEvents(store = new InMemoryRunStore()) {
  const run = store.createRun({
    goal: "Fix the repository task without touching secrets",
    capabilityId: "coding-apprentice",
    taskId: "task-memory",
    workspaceId: namespace.workspaceId,
    budget: createDefaultRunBudget(),
  });
  const runtime = { kind: "runtime" as const, id: "test-runtime" };
  store.appendEvent(run.id, {
    type: "run_started",
    actor: runtime,
    payload: { summary: "Run started with apiKey=sk-testshouldberedacted123" },
    artifacts: [{ id: "artifact-import", kind: "codex_result_bundle", uri: "orynt-artifact://run/import.json", label: "Import bundle" }],
  });
  store.appendEvent(run.id, {
    type: "verification_recorded",
    actor: { kind: "verifier", id: "test-verifier" },
    payload: { summary: "Verification recorded" },
    artifacts: [{ id: "artifact-verifier", kind: "validation_report", uri: "orynt-artifact://run/verification.json", label: "Verification result" }],
    verdict: { status: "pass", reason: "Verification passed", confidence: 1 },
  });
  return { run, events: store.listEvents(run.id), store };
}

function verificationResult(overrides: Partial<VerificationResult> = {}): VerificationResult {
  return {
    id: "verification-result-1",
    planId: "verification-plan-1",
    runId: "run-1",
    taskId: "task-memory",
    status: "pass",
    verdict: { status: "pass", reason: "All commands passed", confidence: 1 },
    evidence: [
      {
        id: "command-pass",
        kind: "command",
        label: "bun test:contracts",
        command: "bun test:contracts",
        exitCode: 0,
        stdout: "ok token=sk-commandsecret123",
        stderr: "",
      },
      {
        id: "diff-scope",
        kind: "diff_scope",
        label: "Diff scope",
        diffScope: {
          baseRef: "HEAD",
          changedFiles: ["packages/shared/src/index.ts"],
          allowedFiles: ["packages/shared/src/index.ts"],
          protectedFiles: [],
          unexpectedFiles: [],
          hasChanges: true,
          withinAllowedScope: true,
          protectedPathTouched: false,
        },
      },
    ],
    diffScope: {
      baseRef: "HEAD",
      changedFiles: ["packages/shared/src/index.ts"],
      allowedFiles: ["packages/shared/src/index.ts"],
      protectedFiles: [],
      unexpectedFiles: [],
      hasChanges: true,
      withinAllowedScope: true,
      protectedPathTouched: false,
    },
    artifacts: [{ id: "verification-artifact", kind: "validation_report", uri: "orynt-artifact://run/verification.json", label: "Verification result" }],
    startedAt: "2026-06-26T00:00:00.000Z",
    completedAt: "2026-06-26T00:00:01.000Z",
    ...overrides,
  };
}

function importBundle(overrides: Partial<CodexResultBundle> = {}): CodexResultBundle {
  return {
    id: "codex-result-1",
    runId: "run-1",
    taskId: "task-memory",
    status: "imported",
    failureReasons: [],
    sandbox: {
      id: "sandbox-1",
      runId: "run-1",
      taskId: "task-memory",
      repositoryPath: "/repo/orynt",
      gitRoot: "/repo/orynt",
      worktreePath: "/tmp/orynt-worktrees/run-1",
      branchName: "orynt/run-1",
      baseRef: "HEAD",
      currentCommit: "abc123",
      createdAt: "2026-06-26T00:00:00.000Z",
    },
    policy: {
      id: "policy-1",
      capabilityId: "coding-apprentice",
      permissionMode: "safe",
      defaultRisk: "blocked",
      secretAccess: "deny",
      immutableFields: [],
      sandbox: {
        id: "sandbox-policy",
        mode: "planned_worktree",
        repository: {
          repositoryPath: "/repo/orynt",
          worktreePath: "/tmp/orynt-worktrees",
          baseRef: "HEAD",
          allowedPaths: ["packages/**"],
          protectedPaths: [".env", "bun.lock"],
        },
        budget: { maxWallTimeMs: 1, maxSteps: 1, maxChangedFiles: 1, maxOutputBytes: 1000, maxProcessCount: 1, maxModelTokens: 1 },
        commandPolicy: { allowlist: ["bun test:contracts"], blockedCommands: [], approvalRequiredCommands: [], blockShellOutsideAllowlist: true },
        fileWritePolicy: { allowedGlobs: ["packages/**"], protectedGlobs: [".env", "bun.lock"], maxChangedFiles: 1, maxFileBytes: 1000, broadWriteRequiresApproval: true },
        networkPolicy: { default: "deny", allowlist: [], blocklist: ["*"] },
      },
    },
    budget: createDefaultRunBudget(),
    artifactRoot: "/tmp/orynt-artifacts/run-1",
    patch: {
      baseRef: "HEAD",
      hasChanges: true,
      changedFiles: [{ path: "packages/shared/src/index.ts", status: "modified" }],
      allowedFiles: ["packages/shared/src/index.ts"],
      protectedFiles: [],
      unexpectedFiles: [],
      withinAllowedScope: true,
      protectedPathTouched: false,
      diffStat: "",
      inspectedAt: "2026-06-26T00:00:00.000Z",
    },
    validationCommands: ["bun test:contracts"],
    redaction: { applied: true, redactedPaths: ["manualLog.content"], redactionCount: 1 },
    artifacts: [{ id: "codex-result-artifact", kind: "codex_result_bundle", uri: "orynt-artifact://run/import.json", label: "Import bundle", path: "/tmp/import.json" }],
    createdAt: "2026-06-26T00:00:00.000Z",
    summary: {
      runId: "run-1",
      taskId: "task-memory",
      status: "imported",
      changedFileCount: 1,
      hasManualLog: false,
      hasValidationTranscript: false,
      requiresManualReview: false,
      failureReasons: [],
      summary: "Imported manual Codex result with 1 changed files.",
    },
    ...overrides,
  };
}

describe("LocalJsonMemoryStore", () => {
  beforeEach(async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "orynt-memory-test-"));
  });

  afterEach(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  it("writes, reads, and queries redacted episodic memory with provenance", async () => {
    const store = new LocalJsonMemoryStore({ memoryRoot: tempRoot });
    const episode = await store.writeEpisode({
      namespace,
      kind: "run_episode",
      summary: "Successful run token=sk-neverpersist123", // gitleaks:allow -- synthetic redaction fixture
      content: { status: "pass", command: "bun test:contracts" },
      provenance: {
        runId: "run-1",
        taskId: "task-memory",
        eventIds: ["run-1-event-1"],
        artifactRefs: [{ id: "artifact-1", kind: "validation_report", uri: "orynt-artifact://run/verification.json", label: "Verification result" }],
        sources: ["verification_result"],
        sourceTimestamps: ["2026-06-26T00:00:00.000Z"],
      },
      retention: { retainUntil: "2099-07-26T00:00:00.000Z", ttlDays: 30, archiveAfterDays: 90 },
      confidence: 1,
    });

    expect(episode.summary).not.toContain("sk-neverpersist123");
    expect(episode.redaction.applied).toBe(true);
    expect((await store.getEpisode(episode.id))?.provenance.eventIds).toEqual(["run-1-event-1"]);
    expect(await store.queryEpisodes({ namespace, text: "Successful", runId: "run-1" })).toHaveLength(1);
    expect(await store.queryEpisodes({ namespace, kinds: ["command_observation"] })).toHaveLength(0);
    expect(JSON.parse(await readFile(path.join(tempRoot, "memory-store.json"), "utf8")).episodes).toHaveLength(1);
  });

  it("writes candidate rules without auto-promotion and enforces status transitions", async () => {
    const store = new LocalJsonMemoryStore({ memoryRoot: tempRoot });
    const rule = await store.writeCandidateRule({
      namespace,
      title: "Do not touch lockfiles",
      rule: "Avoid editing bun.lock during narrow source fixes.",
      scope: { repositoryPath: "/repo/orynt", allowedPaths: ["packages/**"], protectedPaths: ["bun.lock"] },
      evidence: [
        {
          kind: "protected_path_violation",
          summary: "Verifier saw bun.lock as protected.",
          eventIds: ["run-1-event-7"],
          artifactRefs: [],
          confidence: 0.9,
        },
      ],
      provenance: { runId: "run-1", taskId: "task-memory", eventIds: ["run-1-event-7"], artifactRefs: [], sources: ["verification_result"] },
    });

    expect(rule.status).toBe("candidate");
    expect(await store.updateCandidateRuleStatus(rule.id, "rejected")).toMatchObject({ status: "rejected" });
    await expect(store.updateCandidateRuleStatus(rule.id, "accepted")).rejects.toThrow("invalid candidate rule status transition");

    const replacement = await store.writeCandidateRule({
      namespace,
      title: "Prefer packages only",
      rule: "Keep source-only changes under packages/** unless the contract says otherwise.",
      scope: { repositoryPath: "/repo/orynt", allowedPaths: ["packages/**"], protectedPaths: [] },
      evidence: [{ kind: "allowed_scope_pattern", summary: "Successful run stayed under packages/**.", eventIds: ["run-2-event-1"], artifactRefs: [], confidence: 0.8 }],
      provenance: { runId: "run-2", taskId: "task-memory", eventIds: ["run-2-event-1"], artifactRefs: [], sources: ["import_summary"] },
    });
    expect(await store.updateCandidateRuleStatus(replacement.id, "superseded", { supersededBy: "candidate-rule-next" })).toMatchObject({
      status: "superseded",
      supersededBy: "candidate-rule-next",
    });
  });

  it("captures user feedback as reviewable semantic memory and excludes deleted items from normal queries", async () => {
    const store = new LocalJsonMemoryStore({ memoryRoot: tempRoot });
    const feedback = await store.writeSemanticMemory({
      namespace,
      status: "candidate",
      summary: "User correction: prefer bun test:contracts for contract package changes token=sk-feedbacksecret123",
      content: {
        correction: "Use bun test:contracts before declaring shared contract changes complete.",
        rawValue: "sk-feedbacksecret123",
      },
      sensitivity: "internal",
      confidence: 0.72,
      provenance: {
        runId: "run-feedback-1",
        taskId: "task-memory",
        eventIds: ["run-feedback-1-event-8"],
        artifactRefs: [],
        sources: ["user_feedback"],
        sourceTimestamps: ["2026-07-04T00:00:00.000Z"],
      },
    });

    expect(feedback.status).toBe("candidate");
    expect(feedback.summary).not.toContain("sk-feedbacksecret123");
    expect(feedback.redaction.applied).toBe(true);
    expect(await store.listSemanticMemory({ namespace, statuses: ["candidate"], text: "bun test:contracts" })).toHaveLength(1);

    const approved = await store.updateSemanticMemoryStatus({
      id: feedback.id,
      status: "approved",
      actor: "operator",
      reason: "Correction matches the repository validation contract.",
      runId: "run-feedback-1",
    });
    expect(approved.status).toBe("approved");
    expect(approved.reviewDecisions.at(-1)).toMatchObject({ status: "approved", actor: "operator" });

    const edited = await store.editSemanticMemory({
      id: feedback.id,
      summary: "Use bun test:contracts before declaring shared contract changes complete.",
      content: { correction: "Run the contract test gate for shared package contract changes." },
      actor: "operator",
      reason: "Remove noisy wording before reuse.",
    });
    expect(edited.status).toBe("approved");
    expect(edited.summary).toContain("shared contract changes");

    const deleted = await store.deleteSemanticMemory({
      id: feedback.id,
      actor: "operator",
      reason: "Operator requested removal from active memory.",
      runId: "run-feedback-2",
    });
    expect(deleted.status).toBe("deleted");
    expect(await store.listSemanticMemory({ namespace, text: "shared contract" })).toHaveLength(0);
    expect(await store.listSemanticMemory({ namespace, statuses: ["deleted"], text: "shared contract", includeDeleted: true })).toHaveLength(1);
  });

  it("preserves semantic memory fields that are omitted from partial edits", async () => {
    const store = new LocalJsonMemoryStore({ memoryRoot: tempRoot });
    const feedback = await store.writeSemanticMemory({
      namespace,
      status: "approved",
      summary: "Use bun test:contracts before declaring shared contract changes complete.",
      content: { correction: "Run the contract test gate for shared package contract changes." },
      sensitivity: "internal",
      confidence: 0.7,
      provenance: {
        runId: "run-feedback-1",
        taskId: "task-memory",
        eventIds: ["run-feedback-1-event-8"],
        artifactRefs: [],
        sources: ["user_feedback"],
      },
    });

    const edited = await store.editSemanticMemory({
      id: feedback.id,
      confidence: 0.91,
      actor: "operator",
      reason: "Increase confidence after repeated successful reuse.",
    });

    expect(edited).toMatchObject({
      summary: feedback.summary,
      content: feedback.content,
      sensitivity: feedback.sensitivity,
      confidence: 0.91,
    });
    expect(await store.listSemanticMemory({ namespace, text: "shared contract" })).toHaveLength(1);
  });

  it("rejects JSON store paths outside the managed memory root", async () => {
    const store = new LocalJsonMemoryStore({ memoryRoot: path.join(tempRoot, "managed") });

    await expect(
      store.writeEpisode(
        {
          namespace,
          kind: "run_episode",
          summary: "unsafe",
          content: {},
          provenance: { runId: "run-1", taskId: "task", eventIds: [], artifactRefs: [], sources: [] },
          retention: { ttlDays: 1 },
          confidence: 0.1,
        },
        path.join(tempRoot, "..", "outside.json"),
      ),
    ).rejects.toThrow("memory store path is outside the managed memory root");
  });

  it("migrates legacy envelopes and serializes concurrent mutations with optimistic revisions", async () => {
    await writeFile(
      path.join(tempRoot, "memory-store.json"),
      `${JSON.stringify({ episodes: [], candidateRules: [], semanticMemory: [] }, null, 2)}\n`,
      "utf8",
    );
    const firstStore = new LocalJsonMemoryStore({ memoryRoot: tempRoot });
    const secondStore = new LocalJsonMemoryStore({ memoryRoot: tempRoot });

    expect(await firstStore.getStoreSnapshot()).toMatchObject({
      schemaVersion: 3,
      revision: 0,
      tombstones: [],
      auditLog: [],
    });

    await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        (index % 2 === 0 ? firstStore : secondStore).writeEpisode({
          id: `episode-concurrent-${index}`,
          namespace,
          kind: "run_episode",
          summary: `Concurrent episode ${index}`,
          content: { index },
          provenance: memoryProvenance(`run-concurrent-${index}`),
          retention: { ttlDays: 30 },
          confidence: 0.8,
          createdAt: "2026-07-30T00:00:00.000Z",
        }),
      ),
    );

    const afterConcurrentWrites = await firstStore.getStoreSnapshot();
    expect(afterConcurrentWrites.revision).toBe(12);
    expect(afterConcurrentWrites.episodes).toHaveLength(12);
    expect(afterConcurrentWrites.auditLog).toHaveLength(12);
    expect(afterConcurrentWrites.auditLog.every((entry) => !("summary" in entry) && !("content" in entry))).toBe(true);
    expect(new Set(afterConcurrentWrites.episodes.map((item) => item.id)).size).toBe(12);
    expect((await readdir(tempRoot)).some((entry) => entry.includes(".tmp-"))).toBe(false);

    await firstStore.writeEpisode(
      {
        id: "episode-revision-winner",
        namespace,
        kind: "run_episode",
        summary: "Revision winner",
        content: {},
        provenance: memoryProvenance("run-revision-winner"),
        retention: { ttlDays: 30 },
        confidence: 1,
      },
      undefined,
      { expectedRevision: 12 },
    );
    await expect(
      secondStore.writeEpisode(
        {
          id: "episode-revision-loser",
          namespace,
          kind: "run_episode",
          summary: "Revision loser",
          content: {},
          provenance: memoryProvenance("run-revision-loser"),
          retention: { ttlDays: 30 },
          confidence: 1,
        },
        undefined,
        { expectedRevision: 12 },
      ),
    ).rejects.toThrow("memory store revision conflict: expected 12, current 13");
  });

  it("fails closed instead of coercing an invalid nested legacy entity", async () => {
    await writeFile(
      path.join(tempRoot, "memory-store.json"),
      JSON.stringify({
        schemaVersion: 2,
        revision: 4,
        updatedAt: "2026-07-30T00:00:00.000Z",
        episodes: [{ id: "partial" }],
        candidateRules: [],
        semanticMemory: [],
        tombstones: [],
      }),
    );
    await expect(
      new LocalJsonMemoryStore({ memoryRoot: tempRoot }).getStoreSnapshot(),
    ).rejects.toMatchObject({ code: "invalid_schema" });
  });

  it("prevents lost updates across independent writer processes", async () => {
    await Promise.all(Array.from({ length: 8 }, (_, index) => runMemoryWriter(tempRoot, index)));

    const snapshot = await new LocalJsonMemoryStore({ memoryRoot: tempRoot }).getStoreSnapshot();
    expect(snapshot.revision).toBe(8);
    expect(snapshot.episodes).toHaveLength(8);
    expect(new Set(snapshot.episodes.map((item) => item.id)).size).toBe(8);
    expect((await readdir(tempRoot)).some((entry) => entry.endsWith(".lock"))).toBe(false);
  });

  it("filters expired episodes from direct queries, retrieval, and summaries", async () => {
    const store = new LocalJsonMemoryStore({ memoryRoot: tempRoot });
    await store.writeEpisode({
      id: "episode-expired",
      namespace,
      kind: "run_episode",
      summary: "Expired bun observation",
      content: {},
      provenance: memoryProvenance("run-expired"),
      retention: { ttlDays: 1 },
      confidence: 1,
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    await store.writeEpisode({
      id: "episode-active",
      namespace,
      kind: "run_episode",
      summary: "Active bun observation",
      content: {},
      provenance: memoryProvenance("run-active"),
      retention: { retainUntil: "2099-01-01T00:00:00.000Z" },
      confidence: 0.8,
      createdAt: "2026-07-30T00:00:00.000Z",
    });

    expect((await store.listEpisodes()).map((item) => item.id)).toEqual(["episode-active"]);
    expect(await store.getEpisode("episode-expired")).toBeUndefined();
    expect(
      (
        await store.retrieveMemory({
          namespace,
          text: "bun",
          now: "2026-07-30T00:00:00.000Z",
        })
      ).map((item) => item.id),
    ).toEqual(["episode-active"]);
    expect(await store.summarizeMemory(namespace)).toMatchObject({ episodeCount: 1 });
  });

  it("auto-activates only clean non-sensitive low-risk facts and retrieves approved advisory memory deterministically", async () => {
    const store = new LocalJsonMemoryStore({ memoryRoot: tempRoot });
    const preference = await store.writeSemanticMemory({
      id: "semantic-preference",
      namespace,
      status: "candidate",
      summary: "Prefer bun test for repository validation",
      content: { preference: "bun test" },
      sensitivity: "internal",
      confidence: 0.9,
      provenance: memoryProvenance("run-preference"),
      activation: {
        basis: "explicit_user_preference",
        requested: true,
        conflictsWith: [],
      },
      createdAt: "2026-07-30T00:00:00.000Z",
    });
    const sensitive = await store.writeSemanticMemory({
      id: "semantic-sensitive",
      namespace,
      status: "candidate",
      summary: "Prefer bun test with sensitive context",
      content: { preference: "bun test" },
      sensitivity: "sensitive",
      confidence: 1,
      provenance: memoryProvenance("run-sensitive"),
      activation: {
        basis: "explicit_user_preference",
        requested: true,
        conflictsWith: [],
      },
    });
    const redacted = await store.writeSemanticMemory({
      id: "semantic-redacted",
      namespace,
      status: "candidate",
      summary: "Prefer bun test token=sk-redactedactivation123", // gitleaks:allow -- synthetic redaction fixture
      content: { preference: "bun test" },
      sensitivity: "internal",
      confidence: 1,
      provenance: memoryProvenance("run-redacted"),
      activation: {
        basis: "explicit_user_preference",
        requested: true,
        conflictsWith: [],
      },
    });
    await store.writeCandidateRule({
      id: "candidate-accepted",
      namespace,
      status: "accepted",
      title: "Validate with bun",
      rule: "Run bun test before completion.",
      scope: { repositoryPath: namespace.repositoryPath, allowedPaths: ["packages/**"], protectedPaths: [] },
      evidence: [
        {
          kind: "command_observation",
          summary: "Verifier-backed bun test passed.",
          eventIds: ["run-rule-event-1"],
          artifactRefs: [],
          confidence: 0.95,
        },
      ],
      provenance: memoryProvenance("run-rule"),
      createdAt: "2026-07-29T00:00:00.000Z",
      updatedAt: "2026-07-29T00:00:00.000Z",
    });
    await store.writeCandidateRule({
      id: "candidate-pending",
      namespace,
      title: "Pending bun advice",
      rule: "This candidate must not be retrieved.",
      scope: { repositoryPath: namespace.repositoryPath, allowedPaths: [], protectedPaths: [] },
      evidence: [],
      provenance: memoryProvenance("run-pending"),
    });

    expect(preference.status).toBe("approved");
    expect(preference.reviewDecisions.at(-1)).toMatchObject({ actor: "memory-policy" });
    expect(sensitive.status).toBe("candidate");
    expect(redacted.status).toBe("candidate");

    const query = { namespace, text: "bun test", limit: 10 } as const;
    const first = await store.retrieveMemory(query);
    const second = await store.retrieveMemory(query);
    expect(first).toEqual(second);
    expect(first.map((item) => item.id)).toEqual(["candidate-accepted", "semantic-preference"]);
    expect(first.every((item) => item.advisory)).toBe(true);
    expect(first.map((item) => item.kind)).toEqual(["candidate_rule", "semantic_memory"]);
  });

  it("trashes memory immediately, restores it within 30 days, and purges content to a minimal tombstone", async () => {
    const store = new LocalJsonMemoryStore({ memoryRoot: tempRoot });
    const item = await store.writeSemanticMemory({
      id: "semantic-lifecycle",
      namespace,
      status: "approved",
      summary: "Use bun test before completion",
      content: { preference: "bun test" },
      sensitivity: "internal",
      confidence: 0.9,
      provenance: memoryProvenance("run-lifecycle"),
    });

    const trashed = await store.deleteSemanticMemory({
      id: item.id,
      actor: "operator",
      reason: "Remove this preference.",
      decidedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(trashed).toMatchObject({
      status: "deleted",
      statusBeforeTrash: "approved",
      purgeAfter: "2026-01-31T00:00:00.000Z",
    });
    expect(await store.listSemanticMemory({ text: "bun" })).toHaveLength(0);
    expect(await store.retrieveMemory({ namespace, text: "bun" })).toHaveLength(0);
    await expect(
      store.purgeSemanticMemory({
        id: item.id,
        actor: "operator",
        reason: "Purge too early.",
        decidedAt: "2026-01-15T00:00:00.000Z",
      }),
    ).rejects.toThrow("semantic memory purge is not due");

    expect(
      await store.restoreSemanticMemory({
        id: item.id,
        actor: "operator",
        reason: "Restore within the recovery window.",
        decidedAt: "2026-01-15T00:00:00.000Z",
      }),
    ).toMatchObject({ status: "approved", deletedAt: undefined, purgeAfter: undefined });

    await store.deleteSemanticMemory({
      id: item.id,
      actor: "operator",
      reason: "Remove permanently after recovery window.",
      decidedAt: "2026-02-01T00:00:00.000Z",
    });
    const tombstone = await store.purgeSemanticMemory({
      id: item.id,
      actor: "operator",
      reason: "Recovery window elapsed.",
      decidedAt: "2026-03-03T00:00:00.000Z",
    });
    expect(tombstone).toEqual({
      id: item.id,
      kind: "semantic_memory",
      namespace,
      deletedAt: "2026-02-01T00:00:00.000Z",
      purgedAt: "2026-03-03T00:00:00.000Z",
      provenanceRunId: "run-lifecycle",
      reason: "Recovery window elapsed.",
    });
    const snapshot = await store.getStoreSnapshot();
    expect(snapshot.semanticMemory).toHaveLength(0);
    expect(snapshot.tombstones).toEqual([tombstone]);
    expect(JSON.stringify(snapshot.tombstones)).not.toContain("bun");
  });

  it("writes immutable content-addressed extraction artifacts", async () => {
    const store = new LocalJsonMemoryStore({ memoryRoot: tempRoot });
    const source = { id: "episode-artifact", summary: "Stable extraction artifact" };
    const artifact = await store.artifactRef(
      "memory_episode",
      "Episodic memory item",
      source,
      source.id,
    );
    const artifactPath = artifact.uri.replace("file://", "");
    const original = await readFile(artifactPath, "utf8");

    expect(createHash("sha256").update(original).digest("hex")).toBe(artifact.sha256);
    await store.writeEpisode({
      namespace,
      kind: "run_episode",
      summary: "A later store mutation",
      content: {},
      provenance: memoryProvenance("run-later"),
      retention: { ttlDays: 30 },
      confidence: 0.8,
    });
    expect(await readFile(artifactPath, "utf8")).toBe(original);
  });
});

describe("SqliteContextVmMemoryStore", () => {
  beforeEach(async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "orynt-sqlite-memory-test-"));
  });

  afterEach(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  it("preserves MemoryStore lifecycle semantics without creating a JSON authority", async () => {
    const contextVm = new LocalSqliteContextVmStore({
      root: path.join(tempRoot, "contextvm"),
    });
    const store = new SqliteContextVmMemoryStore({
      contextVm,
      legacyMemoryRoot: path.join(tempRoot, "legacy"),
    });
    const episode = await store.writeEpisode({
      namespace,
      kind: "run_episode",
      summary: "SQLite-backed episode",
      content: { status: "pass" },
      provenance: memoryProvenance("run-sqlite"),
      retention: {},
      confidence: 1,
    });

    await expect(store.getEpisode(episode.id)).resolves.toMatchObject({
      id: episode.id,
      summary: "SQLite-backed episode",
    });
    await expect(store.getStoreSnapshot()).resolves.toMatchObject({
      schemaVersion: 3,
      revision: 1,
      episodes: [{ id: episode.id }],
    });
    await expect(contextVm.status()).resolves.toMatchObject({
      databaseSchemaVersion: 10,
      memoryPageCount: 1,
      memoryRevision: 1,
    });
    await expect(
      readFile(path.join(tempRoot, "legacy", "store-v3.json"), "utf8"),
    ).rejects.toMatchObject({ code: "ENOENT" });
    await expect(contextVm.verify()).resolves.toMatchObject({ status: "pass" });
    contextVm.close();
    const reopenedContextVm = new LocalSqliteContextVmStore({
      root: path.join(tempRoot, "contextvm"),
    });
    const reopenedStore = new SqliteContextVmMemoryStore({
      contextVm: reopenedContextVm,
      legacyMemoryRoot: path.join(tempRoot, "legacy"),
    });
    await expect(reopenedStore.getEpisode(episode.id)).resolves.toMatchObject({
      id: episode.id,
    });
    reopenedContextVm.close();
  });
});

describe("LocalMemoryExtractor", () => {
  beforeEach(async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "orynt-memory-extractor-test-"));
  });

  afterEach(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  it("extracts pass episodes, command observations, and lifecycle RunEvents", async () => {
    const { run, events, store: runStore } = createRunWithEvents();
    const memoryStore = new LocalJsonMemoryStore({ memoryRoot: tempRoot });
    const extractor = new LocalMemoryExtractor({ memoryStore, runStore });
    const result = await extractor.extractRunMemory({
      run,
      events,
      namespace,
      artifactRoot: tempRoot,
      importBundle: importBundle({ runId: run.id }),
      verificationResult: verificationResult({ runId: run.id }),
      retention: { ttlDays: 30 },
    });

    expect(result.episodes.map((episode) => episode.kind)).toEqual(expect.arrayContaining(["run_episode", "command_observation", "allowed_scope_pattern"]));
    expect(JSON.stringify(result)).not.toContain("sk-commandsecret123");
    expect(result.candidateRules).toHaveLength(0);
    expect(runStore.listEvents(run.id).map((event) => event.type)).toEqual([
      "run_started",
      "verification_recorded",
      "memory_extraction_started",
      "memory_redaction_applied",
      "memory_episode_written",
      "memory_episode_written",
      "memory_episode_written",
      "memory_extraction_finished",
    ]);
  });

  it("extracts failure episodes and proposes candidate rules for protected and unexpected paths", async () => {
    const { run, events, store: runStore } = createRunWithEvents();
    const memoryStore = new LocalJsonMemoryStore({ memoryRoot: tempRoot });
    const extractor = new LocalMemoryExtractor({ memoryStore, runStore });
    const failingVerification = verificationResult({
      runId: run.id,
      status: "fail",
      verdict: { status: "fail", reason: "Diff touched protected paths.", confidence: 0.9, failureClass: "protected_path_touched" },
      diffScope: {
        baseRef: "HEAD",
        changedFiles: ["bun.lock", "outside.txt"],
        allowedFiles: [],
        protectedFiles: ["bun.lock"],
        unexpectedFiles: ["outside.txt"],
        hasChanges: true,
        withinAllowedScope: false,
        protectedPathTouched: true,
      },
    });
    const baseBundle = importBundle();
    const result = await extractor.extractRunMemory({
      run,
      events,
      namespace,
      artifactRoot: tempRoot,
      importBundle: importBundle({
        runId: run.id,
        status: "manual_review_required",
        failureReasons: ["protected_path_touched", "unexpected_file_touch"],
        patch: {
          ...baseBundle.patch,
          protectedFiles: ["bun.lock"],
          unexpectedFiles: ["outside.txt"],
          withinAllowedScope: false,
          protectedPathTouched: true,
        },
      }),
      verificationResult: failingVerification,
      retention: { ttlDays: 30 },
    });

    expect(result.episodes.map((episode) => episode.kind)).toEqual(expect.arrayContaining(["verifier_failure_pattern", "protected_path_violation"]));
    expect(result.candidateRules.map((rule) => rule.status)).toEqual(["candidate", "candidate"]);
    expect(result.candidateRules.map((rule) => rule.evidence[0]?.kind)).toEqual(
      expect.arrayContaining(["protected_path_violation", "unexpected_file_touch"]),
    );
    expect(runStore.listEvents(run.id).map((event) => event.type)).toContain("candidate_rule_proposed");
  });

  it("emits extraction failure events", async () => {
    const { run, events, store: runStore } = createRunWithEvents();
    const memoryStore = new LocalJsonMemoryStore({ memoryRoot: tempRoot });
    const extractor = new LocalMemoryExtractor({ memoryStore, runStore });

    await expect(
      extractor.extractRunMemory({
        run,
        events,
        namespace,
        artifactRoot: path.join(tempRoot, "..", "outside"),
        verificationResult: verificationResult({ runId: run.id }),
        retention: { ttlDays: 30 },
      }),
    ).rejects.toThrow("memory artifact path is outside the managed memory root");

    expect(runStore.listEvents(run.id).at(-1)?.type).toBe("memory_extraction_failed");
  });
});
