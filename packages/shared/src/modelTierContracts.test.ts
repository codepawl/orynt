import { describe, expect, it } from "bun:test";

import {
  createClaudeModelTierConfiguration,
  createOpencodeGoModelTierConfiguration,
  createDefaultModelTierConfiguration,
  createSingleModelTierConfiguration,
  isModelTierConfiguration,
  ModelTierUnavailableError,
  resolveExactTierBinding,
  routeModelTier,
} from "./modelTierContracts";

describe("model tier contracts", () => {
  it("creates a valid editable three-tier configuration", () => {
    const configuration = createDefaultModelTierConfiguration();
    expect(isModelTierConfiguration(configuration)).toBe(true);
    expect(configuration.roles).toEqual({
      coordinator: "medium",
      implementer: "medium",
      helper: "light",
      reviewer: "heavy",
    });
  });

  it("copies a legacy single model without changing behavior", () => {
    const configuration = createSingleModelTierConfiguration(
      "gpt-current",
      "high",
      "openai-api",
    );
    expect(
      new Set(
        Object.values(configuration.tiers).map(
          ({ providerId, modelId }) => `${providerId}/${modelId}`,
        ),
      ),
    ).toEqual(new Set(["openai-api/gpt-current"]));
    expect(configuration.needsTierReview).toBe(true);
  });

  it("routes conservatively and only raises an operator minimum", () => {
    const configuration = createDefaultModelTierConfiguration();
    expect(
      routeModelTier(configuration, {
        role: "helper",
        stage: "helper",
        authority: "read_only",
        instruction: "Summarize the parser.",
      }).selectedTier,
    ).toBe("light");
    expect(
      routeModelTier(configuration, {
        role: "implementer",
        stage: "implementation",
        authority: "single_writer",
        instruction: "Fix one parser branch.",
        requestedMinimumTier: "light",
      }).selectedTier,
    ).toBe("medium");
    expect(
      routeModelTier(configuration, {
        role: "implementer",
        stage: "implementation",
        authority: "single_writer",
        instruction: "Migrate authentication permissions.",
      }).selectedTier,
    ).toBe("heavy");
    expect(
      routeModelTier(configuration, {
        role: "coordinator",
        stage: "recovery",
        instruction: "Retry after verifier failure.",
      }).selectedTier,
    ).toBe("heavy");
  });

  it("does not elevate negated safety boundaries but retains positive risk", () => {
    const configuration = createDefaultModelTierConfiguration();
    expect(
      routeModelTier(configuration, {
        role: "implementer",
        stage: "implementation",
        authority: "single_writer",
        instruction:
          "Update the calculator. Do not access secrets, credentials, or the network.",
        operations: ["write"],
      }),
    ).toMatchObject({
      selectedTier: "medium",
      reasonCodes: ["role_baseline", "mutable_work"],
    });
    expect(
      routeModelTier(configuration, {
        role: "implementer",
        stage: "implementation",
        authority: "single_writer",
        instruction:
          "Implement authentication, but do not access secrets or credentials.",
        operations: ["write"],
      }).selectedTier,
    ).toBe("heavy");
    expect(
      routeModelTier(configuration, {
        role: "implementer",
        stage: "implementation",
        authority: "single_writer",
        instruction: "Không truy cập secrets hoặc credentials.",
        operations: ["write"],
      }).selectedTier,
    ).toBe("medium");
  });

  it("accepts anthropic-api bindings and mixed-provider tiers", () => {
    const configuration = createDefaultModelTierConfiguration();
    const mixed = {
      ...configuration,
      tiers: {
        ...configuration.tiers,
        light: {
          ...configuration.tiers.light,
          providerId: "anthropic-api" as const,
          modelId: "claude-haiku-4-5",
        },
      },
    };
    expect(isModelTierConfiguration(mixed)).toBe(true);
    expect(
      isModelTierConfiguration({
        ...mixed,
        tiers: {
          ...mixed.tiers,
          light: { ...mixed.tiers.light, providerId: "anthropic-cli" },
        },
      }),
    ).toBe(false);
  });

  it("builds a valid all-Anthropic tier configuration", () => {
    const configuration = createClaudeModelTierConfiguration();
    expect(isModelTierConfiguration(configuration)).toBe(true);
    expect(
      Object.values(configuration.tiers).map((binding) => binding.providerId),
    ).toEqual(["anthropic-api", "anthropic-api", "anthropic-api"]);
    expect(configuration.needsTierReview).toBe(false);
    // Heavy stays at `high`: MODEL_TIER_INVOCATION_CAPS caps heavy at 20
    // minutes of wall time, which `xhigh` on a 1M-context model exceeds.
    expect(configuration.tiers.heavy.thinkingEffort).toBe("high");
  });

  it("leaves the default configuration on Codex", () => {
    expect(
      Object.values(createDefaultModelTierConfiguration().tiers).every(
        (binding) => binding.providerId === "codex-cli",
      ),
    ).toBe(true);
  });

  it("blocks unavailable models and unsupported effort without fallback", () => {
    const configuration = createDefaultModelTierConfiguration();
    const decision = routeModelTier(configuration, {
      role: "helper",
      stage: "helper",
      authority: "read_only",
      instruction: "Inspect one file.",
    });
    expect(() => resolveExactTierBinding(configuration, decision, [])).toThrow(
      ModelTierUnavailableError,
    );
    expect(() =>
      resolveExactTierBinding(configuration, decision, [
        {
          providerId: "codex-cli",
          id: "gpt-5.6-luna",
          supportedThinkingEfforts: ["high"],
        },
      ]),
    ).toThrow("effort is unavailable");
  });
});

describe("OpenCode Go tier defaults", () => {
  it("binds every tier to the OpenCode provider and a verified model id", () => {
    const configuration = createOpencodeGoModelTierConfiguration();
    const observedCatalog = new Set([
      "deepseek-v4-flash",
      "glm-5.2",
      "gpt-5.6-luna",
    ]);

    for (const tier of ["light", "medium", "heavy"] as const) {
      const binding = configuration.tiers[tier];
      expect(binding.providerId).toBe("opencode-api");
      // Guards against a tier drifting onto an Anthropic or Codex model id,
      // which the gateway does not serve and which would fail at the first turn.
      expect(observedCatalog.has(binding.modelId)).toBe(true);
    }
    expect(configuration.needsTierReview).toBe(false);
  });

  it("escalates model strength with tier", () => {
    const { tiers } = createOpencodeGoModelTierConfiguration();
    expect(tiers.light.modelId).not.toBe(tiers.heavy.modelId);
    expect(tiers.heavy.modelId).toBe("gpt-5.6-luna");
  });
});
