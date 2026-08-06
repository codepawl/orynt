export type RepositoryRequirementSource =
  | "user_prompt"
  | "active_goal"
  | "acceptance_criterion"
  | "clarification_answer"
  | "confirmed_assumption"
  | "repository_policy";

export type RepositoryRequirementKind =
  | "outcome"
  | "constraint"
  | "non_goal"
  | "validation";

export type RepositoryTaskKind = "change" | "validation";

export type RepositoryTaskAuthority = "read_only" | "single_writer";

export type RepositoryTaskOperation =
  | "read"
  | "write"
  | "delete"
  | "rename"
  | "dependency"
  | "migration";

export type RepositoryTaskEvidenceKind =
  | "diff"
  | "path_scope"
  | "command"
  | "file"
  | "semantic_review"
  | "operator_review";

export type PromptRequirementV1 = {
  id: string;
  text: string;
  source: RepositoryRequirementSource;
  kind: RepositoryRequirementKind;
  required: boolean;
};

export type RepositoryTaskEvidenceExpectationV1 = {
  id: string;
  requirementIds: string[];
  kind: RepositoryTaskEvidenceKind;
  description: string;
  command?: string;
  path?: string;
};

export type RepositorySemanticTaskV1 = {
  id: string;
  title: string;
  instruction: string;
  kind: RepositoryTaskKind;
  dependencies: string[];
  requirementIds: string[];
  authority: RepositoryTaskAuthority;
  operations: RepositoryTaskOperation[];
  /**
   * Exact read scope for a read-only task. Writer tasks may omit this because
   * their expectedPaths are implicitly readable.
   */
  readPaths?: string[];
  expectedPaths: string[];
  doneWhen: string[];
  evidence: RepositoryTaskEvidenceExpectationV1[];
};

export type RepositoryTaskPlanBudgetV1 = {
  maxTasks: number;
  maxModelTokens: number;
  maxWallTimeMs: number;
  maxUsd?: number;
};

export type RepositoryTaskPlanRecoveryV1 = {
  maxAttemptsPerTask: 0 | 1;
};

export type RepositoryTaskPlanV1 = {
  schemaVersion: 1;
  id: string;
  requestId: string;
  revision: number;
  goal: string;
  summary: string;
  sourcePromptHash: string;
  requirements: PromptRequirementV1[];
  tasks: RepositorySemanticTaskV1[];
  pathEnvelope: string[];
  allowedOperations: RepositoryTaskOperation[];
  budget: RepositoryTaskPlanBudgetV1;
  recovery: RepositoryTaskPlanRecoveryV1;
  createdAt: string;
  digest: string;
};

export type RepositoryTaskExecutionStatus =
  | "planned"
  | "ready"
  | "running"
  | "completed"
  | "failed"
  | "blocked"
  | "cancelled";

export type RepositoryTaskEvidenceStatus = "pass" | "fail";

export type RepositoryTaskEvidenceRecordV1 = {
  id: string;
  requirementIds: string[];
  kind: RepositoryTaskEvidenceKind;
  status: RepositoryTaskEvidenceStatus;
  summary: string;
  artifactRefs: string[];
  command?: string;
  path?: string;
};

export type RepositoryTaskResultV1 = {
  taskId: string;
  summary: string;
  artifactRefs: string[];
  evidence: RepositoryTaskEvidenceRecordV1[];
  changedPaths: string[];
};

export type RepositoryTaskFailureKind =
  | "provider_transient"
  | "provider_permanent"
  | "policy"
  | "approval"
  | "authorization"
  | "scope"
  | "verification"
  | "execution";

export type RepositoryTaskFailureV1 = {
  kind: RepositoryTaskFailureKind;
  message: string;
  retryable: boolean;
  artifactRefs: string[];
};

export type RepositoryRequirementCoverageStatus =
  | "covered"
  | "missing"
  | "failed";

export type RepositoryTaskEvidenceReferenceV1 = {
  taskId: string;
  evidenceId: string;
};

export type RepositoryRequirementCoverageRecordV1 = {
  requirementId: string;
  status: RepositoryRequirementCoverageStatus;
  summary: string;
  evidence: RepositoryTaskEvidenceReferenceV1[];
  artifactRefs: string[];
};

export type RepositoryRequirementCoverageV1 = {
  schemaVersion: 1;
  passed: boolean;
  coveredRequirementIds: string[];
  missingRequirementIds: string[];
  records: RepositoryRequirementCoverageRecordV1[];
  summary: string;
  artifactRefs: string[];
};

