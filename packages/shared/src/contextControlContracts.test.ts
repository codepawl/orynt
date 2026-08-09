import { describe, expect, it } from "bun:test";

import {
  validateContextLifecycleSnapshotV1,
  type ContextLifecycleSnapshotV1,
} from "./contextControlContracts";

function snapshot(): ContextLifecycleSnapshotV1 {
  return {
    schemaVersion: 1,
    state: "healthy",
    capacity: {
      schemaVersion: 1,
      modelId: "gpt-test",
      effectiveWindowTokens: 100_000,
      source: "provider_event",
    },
    usage: {
      schemaVersion: 1,
      usedTokens: 42_000,
      remainingTokens: 58_000,
      usedPercent: 42,
      precision: "provider",
      observedAt: "2026-08-05T00:00:00.000Z",
    },
    thresholds: {
      warnPercent: 75,
      compactPercent: 85,
      hardPercent: 95,
    },
    providerThreadGeneration: 0,
    compactionCount: 0,
    recoveryCount: 0,
    overflowRetryCount: 0,
  };
}

describe("context control contracts", () => {
  it("accepts a bounded normalized lifecycle snapshot", () => {
    expect(() => validateContextLifecycleSnapshotV1(snapshot())).not.toThrow();
  });

  it("rejects negative token counts and threshold drift", () => {
    const negative = snapshot();
    negative.usage.current = {
      inputTokens: -1,
      cachedInputTokens: 0,
      outputTokens: 0,
      reasoningOutputTokens: 0,
      totalTokens: 0,
    };
    expect(() => validateContextLifecycleSnapshotV1(negative)).toThrow(
      "Invalid context token breakdown",
    );

    const drift = snapshot();
    drift.thresholds.compactPercent = 80 as 85;
    expect(() => validateContextLifecycleSnapshotV1(drift)).toThrow(
      "Invalid context lifecycle snapshot",
    );
  });
});
