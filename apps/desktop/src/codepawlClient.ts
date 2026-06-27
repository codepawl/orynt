import { createMockRunSequence, createMockRunState } from "@codepawl/shared";
import type {
  ApprovalDecisionInput,
  CandidateRule,
  CandidateRuleStatus,
  CandidateRuleStatusUpdateInput,
  CreateRunInput,
  EpisodicMemoryItem,
  MemoryReviewSnapshot,
  RunEvent,
  RunId,
  SkillDefinition,
  SkillPromotionDecision,
  SkillRegistrySnapshot,
  SkillReplayMode,
  SkillReplayPlan,
  SkillStatus,
} from "@codepawl/shared";

type UnlistenFn = () => void;

type TauriCoreApi = {
  invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
};

type TauriEventApi = {
  listen<T>(event: string, handler: (event: { payload: T }) => void): Promise<UnlistenFn>;
};

export type CodexExecutionPreviewStatus = "approval_required" | "running" | "result_ready" | "blocked";

export type CodexExecutionPreview = {
  runId: string;
  planId: string;
  status: CodexExecutionPreviewStatus;
  command: string;
  contractArtifact: string;
  artifactRoot: string;
  blockedReasons: string[];
  approvalRequired: boolean;
  resultReady: boolean;
  verificationSeparate: boolean;
  summary: string;
};

let mockListeners = new Set<(event: RunEvent) => void>();
const initialMockState = createMockRunState();
let mockMemoryReview: MemoryReviewSnapshot = initialMockState.memoryReview;
let mockSkillRegistry: SkillRegistrySnapshot = initialMockState.skillRegistry;
let mockReviewEventSequence = 20_000;

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function loadTauriApi(): Promise<{ core: TauriCoreApi; event: TauriEventApi } | null> {
  if (!isTauriRuntime()) {
    return null;
  }

  try {
    const [core, event] = await Promise.all([import("@tauri-apps/api/core"), import("@tauri-apps/api/event")]);
    return {
      core,
      event,
    };
  } catch {
    return null;
  }
}

function emitMockRunEvent(event: RunEvent) {
  for (const listener of mockListeners) {
    listener(event);
  }
}

function createMockCodexExecutionPreview(runId: string, overrides: Partial<CodexExecutionPreview> = {}): CodexExecutionPreview {
  const status = overrides.status ?? "approval_required";
  return {
    runId,
    planId: `codex-execution-plan-${runId}`,
    status,
    command: "codex exec --json --ephemeral --sandbox workspace-write --ask-for-approval never",
    contractArtifact: `codepawl-artifact://${runId}/codex-contract.md`,
    artifactRoot: `codepawl-artifact://${runId}/execution/`,
    blockedReasons: [],
    approvalRequired: status === "approval_required",
    resultReady: status === "result_ready",
    verificationSeparate: true,
    summary: "Controlled Codex execution is disabled until this exact plan is approved.",
    ...overrides,
  };
}

function reviewEventType(status: Exclude<CandidateRuleStatus, "candidate">): RunEvent["type"] {
  if (status === "accepted") {
    return "candidate_rule_accepted";
  }
  if (status === "rejected") {
    return "candidate_rule_rejected";
  }
  return "candidate_rule_superseded";
}

function updateStatusCounts(candidateRules: CandidateRule[]): MemoryReviewSnapshot["summary"]["candidateRuleStatusCounts"] {
  return {
    candidate: candidateRules.filter((rule) => rule.status === "candidate").length,
    accepted: candidateRules.filter((rule) => rule.status === "accepted").length,
    rejected: candidateRules.filter((rule) => rule.status === "rejected").length,
    superseded: candidateRules.filter((rule) => rule.status === "superseded").length,
  };
}

function updateSkillStatusCounts(skills: SkillDefinition[]): SkillRegistrySnapshot["summary"]["statusCounts"] {
  return {
    candidate: skills.filter((skill) => skill.status === "candidate").length,
    active: skills.filter((skill) => skill.status === "active").length,
    rejected: skills.filter((skill) => skill.status === "rejected").length,
    superseded: skills.filter((skill) => skill.status === "superseded").length,
    archived: skills.filter((skill) => skill.status === "archived").length,
  };
}

function skillEventType(status: Exclude<SkillStatus, "candidate">): RunEvent["type"] {
  if (status === "active") {
    return "skill_promoted_manual";
  }
  if (status === "rejected") {
    return "skill_rejected";
  }
  if (status === "superseded") {
    return "skill_superseded";
  }
  return "skill_archived";
}

