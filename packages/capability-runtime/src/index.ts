import { createHash } from "node:crypto";

import {
  IMMUTABLE_AUTO_IMPROVEMENT_TARGETS,
  validateCapabilityRuntimeSettings,
  type CapabilityDescriptorV1,
  type CapabilityBenchmarkSummaryV1,
  type CapabilityBenchmarkTrialV1,
  type CapabilityOutcomeV1,
  type CapabilityRuntimeSettingsV1,
  type CapabilitySelectionDecisionV1,
  type CapabilitySelectionPlanV1,
  type CapabilitySelectionRequestV1,
  type ImprovementCandidateV1,
  type ImprovementPromotionDecisionV1,
} from "@codepawl/shared";

export type CapabilityRouterWeights = {
  lexical: number;
  input: number;
  output: number;
  verified: number;
  latency: number;
  ownedTrust: number;
};

export const DEFAULT_CAPABILITY_ROUTER_WEIGHTS: CapabilityRouterWeights = {
  lexical: 0.12,
  input: 0.15,
  output: 0.15,
  verified: 0.35,
  latency: 0.1,
  ownedTrust: 0.13,
};

export * from "./ledger.js";
export * from "./improvementRuntime.js";
export * from "./multimodal.js";

const ROUTER_POLICY_VERSION = "capability_router_v1" as const;

type RankedCapability = {
  descriptor: CapabilityDescriptorV1;
  score: number;
  reasonCodes: string[];
};

function tokens(value: string): Set<string> {
  return new Set(
    value
      .toLocaleLowerCase("en-US")
      .split(/[^\p{L}\p{N}._-]+/u)
      .map((token) => token.trim())
      .filter((token) => token.length > 1),
  );
}

function overlap(left: Iterable<string>, right: Iterable<string>): number {
  const rightSet = new Set(right);
  let count = 0;
  for (const value of left) {
    if (rightSet.has(value)) count += 1;
  }
  return count;
}

function pathWithinScope(repositoryPath: string, scope: string): boolean {
  if (scope === "**" || scope === "*") return true;
  const normalizedRepository = repositoryPath.replace(/\/+$/, "");
  const normalizedScope = scope.replace(/\/+$/, "");
  return (
    normalizedRepository === normalizedScope ||
    normalizedRepository.startsWith(`${normalizedScope}/`)
  );
}

function hardFilterReasons(
  descriptor: CapabilityDescriptorV1,
  request: CapabilitySelectionRequestV1,
): string[] {
  const reasons: string[] = [];
  if (descriptor.health !== "healthy") reasons.push("health_not_healthy");
  if (descriptor.auth === "missing") reasons.push("auth_missing");
  if (
    descriptor.environment.length > 0 &&
    !descriptor.environment.every((item) => request.environment.includes(item))
  ) {
    reasons.push("environment_mismatch");
  }
  if (
    request.requiredKinds?.length &&
    !request.requiredKinds.includes(descriptor.kind)
  ) {
    reasons.push("kind_mismatch");
  }
  if (
    descriptor.repositoryScopes.length > 0 &&
    (!request.repositoryPath ||
      !descriptor.repositoryScopes.some((scope) =>
        pathWithinScope(request.repositoryPath!, scope),
      ))
  ) {
    reasons.push("repository_scope_mismatch");
  }
  if (
    descriptor.kind === "app_connector" ||
    descriptor.kind === "mcp_server"
  ) {
    if (!request.connectedCapabilityIds?.includes(descriptor.id)) {
      reasons.push("connector_not_connected");
    }
  }
  return reasons;
}

