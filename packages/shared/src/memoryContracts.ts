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

export const MEMORY_STORE_SCHEMA_VERSION = 2 as const;

export type MemoryStoreRevision = number;

export type MemoryMutationOptions = {
  expectedRevision?: MemoryStoreRevision;
};

export type MemoryReviewDecision = {
  status: string;
  actor: string;
  reason: string;
  runId?: string;
  decidedAt: string;
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
  reviewDecisions?: MemoryReviewDecision[];
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

export type SemanticMemoryActivationBasis = "explicit_user_preference" | "verifier_backed_fact" | "manual_review";

export type SemanticMemoryActivation = {
  basis: SemanticMemoryActivationBasis;
  requested: boolean;
  conflictsWith: string[];
  activatedAt?: string;
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
  activation?: SemanticMemoryActivation;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  purgeAfter?: string;
  purgedAt?: string;
  statusBeforeTrash?: Exclude<SemanticMemoryStatus, "deleted">;
};

export type MemoryTombstone = {
  id: string;
  kind: "semantic_memory";
  namespace: MemoryNamespace;
  deletedAt: string;
  purgedAt: string;
  provenanceRunId: string;
  reason: string;
};

export type MemoryStoreEnvelopeV2 = {
  schemaVersion: typeof MEMORY_STORE_SCHEMA_VERSION;
  revision: MemoryStoreRevision;
  updatedAt: string;
  episodes: EpisodicMemoryItem[];
  candidateRules: CandidateRule[];
  semanticMemory: SemanticMemoryItem[];
  tombstones: MemoryTombstone[];
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

export type MemoryRetrievalKind = "episode" | "candidate_rule" | "semantic_memory";

export type MemoryRetrievalQuery = {
  namespace: Partial<MemoryNamespace>;
  text?: string;
  kinds?: MemoryRetrievalKind[];
  limit?: number;
  now?: string;
  includeSensitive?: boolean;
};

export type MemoryRetrievalHit = {
  id: string;
  kind: MemoryRetrievalKind;
  summary: string;
  score: number;
  confidence: number;
  namespace: MemoryNamespace;
  provenance: MemoryProvenance;
  advisory: true;
  createdAt: string;
  status?: CandidateRuleStatus | SemanticMemoryStatus;
};

export type MemoryLifecycleResult = {
  revision: MemoryStoreRevision;
  trashed?: SemanticMemoryItem;
  restored?: SemanticMemoryItem;
  tombstone?: MemoryTombstone;
};

export type SemanticMemoryWriteInput = Omit<
  SemanticMemoryItem,
  "id" | "redaction" | "reviewDecisions" | "createdAt" | "updatedAt" | "deletedAt" | "purgeAfter" | "purgedAt" | "statusBeforeTrash"
> & {
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

export type CandidateRuleStatusUpdateOptions = MemoryMutationOptions & {
  supersededBy?: string;
  actor?: string;
  reason?: string;
  runId?: string;
  decidedAt?: string;
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
  writeEpisode(input: EpisodeWriteInput, storePath?: string, options?: MemoryMutationOptions): Promise<EpisodicMemoryItem>;
  listEpisodes(query?: MemoryQuery): Promise<EpisodicMemoryItem[]>;
  getEpisode(id: string): Promise<EpisodicMemoryItem | undefined>;
  queryEpisodes(query: MemoryQuery): Promise<EpisodicMemoryItem[]>;
  writeCandidateRule(input: CandidateRuleWriteInput, options?: MemoryMutationOptions): Promise<CandidateRule>;
  listCandidateRules(query?: CandidateRuleQuery): Promise<CandidateRule[]>;
  updateCandidateRuleStatus(id: string, status: CandidateRuleStatus, options?: CandidateRuleStatusUpdateOptions): Promise<CandidateRule>;
  writeSemanticMemory(input: SemanticMemoryWriteInput, options?: MemoryMutationOptions): Promise<SemanticMemoryItem>;
  listSemanticMemory(query?: SemanticMemoryQuery): Promise<SemanticMemoryItem[]>;
  updateSemanticMemoryStatus(input: SemanticMemoryStatusUpdateInput, options?: MemoryMutationOptions): Promise<SemanticMemoryItem>;
  editSemanticMemory(input: SemanticMemoryEditInput, options?: MemoryMutationOptions): Promise<SemanticMemoryItem>;
  deleteSemanticMemory(input: Omit<SemanticMemoryStatusUpdateInput, "status">, options?: MemoryMutationOptions): Promise<SemanticMemoryItem>;
  restoreSemanticMemory(input: Omit<SemanticMemoryStatusUpdateInput, "status">, options?: MemoryMutationOptions): Promise<SemanticMemoryItem>;
  purgeSemanticMemory(input: Omit<SemanticMemoryStatusUpdateInput, "status">, options?: MemoryMutationOptions): Promise<MemoryTombstone>;
  retrieveMemory(query: MemoryRetrievalQuery): Promise<MemoryRetrievalHit[]>;
  getStoreSnapshot(): Promise<MemoryStoreEnvelopeV2>;
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
