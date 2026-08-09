import { createHash, randomUUID } from "node:crypto";

import {
  canonicalRepositoryTaskPlan,
  validateRepositoryRequirementCoverage,
  validateRepositoryTaskExecutionRecord,
  validateRepositoryTaskFailure,
  validateRepositoryTaskPlan,
  validateRepositoryTaskResult,
  type PromptRequirementV1,
  type RepositoryRequirementCoverageV1,
  type RepositorySemanticTaskV1,
  type RepositoryTaskExecutionRecordV1,
  type RepositoryTaskFailureV1,
  type RepositoryTaskOperation,
  type RepositoryTaskPlanV1,
  type RepositoryTaskResultV1,
} from "@codepawl/shared";

export type {
  RepositoryRequirementCoverageV1,
  RepositoryTaskFailureV1,
  RepositoryTaskResultV1,
} from "@codepawl/shared";

export type RepositoryTaskPlanCandidate = {
  summary: string;
  requirements: PromptRequirementV1[];
  tasks: RepositorySemanticTaskV1[];
  allowedOperations: RepositoryTaskOperation[];
};

export type RepositoryTaskPlanBuildInput = {
  requestId?: string;
  goal: string;
  sourcePrompt: string;
  candidate: RepositoryTaskPlanCandidate;
  maxModelTokens: number;
  maxWallTimeMs: number;
  maxUsd?: number;
  maxRecoveryAttempts?: 0 | 1;
  now?: () => string;
};

/**
 * Typed task-runtime failure. Runtime adapters must use this for a failed
 * task attempt; arbitrary thrown errors are treated as programmer errors and
 * deliberately remain visible to the caller.
 */
export class RepositoryTaskExecutionError extends Error {
  readonly failure: RepositoryTaskFailureV1;

  constructor(failure: RepositoryTaskFailureV1) {
    validateRepositoryTaskFailure(failure);
    super(failure.message);
    this.name = "RepositoryTaskExecutionError";
    this.failure = structuredClone(failure);
  }
}

export type RepositoryTaskPlanCallbacks = {
  invoke: (input: {
    plan: RepositoryTaskPlanV1;
    task: RepositorySemanticTaskV1;
    dependencyResults: RepositoryTaskResultV1[];
    attemptId: string;
    retryIndex: number;
    signal?: AbortSignal;
  }) => Promise<RepositoryTaskResultV1>;
  verifyCoverage: (input: {
    plan: RepositoryTaskPlanV1;
    results: RepositoryTaskResultV1[];
    signal?: AbortSignal;
  }) => Promise<RepositoryRequirementCoverageV1>;
  shouldRetry?: (input: {
    plan: RepositoryTaskPlanV1;
    task: RepositorySemanticTaskV1;
    execution: RepositoryTaskExecutionRecordV1;
    failure: RepositoryTaskFailureV1;
    retryIndex: number;
    signal?: AbortSignal;
  }) => boolean | Promise<boolean>;
  now?: () => string;
};

export type RepositoryTaskPlanRunResult = {
  status: "pass" | "fail" | "cancelled";
  results: RepositoryTaskResultV1[];
  executions: RepositoryTaskExecutionRecordV1[];
  coverage: RepositoryRequirementCoverageV1;
  failure?: RepositoryTaskFailureV1;
  failedTaskId?: string;
};

type InvocationOutcome =
  | { status: "completed"; result: RepositoryTaskResultV1 }
  | { status: "failed"; failure: RepositoryTaskFailureV1 }
  | { status: "cancelled" };

const DEFAULT_READ_ONLY_CONCURRENCY = 2;

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) =>
    left.localeCompare(right),
  );
}

