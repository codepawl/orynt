import type { ArtifactRef } from "./runSpine";
import type { CodexContract } from "./codexContracts";
import type { ActionRisk, CorePolicy, PolicyDecisionKind, RepositorySandbox } from "./corePolicy";
import type { CandidateRule, EpisodicMemoryItem, MemoryNamespace, MemoryRedactionResult } from "./memoryContracts";
import type { VerificationResult, VerifierConfig } from "./verifierContracts";

export type SkillStatus = "candidate" | "active" | "rejected" | "superseded" | "archived";

export type SkillPreconditionKind =
  | "repository_scope"
  | "policy_mode"
  | "verification_available"
  | "manual_review"
  | "memory_rule_status";

export type SkillPrecondition = {
  id: string;
  kind: SkillPreconditionKind;
  summary: string;
  required: boolean;
};

export type SkillStep = {
  id: string;
  title: string;
  instruction: string;
  expectedOutcome: string;
  evidenceRefs?: string[];
};

export type SkillValidationPlan = {
  requiresVerifierPass: boolean;
  requiresDiffWithinScope: boolean;
  commands: string[];
  expectedEvidenceKinds: string[];
};

export type SkillSafetyPolicy = {
  allowedPaths: string[];
  protectedPaths: string[];
  allowedCommands: string[];
  blockedActions: string[];
  requiresManualApproval: boolean;
  rollbackNotes: string;
  secretHandling: string;
};

export type SkillProvenance = {
  sourceRunIds: string[];
  sourceTaskIds: string[];
  candidateRuleIds: string[];
  episodeIds: string[];
  verificationResultIds: string[];
  codexContractIds: string[];
  artifactRefs: ArtifactRef[];
  sourceEventIds: string[];
};

export type SkillPromotionDecisionKind = "promote" | "reject" | "supersede" | "archive";

export type SkillPromotionDecision = {
  skillId: string;
  decision: SkillPromotionDecisionKind;
  actor: string;
  reason: string;
  runId?: string;
  supersededBy?: string;
  decidedAt: string;
};

export type SkillDefinition = {
  id: string;
  namespace: MemoryNamespace;
  capabilityId: string;
  title: string;
  summary: string;
  status: SkillStatus;
  confidence: number;
  preconditions: SkillPrecondition[];
  steps: SkillStep[];
  validation: SkillValidationPlan;
  safety: SkillSafetyPolicy;
  provenance: SkillProvenance;
  redaction: MemoryRedactionResult;
  promotionDecisions: SkillPromotionDecision[];
  createdAt: string;
  updatedAt: string;
  supersededBy?: string;
};

export type SkillSummary = {
  skillCount: number;
  statusCounts: Record<SkillStatus, number>;
  namespaceCount: number;
};

export type SkillRegistrySnapshot = {
  namespace: MemoryNamespace;
  skills: SkillDefinition[];
  summary: SkillSummary;
};

export type SkillReplayMode = "active_dry_run" | "candidate_preview";

export type SkillReplayReadiness = "ready" | "preview_only" | "warning" | "blocked";

export type SkillReplayRisk = ActionRisk;

export type SkillReplayStopReason =
  | "skill_not_active"
  | "candidate_preview_only"
  | "missing_precondition"
  | "policy_blocked"
  | "approval_required"
  | "budget_exceeded"
  | "unsafe_scope"
  | "secret_redacted";

export type SkillReplayPreconditionStatus = "passed" | "warning" | "failed";

export type SkillReplayPreconditionResult = {
  id: string;
  kind: SkillPreconditionKind;
  summary: string;
  required: boolean;
  status: SkillReplayPreconditionStatus;
  reason?: string;
};

export type SkillReplayStepStatus = "planned" | "blocked" | "skipped";

export type SkillReplayStepKind =
  | "precondition"
  | "skill_step"
  | "policy_check"
  | "sandbox_plan"
  | "validation_expectation"
  | "stop";

export type SkillReplayStep = {
  id: string;
  title: string;
  kind: SkillReplayStepKind;
  summary: string;
  dryRunOnly: true;
  status: SkillReplayStepStatus;
  artifactRefs?: ArtifactRef[];
};

