import type {
  OrchestrationProfile,
  OrchestrationRole,
  OrchestrationThinkingEffort,
} from "./orchestrationContracts.js";
import type { OrchestrationRoleBinding } from "./orchestrationContracts.js";

export type ModelTier = "light" | "medium" | "heavy";
export type ModelTierProviderId = "codex-cli" | "openai-api";
export type ModelTierRoutingStage =
  | "prompt_understanding"
  | "coordination"
  | "task_planning"
  | "helper"
  | "implementation"
  | "review"
  | "recovery";

export type ModelTierBinding = {
  providerId: ModelTierProviderId;
  modelId: string;
  thinkingEffort: OrchestrationThinkingEffort;
  maxTokens: number;
  maxWallTimeMs: number;
};

export type RoleTierAssignments = Record<OrchestrationRole, ModelTier>;

export type ModelTierConfigurationV1 = {
  schemaVersion: 1;
  policyVersion: "deterministic_v1";
  tiers: Record<ModelTier, ModelTierBinding>;
  roles: RoleTierAssignments;
  fallbackPolicy: "block";
  manualOverridePolicy: "raise_only";
  maxReadOnlyHelpers: number;
  maxDepth: number;
  maxRecoveryAttempts: number;
  needsTierReview?: boolean;
  migrationWarnings?: string[];
};

export type ModelTierCatalogOption = {
  providerId: ModelTierProviderId;
  id: string;
  supportedThinkingEfforts: OrchestrationThinkingEffort[];
  available?: boolean;
};

export type TaskTierRoutingInputV1 = {
  role: OrchestrationRole;
  stage: ModelTierRoutingStage;
  instruction: string;
  authority?: "read_only" | "single_writer";
  operations?: string[];
  expectedPathCount?: number;
  dependencyCount?: number;
  retryIndex?: number;
  requestedMinimumTier?: ModelTier | null;
};

export type TaskTierRoutingReason =
  | "role_baseline"
  | "bounded_read_only"
  | "prompt_safety_gate"
  | "mutable_work"
  | "broad_change"
  | "high_risk_domain"
  | "sensitive_operation"
  | "cross_package_change"
  | "recovery_attempt"
  | "operator_minimum";

export type TaskTierRoutingDecisionV1 = {
  schemaVersion: 1;
  policyVersion: "deterministic_v1";
  role: OrchestrationRole;
  stage: ModelTierRoutingStage;
  roleTier: ModelTier;
  taskFloorTier: ModelTier;
  requestedMinimumTier: ModelTier | null;
  selectedTier: ModelTier;
  reasonCodes: TaskTierRoutingReason[];
};

export class ModelTierUnavailableError extends Error {
  readonly code = "MODEL_TIER_UNAVAILABLE";

  constructor(
    readonly tier: ModelTier,
    message: string,
  ) {
    super(message);
    this.name = "ModelTierUnavailableError";
  }
}

const TIERS: ModelTier[] = ["light", "medium", "heavy"];
const TIER_RANK: Record<ModelTier, number> = {
  light: 0,
  medium: 1,
  heavy: 2,
};
const ROLES: OrchestrationRole[] = [
  "coordinator",
  "implementer",
  "helper",
  "reviewer",
];
const EFFORTS = new Set<OrchestrationThinkingEffort>([
  "minimal",
  "none",
  "low",
  "medium",
  "high",
  "xhigh",
]);
const PROVIDERS = new Set<ModelTierProviderId>(["codex-cli", "openai-api"]);

export const DEFAULT_ROLE_TIER_ASSIGNMENTS: RoleTierAssignments = {
  coordinator: "medium",
  implementer: "medium",
  helper: "light",
  reviewer: "heavy",
};

export const MODEL_TIER_INVOCATION_CAPS: Record<
  ModelTier,
  Pick<ModelTierBinding, "maxTokens" | "maxWallTimeMs">
