import { describe, expect, it } from "vitest";

import {
  InMemoryRunStore,
  MVP_BLOCKED_SURFACES,
  ConservativePolicyEngine,
  DryRunSandboxManager,
  appendPolicyDecisionEvent,
  assertValidRunStatusTransition,
  createConservativeCodingApprenticePolicy,
  createDefaultRunBudget,
  createMockRunSequence,
  createMockRunState,
  isExecutableMvpSurface,
  validateRunEvent,
} from "./index";

describe("CodePawl shared product contracts", () => {
  it("treats repository workspaces as the only executable P0 surface", () => {
    expect(isExecutableMvpSurface("repository")).toBe(true);
    expect(MVP_BLOCKED_SURFACES).toEqual(["browser", "desktop", "files", "terminal"]);
    expect(isExecutableMvpSurface("browser")).toBe(false);
    expect(isExecutableMvpSurface("desktop")).toBe(false);
    expect(isExecutableMvpSurface("files")).toBe(false);
    expect(isExecutableMvpSurface("terminal")).toBe(false);
  });

  it("builds a typed mock run state with core primitives visible", () => {
    const state = createMockRunState();

    expect(state.workspace.plan).toBe("trial");
    expect(state.activeTask.surface).toBe("repository");
    expect(state.activeTask.status).toBe("succeeded");
    expect(state.steps.map((step) => step.type)).toEqual([
      "run_started",
      "goal_received",
      "policy_checked",
      "sandbox_planned",
      "sandbox_ready_mock",
      "codex_missing",
      "codex_contract_requested",
      "codex_contract_created",
      "codex_manual_next_step",
      "context_initialized",
      "policy_checked",
      "approval_required",
      "action_blocked",
      "policy_violation",
      "action_proposed",
      "action_blocked_or_approved",
      "verification_recorded",
      "budget_recorded",
      "run_finished",
    ]);
    expect(state.permissionPolicy.askBefore).toContain("protected_path_change");
    expect(state.usageBudget.runLimitUsd).toBeGreaterThan(0);
    expect(state.traceSummary.eventCount).toBeGreaterThan(0);
    expect(state.skillDraft.replayModelCalls).toBe(0);
  });
});

describe("Run and event spine", () => {
  function createRun(store = new InMemoryRunStore()) {
    return store.createRun({
      goal: "Fix a failing unit test",
      capabilityId: "coding-apprentice",
      taskId: "task-1",
      workspaceId: "workspace-1",
      budget: createDefaultRunBudget(),
    });
  }

  it("appends immutable ordered events without letting callers mutate stored history", () => {
    const store = new InMemoryRunStore();
    const run = createRun(store);
    const event = store.appendEvent(run.id, {
      type: "run_started",
      actor: { kind: "runtime", id: "test-runtime" },
      payload: { summary: "Run started" },
    });

    event.sequence = 99;
    (event.payload as { summary: string }).summary = "mutated outside store";

    store.appendEvent(run.id, {
      type: "goal_received",
      actor: { kind: "user", id: "test-user" },
      payload: { summary: "Goal accepted" },
    });

    const events = store.listEvents(run.id);
    expect(events.map((item) => item.sequence)).toEqual([1, 2]);
    expect((events[0].payload as { summary: string }).summary).toBe("Run started");
    expect(() => validateRunEvent(events[0])).not.toThrow();
  });

  it("validates explicit run status transitions", () => {
    expect(() => assertValidRunStatusTransition("created", "preparing")).not.toThrow();
    expect(() => assertValidRunStatusTransition("completed", "executing")).toThrow(
      "invalid run status transition: completed -> executing",
    );
  });

  it("redacts secrets and sensitive form values before storage", () => {
    const store = new InMemoryRunStore();
    const run = createRun(store);

    const event = store.appendEvent(run.id, {
      type: "context_initialized",
      actor: { kind: "runtime", id: "test-runtime" },
      payload: {
        summary: "Collected safe metadata",
        apiKey: "sk-testshouldnotpersist",
        nested: {
          formValue: "secret typed into a field",
          visibleLabel: "Email",
        },
      },
    });

    expect(event.redaction.applied).toBe(true);
    expect(event.redaction.redactedPaths).toEqual(["payload.apiKey", "payload.nested.formValue"]);
    expect(event.payload).toMatchObject({
      apiKey: "[REDACTED]",
      nested: {
        formValue: "[REDACTED]",
        visibleLabel: "Email",
      },
    });
  });

  it("summarizes budget, safety, verdict, artifacts, and event count", () => {
    const mockRun = createMockRunSequence();

    expect(mockRun.summary.eventCount).toBe(19);
    expect(mockRun.summary.latestBudget?.exceeded).toBe(false);
    expect(mockRun.summary.latestSafety?.riskLevel).toBe("low");
    expect(mockRun.summary.latestVerdict?.status).toBe("pass");
    expect(mockRun.summary.artifactCount).toBe(3);
    expect(mockRun.events.map((event) => event.type)).toEqual([
      "run_started",
      "goal_received",
      "policy_checked",
      "sandbox_planned",
      "sandbox_ready_mock",
      "codex_missing",
      "codex_contract_requested",
      "codex_contract_created",
      "codex_manual_next_step",
      "context_initialized",
      "policy_checked",
      "approval_required",
      "action_blocked",
      "policy_violation",
      "action_proposed",
      "action_blocked_or_approved",
      "verification_recorded",
      "budget_recorded",
      "run_finished",
    ]);
  });
});

