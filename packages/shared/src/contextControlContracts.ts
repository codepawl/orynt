export type ContextTelemetryPrecision =
  | "provider"
  | "estimated"
  | "unknown";

export type ContextCapacitySource =
  | "provider_event"
  | "model_catalog"
  | "configured_fallback"
  | "unknown";

export type ContextLifecycleState =
  | "unknown"
  | "healthy"
  | "warning"
  | "compacting"
  | "recovered"
  | "blocked";

export type ContextTokenBreakdownV1 = {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
  totalTokens: number;
};

export type ContextCapacityProfileV1 = {
  schemaVersion: 1;
  modelId: string;
  contextWindowTokens?: number;
  effectiveWindowTokens?: number;
  providerAutoCompactAtTokens?: number;
  source: ContextCapacitySource;
};

export type ContextUsageSnapshotV1 = {
  schemaVersion: 1;
  current?: ContextTokenBreakdownV1;
  cumulative?: ContextTokenBreakdownV1;
  projectedNextInputTokens?: number;
  usedTokens?: number;
  remainingTokens?: number;
  usedPercent?: number;
  precision: ContextTelemetryPrecision;
  observedAt: string;
};

export type ContextLifecycleSnapshotV1 = {
  schemaVersion: 1;
  state: ContextLifecycleState;
  capacity: ContextCapacityProfileV1;
  usage: ContextUsageSnapshotV1;
  thresholds: {
    warnPercent: 75;
    compactPercent: 85;
    hardPercent: 95;
  };
  providerThreadGeneration: number;
  compactionCount: number;
  recoveryCount: number;
  overflowRetryCount: number;
  lastCompactedAt?: string;
  lastCheckpointId?: string;
  lastContextPackId?: string;
  lastErrorCode?: string;
};

export type CliTranscriptEntryV1 = {
  schemaVersion: 1;
  sequence: number;
  logicalTurnId: string;
  role: "user" | "agent";
  content: string;
  recordedAt: string;
  previousHash?: string;
  contentHash: string;
};

function nonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

export function validateContextTokenBreakdownV1(
  value: ContextTokenBreakdownV1,
): void {
  for (const tokenCount of [
    value.inputTokens,
    value.cachedInputTokens,
    value.outputTokens,
    value.reasoningOutputTokens,
    value.totalTokens,
  ]) {
    if (!nonNegativeInteger(tokenCount)) {
      throw new Error("Invalid context token breakdown");
    }
  }
}

export function validateContextLifecycleSnapshotV1(
  value: ContextLifecycleSnapshotV1,
): void {
  if (
    value.schemaVersion !== 1 ||
    value.capacity.schemaVersion !== 1 ||
    value.usage.schemaVersion !== 1 ||
    value.thresholds.warnPercent !== 75 ||
    value.thresholds.compactPercent !== 85 ||
    value.thresholds.hardPercent !== 95 ||
    !nonNegativeInteger(value.providerThreadGeneration) ||
    !nonNegativeInteger(value.compactionCount) ||
    !nonNegativeInteger(value.recoveryCount) ||
    !nonNegativeInteger(value.overflowRetryCount)
  ) {
    throw new Error("Invalid context lifecycle snapshot");
  }
  if (value.usage.current) {
    validateContextTokenBreakdownV1(value.usage.current);
  }
  if (value.usage.cumulative) {
    validateContextTokenBreakdownV1(value.usage.cumulative);
  }
}