function emitCandidateRuleReviewEvent(rule: CandidateRule, runId?: string) {
  const eventRunId = runId ?? rule.provenance.runId;
  emitMockRunEvent({
    id: `${eventRunId}-event-${rule.status}-${rule.id}`,
    runId: eventRunId,
    sequence: mockReviewEventSequence++,
    type: reviewEventType(rule.status as Exclude<CandidateRuleStatus, "candidate">),
    timestamp: new Date().toISOString(),
    actor: { kind: "ui", id: "memory-review-panel", displayName: "Memory Review Panel" },
    payload: {
      summary: `Candidate rule ${rule.status}: ${rule.title}`,
      candidateRuleId: rule.id,
      status: rule.status,
    },
    redaction: { applied: false, redactedPaths: [] },
    artifacts: rule.provenance.artifactRefs.filter((artifact) => artifact.kind === "candidate_rule"),
  });
}

function emitSkillReviewEvent(skill: SkillDefinition, runId?: string) {
  const eventRunId = runId ?? skill.provenance.sourceRunIds[0] ?? "run-1";
  const status = skill.status as Exclude<SkillStatus, "candidate">;
  emitMockRunEvent({
    id: `${eventRunId}-event-${status}-${skill.id}`,
    runId: eventRunId,
    sequence: mockReviewEventSequence++,
    type: skillEventType(status),
    timestamp: new Date().toISOString(),
    actor: { kind: "ui", id: "skill-registry-panel", displayName: "Skill Registry Panel" },
    payload: {
      summary: `Skill ${status}: ${skill.title}`,
      skillId: skill.id,
      status: skill.status,
    },
    redaction: { applied: false, redactedPaths: [] },
    artifacts: skill.provenance.artifactRefs.filter((artifact) => artifact.kind === "skill_definition"),
  });
}

function createMockSkillReplayPlan(skill: SkillDefinition, runId = skill.provenance.sourceRunIds[0] ?? "run-1"): SkillReplayPlan {
  const mode: SkillReplayMode = skill.status === "candidate" ? "candidate_preview" : "active_dry_run";
  const blockedStatus = skill.status !== "active" && skill.status !== "candidate";
  const stopReasons = [
    ...(skill.status === "candidate" ? (["candidate_preview_only"] as const) : []),
    ...(blockedStatus ? (["skill_not_active"] as const) : []),
  ];
  const readiness = blockedStatus ? "blocked" : skill.status === "candidate" ? "preview_only" : "ready";
  return {
    id: `skill-replay-plan-${skill.id}`,
    runId,
    taskId: skill.provenance.sourceTaskIds[0] ?? "task-failing-unit-test",
    skillId: skill.id,
    skillTitle: skill.title,
    skillStatus: skill.status,
    mode,
    dryRunOnly: true,
    executable: false,
    readiness,
    summary:
      skill.status === "candidate"
        ? `${skill.title} is available as a dry-run preview only; candidate skills are not executable.`
        : `${skill.title} dry-run replay plan is ready for manual review.`,
    preconditions: skill.preconditions.map((precondition) => ({
      ...precondition,
      status: "passed",
    })),
    steps: skill.steps.map((step) => ({
      id: `replay-${step.id}`,
      title: step.title,
      kind: "skill_step",
      summary: `${step.instruction} Expected: ${step.expectedOutcome}`,
      dryRunOnly: true,
      status: blockedStatus ? "skipped" : "planned",
    })),
    risks: blockedStatus ? ["blocked"] : ["low"],
    policyChecks: skill.validation.commands.map((command, index) => ({
      actionId: `skill-replay-command-${index + 1}`,
      summary: `Validate replay expectation: ${command}`,
      decision: "allow",
      risk: "low",
      approvalRequired: false,
      reasons: ["Command is on the conservative allowlist."],
      violations: [],
    })),
    validationExpectations: skill.validation.commands.map((command) => ({
      command,
      allowed: true,
      expectedEvidenceKinds: skill.validation.expectedEvidenceKinds,
      requiresVerifierPass: skill.validation.requiresVerifierPass,
      policyDecision: "allow",
      reason: "Command is on the conservative allowlist.",
    })),
    budgetEstimate: {
      estimatedSteps: Math.max(1, skill.steps.length + skill.preconditions.length + skill.validation.commands.length + 1),
      estimatedCommands: skill.validation.commands.length,
      estimatedArtifacts: Math.max(1, skill.provenance.artifactRefs.length + 1),
      estimatedModelTokens: 2_800,
      estimatedWallTimeMs: 180_000,
      decision: "allow",
      stopReasons: [],
    },
    blockedActions: skill.safety.blockedActions,
    requiredApprovals: ["manual approval required before any future skill execution"],
    expectedArtifacts: [
      {
        id: `skill-replay-plan-${skill.id}`,
        kind: "skill_replay_plan",
        uri: `codepawl-artifact://${runId}/skills/${skill.id}-replay-plan.json`,
        label: "Skill replay dry-run plan",
      },
    ],
    stopReasons,
    redaction: skill.redaction,
    createdAt: new Date().toISOString(),
  };
}

