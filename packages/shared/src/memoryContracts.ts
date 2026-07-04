import type { ArtifactRef, Run, RunEvent } from "./runSpine";
import type { CodexResultBundle } from "./codexResultImportContracts";
import type { VerificationResult } from "./verifierContracts";

export type MemoryNamespace = {
  capabilityId: string;
  workspaceId: string;
  repositoryPath?: string;
  projectId?: string;
};

export type MemoryItemKind =
  | "run_episode"
  | "verifier_failure_pattern"
  | "protected_path_violation"
  | "allowed_scope_pattern"
  | "command_observation";

export type MemorySourceKind =
  | "run_event"
  | "verification_result"
  | "import_summary"
  | "policy_decision"
  | "artifact_metadata"
  | "user_feedback";

export type MemoryProvenance = {
  runId: string;
  taskId: string;
  eventIds: string[];
  artifactRefs: ArtifactRef[];
  sources: MemorySourceKind[];
  sourceTimestamps?: string[];
  verificationResultId?: string;
  importBundleId?: string;
};

export type MemoryRetentionPolicy = {
  ttlDays?: number;
  retainUntil?: string;
  archiveAfterDays?: number;
};

export type MemoryRedactionResult = {
  applied: boolean;
  redactedPaths: string[];
  redactionCount: number;
};

export type EpisodicMemoryItem = {
  id: string;
  namespace: MemoryNamespace;
  kind: MemoryItemKind;
  summary: string;
  content: Record<string, unknown>;
  provenance: MemoryProvenance;
  retention: MemoryRetentionPolicy;
  redaction: MemoryRedactionResult;
  confidence: number;
  createdAt: string;
  expiresAt?: string;
};

export type CandidateRuleStatus = "candidate" | "accepted" | "rejected" | "superseded";

export type CandidateRuleEvidenceKind =
  | "verifier_failure_pattern"
  | "protected_path_violation"
  | "unexpected_file_touch"
  | "allowed_scope_pattern"
  | "command_observation";

export type CandidateRuleEvidence = {
  kind: CandidateRuleEvidenceKind;
  summary: string;
  eventIds: string[];
  artifactRefs: ArtifactRef[];
  confidence: number;
};

export type CandidateRuleScope = {
  repositoryPath?: string;
  allowedPaths: string[];
  protectedPaths: string[];
  commands?: string[];
};

export type CandidateRule = {
  id: string;
  namespace: MemoryNamespace;
  status: CandidateRuleStatus;
  title: string;
  rule: string;
  scope: CandidateRuleScope;
  evidence: CandidateRuleEvidence[];
  provenance: MemoryProvenance;
  redaction: MemoryRedactionResult;
  createdAt: string;
  updatedAt: string;
  supersededBy?: string;
};

export type SemanticMemoryStatus = "candidate" | "approved" | "rejected" | "deleted";

export type SemanticMemorySensitivity = "public" | "internal" | "sensitive";

export type SemanticMemoryReviewDecision = {
  status: Exclude<SemanticMemoryStatus, "candidate">;
  actor: string;
  reason: string;
  runId?: string;
  decidedAt: string;
};

export type SemanticMemoryItem = {
  id: string;
  namespace: MemoryNamespace;
  status: SemanticMemoryStatus;
  summary: string;
  content: Record<string, unknown>;
  sensitivity: SemanticMemorySensitivity;
  confidence: number;
  provenance: MemoryProvenance;
  redaction: MemoryRedactionResult;
  reviewDecisions: SemanticMemoryReviewDecision[];
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
};

export type MemoryExtractionResult = {
  id: string;
  runId: string;
  taskId: string;
  namespace: MemoryNamespace;
  episodes: EpisodicMemoryItem[];
  candidateRules: CandidateRule[];
  redaction: MemoryRedactionResult;
  artifacts: ArtifactRef[];
  startedAt: string;
  completedAt: string;
  summary: string;
};

export type MemoryQuery = {
  namespace?: Partial<MemoryNamespace>;
  kinds?: MemoryItemKind[];
  runId?: string;
  text?: string;
  limit?: number;
};

export type CandidateRuleQuery = {
  namespace?: Partial<MemoryNamespace>;
  statuses?: CandidateRuleStatus[];
  text?: string;
  limit?: number;
};

