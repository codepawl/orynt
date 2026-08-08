import { providerBilling } from "./orchestrationContracts.js";

export type AgentRunStatus = "created" | "running" | "completed" | "failed" | "cancelled";

export type AgentRiskLevel = "safe" | "review" | "sensitive" | "blocked";

export type AgentEventType =
  | "task.created"
  | "observation.captured"
  | "memory.retrieved"
  | "plan.created"
  | "action.proposed"
  | "permission.requested"
  | "permission.approved"
  | "permission.rejected"
  | "action.executed"
  | "verification.passed"
  | "verification.failed"
  | "feedback.received"
  | "skill.candidate_created"
  | "run.completed"
  | "run.failed";

export type LedgerVisibility = "internal" | "user" | "admin";

export type PermissionTier = "safe" | "review" | "sensitive" | "blocked";

export type PermissionDecision =
  | "auto_allowed"
  | "approval_requested"
  | "approved"
  | "rejected"
  | "blocked"
  | "takeover_required";

export type RunArtifactType =
  | "screenshot"
  | "dom"
  | "accessibility_tree"
  | "command_log"
  | "file_diff"
  | "generated_file"
  | "trace"
  | "other";

export type AgentRun = {
  id: string;
  workspaceId: string;
  userId: string;
  planId: string | null;
  status: AgentRunStatus;
  userGoal: string;
  normalizedGoal: string;
  taskType: string | null;
  riskLevel: AgentRiskLevel;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number | null;
  primaryModelProvider: string | null;
  primaryModelName: string | null;
  estimatedCostUsd: number;
  creditsConsumed: number;
  humanInterventionCount: number;
  approvalCount: number;
  blockedActionCount: number;
  retryCount: number;
  finalSummary: string | null;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateAgentRunInput = {
  id: string;
  workspaceId: string;
  userId: string;
  planId?: string | null;
  userGoal: string;
  normalizedGoal: string;
  taskType?: string | null;
  riskLevel: AgentRiskLevel;
  startedAt: string;
  primaryModelProvider?: string | null;
  primaryModelName?: string | null;
};

export type AgentEvent = {
  id: string;
  runId: string;
  workspaceId: string;
  userId: string;
  eventType: AgentEventType;
  eventIndex: number;
  payloadJson: Record<string, unknown>;
  visibility: LedgerVisibility;
  createdAt: string;
};

export type AppendAgentEventInput = Omit<AgentEvent, "runId" | "workspaceId" | "userId" | "eventIndex">;

export type PermissionEvent = {
  id: string;
  runId: string;
  actionId: string;
  permissionTier: PermissionTier;
  decision: PermissionDecision;
  reason: string;
  policyVersion: string;
  requestedAt: string;
  decidedAt: string | null;
  decidedByUserId: string | null;
};

export type PermissionEventInput = Omit<PermissionEvent, "decidedAt" | "decidedByUserId"> & {
  decidedAt?: string | null;
  decidedByUserId?: string | null;
};

export type RunArtifact = {
  id: string;
  runId: string;
  eventId: string | null;
  artifactType: RunArtifactType;
  storageRef: string;
  sha256: string | null;
  visibility: LedgerVisibility;
  createdAt: string;
};

export type RunArtifactInput = Omit<RunArtifact, "eventId" | "sha256"> & {
  eventId?: string | null;
  sha256?: string | null;
};

export type ModelUsagePricing = {
  provider: string;
  model: string;
  inputUsdPerMillionTokens: number;
  cachedInputUsdPerMillionTokens: number;
  outputUsdPerMillionTokens: number;
  toolCallUsd: number;
};

export type GatewayUsagePricing = {
  gatewayType: string;
  durationUsdPerSecond: number;
  transferUsdPerMb: number;
  storageUsdPerGbDay: number;
  requestUsd: number;
};

export type UsagePricingCatalog = {
  version: string;
  modelPrices: ModelUsagePricing[];
  gatewayPrices: GatewayUsagePricing[];
};

export type ModelUsageInput = {
  provider: string;
  model: string;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  toolCalls: number;
};

export type ModelUsageCost = {
  configVersion: string;
  estimatedCostUsd: number;
};

export type GatewayUsageInput = {
  gatewayType: string;
  actionType: string;
  durationMs: number;
  transferredMb: number;
  storageGbDay: number;
  requestCount: number;
};

export type GatewayUsageCost = {
  configVersion: string;
  estimatedCostUsd: number;
};

export type ModelUsageLedgerEntry = ModelUsageInput & {
  id: string;
  runId: string;
  workspaceId: string;
  userId: string;
  unitPriceConfigVersion: string;
  estimatedCostUsd: number;
  createdAt: string;
};

export type ModelUsageLedgerInput = Omit<ModelUsageLedgerEntry, "unitPriceConfigVersion" | "estimatedCostUsd">;

export type GatewayUsageLedgerEntry = GatewayUsageInput & {
  id: string;
  runId: string;
  workspaceId: string;
  userId: string;
  unitPriceConfigVersion: string;
  estimatedCostUsd: number;
  createdAt: string;
};

export type GatewayUsageLedgerInput = Omit<GatewayUsageLedgerEntry, "unitPriceConfigVersion" | "estimatedCostUsd">;

export type CompleteRunInput = {
  endedAt: string;
  retryCount: number;
  finalSummary: string;
  failureReason: string | null;
};

export type MonthlyUsageSummaryQuery = {
  workspaceId: string;
  userId?: string;
  month: string;
  includeInternalCosts: boolean;
};

export type MonthlyUsageSummary = {
  workspaceId: string;
  userId?: string;
  month: string;
  runCount: number;
  completedRunCount: number;
  failedRunCount: number;
  modelCallCount: number;
  gatewayActionCount: number;
  permissionDecisionCounts: Partial<Record<PermissionDecision, number>>;
  artifactCount: number;
  creditsConsumed: number;
  estimatedCostUsd?: number;
};

export function createDefaultUsagePricingCatalog(): UsagePricingCatalog {
  return {
    version: "2026-08-08.local-mock",
    modelPrices: [
      {
        provider: "openai",
        model: "gpt-4.1-mini",
        inputUsdPerMillionTokens: 0.4,
        cachedInputUsdPerMillionTokens: 0.1,
        outputUsdPerMillionTokens: 2,
        toolCallUsd: 1 / 3000,
      },
      // Anthropic list prices. Cached input is 0.1x base per the published
      // cache-read rate. Claude Sonnet 5 carries an introductory $2/$10 rate
      // that expires 2026-08-31; the standard rate is used so the catalog does
      // not go stale mid-release.
      {
        provider: "anthropic",
        model: "claude-opus-5",
        inputUsdPerMillionTokens: 5,
        cachedInputUsdPerMillionTokens: 0.5,
        outputUsdPerMillionTokens: 25,
        toolCallUsd: 0.0005,
      },
      {
        provider: "anthropic",
        model: "claude-sonnet-5",
        inputUsdPerMillionTokens: 3,
        cachedInputUsdPerMillionTokens: 0.3,
        outputUsdPerMillionTokens: 15,
        toolCallUsd: 0.0005,
      },
      {
        provider: "anthropic",
        model: "claude-haiku-4-5",
        inputUsdPerMillionTokens: 1,
        cachedInputUsdPerMillionTokens: 0.1,
        outputUsdPerMillionTokens: 5,
        toolCallUsd: 0.0005,
      },
    ],
    gatewayPrices: [
      {
        gatewayType: "repository",
        durationUsdPerSecond: 0.000004,
        transferUsdPerMb: 0,
        storageUsdPerGbDay: 0.000002,
        requestUsd: 0.00001,
      },
      {
        gatewayType: "browser",
        durationUsdPerSecond: 0.00001,
        transferUsdPerMb: 0.00002,
        storageUsdPerGbDay: 0.000007,
        requestUsd: 0.00002625,
      },
      {
        gatewayType: "desktop",
        durationUsdPerSecond: 0.000012,
        transferUsdPerMb: 0.00001,
        storageUsdPerGbDay: 0.000007,
        requestUsd: 0.00002,
      },
    ],
  };
}

function clone<T>(value: T): T {
  return typeof globalThis.structuredClone === "function" ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function monthOf(isoDate: string): string {
  return isoDate.slice(0, 7);
}

function roundUsd(value: number): number {
  return Math.round((value + Number.EPSILON) * 100_000_000) / 100_000_000;
}

function getModelPrice(input: ModelUsageInput, catalog: UsagePricingCatalog): ModelUsagePricing {
  const price = catalog.modelPrices.find((item) => item.provider === input.provider && item.model === input.model);
  if (!price) {
    throw new Error(`missing model price config: ${input.provider}/${input.model}`);
  }
  return price;
}

function getGatewayPrice(input: GatewayUsageInput, catalog: UsagePricingCatalog): GatewayUsagePricing {
  const price = catalog.gatewayPrices.find((item) => item.gatewayType === input.gatewayType);
  if (!price) {
    throw new Error(`missing gateway price config: ${input.gatewayType}`);
  }
  return price;
}

/**
 * The prompt tokens a provider had to process at full price for one call.
 *
 * `inputTokens` is the whole prompt, including the part served from the
 * provider's prompt cache. Comparing budgets against it makes a well-cached run
 * look as expensive as an uncached one, so improving cache reuse cannot show up
 * as an improvement — and can look like a regression, because cache writes move
 * tokens into the total without reducing it.
 *
 * This derivation is deliberately price-independent so a spend budget stays
 * comparable across providers and survives a stale price catalog. Use
 * `calculateModelUsageCostUsd` when an actual currency amount is required.
 */
export function calculateFreshInputTokens(
  usage: Pick<ModelUsageInput, "inputTokens" | "cachedInputTokens">,
): number {
  return Math.max(0, usage.inputTokens - usage.cachedInputTokens);
}

/**
 * The share of prompt tokens served from the provider's cache, `0` through `1`.
 *
 * Reported beside a token budget so a run that cuts spend by caching more is
 * visibly distinguishable from one that cuts spend by doing less work. Returns
 * `null` when no prompt tokens were recorded, because a ratio over zero tokens
 * would read as "no cache reuse" rather than "nothing measured".
 */
export function calculateCacheHitRatio(
  usage: Pick<ModelUsageInput, "inputTokens" | "cachedInputTokens">,
): number | null {
  if (usage.inputTokens <= 0) return null;
  const cached = Math.min(Math.max(0, usage.cachedInputTokens), usage.inputTokens);
  return cached / usage.inputTokens;
}

export function calculateModelUsageCostUsd(input: ModelUsageInput, catalog: UsagePricingCatalog): ModelUsageCost {
  const price = getModelPrice(input, catalog);
  const uncachedInputTokens = Math.max(0, input.inputTokens - input.cachedInputTokens);
  const cost =
    (uncachedInputTokens / 1_000_000) * price.inputUsdPerMillionTokens +
    (input.cachedInputTokens / 1_000_000) * price.cachedInputUsdPerMillionTokens +
    (input.outputTokens / 1_000_000) * price.outputUsdPerMillionTokens +
    input.toolCalls * price.toolCallUsd;

  return {
    configVersion: catalog.version,
    estimatedCostUsd: roundUsd(cost),
  };
}

/**
 * Maps an orchestration provider id onto the price catalog's provider name.
 *
 * Only per-token providers have catalog names. Subscription providers are not
 * mapped here at all — {@link estimateInvocationCostUsd} withholds their
 * estimate before a lookup is attempted, using `providerBilling` as the single
 * source of that judgement.
 */
export function usagePricingProviderId(orchestrationProviderId: string): string {
  if (orchestrationProviderId === "anthropic-api") return "anthropic";
  if (orchestrationProviderId === "openai-api") return "openai";
  return orchestrationProviderId;
}

/**
 * Estimates the cost of one model invocation, or `null` when the catalog has no
 * entry for that provider and model.
 *
 * Use this wherever a cost estimate is advisory. `calculateModelUsageCostUsd`
 * throws on a missing price, which is correct for billing paths but wrong for
 * telemetry: an unpriced model must leave the estimate absent rather than fail
 * the run or borrow another model's rate.
 */
export function estimateModelUsageCostUsd(
  input: ModelUsageInput,
  catalog: UsagePricingCatalog,
): ModelUsageCost | null {
  const priced = catalog.modelPrices.some(
    (item) => item.provider === input.provider && item.model === input.model,
  );
  if (!priced) return null;
  return calculateModelUsageCostUsd(input, catalog);
}

/**
 * Advisory cost for one recorded model invocation, in the nullable shape the
 * invocation ledger stores.
 *
 * Returns `null` when the provider bills by subscription, when usage was not
 * reported, or when the model carries no catalog price. All three mean "not
 * known"; substituting zero would read as a free call, and pricing a flat-fee
 * plan per token would read as a real charge that never happened.
 */
export function estimateInvocationCostUsd(
  input: {
    providerId: string;
    modelId: string;
    inputTokens: number | null;
    cachedInputTokens?: number | null;
    outputTokens: number | null;
    toolCalls?: number;
  },
  catalog: UsagePricingCatalog = createDefaultUsagePricingCatalog(),
): number | null {
  if (providerBilling(input.providerId) === "subscription") return null;
  if (input.inputTokens === null && input.outputTokens === null) return null;
  const estimate = estimateModelUsageCostUsd(
    {
      provider: usagePricingProviderId(input.providerId),
      model: input.modelId,
      inputTokens: Math.max(0, input.inputTokens ?? 0),
      cachedInputTokens: Math.max(0, input.cachedInputTokens ?? 0),
      outputTokens: Math.max(0, input.outputTokens ?? 0),
      toolCalls: input.toolCalls ?? 0,
    },
    catalog,
  );
  return estimate?.estimatedCostUsd ?? null;
}

export function calculateGatewayUsageCostUsd(input: GatewayUsageInput, catalog: UsagePricingCatalog): GatewayUsageCost {
  const price = getGatewayPrice(input, catalog);
  const cost =
    (input.durationMs / 1000) * price.durationUsdPerSecond +
    input.transferredMb * price.transferUsdPerMb +
    input.storageGbDay * price.storageUsdPerGbDay +
    input.requestCount * price.requestUsd;

  return {
    configVersion: catalog.version,
    estimatedCostUsd: roundUsd(cost),
  };
}

export class InMemoryAgentLedger {
  private readonly pricing: UsagePricingCatalog;
  private readonly runs = new Map<string, AgentRun>();
  private readonly events = new Map<string, AgentEvent[]>();
  private readonly permissions: PermissionEvent[] = [];
  private readonly artifacts: RunArtifact[] = [];
  private readonly modelUsage: ModelUsageLedgerEntry[] = [];
  private readonly gatewayUsage: GatewayUsageLedgerEntry[] = [];

  constructor(pricing: UsagePricingCatalog = createDefaultUsagePricingCatalog()) {
    this.pricing = clone(pricing);
  }

  createRun(input: CreateAgentRunInput): AgentRun {
    const run: AgentRun = {
      id: input.id,
      workspaceId: input.workspaceId,
      userId: input.userId,
      planId: input.planId ?? null,
      status: "running",
      userGoal: input.userGoal,
      normalizedGoal: input.normalizedGoal,
      taskType: input.taskType ?? null,
      riskLevel: input.riskLevel,
      startedAt: input.startedAt,
      endedAt: null,
      durationSeconds: null,
      primaryModelProvider: input.primaryModelProvider ?? null,
      primaryModelName: input.primaryModelName ?? null,
      estimatedCostUsd: 0,
      creditsConsumed: 0,
      humanInterventionCount: 0,
      approvalCount: 0,
      blockedActionCount: 0,
      retryCount: 0,
      finalSummary: null,
      failureReason: null,
      createdAt: input.startedAt,
      updatedAt: input.startedAt,
    };
    this.runs.set(run.id, run);
    this.events.set(run.id, []);
    return clone(run);
  }

  getRun(runId: string): AgentRun | undefined {
    const run = this.runs.get(runId);
    return run ? clone(run) : undefined;
  }

  appendEvent(runId: string, input: AppendAgentEventInput): AgentEvent {
    const run = this.requireRun(runId);
    const existing = this.events.get(runId) ?? [];
    const event: AgentEvent = {
      ...clone(input),
      runId,
      workspaceId: run.workspaceId,
      userId: run.userId,
      eventIndex: existing.length + 1,
    };
    existing.push(event);
    this.events.set(runId, existing);
    return clone(event);
  }

  listEvents(runId: string): AgentEvent[] {
    return (this.events.get(runId) ?? []).map(clone);
  }

  recordPermissionEvent(input: PermissionEventInput): PermissionEvent {
    const run = this.requireRun(input.runId);
    const event: PermissionEvent = {
      ...clone(input),
      decidedAt: input.decidedAt ?? null,
      decidedByUserId: input.decidedByUserId ?? null,
    };
    this.permissions.push(event);
    const approvalCount = ["approval_requested", "approved", "rejected", "takeover_required"].includes(event.decision) ? 1 : 0;
    const blockedActionCount = event.decision === "blocked" ? 1 : 0;
    this.runs.set(input.runId, {
      ...run,
      humanInterventionCount: run.humanInterventionCount + approvalCount,
      approvalCount: run.approvalCount + approvalCount,
      blockedActionCount: run.blockedActionCount + blockedActionCount,
      updatedAt: event.decidedAt ?? event.requestedAt,
    });
    return clone(event);
  }

  recordArtifact(input: RunArtifactInput): RunArtifact {
    this.requireRun(input.runId);
    const artifact: RunArtifact = {
      ...clone(input),
      eventId: input.eventId ?? null,
      sha256: input.sha256 ?? null,
    };
    this.artifacts.push(artifact);
    return clone(artifact);
  }

  recordModelUsage(input: ModelUsageLedgerInput): ModelUsageLedgerEntry {
    this.requireRun(input.runId);
    const cost = calculateModelUsageCostUsd(input, this.pricing);
    const entry: ModelUsageLedgerEntry = {
      ...clone(input),
      unitPriceConfigVersion: cost.configVersion,
      estimatedCostUsd: cost.estimatedCostUsd,
    };
    this.modelUsage.push(entry);
    return clone(entry);
  }

  recordGatewayUsage(input: GatewayUsageLedgerInput): GatewayUsageLedgerEntry {
    this.requireRun(input.runId);
    const cost = calculateGatewayUsageCostUsd(input, this.pricing);
    const entry: GatewayUsageLedgerEntry = {
      ...clone(input),
      unitPriceConfigVersion: cost.configVersion,
      estimatedCostUsd: cost.estimatedCostUsd,
    };
    this.gatewayUsage.push(entry);
    return clone(entry);
  }

  completeRun(runId: string, input: CompleteRunInput): AgentRun {
    const run = this.requireRun(runId);
    const estimatedCostUsd = this.calculateRunCost(runId);
    const updated: AgentRun = {
      ...run,
      status: input.failureReason ? "failed" : "completed",
      endedAt: input.endedAt,
      durationSeconds: Math.max(0, Math.round((Date.parse(input.endedAt) - Date.parse(run.startedAt)) / 1000)),
      estimatedCostUsd,
      creditsConsumed: estimatedCostUsd,
      retryCount: input.retryCount,
      finalSummary: input.finalSummary,
      failureReason: input.failureReason,
      updatedAt: input.endedAt,
    };
    this.runs.set(runId, updated);
    return clone(updated);
  }

  getMonthlyUsageSummary(query: MonthlyUsageSummaryQuery): MonthlyUsageSummary {
    const runs = [...this.runs.values()].filter(
      (run) =>
        run.workspaceId === query.workspaceId &&
        (query.userId === undefined || run.userId === query.userId) &&
        monthOf(run.startedAt) === query.month,
    );
    const runIds = new Set(runs.map((run) => run.id));
    const permissions = this.permissions.filter((event) => runIds.has(event.runId));
    const permissionDecisionCounts: Partial<Record<PermissionDecision, number>> = {};
    for (const event of permissions) {
      permissionDecisionCounts[event.decision] = (permissionDecisionCounts[event.decision] ?? 0) + 1;
    }

    const estimatedCostUsd = roundUsd(runs.reduce((sum, run) => sum + run.estimatedCostUsd, 0));
    const summary: MonthlyUsageSummary = {
      workspaceId: query.workspaceId,
      userId: query.userId,
      month: query.month,
      runCount: runs.length,
      completedRunCount: runs.filter((run) => run.status === "completed").length,
      failedRunCount: runs.filter((run) => run.status === "failed").length,
      modelCallCount: this.modelUsage.filter((entry) => runIds.has(entry.runId)).length,
      gatewayActionCount: this.gatewayUsage.filter((entry) => runIds.has(entry.runId)).length,
      permissionDecisionCounts,
      artifactCount: this.artifacts.filter((artifact) => runIds.has(artifact.runId)).length,
      creditsConsumed: roundUsd(runs.reduce((sum, run) => sum + run.creditsConsumed, 0)),
    };
    if (query.includeInternalCosts) {
      summary.estimatedCostUsd = estimatedCostUsd;
    }
    return summary;
  }

  private requireRun(runId: string): AgentRun {
    const run = this.runs.get(runId);
    if (!run) {
      throw new Error(`agent run not found: ${runId}`);
    }
    return run;
  }

  private calculateRunCost(runId: string): number {
    return roundUsd(
      this.modelUsage.filter((entry) => entry.runId === runId).reduce((sum, entry) => sum + entry.estimatedCostUsd, 0) +
        this.gatewayUsage.filter((entry) => entry.runId === runId).reduce((sum, entry) => sum + entry.estimatedCostUsd, 0),
    );
  }
}