function emitSkillReplayEvents(plan: SkillReplayPlan) {
  const lifecycle = [
    "skill_replay_plan_requested",
    "skill_replay_preconditions_checked",
    "skill_replay_policy_checked",
    "skill_replay_budget_estimated",
    plan.readiness === "blocked" ? "skill_replay_plan_blocked" : "skill_replay_plan_created",
  ] as const;

  for (const type of lifecycle) {
    emitMockRunEvent({
      id: `${plan.runId}-event-${type}-${plan.skillId}`,
      runId: plan.runId,
      sequence: mockReviewEventSequence++,
      type,
      timestamp: new Date().toISOString(),
      actor: { kind: "ui", id: "skill-registry-panel", displayName: "Skill Registry Panel" },
      payload: {
        summary: `Skill replay ${plan.readiness}: ${plan.skillTitle}`,
        skillId: plan.skillId,
        replayPlanId: plan.id,
        readiness: plan.readiness,
      },
      redaction: { applied: plan.redaction.applied, redactedPaths: plan.redaction.redactedPaths },
      artifacts: type === "skill_replay_plan_created" || type === "skill_replay_plan_blocked" ? plan.expectedArtifacts : [],
    });
  }
}

function applyMockSkillDecision(input: SkillPromotionDecision): SkillDefinition {
  const skill = mockSkillRegistry.skills.find((item) => item.id === input.skillId);
  if (!skill) {
    throw new Error(`skill not found: ${input.skillId}`);
  }
  const status: SkillStatus =
    input.decision === "promote" ? "active" : input.decision === "reject" ? "rejected" : input.decision === "supersede" ? "superseded" : "archived";
  const updated: SkillDefinition = {
    ...skill,
    status,
    supersededBy: status === "superseded" ? (input.supersededBy ?? "skill-replacement-demo") : skill.supersededBy,
    updatedAt: input.decidedAt,
    promotionDecisions: [...skill.promotionDecisions, input],
  };
  const skills = mockSkillRegistry.skills.map((item) => (item.id === updated.id ? updated : item));
  mockSkillRegistry = {
    ...mockSkillRegistry,
    skills,
    summary: {
      ...mockSkillRegistry.summary,
      statusCounts: updateSkillStatusCounts(skills),
    },
  };
  queueMicrotask(() => emitSkillReviewEvent(updated, input.runId));
  return structuredClone(updated);
}

