export const CODEPAWL_ERROR_CODES = [
  "SIDECAR_SPAWN_FAILED",
  "SIDECAR_PROTOCOL_MISMATCH",
  "BROWSER_LAUNCH_FAILED",
  "OBSERVATION_FAILED",
  "MODEL_SCHEMA_INVALID",
  "POLICY_DENIED",
  "APPROVAL_REQUIRED",
  "ACTION_TARGET_NOT_FOUND",
  "ACTION_SILENT_NOOP",
  "VERIFICATION_FAILED",
  "BUDGET_EXCEEDED",
  "USER_CANCELED",
] as const;

export type CodePawlErrorCode = (typeof CODEPAWL_ERROR_CODES)[number];

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
    code: CodePawlErrorCode | string;
    message: string;
    details?: unknown;
  };
};

export type RpcEvent<TPayload = unknown> = {
  type: "event";
  event: string;
  payload: TPayload;
};

export type RunEvent =
  | {
      type: "run.created";
      runId: string;
      task: string;
      summary: string;
    }
  | {
      type: "run.step_added";
      runId: string;
      stepIndex: number;
      summary: string;
    }
  | {
      type: "approval.resolved";
      runId: string;
      approvalId: string;
      decision: "approved" | "denied";
    };

export type CreateRunInput = {
  task: string;
  surfaceKind: "browser";
  budgetPolicy: {
    maxSteps: number;
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