export type RepositoryTaskExecutionRecordV1 = {
  schemaVersion: 1;
  planId: string;
  planRevision: number;
  planDigest: string;
  taskId: string;
  attemptId: string;
  retryIndex: number;
  status: RepositoryTaskExecutionStatus;
  startedAt?: string;
  completedAt?: string;
  summary?: string;
  artifactRefs: string[];
  evidence?: RepositoryTaskEvidenceRecordV1[];
  changedPaths?: string[];
  failure?: RepositoryTaskFailureV1;
};

const REQUIREMENT_SOURCES = new Set<RepositoryRequirementSource>([
  "user_prompt",
  "active_goal",
  "acceptance_criterion",
  "clarification_answer",
  "confirmed_assumption",
  "repository_policy",
]);
const REQUIREMENT_KINDS = new Set<RepositoryRequirementKind>([
  "outcome",
  "constraint",
  "non_goal",
  "validation",
]);
const TASK_KINDS = new Set<RepositoryTaskKind>(["change", "validation"]);
const TASK_AUTHORITIES = new Set<RepositoryTaskAuthority>([
  "read_only",
  "single_writer",
]);
const TASK_OPERATIONS = new Set<RepositoryTaskOperation>([
  "read",
  "write",
  "delete",
  "rename",
  "dependency",
  "migration",
]);
const EVIDENCE_KINDS = new Set<RepositoryTaskEvidenceKind>([
  "diff",
  "path_scope",
  "command",
  "file",
  "semantic_review",
  "operator_review",
]);
const FAILURE_KINDS = new Set<RepositoryTaskFailureKind>([
  "provider_transient",
  "provider_permanent",
  "policy",
  "approval",
  "authorization",
  "scope",
  "verification",
  "execution",
]);
const EVIDENCE_STATUSES = new Set<RepositoryTaskEvidenceStatus>([
  "pass",
  "fail",
]);
const COVERAGE_STATUSES = new Set<RepositoryRequirementCoverageStatus>([
  "covered",
  "missing",
  "failed",
]);

function cleanString(value: string): boolean {
  return value.length > 0 && value === value.trim();
}

function safeRepositoryPath(value: string): boolean {
  if (!cleanString(value) || value.startsWith("/") || value.startsWith("\\")) {
    return false;
  }
  if (
    /^[a-z]:[\\/]/iu.test(value) ||
    value.includes("\\") ||
    /[*?[\]{}]/u.test(value)
  ) {
    return false;
  }
  const segments = value.split("/");
  return !segments.some(
    (segment) => !segment || segment === "." || segment === "..",
  );
}

function sortedUnique(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) =>
    left.localeCompare(right),
  );
}

function uniqueCleanStrings(values: string[]): boolean {
  return (
    values.every(cleanString) &&
    new Set(values).size === values.length
  );
}

function pathWithinScope(path: string, scopes: string[]): boolean {
  return scopes.some(
    (scope) => path === scope || path.startsWith(scope + "/"),
  );
}

function pathsOverlap(left: string, right: string): boolean {
  return (
    left === right ||
    left.startsWith(right + "/") ||
    right.startsWith(left + "/")
  );
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => canonicalValue(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalValue(entry)]),
    );
  }
  return value;
}

export function canonicalRepositoryTaskPlan(
  plan: RepositoryTaskPlanV1,
): string {
  const { digest: _digest, ...approvalMaterial } = plan;
  return JSON.stringify(canonicalValue(approvalMaterial));
}

