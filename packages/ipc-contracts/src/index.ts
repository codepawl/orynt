export const ORYNT_ERROR_CODES = [
  "SIDECAR_SPAWN_FAILED",
  "SIDECAR_PROTOCOL_MISMATCH",
  "REPOSITORY_CONTEXT_FAILED",
  "OBSERVATION_FAILED",
  "MODEL_SCHEMA_INVALID",
  "POLICY_DENIED",
  "APPROVAL_REQUIRED",
  "ACTION_TARGET_NOT_FOUND",
  "ACTION_SILENT_NOOP",
  "VERIFICATION_FAILED",
  "BUDGET_EXCEEDED",
  "USER_CANCELED",
  "SKILL_MANIFEST_INVALID",
  "SKILL_SOURCE_UNAVAILABLE",
  "SKILL_TRUST_BLOCKED",
  "SKILL_COLLISION",
  "SKILL_PLAN_STALE",
  "SKILL_DIGEST_MISMATCH",
  "SKILL_LOCAL_DRIFT",
  "SKILL_TRANSACTION_FAILED",
  "SKILL_RECOVERY_REQUIRED",
] as const;

export type OryntErrorCode = (typeof ORYNT_ERROR_CODES)[number];

export type RpcRequest = {
  jsonrpc: "2.0";
  id: string;
  method: string;
  params?: unknown;
};

export type RpcResponse = {
  jsonrpc: "2.0";
  id: string;
  result?: unknown;
  error?: {
    code: OryntErrorCode | string;
    message: string;
    details?: unknown;
  };
};

export type RpcEvent<TPayload = unknown> = {
  type: "event";
  event: string;
  payload: TPayload;
};

export const MEMORY_IPC_METHODS = [
  "memory.listEpisodes",
  "memory.listCandidateRules",
  "memory.updateCandidateRuleStatus",
] as const;

export const RUN_IPC_METHODS = [
  "run.create",
  "run.list",
  "run.open",
  "artifact.list",
  "artifact.read",
  "run.cancel",
] as const;

export const SETTINGS_IPC_METHODS = [
  "settings.get",
  "settings.update",
  "codexConnection.save",
  "codexConnection.preflight",
  "codexConnection.login",
  "codexConnection.loginWithAccessToken",
  "codexConnection.delete",
] as const;

export const SKILL_IPC_METHODS = [
  "skill.list",
  "skill.createCandidate",
  "skill.createReplayPlan",
  "skill.promoteManual",
  "skill.reject",
  "skill.supersede",
  "skill.archive",
] as const;

export const SKILL_MANAGER_IPC_METHODS = [
  "skillInventory.scan",
  "skillInventory.list",
  "skillInventory.get",
  "skillHub.listSources",
  "skillHub.refresh",
  "skillHub.search",
  "skillHub.get",
  "skillMutation.plan",
  "skillMutation.approve",
  "skillMutation.execute",
  "skillMutation.history",
  "skillMutation.recover",
  "skillContext.snapshot",
] as const;

export const CODEX_EXECUTION_IPC_METHODS = [
  "codexExecution.plan",
  "codexExecution.approve",
  "codexExecution.executeApproved",
  "codexExecution.cancel",
] as const;

export type RunEvent =
  | "run_started"
  | "goal_received"
  | "budget_initialized"
  | "budget_checked"
  | "budget_warning"
  | "budget_stop_requested"
  | "budget_exceeded"
  | "workspace_initialized"
  | "workspace_item_added"
  | "context_packet_created"
  | "context_initialized"
  | "policy_checked"
  | "sandbox_inspected"
  | "sandbox_create_requested"
  | "sandbox_create_allowed"
  | "sandbox_planned"
  | "sandbox_ready_mock"
  | "sandbox_created"
  | "sandbox_create_failed"
  | "sandbox_cleanup_planned"
  | "sandbox_cleanup_blocked"
  | "codex_detected"
  | "codex_missing"
  | "codex_contract_requested"
  | "codex_contract_created"
  | "codex_contract_write_failed"
  | "codex_manual_next_step"
  | "codex_execution_planned"
  | "codex_execution_approval_required"
  | "codex_execution_approved"
  | "codex_execution_started"
  | "codex_execution_output_recorded"
  | "codex_execution_finished"
  | "codex_execution_failed"
  | "codex_execution_cancel_requested"
  | "codex_execution_blocked"
  | "codex_execution_result_ready"
  | "codex_result_import_requested"
  | "codex_sandbox_diff_inspected"
  | "codex_manual_log_imported"
  | "codex_result_redacted"
  | "codex_result_imported"
  | "codex_result_import_failed"
  | "manual_review_required"
  | "verifier_input_created"
  | "verification_planned"
  | "verification_policy_checked"
  | "verification_started"
  | "verification_command_started"
  | "verification_command_finished"
  | "verification_diff_checked"
  | "action_proposed"
  | "approval_required"
  | "action_blocked"
  | "action_blocked_or_approved"
  | "policy_violation"
  | "verification_recorded"
  | "verification_failed"
  | "verification_passed"
  | "memory_extraction_started"
  | "memory_episode_written"
  | "candidate_rule_proposed"
  | "candidate_rule_accepted"
  | "candidate_rule_rejected"
  | "candidate_rule_superseded"
  | "skill_candidate_created"
  | "skill_promoted_manual"
  | "skill_rejected"
  | "skill_superseded"
  | "skill_archived"
  | "skill_replay_plan_requested"
  | "skill_replay_preconditions_checked"
  | "skill_replay_policy_checked"
  | "skill_replay_budget_estimated"
  | "skill_replay_plan_created"
  | "skill_replay_plan_blocked"
  | "skill_context_snapshot_created"
  | "memory_redaction_applied"
  | "memory_extraction_finished"
  | "memory_extraction_failed"
  | "budget_recorded"
  | "run_finished";

