import { describe, expect, it } from "bun:test";

import {
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
