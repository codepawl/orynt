export type CapabilityKind =
  | "installed_skill"
  | "learned_skill"
  | "memory_profile"
  | "tool_namespace"
  | "mcp_server"
  | "app_connector"
  | "agent_role";

export type CapabilityTrustTier =
  | "builtin"
  | "user_owned"
  | "project_untrusted"
  | "third_party";

export type CapabilityRisk = "read_only" | "side_effect" | "destructive";
export type CapabilityHealth = "healthy" | "degraded" | "unavailable";
export type CapabilityAuthState = "not_required" | "connected" | "missing";

export type CapabilityDescriptorV1 = {
  schemaVersion: 1;
  id: string;
  version: string;
  digest: string;
  kind: CapabilityKind;
  namespace: string;
  title: string;
  summary: string;
  tags: string[];
  inputKinds: string[];
  outputKinds: string[];
  environment: string[];
  trust: CapabilityTrustTier;
  risk: CapabilityRisk;
  health: CapabilityHealth;
  auth: CapabilityAuthState;
  source: {
    id: string;
    uri: string;
    immutable: boolean;
  };
  provenanceRefs: string[];
  repositoryScopes: string[];
  toolNames: string[];
};

export type CapabilityRoutingMode = "off" | "auto_read_only";
export type AutoImproveMode = "off" | "shadow_review";
export type AdaptiveSubagentMode = "off" | "read_only" | "adaptive";

export type CapabilityRuntimeSettingsV1 = {
  schemaVersion: 1;
  routingMode: CapabilityRoutingMode;
  autoImproveMode: AutoImproveMode;
  maxNamespaces: number;
  maxToolsPerNamespace: number;
  memoryTopK: number;
  memoryTokenBudget: number;
  subagents: {
    mode: AdaptiveSubagentMode;
    maxConcurrency: number;
    maxDepth: 1;
  };
};

export type CapabilitySelectionRequestV1 = {
  schemaVersion: 1;
  runId: string;
  taskId: string;
  intent: string;
  requiredKinds?: CapabilityKind[];
  inputKinds?: string[];
  outputKinds?: string[];
  environment: string[];
  repositoryPath?: string;
  connectedCapabilityIds?: string[];
};

export type CapabilitySelectionDecisionV1 = {
  capabilityId: string;
  version: string;
  digest: string;
  score: number;
  disposition: "auto_attached" | "approval_required" | "excluded";
  reasonCodes: string[];
};

export type CapabilitySelectionPlanV1 = {
  schemaVersion: 1;
  runId: string;
  taskId: string;
  policyVersion: "capability_router_v1";
  selected: CapabilitySelectionDecisionV1[];
  excluded: CapabilitySelectionDecisionV1[];
  namespacesLoaded: string[];
  toolNamesLoaded: string[];
  approvalCapabilityIds: string[];
  contextDigest: string;
  createdAt: string;
};

export type CapabilityOutcomeV1 = {
  schemaVersion: 1;
  id: string;
  runId: string;
  taskId: string;
  capabilityId: string;
  capabilityVersion: string;
  capabilityDigest: string;
  taskTemplateId: string;
  repositoryDomain: string;
  modelTier: string;
  verifierPassed: boolean;
  policyPassed: boolean;
  unsafeActionCount: number;
  latencyMs: number;
  retryCount: number;
  artifactRefs: string[];
  recordedAt: string;
};

export type ImprovementTargetClass =
  | "learned_skill"
  | "user_overlay"
  | "memory_profile"
  | "router_weights"
  | "installed_package"
  | "permission_policy"
  | "trust_policy"
  | "approval_policy"
  | "credential"
  | "repository_scope"
  | "promotion_gate";

export type ImprovementCandidateStatus =
  | "shadow"
  | "canary"
  | "active"
  | "rejected"
  | "rolled_back"
  | "quarantined";

export type ImprovementEvaluationV1 = {
  pairedCaseCount: number;
  baselineCorrectness: number;
  candidateCorrectness: number;
  correctnessDelta: number;
  bootstrapLowerBound95: number;
  baselineP95LatencyMs: number;
  candidateP95LatencyMs: number;
  policyPassRate: number;
  unsafeActionCount: number;
  criticalRegressionCount: number;
  canaryEligibleRunCount: number;
  canaryVerifierFailureCount: number;
  repositoryDomainCount: number;
  modelTierCount: number;
};

export type ImprovementTargetArtifactV1 =
  | {
      kind: "learned_skill" | "user_overlay";
      instruction: string;
      applicableTaskTokens: string[];
      validationCommands: string[];
      allowedPaths: string[];
      protectedPaths: string[];
    }
  | {
      kind: "memory_profile";
      topK: number;
      tokenBudget: number;
      recencyWeight: number;
      confidenceWeight: number;
    }
  | {
      kind: "router_weights";
      lexical: number;
      input: number;
      output: number;
      verified: number;
      latency: number;
      ownedTrust: number;
    };

