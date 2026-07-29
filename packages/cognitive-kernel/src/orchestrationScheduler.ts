import { createHash } from "node:crypto";

import {
  validateOrchestrationRecoveryTask,
  validateOrchestrationPlan,
  type ModelInvocationRecord,
  type OrchestrationChildTask,
  type OrchestrationPlan,
  type ResolvedOrchestrationProfile,
} from "@codepawl/shared";

export type OrchestrationTaskResult = {
  taskId: string;
  summary: string;
  artifactRefs: string[];
};

export type OrchestrationVerification = {
  passed: boolean;
  summary: string;
  artifactRefs: string[];
};

export type AdaptiveOrchestrationCallbacks = {
  invoke: (input: {
    task: OrchestrationChildTask;
    binding: ResolvedOrchestrationProfile["roles"][OrchestrationChildTask["role"]];
    parentInvocationId?: string;
    signal?: AbortSignal;
  }) => Promise<OrchestrationTaskResult>;
  verify: (input: {
    results: OrchestrationTaskResult[];
    signal?: AbortSignal;
  }) => Promise<OrchestrationVerification>;
  recover?: (input: {
    failedVerification: OrchestrationVerification;
    reviewerResult?: OrchestrationTaskResult;
    attempt: number;
    signal?: AbortSignal;
  }) => Promise<OrchestrationChildTask | undefined>;
  now?: () => string;
};

export type AdaptiveOrchestrationResult = {
  status: "pass" | "fail" | "cancelled";
  verification: OrchestrationVerification;
  results: OrchestrationTaskResult[];
  invocations: ModelInvocationRecord[];
  recoveryAttempts: number;
};

function contextHash(task: OrchestrationChildTask): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        id: task.id,
        role: task.role,
        instruction: task.instruction,
        dependencies: task.dependencies,
        expectedPaths: task.expectedPaths,
      }),
    )
    .digest("hex");
}

function assertNotCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw Object.assign(new Error("orchestration cancelled"), {
      name: "AbortError",
    });
  }
}

function shouldReview(
  profile: ResolvedOrchestrationProfile,
  verification: OrchestrationVerification,
  helperCount: number,
): boolean {
  if (profile.omittedRoles.includes("reviewer")) return false;
  if (profile.reviewerPolicy === "always") return true;
  if (profile.reviewerPolicy === "failure_only") return !verification.passed;
  return !verification.passed || helperCount > 0;
}

export async function runAdaptiveOrchestration(input: {
  plan: OrchestrationPlan;
  profile: ResolvedOrchestrationProfile;
  callbacks: AdaptiveOrchestrationCallbacks;
  signal?: AbortSignal;
}): Promise<AdaptiveOrchestrationResult> {
  validateOrchestrationPlan(input.plan, input.profile);
  const now = input.callbacks.now ?? (() => new Date().toISOString());
  const invocations: ModelInvocationRecord[] = [];
  const results: OrchestrationTaskResult[] = [];
  let invocationSequence = 0;
  let recoveryAttempts = 0;

  const invoke = async (
    task: OrchestrationChildTask,
    retryIndex = 0,
    parentInvocationId?: string,
  ): Promise<OrchestrationTaskResult> => {
    assertNotCancelled(input.signal);
    invocationSequence += 1;
    const id = `${input.plan.runId}-${task.role}-${invocationSequence}`;
    const binding = input.profile.roles[task.role];
    const invocation: ModelInvocationRecord = {
      schemaVersion: 1,
      id,
      runId: input.plan.runId,
      ...(parentInvocationId ? { parentInvocationId } : {}),
      taskId: task.id,
      role: task.role,
      providerId: binding.providerId,
      modelId: binding.modelId,
      thinkingEffort: binding.thinkingEffort,
      contextHash: contextHash(task),
      status: "running",
      inputTokens: null,
      outputTokens: null,
      estimatedCostUsd: null,
      startedAt: now(),
      retryIndex,
      artifactRefs: [],
    };
    invocations.push(invocation);
    try {
      const result = await input.callbacks.invoke({
        task,
        binding,
        ...(parentInvocationId ? { parentInvocationId } : {}),
        signal: input.signal,
      });
      invocation.status = "completed";
      invocation.completedAt = now();
      invocation.artifactRefs = [...result.artifactRefs];
      results.push(result);
      return result;
    } catch (error) {
      invocation.status =
        input.signal?.aborted ||
        (error instanceof Error && error.name === "AbortError")
          ? "cancelled"
          : "failed";
      invocation.completedAt = now();
      throw error;
    }
  };

  try {
    const helpers = input.plan.tasks.filter((task) => task.role === "helper");
    const implementers = input.plan.tasks.filter(
      (task) => task.role === "implementer",
    );
    const reviewers = input.plan.tasks.filter((task) => task.role === "reviewer");
    const pendingHelpers = new Map(helpers.map((task) => [task.id, task]));
    while (pendingHelpers.size > 0) {
      const ready = [...pendingHelpers.values()].filter((task) =>
        task.dependencies.every((dependency) =>
          results.some((result) => result.taskId === dependency),
        ),
      );
      if (ready.length === 0) {
        throw new Error(
          "Read-only helper dependencies cannot be satisfied before implementation.",
        );
      }
      await Promise.all(ready.map((task) => invoke(task)));
      for (const task of ready) pendingHelpers.delete(task.id);
    }
    assertNotCancelled(input.signal);
    for (const task of implementers) {
      const unresolved = task.dependencies.filter(
        (dependency) =>
          !results.some((result) => result.taskId === dependency),
      );
      if (unresolved.length > 0) {
        throw new Error(
          `Implementer task ${task.id} has unresolved dependencies: ${unresolved.join(", ")}`,
        );
      }
      await invoke(task);
    }
    assertNotCancelled(input.signal);
    let verification = await input.callbacks.verify({
      results: [...results],
      signal: input.signal,
    });
    let reviewerResult: OrchestrationTaskResult | undefined;
    if (
      reviewers[0] &&
      shouldReview(input.profile, verification, helpers.length)
    ) {
      reviewerResult = await invoke(reviewers[0]);
    }
    if (
      !verification.passed &&
      input.callbacks.recover &&
      recoveryAttempts < input.profile.maxRecoveryAttempts
    ) {
      assertNotCancelled(input.signal);
      recoveryAttempts += 1;
      const recoveryTask = await input.callbacks.recover({
        failedVerification: verification,
        ...(reviewerResult ? { reviewerResult } : {}),
        attempt: recoveryAttempts,
        signal: input.signal,
      });
      if (recoveryTask) {
        validateOrchestrationRecoveryTask(
          recoveryTask,
          input.plan,
          input.profile,
        );
        assertNotCancelled(input.signal);
        const reviewerInvocationId = reviewerResult
          ? invocations.find(
              (record) => record.taskId === reviewerResult?.taskId,
            )?.id
          : undefined;
        await invoke(recoveryTask, recoveryAttempts, reviewerInvocationId);
        assertNotCancelled(input.signal);
        verification = await input.callbacks.verify({
          results: [...results],
          signal: input.signal,
        });
      }
    }
    return {
      status: verification.passed ? "pass" : "fail",
      verification,
      results,
      invocations,
      recoveryAttempts,
    };
  } catch (error) {
    if (
      input.signal?.aborted ||
      (error instanceof Error && error.name === "AbortError")
    ) {
      return {
        status: "cancelled",
        verification: {
          passed: false,
          summary: "Orchestration cancelled before final verification.",
          artifactRefs: [],
        },
        results,
        invocations,
        recoveryAttempts,
      };
    }
    throw error;
  }
}
