import type {
  CognitiveRunCheckpointV1,
  CognitiveUsageSnapshotV1,
} from "./index.js";

const ROOT_KEYS = [
  "schemaVersion", "runId", "taskId", "workspaceId", "goal", "constraints",
  "status", "phase", "revision", "budget", "usage", "events",
  "observationSummary", "memoryHits", "actionPlans", "actionDecisions",
  "pendingAction", "approval", "executionAttempt", "gatewayResults",
  "verifications", "learningSummary", "summary", "createdAt", "updatedAt",
] as const;
const STATUS = new Set([
  "running", "waiting_for_approval", "blocked", "completed", "failed",
  "cancelled", "budget_exceeded", "execution_in_doubt",
]);
const PHASE = new Set([
  "observe", "retrieve", "plan", "gate", "execute", "verify", "learn",
  "summarize",
]);
const EVENT_TYPES = new Set([
  "runtime.started", "observation.captured", "memory.retrieved", "plan.created",
  "policy.decided", "approval.requested", "approval.approved",
  "approval.rejected", "execution.prepared", "action.dispatched",
  "usage.recorded", "budget.exceeded", "action.executed",
  "verification.completed", "learning.completed", "run.completed",
  "run.blocked", "run.failed", "run.cancelled", "run.execution_in_doubt",
]);
const RUN_ID_PATTERN = /^[a-zA-Z0-9._-]{1,160}$/;

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function exact(value: Record<string, unknown>, keys: readonly string[], label: string): void {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(`${label} has unexpected or missing fields`);
  }
}

function string(value: unknown, label: string, allowEmpty = false): asserts value is string {
  if (typeof value !== "string" || (!allowEmpty && value.length === 0)) {
    throw new Error(`${label} must be ${allowEmpty ? "a string" : "a non-empty string"}`);
  }
}

function integer(value: unknown, label: string, minimum = 0): asserts value is number {
  if (!Number.isSafeInteger(value) || Number(value) < minimum) {
    throw new Error(`${label} must be a safe integer >= ${minimum}`);
  }
}

function finite(value: unknown, label: string, minimum = 0): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum) {
    throw new Error(`${label} must be a finite number >= ${minimum}`);
  }
}

function iso(value: unknown, label: string): asserts value is string {
  string(value, label);
  if (!Number.isFinite(Date.parse(value))) {
    throw new Error(`${label} must be an ISO timestamp`);
  }
}

function strings(value: unknown, label: string): asserts value is string[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  value.forEach((entry, index) => string(entry, `${label}[${index}]`, true));
}

function usage(value: unknown, label: string): asserts value is CognitiveUsageSnapshotV1 {
  const record = object(value, label);
  exact(record, ["stepCount", "elapsedMs", "modelTokens", "estimatedUsd", "toolCalls"], label);
  integer(record.stepCount, `${label}.stepCount`);
  finite(record.elapsedMs, `${label}.elapsedMs`);
  integer(record.modelTokens, `${label}.modelTokens`);
  finite(record.estimatedUsd, `${label}.estimatedUsd`);
  integer(record.toolCalls, `${label}.toolCalls`);
}

function evidence(value: unknown, label: string): void {
  const record = object(value, label);
  const allowed = ["id", "kind", "label", "uri"];
  for (const key of Object.keys(record)) {
    if (!allowed.includes(key)) throw new Error(`${label} has unexpected fields`);
  }
  for (const key of ["id", "kind", "label"]) string(record[key], `${label}.${key}`);
  if (record.uri !== undefined) string(record.uri, `${label}.uri`);
}

function action(value: unknown, label: string): void {
  const record = object(value, label);
  const keys = ["id", "summary", "policyAction", "expectedObservation", "confidence", "uncertaintyScore"];
  if (Object.hasOwn(record, "openQuestion")) keys.push("openQuestion");
  exact(record, keys, label);
  string(record.id, `${label}.id`);
  string(record.summary, `${label}.summary`);
  string(record.expectedObservation, `${label}.expectedObservation`);
  finite(record.confidence, `${label}.confidence`);
  finite(record.uncertaintyScore, `${label}.uncertaintyScore`);
  if (record.openQuestion !== undefined) string(record.openQuestion, `${label}.openQuestion`);
  const policyAction = object(record.policyAction, `${label}.policyAction`);
  for (const key of ["id", "kind", "summary"]) string(policyAction[key], `${label}.policyAction.${key}`);
}

/**
 * Strict, fail-closed decoder for the durable v1 checkpoint format.
 * It intentionally returns a clone so callers never retain an unvalidated
 * reference to parsed disk state.
 */
