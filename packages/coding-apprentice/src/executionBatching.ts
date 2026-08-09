import { createHash } from "node:crypto";

import {
  canonicalRepositoryTaskPlan,
  validateRepositoryTaskPlan,
  type RepositorySemanticTaskV1,
  type RepositoryTaskPlanV1,
} from "@codepawl/shared";

export type RepositoryExecutionBatchV1 = {
  schemaVersion: 1;
  id: string;
  sourcePlanId: string;
  sourcePlanDigest: string;
  taskIds: string[];
  expectedPaths: string[];
  evidenceMap: Array<{
    sourceTaskId: string;
    sourceEvidenceId: string;
    batchEvidenceId: string;
  }>;
};

export type RepositoryExecutionPlanResolution = {
  plan: RepositoryTaskPlanV1;
  batch?: RepositoryExecutionBatchV1;
};

const MAX_BATCH_TASKS = 6;
const MAX_BATCH_PATHS = 12;

function batchEvidenceId(taskId: string, evidenceId: string): string {
  const candidate = `${taskId}--${evidenceId}`;
  if (candidate.length <= 100) return candidate;
  const suffix = createHash("sha256")
    .update(candidate)
    .digest("hex")
    .slice(0, 12);
  return `${candidate.slice(0, 87)}-${suffix}`;
}

function topologicalTasks(
  plan: RepositoryTaskPlanV1,
): RepositorySemanticTaskV1[] {
  const remaining = new Map(plan.tasks.map((task) => [task.id, task]));
  const ordered: RepositorySemanticTaskV1[] = [];
  const completed = new Set<string>();
  while (remaining.size > 0) {
    const ready = [...remaining.values()].filter((task) =>
      task.dependencies.every((dependency) => completed.has(dependency)),
    );
    if (ready.length === 0) {
      throw new Error("Repository execution batching found a dependency cycle.");
    }
    for (const task of ready) {
      ordered.push(task);
      completed.add(task.id);
      remaining.delete(task.id);
    }
  }
  return ordered;
}

function pathCoveredByWriter(path: string, writerPaths: Set<string>): boolean {
  return [...writerPaths].some(
    (writerPath) =>
      path === writerPath ||
      path.startsWith(`${writerPath}/`) ||
      writerPath.startsWith(`${path}/`),
  );
}

function deterministicReadOnlyTask(
  task: RepositorySemanticTaskV1,
  writerPaths: Set<string>,
): boolean {
  return (
    task.authority === "read_only" &&
    task.operations.length === 1 &&
    task.operations[0] === "read" &&
    task.expectedPaths.length === 0 &&
    (task.readPaths ?? []).every((path) =>
      pathCoveredByWriter(path, writerPaths)
    ) &&
    task.evidence.every((evidence) =>
      ["command", "semantic_review", "operator_review"].includes(evidence.kind) ||
      (
        ["file", "diff", "path_scope"].includes(evidence.kind) &&
        evidence.path !== undefined &&
        pathCoveredByWriter(evidence.path, writerPaths)
      )
    )
  );
}

function batchableWriterTask(task: RepositorySemanticTaskV1): boolean {
  return (
    task.authority === "single_writer" &&
    task.operations.includes("write") &&
    task.operations.every((operation) =>
      operation === "read" || operation === "write"
    )
  );
}

export function deriveRepositoryExecutionPlan(
  source: RepositoryTaskPlanV1,
  options: { disabled?: boolean } = {},
): RepositoryExecutionPlanResolution {
  if (options.disabled) return { plan: source };
  const writers = source.tasks.filter(
    (task) => task.authority === "single_writer",
  );
  const validationTasks = source.tasks.filter(
    (task) => task.authority === "read_only",
  );
  const expectedPaths = [
    ...new Set(writers.flatMap((task) => task.expectedPaths)),
  ].sort((left, right) => left.localeCompare(right));
  const writerPaths = new Set(expectedPaths);
  const eligible =
    writers.length > 0 &&
    writers.length <= MAX_BATCH_TASKS &&
    expectedPaths.length <= MAX_BATCH_PATHS &&
    writers.every(batchableWriterTask) &&
    validationTasks.every((task) =>
      deterministicReadOnlyTask(task, writerPaths)
    ) &&
    source.tasks.length === writers.length + validationTasks.length &&
    (writers.length > 1 || validationTasks.length > 0);
  if (!eligible) return { plan: source };

  const ordered = topologicalTasks(source);
  const taskIds = ordered.map(({ id }) => id);
  const batchId = `batch-${createHash("sha256")
    .update(`${source.digest}:${taskIds.join("\0")}`)
    .digest("hex")
    .slice(0, 12)}`;
  const batchEvidence = ordered.flatMap((task) =>
    task.evidence.map((evidence) => {
      const id = batchEvidenceId(task.id, evidence.id);
      return {
        evidence: {
          ...structuredClone(evidence),
          id,
        },
        mapping: {
          sourceTaskId: task.id,
          sourceEvidenceId: evidence.id,
          batchEvidenceId: id,
        },
      };
    })
  );
  const batchTask: RepositorySemanticTaskV1 = {
    id: batchId,
    title: "Execute bounded repository task batch",
    instruction: [
      "Execute these approved semantic tasks in order inside one model session.",
      "Preserve each task's requirements, done conditions, and exact path ownership.",
      ...ordered.flatMap((task, index) => [
        "",
        `${index + 1}. ${task.id}: ${task.title}`,
        task.instruction,
        ...task.doneWhen.map((condition) => `Done when: ${condition}`),
      ]),
      "",
      "Trusted command evidence is executed by the deterministic verifier after this model session. Do not install dependencies or broaden scope.",
    ].join("\n"),
    kind: "change",
    dependencies: [],
    requirementIds: [
      ...new Set(ordered.flatMap((task) => task.requirementIds)),
    ].sort((left, right) => left.localeCompare(right)),
    authority: "single_writer",
    operations: writers.some((task) => task.operations.includes("read"))
      ? ["read", "write"]
      : ["write"],
    expectedPaths,
    doneWhen: ordered.flatMap((task) =>
      task.doneWhen.map((condition) => `${task.id}: ${condition}`),
    ),
    evidence: batchEvidence.map(({ evidence }) => evidence),
  };
  const plan: RepositoryTaskPlanV1 = {
    ...structuredClone(source),
    tasks: [batchTask],
    digest: "0".repeat(64),
  };
  plan.digest = createHash("sha256")
    .update(canonicalRepositoryTaskPlan(plan))
    .digest("hex");
  validateRepositoryTaskPlan(plan);
  return {
    plan,
    batch: {
      schemaVersion: 1,
      id: batchId,
      sourcePlanId: source.id,
      sourcePlanDigest: source.digest,
      taskIds,
      expectedPaths,
      evidenceMap: batchEvidence.map(({ mapping }) => mapping),
    },
  };
}
