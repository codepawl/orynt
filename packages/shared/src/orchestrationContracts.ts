export type OrchestrationRole =
  | "coordinator"
  | "implementer"
  | "helper"
  | "reviewer";

export type OrchestrationThinkingEffort =
  | "minimal"
  | "none"
  | "low"
  | "medium"
  | "high"
  | "xhigh";

export type OrchestrationPreset =
  | "auto"
  | "quality"
  | "balanced"
  | "economy"
  | "custom";

export type ReviewerPolicy = "always" | "conditional" | "failure_only";

export type OrchestrationRoleBinding = {
  providerId: "codex-cli" | "openai-api";
  modelId: string;
  thinkingEffort: OrchestrationThinkingEffort;
  maxTokens: number;
  maxWallTimeMs: number;
  maxUsd?: number;
  modelTier?: import("./modelTierContracts.js").ModelTier;
  routingReasonCodes?: import("./modelTierContracts.js").TaskTierRoutingReason[];
};

export type OrchestrationProfile = {
  schemaVersion: 1;
  preset: OrchestrationPreset;
  roles: Record<OrchestrationRole, OrchestrationRoleBinding>;
  budgetSemantics?: "wall_time_hard_tokens_and_cost_advisory";
  reviewerPolicy: ReviewerPolicy;
  maxReadOnlyHelpers: number;
  maxDepth: number;
  maxRecoveryAttempts: number;
};

export type CodexOrchestrationModelOption = {
  providerId?: "codex-cli" | "openai-api";
  id: string;
  supportedThinkingEfforts: OrchestrationThinkingEffort[];
  defaultThinkingEffort?: OrchestrationThinkingEffort;
};

export type ResolvedRoleBinding = OrchestrationRoleBinding & {
  requestedModelId: string;
  requestedThinkingEffort: OrchestrationThinkingEffort;
  fallbackReason?: string;
};

export type ResolvedOrchestrationProfile = Omit<
  OrchestrationProfile,
  "roles"
> & {
  sourcePreset: OrchestrationPreset;
  roles: Record<OrchestrationRole, ResolvedRoleBinding>;
  omittedRoles: OrchestrationRole[];
};

export type OrchestrationTaskAuthority = "read_only" | "single_writer";

export type OrchestrationChildTask = {
  id: string;
  role: Exclude<OrchestrationRole, "coordinator">;
  title: string;
  instruction: string;
  dependencies: string[];
  authority: OrchestrationTaskAuthority;
  expectedPaths: string[];
  expectedArtifacts: string[];
  depth: number;
  capabilityIds?: string[];
  toolNamespaces?: string[];
};

export type OrchestrationPlan = {
  schemaVersion: 1;
  id: string;
  runId: string;
  parentTaskId: string;
  summary: string;
  tasks: OrchestrationChildTask[];
  createdAt: string;
};

export type ModelInvocationStatus =
  | "planned"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "blocked";

export type ModelInvocationRecord = {
  schemaVersion: 1;
  id: string;
  runId: string;
  parentInvocationId?: string;
  taskId: string;
  role: OrchestrationRole;
  providerId: "codex-cli" | "openai-api";
  modelId: string;
  thinkingEffort: OrchestrationThinkingEffort;
  contextHash: string;
  status: ModelInvocationStatus;
  inputTokens: number | null;
  outputTokens: number | null;
  estimatedCostUsd: number | null;
  startedAt?: string;
  completedAt?: string;
  retryIndex: number;
  artifactRefs: string[];
  modelTier?: import("./modelTierContracts.js").ModelTier;
  routingReasonCodes?: import("./modelTierContracts.js").TaskTierRoutingReason[];
};