export const codepawl = {
  createCodexExecutionPreview(runId: string): CodexExecutionPreview {
    return createMockCodexExecutionPreview(runId);
  },

  async approveCodexExecution(runId: string, planId: string): Promise<CodexExecutionPreview> {
    const tauri = await loadTauriApi();
    if (tauri) {
      return tauri.core.invoke<CodexExecutionPreview>("codex_execution_approve", { input: { runId, planId } });
    }

    queueMicrotask(() => {
      emitMockRunEvent({
        id: `${runId}-event-codex-execution-approved`,
        runId,
        sequence: mockReviewEventSequence++,
        type: "codex_execution_approved",
        timestamp: new Date().toISOString(),
        actor: { kind: "ui", id: "codex-execution-panel", displayName: "Codex Execution Panel" },
        payload: {
          summary: "Controlled Codex execution approved by operator",
          planId,
        },
        redaction: { applied: false, redactedPaths: [] },
        artifacts: [],
      });
      emitMockRunEvent({
        id: `${runId}-event-codex-execution-started`,
        runId,
        sequence: mockReviewEventSequence++,
        type: "codex_execution_started",
        timestamp: new Date().toISOString(),
        actor: { kind: "runtime", id: "codex-execution-panel", displayName: "Codex Execution Panel" },
        payload: {
          summary: "Controlled Codex execution started in managed sandbox",
          planId,
        },
        redaction: { applied: false, redactedPaths: [] },
        artifacts: [],
      });
    });

    await new Promise((resolve) => setTimeout(resolve, 20));
    emitMockRunEvent({
      id: `${runId}-event-codex-execution-result-ready`,
      runId,
      sequence: mockReviewEventSequence++,
      type: "codex_execution_result_ready",
      timestamp: new Date().toISOString(),
      actor: { kind: "runtime", id: "codex-execution-panel", displayName: "Codex Execution Panel" },
      payload: {
        summary: "Controlled Codex execution result ready for import",
        planId,
        importReady: true,
      },
      redaction: { applied: false, redactedPaths: [] },
      artifacts: [
        {
          id: `${planId}-result`,
          kind: "codex_execution_result",
          uri: `codepawl-artifact://${runId}/execution/codex-execution-result.json`,
          label: "Controlled Codex execution result",
        },
      ],
    });
    return createMockCodexExecutionPreview(runId, {
      planId,
      status: "result_ready",
      approvalRequired: false,
      resultReady: true,
      summary: "Result ready for import. Verification remains separate.",
    });
  },

  async showBlockedCodexExecution(runId: string, planId: string): Promise<CodexExecutionPreview> {
    const tauri = await loadTauriApi();
    if (tauri) {
      return tauri.core.invoke<CodexExecutionPreview>("codex_execution_blocked_preview", { input: { runId, planId } });
    }

    queueMicrotask(() => {
      emitMockRunEvent({
        id: `${runId}-event-codex-execution-blocked`,
        runId,
        sequence: mockReviewEventSequence++,
        type: "codex_execution_blocked",
        timestamp: new Date().toISOString(),
        actor: { kind: "policy", id: "codex-execution-panel", displayName: "Codex Execution Panel" },
        payload: {
          summary: "Controlled Codex execution blocked: codex_missing",
          planId,
          failureReasons: ["codex_missing"],
        },
        redaction: { applied: false, redactedPaths: [] },
        artifacts: [],
      });
    });
    return createMockCodexExecutionPreview(runId, {
      planId,
      status: "blocked",
      approvalRequired: false,
      blockedReasons: ["codex_missing"],
      summary: "Blocked before execution because Codex is missing from the controlled runtime.",
    });
  },

  async createRun(input: CreateRunInput): Promise<RunId> {
    const tauri = await loadTauriApi();
    if (tauri) {
      return tauri.core.invoke<RunId>("run_create", { input });
    }

    const mockRun = createMockRunSequence();
    const runId = mockRun.run.id;
    queueMicrotask(() => {
      for (const event of mockRun.events) {
        emitMockRunEvent(event);
      }
    });

    return { id: runId };
  },

  async cancelRun(runId: string): Promise<void> {
    const tauri = await loadTauriApi();
    if (tauri) {
      await tauri.core.invoke<void>("run_cancel", { runId });
    }
  },

  async approve(input: ApprovalDecisionInput): Promise<void> {
    const tauri = await loadTauriApi();
    if (tauri) {
      await tauri.core.invoke<void>("approval_respond", { input });
      return;
    }

    queueMicrotask(() => {
      emitMockRunEvent({
        id: `${input.runId}-event-approval-${input.approvalId}`,
        runId: input.runId,
        sequence: 10_000,
        type: "action_blocked_or_approved",
        timestamp: new Date().toISOString(),
        actor: { kind: "policy", id: "mock-policy", displayName: "Mock Policy" },
        payload: {
          summary: `Approval ${input.decision} for ${input.approvalId}`,
          approvalId: input.approvalId,
          decision: input.decision,
        },
        redaction: { applied: false, redactedPaths: [] },
        artifacts: [],
        safety: {
          policyMode: "safe",
          riskLevel: input.decision === "approved" ? "low" : "blocked",
          approvalRequired: false,
          protectedPathTouched: false,
          commandAllowed: input.decision === "approved",
          reasons: [`operator ${input.decision}`],
        },
      });
    });
  },

  async listMemoryEpisodes(): Promise<EpisodicMemoryItem[]> {
    const tauri = await loadTauriApi();
    if (tauri) {
      return tauri.core.invoke<EpisodicMemoryItem[]>("memory_list_episodes");
    }

    return structuredClone(mockMemoryReview.episodes);
  },

  async listCandidateRules(): Promise<CandidateRule[]> {
    const tauri = await loadTauriApi();
    if (tauri) {
      return tauri.core.invoke<CandidateRule[]>("memory_list_candidate_rules");
    }

    return structuredClone(mockMemoryReview.candidateRules);
  },

  async updateCandidateRuleStatus(input: CandidateRuleStatusUpdateInput): Promise<CandidateRule> {
    const tauri = await loadTauriApi();
    if (tauri) {
      return tauri.core.invoke<CandidateRule>("memory_update_candidate_rule_status", { input });
    }

    const rule = mockMemoryReview.candidateRules.find((item) => item.id === input.id);
    if (!rule) {
      throw new Error(`candidate rule not found: ${input.id}`);
    }
    const updated: CandidateRule = {
      ...rule,
      status: input.status,
      updatedAt: new Date().toISOString(),
      supersededBy: input.status === "superseded" ? (input.supersededBy ?? "candidate-rule-replacement-demo") : rule.supersededBy,
    };
    const candidateRules = mockMemoryReview.candidateRules.map((item) => (item.id === updated.id ? updated : item));
    mockMemoryReview = {
      ...mockMemoryReview,
      candidateRules,
      summary: {
        ...mockMemoryReview.summary,
        candidateRuleStatusCounts: updateStatusCounts(candidateRules),
      },
    };
    queueMicrotask(() => emitCandidateRuleReviewEvent(updated, input.runId));
    return structuredClone(updated);
  },

  async listSkills(): Promise<SkillDefinition[]> {
    const tauri = await loadTauriApi();
    if (tauri) {
      return tauri.core.invoke<SkillDefinition[]>("skill_list");
    }

    return structuredClone(mockSkillRegistry.skills);
  },

  async createCandidateSkill(): Promise<SkillDefinition> {
    const tauri = await loadTauriApi();
    if (tauri) {
      return tauri.core.invoke<SkillDefinition>("skill_create_candidate");
    }

    const skill = mockSkillRegistry.skills[0];
    queueMicrotask(() => {
      emitMockRunEvent({
        id: `${skill.provenance.sourceRunIds[0] ?? "run-1"}-event-skill-candidate-${skill.id}`,
        runId: skill.provenance.sourceRunIds[0] ?? "run-1",
        sequence: mockReviewEventSequence++,
        type: "skill_candidate_created",
        timestamp: new Date().toISOString(),
        actor: { kind: "runtime", id: "skill-registry", displayName: "Skill Registry" },
        payload: { summary: `Candidate skill created: ${skill.title}`, skillId: skill.id, status: skill.status },
        redaction: { applied: skill.redaction.applied, redactedPaths: skill.redaction.redactedPaths },
        artifacts: skill.provenance.artifactRefs.filter((artifact) => artifact.kind === "skill_definition"),
      });
    });
    return structuredClone(skill);
  },

  async promoteSkillManually(input: SkillPromotionDecision): Promise<SkillDefinition> {
    const tauri = await loadTauriApi();
    if (tauri) {
      return tauri.core.invoke<SkillDefinition>("skill_promote_manual", { input });
    }

    return applyMockSkillDecision({ ...input, decision: "promote" });
  },

  async rejectSkill(input: SkillPromotionDecision): Promise<SkillDefinition> {
    const tauri = await loadTauriApi();
    if (tauri) {
      return tauri.core.invoke<SkillDefinition>("skill_reject", { input });
    }

    return applyMockSkillDecision({ ...input, decision: "reject" });
  },

  async supersedeSkill(input: SkillPromotionDecision): Promise<SkillDefinition> {
    const tauri = await loadTauriApi();
    if (tauri) {
      return tauri.core.invoke<SkillDefinition>("skill_supersede", { input });
    }

    return applyMockSkillDecision({ ...input, decision: "supersede" });
  },

  async archiveSkill(input: SkillPromotionDecision): Promise<SkillDefinition> {
    const tauri = await loadTauriApi();
    if (tauri) {
      return tauri.core.invoke<SkillDefinition>("skill_archive", { input });
    }

    return applyMockSkillDecision({ ...input, decision: "archive" });
  },

  async createSkillReplayPlan(skillId: string, runId?: string): Promise<SkillReplayPlan> {
    const tauri = await loadTauriApi();
    if (tauri) {
      return tauri.core.invoke<SkillReplayPlan>("skill_create_replay_plan", { input: { skillId, runId } });
    }

    const skill = mockSkillRegistry.skills.find((item) => item.id === skillId);
    if (!skill) {
      throw new Error(`skill not found: ${skillId}`);
    }
    const plan = createMockSkillReplayPlan(skill, runId);
    queueMicrotask(() => emitSkillReplayEvents(plan));
    return structuredClone(plan);
  },

  async onRunEvent(handler: (event: RunEvent) => void): Promise<UnlistenFn> {
    const tauri = await loadTauriApi();
    if (tauri) {
      return tauri.event.listen<RunEvent>("run_event", (event) => handler(event.payload));
    }

    mockListeners.add(handler);
    return () => {
      mockListeners.delete(handler);
    };
  },

  resetMockListenersForTest() {
    const resetState = createMockRunState();
    mockListeners = new Set();
    mockMemoryReview = resetState.memoryReview;
    mockSkillRegistry = resetState.skillRegistry;
    mockReviewEventSequence = 20_000;
  },
};