export function buildRepositoryTaskPlan(
  input: RepositoryTaskPlanBuildInput,
): RepositoryTaskPlanV1 {
  const pathEnvelope = uniqueSorted(
    input.candidate.tasks.flatMap((task) =>
      task.authority === "single_writer" ? task.expectedPaths : [],
    ),
  );
  const plan: RepositoryTaskPlanV1 = {
    schemaVersion: 1,
    id: "task-plan-" + randomUUID(),
    requestId: input.requestId ?? "task-request-" + randomUUID(),
    revision: 0,
    goal: input.goal.trim(),
    summary: input.candidate.summary.trim(),
    sourcePromptHash: sha256(input.sourcePrompt),
    requirements: structuredClone(input.candidate.requirements),
    tasks: structuredClone(input.candidate.tasks),
    pathEnvelope,
    allowedOperations: uniqueSorted(
      input.candidate.allowedOperations,
    ) as RepositoryTaskOperation[],
    budget: {
      maxTasks: 8,
      maxModelTokens: input.maxModelTokens,
      maxWallTimeMs: input.maxWallTimeMs,
      ...(input.maxUsd === undefined ? {} : { maxUsd: input.maxUsd }),
    },
    recovery: {
      maxAttemptsPerTask: input.maxRecoveryAttempts ?? 1,
    },
    createdAt: (input.now ?? (() => new Date().toISOString()))(),
    digest: "0".repeat(64),
  };
  plan.digest = sha256(canonicalRepositoryTaskPlan(plan));
  validateRepositoryTaskPlan(plan);
  return plan;
}

export function verifyRepositoryTaskPlanDigest(
  plan: RepositoryTaskPlanV1,
): void {
  validateRepositoryTaskPlan(plan);
  const expected = sha256(canonicalRepositoryTaskPlan(plan));
  if (expected !== plan.digest) {
    throw new Error(
      "Repository task plan digest does not match its approval material.",
    );
  }
}

function abortError(): Error {
  return Object.assign(new Error("repository task plan cancelled"), {
    name: "AbortError",
  });
}

function assertNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError();
}

function isAbort(error: unknown, signal?: AbortSignal): boolean {
  return (
    signal?.aborted === true ||
    (error instanceof Error && error.name === "AbortError")
  );
}

function orderedResults(
  plan: RepositoryTaskPlanV1,
  resultsByTask: Map<string, RepositoryTaskResultV1>,
): RepositoryTaskResultV1[] {
  return plan.tasks.flatMap((task) => {
    const result = resultsByTask.get(task.id);
    return result ? [result] : [];
  });
}

function executionRecord(input: {
  plan: RepositoryTaskPlanV1;
  task: RepositorySemanticTaskV1;
  attemptId: string;
  retryIndex: number;
  startedAt: string;
}): RepositoryTaskExecutionRecordV1 {
  return {
    schemaVersion: 1,
    planId: input.plan.id,
    planRevision: input.plan.revision,
    planDigest: input.plan.digest,
    taskId: input.task.id,
    attemptId: input.attemptId,
    retryIndex: input.retryIndex,
    status: "running",
    startedAt: input.startedAt,
    artifactRefs: [],
  };
}

function actualEvidence(
  plan: RepositoryTaskPlanV1,
  results: RepositoryTaskResultV1[],
): Map<string, Array<{ taskId: string; evidenceId: string; artifactRefs: string[] }>> {
  const byRequirement = new Map<
    string,
    Array<{ taskId: string; evidenceId: string; artifactRefs: string[] }>
  >();
  for (const requirement of plan.requirements) {
    byRequirement.set(requirement.id, []);
  }
  for (const result of results) {
    for (const evidence of result.evidence) {
      for (const requirementId of evidence.requirementIds) {
        byRequirement.get(requirementId)?.push({
          taskId: result.taskId,
          evidenceId: evidence.id,
          artifactRefs: evidence.artifactRefs,
        });
      }
    }
  }
  return byRequirement;
}