function rankCapability(
  descriptor: CapabilityDescriptorV1,
  request: CapabilitySelectionRequestV1,
  outcomes: CapabilityOutcomeV1[],
  weights: CapabilityRouterWeights,
): RankedCapability {
  const intentTokens = tokens(request.intent);
  const descriptorTokens = tokens(
    [
      descriptor.title,
      descriptor.summary,
      descriptor.namespace,
      ...descriptor.tags,
      ...descriptor.inputKinds,
      ...descriptor.outputKinds,
      ...descriptor.toolNames,
    ].join(" "),
  );
  const lexicalMatches = overlap(intentTokens, descriptorTokens);
  const inputMatches = overlap(
    request.inputKinds ?? [],
    descriptor.inputKinds,
  );
  const outputMatches = overlap(
    request.outputKinds ?? [],
    descriptor.outputKinds,
  );
  const history = outcomes.filter(
    (outcome) =>
      outcome.capabilityId === descriptor.id &&
      outcome.capabilityDigest === descriptor.digest &&
      outcome.policyPassed &&
      outcome.unsafeActionCount === 0,
  );
  const verifiedRate =
    history.length === 0
      ? 0.5
      : history.filter((outcome) => outcome.verifierPassed).length /
        history.length;
  const latencyScore =
    history.length === 0
      ? 0.5
      : Math.max(
          0,
          1 -
            history.reduce((sum, outcome) => sum + outcome.latencyMs, 0) /
              history.length /
              30_000,
        );
  const score = Math.min(
    1,
    lexicalMatches * weights.lexical +
      inputMatches * weights.input +
      outputMatches * weights.output +
      verifiedRate * weights.verified +
      latencyScore * weights.latency +
      (descriptor.trust === "builtin" || descriptor.trust === "user_owned"
        ? weights.ownedTrust
        : 0),
  );
  return {
    descriptor,
    score: Number(score.toFixed(6)),
    reasonCodes: [
      ...(lexicalMatches > 0 ? ["intent_match"] : []),
      ...(inputMatches > 0 ? ["input_match"] : []),
      ...(outputMatches > 0 ? ["output_match"] : []),
      ...(history.length > 0 ? ["verified_history"] : ["neutral_history"]),
      ...(descriptor.trust === "builtin" ||
      descriptor.trust === "user_owned"
        ? ["owned_trust_tier"]
        : []),
    ],
  };
}

function decision(
  ranked: RankedCapability,
  disposition: CapabilitySelectionDecisionV1["disposition"],
  reasonCodes = ranked.reasonCodes,
): CapabilitySelectionDecisionV1 {
  return {
    capabilityId: ranked.descriptor.id,
    version: ranked.descriptor.version,
    digest: ranked.descriptor.digest,
    score: ranked.score,
    disposition,
    reasonCodes,
  };
}

export function selectCapabilities(input: {
  descriptors: CapabilityDescriptorV1[];
  outcomes?: CapabilityOutcomeV1[];
  request: CapabilitySelectionRequestV1;
  settings: CapabilityRuntimeSettingsV1;
  routerWeights?: CapabilityRouterWeights;
  now?: () => string;
}): CapabilitySelectionPlanV1 {
  validateCapabilityRuntimeSettings(input.settings);
  const excluded: CapabilitySelectionDecisionV1[] = [];
  const ranked: RankedCapability[] = [];
  for (const descriptor of input.descriptors) {
    const filterReasons = hardFilterReasons(descriptor, input.request);
    const candidate = rankCapability(
      descriptor,
      input.request,
      input.outcomes ?? [],
      input.routerWeights ?? DEFAULT_CAPABILITY_ROUTER_WEIGHTS,
    );
    if (input.settings.routingMode === "off") {
      excluded.push(
        decision(candidate, "excluded", ["automatic_routing_disabled"]),
      );
    } else if (filterReasons.length > 0) {
      excluded.push(decision(candidate, "excluded", filterReasons));
    } else {
      ranked.push(candidate);
    }
  }
  ranked.sort(
    (left, right) =>
      right.score - left.score ||
      left.descriptor.id.localeCompare(right.descriptor.id),
  );

  const namespaces = new Set<string>();
  const selected: CapabilitySelectionDecisionV1[] = [];
  const toolNames: string[] = [];
  for (const candidate of ranked) {
    const { descriptor } = candidate;
    if (
      !namespaces.has(descriptor.namespace) &&
      namespaces.size >= input.settings.maxNamespaces
    ) {
      excluded.push(
        decision(candidate, "excluded", ["namespace_budget_exceeded"]),
      );
      continue;
    }
    namespaces.add(descriptor.namespace);
    const disposition =
      descriptor.risk === "read_only"
        ? "auto_attached"
        : "approval_required";
    selected.push(decision(candidate, disposition));
    for (const toolName of descriptor.toolNames) {
      if (
        toolNames.filter((name) =>
          name.startsWith(`${descriptor.namespace}.`),
        ).length >= input.settings.maxToolsPerNamespace
      ) {
        break;
      }
      toolNames.push(
        toolName.includes(".")
          ? toolName
          : `${descriptor.namespace}.${toolName}`,
      );
    }
  }

  const canonical = {
    runId: input.request.runId,
    taskId: input.request.taskId,
    policyVersion: ROUTER_POLICY_VERSION,
    selected,
    namespaces: [...namespaces],
    toolNames,
  };
  return {
    schemaVersion: 1,
    runId: input.request.runId,
    taskId: input.request.taskId,
    policyVersion: ROUTER_POLICY_VERSION,
    selected,
    excluded,
    namespacesLoaded: [...namespaces],
    toolNamesLoaded: toolNames,
    approvalCapabilityIds: selected
      .filter((item) => item.disposition === "approval_required")
      .map((item) => item.capabilityId),
    contextDigest: createHash("sha256")
      .update(JSON.stringify(canonical))
      .digest("hex"),
    createdAt: (input.now ?? (() => new Date().toISOString()))(),
  };
}

