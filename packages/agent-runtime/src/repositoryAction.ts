import { createHash, randomUUID } from "node:crypto";
import path from "node:path";

import {
  canonicalRepositoryTaskPlan,
  hashPromptUnderstandingBasis,
  promptRequirementsFromUnderstanding,
  validatePromptUnderstandingV1,
  validateRepositoryTaskPlan,
  type PromptRequirementV1,
  type PromptUnderstandingBasisV1,
  type PromptUnderstandingV1,
  type RepositorySemanticTaskV1,
  type RepositoryTaskOperation,
  type RepositoryTaskPlanV1,
} from "@codepawl/shared";

export type AgentActionOperation =
  | "read" | "write" | "delete" | "rename" | "dependency" | "migration"
  | "network" | "host" | "privileged" | "secret" | "unknown";

export type ProposedRepositoryAction = {
  instruction: string;
  rationale: string;
  operations: AgentActionOperation[];
  estimatedPaths: string[];
  estimatedChangedFiles: number;
  helperTasks: Array<{
    id: string;
    title: string;
    instruction: string;
    expectedPaths: string[];
  }>;
  taskPlan: {
    summary: string;
    requirements: PromptRequirementV1[];
    tasks: RepositorySemanticTaskV1[];
    allowedOperations: RepositoryTaskOperation[];
  };
};

export type AgentActionAuthorization = {
  decision: "auto_allowed" | "approval_required" | "takeover_required";
  risk: "low" | "high" | "blocked";
  reasons: string[];
};

export type BoundTaskPlanInput = {
  action: ProposedRepositoryAction;
  prompt: string;
  activeGoal?: string;
  acceptanceCriteria: string[];
  promptUnderstandingBasis?: PromptUnderstandingBasisV1;
  promptUnderstanding?: PromptUnderstandingV1;
  maxModelTokens: number;
  maxWallTimeMs: number;
  maxUsd?: number;
};

const MAX_AUTO_CHANGED_FILES = 12;
const TAKEOVER_OPERATION = new Set<AgentActionOperation>([
  "network", "host", "privileged", "secret",
]);
const REVIEW_OPERATION = new Set<AgentActionOperation>([
  "delete", "rename", "dependency", "migration", "unknown",
]);
const TAKEOVER_TEXT =
  /\b(sudo|root user|outside (?:the )?repo|outside (?:the )?repository|host filesystem|personal (?:computer|machine)|credential|secret|password|api[-_ ]?key|token|git push|rm\s+-rf|curl|wget)\b/i;