function incompleteCoverage(input: {
  plan: RepositoryTaskPlanV1;
  results: RepositoryTaskResultV1[];
  summary: string;
  artifactRefs?: string[];
}): RepositoryRequirementCoverageV1 {
  const byRequirement = actualEvidence(input.plan, input.results);
  const records = input.plan.requirements.map((requirement) => {
    const evidence = byRequirement.get(requirement.id) ?? [];
    return {
      requirementId: requirement.id,
      status: evidence.length > 0 ? ("covered" as const) : ("missing" as const),
      summary:
        evidence.length > 0
          ? "Evidence was recorded before task-plan termination."
          : "No completed task recorded evidence for this requirement.",
      evidence: evidence.map(({ taskId, evidenceId }) => ({
        taskId,
        evidenceId,
      })),
      artifactRefs: uniqueSorted(
        evidence.flatMap((item) => item.artifactRefs),
      ),
    };
  });
  const coveredRequirementIds = records
    .filter((record) => record.status === "covered")
    .map((record) => record.requirementId);
  const missingRequirementIds = records
    .filter((record) => record.status !== "covered")
    .map((record) => record.requirementId);
  return {
    schemaVersion: 1,
    passed: false,
    coveredRequirementIds: uniqueSorted(coveredRequirementIds),
    missingRequirementIds: uniqueSorted(missingRequirementIds),
    records,
    summary: input.summary,
    artifactRefs: uniqueSorted(input.artifactRefs ?? []),
  };
}

function normalizeCoverage(input: {
  plan: RepositoryTaskPlanV1;
  results: RepositoryTaskResultV1[];
  coverage: RepositoryRequirementCoverageV1;
}): RepositoryRequirementCoverageV1 {
  const actual = actualEvidence(input.plan, input.results);
  let adjusted = !input.coverage.passed;
  const records = input.coverage.records.map((record) => {
    const actualKeys = new Set(
      (actual.get(record.requirementId) ?? []).map(
        (item) => item.taskId + "\0" + item.evidenceId,
      ),
    );
    const allActual = record.evidence.every(
      (item) => actualKeys.has(item.taskId + "\0" + item.evidenceId),
    );
    if (record.status === "covered" && (record.evidence.length === 0 || !allActual)) {
      adjusted = true;
      return {
        ...record,
        status: "missing" as const,
        summary: "Coverage referenced evidence that was not recorded by a completed task.",
        evidence: [],
        artifactRefs: [],
      };
    }
    return record;
  });
  const coveredRequirementIds = records
    .filter((record) => record.status === "covered")
    .map((record) => record.requirementId);
  const missingRequirementIds = records
    .filter((record) => record.status !== "covered")
    .map((record) => record.requirementId);
  if (
    input.plan.requirements.some(
      (requirement) =>
        requirement.required && !coveredRequirementIds.includes(requirement.id),
    )
  ) {
    adjusted = true;
  }
  return {
    ...input.coverage,
    passed: adjusted ? false : input.coverage.passed,
    coveredRequirementIds: uniqueSorted(coveredRequirementIds),
    missingRequirementIds: uniqueSorted(missingRequirementIds),
    records,
  };
}

function pendingRecords(input: {
  pending: Map<string, RepositorySemanticTaskV1>;
  executions: RepositoryTaskExecutionRecordV1[];
  plan: RepositoryTaskPlanV1;
  status: "blocked" | "cancelled";
  summary: string;
  now: () => string;
}): void {
  for (const task of input.pending.values()) {
    if (input.executions.some((record) => record.taskId === task.id)) {
      continue;
    }
    const record: RepositoryTaskExecutionRecordV1 = {
      schemaVersion: 1,
      planId: input.plan.id,
      planRevision: input.plan.revision,
      planDigest: input.plan.digest,
      taskId: task.id,
      attemptId: task.id + "-not-dispatched",
      retryIndex: 0,
      status: input.status,
      completedAt: input.now(),
      summary: input.summary,
      artifactRefs: [],
    };
    validateRepositoryTaskExecutionRecord(input.plan, record);
    input.executions.push(record);
  }
}