const ROLE_ORDER: OrchestrationRole[] = [
  "coordinator",
  "implementer",
  "helper",
  "reviewer",
];
const THINKING_EFFORTS = new Set<OrchestrationThinkingEffort>([
  "minimal",
  "none",
  "low",
  "medium",
  "high",
  "xhigh",
]);
const PRESETS = new Set<OrchestrationPreset>([
  "auto",
  "quality",
  "balanced",
  "economy",
  "custom",
]);
const REVIEWER_POLICIES = new Set<ReviewerPolicy>([
  "always",
  "conditional",
  "failure_only",
]);

const DEFAULT_BUDGETS: Record<
  OrchestrationRole,
  Pick<OrchestrationRoleBinding, "maxTokens" | "maxWallTimeMs">
> = {
  coordinator: { maxTokens: 12_000, maxWallTimeMs: 5 * 60_000 },
  implementer: { maxTokens: 30_000, maxWallTimeMs: 20 * 60_000 },
  helper: { maxTokens: 8_000, maxWallTimeMs: 5 * 60_000 },
  reviewer: { maxTokens: 10_000, maxWallTimeMs: 5 * 60_000 },
};

function roleBinding(
  role: OrchestrationRole,
  modelId: string,
  thinkingEffort: OrchestrationThinkingEffort,
): OrchestrationRoleBinding {
  return {
    providerId: "codex-cli",
    modelId,
    thinkingEffort,
    ...DEFAULT_BUDGETS[role],
  };
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function isOrchestrationProfile(
  value: unknown,
): value is OrchestrationProfile {
  const candidate = record(value);
  const roles = record(candidate.roles);
  return (
    candidate.schemaVersion === 1 &&
    (candidate.budgetSemantics === undefined ||
      candidate.budgetSemantics ===
        "wall_time_hard_tokens_and_cost_advisory") &&
    PRESETS.has(candidate.preset as OrchestrationPreset) &&
    REVIEWER_POLICIES.has(candidate.reviewerPolicy as ReviewerPolicy) &&
    typeof candidate.maxReadOnlyHelpers === "number" &&
    Number.isInteger(candidate.maxReadOnlyHelpers) &&
    candidate.maxReadOnlyHelpers >= 0 &&
    candidate.maxReadOnlyHelpers <= 2 &&
    typeof candidate.maxDepth === "number" &&
    Number.isInteger(candidate.maxDepth) &&
    candidate.maxDepth >= 1 &&
    candidate.maxDepth <= 2 &&
    typeof candidate.maxRecoveryAttempts === "number" &&
    Number.isInteger(candidate.maxRecoveryAttempts) &&
    candidate.maxRecoveryAttempts >= 0 &&
    candidate.maxRecoveryAttempts <= 1 &&
    ROLE_ORDER.every((role) => {
      const binding = record(roles[role]);
      return (
        (binding.providerId === "codex-cli" ||
          binding.providerId === "openai-api") &&
        typeof binding.modelId === "string" &&
        binding.modelId === binding.modelId.trim() &&
        binding.modelId.length > 0 &&
        binding.modelId.length <= 200 &&
        THINKING_EFFORTS.has(
          binding.thinkingEffort as OrchestrationThinkingEffort,
        ) &&
        typeof binding.maxTokens === "number" &&
        Number.isInteger(binding.maxTokens) &&
        binding.maxTokens > 0 &&
        typeof binding.maxWallTimeMs === "number" &&
        Number.isInteger(binding.maxWallTimeMs) &&
        binding.maxWallTimeMs > 0 &&
        (binding.maxUsd === undefined ||
          (typeof binding.maxUsd === "number" &&
            Number.isFinite(binding.maxUsd) &&
            binding.maxUsd >= 0))
      );
    })
  );
}

export function createOrchestrationPreset(
  preset: Exclude<OrchestrationPreset, "custom" | "auto">,
): OrchestrationProfile {
  const mappings = {
    quality: {
      coordinator: roleBinding("coordinator", "gpt-5.6-sol", "xhigh"),
      implementer: roleBinding("implementer", "gpt-5.6-terra", "high"),
      helper: roleBinding("helper", "gpt-5.6-luna", "high"),
      reviewer: roleBinding("reviewer", "gpt-5.6-sol", "high"),
    },
    balanced: {
      coordinator: roleBinding("coordinator", "gpt-5.6-sol", "high"),
      implementer: roleBinding("implementer", "gpt-5.6-terra", "medium"),
      helper: roleBinding("helper", "gpt-5.6-luna", "medium"),
      reviewer: roleBinding("reviewer", "gpt-5.6-sol", "high"),
    },
    economy: {
      coordinator: roleBinding("coordinator", "gpt-5.6-terra", "medium"),
      implementer: roleBinding("implementer", "gpt-5.6-luna", "medium"),
      helper: roleBinding("helper", "gpt-5.6-luna", "low"),
      reviewer: roleBinding("reviewer", "gpt-5.6-sol", "high"),
    },
  } as const;
  return {
    schemaVersion: 1,
    preset,
    roles: mappings[preset],
    budgetSemantics: "wall_time_hard_tokens_and_cost_advisory",
    reviewerPolicy:
      preset === "quality"
        ? "always"
        : preset === "balanced"
          ? "conditional"
          : "failure_only",
    maxReadOnlyHelpers: 2,
    maxDepth: 2,
    maxRecoveryAttempts: 1,
  };
}

export function createLegacySingleModelProfile(
  modelId: string,
  thinkingEffort: OrchestrationThinkingEffort,
): OrchestrationProfile {
  return {
    ...createOrchestrationPreset("balanced"),
    preset: "custom",
    roles: Object.fromEntries(
      ROLE_ORDER.map((role) => [
        role,
        roleBinding(role, modelId, thinkingEffort),
      ]),
    ) as Record<OrchestrationRole, OrchestrationRoleBinding>,
  };
}

export function classifyAutoOrchestrationPreset(input: {
  instruction: string;
  estimatedChangedFiles?: number;
  operations?: string[];
  retryIndex?: number;
}): Exclude<OrchestrationPreset, "auto" | "custom"> {
  const text = input.instruction.toLowerCase();
  if (
    (input.retryIndex ?? 0) > 0 ||
    (input.estimatedChangedFiles ?? 0) > 12 ||
    (input.operations ?? []).some((operation) =>
      ["delete", "rename", "dependency", "migration"].includes(operation),
    ) ||
    /\b(auth|security|migration|database|cross[- ]package|architecture|refactor)\b/u.test(
      text,
    )
  ) {
    return "quality";
  }
  if (
    (input.estimatedChangedFiles ?? 0) <= 1 &&
    !/\b(implement|change|fix|write|edit|delete|rename|migrate)\b/u.test(text)
  ) {
    return "economy";
  }
  return "balanced";
}

export function resolveOrchestrationProfile(
  requested: OrchestrationProfile,
  catalog: CodexOrchestrationModelOption[],
  autoInput?: Parameters<typeof classifyAutoOrchestrationPreset>[0],
): ResolvedOrchestrationProfile {
  const sourcePreset = requested.preset;
  const effective =
    requested.preset === "auto"
      ? createOrchestrationPreset(
          classifyAutoOrchestrationPreset(
            autoInput ?? { instruction: "", estimatedChangedFiles: 0 },
          ),
        )
      : requested;
  const byId = new Map(
    catalog.map((model) => [
      `${model.providerId ?? "codex-cli"}\u0000${model.id}`,
      model,
    ]),
  );
  const coordinator = effective.roles.coordinator;
  const coordinatorKey = `${coordinator.providerId}\u0000${coordinator.modelId}`;
  if (!byId.has(coordinatorKey)) {
    throw new Error(
      effective.preset === "custom"
        ? `Custom coordinator model is unavailable: ${coordinator.modelId}`
        : `Coordinator model is unavailable: ${coordinator.modelId}`,
    );
  }
  const omittedRoles: OrchestrationRole[] = [];
  const roles = {} as Record<OrchestrationRole, ResolvedRoleBinding>;
  for (const role of ROLE_ORDER) {
    const binding = effective.roles[role];
    let model = byId.get(`${binding.providerId}\u0000${binding.modelId}`);
    let fallbackReason: string | undefined;
    if (!model) {
      if (effective.preset === "custom") {
        throw new Error(
          `Custom ${role} model is unavailable: ${binding.modelId}`,
        );
      }
      if (role === "helper") {
        omittedRoles.push(role);
        model = byId.get(coordinatorKey);
        fallbackReason = `Optional helper omitted because ${binding.modelId} is unavailable.`;
      } else {
        model = byId.get(coordinatorKey);
        fallbackReason = `${role} fell back to coordinator model because ${binding.modelId} is unavailable.`;
      }
    }
    const effortSupported = model?.supportedThinkingEfforts.includes(
      binding.thinkingEffort,
    );
    if (!effortSupported && effective.preset === "custom") {
      throw new Error(
        `Custom ${role} thinking effort is unavailable: ${binding.thinkingEffort}`,
      );
    }
    const thinkingEffort = effortSupported
      ? binding.thinkingEffort
      : model?.defaultThinkingEffort ??
        model?.supportedThinkingEfforts[0] ??
        binding.thinkingEffort;
    roles[role] = {
      ...binding,
      modelId: model?.id ?? binding.modelId,
      thinkingEffort,
      requestedModelId: binding.modelId,
      requestedThinkingEffort: binding.thinkingEffort,
      ...(fallbackReason || thinkingEffort !== binding.thinkingEffort
        ? {
            fallbackReason:
              fallbackReason ??
              `${binding.thinkingEffort} is unsupported; using ${thinkingEffort}.`,
          }
        : {}),
    };
  }
  return {
    ...effective,
    sourcePreset,
    roles,
    omittedRoles,
  };
}

export function validateOrchestrationPlan(
  plan: OrchestrationPlan,
  profile: OrchestrationProfile | ResolvedOrchestrationProfile,
): void {
  const taskIds = new Set(plan.tasks.map((task) => task.id));
  if (taskIds.size !== plan.tasks.length) {
    throw new Error("Orchestration plan contains duplicate task ids.");
  }
  if (plan.tasks.some((task) => task.depth < 1 || task.depth > profile.maxDepth)) {
    throw new Error("Orchestration plan exceeds the configured depth.");
  }
  const helpers = plan.tasks.filter((task) => task.role === "helper");
  if (
    "omittedRoles" in profile &&
    profile.omittedRoles.includes("helper") &&
    helpers.length > 0
  ) {
    throw new Error("Orchestration plan cannot dispatch an omitted helper role.");
  }
  if (helpers.length > profile.maxReadOnlyHelpers) {
    throw new Error("Orchestration plan exceeds the helper limit.");
  }
  if (helpers.some((task) => task.authority !== "read_only")) {
    throw new Error("Helpers must remain read-only.");
  }
  const implementers = plan.tasks.filter(
    (task) => task.role === "implementer",
  );
  if (
    implementers.length < 1 ||
    implementers.some((task) => task.authority !== "single_writer") ||
    plan.tasks.some(
      (task) =>
        task.authority === "single_writer" && task.role !== "implementer",
    )
  ) {
    throw new Error(
      "Orchestration plan requires one or more implementers with bounded writer leases.",
    );
  }
  const normalizeOwnedPath = (value: string): string =>
    value.replaceAll("\\", "/").replace(/^\.\/+/, "").replace(/\/+$/, "");
  const pathsOverlap = (left: string, right: string): boolean =>
    left === right ||
    left.startsWith(`${right}/`) ||
    right.startsWith(`${left}/`);
  if (
    implementers.length > 1 &&
    implementers.some((task) => task.expectedPaths.length === 0)
  ) {
    throw new Error(
      "Parallel implementers require explicit, disjoint expected paths.",
    );
  }
  for (let leftIndex = 0; leftIndex < implementers.length; leftIndex += 1) {
    const left = implementers[leftIndex]!;
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < implementers.length;
      rightIndex += 1
    ) {
      const right = implementers[rightIndex]!;
      if (
        left.expectedPaths.some((leftPath) =>
          right.expectedPaths.some((rightPath) =>
            pathsOverlap(
              normalizeOwnedPath(leftPath),
              normalizeOwnedPath(rightPath),
            ),
          ),
        )
      ) {
        throw new Error(
          "Parallel implementers must have disjoint writer paths.",
        );
      }
    }
  }
  if (
    plan.tasks.some(
      (task) => task.role === "reviewer" && task.authority !== "read_only",
    ) ||
    plan.tasks.filter((task) => task.role === "reviewer").length > 1
  ) {
    throw new Error("Orchestration plan permits at most one read-only reviewer.");
  }
  if (
    plan.tasks.some((task) =>
      task.dependencies.some(
        (dependency) => dependency === task.id || !taskIds.has(dependency),
      ),
    )
  ) {
    throw new Error("Orchestration plan contains an invalid dependency.");
  }
  const roleById = new Map(plan.tasks.map((task) => [task.id, task.role]));
  if (
    plan.tasks.some((task) =>
      task.dependencies.some((dependency) => {
        const dependencyRole = roleById.get(dependency);
        if (task.role === "helper") return dependencyRole !== "helper";
        if (task.role === "implementer") {
          return dependencyRole !== "helper" && dependencyRole !== "implementer";
        }
        return dependencyRole === "reviewer";
      }),
    )
  ) {
    throw new Error(
      "Orchestration plan contains a dependency outside the fixed role topology.",
    );
  }
  const dependencies = new Map(
    plan.tasks.map((task) => [task.id, task.dependencies]),
  );
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (taskId: string): void => {
    if (visited.has(taskId)) return;
    if (visiting.has(taskId)) {
      throw new Error("Orchestration plan contains a dependency cycle.");
    }
    visiting.add(taskId);
    for (const dependency of dependencies.get(taskId) ?? []) visit(dependency);
    visiting.delete(taskId);
    visited.add(taskId);
  };
  for (const taskId of taskIds) visit(taskId);
}