const NEGATED_TAKEOVER_TEXT =
  /\b(?:do not|don't|never|must not|without|avoid|no)\b[^.!?\n]{0,120}\b(?:sudo|root user|outside (?:the )?repo|outside (?:the )?repository|host filesystem|personal (?:computer|machine)|credential|secret|password|api[-_ ]?key|token|git push|rm\s+-rf|curl|wget)\b/i;
const REVIEW_TEXT =
  /\b(delete|remove|rename|migrat|install|dependency|dependencies|lockfile|lock file|large refactor|broad change|xóa|xoá|cài đặt|phụ thuộc|di chuyển)\b/i;
const HARD_PROTECTED_PATH =
  /(^|\/)(?:\.git|\.env(?:\..*)?|[^/]*(?:secret|credential)[^/]*)($|\/)/i;
const REVIEW_PATH =
  /(^|\/)(?:package\.json|Cargo\.toml|pyproject\.toml|bun-lock\.yaml|package-lock\.json|yarn\.lock|bun\.lockb?|Cargo\.lock|\.codex)(?:$|\/)/i;
const AMBIGUOUS_PATH = /[*?[\]{}]/u;
const EXTENSIONLESS_FILE_NAMES = new Set([
  "Dockerfile", "LICENSE", "Makefile", "Procfile", "README",
]);

function normalizeAgentPath(value: string): string {
  return value.trim().replaceAll("\\", "/").replace(/^\.\//, "");
}

function requestsTakeoverCapability(text: string): boolean {
  return text
    .split(/(?:[.!?\n]+|\bbut\b|\bhowever\b)/iu)
    .map((segment) => segment.trim())
    .filter(Boolean)
    .some(
      (segment) =>
        TAKEOVER_TEXT.test(segment) && !NEGATED_TAKEOVER_TEXT.test(segment),
    );
}

function unsafePath(value: string): boolean {
  const normalized = normalizeAgentPath(value);
  return (
    path.isAbsolute(normalized) ||
    /^[a-z]:\//i.test(normalized) ||
    normalized.startsWith("//") ||
    normalized.split("/").includes("..")
  );
}

function looksLikeConcreteFilePath(value: string): boolean {
  const normalized = normalizeAgentPath(value);
  const baseName = path.posix.basename(normalized);
  return (
    !normalized.endsWith("/") &&
    normalized.length > 0 &&
    (baseName.includes(".") || EXTENSIONLESS_FILE_NAMES.has(baseName))
  );
}

export function evaluateAgentAction(
  action: ProposedRepositoryAction,
): AgentActionAuthorization {
  const text = `${action.instruction}\n${action.rationale}`;
  const estimatedPaths = action.estimatedPaths.map(normalizeAgentPath);
  const takeoverReasons: string[] = [];
  const reviewReasons: string[] = [];
  if (action.operations.some((operation) => TAKEOVER_OPERATION.has(operation))) {
    takeoverReasons.push("The requested capability reaches host, network, privileged, or secret access.");
  }
  if (requestsTakeoverCapability(text)) {
    takeoverReasons.push("The action text requests a capability outside the repository-only runtime.");
  }
  if (estimatedPaths.some((filePath) => unsafePath(filePath))) {
    takeoverReasons.push("The proposed action includes an absolute or outside-repository path.");
  }
  if (estimatedPaths.some((filePath) => HARD_PROTECTED_PATH.test(filePath))) {
    takeoverReasons.push("The proposed action includes a hard-protected path.");
  }
  if (takeoverReasons.length > 0) {
    return {
      decision: "takeover_required",
      risk: "blocked",
      reasons: [...new Set(takeoverReasons)],
    };
  }

  if (action.operations.some((operation) => REVIEW_OPERATION.has(operation))) {
    reviewReasons.push("The action includes deletion, rename, dependency, migration, or unknown operations.");
  }
  if (REVIEW_TEXT.test(text)) {
    reviewReasons.push("The action text describes a broad or environment-changing operation.");
  }
  if (action.estimatedChangedFiles > MAX_AUTO_CHANGED_FILES) {
    reviewReasons.push(
      `The estimated change exceeds the ${MAX_AUTO_CHANGED_FILES}-file automatic limit.`,
    );
  }
  if (action.operations.length !== 1 || action.operations[0] !== "write") {
    reviewReasons.push("Automatic execution requires a write-only operation declaration.");
  }
  const uniquePaths = [...new Set(estimatedPaths)];
  if (
    action.estimatedChangedFiles < 1 ||
    uniquePaths.length === 0 ||
    action.estimatedChangedFiles !== uniquePaths.length
  ) {
    reviewReasons.push("A repository action must declare one exact file path per estimated change.");
  }
  if (estimatedPaths.some((filePath) => AMBIGUOUS_PATH.test(filePath))) {
    reviewReasons.push("The proposed action includes wildcard or ambiguous paths.");
  }
  if (estimatedPaths.some((filePath) => !looksLikeConcreteFilePath(filePath))) {
    reviewReasons.push("The proposed action includes a directory or non-canonical file path.");
  }
  if (estimatedPaths.some((filePath) => REVIEW_PATH.test(filePath))) {
    reviewReasons.push("The proposed action includes dependency metadata or managed runtime state.");
  }
  if (reviewReasons.length > 0) {
    return {
      decision: "approval_required",
      risk: "high",
      reasons: [...new Set(reviewReasons)],
    };
  }
  return {
    decision: "auto_allowed",
    risk: "low",
    reasons: [
      "The action is scoped to the repository sandbox and stays within automatic change limits.",
    ],
  };
}

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
  if (
    (input.promptUnderstandingBasis !== undefined ||
      input.promptUnderstanding !== undefined) &&
    (input.promptUnderstandingBasis === undefined ||
      input.promptUnderstanding === undefined)
  ) {
    throw new Error(
      "A repository task plan requires both the prompt basis and understanding result.",
    );
  }
  if (
    input.promptUnderstanding &&
    (input.promptUnderstanding.outcome !== "repository_action" ||
      input.promptUnderstanding.readiness !== "ready")
  ) {
    throw new Error("A repository task plan requires ready prompt understanding.");
  }
  if (
    input.promptUnderstandingBasis &&
    input.promptUnderstanding?.promptId !==
      hashPromptUnderstandingBasis(input.promptUnderstandingBasis)
  ) {
    throw new Error("Prompt understanding does not match the task-plan basis.");
  }
  if (input.promptUnderstanding) validatePromptUnderstandingV1(input.promptUnderstanding);
  const legacyRequirements: PromptRequirementV1[] = [
    {
      id: `prompt-${sha256(normalizeText(input.prompt)).slice(0, 16)}`,
      text: normalizeText(input.prompt),
      source: "user_prompt",
      kind: "outcome",
      required: true,
    },
    ...(input.activeGoal?.trim()
      ? [{
          id: `goal-${sha256(normalizeText(input.activeGoal)).slice(0, 16)}`,
          text: normalizeText(input.activeGoal),
          source: "active_goal" as const,
          kind: "constraint" as const,
          required: true,
        }]
      : []),
    ...input.acceptanceCriteria.map((criterion) => ({
      id: `criterion-${sha256(normalizeText(criterion)).slice(0, 16)}`,
      text: normalizeText(criterion),
      source: "acceptance_criterion" as const,
      kind: "validation" as const,
      required: true,
    })),
  ];
  const canonicalRequirements = input.promptUnderstandingBasis
    ? promptRequirementsFromUnderstanding(input.promptUnderstandingBasis)
    : legacyRequirements;
  const existingIds = new Set(candidate.requirements.map(({ id }) => id));
  for (const requirement of canonicalRequirements) {
    const existing = candidate.requirements.find(({ id }) => id === requirement.id);
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
    const preferred = requirement.source === "acceptance_criterion"
      ? candidate.tasks.filter((task) => task.kind === "validation")
      : candidate.tasks;
    const targets = preferred.length > 0 ? preferred : [candidate.tasks.at(-1)!];
    for (const task of targets) {
      task.requirementIds = sortedUnique([...task.requirementIds, requirement.id]);
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
    allowedOperations: sortedUnique(candidate.allowedOperations) as RepositoryTaskOperation[],
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
    throw new Error("Task plan writer paths do not match the proposed action paths.");
  }
  const taskOperations = mutatingOperations(
    plan.tasks.flatMap((task) => task.operations),
  );
  const actionOperations = mutatingOperations(input.action.operations);
  if (taskOperations.join("\0") !== actionOperations.join("\0")) {
    throw new Error("Task plan operations do not match the proposed action operations.");
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