> = {
  light: { maxTokens: 8_000, maxWallTimeMs: 5 * 60_000 },
  medium: { maxTokens: 20_000, maxWallTimeMs: 15 * 60_000 },
  heavy: { maxTokens: 30_000, maxWallTimeMs: 20 * 60_000 },
};

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function validBinding(value: unknown, tier: ModelTier): boolean {
  const binding = record(value);
  return (
    PROVIDERS.has(binding.providerId as ModelTierProviderId) &&
    typeof binding.modelId === "string" &&
    binding.modelId === binding.modelId.trim() &&
    binding.modelId.length > 0 &&
    binding.modelId.length <= 200 &&
    EFFORTS.has(binding.thinkingEffort as OrchestrationThinkingEffort) &&
    binding.maxTokens === MODEL_TIER_INVOCATION_CAPS[tier].maxTokens &&
    binding.maxWallTimeMs === MODEL_TIER_INVOCATION_CAPS[tier].maxWallTimeMs
  );
}

export function isModelTierConfiguration(
  value: unknown,
): value is ModelTierConfigurationV1 {
  const candidate = record(value);
  const tiers = record(candidate.tiers);
  const roles = record(candidate.roles);
  return (
    candidate.schemaVersion === 1 &&
    candidate.policyVersion === "deterministic_v1" &&
    candidate.fallbackPolicy === "block" &&
    candidate.manualOverridePolicy === "raise_only" &&
    Number.isInteger(candidate.maxReadOnlyHelpers) &&
    Number(candidate.maxReadOnlyHelpers) >= 0 &&
    Number(candidate.maxReadOnlyHelpers) <= 2 &&
    Number.isInteger(candidate.maxDepth) &&
    Number(candidate.maxDepth) >= 1 &&
    Number(candidate.maxDepth) <= 2 &&
    Number.isInteger(candidate.maxRecoveryAttempts) &&
    Number(candidate.maxRecoveryAttempts) >= 0 &&
    Number(candidate.maxRecoveryAttempts) <= 1 &&
    TIERS.every((tier) => validBinding(tiers[tier], tier)) &&
    ROLES.every((role) => TIERS.includes(roles[role] as ModelTier)) &&
    (candidate.needsTierReview === undefined ||
      typeof candidate.needsTierReview === "boolean") &&
    (candidate.migrationWarnings === undefined ||
      (Array.isArray(candidate.migrationWarnings) &&
        candidate.migrationWarnings.every((warning) => typeof warning === "string")))
  );
}

function binding(
  tier: ModelTier,
  providerId: ModelTierProviderId,
  modelId: string,
  thinkingEffort: OrchestrationThinkingEffort,
): ModelTierBinding {
  return {
    providerId,
    modelId,
    thinkingEffort,
    ...MODEL_TIER_INVOCATION_CAPS[tier],
  };
}

export function createSingleModelTierConfiguration(
  modelId: string,
  thinkingEffort: OrchestrationThinkingEffort,
  providerId: ModelTierProviderId = "codex-cli",
): ModelTierConfigurationV1 {
  const normalized = modelId.trim();
  if (!normalized) throw new Error("Model tier configuration requires a model.");
  return {
    schemaVersion: 1,
    policyVersion: "deterministic_v1",
    tiers: {
      light: binding("light", providerId, normalized, thinkingEffort),
      medium: binding("medium", providerId, normalized, thinkingEffort),
      heavy: binding("heavy", providerId, normalized, thinkingEffort),
    },
    roles: { ...DEFAULT_ROLE_TIER_ASSIGNMENTS },
    fallbackPolicy: "block",
    manualOverridePolicy: "raise_only",
    maxReadOnlyHelpers: 2,
    maxDepth: 2,
    maxRecoveryAttempts: 1,
    needsTierReview: true,
  };
}

export function createDefaultModelTierConfiguration(): ModelTierConfigurationV1 {
  return {
    ...createSingleModelTierConfiguration("gpt-5.6-terra", "medium"),
    tiers: {
      light: binding("light", "codex-cli", "gpt-5.6-luna", "medium"),
      medium: binding("medium", "codex-cli", "gpt-5.6-terra", "medium"),
      heavy: binding("heavy", "codex-cli", "gpt-5.6-sol", "high"),
    },
    needsTierReview: false,
  };
}