export function validateOrchestrationRecoveryTask(
  recoveryTask: OrchestrationChildTask,
  plan: OrchestrationPlan,
  profile: OrchestrationProfile | ResolvedOrchestrationProfile,
): void {
  const dependencyWriters = plan.tasks.filter(
    (task) =>
      recoveryTask.dependencies.includes(task.id) &&
      task.role === "implementer" &&
      task.authority === "single_writer",
  );
  const originalWriter =
    dependencyWriters.length === 1 ? dependencyWriters[0] : undefined;
  const existingTaskIds = new Set(plan.tasks.map((task) => task.id));
  if (
    !originalWriter ||
    recoveryTask.role !== "implementer" ||
    recoveryTask.authority !== "single_writer" ||
    recoveryTask.depth < 1 ||
    recoveryTask.depth > profile.maxDepth
  ) {
    throw new Error(
      "Recovery must be a bounded implementer task with the single writer lease",
    );
  }
  if (
    existingTaskIds.has(recoveryTask.id) ||
    recoveryTask.dependencies.length === 0 ||
    recoveryTask.dependencies.some(
      (dependency) => !existingTaskIds.has(dependency),
    ) ||
    recoveryTask.expectedPaths.some(
      (expectedPath) => !originalWriter.expectedPaths.includes(expectedPath),
    )
  ) {
    throw new Error(
      "Recovery cannot expand approved paths, reuse task ids, or introduce unresolved dependencies.",
    );
  }
}
