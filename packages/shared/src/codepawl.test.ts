import { describe, expect, it } from "vitest";

import {
  InMemoryRunStore,
  MVP_BLOCKED_SURFACES,
  RUN_EVENT_TYPES,
  BoundedContextWorkspace,
  ConservativePolicyEngine,
  ConservativeResourceGovernor,
  DryRunSandboxManager,
  appendPolicyDecisionEvent,
  assertValidRunStatusTransition,
  createConservativeCodingApprenticePolicy,
  createDefaultRunBudget,
  createMockRunSequence,
  createMockRunState,
  isExecutableMvpSurface,
  validateRunEvent,
  type ArtifactRef,
  type CandidateRule,
  type CandidateRuleStatusUpdateInput,
  type EpisodicMemoryItem,
  type MemoryReviewSnapshot,
  type SkillDefinition,
  type SkillReplayPlan,
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
      "budget_initialized",
      "budget_checked",
      "policy_checked",
      "sandbox_planned",
      "sandbox_ready_mock",
      "workspace_initialized",
      "workspace_item_added",
      "codex_missing",
      "budget_checked",
      "codex_contract_requested",
      "codex_contract_created",
      "workspace_item_added",
      "codex_manual_next_step",
      "codex_result_import_requested",
      "codex_sandbox_diff_inspected",
      "codex_manual_log_imported",
      "codex_result_redacted",
      "codex_result_imported",
      "manual_review_required",
      "verifier_input_created",
      "context_initialized",
      "context_packet_created",
      "policy_checked",
      "approval_required",
      "action_blocked",
      "policy_violation",
      "action_proposed",
      "action_blocked_or_approved",
      "budget_checked",
      "verification_planned",
      "verification_policy_checked",
      "verification_started",
      "verification_command_started",
      "verification_command_finished",
      "verification_diff_checked",
      "verification_recorded",
      "workspace_item_added",
      "verification_passed",
      "budget_recorded",
      "memory_extraction_started",
      "memory_episode_written",
      "candidate_rule_proposed",
      "memory_extraction_finished",
      "run_finished",
    ]);
    expect(state.permissionPolicy.askBefore).toContain("protected_path_change");
    expect(state.usageBudget.runLimitUsd).toBeGreaterThan(0);
    expect(state.traceSummary.eventCount).toBeGreaterThan(0);
    expect(state.traceSummary.artifactCount).toBe(8);
    expect(state.skillDraft.replayModelCalls).toBe(0);
  });

  it("declares manual Codex result import events as canonical run events", () => {
    expect(RUN_EVENT_TYPES).toEqual(
      expect.arrayContaining([
        "codex_result_import_requested",
        "codex_sandbox_diff_inspected",
        "codex_manual_log_imported",
        "codex_result_redacted",
        "codex_result_imported",
        "codex_result_import_failed",
        "manual_review_required",
        "verifier_input_created",
      ]),
    );
  });

  it("declares memory extraction events and artifact refs as canonical contracts", () => {
    expect(RUN_EVENT_TYPES).toEqual(
      expect.arrayContaining([
        "memory_extraction_started",
        "memory_episode_written",
        "candidate_rule_proposed",
        "candidate_rule_accepted",
        "candidate_rule_rejected",
        "candidate_rule_superseded",
        "memory_redaction_applied",
        "memory_extraction_finished",
        "memory_extraction_failed",
      ]),
    );

    const memoryArtifact: ArtifactRef = {
      id: "memory-episode-artifact",
      kind: "memory_episode",
      uri: "codepawl-artifact://run/memory/episode.json",
      label: "Memory episode",
    };
    const episode: EpisodicMemoryItem = {
      id: "episode-1",
      namespace: { capabilityId: "coding-apprentice", workspaceId: "workspace-1", repositoryPath: "/repo/codepawl" },
      kind: "run_episode",
      summary: "Verifier passed after a package-only change.",
      content: { status: "pass" },
      provenance: {
        runId: "run-1",
        taskId: "task-1",
        eventIds: ["run-1-event-1"],
        artifactRefs: [memoryArtifact],
        sources: ["verification_result"],
      },
      retention: { ttlDays: 30 },
      redaction: { applied: false, redactedPaths: [], redactionCount: 0 },
      confidence: 1,
      createdAt: "2026-06-26T00:00:00.000Z",
    };
    const rule: CandidateRule = {
      id: "candidate-rule-1",
      namespace: episode.namespace,
      status: "candidate",
      title: "Keep package fixes scoped",
      rule: "Keep source-only fixes under packages/** unless the contract says otherwise.",
      scope: { repositoryPath: "/repo/codepawl", allowedPaths: ["packages/**"], protectedPaths: [] },
      evidence: [{ kind: "allowed_scope_pattern", summary: "Verifier passed.", eventIds: ["run-1-event-1"], artifactRefs: [memoryArtifact], confidence: 1 }],
      provenance: episode.provenance,
      redaction: { applied: false, redactedPaths: [], redactionCount: 0 },
      createdAt: "2026-06-26T00:00:00.000Z",
      updatedAt: "2026-06-26T00:00:00.000Z",
    };

    expect(episode.kind).toBe("run_episode");
    expect(rule.status).toBe("candidate");
    expect(memoryArtifact.kind).toBe("memory_episode");
  });

  it("declares skill registry events and canonical skill definition contracts", () => {
    expect(RUN_EVENT_TYPES).toEqual(
      expect.arrayContaining([
        "skill_candidate_created",
        "skill_promoted_manual",
        "skill_rejected",
        "skill_superseded",
        "skill_archived",
      ]),
    );

    const skillArtifact: ArtifactRef = {
      id: "skill-definition-artifact",
      kind: "skill_definition",
      uri: "codepawl-artifact://run/skills/skill.json",
      label: "Candidate skill definition",
    };
    const skill: SkillDefinition = {
      id: "skill-package-scope",
      namespace: { capabilityId: "coding-apprentice", workspaceId: "workspace-1", repositoryPath: "/repo/codepawl" },
      capabilityId: "coding-apprentice.repository-scope",
      title: "Keep package fixes scoped",
      summary: "Apply package-only source fixes and validate with contracts.",
      status: "candidate",
      confidence: 0.86,
      preconditions: [{ id: "precondition-accepted-rule", kind: "memory_rule_status", summary: "Candidate rule was accepted by the user.", required: true }],
      steps: [{ id: "step-review-scope", title: "Review changed files", instruction: "Keep edits under packages/**.", expectedOutcome: "No protected path is touched." }],
      validation: {
        requiresVerifierPass: true,
        requiresDiffWithinScope: true,
        commands: ["pnpm test:contracts"],
        expectedEvidenceKinds: ["command", "diff_scope"],
      },
      safety: {
        allowedPaths: ["packages/**"],
        protectedPaths: [".env", "pnpm-lock.yaml"],
        allowedCommands: ["pnpm test:contracts"],
        blockedActions: ["automatic_execution", "secret_storage"],
        requiresManualApproval: true,
        rollbackNotes: "Archive or supersede the skill if future evidence invalidates it.",
        secretHandling: "Store only redacted summaries and artifact references.",
      },
      provenance: {
        sourceRunIds: ["run-1"],
        sourceTaskIds: ["task-1"],
        candidateRuleIds: ["candidate-rule-1"],
        episodeIds: ["episode-1"],
        verificationResultIds: ["verification-result-1"],
        codexContractIds: ["codex-contract-1"],
        artifactRefs: [skillArtifact],
        sourceEventIds: ["run-1-event-40"],
      },
      redaction: { applied: false, redactedPaths: [], redactionCount: 0 },
      promotionDecisions: [],
      createdAt: "2026-06-26T00:00:00.000Z",
      updatedAt: "2026-06-26T00:00:00.000Z",
    };

    expect(skill.status).toBe("candidate");
    expect(skill.safety.blockedActions).toContain("automatic_execution");
    expect(skillArtifact.kind).toBe("skill_definition");
  });

  it("declares skill replay dry-run events and canonical replay plan contracts", () => {
    expect(RUN_EVENT_TYPES).toEqual(
      expect.arrayContaining([
        "skill_replay_plan_requested",
        "skill_replay_preconditions_checked",
        "skill_replay_policy_checked",
        "skill_replay_budget_estimated",
        "skill_replay_plan_created",
        "skill_replay_plan_blocked",
      ]),
    );

    const replayPlanArtifact: ArtifactRef = {
      id: "skill-replay-plan-artifact",
      kind: "skill_replay_plan",
      uri: "codepawl-artifact://run/skills/replay-plan.json",
      label: "Skill replay dry-run plan",
    };
    const plan: SkillReplayPlan = {
      id: "skill-replay-plan-1",
      runId: "run-1",
      taskId: "task-1",
      skillId: "skill-package-scope",
      skillTitle: "Keep package fixes scoped",
      skillStatus: "active",
      mode: "active_dry_run",
      dryRunOnly: true,
      executable: false,
      readiness: "ready",
      summary: "Dry-run replay plan is ready for manual review.",
      preconditions: [
        {
          id: "precondition-accepted-rule",
          kind: "memory_rule_status",
          summary: "Accepted rule is present.",
          required: true,
          status: "passed",
        },
      ],
      steps: [
        {
          id: "step-review-scope",
          title: "Review repository scope",
          kind: "skill_step",
          summary: "Keep edits under packages/**.",
          dryRunOnly: true,
          status: "planned",
        },
      ],
      risks: ["low"],
      policyChecks: [],
      validationExpectations: [{ command: "pnpm test:contracts", allowed: true, expectedEvidenceKinds: ["command"], requiresVerifierPass: true }],
      budgetEstimate: {
        estimatedSteps: 2,
        estimatedCommands: 1,
        estimatedArtifacts: 1,
        estimatedModelTokens: 1_000,
        estimatedWallTimeMs: 120_000,
        decision: "allow",
        stopReasons: [],
      },
      blockedActions: ["automatic_execution"],
      requiredApprovals: ["manual approval required before any future skill execution"],
      expectedArtifacts: [replayPlanArtifact],
      stopReasons: [],
      redaction: { applied: false, redactedPaths: [], redactionCount: 0 },
      createdAt: "2026-06-26T00:00:00.000Z",
    };

    expect(plan.dryRunOnly).toBe(true);
    expect(plan.executable).toBe(false);
    expect(replayPlanArtifact.kind).toBe("skill_replay_plan");
  });

  it("builds a memory review snapshot with candidate-only rules and redacted evidence", () => {
    const state = createMockRunState();
    const snapshot: MemoryReviewSnapshot = state.memoryReview;
    const updateInput: CandidateRuleStatusUpdateInput = {
      id: snapshot.candidateRules[0].id,
      status: "accepted",
      runId: snapshot.latestEpisode?.provenance.runId,
    };

    expect(snapshot.namespace).toMatchObject({
      capabilityId: "coding-apprentice",
      workspaceId: "workspace-local-alpha",
    });
    expect(snapshot.latestEpisode?.summary).toContain("successful run episode");
    expect(snapshot.latestEpisode?.provenance.runId).toBe(state.traceSummary.runId);
    expect(snapshot.candidateRules).toHaveLength(2);
    expect(snapshot.candidateRules.map((rule) => rule.status)).toEqual(["candidate", "candidate"]);
    expect(snapshot.candidateRules[0].evidence[0]).toMatchObject({
      kind: "allowed_scope_pattern",
      confidence: 0.86,
    });
    expect(JSON.stringify(snapshot)).not.toContain("sk-memorysecret123");
    expect(JSON.stringify(snapshot)).toContain("[REDACTED]");
    expect(updateInput.status).toBe("accepted");
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

    expect(mockRun.summary.eventCount).toBe(46);
    expect(mockRun.summary.latestBudget?.exceeded).toBe(false);
    expect(mockRun.summary.latestSafety?.riskLevel).toBe("low");
    expect(mockRun.summary.latestVerdict?.status).toBe("pass");
    expect(mockRun.summary.artifactCount).toBe(8);
    expect(mockRun.events.map((event) => event.type)).toEqual([
      "run_started",
      "goal_received",
      "budget_initialized",
      "budget_checked",
      "policy_checked",
      "sandbox_planned",
      "sandbox_ready_mock",
      "workspace_initialized",
      "workspace_item_added",
      "codex_missing",
      "budget_checked",
      "codex_contract_requested",
      "codex_contract_created",
      "workspace_item_added",
      "codex_manual_next_step",
      "codex_result_import_requested",
      "codex_sandbox_diff_inspected",
      "codex_manual_log_imported",
      "codex_result_redacted",
      "codex_result_imported",
      "manual_review_required",
      "verifier_input_created",
      "context_initialized",
      "context_packet_created",
      "policy_checked",
      "approval_required",
      "action_blocked",
      "policy_violation",
      "action_proposed",
      "action_blocked_or_approved",
      "budget_checked",
      "verification_planned",
      "verification_policy_checked",
      "verification_started",
      "verification_command_started",
      "verification_command_finished",
      "verification_diff_checked",
      "verification_recorded",
      "workspace_item_added",
      "verification_passed",
      "budget_recorded",
      "memory_extraction_started",
      "memory_episode_written",
      "candidate_rule_proposed",
      "memory_extraction_finished",
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

describe("ContextWorkspace and ResourceGovernor", () => {
  function createRun(store = new InMemoryRunStore()) {
    return store.createRun({
      goal: "Fix a failing unit test",
      capabilityId: "coding-apprentice",
      taskId: "task-context",
      workspaceId: "workspace-1",
      budget: createDefaultRunBudget(),
    });
  }

  it("keeps the workspace bounded by priority and creates context packets", () => {
    const workspace = new BoundedContextWorkspace({ config: { maxItems: 3, maxContextTokens: 400 } });
    const snapshot = workspace.initialize({
      runId: "run-context",
      taskId: "task-context",
      goal: "Fix the repository task",
      policy: createConservativeCodingApprenticePolicy("/repo/codepawl", "/tmp/codepawl-worktrees"),
    });

    expect(snapshot.items.length).toBeLessThanOrEqual(3);
    workspace.addItem({ id: "low", kind: "summary", title: "Low", summary: "Low priority", priority: 1, tags: [], artifactRefs: [] });
    workspace.addItem({ id: "high", kind: "summary", title: "High", summary: "High priority", priority: 100, tags: [], artifactRefs: [] });
    workspace.addItem({ id: "medium", kind: "summary", title: "Medium", summary: "Medium priority", priority: 50, tags: [], artifactRefs: [] });
    const packet = workspace.createContextPacket();

    expect(packet.items.length).toBeLessThanOrEqual(3);
    expect(packet.provenanceItemIds).toContain("high");
    expect(packet.tokenEstimate).toBeGreaterThan(0);
  });

  it("redacts sensitive values before storing workspace items and packets", () => {
    const workspace = new BoundedContextWorkspace();
    workspace.initialize({
      runId: "run-redact",
      taskId: "task-context",
      goal: "Fix bug with apiKey=sk-testshouldnotpersist",
    });
    workspace.addItem({
      id: "secret-item",
      kind: "summary",
      title: "Secret output",
      summary: "token=ghp_shouldnotpersist",
      priority: 80,
      tags: ["secret"],
      artifactRefs: [],
    });
    const packetText = JSON.stringify(workspace.createContextPacket());

    expect(packetText).not.toContain("sk-testshouldnotpersist");
    expect(packetText).not.toContain("ghp_shouldnotpersist");
    expect(packetText).toContain("[REDACTED]");
  });

  it("emits workspace lifecycle events", () => {
    const store = new InMemoryRunStore();
    const run = createRun(store);
    const workspace = new BoundedContextWorkspace({ runStore: store });

    workspace.initialize({ runId: run.id, taskId: run.taskId, goal: run.goal });
    workspace.addItem({ id: "item-1", kind: "summary", title: "Item", summary: "Safe summary", priority: 1, tags: [], artifactRefs: [] });
    workspace.createContextPacket();

    expect(store.listEvents(run.id).map((event) => event.type)).toEqual([
      "workspace_initialized",
      "workspace_item_added",
      "context_packet_created",
    ]);
  });

  it("initializes budget state and summarizes usage", () => {
    const governor = new ConservativeResourceGovernor();
    governor.initializeBudget("run-budget");
    governor.recordUsage("run-budget", { toolSteps: 3, commandCount: 1, estimatedModelTokens: 500 });

    expect(governor.summarizeBudget("run-budget")).toContain("3/40 steps");
    expect(governor.shouldStop("run-budget")).toBe(false);
  });

  it("warns and stops when conservative resource limits are approached or exceeded", () => {
    const governor = new ConservativeResourceGovernor({ config: { maxSteps: 10, warningThreshold: 0.8 } });
    governor.initializeBudget("run-budget");

    const warning = governor.checkBeforeOperation("run-budget", "next_tool_call", { toolSteps: 8 });
    const stop = governor.checkBeforeOperation("run-budget", "next_tool_call", { toolSteps: 10 });

    expect(warning.decision).toBe("warn");
    expect(stop.decision).toBe("stop");
    expect(stop.stopReason).toBe("step_limit");
  });

  it("emits budget lifecycle events", () => {
    const store = new InMemoryRunStore();
    const run = createRun(store);
    const governor = new ConservativeResourceGovernor({ runStore: store, config: { maxSteps: 2, warningThreshold: 0.5 } });

    governor.initializeBudget(run.id);
    governor.checkBeforeOperation(run.id, "preflight", { toolSteps: 1 });
    governor.recordUsage(run.id, { toolSteps: 2 });

    expect(store.listEvents(run.id).map((event) => event.type)).toEqual([
      "budget_initialized",
      "budget_checked",
      "budget_warning",
      "budget_recorded",
      "budget_exceeded",
    ]);
  });
});
