import {
  CognitiveRuntimeV1,
  type CognitiveRunCheckpointV1,
  type CognitiveRuntimeBudgetV1,
  type KernelActionPlan,
  type KernelGatewayResult,
  type KernelMemoryHit,
  type KernelVerification,
} from "@codepawl/cognitive-kernel";
import type { CorePolicy, RunBudget } from "@codepawl/shared";

import { LocalJsonCognitiveCheckpointStore } from "./checkpointStore";

export type RedactedCognitiveRuntimeTrace = Omit<
  CognitiveRunCheckpointV1,
  "approval" | "executionAttempt"
> & {
  approval: null | {
    id: string;
    actionId: string;
    requestedRevision: number;
      status: "pending" | "approved" | "rejected" | "cancelled";
  };
  execution: null | {
    id: string;
    actionId: string;
    status: "prepared" | "dispatched" | "completed" | "in_doubt";
    preparedRevision: number;
    dispatchedRevision?: number;
    completedRevision?: number;
  };
};

export type RepositoryRuntimeExecution = {
  observation: string;
  evidence: KernelGatewayResult["evidence"];
};

export type RepositoryRuntimeRequest = {
  runId: string;
  taskId: string;
  workspaceId: string;
  goal: string;
  constraints: string[];
  budget: RunBudget;
  policy: CorePolicy;
  stateRoot: string;
  memoryHits: KernelMemoryHit[];
  action: KernelActionPlan;
  execute: (input: {
    attemptId: string;
    idempotencyKey: string;
  }) => Promise<RepositoryRuntimeExecution>;
  verify: (input: {
    action: KernelActionPlan;
    execution: RepositoryRuntimeExecution;
  }) => Promise<KernelVerification>;
  learn?: (input: {
    action: KernelActionPlan;
    verification: KernelVerification;
  }) => Promise<{ summary: string; evidenceRefs?: string[] }>;
  authorize?: (input: {
    approvalId: string;
    actionId: string;
    expectedRevision: number;
  }) => Promise<"approved" | "rejected">;
};

export type RepositoryRuntimeResult = {
  checkpoint: CognitiveRunCheckpointV1;
  trace: RedactedCognitiveRuntimeTrace;
};

function runtimeBudget(budget: RunBudget): CognitiveRuntimeBudgetV1 {
  return {
    maxSteps: budget.maxSteps,
    maxWallTimeMs: budget.maxWallTimeMs,
    maxModelTokens: budget.maxModelTokens,
    ...(budget.maxUsd === undefined ? {} : { maxUsd: budget.maxUsd }),
    stopOnBudgetExceeded: true,
  };
}

export function redactCognitiveRuntimeCheckpoint(
  checkpoint: CognitiveRunCheckpointV1,
): RedactedCognitiveRuntimeTrace {
  const { executionAttempt, ...safeCheckpoint } = structuredClone(checkpoint);
  return {
    ...safeCheckpoint,
    approval: checkpoint.approval
      ? {
          id: checkpoint.approval.id,
          actionId: checkpoint.approval.actionId,
          requestedRevision: checkpoint.approval.requestedRevision,
          status: checkpoint.approval.status,
        }
      : null,
    execution: executionAttempt
      ? {
          id: executionAttempt.id,
          actionId: executionAttempt.actionId,
          status: executionAttempt.status,
          preparedRevision: executionAttempt.preparedRevision,
          ...(executionAttempt.dispatchedRevision === undefined
            ? {}
            : { dispatchedRevision: executionAttempt.dispatchedRevision }),
          ...(executionAttempt.completedRevision === undefined
            ? {}
            : { completedRevision: executionAttempt.completedRevision }),
        }
      : null,
  };
}

export async function runRepositoryActionWithCognitiveRuntime(
  request: RepositoryRuntimeRequest,
): Promise<RepositoryRuntimeResult> {
  const checkpointStore = new LocalJsonCognitiveCheckpointStore({
    stateRoot: request.stateRoot,
  });
  let executed: RepositoryRuntimeExecution | undefined;
  let executionError: unknown;
  const runtime = new CognitiveRuntimeV1({
    policy: request.policy,
    checkpointSink: checkpointStore,
    observer: {
      observe: () => ({
        summary: "Repository sandbox and execution contract are ready.",
      }),
    },
    memoryProvider: {
      retrieve: () => ({ hits: request.memoryHits }),
    },
    planner: {
      plan: () => ({ action: request.action }),
    },
    gateway: {
      execute: async ({ action, attemptId, idempotencyKey }) => {
        try {
          const execution = await request.execute({ attemptId, idempotencyKey });
          executed = execution;
          return {
            result: {
              actionId: action.id,
              observation: execution.observation,
              evidence: execution.evidence,
            },
            usage: { toolCalls: 1 },
          };
        } catch (error) {
          executionError = error;
          throw error;
        }
      },
    },
    verifier: {
      verify: async ({ action }) => {
        if (!executed) {
          throw new Error("Repository verifier cannot run before gateway execution.");
        }
        const verification = await request.verify({ action, execution: executed });
        if (verification.actionId !== action.id) {
          throw new Error("Repository verifier returned evidence for a different action.");
        }
        return { verification };
      },
    },
    ...(request.learn
      ? {
          learner: {
            learn: async ({ action, verification }) => {
              if (verification.status !== "pass") {
                throw new Error("Repository learning requires verifier-pass evidence.");
              }
              return request.learn!({ action, verification });
            },
          },
        }
      : {}),
  });

  let checkpoint = await runtime.start({
    runId: request.runId,
    taskId: request.taskId,
    workspaceId: request.workspaceId,
    goal: request.goal,
    constraints: request.constraints,
    budget: runtimeBudget(request.budget),
  });
  if (checkpoint.status === "waiting_for_approval") {
    if (!checkpoint.approval || !request.authorize) {
      throw new Error("Repository execution requires explicit approval.");
    }
    const decision = await request.authorize({
      approvalId: checkpoint.approval.id,
      actionId: checkpoint.approval.actionId,
      expectedRevision: checkpoint.revision,
    });
    checkpoint = await runtime.resume(checkpoint, {
      runId: checkpoint.runId,
      taskId: checkpoint.taskId,
      approvalId: checkpoint.approval.id,
      approvalNonce: checkpoint.approval.nonce,
      expectedRevision: checkpoint.revision,
      decision,
    });
  }
  if (checkpoint.status !== "completed" && checkpoint.status !== "failed") {
    if (checkpoint.status === "execution_in_doubt" && executionError) {
      throw executionError;
    }
    throw new Error(
      `Repository cognitive runtime stopped with status ${checkpoint.status}: ${checkpoint.summary}`,
    );
  }
  return {
    checkpoint,
    trace: redactCognitiveRuntimeCheckpoint(checkpoint),
  };
}
