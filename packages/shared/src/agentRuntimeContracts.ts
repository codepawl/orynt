import type {
  CapabilitySelectionPlanV1,
  CapabilityRuntimeSettingsV1,
} from "./capabilityContracts.js";

export type AgentTaskSurface = "repository" | "browser";

export type AgentTaskAuthority =
  | "read_only"
  | "approval_required"
  | "single_writer"
  | "takeover_required";

export type AgentTaskV1 = {
  schemaVersion: 1;
  id: string;
  title: string;
  instruction: string;
  surface: AgentTaskSurface;
  capabilityIds: string[];
  toolNamespaces: string[];
  dependencies: string[];
  authority: AgentTaskAuthority;
  expectedPaths: string[];
  expectedEvidence: string[];
};

export type AgentTurnRequestV1 = {
  schemaVersion: 1;
  runId: string;
  taskId: string;
  prompt: string;
  repositoryPath?: string;
  environment: string[];
  connectedCapabilityIds: string[];
  capabilitySettings: CapabilityRuntimeSettingsV1;
};

export type AgentTurnEventV1 = {
  schemaVersion: 1;
  id: string;
  runId: string;
  taskId: string;
  type:
    | "capabilities_selected"
    | "approval_required"
    | "task_started"
    | "task_completed"
    | "task_failed"
    | "outcome_recorded";
  summary: string;
  capabilityIds: string[];
  artifactRefs: string[];
  recordedAt: string;
};

export type AgentTurnResultV1 = {
  schemaVersion: 1;
  runId: string;
  taskId: string;
  status: "completed" | "failed" | "cancelled" | "blocked";
  summary: string;
  capabilityPlan: CapabilitySelectionPlanV1;
  tasks: AgentTaskV1[];
  events: AgentTurnEventV1[];
  artifactRefs: string[];
};

/**
 * Surface-neutral application-session protocol. Product adapters dispatch
 * commands and render snapshots/events; they never decide runtime policy from
 * presentation state.
 */
export type AgentSessionStatusV1 =
  | "idle"
  | "thinking"
  | "input_required"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "execution_in_doubt";

export type AgentSessionDecisionKindV1 =
  | "clarification"
  | "assumption_confirmation"
  | "repository_approval"
  | "browser_approval"
  | "browser_vision_trust";

export type AgentSessionPendingDecisionV1 = {
  schemaVersion: 1;
  id: string;
  kind: AgentSessionDecisionKindV1;
  prompt: string;
  summary: string;
  digest: string;
  options: Array<{
    id: string;
    label: string;
    description?: string;
    recommended?: boolean;
  }>;
  requestedRevision: number;
};

type AgentSessionCommandBaseV1 = {
  schemaVersion: 1;
  sessionId: string;
  expectedRevision: number;
};

export type AgentSessionCommandV1 =
  | (AgentSessionCommandBaseV1 & {
      type: "submit_message";
      message: string;
      activeGoal?: string;
      acceptanceCriteria: string[];
      minimumTier?: "light" | "medium" | "heavy";
      selectedSkillIds: string[];
    })
  | (AgentSessionCommandBaseV1 & {
      type: "answer_clarification";
      decisionId: string;
      answer: string;
    })
  | (AgentSessionCommandBaseV1 & {
      type: "confirm_assumptions";
      decisionId: string;
      confirmed: boolean;
    })
  | (AgentSessionCommandBaseV1 & {
      type: "decide_approval";
      decisionId: string;
      decisionDigest: string;
      decision: "approved" | "rejected";
    })
  | (AgentSessionCommandBaseV1 & {
      type: "cancel";
      reason?: string;
    })
  | (AgentSessionCommandBaseV1 & {
      type: "resume";
    });

export type AgentSessionEventTypeV1 =
  | "message_started"
  | "message_delta"
  | "message_completed"
  | "activity_started"
  | "activity_updated"
  | "activity_completed"
  | "capabilities_selected"
  | "plan_ready"
  | "input_required"
  | "approval_recorded"
  | "run_started"
  | "verification_recorded"
  | "evidence_recorded"
  | "turn_completed"
  | "turn_failed"
  | "turn_cancelled"
  | "execution_in_doubt";

export type AgentSessionEventV1 = {
  schemaVersion: 1;
  id: string;
  sessionId: string;
  sequence: number;
  revision: number;
  type: AgentSessionEventTypeV1;
  summary: string;
  payload?: Record<string, unknown>;
  artifactRefs: string[];
  recordedAt: string;
};

export type AgentSessionSnapshotV1 = {
  schemaVersion: 1;
  sessionId: string;
  revision: number;
  status: AgentSessionStatusV1;
  summary: string;
  pendingDecision: AgentSessionPendingDecisionV1 | null;
  events: AgentSessionEventV1[];
  artifactRefs: string[];
  updatedAt: string;
};