export function validateRepositoryTaskPlan(
  plan: RepositoryTaskPlanV1,
): void {
  if (
    plan.schemaVersion !== 1 ||
    !cleanString(plan.id) ||
    !cleanString(plan.requestId) ||
    !Number.isSafeInteger(plan.revision) ||
    plan.revision < 0 ||
    !cleanString(plan.goal) ||
    !cleanString(plan.summary) ||
    !/^[a-f0-9]{64}$/u.test(plan.sourcePromptHash) ||
    !/^[a-f0-9]{64}$/u.test(plan.digest) ||
    !cleanString(plan.createdAt)
  ) {
    throw new Error("Repository task plan metadata is invalid.");
  }
  if (
    !Number.isSafeInteger(plan.budget.maxTasks) ||
    plan.budget.maxTasks < 1 ||
    plan.budget.maxTasks > 8 ||
    !Number.isSafeInteger(plan.budget.maxModelTokens) ||
    plan.budget.maxModelTokens < 1 ||
    !Number.isSafeInteger(plan.budget.maxWallTimeMs) ||
    plan.budget.maxWallTimeMs < 1 ||
    (plan.budget.maxUsd !== undefined &&
      (!Number.isFinite(plan.budget.maxUsd) || plan.budget.maxUsd < 0)) ||
    ![0, 1].includes(plan.recovery.maxAttemptsPerTask)
  ) {
    throw new Error("Repository task plan budget is invalid.");
  }
  if (
    plan.requirements.length === 0 ||
    plan.tasks.length === 0 ||
    plan.tasks.length > plan.budget.maxTasks ||
    plan.tasks.length > 8
  ) {
    throw new Error("Repository task plan must contain one to eight tasks.");
  }

  const requirementIds = new Set(plan.requirements.map(({ id }) => id));
  if (requirementIds.size !== plan.requirements.length) {
    throw new Error("Repository task plan contains duplicate requirement ids.");
  }
  for (const requirement of plan.requirements) {
    if (
      !cleanString(requirement.id) ||
      !cleanString(requirement.text) ||
      !REQUIREMENT_SOURCES.has(requirement.source) ||
      !REQUIREMENT_KINDS.has(requirement.kind)
    ) {
      throw new Error("Repository task plan contains an invalid requirement.");
    }
  }

  const taskIds = new Set(plan.tasks.map(({ id }) => id));
  if (taskIds.size !== plan.tasks.length) {
    throw new Error("Repository task plan contains duplicate task ids.");
  }
  const allowedOperations = new Set(plan.allowedOperations);
  if (
    allowedOperations.size !== plan.allowedOperations.length ||
    plan.allowedOperations.some((operation) => !TASK_OPERATIONS.has(operation))
  ) {
    throw new Error("Repository task plan contains invalid allowed operations.");
  }
  if (
    sortedUnique(plan.pathEnvelope).length !== plan.pathEnvelope.length ||
    plan.pathEnvelope.some((entry) => !safeRepositoryPath(entry))
  ) {
    throw new Error("Repository task plan path envelope is invalid.");
  }

  const writerByPath = new Map<string, string>();
  const coveredRequirementIds = new Set<string>();
  const evidencedRequirementIds = new Set<string>();
  for (const task of plan.tasks) {
    if (
      !cleanString(task.id) ||
      !cleanString(task.title) ||
      !cleanString(task.instruction) ||
      !TASK_KINDS.has(task.kind) ||
      !TASK_AUTHORITIES.has(task.authority) ||
      task.requirementIds.length === 0 ||
      task.doneWhen.length === 0 ||
      task.evidence.length === 0 ||
      !uniqueCleanStrings(task.dependencies) ||
      !uniqueCleanStrings(task.requirementIds) ||
      !uniqueCleanStrings(task.operations) ||
      !uniqueCleanStrings(task.expectedPaths) ||
      !uniqueCleanStrings(task.doneWhen) ||
      (task.readPaths !== undefined &&
        (!uniqueCleanStrings(task.readPaths) ||
          task.readPaths.some((entry) => !safeRepositoryPath(entry)))) ||
      task.dependencies.some(
        (dependency) => dependency === task.id || !taskIds.has(dependency),
      ) ||
      task.requirementIds.some((id) => !requirementIds.has(id)) ||
      task.operations.some(
        (operation) =>
          !TASK_OPERATIONS.has(operation) || !allowedOperations.has(operation),
      ) ||
      task.expectedPaths.some((entry) => !safeRepositoryPath(entry))
    ) {
      throw new Error("Repository task plan contains an invalid task.");
    }
    if (
      (task.kind === "change" && task.authority !== "single_writer") ||
      (task.kind === "validation" && task.authority !== "read_only")
    ) {
      throw new Error(
        "Repository task authority does not match its semantic kind.",
      );
    }
    if (
      task.authority === "read_only" &&
      (task.expectedPaths.length > 0 ||
        task.operations.some((operation) => operation !== "read"))
    ) {
      throw new Error(
        "Repository read-only tasks cannot declare paths or mutating operations.",
      );
    }
    if (
      task.authority === "single_writer" &&
      (task.expectedPaths.length === 0 ||
        !task.operations.some((operation) => operation !== "read"))
    ) {
      throw new Error(
        "Repository write tasks require paths and a mutating operation.",
      );
    }
    for (const requirementId of task.requirementIds) {
      coveredRequirementIds.add(requirementId);
    }
    for (const expectedPath of task.expectedPaths) {
      if (!plan.pathEnvelope.includes(expectedPath)) {
        throw new Error(
          "Repository task path is outside the approved path envelope.",
        );
      }
      if (task.authority === "single_writer") {
        const existingOwner = writerByPath.get(expectedPath);
        if (existingOwner && existingOwner !== task.id) {
          throw new Error(
            "Repository task plan assigns one path to multiple writers.",
          );
        }
        writerByPath.set(expectedPath, task.id);
      }
    }
    const evidenceIds = new Set(task.evidence.map(({ id }) => id));
    if (evidenceIds.size !== task.evidence.length) {
      throw new Error("Repository task contains duplicate evidence ids.");
    }
    for (const evidence of task.evidence) {
      if (
        !cleanString(evidence.id) ||
        !cleanString(evidence.description) ||
        evidence.requirementIds.length === 0 ||
        evidence.requirementIds.some(
          (id) =>
            !requirementIds.has(id) || !task.requirementIds.includes(id),
        ) ||
        !EVIDENCE_KINDS.has(evidence.kind) ||
        (evidence.path !== undefined && !safeRepositoryPath(evidence.path)) ||
        (evidence.command !== undefined && !cleanString(evidence.command))
      ) {
        throw new Error(
          "Repository task contains an invalid evidence expectation.",
        );
      }
      if (
        evidence.path !== undefined &&
        !pathWithinScope(evidence.path, [
          ...task.expectedPaths,
          ...(task.readPaths ?? []),
        ])
      ) {
        throw new Error(
          "Repository task evidence path is outside the task read or write scope.",
        );
      }
      if (
        (evidence.kind === "diff" ||
          evidence.kind === "path_scope" ||
          evidence.kind === "file") &&
        evidence.path === undefined
      ) {
        throw new Error(
          "Repository task evidence requires an exact path.",
        );
      }
      if (evidence.kind === "command" && evidence.command === undefined) {
        throw new Error(
          "Repository task command evidence requires a command.",
        );
      }
      for (const requirementId of evidence.requirementIds) {
        evidencedRequirementIds.add(requirementId);
      }
    }
  }

  const requiredRequirementIds = plan.requirements
    .filter(({ required }) => required)
    .map(({ id }) => id);
  const writerPaths = [...writerByPath.keys()];
  for (let index = 0; index < writerPaths.length; index += 1) {
    const left = writerPaths[index]!;
    for (
      let comparison = index + 1;
      comparison < writerPaths.length;
      comparison += 1
    ) {
      const right = writerPaths[comparison]!;
      if (pathsOverlap(left, right)) {
        throw new Error(
          "Repository task plan contains overlapping exact writer paths.",
        );
      }
    }
  }
  if (
    requiredRequirementIds.some(
      (id) =>
        !coveredRequirementIds.has(id) || !evidencedRequirementIds.has(id),
    )
  ) {
    throw new Error(
      "Repository task plan leaves a required prompt requirement uncovered.",
    );
  }
  if (
    sortedUnique(writerPaths).join("\0") !==
    sortedUnique(plan.pathEnvelope).join("\0")
  ) {
    throw new Error(
      "Repository task plan path envelope must equal its writer-owned paths.",
    );
  }

  const dependencies = new Map(
    plan.tasks.map(({ id, dependencies: taskDependencies }) => [
      id,
      taskDependencies,
    ]),
  );
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (taskId: string): void => {
    if (visited.has(taskId)) return;
    if (visiting.has(taskId)) {
      throw new Error("Repository task plan contains a dependency cycle.");
    }
    visiting.add(taskId);
    for (const dependency of dependencies.get(taskId) ?? []) visit(dependency);
    visiting.delete(taskId);
    visited.add(taskId);
  };
  for (const taskId of taskIds) visit(taskId);
}

