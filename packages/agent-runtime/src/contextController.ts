import type {
  ContextCapacityProfileV1,
  ContextLifecycleSnapshotV1,
  ContextTelemetryPrecision,
  ContextTokenBreakdownV1,
} from "@codepawl/shared";

export type ContextPreflightDecision = {
  action: "continue" | "warn" | "compact" | "block";
  projectedTokens?: number;
  projectedPercent?: number;
  reason:
    | "capacity_unknown"
    | "within_budget"
    | "warning_threshold"
    | "compact_threshold"
    | "hard_threshold";
};

export type ContextControllerOptions = {
  modelId: string;
  capacity?: Partial<Omit<ContextCapacityProfileV1, "schemaVersion" | "modelId">>;
  snapshot?: ContextLifecycleSnapshotV1;
  now?: () => string;
};

const WARN_PERCENT = 75;
const COMPACT_PERCENT = 85;
const HARD_PERCENT = 95;

function boundedTokenCount(value: number | undefined): number | undefined {
  if (!Number.isFinite(value) || value === undefined) return undefined;
  return Math.max(0, Math.trunc(value));
}

function currentContextTokens(
  usage: ContextTokenBreakdownV1 | undefined,
): number | undefined {
  if (!usage) return undefined;
  return Math.max(
    0,
    usage.totalTokens,
    usage.inputTokens + usage.outputTokens,
  );
}

export function estimateContextTokens(value: string): number {
  return Math.max(1, Math.ceil(Buffer.byteLength(value, "utf8") / 4));
}

export class ContextController {
  private readonly now: () => string;
  private snapshotValue: ContextLifecycleSnapshotV1;

  constructor(options: ContextControllerOptions) {
    this.now = options.now ?? (() => new Date().toISOString());
    if (options.snapshot) {
      this.snapshotValue = structuredClone(options.snapshot);
      return;
    }
    const contextWindowTokens = boundedTokenCount(
      options.capacity?.contextWindowTokens,
    );
    const effectiveWindowTokens = boundedTokenCount(
      options.capacity?.effectiveWindowTokens,
    );
    const providerAutoCompactAtTokens = boundedTokenCount(
      options.capacity?.providerAutoCompactAtTokens,
    );
    const hasKnownCapacity =
      contextWindowTokens !== undefined ||
      effectiveWindowTokens !== undefined;
    this.snapshotValue = {
      schemaVersion: 1,
      state: hasKnownCapacity ? "healthy" : "unknown",
      capacity: {
        schemaVersion: 1,
        modelId: options.modelId,
        source: options.capacity?.source ?? "unknown",
        ...(contextWindowTokens !== undefined
          ? { contextWindowTokens }
          : {}),
        ...(effectiveWindowTokens !== undefined
          ? { effectiveWindowTokens }
          : {}),
        ...(providerAutoCompactAtTokens !== undefined
          ? { providerAutoCompactAtTokens }
          : {}),
      },
      usage: {
        schemaVersion: 1,
        ...(hasKnownCapacity
          ? {
              usedTokens: 0,
              usedPercent: 0,
              ...(effectiveWindowTokens !== undefined
                ? { remainingTokens: effectiveWindowTokens }
                : {}),
            }
          : {}),
        precision: hasKnownCapacity ? "estimated" : "unknown",
        observedAt: this.now(),
      },
      thresholds: {
        warnPercent: WARN_PERCENT,
        compactPercent: COMPACT_PERCENT,
        hardPercent: HARD_PERCENT,
      },
      providerThreadGeneration: 0,
      compactionCount: 0,
      recoveryCount: 0,
      overflowRetryCount: 0,
    };
  }

  snapshot(): ContextLifecycleSnapshotV1 {
    return structuredClone(this.snapshotValue);
  }

  updateCapacity(
    capacity: Partial<Omit<ContextCapacityProfileV1, "schemaVersion" | "modelId">>,
  ): ContextLifecycleSnapshotV1 {
    const contextWindowTokens = boundedTokenCount(capacity.contextWindowTokens);
    const effectiveWindowTokens = boundedTokenCount(
      capacity.effectiveWindowTokens,
    );
    const providerAutoCompactAtTokens = boundedTokenCount(
      capacity.providerAutoCompactAtTokens,
    );
    const source =
      capacity.source === "unknown" &&
        this.snapshotValue.capacity.source !== "unknown"
        ? this.snapshotValue.capacity.source
        : capacity.source;
    this.snapshotValue.capacity = {
      ...this.snapshotValue.capacity,
      ...(contextWindowTokens !== undefined ? { contextWindowTokens } : {}),
      ...(effectiveWindowTokens !== undefined
        ? { effectiveWindowTokens }
        : {}),
      ...(providerAutoCompactAtTokens !== undefined
        ? { providerAutoCompactAtTokens }
        : {}),
      ...(source ? { source } : {}),
      schemaVersion: 1,
      modelId: this.snapshotValue.capacity.modelId,
    };
    this.recalculate();
    return this.snapshot();
  }

