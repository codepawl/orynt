import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Database } from "bun:sqlite";

import { describe, expect, it } from "bun:test";

import {
  canonicalTraceEventFromRunEvent,
  LocalJsonMemoryStore,
} from "@codepawl/memory";
import {
  contextVmSessionId,
  type RepositoryEvidenceScopeV1,
  type RunEvent,
} from "@codepawl/shared";
import { LocalIntelligenceRuntime } from "./index";

describe("local intelligence runtime", () => {
  it("initializes one canonical empty layout and exposes read-only search", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "orynt-intelligence-"));
    const runtime = new LocalIntelligenceRuntime(root);

    const status = await runtime.status();
    expect(status.health).toBe("empty");
    expect(status).toMatchObject({
      schemaVersion: 2,
      layoutVersion: 2,
      contextVm: {
        health: "empty",
        journalMode: "wal",
        foreignKeys: true,
        derivedMemoryAuthority: "contextvm_sqlite_v2",
        migrationState: "completed",
      },
    });
    expect(status.contextVm.databasePath).toBe(
      path.join(root, "intelligence", "contextvm", "db", "contextvm.sqlite3"),
    );
    expect(status.canonicalPaths.memoryStore).toBe(
      path.join(root, "intelligence", "contextvm", "db", "contextvm.sqlite3"),
    );
    expect(status.canonicalPaths.improvementStore).toBe(
      path.join(root, "intelligence", "improvements", "store-v2.json"),
    );

    const executor = runtime.createSearchExecutor({
      namespace: {
        capabilityId: "test",
        workspaceId: "workspace",
        repositoryPath: root,
      },
      settings: { memoryTopK: 4, memoryTokenBudget: 800 },
    });
    expect(executor.tools().map(({ name }) => name)).toEqual([
      "intelligence_search",
    ]);
    const result = await executor.execute({
      callId: "call-1",
      name: "intelligence_search",
      arguments: { query: "missing context" },
    });
    await expect(runtime.verifyContextVm()).resolves.toMatchObject({
      status: "pass",
    });
    runtime.contextVm.close();
    expect(JSON.parse(result.output)).toMatchObject({
      contextStatus: "empty",
      items: [],
    });
  });

  it("migrates legacy stores once and retains an inspectable backup", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "orynt-intelligence-"));
    const legacyMemoryRoot = path.join(root, "memory");
    const intelligenceRoot = path.join(root, "intelligence");
    await mkdir(legacyMemoryRoot, { recursive: true });
    await mkdir(intelligenceRoot, { recursive: true });
    await writeFile(
      path.join(legacyMemoryRoot, "memory-store.json"),
      `${JSON.stringify({
        schemaVersion: 3,
        revision: 0,
        updatedAt: "2026-08-03T00:00:00.000Z",
        episodes: [],
        candidateRules: [],
        semanticMemory: [],
        tombstones: [],
        auditLog: [],
      })}\n`,
    );
    await writeFile(
      path.join(intelligenceRoot, "capability-ledger-v1.json"),
      `${JSON.stringify({
        schemaVersion: 1,
        revision: 0,
        outcomes: [],
        candidates: [],
        audit: [],
        updatedAt: "2026-08-03T00:00:00.000Z",
      })}\n`,
    );

    const runtime = new LocalIntelligenceRuntime(root);
    await runtime.initialize();

    await expect(runtime.listBackups()).resolves.toContain("legacy-v1");
    await expect(
      readFile(
        path.join(
          runtime.layout.migrationsRoot,
          "contextvm-memory-v1",
          "legacy-json-v3",
          "store-v3.json",
        ),
        "utf8",
      ),
    ).resolves.toContain('"schemaVersion": 3');
    await expect(
      readFile(runtime.layout.improvementStorePath, "utf8"),
    ).resolves.toContain('"schemaVersion": 2');
    const journal = await readFile(
      path.join(
        runtime.layout.migrationsRoot,
        "legacy-v1",
        "journal-v1.json",
      ),
      "utf8",
    );
    expect(JSON.parse(journal)).toMatchObject({ phase: "completed" });
    const contextVmJournal = await readFile(
      path.join(
        runtime.layout.migrationsRoot,
        "contextvm-memory-v1",
        "journal-v1.json",
      ),
      "utf8",
    );
    expect(JSON.parse(contextVmJournal)).toMatchObject({
      phase: "completed",
      authority: "contextvm_sqlite_v2",
      sourceDigest: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
    expect(await runtime.contextVm.status()).toMatchObject({
      databaseSchemaVersion: 10,
      memoryPageCount: 0,
    });
    await expect(
      new LocalJsonMemoryStore({
        memoryRoot: runtime.layout.memoryRoot,
        storeFileName: "store-v3.json",
      }).writeEpisode({
        namespace: { capabilityId: "test", workspaceId: "workspace" },
        kind: "run_episode",
        summary: "must not recreate JSON authority",
        content: {},
        provenance: {
          runId: "run-blocked",
          taskId: "task-blocked",
          eventIds: [],
          artifactRefs: [],
          sources: ["verification_result"],
        },
        retention: {},
        confidence: 1,
      }),
    ).rejects.toMatchObject({ code: "authority_migrated" });
    runtime.contextVm.close();
  });

  it("assembles and persists a redacted context pack within its hard budget", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "orynt-intelligence-"));
    const runtime = new LocalIntelligenceRuntime(root);
    const pack = await runtime.buildContextPack({
      schemaVersion: 1,
      namespace: "test|workspace||",
      sessionId: "context-pack-test" as never,
      userRequest: "Fix the context assembler",
      currentGoal: "Build a deterministic ContextVM pack",
      policy: "Never expose token=sk-AAAAAAAAAAAA.",
      constraints: [{
        id: "required-test",
        text: "Run focused tests",
        required: true,
        source: "user",
      }],
      requestedEntities: [],
      riskLevel: "medium",
      hardBudgetTokens: 512,
    });

    expect(pack.manifest.status).toBe("ready");
    expect(pack.manifest.renderedTokens).toBeLessThanOrEqual(512);
    expect(pack.rendered).not.toContain("sk-AAAAAAAAAAAA");
    expect(pack.manifest.items.map(({ loadReason }) => loadReason)).toEqual(
      expect.arrayContaining([
        "mandatory_policy",
        "mandatory_current_goal",
        "mandatory_required_constraint",
      ]),
    );
    await expect(
      runtime.contextVm.inspectContextPack(pack.manifest.id),
    ).resolves.toMatchObject({
      id: pack.manifest.id,
      renderedHash: pack.manifest.renderedHash,
      renderedArtifactId: expect.stringMatching(/^artifact_sha256_/),
    });
    runtime.contextVm.close();
  });

  it("fails closed when mandatory context exceeds the content budget", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "orynt-intelligence-"));
    const runtime = new LocalIntelligenceRuntime(root);
    const pack = await runtime.buildContextPack({
      schemaVersion: 1,
      namespace: "test|workspace||",
      sessionId: "context-pack-blocked" as never,
      userRequest: "Execute",
      constraints: [{
        id: "oversized",
        text: "required ".repeat(180),
        required: true,
        source: "policy",
      }],
      requestedEntities: [],
      riskLevel: "high",
      hardBudgetTokens: 256,
    });

    expect(pack.manifest).toMatchObject({
      status: "blocked",
      gaps: ["Mandatory policy, goal, and constraints exceed the hard context budget."],
    });
    expect(pack.manifest.renderedTokens).toBe(0);
    runtime.contextVm.close();
  });

  it("keeps authority-only packs isolated from session history", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "orynt-intelligence-"));
    const runtime = new LocalIntelligenceRuntime(root);
    const sessionId = contextVmSessionId("authority-only-session");
    await runtime.contextVm.appendEvent({
      sessionId,
      source: { kind: "test_fixture", id: "untrusted-history" },
      occurredAt: "2026-08-05T00:00:00.000Z",
      actor: { kind: "model", id: "prior-model" },
      kind: "model_message",
      payload: { summary: "UNTRUSTED-HISTORICAL-INSTRUCTION" },
      sensitivity: "internal",
    });
    const pack = await runtime.buildContextPack({
      schemaVersion: 1,
      namespace: "test|workspace||",
      sessionId,
      userRequest: "Classify the current request only",
      currentPlan: "Approved current plan",
      conversationContext: {
        summary: "Advisory prior summary",
        recentTurns: [
          { role: "user", content: "yo" },
          { role: "user", content: "test" },
          { role: "assistant", content: "How can I help?" },
        ],
      },
      constraints: [],
      requestedEntities: [],
      riskLevel: "low",
      hardBudgetTokens: 1_024,
      retrievalMode: "authority_only",
    });
    expect(pack.rendered).toContain("Classify the current request only");
    expect(pack.rendered).toContain(
      '<TRUSTED_AUTHORITY source="inline:request:plan">',
    );
    expect(pack.rendered).toContain(
      '<UNTRUSTED_EVIDENCE source="inline:request:conversation-turn:0">',
    );
    expect(pack.rendered).toContain("User: yo");
    expect(pack.rendered.indexOf("User: yo")).toBeLessThan(
      pack.rendered.indexOf("User: test"),
    );
    expect(pack.rendered).toContain("Advisory summary: Advisory prior summary");
    expect(pack.manifest.items.filter(({ section }) =>
      section === "recent_interaction"
    )).toHaveLength(4);
    expect(pack.rendered).not.toContain("UNTRUSTED-HISTORICAL-INSTRUCTION");
    expect(pack.manifest.items.some(({ sourceType }) =>
      sourceType === "event" || sourceType === "memory"
    )).toBe(false);
    runtime.contextVm.close();
  });

  it("rejects unbounded or malformed advisory conversation context", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "orynt-intelligence-"));
    const runtime = new LocalIntelligenceRuntime(root);
    await expect(runtime.buildContextPack({
      schemaVersion: 1,
      namespace: "test|workspace||",
      sessionId: contextVmSessionId("invalid-conversation-context"),
      userRequest: "Classify",
      conversationContext: {
        recentTurns: Array.from({ length: 7 }, () => ({
          role: "user" as const,
          content: "message",
        })),
      },
      constraints: [],
      requestedEntities: [],
      riskLevel: "low",
      hardBudgetTokens: 512,
      retrievalMode: "authority_only",
    })).rejects.toThrow("Invalid ContextVM conversation context");
    runtime.contextVm.close();
  });

  it("resolves readiness without allowing the decision model to answer", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "orynt-intelligence-"));
    const runtime = new LocalIntelligenceRuntime(root);
    let decisionCalls = 0;
    const decide = async () => {
      decisionCalls += 1;
      return {
        schemaVersion: 2 as const,
        status: "READY" as const,
      };
    };
    const result = await runtime.resolveInvocationContext({
      invocation: {
        schemaVersion: 1,
        invocationId: "invocation-ready-v2",
        namespace: "test|workspace||",
        sessionId: contextVmSessionId("invocation-ready-session"),
        role: "coordinator",
        providerId: "scripted",
        modelId: "fixture",
        userRequest: "Prepare the model context",
        constraints: [],
        requestedEntities: [],
        riskLevel: "low",
        hardBudgetTokens: 512,
      },
      decide,
    });
    expect(result).toMatchObject({
      status: "ready",
      invocationId: "invocation-ready-v2",
      contextPackIds: [expect.stringMatching(/^ctx_/)],
      checkpointId: expect.stringMatching(/^chk_/),
    });
    if (result.status === "ready") {
      expect(result.renderedContext).toContain("<TRUSTED_AUTHORITY");
      expect(result.renderedContextHash).toMatch(/^[0-9a-f]{64}$/);
    }
    expect(decisionCalls).toBe(0);
    const audit = new Database(runtime.contextVm.databasePath, {
      readonly: true,
    });
    expect(audit.query(`
      SELECT
        (SELECT COUNT(*) FROM context_invocations
          WHERE invocation_id = 'invocation-ready-v2') AS invocations,
        (SELECT COUNT(*) FROM context_packs) AS packs,
        (SELECT COUNT(*) FROM context_pack_decisions
          WHERE invocation_id = 'invocation-ready-v2') AS decisions,
        (SELECT COUNT(*) FROM context_provider_dispatches
          WHERE invocation_id = 'invocation-ready-v2'
            AND status = 'completed') AS completed_dispatches,
        (SELECT COUNT(*) FROM context_provider_attempts
          WHERE invocation_id = 'invocation-ready-v2'
            AND phase = 'readiness'
            AND status = 'completed') AS completed_attempts
    `).get()).toEqual({
      invocations: 1,
      packs: 1,
      decisions: 1,
      completed_dispatches: 0,
      completed_attempts: 0,
    });
    audit.close();
    expect(await runtime.contextVm.verify()).toMatchObject({ status: "pass" });
    runtime.contextVm.close();
  });

  it("marks post-dispatch inference attempts in doubt and never treats them as completed", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "orynt-intelligence-"));
    const runtime = new LocalIntelligenceRuntime(root);
    const sessionId = contextVmSessionId("in-doubt-session");
    const result = await runtime.resolveInvocationContextV2({
      invocation: {
        schemaVersion: 2,
        invocationId: "in-doubt-invocation",
        namespace: "test|workspace||",
        sessionId,
        role: "coordinator",
        transport: "scripted",
        modelId: "fixture",
        thinkingEffort: "medium",
        userRequest: "Prepare",
        constraints: [],
        requestedEntities: [],
        riskLevel: "low",
        hardBudgetTokens: 512,
        readiness: {
          maxOutputTokens: 1_024,
          timeoutMs: 30_000,
          maxFaultRounds: 3,
        },
      },
      decide: async () => ({ schemaVersion: 2, status: "READY" }),
    });
    expect(result.status).toBe("ready");
    if (result.status !== "ready") throw new Error("expected ready");
    await runtime.contextVm.recordProviderAttempt({
      attemptId: "in-doubt-invocation:inference:1",
      invocationId: "in-doubt-invocation",
      phase: "inference",
      attempt: 1,
      transport: "scripted",
      modelId: "fixture",
      thinkingEffort: "medium",
      status: "prepared",
      contextPackIds: result.artifact.orderedContextPackIds,
      contextHash: result.artifact.renderedContextHash,
    });
    await runtime.contextVm.recordProviderAttempt({
      attemptId: "in-doubt-invocation:inference:1",
      invocationId: "in-doubt-invocation",
      phase: "inference",
      attempt: 1,
      transport: "scripted",
      modelId: "fixture",
      thinkingEffort: "medium",
      status: "dispatched",
      contextPackIds: result.artifact.orderedContextPackIds,
      contextHash: result.artifact.renderedContextHash,
    });
    expect(await runtime.contextVm.recoverProviderAttempts(sessionId)).toEqual({
      inDoubtInvocationIds: ["in-doubt-invocation"],
    });
    expect(await runtime.contextVm.verify()).toMatchObject({ status: "pass" });
    runtime.contextVm.close();
  });

  it("distinguishes provider failures, cancellation, and malformed readiness decisions", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "orynt-intelligence-"));
    const runtime = new LocalIntelligenceRuntime(root);
    const resolve = (
      invocationId: string,
      decide: Parameters<
        LocalIntelligenceRuntime["resolveInvocationContextV2"]
      >[0]["decide"],
    ) =>
      runtime.resolveInvocationContextV2({
        invocation: {
          schemaVersion: 2,
          invocationId,
          namespace: "test|workspace||",
          sessionId: contextVmSessionId(`failure-${invocationId}`),
          role: "verifier",
          transport: "scripted",
          modelId: "fixture",
          thinkingEffort: "medium",
          userRequest: "Classify this prompt",
          constraints: [],
          requestedEntities: [],
          riskLevel: "low",
          hardBudgetTokens: 512,
          retrievalMode: "authority_only",
          readiness: {
            maxOutputTokens: 1_024,
            timeoutMs: 30_000,
            maxFaultRounds: 3,
          },
        },
        decide,
      });

    await expect(resolve("provider-error", async () => {
      throw new Error("invalid_json_schema response format rejected");
    })).resolves.toMatchObject({
      status: "abstained",
      reason: "provider_failure",
    });
    await expect(resolve("provider-cancelled", async () => {
      throw Object.assign(new Error("turn cancelled"), {
        name: "AbortError",
      });
    })).resolves.toMatchObject({
      status: "abstained",
      reason: "provider_cancelled",
    });
    await expect(resolve("malformed-decision", async () => ({
      schemaVersion: 2,
      status: "READY",
      answer: "not allowed",
    }))).resolves.toMatchObject({
      status: "abstained",
      reason: "malformed_decision",
    });

    const audit = new Database(runtime.contextVm.databasePath, {
      readonly: true,
    });
    expect(audit.query(`
      SELECT invocation_id, terminal_reason
      FROM context_invocation_audit
      WHERE invocation_id IN (
        'provider-error',
        'provider-cancelled',
        'malformed-decision'
      )
      ORDER BY invocation_id
    `).all()).toEqual([
      {
        invocation_id: "malformed-decision",
        terminal_reason: "malformed_decision",
      },
      {
        invocation_id: "provider-cancelled",
        terminal_reason: "provider_cancelled",
      },
      {
        invocation_id: "provider-error",
        terminal_reason: "provider_failure",
      },
    ]);
    audit.close();
    runtime.contextVm.close();
  });

  it("reopens raw provenance when high-risk context selects a consolidated page", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "orynt-intelligence-"));
    const runtime = new LocalIntelligenceRuntime(root);
    const sessionId = contextVmSessionId("high-risk-consolidation");
    await runtime.contextVm.appendEvent({
      sessionId,
      source: { kind: "test_fixture", id: "high-risk-goal" },
      occurredAt: "2026-08-05T00:00:00.000Z",
      actor: { kind: "user", id: "operator" },
      kind: "user_message",
      payload: {
        eventType: "goal_received",
        summary: "Preserve raw state across recovery",
      },
      sensitivity: "internal",
    });
    const report = await runtime.consolidateContextVmSession({
      sessionId,
      namespace: "test|workspace||",
      trigger: "explicit_save",
    });
    expect(report.outputMemoryIds).toHaveLength(1);

    const pack = await runtime.buildContextPack({
      schemaVersion: 1,
      namespace: "test|workspace||",
      sessionId,
      userRequest: "Preserve raw state across recovery",
      constraints: [],
      requestedEntities: [],
      riskLevel: "high",
      hardBudgetTokens: 1_000,
    });
    expect(pack.manifest.items.map(({ loadReason }) => loadReason)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("high_risk_raw_provenance:"),
      ]),
    );
    expect(pack.manifest.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sourceType: "event" }),
      ]),
    );
    runtime.contextVm.close();
  });

  it("resolves a bounded memory fault with a delta pack and ordered audit", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "orynt-intelligence-"));
    const runtime = new LocalIntelligenceRuntime(root);
    const sessionId = contextVmSessionId("page-fault-session");
    const source = await runtime.contextVm.appendEvent({
      sessionId,
      source: { kind: "test_fixture", id: "page-fault-source" },
      occurredAt: "2026-08-05T00:00:00.000Z",
      actor: { kind: "runtime", id: "test" },
      kind: "decision",
      payload: { summary: "AuthCallback exists because redirects must retain state." },
      sensitivity: "internal",
    });
    const cause = await runtime.contextVm.putMemoryPage({
      namespace: "test|workspace||",
      kind: "decision",
      status: "accepted",
      summary: "Redirect state must survive the callback",
      content: {
        eventKind: "decision",
        reason: "redirect state",
      },
      sources: [{ type: "event", eventId: source.id }],
      entityIds: ["RedirectState"],
      taskIds: [],
      relations: [],
      validFrom: source.occurredAt,
      confidence: 1,
      importance: 0.9,
      evidencePriority: "verified_tool",
      producer: "verifier-test",
    });
    await runtime.contextVm.putMemoryPage({
      namespace: "test|workspace||",
      kind: "decision",
      status: "accepted",
      summary: "AuthCallback retains redirect state",
      content: {
        eventKind: "decision",
        reason: "redirects must retain state",
      },
      sources: [{ type: "event", eventId: source.id }],
      entityIds: ["AuthCallback"],
      taskIds: [],
      relations: [{
        type: "caused_by",
        targetMemoryId: cause.id,
      }],
      validFrom: source.occurredAt,
      confidence: 1,
      importance: 0.9,
      evidencePriority: "verified_tool",
      producer: "verifier-test",
    });
    const initialPack = await runtime.buildContextPack({
      schemaVersion: 1,
      namespace: "test|workspace||",
      sessionId,
      userRequest: "Continue implementation",
      constraints: [],
      requestedEntities: [],
      riskLevel: "medium",
      hardBudgetTokens: 512,
    });
    const seenPacks: string[] = [];
    const outcome = await runtime.resolveMemoryDecisionLoop({
      initialPack,
      decide: async ({ pack, round }) => {
        seenPacks.push(pack.manifest.id);
        return round === 0
          ? {
              schemaVersion: 1,
              status: "NEED_MEMORY",
              missing: [{
                kind: "original_design_reason",
                entities: ["AuthCallback"],
                relation: "caused_by",
                timeRange: null,
                requiredSourceTypes: ["decision"],
                minimumEvidenceQuality: "verified",
              }],
            }
          : {
              schemaVersion: 1,
              status: "READY",
              answerOrAction: { summary: "Evidence loaded" },
            };
      },
    });

    expect(outcome).toMatchObject({
      status: "ready",
      rounds: [{
        round: 1,
        unresolved: [],
        loadedMemoryIds: [expect.stringMatching(/^mem_/)],
      }],
    });
    expect(seenPacks).toHaveLength(2);
    expect(seenPacks[1]).not.toBe(seenPacks[0]);
    const delta = await runtime.contextVm.inspectContextPack(
      outcome.rounds[0]!.contextPackId,
    );
    expect(delta?.items.map(({ loadReason }) => loadReason).join(" ")).toContain(
      "lexical_match",
    );
    expect(
      (await runtime.contextVm.scanSession({ sessionId, limit: 20 }))
        .map(({ kind }) => kind),
    ).toEqual(["decision", "memory_fault", "memory_resolution"]);
    expect(runtime.contextVm.cacheMetrics()).toMatchObject({
      maxBytes: 64 * 1024 * 1024,
      pinnedEntries: 0,
    });
    runtime.contextVm.close();
  });

  it("abstains on unresolved, repeated, and malformed memory faults", async () => {
    const missing = {
      kind: "missing_design_reason",
      entities: ["UnknownSymbol"],
      relation: null,
      timeRange: null,
      requiredSourceTypes: ["decision"],
      minimumEvidenceQuality: "verified",
    } as const;
    const createRuntime = async (suffix: string) => {
      const root = await mkdtemp(path.join(os.tmpdir(), "orynt-intelligence-"));
      const runtime = new LocalIntelligenceRuntime(root);
      const pack = await runtime.buildContextPack({
        schemaVersion: 1,
        namespace: "test|workspace||",
        sessionId: contextVmSessionId(`fault-${suffix}`),
        userRequest: "Continue implementation",
        constraints: [],
        requestedEntities: [],
        riskLevel: "high",
        hardBudgetTokens: 256,
      });
      return { runtime, pack };
    };

    const unresolved = await createRuntime("unresolved");
    await expect(unresolved.runtime.resolveMemoryDecisionLoop({
      initialPack: unresolved.pack,
      decide: async () => ({
        schemaVersion: 1,
        status: "NEED_MEMORY",
        missing: [missing],
      }),
    })).resolves.toMatchObject({
      status: "abstained",
      reason: "unresolved",
      rounds: [{ unresolved: [missing] }],
    });
    unresolved.runtime.contextVm.close();

    const malformed = await createRuntime("malformed");
    await expect(malformed.runtime.resolveMemoryDecisionLoop({
      initialPack: malformed.pack,
      decide: async () => ({
        schemaVersion: 1,
        status: "NEED_MEMORY",
        missing: [{ ...missing, entities: ["*"] }],
      }),
    })).resolves.toMatchObject({
      status: "abstained",
      reason: "malformed_request",
      rounds: [],
    });
    malformed.runtime.contextVm.close();

    const repeated = await createRuntime("repeated");
    const repeatedSource = await repeated.runtime.contextVm.appendEvent({
      sessionId: repeated.pack.request.sessionId,
      source: { kind: "test_fixture", id: "repeated-source" },
      occurredAt: "2026-08-05T00:00:00.000Z",
      actor: { kind: "runtime", id: "test" },
      kind: "decision",
      payload: { summary: "Canonical decision source" },
      sensitivity: "internal",
    });
    await repeated.runtime.contextVm.putMemoryPage({
      namespace: repeated.pack.request.namespace,
      kind: "decision",
      status: "accepted",
      summary: "KnownSymbol design reason",
      content: { eventKind: "decision" },
      sources: [{ type: "event", eventId: repeatedSource.id }],
      entityIds: ["KnownSymbol"],
      taskIds: [],
      relations: [],
      validFrom: repeatedSource.occurredAt,
      confidence: 1,
      importance: 1,
      evidencePriority: "verified_tool",
      producer: "verifier-test",
    });
    const repeatedMissing = {
      ...missing,
      entities: ["KnownSymbol"],
    };
    await expect(repeated.runtime.resolveMemoryDecisionLoop({
      initialPack: repeated.pack,
      decide: async () => ({
        schemaVersion: 1,
        status: "NEED_MEMORY",
        missing: [repeatedMissing],
      }),
    })).resolves.toMatchObject({
      status: "abstained",
      reason: "repeated_fault",
      rounds: [{ unresolved: [] }],
    });
    repeated.runtime.contextVm.close();
  });

  it("enforces the three-round limit and cancellation", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "orynt-intelligence-"));
    const runtime = new LocalIntelligenceRuntime(root);
    const sessionId = contextVmSessionId("fault-round-limit");
    const initialPack = await runtime.buildContextPack({
      schemaVersion: 1,
      namespace: "test|workspace||",
      sessionId,
      userRequest: "Continue implementation",
      constraints: [],
      requestedEntities: [],
      riskLevel: "high",
      hardBudgetTokens: 256,
    });
    const source = await runtime.contextVm.appendEvent({
      sessionId,
      source: { kind: "test_fixture", id: "round-limit-source" },
      occurredAt: "2026-08-05T00:00:00.000Z",
      actor: { kind: "runtime", id: "test" },
      kind: "decision",
      payload: { summary: "Canonical source for bounded rounds" },
      sensitivity: "internal",
    });
    for (let index = 0; index < 3; index += 1) {
      await runtime.contextVm.putMemoryPage({
        namespace: initialPack.request.namespace,
        kind: "decision",
        status: "accepted",
        summary: `KnownSymbol${index} design reason`,
        content: { eventKind: "decision", index },
        sources: [{ type: "event", eventId: source.id }],
        entityIds: [`KnownSymbol${index}`],
        taskIds: [],
        relations: [],
        validFrom: source.occurredAt,
        confidence: 1,
        importance: 1,
        evidencePriority: "verified_tool",
        producer: "verifier-test",
      });
    }
    await expect(runtime.resolveMemoryDecisionLoop({
      initialPack,
      decide: async ({ round }) => ({
        schemaVersion: 1,
        status: "NEED_MEMORY",
        missing: [{
          kind: `round_${round}`,
          entities: [`KnownSymbol${round}`],
          relation: null,
          timeRange: null,
          requiredSourceTypes: ["decision"],
          minimumEvidenceQuality: "verified",
        }],
      }),
    })).resolves.toMatchObject({
      status: "abstained",
      reason: "round_limit",
      rounds: [{ round: 1 }, { round: 2 }, { round: 3 }],
    });

    const controller = new AbortController();
    controller.abort();
    await expect(runtime.resolveMemoryDecisionLoop({
      initialPack,
      signal: controller.signal,
      decide: async () => ({
        schemaVersion: 1,
        status: "READY",
        answerOrAction: {},
      }),
    })).rejects.toMatchObject({ name: "AbortError" });
    runtime.contextVm.close();
  });

  it("builds deterministic exact-revision packets with canonical source closure", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "orynt-intelligence-"));
    const runtime = new LocalIntelligenceRuntime(root);
    const scope: RepositoryEvidenceScopeV1 = {
      schemaVersion: 1,
      localRepositoryId: "repo_local_packet",
      canonicalRepositoryPath: "/redacted/repository",
      headCommit: "a".repeat(40),
      branchRef: "refs/heads/main",
      dirty: false,
      workingStateDigest: null,
      revisionKey: `clean:${"a".repeat(40)}`,
      completeness: "complete",
      capturedAt: "2026-08-05T00:00:00.000Z",
    };
    const runEvent: RunEvent = {
      id: "run-packet-event-1",
      runId: "run-packet",
      sequence: 1,
      type: "goal_received",
      timestamp: scope.capturedAt,
      actor: { kind: "user", id: "operator" },
      payload: { goal: "Fix canonical evidence", token: "sk-AAAAAAAAAAAA" },
      artifacts: [],
      redaction: { applied: false, redactedPaths: [], redactionCount: 0 },
    };
    const canonical = canonicalTraceEventFromRunEvent({
      event: runEvent,
      taskId: "task-packet",
      workspaceId: "repository-repo_local_packet",
      repositoryScope: scope,
    });
    await runtime.contextVm.projectCanonicalTraceEvents([canonical]);
    await runtime.contextVm.extractSession(
      contextVmSessionId("run-packet"),
      `coding-apprentice|repository-repo_local_packet|${root}|`,
    );
    const input = {
      namespace: {
        capabilityId: "coding-apprentice",
        workspaceId: "repository-repo_local_packet",
        repositoryPath: root,
      },
      query: "canonical evidence",
      workspaceId: "repository-repo_local_packet",
      repository: scope,
      taskId: "task-next",
      itemBudget: 4,
      tokenBudget: 400,
    };
    const first = await runtime.buildRevisionBoundEvidence(input);
    const second = await runtime.buildRevisionBoundEvidence(input);
    expect(second).toEqual(first);
    expect(first.items).toHaveLength(1);
    expect(first.items[0]).toMatchObject({
      advisory: true,
      sourceEventIds: ["run-packet-event-1"],
      sourceRevisionKey: scope.revisionKey,
      loadReasons: expect.arrayContaining([
        "exact_repository_revision",
        "canonical_source_closed",
      ]),
    });
    expect(first.rendered).not.toContain("sk-AAAAAAAAAAAA");
    expect(first.renderedArtifact?.sha256).toMatch(/^[0-9a-f]{64}$/);

    const mismatched = await runtime.buildRevisionBoundEvidence({
      ...input,
      repository: {
        ...scope,
        dirty: true,
        workingStateDigest: "b".repeat(64),
        revisionKey: `dirty:${scope.headCommit}:${"b".repeat(64)}`,
      },
    });
    expect(mismatched.items).toHaveLength(0);
    expect(mismatched.gaps.map(({ code }) => code)).toContain("legacy_unscoped");

    const unavailable = await runtime.buildRevisionBoundEvidence({
      ...input,
      query: "prefer bun validation",
      repository: {
        ...scope,
        completeness: "unavailable",
        revisionKey: null,
      },
    });
    expect(unavailable.items).toHaveLength(0);
    expect(unavailable.gaps).toContainEqual(
      expect.objectContaining({ code: "repository_revision_unavailable" }),
    );
    await runtime.memoryStore.writeSemanticMemory({
      namespace: input.namespace,
      status: "candidate",
      summary: "Prefer bun validation",
      content: { preference: "bun test" },
      sensitivity: "internal",
      confidence: 0.95,
      provenance: {
        runId: runEvent.runId,
        taskId: "task-packet",
        eventIds: [runEvent.id],
        artifactRefs: [],
        sources: ["user_feedback"],
        sourceTimestamps: [runEvent.timestamp],
      },
      activation: {
        basis: "explicit_user_preference",
        requested: true,
        conflictsWith: [],
      },
      createdAt: runEvent.timestamp,
    });
    const preferencePacket = await runtime.buildRevisionBoundEvidence({
      ...input,
      query: "prefer bun validation",
      repository: {
        ...scope,
        completeness: "unavailable",
        revisionKey: null,
      },
    });
    expect(preferencePacket.items).toContainEqual(
      expect.objectContaining({
        kind: "preference",
        trust: "user",
        sourceRevisionKey: null,
      }),
    );

    const secondRunEvent: RunEvent = {
      ...runEvent,
      id: "run-packet-event-2",
      sequence: 2,
      timestamp: "2026-08-05T00:00:01.000Z",
      payload: { summary: "conflicting-value-b" },
    };
    const secondCanonical = canonicalTraceEventFromRunEvent({
      event: secondRunEvent,
      taskId: "task-packet",
      workspaceId: "repository-repo_local_packet",
      repositoryScope: scope,
      previousEventId: canonical.eventId,
    });
    await runtime.contextVm.projectCanonicalTraceEvents([canonical, secondCanonical]);
    const firstSource = await runtime.contextVm.getCanonicalSourceEvent(
      runEvent.id,
    );
    const secondSource = await runtime.contextVm.getCanonicalSourceEvent(
      secondRunEvent.id,
    );
    expect(firstSource).toBeDefined();
    expect(secondSource).toBeDefined();
    const pageBase = {
      namespace: `coding-apprentice|repository-repo_local_packet|${root}|`,
      kind: "fact" as const,
      status: "active" as const,
      subject: "packet-setting",
      predicate: "value",
      entityIds: [],
      taskIds: [],
      relations: [],
      validFrom: scope.capturedAt,
      confidence: 0.9,
      importance: 0.8,
      evidencePriority: "verified_tool" as const,
      producer: "verifier-fixture",
    };
    await runtime.contextVm.putMemoryPage({
      ...pageBase,
      summary: "conflicting-value-a",
      content: { value: "a" },
      sources: [{ type: "event", eventId: firstSource!.id }],
    });
    await runtime.contextVm.putMemoryPage({
      ...pageBase,
      summary: "conflicting-value-b",
      content: { value: "b" },
      sources: [{ type: "event", eventId: secondSource!.id }],
    });
    const conflicted = await runtime.buildRevisionBoundEvidence({
      ...input,
      query: "conflicting-value",
    });
    expect(conflicted.conflicts.length).toBeGreaterThan(0);
    expect(conflicted.items.map(({ displaySummary }) => displaySummary)).not.toContain(
      "conflicting-value-a",
    );
    expect(conflicted.rendered).toContain("Unresolved evidence conflicts:");
    runtime.contextVm.close();
  });
});
