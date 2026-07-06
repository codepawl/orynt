import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createDefaultRunBudget,
  InMemoryRunStore,
  type CodexResultBundle,
  type MemoryNamespace,
  type VerificationResult,
} from "@codepawl/shared";

import { LocalJsonMemoryStore, LocalMemoryExtractor } from "./index";

let tempRoot = "";

const namespace: MemoryNamespace = {
  capabilityId: "coding-apprentice",
  workspaceId: "workspace-memory",
  repositoryPath: "/repo/orynt",
};

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
        label: "pnpm test:contracts",
        command: "pnpm test:contracts",
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
          protectedPaths: [".env", "pnpm-lock.yaml"],
        },
        budget: { maxWallTimeMs: 1, maxSteps: 1, maxChangedFiles: 1, maxOutputBytes: 1000, maxProcessCount: 1, maxModelTokens: 1 },
        commandPolicy: { allowlist: ["pnpm test:contracts"], blockedCommands: [], approvalRequiredCommands: [], blockShellOutsideAllowlist: true },
        fileWritePolicy: { allowedGlobs: ["packages/**"], protectedGlobs: [".env", "pnpm-lock.yaml"], maxChangedFiles: 1, maxFileBytes: 1000, broadWriteRequiresApproval: true },
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
    validationCommands: ["pnpm test:contracts"],
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
      summary: "Successful run token=sk-neverpersist123",
      content: { status: "pass", command: "pnpm test:contracts" },
      provenance: {
        runId: "run-1",
        taskId: "task-memory",
        eventIds: ["run-1-event-1"],
        artifactRefs: [{ id: "artifact-1", kind: "validation_report", uri: "orynt-artifact://run/verification.json", label: "Verification result" }],
        sources: ["verification_result"],
        sourceTimestamps: ["2026-06-26T00:00:00.000Z"],
      },
      retention: { retainUntil: "2026-07-26T00:00:00.000Z", ttlDays: 30, archiveAfterDays: 90 },
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
      rule: "Avoid editing pnpm-lock.yaml during narrow source fixes.",
      scope: { repositoryPath: "/repo/orynt", allowedPaths: ["packages/**"], protectedPaths: ["pnpm-lock.yaml"] },
      evidence: [
        {
          kind: "protected_path_violation",
          summary: "Verifier saw pnpm-lock.yaml as protected.",
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
      summary: "User correction: prefer pnpm test:contracts for contract package changes token=sk-feedbacksecret123",
      content: {
        correction: "Use pnpm test:contracts before declaring shared contract changes complete.",
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
    expect(await store.listSemanticMemory({ namespace, statuses: ["candidate"], text: "pnpm test:contracts" })).toHaveLength(1);

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
      summary: "Use pnpm test:contracts before declaring shared contract changes complete.",
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
      summary: "Use pnpm test:contracts before declaring shared contract changes complete.",
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
        changedFiles: ["pnpm-lock.yaml", "outside.txt"],
        allowedFiles: [],
        protectedFiles: ["pnpm-lock.yaml"],
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
          protectedFiles: ["pnpm-lock.yaml"],
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