export type SkillReplayPolicyCheck = {
  actionId: string;
  summary: string;
  decision: PolicyDecisionKind;
  risk: SkillReplayRisk;
  approvalRequired: boolean;
  reasons: string[];
  violations: string[];
};

export type SkillReplayValidationExpectation = {
  command: string;
  allowed: boolean;
  expectedEvidenceKinds: string[];
  requiresVerifierPass: boolean;
  policyDecision?: PolicyDecisionKind;
  reason?: string;
};

export type SkillReplayBudgetDecision = "allow" | "warn" | "stop";

export type SkillReplayBudgetEstimate = {
  estimatedSteps: number;
  estimatedCommands: number;
  estimatedArtifacts: number;
  estimatedModelTokens: number;
  estimatedWallTimeMs: number;
  estimatedUsd?: number;
  decision: SkillReplayBudgetDecision;
  stopReasons: SkillReplayStopReason[];
};

export type SkillReplayPlan = {
  id: string;
  runId: string;
  taskId: string;
  skillId: string;
  skillTitle: string;
  skillStatus: SkillStatus;
  mode: SkillReplayMode;
  dryRunOnly: true;
  executable: false;
  readiness: SkillReplayReadiness;
  summary: string;
  preconditions: SkillReplayPreconditionResult[];
  steps: SkillReplayStep[];
  risks: SkillReplayRisk[];
  policyChecks: SkillReplayPolicyCheck[];
  validationExpectations: SkillReplayValidationExpectation[];
  budgetEstimate: SkillReplayBudgetEstimate;
  blockedActions: string[];
  requiredApprovals: string[];
  expectedArtifacts: ArtifactRef[];
  stopReasons: SkillReplayStopReason[];
  redaction: MemoryRedactionResult;
  createdAt: string;
};

export type SkillReplayPlannerInput = {
  skill: SkillDefinition;
  runId: string;
  taskId: string;
  mode: SkillReplayMode;
  repositoryPath: string;
  baseRef: string;
  policy: CorePolicy;
  sandbox?: Partial<RepositorySandbox>;
  verifierConfig?: Partial<VerifierConfig>;
};

export interface SkillReplayPlanner {
  createReplayPlan(input: SkillReplayPlannerInput): SkillReplayPlan;
  checkPreconditions(input: SkillReplayPlannerInput): SkillReplayPreconditionResult[];
  checkPolicy(input: SkillReplayPlannerInput): SkillReplayPolicyCheck[];
  estimateBudget(input: SkillReplayPlannerInput): SkillReplayBudgetEstimate;
  summarizeReplayPlan(plan: SkillReplayPlan): string;
  explainBlockedReplay(plan: SkillReplayPlan): string;
}

export type SkillCandidateBuilderInput = {
  namespace: MemoryNamespace;
  acceptedRules: CandidateRule[];
  episodes: EpisodicMemoryItem[];
  verificationResult: VerificationResult;
  codexContract?: CodexContract;
  sandbox?: Partial<RepositorySandbox>;
};

export type SkillExtractionCandidate = {
  id: string;
  namespace: MemoryNamespace;
  skill: SkillDefinition;
  acceptedRules: CandidateRule[];
  episodes: EpisodicMemoryItem[];
  verificationResult: VerificationResult;
  codexContract?: CodexContract;
  sandbox?: Partial<RepositorySandbox>;
  createdAt: string;
};

export type SkillQuery = {
  namespace?: Partial<MemoryNamespace>;
  statuses?: SkillStatus[];
  text?: string;
  limit?: number;
};

export interface SkillRegistry {
  createCandidateSkill(input: SkillExtractionCandidate): Promise<SkillDefinition>;
  listSkills(query?: SkillQuery): Promise<SkillDefinition[]>;
  getSkill(id: string): Promise<SkillDefinition | undefined>;
  updateSkillStatus(decision: SkillPromotionDecision): Promise<SkillDefinition>;
  rejectSkill(decision: SkillPromotionDecision): Promise<SkillDefinition>;
  promoteSkillManually(decision: SkillPromotionDecision): Promise<SkillDefinition>;
  summarizeSkills(namespace?: Partial<MemoryNamespace>): Promise<SkillSummary>;
}
