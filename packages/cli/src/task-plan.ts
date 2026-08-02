import { createHash, randomUUID } from "node:crypto";

import type {
  PromptRequirementV1,
  RepositoryTaskOperation,
  RepositoryTaskPlanV1,
} from "@codepawl/shared";
import {
  canonicalRepositoryTaskPlan,
  validateRepositoryTaskPlan,
} from "@codepawl/shared";

import type { AgentActionOperation, ProposedRepositoryAction } from "./agent.js";

type BoundTaskPlanInput = {
  action: ProposedRepositoryAction;
  prompt: string;
  activeGoal?: string;
  acceptanceCriteria: string[];
  maxModelTokens: number;
  maxWallTimeMs: number;
  maxUsd?: number;
};

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/gu, " ");
}

function sortedUnique(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function mutatingOperations(
  operations: readonly (AgentActionOperation | RepositoryTaskOperation)[],
): string[] {
  return sortedUnique(operations.filter((operation) => operation !== "read"));
}

export function buildBoundRepositoryTaskPlan(
  input: BoundTaskPlanInput,
): RepositoryTaskPlanV1 {
  const candidate = structuredClone(input.action.taskPlan);
  const canonicalRequirements: PromptRequirementV1[] = [
    {
      id: `prompt-${sha256(normalizeText(input.prompt)).slice(0, 16)}`,
      text: normalizeText(input.prompt),
      source: "user_prompt",
      kind: "outcome",
      required: true,
    },
    ...(input.activeGoal?.trim()
      ? [
          {
            id: `goal-${sha256(normalizeText(input.activeGoal)).slice(0, 16)}`,
            text: normalizeText(input.activeGoal),
            source: "active_goal" as const,
            kind: "constraint" as const,
            required: true,
          },
        ]
      : []),
    ...input.acceptanceCriteria.map((criterion) => ({
      id: `criterion-${sha256(normalizeText(criterion)).slice(0, 16)}`,
      text: normalizeText(criterion),
      source: "acceptance_criterion" as const,
      kind: "validation" as const,
      required: true,
    })),
  ];
  const existingIds = new Set(candidate.requirements.map(({ id }) => id));
  for (const requirement of canonicalRequirements) {
    const existing = candidate.requirements.find(
      ({ id }) => id === requirement.id,
    );
    if (
      existing &&
      (normalizeText(existing.text) !== requirement.text ||
        existing.source !== requirement.source ||
        existing.kind !== requirement.kind ||
        existing.required !== requirement.required)
    ) {
      throw new Error(
        "Task plan requirement id collides with trusted prompt traceability.",
      );
    }
  }
  const injected = canonicalRequirements.filter(
    (requirement) => !existingIds.has(requirement.id),
  );
  candidate.requirements.push(...injected);
  for (const requirement of injected) {
    const preferred =
      requirement.source === "acceptance_criterion"
        ? candidate.tasks.filter((task) => task.kind === "validation")
        : candidate.tasks;
    const targets = preferred.length > 0 ? preferred : [candidate.tasks.at(-1)!];
    for (const task of targets) {
      task.requirementIds = sortedUnique([
        ...task.requirementIds,
        requirement.id,
      ]);
      for (const evidence of task.evidence) {
        evidence.requirementIds = sortedUnique([
          ...evidence.requirementIds,
          requirement.id,
        ]);
      }
    }
  }

  const pathEnvelope = sortedUnique(
    candidate.tasks.flatMap((task) =>
      task.authority === "single_writer" ? task.expectedPaths : [],
    ),
  );
  const plan: RepositoryTaskPlanV1 = {
    schemaVersion: 1,
    id: `task-plan-${randomUUID()}`,
    requestId: `task-request-${randomUUID()}`,
    revision: 0,
    goal: input.activeGoal?.trim() || input.prompt.trim(),
    summary: candidate.summary.trim(),
    sourcePromptHash: sha256(input.prompt),
    requirements: candidate.requirements,
    tasks: candidate.tasks,
    pathEnvelope,
    allowedOperations: sortedUnique(
      candidate.allowedOperations,
    ) as RepositoryTaskOperation[],
    budget: {
      maxTasks: 8,
      maxModelTokens: input.maxModelTokens,
      maxWallTimeMs: input.maxWallTimeMs,
      ...(input.maxUsd === undefined ? {} : { maxUsd: input.maxUsd }),
    },
    recovery: { maxAttemptsPerTask: 1 },
    createdAt: new Date().toISOString(),
    digest: "0".repeat(64),
  };
  plan.digest = sha256(canonicalRepositoryTaskPlan(plan));
  validateRepositoryTaskPlan(plan);

  const actionPaths = sortedUnique(input.action.estimatedPaths);
  if (actionPaths.join("\0") !== plan.pathEnvelope.join("\0")) {
    throw new Error(
      "Task plan writer paths do not match the proposed action paths.",
    );
  }
  const taskOperations = mutatingOperations(
    plan.tasks.flatMap((task) => task.operations),
  );
  const actionOperations = mutatingOperations(input.action.operations);
  if (taskOperations.join("\0") !== actionOperations.join("\0")) {
    throw new Error(
      "Task plan operations do not match the proposed action operations.",
    );
  }
  verifyApprovedRepositoryTaskPlan(plan, plan.digest);
  return plan;
}

export function verifyApprovedRepositoryTaskPlan(
  plan: RepositoryTaskPlanV1,
  approvedDigest: string,
): void {
  validateRepositoryTaskPlan(plan);
  if (sha256(canonicalRepositoryTaskPlan(plan)) !== plan.digest) {
    throw new Error(
      "Repository task plan digest does not match its approval material.",
    );
  }
  if (plan.digest !== approvedDigest) {
    throw new Error("Repository task plan changed after approval.");
  }
}