describe("CorePolicy and sandbox boundary", () => {
  const policy = createConservativeCodingApprenticePolicy("/repo/codepawl", "/tmp/codepawl-worktrees");
  const engine = new ConservativePolicyEngine();

  it("allows safe allowlisted repository actions", () => {
    const decision = engine.evaluateAction(
      {
        id: "safe-status",
        kind: "command",
        summary: "Inspect repository status",
        command: "git status",
      },
      policy,
    );

    expect(decision.decision).toBe("allow");
    expect(decision.risk).toBe("low");
    expect(decision.violations).toEqual([]);
  });

  it("blocks destructive actions by default", () => {
    const decision = engine.evaluateAction(
      {
        id: "delete-repo",
        kind: "command",
        summary: "Delete repository contents",
        command: "rm -rf .",
      },
      policy,
    );

    expect(decision.decision).toBe("block");
    expect(decision.risk).toBe("blocked");
    expect(decision.violations[0]?.code).toBe("blocked_command");
  });

  it("requires approval for dependency installation and explains the decision", () => {
    const decision = engine.evaluateAction(
      {
        id: "install-deps",
        kind: "command",
        summary: "Install dependencies",
        command: "pnpm install",
      },
      policy,
    );

    expect(decision.decision).toBe("require_approval");
    expect(decision.approvalRequired).toBe(true);
    expect(engine.explainDecision(decision)).toContain("Approval required");
  });

  it("plans a repository sandbox without executing worktree commands", () => {
    const plan = new DryRunSandboxManager().planRepositorySandbox(
      {
        runId: "run-123",
        taskId: "task-123",
        repositoryPath: "/repo/codepawl",
        baseRef: "HEAD",
      },
      policy,
    );

    expect(plan.dryRun).toBe(true);
    expect(plan.plannedWorktreePath).toBe("/tmp/codepawl-worktrees/run-123");
    expect(plan.commands).toEqual(["git worktree add /tmp/codepawl-worktrees/run-123 HEAD"]);
  });

  it("emits policy decisions as append-only RunEvents", () => {
    const store = new InMemoryRunStore();
    const run = store.createRun({
      goal: "Fix a failing unit test",
      capabilityId: "coding-apprentice",
      taskId: "task-1",
      workspaceId: "workspace-1",
      budget: createDefaultRunBudget(),
    });
    const decision = engine.evaluateAction(
      {
        id: "install-deps",
        kind: "command",
        summary: "Install dependencies",
        command: "pnpm install",
      },
      policy,
    );

    const event = appendPolicyDecisionEvent(store, run.id, policy, decision, { kind: "policy", id: "core-policy" });

    expect(event.type).toBe("approval_required");
    expect(event.sequence).toBe(1);
    expect(event.safety?.approvalRequired).toBe(true);
    expect(store.listEvents(run.id).map((item) => item.type)).toEqual(["approval_required"]);
  });
});
