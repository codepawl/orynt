export type CodePawlPlanId = "core-byok" | "managed-ai" | "pro-gateway";

export type BillingCadence = "monthly" | "quarterly" | "annual";

export type CodePawlPlanConfig = {
  id: CodePawlPlanId;
  name: string;
  paddleProductName: string;
  paddleDescription: string;
  byokRequired: boolean;
  managedAiIncluded: boolean;
  monthlyManagedAiCredits: number;
  monthlyRunLimit: number;
  monthlyGatewayActionLimit: number;
  gatewayFeaturesIncluded: boolean;
  creditResetCadence: "monthly";
  externalPaymentExecutionAllowed: false;
};

export type PlanQuotaSummaryInput = {
  planId: CodePawlPlanId;
  billingCadence: BillingCadence;
  creditsConsumed: number;
  runsThisMonth: number;
  gatewayActionsThisMonth: number;
};

export type PlanQuotaSummary = {
  planId: CodePawlPlanId;
  planName: string;
  billingCadence: BillingCadence;
  creditResetCadence: "monthly";
  monthlyManagedAiCredits: number;
  remainingManagedAiCredits: number;
  monthlyRunLimit: number;
  remainingRuns: number;
  monthlyGatewayActionLimit: number;
  remainingGatewayActions: number;
  summary: string;
};

const CODEPAWL_PLANS: CodePawlPlanConfig[] = [
  {
    id: "core-byok",
    name: "Core BYOK",
    paddleProductName: "CodePawl Core BYOK",
    paddleDescription: "Local supervised agent control plane for customers who bring their own model provider keys.",
    byokRequired: true,
    managedAiIncluded: false,
    monthlyManagedAiCredits: 0,
    monthlyRunLimit: 120,
    monthlyGatewayActionLimit: 250,
    gatewayFeaturesIncluded: false,
    creditResetCadence: "monthly",
    externalPaymentExecutionAllowed: false,
  },
  {
    id: "managed-ai",
    name: "Managed AI",
    paddleProductName: "CodePawl Managed AI",
    paddleDescription: "Supervised CodePawl runs with included managed AI credits, local permission controls, and monthly usage limits.",
    byokRequired: false,
    managedAiIncluded: true,
    monthlyManagedAiCredits: 2500,
    monthlyRunLimit: 300,
    monthlyGatewayActionLimit: 750,
    gatewayFeaturesIncluded: false,
    creditResetCadence: "monthly",
    externalPaymentExecutionAllowed: false,
  },
  {
    id: "pro-gateway",
    name: "Pro/Gateway",
    paddleProductName: "CodePawl Pro Gateway",
    paddleDescription: "Advanced supervised computer-use controls, audit evidence, and gateway action quotas for private beta operators.",
    byokRequired: false,
    managedAiIncluded: true,
    monthlyManagedAiCredits: 10000,
    monthlyRunLimit: 1000,
    monthlyGatewayActionLimit: 3000,
    gatewayFeaturesIncluded: true,
    creditResetCadence: "monthly",
    externalPaymentExecutionAllowed: false,
  },
];

export function listCodePawlPlans(): CodePawlPlanConfig[] {
  return CODEPAWL_PLANS.map((plan) => ({ ...plan }));
}

export function getCodePawlPlan(id: CodePawlPlanId): CodePawlPlanConfig {
  const plan = CODEPAWL_PLANS.find((item) => item.id === id);
  if (!plan) {
    throw new Error(`unknown CodePawl plan: ${id}`);
  }
  return { ...plan };
}

export function summarizePlanQuota(input: PlanQuotaSummaryInput): PlanQuotaSummary {
  const plan = getCodePawlPlan(input.planId);
  const remainingManagedAiCredits = Math.max(0, plan.monthlyManagedAiCredits - input.creditsConsumed);
  const remainingRuns = Math.max(0, plan.monthlyRunLimit - input.runsThisMonth);
  const remainingGatewayActions = Math.max(0, plan.monthlyGatewayActionLimit - input.gatewayActionsThisMonth);
  return {
    planId: plan.id,
    planName: plan.name,
    billingCadence: input.billingCadence,
    creditResetCadence: plan.creditResetCadence,
    monthlyManagedAiCredits: plan.monthlyManagedAiCredits,
    remainingManagedAiCredits,
    monthlyRunLimit: plan.monthlyRunLimit,
    remainingRuns,
    monthlyGatewayActionLimit: plan.monthlyGatewayActionLimit,
    remainingGatewayActions,
    summary: `${plan.name}: ${plan.monthlyManagedAiCredits.toLocaleString()} managed AI credits reset monthly.`,
  };
}