export function parseRepositoryTaskPlanV1(
  value: unknown,
): RepositoryTaskPlanV1 {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Repository task plan must be an object.");
  }
  const plan = structuredClone(value) as RepositoryTaskPlanV1;
  validateRepositoryTaskPlan(plan);
  return plan;
}

export function validateRepositoryTaskFailure(
  failure: unknown,
): asserts failure is RepositoryTaskFailureV1 {
  if (typeof failure !== "object" || failure === null || Array.isArray(failure)) {
    throw new Error("Repository task failure is invalid.");
  }
  const value = failure as RepositoryTaskFailureV1;
  if (
    !FAILURE_KINDS.has(value.kind) ||
    !cleanString(value.message) ||
    typeof value.retryable !== "boolean" ||
    !uniqueCleanStrings(value.artifactRefs)
  ) {
    throw new Error("Repository task failure is invalid.");
  }
}

export function validateRepositoryTaskResult(
  plan: RepositoryTaskPlanV1,
  task: RepositorySemanticTaskV1,
  result: unknown,
): asserts result is RepositoryTaskResultV1 {
  validateRepositoryTaskPlan(plan);
  if (typeof result !== "object" || result === null || Array.isArray(result)) {
    throw new Error("Repository task result is invalid.");
  }
  const value = result as RepositoryTaskResultV1;
  if (
    value.taskId !== task.id ||
    !cleanString(value.summary) ||
    !uniqueCleanStrings(value.artifactRefs) ||
    !Array.isArray(value.evidence) ||
    !uniqueCleanStrings(value.changedPaths) ||
    value.changedPaths.some((path) => !safeRepositoryPath(path))
  ) {
    throw new Error("Repository task result is invalid.");
  }
  if (
    task.authority === "read_only" &&
    value.changedPaths.length > 0
  ) {
    throw new Error("Repository read-only task reported a repository mutation.");
  }
  if (
    task.authority === "single_writer" &&
    value.changedPaths.some(
      (path) => !pathWithinScope(path, task.expectedPaths),
    )
  ) {
    throw new Error(
      "Repository task result changed a path outside its exact writer scope.",
    );
  }

  const expectedEvidence = new Map(
    task.evidence.map((evidence) => [evidence.id, evidence]),
  );
  if (value.evidence.length !== expectedEvidence.size) {
    throw new Error("Repository task result does not record all planned evidence.");
  }
  const evidenceIds = new Set<string>();
  const evidenceArtifactRefs = new Set<string>();
  for (const evidence of value.evidence) {
    const expected = expectedEvidence.get(evidence.id);
    if (
      !expected ||
      evidenceIds.has(evidence.id) ||
      evidence.kind !== expected.kind ||
      evidence.status !== "pass" ||
      !EVIDENCE_STATUSES.has(evidence.status) ||
      evidence.requirementIds.join("\0") !==
        expected.requirementIds.join("\0") ||
      !cleanString(evidence.summary) ||
      !uniqueCleanStrings(evidence.artifactRefs) ||
      evidence.artifactRefs.length === 0 ||
      evidence.command !== expected.command ||
      evidence.path !== expected.path
    ) {
      throw new Error("Repository task evidence record does not match its plan.");
    }
    evidenceIds.add(evidence.id);
    for (const artifactRef of evidence.artifactRefs) {
      evidenceArtifactRefs.add(artifactRef);
    }
  }
  if (
    [...evidenceArtifactRefs].some(
      (artifactRef) => !value.artifactRefs.includes(artifactRef),
    )
  ) {
    throw new Error(
      "Repository task result must retain each evidence artifact reference.",
    );
  }
}