export function parseCognitiveRunCheckpointV1(value: unknown): CognitiveRunCheckpointV1 {
  const root = object(value, "checkpoint");
  exact(root, ROOT_KEYS, "checkpoint");
  if (root.schemaVersion !== 1) throw new Error("unsupported cognitive checkpoint schema");
  string(root.runId, "checkpoint.runId");
  if (!RUN_ID_PATTERN.test(root.runId)) throw new Error("checkpoint.runId is invalid");
  for (const key of ["taskId", "workspaceId", "goal"]) string(root[key], `checkpoint.${key}`);
  strings(root.constraints, "checkpoint.constraints");
  if (!STATUS.has(String(root.status))) throw new Error("checkpoint.status is invalid");
  if (!PHASE.has(String(root.phase))) throw new Error("checkpoint.phase is invalid");
  integer(root.revision, "checkpoint.revision");

  const budget = object(root.budget, "checkpoint.budget");
  const budgetKeys = Object.hasOwn(budget, "maxUsd")
    ? ["maxSteps", "maxWallTimeMs", "maxModelTokens", "maxUsd", "stopOnBudgetExceeded"]
    : ["maxSteps", "maxWallTimeMs", "maxModelTokens", "stopOnBudgetExceeded"];
  exact(budget, budgetKeys, "checkpoint.budget");
  integer(budget.maxSteps, "checkpoint.budget.maxSteps", 1);
  finite(budget.maxWallTimeMs, "checkpoint.budget.maxWallTimeMs", 1);
  integer(budget.maxModelTokens, "checkpoint.budget.maxModelTokens");
  if (budget.maxUsd !== undefined) finite(budget.maxUsd, "checkpoint.budget.maxUsd");
  if (budget.stopOnBudgetExceeded !== true) throw new Error("checkpoint budget must stop on exceed");
  usage(root.usage, "checkpoint.usage");

  if (!Array.isArray(root.events)) throw new Error("checkpoint.events must be an array");
  root.events.forEach((entry, index) => {
    const event = object(entry, `checkpoint.events[${index}]`);
    const eventKeys = ["schemaVersion", "id", "runId", "taskId", "sequence", "checkpointRevision", "timestamp", "eventType", "phase", "summary", "evidenceRefs", "usage"];
    if (Object.hasOwn(event, "actionId")) eventKeys.push("actionId");
    if (Object.hasOwn(event, "approvalId")) eventKeys.push("approvalId");
    exact(event, eventKeys, `checkpoint.events[${index}]`);
    if (event.schemaVersion !== 1) throw new Error(`checkpoint.events[${index}].schemaVersion is invalid`);
    for (const key of ["id", "runId", "taskId", "summary"]) string(event[key], `checkpoint.events[${index}].${key}`, key === "summary");
    if (event.runId !== root.runId || event.taskId !== root.taskId) throw new Error("checkpoint event identity mismatch");
    integer(event.sequence, `checkpoint.events[${index}].sequence`, 1);
    integer(event.checkpointRevision, `checkpoint.events[${index}].checkpointRevision`, 1);
    if (event.sequence !== index + 1 || event.checkpointRevision !== index + 1) throw new Error("checkpoint event sequence is not contiguous");
    iso(event.timestamp, `checkpoint.events[${index}].timestamp`);
    if (!EVENT_TYPES.has(String(event.eventType)) || !PHASE.has(String(event.phase))) throw new Error("checkpoint event enum is invalid");
    if (event.actionId !== undefined) string(event.actionId, "checkpoint event actionId");
    if (event.approvalId !== undefined) string(event.approvalId, "checkpoint event approvalId");
    strings(event.evidenceRefs, `checkpoint.events[${index}].evidenceRefs`);
    usage(event.usage, `checkpoint.events[${index}].usage`);
  });
  if (root.events.length !== root.revision) throw new Error("checkpoint revision must equal its event count");

  string(root.observationSummary, "checkpoint.observationSummary", true);
  string(root.summary, "checkpoint.summary", true);
  if (root.learningSummary !== null) string(root.learningSummary, "checkpoint.learningSummary", true);
  for (const [key, validator] of [
    ["memoryHits", (entry: unknown, label: string) => {
      const hit = object(entry, label);
      const keys = Object.hasOwn(hit, "sourceRunId") ? ["id", "kind", "summary", "relevance", "sourceRunId"] : ["id", "kind", "summary", "relevance"];
      exact(hit, keys, label);
      string(hit.id, `${label}.id`); string(hit.summary, `${label}.summary`, true);
      if (!["episodic", "semantic", "procedural"].includes(String(hit.kind))) throw new Error(`${label}.kind is invalid`);
      finite(hit.relevance, `${label}.relevance`);
      if (hit.sourceRunId !== undefined) string(hit.sourceRunId, `${label}.sourceRunId`);
    }],
    ["actionPlans", action],
  ] as const) {
    const entries = root[key];
    if (!Array.isArray(entries)) throw new Error(`checkpoint.${key} must be an array`);
    entries.forEach((entry, index) => validator(entry, `checkpoint.${key}[${index}]`));
  }
  if (root.pendingAction !== null) action(root.pendingAction, "checkpoint.pendingAction");

  if (!Array.isArray(root.actionDecisions)) throw new Error("checkpoint.actionDecisions must be an array");
  root.actionDecisions.forEach((entry, index) => {
    const decision = object(entry, `checkpoint.actionDecisions[${index}]`);
    exact(decision, ["actionId", "decision", "risk", "reasons"], `checkpoint.actionDecisions[${index}]`);
    string(decision.actionId, "decision.actionId");
    if (!["allow", "require_approval", "block"].includes(String(decision.decision))) throw new Error("decision.decision is invalid");
    if (!["low", "medium", "high", "blocked"].includes(String(decision.risk))) throw new Error("decision.risk is invalid");
    strings(decision.reasons, "decision.reasons");
  });

  if (root.approval !== null) {
    const approval = object(root.approval, "checkpoint.approval");
    exact(approval, ["id", "actionId", "nonce", "requestedRevision", "status"], "checkpoint.approval");
    for (const key of ["id", "actionId", "nonce"]) string(approval[key], `checkpoint.approval.${key}`);
    integer(approval.requestedRevision, "checkpoint.approval.requestedRevision", 1);
    if (!["pending", "approved", "rejected", "cancelled"].includes(String(approval.status))) throw new Error("checkpoint.approval.status is invalid");
  }
  if (root.executionAttempt !== null) {
    const attempt = object(root.executionAttempt, "checkpoint.executionAttempt");
    const keys = ["id", "actionId", "idempotencyKey", "status", "preparedRevision"];
    if (Object.hasOwn(attempt, "dispatchedRevision")) keys.push("dispatchedRevision");
    if (Object.hasOwn(attempt, "completedRevision")) keys.push("completedRevision");
    exact(attempt, keys, "checkpoint.executionAttempt");
    for (const key of ["id", "actionId", "idempotencyKey"]) string(attempt[key], `checkpoint.executionAttempt.${key}`);
    if (!["prepared", "dispatched", "completed", "in_doubt"].includes(String(attempt.status))) throw new Error("checkpoint.executionAttempt.status is invalid");
    integer(attempt.preparedRevision, "checkpoint.executionAttempt.preparedRevision", 1);
    if (attempt.dispatchedRevision !== undefined) integer(attempt.dispatchedRevision, "checkpoint.executionAttempt.dispatchedRevision", 1);
    if (attempt.completedRevision !== undefined) integer(attempt.completedRevision, "checkpoint.executionAttempt.completedRevision", 1);
  }

  for (const key of ["gatewayResults", "verifications"] as const) {
    if (!Array.isArray(root[key])) throw new Error(`checkpoint.${key} must be an array`);
  }
  const gatewayResults = root.gatewayResults as unknown[];
  gatewayResults.forEach((entry, index) => {
    const result = object(entry, `checkpoint.gatewayResults[${index}]`);
    exact(result, ["actionId", "observation", "evidence"], `checkpoint.gatewayResults[${index}]`);
    string(result.actionId, "gateway actionId"); string(result.observation, "gateway observation", true);
    if (!Array.isArray(result.evidence)) throw new Error("gateway evidence must be an array");
    result.evidence.forEach((item, itemIndex) => evidence(item, `gateway evidence[${itemIndex}]`));
  });
  const verifications = root.verifications as unknown[];
  verifications.forEach((entry, index) => {
    const verification = object(entry, `checkpoint.verifications[${index}]`);
    exact(verification, ["actionId", "status", "expectedObservation", "actualObservation", "evidence"], `checkpoint.verifications[${index}]`);
    string(verification.actionId, "verification actionId");
    if (!["pass", "fail"].includes(String(verification.status))) throw new Error("verification status is invalid");
    string(verification.expectedObservation, "expected observation", true);
    string(verification.actualObservation, "actual observation", true);
    if (!Array.isArray(verification.evidence)) throw new Error("verification evidence must be an array");
    verification.evidence.forEach((item, itemIndex) => evidence(item, `verification evidence[${itemIndex}]`));
  });
  iso(root.createdAt, "checkpoint.createdAt");
  iso(root.updatedAt, "checkpoint.updatedAt");
  if (Date.parse(root.updatedAt) < Date.parse(root.createdAt)) throw new Error("checkpoint timestamps are reversed");

  if (root.status === "waiting_for_approval") {
    if (!root.pendingAction || !root.approval || (root.approval as Record<string, unknown>).status !== "pending") {
      throw new Error("waiting checkpoint requires a pending action and approval");
    }
    if ((root.approval as Record<string, unknown>).requestedRevision !== root.revision) throw new Error("approval revision mismatch");
  }
  if (root.status === "completed") {
    const finalVerification = verifications.at(-1) as Record<string, unknown> | undefined;
    if (root.pendingAction !== null || verifications.length === 0 || finalVerification?.status !== "pass") {
      throw new Error("completed checkpoint requires final verifier pass and no pending action");
    }
  }
  if (root.status === "execution_in_doubt" && (root.executionAttempt as Record<string, unknown> | null)?.status !== "in_doubt") {
    throw new Error("execution-in-doubt status requires an in-doubt attempt");
  }
  return structuredClone(root) as CognitiveRunCheckpointV1;
}

export function assertCognitiveRunCheckpointV1(value: unknown): asserts value is CognitiveRunCheckpointV1 {
  parseCognitiveRunCheckpointV1(value);
}
