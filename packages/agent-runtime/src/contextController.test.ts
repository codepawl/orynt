import { describe, expect, it } from "bun:test";

import { ContextController, estimateContextTokens } from "./contextController";

function usage(totalTokens: number) {
  return {
    inputTokens: totalTokens,
    cachedInputTokens: 0,
    outputTokens: 0,
    reasoningOutputTokens: 0,
    totalTokens,
  };
}

describe("context controller", () => {
  it("starts known model capacity at zero usage", () => {
    const controller = new ContextController({
      modelId: "gpt-test",
      capacity: {
        contextWindowTokens: 272_000,
        effectiveWindowTokens: 258_400,
        source: "model_catalog",
      },
      now: () => "2026-08-05T00:00:00.000Z",
    });

    expect(controller.snapshot()).toMatchObject({
      state: "healthy",
      capacity: {
        contextWindowTokens: 272_000,
        effectiveWindowTokens: 258_400,
        source: "model_catalog",
      },
      usage: {
        usedTokens: 0,
        usedPercent: 0,
        remainingTokens: 258_400,
        precision: "estimated",
      },
    });
  });

  it("does not let unknown provider capacity erase catalog metadata", () => {
    const controller = new ContextController({
      modelId: "gpt-test",
      capacity: {
        contextWindowTokens: 272_000,
        effectiveWindowTokens: 258_400,
        source: "model_catalog",
      },
    });

    controller.updateCapacity({ source: "unknown" });
    expect(controller.snapshot().capacity).toMatchObject({
      contextWindowTokens: 272_000,
      effectiveWindowTokens: 258_400,
      source: "model_catalog",
    });

    controller.updateCapacity({
      effectiveWindowTokens: 250_000,
      source: "provider_event",
    });
    expect(controller.snapshot().capacity).toMatchObject({
      contextWindowTokens: 272_000,
      effectiveWindowTokens: 250_000,
      source: "provider_event",
    });
  });

  it("uses the 75/85/95 policy against the effective window", () => {
    const controller = new ContextController({
      modelId: "gpt-test",
      capacity: {
        effectiveWindowTokens: 100_000,
        source: "provider_event",
      },
      now: () => "2026-08-05T00:00:00.000Z",
    });

    controller.recordUsage({ current: usage(74_000), precision: "provider" });
    expect(controller.preflight("x".repeat(4_000)).action).toBe("warn");

    controller.recordUsage({ current: usage(84_000), precision: "provider" });
    expect(controller.preflight("x".repeat(4_000)).action).toBe("compact");

    controller.recordUsage({ current: usage(94_000), precision: "provider" });
    expect(controller.preflight("x".repeat(4_000)).action).toBe("block");
  });

  it("honors an earlier provider compact threshold", () => {
    const controller = new ContextController({
      modelId: "gpt-test",
      capacity: {
        effectiveWindowTokens: 100_000,
        providerAutoCompactAtTokens: 80_000,
        source: "model_catalog",
      },
    });
    controller.recordUsage({ current: usage(79_500), precision: "provider" });
    expect(controller.preflight("x".repeat(2_000)).action).toBe("compact");
  });

  it("does not fabricate percentages when capacity is unknown", () => {
    const controller = new ContextController({ modelId: "unknown" });
    controller.recordUsage({ current: usage(12_000), precision: "provider" });
    expect(controller.snapshot().usage.usedPercent).toBeUndefined();
    expect(controller.preflight("hello")).toMatchObject({
      action: "continue",
      reason: "capacity_unknown",
    });
  });

  it("tracks compaction, provider rotation, and a single overflow retry", () => {
    const controller = new ContextController({ modelId: "gpt-test" });
    controller.beginCompaction();
    controller.recordOverflowRetry();
    controller.completeCompaction({
      checkpointId: "checkpoint-1",
      contextPackId: "pack-1",
      rotatedProviderThread: true,
    });
    expect(controller.snapshot()).toMatchObject({
      state: "recovered",
      providerThreadGeneration: 1,
      compactionCount: 1,
      recoveryCount: 1,
      overflowRetryCount: 1,
      lastCheckpointId: "checkpoint-1",
      lastContextPackId: "pack-1",
    });
  });

  it("uses a bounded deterministic preflight estimator", () => {
    expect(estimateContextTokens("hello")).toBe(2);
    expect(estimateContextTokens("")).toBe(1);
  });
});
