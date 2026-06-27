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
  SkillStatus,
} from "@codepawl/shared";

type UnlistenFn = () => void;

type TauriCoreApi = {
  invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
};

type TauriEventApi = {
  listen<T>(event: string, handler: (event: { payload: T }) => void): Promise<UnlistenFn>;
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