export function validateRepositoryTaskExecutionRecord(
  plan: RepositoryTaskPlanV1,
  record: unknown,
): asserts record is RepositoryTaskExecutionRecordV1 {
  validateRepositoryTaskPlan(plan);
  if (typeof record !== "object" || record === null || Array.isArray(record)) {
    throw new Error("Repository task execution record is invalid.");
  }
  const value = record as RepositoryTaskExecutionRecordV1;
  const task = plan.tasks.find((candidate) => candidate.id === value.taskId);
  if (
    value.schemaVersion !== 1 ||
    value.planId !== plan.id ||
    value.planRevision !== plan.revision ||
    value.planDigest !== plan.digest ||
    !cleanString(value.taskId) ||
    !cleanString(value.attemptId) ||
    !Number.isSafeInteger(value.retryIndex) ||
    value.retryIndex < 0 ||
    value.retryIndex > plan.recovery.maxAttemptsPerTask ||
    ![
      "planned",
      "ready",
      "running",
      "completed",
      "failed",
      "blocked",
      "cancelled",
    ].includes(value.status) ||
    !task ||
    !uniqueCleanStrings(value.artifactRefs)
  ) {
    throw new Error("Repository task execution record is invalid.");
  }
  const terminal = ["completed", "failed", "blocked", "cancelled"].includes(
    value.status,
  );
  if (
    (value.startedAt !== undefined && !cleanString(value.startedAt)) ||
    (value.completedAt !== undefined && !cleanString(value.completedAt)) ||
    (terminal && value.completedAt === undefined) ||
    (value.status === "running" && value.startedAt === undefined)
  ) {
    throw new Error("Repository task execution record timing is invalid.");
  }
  if (value.status === "completed") {
    if (
      value.evidence === undefined ||
      value.changedPaths === undefined ||
      value.failure !== undefined
    ) {
      throw new Error("Repository completed task record is incomplete.");
    }
    validateRepositoryTaskResult(plan, task, {
      taskId: value.taskId,
      summary: value.summary ?? "Completed repository task.",
      artifactRefs: value.artifactRefs,
      evidence: value.evidence,
      changedPaths: value.changedPaths,
    });
  } else if (value.status === "failed") {
    if (value.failure === undefined) {
      throw new Error("Repository failed task record requires a typed failure.");
    }
    validateRepositoryTaskFailure(value.failure);
  } else if (value.failure !== undefined) {
    throw new Error(
      "Repository non-failed task record cannot contain a typed failure.",
    );
  }
}