export async function runRepositoryTaskPlan(input: {
  plan: RepositoryTaskPlanV1;
  callbacks: RepositoryTaskPlanCallbacks;
  signal?: AbortSignal;
  maxReadOnlyConcurrency?: number;
}): Promise<RepositoryTaskPlanRunResult> {
  verifyRepositoryTaskPlanDigest(input.plan);
  const maxReadOnlyConcurrency =
    input.maxReadOnlyConcurrency ?? DEFAULT_READ_ONLY_CONCURRENCY;
  if (
    !Number.isSafeInteger(maxReadOnlyConcurrency) ||
    maxReadOnlyConcurrency < 1 ||
    maxReadOnlyConcurrency > 8
  ) {
    throw new Error("Repository read-only task concurrency must be between one and eight.");
  }

  const now = input.callbacks.now ?? (() => new Date().toISOString());
  const pending = new Map(
    input.plan.tasks.map((task) => [task.id, task] as const),
  );
  const resultsByTask = new Map<string, RepositoryTaskResultV1>();
  const executions: RepositoryTaskExecutionRecordV1[] = [];

  const invoke = async (
    task: RepositorySemanticTaskV1,
  ): Promise<InvocationOutcome> => {
    for (
      let retryIndex = 0;
      retryIndex <= input.plan.recovery.maxAttemptsPerTask;
      retryIndex += 1
    ) {
      assertNotAborted(input.signal);
      const attemptId = task.id + "-attempt-" + randomUUID();
      const execution = executionRecord({
        plan: input.plan,
        task,
        attemptId,
        retryIndex,
        startedAt: now(),
      });
      executions.push(execution);
      try {
        const dependencyResults = task.dependencies.map((dependency) => {
          const result = resultsByTask.get(dependency);
          if (!result) {
            throw new Error(
              "Repository task " + task.id + " has an unresolved dependency.",
            );
          }
          return result;
        });
        const result = await input.callbacks.invoke({
          plan: input.plan,
          task,
          dependencyResults,
          attemptId,
          retryIndex,
          signal: input.signal,
        });
        assertNotAborted(input.signal);
        validateRepositoryTaskResult(input.plan, task, result);
        execution.status = "completed";
        execution.completedAt = now();
        execution.summary = result.summary;
        execution.artifactRefs = [...result.artifactRefs];
        execution.evidence = structuredClone(result.evidence);
        execution.changedPaths = [...result.changedPaths];
        validateRepositoryTaskExecutionRecord(input.plan, execution);
        resultsByTask.set(task.id, result);
        return { status: "completed", result };
      } catch (error) {
        if (isAbort(error, input.signal)) {
          execution.status = "cancelled";
          execution.completedAt = now();
          execution.summary = "Task attempt cancelled.";
          validateRepositoryTaskExecutionRecord(input.plan, execution);
          return { status: "cancelled" };
        }
        if (!(error instanceof RepositoryTaskExecutionError)) {
          throw error;
        }
        const failure = structuredClone(error.failure);
        execution.status = "failed";
        execution.completedAt = now();
        execution.summary = failure.message;
        execution.artifactRefs = uniqueSorted(failure.artifactRefs);
        execution.failure = failure;
        validateRepositoryTaskExecutionRecord(input.plan, execution);
        const retryAllowed =
          failure.retryable &&
          retryIndex < input.plan.recovery.maxAttemptsPerTask &&
          (input.callbacks.shouldRetry
            ? await input.callbacks.shouldRetry({
                plan: input.plan,
                task,
                execution,
                failure,
                retryIndex,
                signal: input.signal,
              })
            : true);
        if (retryAllowed) {
          continue;
        }
        return { status: "failed", failure };
      }
    }
    throw new Error("Repository task retry loop terminated unexpectedly.");
  };

  const failedResult = (
    task: RepositorySemanticTaskV1,
    failure: RepositoryTaskFailureV1,
  ): RepositoryTaskPlanRunResult => {
    pendingRecords({
      pending,
      executions,
      plan: input.plan,
      status: "blocked",
      summary: "Blocked by a failed task dependency.",
      now,
    });
    const results = orderedResults(input.plan, resultsByTask);
    return {
      status: "fail",
      results,
      executions,
      coverage: incompleteCoverage({
        plan: input.plan,
        results,
        summary: "Task plan failed before final requirement verification.",
        artifactRefs: failure.artifactRefs,
      }),
      failure,
      failedTaskId: task.id,
    };
  };

  const cancelledResult = (): RepositoryTaskPlanRunResult => {
    pendingRecords({
      pending,
      executions,
      plan: input.plan,
      status: "cancelled",
      summary: "Task plan cancelled before dispatch.",
      now,
    });
    const results = orderedResults(input.plan, resultsByTask);
    return {
      status: "cancelled",
      results,
      executions,
      coverage: incompleteCoverage({
        plan: input.plan,
        results,
        summary: "Task plan cancelled before final requirement verification.",
      }),
    };
  };

  try {
    while (pending.size > 0) {
      assertNotAborted(input.signal);
      const ready = [...pending.values()].filter((task) =>
        task.dependencies.every((dependency) => resultsByTask.has(dependency)),
      );
      if (ready.length === 0) {
        throw new Error(
          "Repository task graph cannot make progress with its dependencies.",
        );
      }
      const readyReadOnly = ready
        .filter((task) => task.authority === "read_only")
        .slice(0, maxReadOnlyConcurrency);
      if (readyReadOnly.length > 0) {
        const settled = await Promise.allSettled(
          readyReadOnly.map((task) => invoke(task)),
        );
        const rejected = settled.find(
          (entry): entry is PromiseRejectedResult =>
            entry.status === "rejected",
        );
        if (rejected) throw rejected.reason;
        const outcomes = settled.map(
          (entry) => (entry as PromiseFulfilledResult<InvocationOutcome>).value,
        );
        for (let index = 0; index < outcomes.length; index += 1) {
          const task = readyReadOnly[index]!;
          const outcome = outcomes[index]!;
          if (outcome.status === "completed") {
            pending.delete(task.id);
            continue;
          }
          if (outcome.status === "cancelled") {
            return cancelledResult();
          }
          return failedResult(task, outcome.failure);
        }
        continue;
      }
      const writer = ready.find((task) => task.authority === "single_writer");
      if (!writer) {
        throw new Error("Repository task graph has no dispatchable task.");
      }
      const outcome = await invoke(writer);
      if (outcome.status === "completed") {
        pending.delete(writer.id);
        continue;
      }
      if (outcome.status === "cancelled") {
        return cancelledResult();
      }
      return failedResult(writer, outcome.failure);
    }

    assertNotAborted(input.signal);
    const results = orderedResults(input.plan, resultsByTask);
    const callbackCoverage = await input.callbacks.verifyCoverage({
      plan: input.plan,
      results,
      signal: input.signal,
    });
    validateRepositoryRequirementCoverage(input.plan, callbackCoverage);
    const coverage = normalizeCoverage({
      plan: input.plan,
      results,
      coverage: callbackCoverage,
    });
    validateRepositoryRequirementCoverage(input.plan, coverage);
    if (!coverage.passed) {
      return {
        status: "fail",
        results,
        executions,
        coverage,
        failure: {
          kind: "verification",
          message: coverage.summary,
          retryable: false,
          artifactRefs: [...coverage.artifactRefs],
        },
      };
    }
    return {
      status: "pass",
      results,
      executions,
      coverage,
    };
  } catch (error) {
    if (isAbort(error, input.signal)) {
      return cancelledResult();
    }
    throw error;
  }
}