  recordUsage(input: {
    current?: ContextTokenBreakdownV1;
    cumulative?: ContextTokenBreakdownV1;
    precision: ContextTelemetryPrecision;
  }): ContextLifecycleSnapshotV1 {
    this.snapshotValue.usage = {
      schemaVersion: 1,
      ...(input.current ? { current: structuredClone(input.current) } : {}),
      ...(input.cumulative
        ? { cumulative: structuredClone(input.cumulative) }
        : {}),
      precision: input.precision,
      observedAt: this.now(),
    };
    this.recalculate();
    return this.snapshot();
  }

  preflight(prompt: string): ContextPreflightDecision {
    const capacity = this.snapshotValue.capacity.effectiveWindowTokens;
    const current = this.snapshotValue.usage.usedTokens ?? 0;
    const projectedTokens = current + estimateContextTokens(prompt);
    this.snapshotValue.usage.projectedNextInputTokens = projectedTokens;
    if (!capacity || capacity <= 0) {
      return {
        action: "continue",
        projectedTokens,
        reason: "capacity_unknown",
      };
    }
    const projectedPercent = Math.min(
      100,
      (projectedTokens / capacity) * 100,
    );
    if (projectedPercent >= HARD_PERCENT) {
      return {
        action: "block",
        projectedTokens,
        projectedPercent,
        reason: "hard_threshold",
      };
    }
    const providerThreshold =
      this.snapshotValue.capacity.providerAutoCompactAtTokens;
    const compactAt = Math.min(
      capacity * (COMPACT_PERCENT / 100),
      providerThreshold ?? Number.POSITIVE_INFINITY,
    );
    if (projectedTokens >= compactAt) {
      return {
        action: "compact",
        projectedTokens,
        projectedPercent,
        reason: "compact_threshold",
      };
    }
    if (projectedPercent >= WARN_PERCENT) {
      return {
        action: "warn",
        projectedTokens,
        projectedPercent,
        reason: "warning_threshold",
      };
    }
    return {
      action: "continue",
      projectedTokens,
      projectedPercent,
      reason: "within_budget",
    };
  }

  beginCompaction(): ContextLifecycleSnapshotV1 {
    this.snapshotValue.state = "compacting";
    return this.snapshot();
  }

  completeCompaction(input: {
    usage?: ContextTokenBreakdownV1;
    checkpointId?: string;
    contextPackId?: string;
    rotatedProviderThread?: boolean;
  } = {}): ContextLifecycleSnapshotV1 {
    this.snapshotValue.compactionCount += 1;
    this.snapshotValue.lastCompactedAt = this.now();
    this.snapshotValue.state = "recovered";
    delete this.snapshotValue.lastErrorCode;
    if (input.rotatedProviderThread) {
      this.snapshotValue.providerThreadGeneration += 1;
      this.snapshotValue.recoveryCount += 1;
    }
    if (input.checkpointId) {
      this.snapshotValue.lastCheckpointId = input.checkpointId;
    }
    if (input.contextPackId) {
      this.snapshotValue.lastContextPackId = input.contextPackId;
    }
    if (input.usage) {
      this.recordUsage({
        current: input.usage,
        precision: "provider",
      });
      this.snapshotValue.state = "recovered";
    }
    return this.snapshot();
  }

  recordOverflowRetry(): ContextLifecycleSnapshotV1 {
    this.snapshotValue.overflowRetryCount += 1;
    this.snapshotValue.lastErrorCode = "ContextWindowExceeded";
    return this.snapshot();
  }

  block(errorCode: string): ContextLifecycleSnapshotV1 {
    this.snapshotValue.state = "blocked";
    this.snapshotValue.lastErrorCode = errorCode.slice(0, 120);
    return this.snapshot();
  }

  private recalculate(): void {
    const capacity = this.snapshotValue.capacity.effectiveWindowTokens;
    const usedTokens =
      currentContextTokens(this.snapshotValue.usage.current) ??
      boundedTokenCount(this.snapshotValue.usage.usedTokens);
    if (usedTokens === undefined) {
      this.snapshotValue.state =
        this.snapshotValue.state === "compacting"
          ? "compacting"
          : "unknown";
      return;
    }
    this.snapshotValue.usage.usedTokens = usedTokens;
    if (!capacity || capacity <= 0) {
      delete this.snapshotValue.usage.remainingTokens;
      delete this.snapshotValue.usage.usedPercent;
      this.snapshotValue.state =
        this.snapshotValue.state === "compacting"
          ? "compacting"
          : "healthy";
      return;
    }
    const usedPercent = Math.min(100, (usedTokens / capacity) * 100);
    this.snapshotValue.usage.remainingTokens = Math.max(
      0,
      capacity - usedTokens,
    );
    this.snapshotValue.usage.usedPercent = usedPercent;
    if (this.snapshotValue.state === "compacting") return;
    this.snapshotValue.state =
      usedPercent >= HARD_PERCENT
        ? "blocked"
        : usedPercent >= WARN_PERCENT
          ? "warning"
          : "healthy";
  }
}