export function evaluateImprovementCandidate(
  candidate: ImprovementCandidateV1,
): ImprovementPromotionDecisionV1 {
  const reasons: string[] = [];
  if (IMMUTABLE_AUTO_IMPROVEMENT_TARGETS.has(candidate.targetClass)) {
    return {
      candidateId: candidate.id,
      decision: "rollback",
      reasonCodes: ["immutable_target"],
    };
  }
  const distinctTemplates = new Set(candidate.sourceTaskTemplateIds);
  if (
    candidate.sourceEpisodeIds.length < 5 ||
    distinctTemplates.size < 3
  ) {
    reasons.push("insufficient_source_evidence");
  }
  const evaluation = candidate.evaluation;
  const minimumCases = candidate.targetScope === "user" ? 50 : 30;
  if (evaluation.pairedCaseCount < minimumCases) {
    reasons.push("insufficient_held_out_cases");
  }
  if (
    evaluation.correctnessDelta < 0.05 ||
    evaluation.bootstrapLowerBound95 <= 0
  ) {
    reasons.push("correctness_gate_failed");
  }
  if (
    evaluation.policyPassRate !== 1 ||
    evaluation.unsafeActionCount !== 0 ||
    evaluation.criticalRegressionCount !== 0
  ) {
    reasons.push("safety_or_regression_gate_failed");
  }
  if (
    evaluation.candidateP95LatencyMs >
      evaluation.baselineP95LatencyMs * 1.1 &&
    evaluation.correctnessDelta < 0.1
  ) {
    reasons.push("latency_gate_failed");
  }
  if (
    evaluation.canaryEligibleRunCount < 10 ||
    evaluation.canaryVerifierFailureCount !== 0
  ) {
    reasons.push("canary_gate_failed");
  }
  if (
    candidate.targetScope === "user" &&
    (evaluation.repositoryDomainCount < 2 ||
      evaluation.modelTierCount < 2)
  ) {
    reasons.push("global_transfer_gate_failed");
  }
  return {
    candidateId: candidate.id,
    decision: reasons.length === 0 ? "promote" : "keep_shadow",
    reasonCodes: reasons.length === 0 ? ["all_promotion_gates_passed"] : reasons,
  };
}

export function shouldRollbackImprovement(input: {
  candidate: ImprovementCandidateV1;
  authorityViolation: boolean;
  consecutiveVerifierFailures: number;
  rollingCorrectnessDelta: number;
}): ImprovementPromotionDecisionV1 {
  const reasons: string[] = [];
  if (IMMUTABLE_AUTO_IMPROVEMENT_TARGETS.has(input.candidate.targetClass)) {
    reasons.push("immutable_target");
  }
  if (input.authorityViolation) reasons.push("authority_violation");
  if (input.consecutiveVerifierFailures >= 2) {
    reasons.push("repeated_verifier_failure");
  }
  if (input.rollingCorrectnessDelta < -0.05) {
    reasons.push("rolling_correctness_regression");
  }
  return {
    candidateId: input.candidate.id,
    decision: reasons.length > 0 ? "rollback" : "keep_shadow",
    reasonCodes: reasons.length > 0 ? reasons : ["rollback_not_required"],
  };
}