export type SemanticMemoryQuery = {
  namespace?: Partial<MemoryNamespace>;
  statuses?: SemanticMemoryStatus[];
  text?: string;
  includeDeleted?: boolean;
  limit?: number;
};

export type SemanticMemoryWriteInput = Omit<SemanticMemoryItem, "id" | "redaction" | "reviewDecisions" | "createdAt" | "updatedAt" | "deletedAt"> & {
  id?: string;
  createdAt?: string;
  updatedAt?: string;
  redaction?: MemoryRedactionResult;
  reviewDecisions?: SemanticMemoryReviewDecision[];
};

export type SemanticMemoryStatusUpdateInput = {
  id: string;
  status: Exclude<SemanticMemoryStatus, "candidate">;
  actor: string;
  reason: string;
  runId?: string;
  decidedAt?: string;
};

export type SemanticMemoryEditInput = {
  id: string;
  summary?: string;
  content?: Record<string, unknown>;
  sensitivity?: SemanticMemorySensitivity;
  confidence?: number;
  actor: string;
  reason: string;
};

export type CandidateRuleStatusUpdateOptions = {
  supersededBy?: string;
};

export type CandidateRuleStatusUpdateInput = {
  id: string;
  status: Exclude<CandidateRuleStatus, "candidate">;
  runId?: string;
  supersededBy?: string;
};

export type MemoryReviewSnapshot = {
  namespace: MemoryNamespace;
  latestEpisode?: EpisodicMemoryItem;
  episodes: EpisodicMemoryItem[];
  candidateRules: CandidateRule[];
  summary: MemorySummary;
};

export type EpisodeWriteInput = Omit<EpisodicMemoryItem, "id" | "redaction" | "createdAt" | "expiresAt"> & {
  id?: string;
  createdAt?: string;
  expiresAt?: string;
  redaction?: MemoryRedactionResult;
};

export type CandidateRuleWriteInput = Omit<CandidateRule, "id" | "status" | "redaction" | "createdAt" | "updatedAt"> & {
  id?: string;
  status?: CandidateRuleStatus;
  createdAt?: string;
  updatedAt?: string;
  redaction?: MemoryRedactionResult;
};

export type MemorySummary = {
  episodeCount: number;
  candidateRuleCount: number;
  candidateRuleStatusCounts: Record<CandidateRuleStatus, number>;
  namespaceCount: number;
};

export interface MemoryStore {
  writeEpisode(input: EpisodeWriteInput, storePath?: string): Promise<EpisodicMemoryItem>;
  listEpisodes(query?: MemoryQuery): Promise<EpisodicMemoryItem[]>;
  getEpisode(id: string): Promise<EpisodicMemoryItem | undefined>;
  queryEpisodes(query: MemoryQuery): Promise<EpisodicMemoryItem[]>;
  writeCandidateRule(input: CandidateRuleWriteInput): Promise<CandidateRule>;
  listCandidateRules(query?: CandidateRuleQuery): Promise<CandidateRule[]>;
  updateCandidateRuleStatus(id: string, status: CandidateRuleStatus, options?: CandidateRuleStatusUpdateOptions): Promise<CandidateRule>;
  writeSemanticMemory(input: SemanticMemoryWriteInput): Promise<SemanticMemoryItem>;
  listSemanticMemory(query?: SemanticMemoryQuery): Promise<SemanticMemoryItem[]>;
  updateSemanticMemoryStatus(input: SemanticMemoryStatusUpdateInput): Promise<SemanticMemoryItem>;
  editSemanticMemory(input: SemanticMemoryEditInput): Promise<SemanticMemoryItem>;
  deleteSemanticMemory(input: Omit<SemanticMemoryStatusUpdateInput, "status">): Promise<SemanticMemoryItem>;
  summarizeMemory(namespace?: Partial<MemoryNamespace>): Promise<MemorySummary>;
}

export type MemoryExtractionInput = {
  run: Run;
  events: RunEvent[];
  namespace: MemoryNamespace;
  artifactRoot: string;
  importBundle?: CodexResultBundle;
  verificationResult?: VerificationResult;
  retention: MemoryRetentionPolicy;
};

export interface MemoryExtractor {
  extractRunMemory(input: MemoryExtractionInput): Promise<MemoryExtractionResult>;
}