export type ImprovementCaseV1 = {
  id: string;
  candidateId: string;
  runId: string;
  taskTemplateId: string;
  repositoryDomain: string;
  modelTier: string;
  phase: "shadow" | "canary" | "active";
  baselineCorrect: boolean;
  candidateCorrect: boolean;
  baselineLatencyMs: number;
  candidateLatencyMs: number;
  policyPassed: boolean;
  unsafeActionCount: number;
  criticalRegression: boolean;
  tokenBudget: number;
  tokenUsed: number;
  artifactRefs: string[];
  recordedAt: string;
};

export type ImprovementCandidateV1 = {
  schemaVersion: 1;
  id: string;
  targetId: string;
  targetClass: ImprovementTargetClass;
  targetScope: "workspace" | "user";
  baseDigest: string;
  proposedDigest: string;
  hypothesis: string;
  patchArtifactRef: string;
  baselineArtifactRef?: string;
  proposedArtifactRef?: string;
  previousActiveArtifactRef?: string;
  appliedArtifactRef?: string;
  artifactDigest?: string;
  risk?: "low" | "behavioral" | "immutable";
  targetArtifact?: ImprovementTargetArtifactV1;
  evaluationCases?: ImprovementCaseV1[];
  sourceEpisodeIds: string[];
  sourceTaskTemplateIds: string[];
  evaluation: ImprovementEvaluationV1;
  status: ImprovementCandidateStatus;
  createdAt: string;
};

export type ImprovementPromotionDecisionV1 = {
  candidateId: string;
  decision: "promote" | "keep_shadow" | "reject" | "rollback";
  reasonCodes: string[];
};

export type CapabilityBenchmarkTrialV1 = {
  schemaVersion: 1;
  suite: "controlled" | "live";
  system: "orynt" | "hermes";
  taskId: string;
  repetition: number;
  correct: boolean;
  latencyMs: number;
  disclosedSchemaTokens: number;
  manualAttachmentCount: number;
  policyPassed: boolean;
  unsafeActionCount: number;
};

export type CapabilityBenchmarkSummaryV1 = {
  schemaVersion: 1;
  suite: "controlled" | "live";
  pairedTrialCount: number;
  oryntCorrectness: number;
  hermesCorrectness: number;
  correctnessDelta: number;
  oryntP50LatencyMs: number;
  hermesP50LatencyMs: number;
  oryntP95LatencyMs: number;
  hermesP95LatencyMs: number;
  schemaTokenReduction: number;
  oryntMedianManualAttachments: number;
  safetyGatePassed: boolean;
  releaseGatePassed: boolean;
  failedGateReasonCodes: string[];
};

export const IMMUTABLE_AUTO_IMPROVEMENT_TARGETS =
  new Set<ImprovementTargetClass>([
    "installed_package",
    "permission_policy",
    "trust_policy",
    "approval_policy",
    "credential",
    "repository_scope",
    "promotion_gate",
  ]);

export function createDefaultCapabilityRuntimeSettings(): CapabilityRuntimeSettingsV1 {
  return {
    schemaVersion: 1,
    routingMode: "auto_read_only",
    autoImproveMode: "shadow_review",
    maxNamespaces: 3,
    maxToolsPerNamespace: 10,
    memoryTopK: 3,
    memoryTokenBudget: 1_200,
    subagents: {
      mode: "adaptive",
      maxConcurrency: 4,
      maxDepth: 1,
    },
  };
}

export function validateCapabilityRuntimeSettings(
  value: CapabilityRuntimeSettingsV1,
): void {
  if (
    value.schemaVersion !== 1 ||
    !["off", "auto_read_only"].includes(value.routingMode) ||
    !["off", "shadow_review"].includes(value.autoImproveMode) ||
    !Number.isInteger(value.maxNamespaces) ||
    value.maxNamespaces < 1 ||
    value.maxNamespaces > 3 ||
    !Number.isInteger(value.maxToolsPerNamespace) ||
    value.maxToolsPerNamespace < 1 ||
    value.maxToolsPerNamespace > 10 ||
    !Number.isInteger(value.memoryTopK) ||
    value.memoryTopK < 1 ||
    value.memoryTopK > 5 ||
    !Number.isInteger(value.memoryTokenBudget) ||
    value.memoryTokenBudget < 256 ||
    value.memoryTokenBudget > 4_000 ||
    !["off", "read_only", "adaptive"].includes(value.subagents.mode) ||
    !Number.isInteger(value.subagents.maxConcurrency) ||
    value.subagents.maxConcurrency < 1 ||
    value.subagents.maxConcurrency > 4 ||
    value.subagents.maxDepth !== 1
  ) {
    throw new Error("Capability runtime settings are outside bounded v1 limits.");
  }
}
