import type { ArtifactRef } from "./runSpine";
import type { CodexContract } from "./codexContracts";
import type { RepositorySandbox } from "./corePolicy";
import type { CandidateRule, EpisodicMemoryItem, MemoryNamespace, MemoryRedactionResult } from "./memoryContracts";
import type { VerificationResult } from "./verifierContracts";

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
