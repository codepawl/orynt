import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  atomicWriteFileDurable,
  LocalStateError,
  withExclusiveFileLock,
} from "@codepawl/local-state";
import { verifyRepositoryTaskPlanDigest } from "@codepawl/cognitive-kernel";
import type { RepositoryTaskPlanV1 } from "@codepawl/shared";

import {
  RepositoryRunCancelledError,
  runDesktopRepositoryBeta,
  type DesktopRepositoryRunOutput,
  type DesktopRepositoryRunRequest,
} from "./index";

const RUN_ID_PATTERN = /^run-desktop-[a-z0-9]{12}-1$/;

export type DesktopRuntimeStatus =
  | "waiting_for_approval"
  | "running"
  | "completed"
  | "blocked"
  | "failed"
  | "cancelled"
  | "execution_in_doubt";

export type DesktopRuntimeApproval = {
  id: string;
  actionId: string;
  nonce: string;
  requestedRevision: number;
  planId?: string;
  planRevision?: number;
  planDigest?: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
};

export type DesktopRuntimeAttempt = {
  id: string;
  idempotencyKey: string;
  status: "prepared" | "dispatched" | "completed" | "in_doubt";
};

export type DesktopRuntimeCheckpointV2 = {
  schemaVersion: 2;
  runId: string;
  taskId: string;
  status: DesktopRuntimeStatus;
  revision: number;
  approval: DesktopRuntimeApproval | null;
  taskPlan?: RepositoryTaskPlanV1 | null;
  executionAttempt: DesktopRuntimeAttempt | null;
  cancellationRequestedAt: string | null;
  summary: string;
  artifactRoot: string | null;
  artifactManifestPath: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DesktopRuntimeSnapshotV2 = {
  schemaVersion: 2;
  runId: string;
  status: DesktopRuntimeStatus;
  checkpointRevision: number;
  approval: null | Omit<DesktopRuntimeApproval, "nonce">;
  taskPlan: RepositoryTaskPlanV1 | null;
  executionAttemptStatus: DesktopRuntimeAttempt["status"] | null;
  terminal: boolean;
  summary: string;
  artifactRoot: string | null;
  artifactManifestPath: string | null;
  eventCount: number;
  events: DesktopRepositoryRunOutput["events"];
  verificationStatus?: DesktopRepositoryRunOutput["status"];
};

export type DesktopRuntimeStoredRequest = Omit<
  DesktopRepositoryRunRequest,
  "onRunEvent" | "signal" | "postVerificationReview"
>;

type DesktopRuntimeContextV1 = {
  schemaVersion: 1;
  runId: string;
  runIdPrefix: string;
  request: DesktopRuntimeStoredRequest;
  createdAt: string;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function assertCheckpoint(value: unknown): asserts value is DesktopRuntimeCheckpointV2 {
  if (!isObject(value)) throw new Error("desktop runtime checkpoint must be an object");
  if (
    value.schemaVersion !== 2 ||
    typeof value.runId !== "string" ||
    !RUN_ID_PATTERN.test(value.runId) ||
    typeof value.taskId !== "string" ||
    typeof value.status !== "string" ||
    typeof value.revision !== "number" ||
    !Number.isSafeInteger(value.revision) ||
    value.revision < 0 ||
    typeof value.summary !== "string" ||
    typeof value.createdAt !== "string" ||
    typeof value.updatedAt !== "string"
  ) {
    throw new Error("desktop runtime checkpoint schema is invalid");
  }
  const statuses: DesktopRuntimeStatus[] = [
    "waiting_for_approval",
    "running",
    "completed",
    "blocked",
    "failed",
    "cancelled",
    "execution_in_doubt",
  ];
  if (!statuses.includes(value.status as DesktopRuntimeStatus)) {
    throw new Error("desktop runtime checkpoint status is invalid");
  }
}

function assertContext(value: unknown): asserts value is DesktopRuntimeContextV1 {
  if (
    !isObject(value) ||
    value.schemaVersion !== 1 ||
    typeof value.runId !== "string" ||
    !RUN_ID_PATTERN.test(value.runId) ||
    typeof value.runIdPrefix !== "string" ||
    !isObject(value.request) ||
    typeof value.createdAt !== "string"
  ) {
    throw new Error("desktop runtime context schema is invalid");
  }
}

function terminal(status: DesktopRuntimeStatus): boolean {
  return ["completed", "blocked", "failed", "cancelled"].includes(status);
}

function sanitizeRequest(
  request: DesktopRepositoryRunRequest,
): DesktopRuntimeStoredRequest {
  const {
    onRunEvent: _onRunEvent,
    signal: _signal,
    postVerificationReview: _postVerificationReview,
    ...stored
  } = request;
  return structuredClone(stored);
}

function samePaths(left: readonly string[], right: readonly string[]): boolean {
  return [...left].sort().join("\0") === [...right].sort().join("\0");
}

/**
 * Desktop UI never supplies a plan or authorization. Once a trusted planner has
 * bound the candidate, derive the complete execution envelope on the server
 * side and preserve it in the durable context before asking for approval.
 */
function bindDesktopTaskPlan(
  request: DesktopRepositoryRunRequest,
): DesktopRepositoryRunRequest {
  const taskPlan = request.taskPlan;
  if (!taskPlan) {
    throw new Error(
      "desktop runtime requires a trusted task plan before creating an approval checkpoint",
    );
  }
  verifyRepositoryTaskPlanDigest(taskPlan);
  const existing = request.authorization;
  const allowDestructiveChanges = taskPlan.allowedOperations.some(
    (operation) => operation === "delete" || operation === "migration",
  );
  if (
    existing &&
    ((existing.planId !== undefined && existing.planId !== taskPlan.id) ||
      (existing.planRevision !== undefined && existing.planRevision !== taskPlan.revision) ||
      (existing.planDigest !== undefined && existing.planDigest !== taskPlan.digest) ||
      (existing.expectedPaths !== undefined &&
        !samePaths(existing.expectedPaths, taskPlan.pathEnvelope)) ||
      (existing.allowDestructiveChanges !== undefined &&
        existing.allowDestructiveChanges !== allowDestructiveChanges) ||
      existing.allowChangedFileLimitExceeded === true)
  ) {
    throw new Error(
      "desktop runtime received an authorization that does not match the trusted task plan",
    );
  }
  return {
    ...request,
    taskPlan: structuredClone(taskPlan),
    authorization: {
      source: "operator",
      reason: "Desktop operator approval is bound to the immutable repository task plan.",
      expectedPaths: [...taskPlan.pathEnvelope],
      planId: taskPlan.id,
      planRevision: taskPlan.revision,
      planDigest: taskPlan.digest,
      allowDestructiveChanges,
      allowChangedFileLimitExceeded: false,
    },
  };
}

function assertDesktopTaskPlanBinding(input: {
  checkpoint: DesktopRuntimeCheckpointV2;
  request: DesktopRuntimeStoredRequest;
}): void {
  const { checkpoint, request } = input;
  const approvedPlan = checkpoint.taskPlan;
  const storedPlan = request.taskPlan;
  const authorization = request.authorization;
  const approval = checkpoint.approval;
  if (
    !approvedPlan ||
    !storedPlan ||
    !authorization ||
    !approval ||
    approval.planId !== approvedPlan.id ||
    approval.planRevision !== approvedPlan.revision ||
    approval.planDigest !== approvedPlan.digest ||
    storedPlan.id !== approvedPlan.id ||
    storedPlan.revision !== approvedPlan.revision ||
    storedPlan.digest !== approvedPlan.digest ||
    authorization.planId !== approvedPlan.id ||
    authorization.planRevision !== approvedPlan.revision ||
    authorization.planDigest !== approvedPlan.digest ||
    !samePaths(authorization.expectedPaths ?? [], approvedPlan.pathEnvelope)
  ) {
    throw new Error(
      "desktop runtime task-plan approval is stale, missing, or has been tampered with",
    );
  }
  verifyRepositoryTaskPlanDigest(approvedPlan);
  verifyRepositoryTaskPlanDigest(storedPlan);
}

export class DesktopRepositoryRuntimeStore {
  readonly stateRoot: string;

  constructor(options: { stateRoot: string }) {
    this.stateRoot = path.resolve(options.stateRoot);
  }

  runRoot(runId: string): string {
    if (!RUN_ID_PATTERN.test(runId)) throw new Error("desktop runtime runId is invalid");
    return path.join(this.stateRoot, "runs", runId);
  }

  checkpointPath(runId: string): string {
    return path.join(this.runRoot(runId), "checkpoint.json");
  }

  contextPath(runId: string): string {
    return path.join(this.runRoot(runId), "context.json");
  }

  resultPath(runId: string): string {
    return path.join(this.runRoot(runId), "result.json");
  }

  async create(
    checkpoint: DesktopRuntimeCheckpointV2,
    context: DesktopRuntimeContextV1,
  ): Promise<void> {
    assertCheckpoint(checkpoint);
    assertContext(context);
    if (checkpoint.runId !== context.runId) {
      throw new Error("desktop runtime context identity mismatch");
    }
    const checkpointPath = this.checkpointPath(checkpoint.runId);
    await withExclusiveFileLock(checkpointPath, async () => {
      try {
        await readFile(checkpointPath, "utf8");
        throw new LocalStateError(
          "revision_conflict",
          `desktop runtime checkpoint already exists: ${checkpoint.runId}`,
        );
      } catch (error) {
        if (
          !error ||
          typeof error !== "object" ||
          !("code" in error) ||
          error.code !== "ENOENT"
        ) {
          throw error;
        }
      }
      await atomicWriteFileDurable(
        this.contextPath(context.runId),
        `${JSON.stringify(context, null, 2)}\n`,
      );
      await atomicWriteFileDurable(
        checkpointPath,
        `${JSON.stringify(checkpoint, null, 2)}\n`,
      );
    });
  }

  async loadCheckpoint(runId: string): Promise<DesktopRuntimeCheckpointV2> {
    const value: unknown = JSON.parse(
      await readFile(this.checkpointPath(runId), "utf8"),
    );
    assertCheckpoint(value);
    return structuredClone(value);
  }

  async loadContext(runId: string): Promise<DesktopRuntimeContextV1> {
    const value: unknown = JSON.parse(
      await readFile(this.contextPath(runId), "utf8"),
    );
    assertContext(value);
    if (value.runId !== runId) throw new Error("desktop runtime context runId mismatch");
    return structuredClone(value);
  }

  async compareAndSwap(
    next: DesktopRuntimeCheckpointV2,
    expectedRevision: number,
  ): Promise<void> {
    assertCheckpoint(next);
    if (next.revision !== expectedRevision + 1) {
      throw new Error("desktop runtime CAS requires one revision advance");
    }
    const checkpointPath = this.checkpointPath(next.runId);
    await withExclusiveFileLock(checkpointPath, async () => {
      const current = await this.loadCheckpoint(next.runId);
      if (current.revision !== expectedRevision) {
        throw new LocalStateError(
          "revision_conflict",
          `desktop runtime revision conflict: expected ${expectedRevision}, current ${current.revision}`,
        );
      }
      await atomicWriteFileDurable(
        checkpointPath,
        `${JSON.stringify(next, null, 2)}\n`,
      );
    });
  }

  async mutate(
    runId: string,
    expectedRevision: number,
    mutation: (
      current: DesktopRuntimeCheckpointV2,
    ) => DesktopRuntimeCheckpointV2,
  ): Promise<DesktopRuntimeCheckpointV2> {
    const checkpointPath = this.checkpointPath(runId);
    return withExclusiveFileLock(checkpointPath, async () => {
      const current = await this.loadCheckpoint(runId);
      if (current.revision !== expectedRevision) {
        throw new LocalStateError(
          "revision_conflict",
          `desktop runtime revision conflict: expected ${expectedRevision}, current ${current.revision}`,
        );
      }
      const next = mutation(structuredClone(current));
      next.revision = current.revision + 1;
      next.updatedAt = new Date().toISOString();
      assertCheckpoint(next);
      await atomicWriteFileDurable(
        checkpointPath,
        `${JSON.stringify(next, null, 2)}\n`,
      );
      return structuredClone(next);
    });
  }

  async saveResult(
    runId: string,
    result: DesktopRepositoryRunOutput,
  ): Promise<void> {
    await atomicWriteFileDurable(
      this.resultPath(runId),
      `${JSON.stringify(result, null, 2)}\n`,
    );
  }

  async loadResult(
    runId: string,
  ): Promise<DesktopRepositoryRunOutput | undefined> {
    try {
      return JSON.parse(
        await readFile(this.resultPath(runId), "utf8"),
      ) as DesktopRepositoryRunOutput;
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        return undefined;
      }
      throw error;
    }
  }
}

export async function desktopRuntimeSnapshot(
  store: DesktopRepositoryRuntimeStore,
  runId: string,
): Promise<DesktopRuntimeSnapshotV2> {
  const checkpoint = await store.loadCheckpoint(runId);
  const result = await store.loadResult(runId);
  return {
    schemaVersion: 2,
    runId,
    status: checkpoint.status,
    checkpointRevision: checkpoint.revision,
    approval: checkpoint.approval
      ? {
          id: checkpoint.approval.id,
          actionId: checkpoint.approval.actionId,
          requestedRevision: checkpoint.approval.requestedRevision,
          ...(checkpoint.approval.planId
            ? {
                planId: checkpoint.approval.planId,
                planRevision: checkpoint.approval.planRevision,
                planDigest: checkpoint.approval.planDigest,
              }
            : {}),
          status: checkpoint.approval.status,
        }
      : null,
    taskPlan: checkpoint.taskPlan ? structuredClone(checkpoint.taskPlan) : null,
    executionAttemptStatus: checkpoint.executionAttempt?.status ?? null,
    terminal: terminal(checkpoint.status),
    summary: checkpoint.summary,
    artifactRoot: checkpoint.artifactRoot,
    artifactManifestPath: checkpoint.artifactManifestPath,
    eventCount: result?.eventCount ?? 0,
    events: result?.events ?? [],
    ...(result ? { verificationStatus: result.status } : {}),
  };
}

export async function startDesktopRepositoryRuntime(input: {
  request: DesktopRepositoryRunRequest;
  stateRoot: string;
}): Promise<DesktopRuntimeSnapshotV2> {
  const request = bindDesktopTaskPlan(input.request);
  const token = randomUUID().replaceAll("-", "").slice(0, 12);
  const runIdPrefix = `desktop-${token}`;
  const runId = `run-${runIdPrefix}-1`;
  const now = new Date().toISOString();
  const approvalId = `approval-${runId}`;
  const store = new DesktopRepositoryRuntimeStore({
    stateRoot: input.stateRoot,
  });
  await store.create(
    {
      schemaVersion: 2,
      runId,
      taskId: request.taskId,
      status: "waiting_for_approval",
      revision: 0,
      approval: {
        id: approvalId,
        actionId: `repository-action-${runId}`,
        nonce: randomUUID(),
        requestedRevision: 0,
        planId: request.taskPlan!.id,
        planRevision: request.taskPlan!.revision,
        planDigest: request.taskPlan!.digest,
        status: "pending",
      },
      taskPlan: structuredClone(request.taskPlan!),
      executionAttempt: null,
      cancellationRequestedAt: null,
      summary: "Paused for explicit desktop approval before repository execution.",
      artifactRoot: null,
      artifactManifestPath: null,
      createdAt: now,
      updatedAt: now,
    },
    {
      schemaVersion: 1,
      runId,
      runIdPrefix,
      request: sanitizeRequest(request),
      createdAt: now,
    },
  );
  return desktopRuntimeSnapshot(store, runId);
}

async function executePreparedDesktopRuntime(input: {
  store: DesktopRepositoryRuntimeStore;
  checkpoint: DesktopRuntimeCheckpointV2;
  onRunEvent?: DesktopRepositoryRunRequest["onRunEvent"];
}): Promise<DesktopRuntimeSnapshotV2> {
  const { store } = input;
  const context = await store.loadContext(input.checkpoint.runId);
  assertDesktopTaskPlanBinding({
    checkpoint: input.checkpoint,
    request: context.request,
  });
  const dispatched = await store.mutate(
    input.checkpoint.runId,
    input.checkpoint.revision,
    (current) => {
      if (
        current.status !== "running" ||
        current.executionAttempt?.status !== "prepared"
      ) {
        throw new Error("desktop runtime is not prepared for dispatch");
      }
      current.executionAttempt.status = "dispatched";
      current.summary = "Repository execution dispatched.";
      return current;
    },
  );
  const controller = new AbortController();
  const cancellationPoll = setInterval(() => {
    void store
      .loadCheckpoint(dispatched.runId)
      .then((latest) => {
        if (
          latest.status === "execution_in_doubt" ||
          latest.cancellationRequestedAt
        ) {
          controller.abort();
        }
      })
      .catch(() => controller.abort());
  }, 100);
  cancellationPoll.unref?.();
  try {
    const result = await runDesktopRepositoryBeta({
      ...context.request,
      runIdPrefix: context.runIdPrefix,
      signal: controller.signal,
      onRunEvent: input.onRunEvent,
    });
    if (result.runId !== dispatched.runId) {
      throw new Error("desktop repository output runId did not match its durable context");
    }
    await store.saveResult(dispatched.runId, result);
    const latest = await store.loadCheckpoint(dispatched.runId);
    if (latest.status === "execution_in_doubt") {
      return desktopRuntimeSnapshot(store, dispatched.runId);
    }
    await store.mutate(dispatched.runId, latest.revision, (current) => {
      current.status = result.status === "pass" ? "completed" : "failed";
      if (current.executionAttempt) current.executionAttempt.status = "completed";
      current.summary =
        result.status === "pass"
          ? "Repository execution and verification completed."
          : `Repository verification finished with status ${result.status}.`;
      current.artifactRoot = result.artifactRoot;
      current.artifactManifestPath = result.artifactManifestPath;
      return current;
    });
  } catch (error) {
    const latest = await store.loadCheckpoint(dispatched.runId);
    if (latest.status !== "execution_in_doubt") {
      await store.mutate(dispatched.runId, latest.revision, (current) => {
        current.status = "execution_in_doubt";
        if (current.executionAttempt) current.executionAttempt.status = "in_doubt";
        current.summary =
          error instanceof RepositoryRunCancelledError || controller.signal.aborted
            ? "Execution was cancelled after dispatch; partial repository changes require review."
            : "Execution outcome is uncertain because dispatch did not produce durable terminal evidence.";
        return current;
      });
    }
  } finally {
    clearInterval(cancellationPoll);
  }
  return desktopRuntimeSnapshot(store, dispatched.runId);
}

export async function resumeDesktopRepositoryRuntime(input: {
  stateRoot: string;
  runId: string;
  approvalId: string;
  approvalNonce: string;
  expectedRevision: number;
  decision: "approved" | "rejected";
  onRunEvent?: DesktopRepositoryRunRequest["onRunEvent"];
  onReady?: (snapshot: DesktopRuntimeSnapshotV2) => Promise<void> | void;
}): Promise<DesktopRuntimeSnapshotV2> {
  const store = new DesktopRepositoryRuntimeStore({
    stateRoot: input.stateRoot,
  });
  const contextForApproval = await store.loadContext(input.runId);
  const checkpoint = await store.mutate(
    input.runId,
    input.expectedRevision,
    (current) => {
      const approval = current.approval;
      if (
        current.status !== "waiting_for_approval" ||
        !approval ||
        approval.status !== "pending" ||
        approval.id !== input.approvalId ||
        approval.nonce !== input.approvalNonce ||
        approval.requestedRevision !== input.expectedRevision
      ) {
        throw new Error("desktop runtime approval is stale, invalid, or already consumed");
      }
      if (input.decision === "rejected") {
        approval.status = "rejected";
        current.status = "blocked";
        current.summary = "Repository execution was rejected by the operator.";
        return current;
      }
      assertDesktopTaskPlanBinding({
        checkpoint: current,
        request: contextForApproval.request,
      });
      approval.status = "approved";
      current.status = "running";
      current.executionAttempt = {
        id: `attempt-${current.runId}-${current.revision + 1}`,
        idempotencyKey: `desktop-runtime:${current.runId}:repository-action`,
        status: "prepared",
      };
      current.summary = "Approval consumed; repository execution is prepared.";
      return current;
    },
  );
  if (checkpoint.status !== "running") {
    return desktopRuntimeSnapshot(store, input.runId);
  }
  await input.onReady?.(await desktopRuntimeSnapshot(store, input.runId));
  return executePreparedDesktopRuntime({
    store,
    checkpoint,
    onRunEvent: input.onRunEvent,
  });
}

export async function cancelDesktopRepositoryRuntime(input: {
  stateRoot: string;
  runId: string;
  expectedRevision: number;
  reason: string;
}): Promise<DesktopRuntimeSnapshotV2> {
  if (!input.reason.trim()) throw new Error("desktop runtime cancellation reason is required");
  const store = new DesktopRepositoryRuntimeStore({
    stateRoot: input.stateRoot,
  });
  await store.mutate(input.runId, input.expectedRevision, (current) => {
    if (current.status === "waiting_for_approval") {
      if (current.approval?.status === "pending") {
        current.approval.status = "cancelled";
      }
      current.status = "cancelled";
      current.summary = `Cancelled before dispatch: ${input.reason.trim()}`;
      return current;
    }
    if (
      current.status === "running" &&
      current.executionAttempt?.status === "prepared"
    ) {
      current.status = "cancelled";
      current.summary = `Cancelled before dispatch: ${input.reason.trim()}`;
      return current;
    }
    if (
      current.status === "running" &&
      current.executionAttempt?.status === "dispatched"
    ) {
      current.status = "execution_in_doubt";
      current.executionAttempt.status = "in_doubt";
      current.cancellationRequestedAt = new Date().toISOString();
      current.summary =
        "Cancellation requested after dispatch; partial repository changes require review.";
      return current;
    }
    throw new Error("desktop runtime checkpoint cannot be cancelled");
  });
  return desktopRuntimeSnapshot(store, input.runId);
}

export async function recoverDesktopRepositoryRuntime(input: {
  stateRoot: string;
  runId: string;
  expectedRevision: number;
  onRunEvent?: DesktopRepositoryRunRequest["onRunEvent"];
}): Promise<DesktopRuntimeSnapshotV2> {
  const store = new DesktopRepositoryRuntimeStore({
    stateRoot: input.stateRoot,
  });
  const checkpoint = await store.loadCheckpoint(input.runId);
  if (checkpoint.revision !== input.expectedRevision) {
    throw new LocalStateError(
      "revision_conflict",
      `desktop runtime revision conflict: expected ${input.expectedRevision}, current ${checkpoint.revision}`,
    );
  }
  if (
    checkpoint.status === "running" &&
    checkpoint.executionAttempt?.status === "prepared"
  ) {
    return executePreparedDesktopRuntime({
      store,
      checkpoint,
      onRunEvent: input.onRunEvent,
    });
  }
  if (
    checkpoint.status === "running" &&
    checkpoint.executionAttempt?.status === "dispatched"
  ) {
    await store.mutate(input.runId, input.expectedRevision, (current) => {
      current.status = "execution_in_doubt";
      if (current.executionAttempt) current.executionAttempt.status = "in_doubt";
      current.summary =
        "Recovered a dispatched operation without durable terminal evidence.";
      return current;
    });
  } else if (
    checkpoint.status !== "waiting_for_approval" &&
    checkpoint.status !== "execution_in_doubt"
  ) {
    throw new Error("desktop runtime checkpoint is not recoverable");
  }
  return desktopRuntimeSnapshot(store, input.runId);
}

export async function markDesktopRepositoryRuntimeFailed(input: {
  stateRoot: string;
  runId: string;
  expectedRevision: number;
  reason: string;
}): Promise<DesktopRuntimeSnapshotV2> {
  if (!input.reason.trim()) throw new Error("mark-failed reason is required");
  const store = new DesktopRepositoryRuntimeStore({
    stateRoot: input.stateRoot,
  });
  await store.mutate(input.runId, input.expectedRevision, (current) => {
    if (current.status !== "execution_in_doubt") {
      throw new Error("only execution-in-doubt can be marked failed");
    }
    current.status = "failed";
    current.summary = `Marked failed by the operator: ${input.reason.trim()}`;
    return current;
  });
  return desktopRuntimeSnapshot(store, input.runId);
}