export const RUN_EVENTS = [
  "run_started",
  "goal_received",
  "budget_initialized",
  "budget_checked",
  "budget_warning",
  "budget_stop_requested",
  "budget_exceeded",
  "workspace_initialized",
  "workspace_item_added",
  "context_packet_created",
  "context_initialized",
  "policy_checked",
  "sandbox_inspected",
  "sandbox_create_requested",
  "sandbox_create_allowed",
  "sandbox_planned",
  "sandbox_ready_mock",
  "sandbox_created",
  "sandbox_create_failed",
  "sandbox_cleanup_planned",
  "sandbox_cleanup_blocked",
  "codex_detected",
  "codex_missing",
  "codex_contract_requested",
  "codex_contract_created",
  "codex_contract_write_failed",
  "codex_manual_next_step",
  "codex_execution_planned",
  "codex_execution_approval_required",
  "codex_execution_approved",
  "codex_execution_started",
  "codex_execution_output_recorded",
  "codex_execution_finished",
  "codex_execution_failed",
  "codex_execution_cancel_requested",
  "codex_execution_blocked",
  "codex_execution_result_ready",
  "codex_result_import_requested",
  "codex_sandbox_diff_inspected",
  "codex_manual_log_imported",
  "codex_result_redacted",
  "codex_result_imported",
  "codex_result_import_failed",
  "manual_review_required",
  "verifier_input_created",
  "verification_planned",
  "verification_policy_checked",
  "verification_started",
  "verification_command_started",
  "verification_command_finished",
  "verification_diff_checked",
  "action_proposed",
  "approval_required",
  "action_blocked",
  "action_blocked_or_approved",
  "policy_violation",
  "verification_recorded",
  "verification_failed",
  "verification_passed",
  "memory_extraction_started",
  "memory_episode_written",
  "candidate_rule_proposed",
  "candidate_rule_accepted",
  "candidate_rule_rejected",
  "candidate_rule_superseded",
  "skill_candidate_created",
  "skill_promoted_manual",
  "skill_rejected",
  "skill_superseded",
  "skill_archived",
  "skill_replay_plan_requested",
  "skill_replay_preconditions_checked",
  "skill_replay_policy_checked",
  "skill_replay_budget_estimated",
  "skill_replay_plan_created",
  "skill_replay_plan_blocked",
  "skill_context_snapshot_created",
  "memory_redaction_applied",
  "memory_extraction_finished",
  "memory_extraction_failed",
  "budget_recorded",
  "run_finished",
] as const satisfies readonly RunEvent[];

export type CreateRunInput = {
  goal: string;
  capabilityId: string;
  taskId: string;
  workspaceId: string;
  repositoryPath: string;
  selectedSkillIds?: string[];
  budget: {
    maxSteps: number;
    maxWallTimeMs: number;
    maxModelTokens: number;
    maxUsd?: number;
    stopOnBudgetExceeded: boolean;
  };
};

export type RunId = {
  id: string;
};

export type ApprovalDecisionInput = {
  runId: string;
  approvalId: string;
  decision: "approved" | "denied";
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

export function isRpcRequest(value: unknown): value is RpcRequest {
  return (
    isRecord(value) &&
    value.jsonrpc === "2.0" &&
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.method)
  );
}

export function isRpcResponse(value: unknown): value is RpcResponse {
  if (!isRecord(value) || value.jsonrpc !== "2.0" || !isNonEmptyString(value.id)) {
    return false;
  }

  if ("error" in value) {
    const error = value.error;
    return isRecord(error) && isNonEmptyString(error.code) && isNonEmptyString(error.message);
  }

  return "result" in value;
}

export function isRpcEvent(value: unknown): value is RpcEvent {
  return isRecord(value) && value.type === "event" && isNonEmptyString(value.event) && "payload" in value;
}

export function createRpcEvent<TPayload>(event: string, payload: TPayload): RpcEvent<TPayload> {
  if (!event) {
    throw new Error("RPC event name is required");
  }

  return {
    type: "event",
    event,
    payload,
  };
}