export function validateRepositoryRequirementCoverage(
  plan: RepositoryTaskPlanV1,
  coverage: unknown,
): asserts coverage is RepositoryRequirementCoverageV1 {
  validateRepositoryTaskPlan(plan);
  if (typeof coverage !== "object" || coverage === null || Array.isArray(coverage)) {
    throw new Error("Repository requirement coverage is invalid.");
  }
  const value = coverage as RepositoryRequirementCoverageV1;
  if (
    value.schemaVersion !== 1 ||
    typeof value.passed !== "boolean" ||
    !uniqueCleanStrings(value.coveredRequirementIds) ||
    !uniqueCleanStrings(value.missingRequirementIds) ||
    !Array.isArray(value.records) ||
    !cleanString(value.summary) ||
    !uniqueCleanStrings(value.artifactRefs)
  ) {
    throw new Error("Repository requirement coverage is invalid.");
  }
  const requirementIds = new Set(plan.requirements.map((item) => item.id));
  const covered = new Set<string>();
  const missing = new Set<string>();
  const recordIds = new Set<string>();
  for (const record of value.records) {
    if (
      !requirementIds.has(record.requirementId) ||
      recordIds.has(record.requirementId) ||
      !COVERAGE_STATUSES.has(record.status) ||
      !cleanString(record.summary) ||
      !Array.isArray(record.evidence) ||
      !uniqueCleanStrings(record.artifactRefs)
    ) {
      throw new Error("Repository requirement coverage record is invalid.");
    }
    const evidenceKeys = new Set<string>();
    for (const evidence of record.evidence) {
      const task = plan.tasks.find((candidate) => candidate.id === evidence.taskId);
      const expected = task?.evidence.find(
        (candidate) => candidate.id === evidence.evidenceId,
      );
      const key = evidence.taskId + "\0" + evidence.evidenceId;
      if (
        !task ||
        !expected ||
        !expected.requirementIds.includes(record.requirementId) ||
        evidenceKeys.has(key)
      ) {
        throw new Error("Repository requirement coverage record is invalid.");
      }
      evidenceKeys.add(key);
    }
    if (
      record.status === "covered" &&
      (record.evidence.length === 0 || record.artifactRefs.length === 0)
    ) {
      throw new Error(
        "Repository covered requirement record requires evidence and an artifact.",
      );
    }
    recordIds.add(record.requirementId);
    if (record.status === "covered") {
      covered.add(record.requirementId);
    } else {
      missing.add(record.requirementId);
    }
  }
  if (
    recordIds.size !== requirementIds.size ||
    [...requirementIds].some((id) => !recordIds.has(id)) ||
    value.coveredRequirementIds.join("\0") !==
      sortedUnique([...covered]).join("\0") ||
    value.missingRequirementIds.join("\0") !==
      sortedUnique([...missing]).join("\0")
  ) {
    throw new Error(
      "Repository requirement coverage ids do not match its requirement records.",
    );
  }
  if (
    value.passed &&
    plan.requirements.some(
      (requirement) => requirement.required && !covered.has(requirement.id),
    )
  ) {
    throw new Error(
      "Repository requirement coverage cannot pass with missing requirements.",
    );
  }
}