export function migrateOrchestrationProfileToModelTiers(
  profile: OrchestrationProfile,
): ModelTierConfigurationV1 {
  const roleModels = new Set(
    Object.values(profile.roles).map(
      ({ providerId, modelId, thinkingEffort }) =>
        `${providerId}\u0000${modelId}\u0000${thinkingEffort}`,
    ),
  );
  if (roleModels.size === 1) {
    const current = profile.roles.coordinator;
    return createSingleModelTierConfiguration(
      current.modelId,
      current.thinkingEffort,
      current.providerId,
    );
  }
  const source = {
    light: profile.roles.helper,
    medium: profile.roles.implementer,
    heavy: profile.roles.reviewer,
  };
  return {
    schemaVersion: 1,
    policyVersion: "deterministic_v1",
    tiers: {
      light: binding(
        "light",
        source.light.providerId,
        source.light.modelId,
        source.light.thinkingEffort,
      ),
      medium: binding(
        "medium",
        source.medium.providerId,
        source.medium.modelId,
        source.medium.thinkingEffort,
      ),
      heavy: binding(
        "heavy",
        source.heavy.providerId,
        source.heavy.modelId,
        source.heavy.thinkingEffort,
      ),
    },
    roles: { ...DEFAULT_ROLE_TIER_ASSIGNMENTS },
    fallbackPolicy: "block",
    manualOverridePolicy: "raise_only",
    maxReadOnlyHelpers: profile.maxReadOnlyHelpers,
    maxDepth: profile.maxDepth,
    maxRecoveryAttempts: profile.maxRecoveryAttempts,
    needsTierReview: true,
    migrationWarnings: [
      "Legacy role-model bindings were mapped helper→light, implementer→medium, and reviewer→heavy. Review the coordinator tier.",
    ],
  };
}

export function maxModelTier(...tiers: Array<ModelTier | null | undefined>): ModelTier {
  return tiers.reduce<ModelTier>(
    (highest, tier) =>
      tier && TIER_RANK[tier] > TIER_RANK[highest] ? tier : highest,
    "light",
  );
}

function taskFloor(input: TaskTierRoutingInputV1): {
  tier: ModelTier;
  reasons: TaskTierRoutingReason[];
} {
  const text = input.instruction.toLowerCase();
  const operations = input.operations ?? [];
  if ((input.retryIndex ?? 0) > 0 || input.stage === "recovery") {
    return { tier: "heavy", reasons: ["recovery_attempt"] };
  }
  if (
    operations.some((operation) =>
      ["delete", "rename", "dependency", "migration"].includes(operation),
    )
  ) {
    return { tier: "heavy", reasons: ["sensitive_operation"] };
  }
  if (
    /\b(auth|authentication|authorization|permission|permissions|security|secret|secrets|credential|credentials|payment|payments|tenancy|tenant|migration|database)\b/u.test(
      text,
    )
  ) {
    return { tier: "heavy", reasons: ["high_risk_domain"] };
  }
  if (
    /\b(cross[- ]package|architecture|architectural|large refactor)\b/u.test(text)
  ) {
    return { tier: "heavy", reasons: ["cross_package_change"] };
  }
  if ((input.expectedPathCount ?? 0) > 12) {
    return { tier: "heavy", reasons: ["broad_change"] };
  }
  if (input.stage === "prompt_understanding") {
    return { tier: "medium", reasons: ["prompt_safety_gate"] };
  }
  if (
    input.authority === "single_writer" ||
    input.stage === "implementation" ||
    input.stage === "task_planning" ||
    input.stage === "coordination" ||
    input.stage === "review"
  ) {
    return { tier: "medium", reasons: ["mutable_work"] };
  }
  return { tier: "light", reasons: ["bounded_read_only"] };
}

