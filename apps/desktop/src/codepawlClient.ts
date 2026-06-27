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
} from "@codepawl/shared";

type UnlistenFn = () => void;

type TauriCoreApi = {
  invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
};

type TauriEventApi = {
  listen<T>(event: string, handler: (event: { payload: T }) => void): Promise<UnlistenFn>;
};

let mockListeners = new Set<(event: RunEvent) => void>();
let mockMemoryReview: MemoryReviewSnapshot = createMockRunState().memoryReview;
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
    mockListeners = new Set();
    mockMemoryReview = createMockRunState().memoryReview;
    mockReviewEventSequence = 20_000;
  },
};