function quantile(values: number[], percentile: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(percentile * sorted.length) - 1),
  );
  return sorted[index]!;
}

export function evaluateCapabilityBenchmark(
  trials: CapabilityBenchmarkTrialV1[],
): CapabilityBenchmarkSummaryV1 {
  const suites = new Set(trials.map((trial) => trial.suite));
  if (suites.size !== 1) {
    throw new Error("Capability benchmark cannot mix controlled and live trials.");
  }
  const byKey = new Map<
    string,
    Partial<Record<CapabilityBenchmarkTrialV1["system"], CapabilityBenchmarkTrialV1>>
  >();
  for (const trial of trials) {
    const key = `${trial.taskId}:${trial.repetition}`;
    const pair = byKey.get(key) ?? {};
    if (pair[trial.system]) {
      throw new Error(`Duplicate capability benchmark trial: ${key}:${trial.system}`);
    }
    pair[trial.system] = trial;
    byKey.set(key, pair);
  }
  const pairs = [...byKey.values()];
  if (
    pairs.length === 0 ||
    pairs.some((pair) => !pair.orynt || !pair.hermes)
  ) {
    throw new Error("Capability benchmark requires matched Orynt and Hermes trials.");
  }
  const orynt = pairs.map((pair) => pair.orynt!);
  const hermes = pairs.map((pair) => pair.hermes!);
  const rate = (items: CapabilityBenchmarkTrialV1[]): number =>
    items.filter((item) => item.correct).length / items.length;
  const oryntCorrectness = rate(orynt);
  const hermesCorrectness = rate(hermes);
  const oryntP50 = quantile(orynt.map((trial) => trial.latencyMs), 0.5);
  const hermesP50 = quantile(hermes.map((trial) => trial.latencyMs), 0.5);
  const oryntP95 = quantile(orynt.map((trial) => trial.latencyMs), 0.95);
  const hermesP95 = quantile(hermes.map((trial) => trial.latencyMs), 0.95);
  const oryntTokens = orynt.reduce(
    (sum, trial) => sum + trial.disclosedSchemaTokens,
    0,
  );
  const hermesTokens = hermes.reduce(
    (sum, trial) => sum + trial.disclosedSchemaTokens,
    0,
  );
  const schemaTokenReduction =
    hermesTokens === 0 ? 0 : 1 - oryntTokens / hermesTokens;
  const safetyGatePassed = orynt.every(
    (trial) => trial.policyPassed && trial.unsafeActionCount === 0,
  );
  const failed: string[] = [];
  if (pairs.length < 30) failed.push("paired_trial_count_below_30");
  if (oryntCorrectness - hermesCorrectness < 0.1) {
    failed.push("correctness_advantage_below_10pp");
  }
  if (hermesP50 === 0 || oryntP50 > hermesP50 * 0.8) {
    failed.push("p50_latency_target_failed");
  }
  if (hermesP95 === 0 || oryntP95 > hermesP95 * 0.9) {
    failed.push("p95_latency_target_failed");
  }
  if (schemaTokenReduction < 0.7) {
    failed.push("schema_token_reduction_below_70_percent");
  }
  if (
    quantile(
      orynt.map((trial) => trial.manualAttachmentCount),
      0.5,
    ) !== 0
  ) {
    failed.push("manual_attachment_median_not_zero");
  }
  if (!safetyGatePassed) failed.push("safety_gate_failed");
  return {
    schemaVersion: 1,
    suite: trials[0]!.suite,
    pairedTrialCount: pairs.length,
    oryntCorrectness,
    hermesCorrectness,
    correctnessDelta: Number(
      (oryntCorrectness - hermesCorrectness).toFixed(6),
    ),
    oryntP50LatencyMs: oryntP50,
    hermesP50LatencyMs: hermesP50,
    oryntP95LatencyMs: oryntP95,
    hermesP95LatencyMs: hermesP95,
    schemaTokenReduction: Number(schemaTokenReduction.toFixed(6)),
    oryntMedianManualAttachments: quantile(
      orynt.map((trial) => trial.manualAttachmentCount),
      0.5,
    ),
    safetyGatePassed,
    releaseGatePassed: failed.length === 0,
    failedGateReasonCodes: failed,
  };
}