export function routeModelTier(
  configuration: ModelTierConfigurationV1,
  input: TaskTierRoutingInputV1,
): TaskTierRoutingDecisionV1 {
  if (!isModelTierConfiguration(configuration)) {
    throw new Error("Invalid model tier configuration.");
  }
  const floor = taskFloor(input);
  const roleTier = configuration.roles[input.role];
  const requestedMinimumTier = input.requestedMinimumTier ?? null;
  const selectedTier = maxModelTier(
    roleTier,
    floor.tier,
    requestedMinimumTier,
  );
  return {
    schemaVersion: 1,
    policyVersion: "deterministic_v1",
    role: input.role,
    stage: input.stage,
    roleTier,
    taskFloorTier: floor.tier,
    requestedMinimumTier,
    selectedTier,
    reasonCodes: [
      "role_baseline",
      ...floor.reasons,
      ...(requestedMinimumTier ? ["operator_minimum" as const] : []),
    ],
  };
}

export function resolveExactTierBinding(
  configuration: ModelTierConfigurationV1,
  decision: TaskTierRoutingDecisionV1,
  catalog: ModelTierCatalogOption[],
): ModelTierBinding {
  const binding = configuration.tiers[decision.selectedTier];
  const model = catalog.find(
    (candidate) =>
      candidate.providerId === binding.providerId &&
      candidate.id === binding.modelId,
  );
  if (!model || model.available === false) {
    throw new ModelTierUnavailableError(
      decision.selectedTier,
      `${decision.selectedTier} tier model is unavailable: ${binding.providerId}/${binding.modelId}`,
    );
  }
  if (!model.supportedThinkingEfforts.includes(binding.thinkingEffort)) {
    throw new ModelTierUnavailableError(
      decision.selectedTier,
      `${decision.selectedTier} tier effort is unavailable: ${binding.thinkingEffort}`,
    );
  }
  return { ...binding };
}

export function modelTierConfigurationToOrchestrationProfile(
  configuration: ModelTierConfigurationV1,
  input: {
    instruction: string;
    requestedMinimumTier?: ModelTier | null;
    estimatedChangedFiles?: number;
    operations?: string[];
    retryIndex?: number;
  },
): {
  profile: OrchestrationProfile;
  decisions: Record<OrchestrationRole, TaskTierRoutingDecisionV1>;
} {
  const stages: Record<OrchestrationRole, ModelTierRoutingStage> = {
    coordinator: "coordination",
    implementer: "implementation",
    helper: "helper",
    reviewer: "review",
  };
  const decisions = Object.fromEntries(
    ROLES.map((role) => [
      role,
      routeModelTier(configuration, {
        role,
        stage: stages[role],
        instruction: input.instruction,
        authority: role === "implementer" ? "single_writer" : "read_only",
        operations: input.operations,
        expectedPathCount: input.estimatedChangedFiles,
        retryIndex: input.retryIndex,
        requestedMinimumTier: input.requestedMinimumTier,
      }),
    ]),
  ) as Record<OrchestrationRole, TaskTierRoutingDecisionV1>;
  const roles = Object.fromEntries(
    ROLES.map((role) => {
      const selectedTier = decisions[role].selectedTier;
      return [
        role,
        {
          ...configuration.tiers[selectedTier],
          modelTier: selectedTier,
          routingReasonCodes: [...decisions[role].reasonCodes],
        } satisfies OrchestrationRoleBinding,
      ];
    }),
  ) as Record<OrchestrationRole, OrchestrationRoleBinding>;
  return {
    profile: {
      schemaVersion: 1,
      preset: "custom",
      roles,
      budgetSemantics: "wall_time_hard_tokens_and_cost_advisory",
      reviewerPolicy: "always",
      maxReadOnlyHelpers: configuration.maxReadOnlyHelpers,
      maxDepth: configuration.maxDepth,
      maxRecoveryAttempts: configuration.maxRecoveryAttempts,
    },
    decisions,
  };
}
