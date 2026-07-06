import { describe, expect, it } from "vitest";

import { getOryntPlan, listOryntPlans, summarizePlanQuota } from "./productPlans";

describe("Orynt product plan config", () => {
  it("defines Core BYOK, Managed AI, and Pro/Gateway without mixing BYOK and managed AI usage", () => {
    const plans = listOryntPlans();

    expect(plans.map((plan) => plan.id)).toEqual(["core-byok", "managed-ai", "pro-gateway"]);
    expect(getOryntPlan("core-byok")).toMatchObject({
      byokRequired: true,
      managedAiIncluded: false,
      monthlyManagedAiCredits: 0,
    });
    expect(getOryntPlan("managed-ai")).toMatchObject({
      byokRequired: false,
      managedAiIncluded: true,
    });
    expect(getOryntPlan("pro-gateway")).toMatchObject({
      gatewayFeaturesIncluded: true,
      externalPaymentExecutionAllowed: false,
    });
    expect(JSON.stringify(plans).toLowerCase()).not.toContain("payment gateway");
    expect(JSON.stringify(plans).toLowerCase()).not.toContain("marketplace");
  });

  it("summarizes quotas with monthly credit reset even for annual billing experiments", () => {
    const quota = summarizePlanQuota({
      planId: "managed-ai",
      billingCadence: "annual",
      creditsConsumed: 375,
      runsThisMonth: 8,
      gatewayActionsThisMonth: 5,
    });

    expect(quota.planId).toBe("managed-ai");
    expect(quota.billingCadence).toBe("annual");
    expect(quota.creditResetCadence).toBe("monthly");
    expect(quota.monthlyManagedAiCredits).toBeGreaterThan(0);
    expect(quota.remainingManagedAiCredits).toBe(quota.monthlyManagedAiCredits - 375);
    expect(quota.summary).toContain("credits reset monthly");
  });
});
