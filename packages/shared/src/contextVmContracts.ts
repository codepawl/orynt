import type { Actor, RedactionMetadata } from "./runSpine.js";

declare const contextVmIdBrand: unique symbol;

export type ContextVmId<Kind extends string> = string & {
  readonly [contextVmIdBrand]: Kind;
};

export type ContextVmEventId = ContextVmId<"event">;
export type ContextVmSessionId = ContextVmId<"session">;
export type ContextVmTaskId = ContextVmId<"task">;
export type ContextVmArtifactId = ContextVmId<"artifact">;
export type ContextVmMemoryId = ContextVmId<"memory">;
export type ContextVmContextPackId = ContextVmId<"context_pack">;
export type ContextVmCheckpointId = ContextVmId<"checkpoint">;

export type ContextVmSensitivity =
  | "public"
  | "internal"
  | "personal"
  | "secret"
  | "credential"
  | "restricted";

export type ContextVmEventKind =
  | "user_message"
  | "assistant_message"
  | "tool_request"
  | "tool_result"
  | "file_read"
  | "file_write"
  | "command_run"
  | "test_result"
  | "decision"
  | "constraint"
  | "state_transition"
  | "error"
  | "recovery"
  | "memory_fault"
  | "memory_resolution"
  | "checkpoint"
  | "tombstone";

export type ContextVmEventSourceV1 = {
  kind:
    | "orynt_run_event"
    | "cli_ingest"
    | "memory_runtime"
    | "recovery_import"
    | "test_fixture";
  id: string;
};

export type ContextVmArtifactInputV1 = {
  mediaType: string;
  bytes: Uint8Array;
  sensitivity: ContextVmSensitivity;
  label?: string;
};

export type ContextVmArtifactRefV1 = {
  id: ContextVmArtifactId;
  sha256: string;
  mediaType: string;
  sensitivity: ContextVmSensitivity;
  encoding: "identity" | "zstd";
  uncompressedBytes: number;
  storedBytes: number;
  label?: string;
};

export type NewContextVmEventV1 = {
  sessionId: ContextVmSessionId;
  taskId?: ContextVmTaskId;
  source: ContextVmEventSourceV1;
  occurredAt: string;
  actor: Actor;
  kind: ContextVmEventKind;
  payload: unknown;
  artifacts?: ContextVmArtifactInputV1[];
  parentEventIds?: ContextVmEventId[];
  sensitivity: ContextVmSensitivity;
};

export type ContextVmEventV1 = {
  schemaVersion: 1;
  id: ContextVmEventId;
  sessionId: ContextVmSessionId;
  taskId?: ContextVmTaskId;
  sequenceNo: number;
  source: ContextVmEventSourceV1;
  occurredAt: string;
  recordedAt: string;
  actor: Actor;
  kind: ContextVmEventKind;
  payload: unknown;
  artifacts: ContextVmArtifactRefV1[];
  parentEventIds: ContextVmEventId[];
  contentHash: string;
  sensitivity: ContextVmSensitivity;
  redaction: RedactionMetadata;
};

export type ContextVmHealth = "empty" | "ready" | "degraded" | "blocked";

export type ContextVmMemoryKind =
  | "fact"
  | "decision"
  | "constraint"
  | "procedure"
  | "summary"
  | "observation"
  | "failure_pattern"
  | "episode";

export type ContextVmMemoryStatus =
  | "candidate"
  | "active"
  | "accepted"
  | "rejected"
  | "superseded"
  | "deleted";

export type ContextVmEvidencePriority =
  | "model_inference"
  | "summary"
  | "derived_state"
  | "accepted_decision"
  | "verified_tool"
  | "current_user";

export type ContextVmSourceRefV1 =
  | { type: "event"; eventId: ContextVmEventId }
  | { type: "artifact"; artifactId: ContextVmArtifactId; locator?: string }
  | { type: "memory"; memoryId: ContextVmMemoryId };

export type ContextVmMemoryRelationKind =
  | "depends_on"
  | "caused_by"
  | "supports"
  | "contradicts"
  | "supersedes"
  | "implements"
  | "tests"
  | "blocks"
  | "resolves"
  | "derived_from"
  | "mentions"
  | "part_of"
  | "owned_by";

export type ContextVmMemoryRelationV1 = {
  type: ContextVmMemoryRelationKind;
  targetMemoryId: ContextVmMemoryId;
};

export type ContextVmMemoryPageV1 = {
  schemaVersion: 1;
  id: ContextVmMemoryId;
  namespace: string;
  kind: ContextVmMemoryKind;
  status: ContextVmMemoryStatus;
  summary: string;
  content: unknown;
  normalizedContent: string;
  subject?: string;
  predicate?: string;
  sources: ContextVmSourceRefV1[];
  entityIds: string[];
  taskIds: ContextVmTaskId[];
  relations: ContextVmMemoryRelationV1[];
  validFrom: string;
  validUntil?: string;
  supersededBy?: ContextVmMemoryId;
  confidence: number;
  importance: number;
  evidencePriority: ContextVmEvidencePriority;
  producer: string;
  createdAt: string;
  updatedAt: string;
  tokenCount: number;
  contentHash: string;
  /**
   * Added by schema v8. Older persisted pages decode as `internal`.
   * Credential-bearing content is never admitted as derived memory.
   */
  sensitivity?: ContextVmSensitivity;
  /** Required when sensitivity is personal or restricted. */
  ownerId?: string;
};

export type NewContextVmMemoryPageV1 = Omit<
  ContextVmMemoryPageV1,
  "schemaVersion" | "id" | "normalizedContent" | "createdAt" | "updatedAt" | "tokenCount" | "contentHash"
> & {
  id?: ContextVmMemoryId;
  createdAt?: string;
  updatedAt?: string;
};

export type ContextVmContradictionV1 = {
  schemaVersion: 1;
  id: string;
  namespace: string;
  subject: string;
  predicate: string;
  leftMemoryId: ContextVmMemoryId;
  rightMemoryId: ContextVmMemoryId;
  status: "unresolved" | "resolved";
  resolutionMemoryId?: ContextVmMemoryId;
  createdAt: string;
  resolvedAt?: string;
};

export type ContextVmCurrentFactResultV1 =
  | { status: "missing"; candidates: [] }
  | { status: "resolved"; candidates: [ContextVmMemoryPageV1] }
  | { status: "conflicted"; candidates: ContextVmMemoryPageV1[] };

export type ContextVmStatusV1 = {
  schemaVersion: 1;
  health: ContextVmHealth;
  databaseSchemaVersion: number;
  journalMode: string;
  foreignKeys: boolean;
  eventCount: number;
  sessionCount: number;
  artifactCount: number;
  memoryPageCount: number;
  checkpointCount: number;
  consolidationCount: number;
  latestCheckpointSequence: number | null;
  unresolvedContradictionCount: number;
  memoryRevision: number;
  archiveBytes: number;
  databasePath: string;
  archiveRoot: string;
  cache: ContextVmCacheMetricsV1;
};

export type ContextVmVerificationCheckV1 = {
  id: string;
  status: "pass" | "warn" | "fail";
  summary: string;
};

export type ContextVmVerificationReportV1 = {
  schemaVersion: 1;
  status: "pass" | "fail";
  checkedAt: string;
  checks: ContextVmVerificationCheckV1[];
  eventCount: number;
  artifactCount: number;
  orphanArtifactCount: number;
  memoryPageCount: number;
  unresolvedContradictionCount: number;
};

export type ContextVmScanRequestV1 = {
  sessionId: ContextVmSessionId;
  afterSequence?: number;
  limit?: number;
};

export type ContextVmExtractionCandidateKind =
  | "goal"
  | "constraint"
  | "command_result"
  | "test_result"
  | "file_change"
  | "state_transition"
  | "tool_result"
  | "failure_pattern";

export type ContextVmExtractionCandidateV1 = {
  schemaVersion: 1;
  extractorVersion: string;
  candidateHash: string;
  kind: ContextVmExtractionCandidateKind;
  sourceEventIds: ContextVmEventId[];
  summary: string;
  content: unknown;
  status: "admitted" | "rejected";
  reason: string;
  memoryId?: ContextVmMemoryId;
};

export type ContextVmExtractionReportV1 = {
  schemaVersion: 1;
  extractorVersion: string;
  sessionId: ContextVmSessionId;
  inputHash: string;
  outputHash: string;
  candidates: ContextVmExtractionCandidateV1[];
  unsupportedEventIds: ContextVmEventId[];
};

export type ContextVmRetrievalRequestV1 = {
  namespace: string;
  query: string;
  topK?: number;
  includeHistory?: boolean;
  asOf?: string;
  entityIds?: string[];
  taskIds?: ContextVmTaskId[];
  artifactIds?: ContextVmArtifactId[];
  hopLimit?: 0 | 1 | 2;
  principalId?: string;
  allowedSensitivity?: ContextVmSensitivity[];
};

export type ContextVmRetrievalScoresV1 = {
  lexical: number;
  exact: number;
  graph: number;
  temporal: number;
  structural: number;
  sourceQuality: number;
  importance: number;
  total: number;
};

export type ContextVmRetrievalCandidateV1 = {
  page: ContextVmMemoryPageV1;
  scores: ContextVmRetrievalScoresV1;
  reasons: string[];
  conflicted: boolean;
};

export type ContextVmRetrievalResultV1 = {
  schemaVersion: 1;
  query: string;
  candidates: ContextVmRetrievalCandidateV1[];
  candidateCount: number;
  truncated: boolean;
  cache: {
    hits: number;
    misses: number;
    prefetchLoads: number;
  };
};

export type ContextVmIndexRebuildReportV1 = {
  schemaVersion: 1;
  indexVersion: number;
  indexedMemoryPages: number;
  identifierCount: number;
  digest: string;
  rebuiltAt: string;
};

export type ContextVmContextSection =
  | "policy"
  | "current_goal"
  | "active_constraints"
  | "current_task_state"
  | "recent_interaction"
  | "verified_evidence"
  | "conflicts_stale"
  | "unresolved_dependencies"
  | "memory_operations";

export type ContextVmConversationContextV1 = {
  summary?: string;
  recentTurns: Array<{
    role: "user" | "assistant";
    content: string;
  }>;
};

export type ContextVmContextRequestV1 = {
  schemaVersion: 1;
  namespace: string;
  sessionId: ContextVmSessionId;
  taskId?: ContextVmTaskId;
  userRequest: string;
  currentGoal?: string;
  currentPlan?: string;
  currentAction?: string;
  /**
   * Bounded advisory conversation data used only to resolve references.
   * It never grants authority or adds requirements.
   */
  conversationContext?: ContextVmConversationContextV1;
  policy?: string;
  /** Revision-bound, pre-redacted evidence supplied by an owned runtime. */
  revisionBoundEvidence?: Array<{
    sourceId: string;
    text: string;
    evidenceQuality: ContextVmEvidenceQualityV1;
  }>;
  constraints: Array<{
    id: string;
    text: string;
    required: boolean;
    source: "user" | "policy" | "runtime";
  }>;
  requestedEntities: string[];
  riskLevel: "low" | "medium" | "high";
  hardBudgetTokens: number;
  /** Stable logical inference identity used by audit and recovery. */
  invocationId?: string;
  role?: ContextVmInvocationRoleV1;
  /** Current local principal. Personal memory is visible only to its owner. */
  principalId?: string;
  /** Defaults to public and internal. Secret and credential are never allowed. */
  allowedSensitivity?: ContextVmSensitivity[];
  /** Authority-only packs intentionally skip historical retrieval. */
  retrievalMode?: "authority_only" | "hybrid";
  continuation?: ContextVmContextContinuationV1;
};

export type ContextVmMemorySourceTypeV1 =
  | "decision"
  | "user_message"
  | "tool_result"
  | "test_result"
  | "file_change"
  | "code"
  | "artifact";

export type ContextVmEvidenceQualityV1 =
  | "derived"
  | "accepted"
  | "verified";

export type ContextVmMissingMemoryV1 = {
  kind: string;
  entities: string[];
  relation: ContextVmMemoryRelationKind | null;
  timeRange: {
    start: string;
    end: string;
  } | null;
  requiredSourceTypes: ContextVmMemorySourceTypeV1[];
  minimumEvidenceQuality: ContextVmEvidenceQualityV1;
};

export type ContextVmMemoryDecisionV1 =
  | {
      schemaVersion: 1;
      status: "READY";
      answerOrAction: Record<string, unknown>;
    }
  | {
      schemaVersion: 1;
      status: "NEED_MEMORY";
      missing: ContextVmMissingMemoryV1[];
    };

export type ContextVmMemoryDecisionV2 =
  | {
      schemaVersion: 2;
      status: "READY";
    }
  | {
      schemaVersion: 2;
      status: "NEED_MEMORY";
      missing: ContextVmMissingMemoryV1[];
    };

export type ContextVmInvocationRoleV1 =
  | "prompt_understanding"
  | "coordinator"
  | "planner"
  | "helper"
  | "implementer"
  | "reviewer"
  | "recovery";

export type ContextVmProviderTransportV1 =
  | "codex-cli"
  | "codex-app-server"
  | "openai-responses"
  | "scripted";

export type ContextVmThinkingEffortV1 =
  | "none"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh";

export type ContextVmInvocationRequestV1 = {
  schemaVersion: 1;
  invocationId: string;
  namespace: string;
  sessionId: ContextVmSessionId;
  taskId?: ContextVmTaskId;
  role: ContextVmInvocationRoleV1;
  providerId: ContextVmProviderTransportV1;
  modelId: string;
  userRequest: string;
  currentGoal?: string;
  currentPlan?: string;
  currentAction?: string;
  conversationContext?: ContextVmConversationContextV1;
  policy?: string;
  revisionBoundEvidence?: ContextVmContextRequestV1["revisionBoundEvidence"];
  constraints: ContextVmContextRequestV1["constraints"];
  requestedEntities: string[];
  riskLevel: ContextVmContextRequestV1["riskLevel"];
  hardBudgetTokens: number;
  principalId?: string;
  allowedSensitivity?: ContextVmSensitivity[];
  retrievalMode?: "authority_only" | "hybrid";
};

export type ContextVmInvocationRequestV2 = Omit<
  ContextVmInvocationRequestV1,
  "schemaVersion" | "providerId"
> & {
  schemaVersion: 2;
  transport: ContextVmProviderTransportV1;
  thinkingEffort: ContextVmThinkingEffortV1;
  parentInvocationId?: string;
  readiness: {
    maxOutputTokens: 1_024;
    timeoutMs: 30_000;
    maxFaultRounds: 3;
  };
};

export type ContextVmDecisionDriverV1 = (input: {
  invocation: ContextVmInvocationRequestV1;
  pack: ContextVmContextPackV1;
  round: number;
  signal?: AbortSignal;
}) => Promise<unknown>;

export type ContextVmDecisionDriverV2 = (input: {
  invocation: ContextVmInvocationRequestV2;
  pack: ContextVmContextPackV1;
  round: number;
  signal?: AbortSignal;
}) => Promise<unknown>;

export type ContextVmResolvedInvocationV1 =
  | {
      schemaVersion: 1;
      status: "ready";
      invocationId: string;
      rootContextPackId: ContextVmContextPackId;
      contextPackIds: ContextVmContextPackId[];
      renderedContext: string;
      renderedContextHash: string;
      coverageScore: number;
      faultRounds: ContextVmPageFaultRoundV1[];
      checkpointId?: ContextVmCheckpointId;
    }
  | {
      schemaVersion: 1;
      status: "abstained" | "blocked";
      invocationId: string;
      rootContextPackId?: ContextVmContextPackId;
      contextPackIds: ContextVmContextPackId[];
      reason: ContextVmPageFaultAbstentionReasonV1 | "context_pack_blocked";
      faultRounds: ContextVmPageFaultRoundV1[];
    };

export type ContextVmProviderAttemptArtifactV1 = {
  attemptId: string;
  phase: "readiness" | "inference";
  attempt: number;
  transport: ContextVmProviderTransportV1;
  modelId: string;
  thinkingEffort: ContextVmThinkingEffortV1;
  status: "prepared" | "dispatched" | "completed" | "failed" | "in_doubt";
  contextPackIds: ContextVmContextPackId[];
  contextHash: string;
  resultHash?: string;
  failureReason?: string;
};

export type ContextVmInvocationArtifactV1 = {
  schemaVersion: 1;
  invocationId: string;
  parentInvocationId?: string;
  sessionId: ContextVmSessionId;
  taskId?: ContextVmTaskId;
  role: ContextVmInvocationRoleV1;
  rootContextPackId: ContextVmContextPackId;
  orderedContextPackIds: ContextVmContextPackId[];
  renderedContextHash: string;
  checkpointId?: ContextVmCheckpointId;
  attempts: ContextVmProviderAttemptArtifactV1[];
};

export type ContextVmResolvedInvocationV2 =
  | {
      schemaVersion: 2;
      status: "ready";
      artifact: ContextVmInvocationArtifactV1;
      renderedContext: string;
      coverageScore: number;
      faultRounds: ContextVmPageFaultRoundV1[];
    }
  | {
      schemaVersion: 2;
      status: "abstained" | "blocked";
      invocationId: string;
      reason:
        | ContextVmPageFaultAbstentionReasonV1
        | "context_pack_blocked"
        | "provider_failure"
        | "provider_timeout"
        | "provider_cancelled"
        | "malformed_decision"
        | "in_doubt";
      contextPackIds: ContextVmContextPackId[];
      faultRounds: ContextVmPageFaultRoundV1[];
    };

export type ContextVmContextContinuationV1 = {
  rootContextPackId: ContextVmContextPackId;
  previousContextPackId: ContextVmContextPackId;
  round: number;
  faultHash: string;
  missing: ContextVmMissingMemoryV1[];
};

export type ContextVmPageFaultAbstentionReasonV1 =
  | "malformed_request"
  | "unresolved"
  | "repeated_fault"
  | "round_limit"
  | "token_limit";

export type ContextVmPageFaultRoundV1 = {
  round: number;
  faultHash: string;
  contextPackId: ContextVmContextPackId;
  loadedMemoryIds: ContextVmMemoryId[];
  unresolved: ContextVmMissingMemoryV1[];
  renderedTokens: number;
};

export type ContextVmPageFaultOutcomeV1 =
  | {
      schemaVersion: 1;
      status: "ready";
      decision: Extract<ContextVmMemoryDecisionV1, { status: "READY" }>;
      rounds: ContextVmPageFaultRoundV1[];
      cumulativeFaultTokens: number;
    }
  | {
      schemaVersion: 1;
      status: "abstained";
      reason: ContextVmPageFaultAbstentionReasonV1;
      rounds: ContextVmPageFaultRoundV1[];
      cumulativeFaultTokens: number;
    };

export type ContextVmCacheMetricsV1 = {
  maxBytes: number;
  bytes: number;
  entries: number;
  pinnedEntries: number;
  hits: number;
  misses: number;
  evictions: number;
  prefetchLoads: number;
};

export type ContextVmTaskRecoveryStatus =
  | "active"
  | "waiting_approval"
  | "executing"
  | "verifying"
  | "completed"
  | "failed"
  | "cancelled";

export type ContextVmRecoveryObligationV1 = {
  id: string;
  kind: "approval" | "tool_transaction" | "verification" | "task";
  status: "pending" | "in_doubt";
  summary: string;
  sourceEventId: ContextVmEventId;
};

export type ContextVmRecoveredTaskV1 = {
  taskId: ContextVmTaskId;
  status: ContextVmTaskRecoveryStatus;
  summary: string;
  sourceEventId: ContextVmEventId;
};

export type ContextVmArtifactVersionV1 = {
  artifactId: ContextVmArtifactId;
  sha256: string;
  sourceEventId: ContextVmEventId;
};

export type ContextVmReconstructedStateV1 = {
  schemaVersion: 1;
  reducerVersion: "contextvm-state-v1";
  sessionId: ContextVmSessionId;
  throughSequence: number;
  activeGoal: string | null;
  tasks: ContextVmRecoveredTaskV1[];
  constraints: Array<{
    id: string;
    text: string;
    sourceEventId: ContextVmEventId;
  }>;
  obligations: ContextVmRecoveryObligationV1[];
  artifactVersions: ContextVmArtifactVersionV1[];
  terminalStatus: "completed" | "failed" | "cancelled" | null;
};

export type ContextVmStateCheckpointV1 = {
  schemaVersion: 1;
  id: ContextVmCheckpointId;
  sessionId: ContextVmSessionId;
  capturedThroughSequence: number;
  sourceEventRange: {
    start: number;
    end: number;
  };
  reducerVersion: "contextvm-state-v1";
  state: ContextVmReconstructedStateV1;
  stateHash: string;
  reason:
    | "explicit"
    | "session_checkpoint"
    | "task_closed"
    | "event_threshold";
  createdAt: string;
};

export type ContextVmRecoveryResultV1 = {
  schemaVersion: 1;
  status:
    | "recovered"
    | "recovered_with_fallback"
    | "recovery_required"
    | "blocked";
  source: "checkpoint" | "earlier_checkpoint" | "full_replay" | "none";
  checkpointId?: ContextVmCheckpointId;
  state?: ContextVmReconstructedStateV1;
  stateHash?: string;
  warnings: string[];
  durationMs: number;
};

export type ContextVmConsolidationTriggerV1 =
  | "session_checkpoint"
  | "task_closed"
  | "event_threshold"
  | "repeated_pattern"
  | "accepted_decision"
  | "explicit_save";

export type ContextVmConsolidationClaimKindV1 =
  | "goal"
  | "constraint"
  | "outcome"
  | "decision"
  | "procedure_step"
  | "failure";

export type ContextVmConsolidationClaimV1 = {
  kind: ContextVmConsolidationClaimKindV1;
  value: string;
  sources: ContextVmSourceRefV1[];
};

export type ContextVmConsolidationCandidateV1 = {
  schemaVersion: 1;
  namespace: string;
  sessionId: ContextVmSessionId;
  taskId?: ContextVmTaskId;
  outputKind:
    | "session_summary"
    | "task_summary"
    | "accepted_decision"
    | "reusable_procedure"
    | "failure_pattern";
  trigger: ContextVmConsolidationTriggerV1;
  claims: ContextVmConsolidationClaimV1[];
};

export type ContextVmConsolidationReportV1 = {
  schemaVersion: 1;
  sessionId: ContextVmSessionId;
  trigger: ContextVmConsolidationTriggerV1;
  inputHash: string;
  outputMemoryIds: ContextVmMemoryId[];
  rejected: Array<{
    outputKind: ContextVmConsolidationCandidateV1["outputKind"];
    reason: string;
  }>;
  sourceEventCount: number;
  createdAt: string;
};

export type ContextVmContextPackItemV1 = {
  section: ContextVmContextSection;
  sourceType: "inline" | "memory" | "event" | "artifact" | "improvement";
  sourceId: string;
  text: string;
  tokenCount: number;
  loadReason: string;
  retrievalScores?: ContextVmRetrievalScoresV1;
  contentHash: string;
  redaction: RedactionMetadata;
  entityIds?: string[];
  sourceTypes?: ContextVmMemorySourceTypeV1[];
  evidenceQuality?: ContextVmEvidenceQualityV1;
  sensitivity?: ContextVmSensitivity;
};

export type ContextVmContextPackDecisionV1 = {
  sourceId: string;
  decision: "loaded" | "excluded";
  reason: string;
  contentHash?: string;
  retrievalScores?: ContextVmRetrievalScoresV1;
};

export type ContextVmUnresolvedDependencyV1 = {
  kind: string;
  entity: string;
  severity: "low" | "medium" | "high";
};

export type ContextVmContextPackManifestV1 = {
  schemaVersion: 1;
  id: ContextVmContextPackId;
  status: "ready" | "partial" | "blocked";
  requestHash: string;
  hardBudgetTokens: number;
  renderedTokens: number;
  reservedOutputTokens: number;
  coverageScore: number;
  evidenceQualityScore: number;
  estimatorVersion: "chars-v1" | "utf8-upper-bound-v1";
  items: ContextVmContextPackItemV1[];
  decisions?: ContextVmContextPackDecisionV1[];
  unresolvedDependencies: ContextVmUnresolvedDependencyV1[];
  gaps: string[];
  renderedHash: string;
  renderedArtifactId?: ContextVmArtifactId;
  rootContextPackId?: ContextVmContextPackId;
  previousContextPackId?: ContextVmContextPackId;
  faultRound?: number;
  faultHash?: string;
  createdAt: string;
};

export type ContextVmContextPackV1 = {
  schemaVersion: 1;
  request: ContextVmContextRequestV1;
  manifest: ContextVmContextPackManifestV1;
  rendered: string;
};

export interface ContextVmEventStoreV1 {
  initialize(): Promise<ContextVmStatusV1>;
  appendEvent(input: NewContextVmEventV1): Promise<ContextVmEventV1>;
  appendEvents(inputs: NewContextVmEventV1[]): Promise<ContextVmEventV1[]>;
  getEvent(id: ContextVmEventId): Promise<ContextVmEventV1 | undefined>;
  scanSession(request: ContextVmScanRequestV1): Promise<ContextVmEventV1[]>;
  status(): Promise<ContextVmStatusV1>;
  verify(): Promise<ContextVmVerificationReportV1>;
  close(): void;
}

export interface ContextVmMemoryStoreV1 {
  putMemoryPage(input: NewContextVmMemoryPageV1): Promise<ContextVmMemoryPageV1>;
  getMemoryPage(id: ContextVmMemoryId): Promise<ContextVmMemoryPageV1 | undefined>;
  inspectMemory(id: ContextVmMemoryId): Promise<{
    page: ContextVmMemoryPageV1;
    contradictions: ContextVmContradictionV1[];
  } | undefined>;
  queryCurrentFact(input: {
    namespace: string;
    subject: string;
    predicate: string;
  }): Promise<ContextVmCurrentFactResultV1>;
  queryMemoryHistory(input: {
    namespace: string;
    subject: string;
    predicate: string;
  }): Promise<ContextVmMemoryPageV1[]>;
  retrieveMemoryPages(input: ContextVmRetrievalRequestV1): Promise<ContextVmRetrievalResultV1>;
  rebuildRetrievalIndex(): Promise<ContextVmIndexRebuildReportV1>;
  persistContextPack(pack: ContextVmContextPackV1): Promise<ContextVmContextPackManifestV1>;
  inspectContextPack(id: ContextVmContextPackId): Promise<ContextVmContextPackManifestV1 | undefined>;
  cacheMetrics(): ContextVmCacheMetricsV1;
  createStateCheckpoint(input: {
    sessionId: ContextVmSessionId;
    reason: ContextVmStateCheckpointV1["reason"];
  }): Promise<ContextVmStateCheckpointV1>;
  recoverSessionState(
    sessionId: ContextVmSessionId,
    signal?: AbortSignal,
  ): Promise<ContextVmRecoveryResultV1>;
  consolidateSession(input: {
    sessionId: ContextVmSessionId;
    namespace: string;
    trigger: ContextVmConsolidationTriggerV1;
    taskId?: ContextVmTaskId;
  }): Promise<ContextVmConsolidationReportV1>;
  discardConsolidatedMemory(id: ContextVmMemoryId): Promise<void>;
}

const SAFE_EXTERNAL_ID = /^(?!.*\.\.)[a-zA-Z0-9._:@-]{1,240}$/u;
const EVENT_ID = /^evt_[0-9a-z]{10}_[0-9a-f]{24}$/u;
const ARTIFACT_ID = /^artifact_sha256_[0-9a-f]{64}$/u;
const MEMORY_ID = /^mem_[0-9a-z]{10}_[0-9a-f]{24}$/u;
const CONTEXT_PACK_ID = /^ctx_[0-9a-f]{32}$/u;
const CHECKPOINT_ID = /^chk_[0-9a-f]{32}$/u;

function brandedId<Kind extends string>(
  value: string,
  label: string,
  pattern: RegExp,
): ContextVmId<Kind> {
  if (!pattern.test(value)) throw new Error(`invalid ContextVM ${label}: ${value}`);
  return value as ContextVmId<Kind>;
}

export function contextVmEventId(value: string): ContextVmEventId {
  return brandedId(value, "event id", EVENT_ID);
}

export function contextVmArtifactId(value: string): ContextVmArtifactId {
  return brandedId(value, "artifact id", ARTIFACT_ID);
}

export function contextVmMemoryId(value: string): ContextVmMemoryId {
  return brandedId(value, "memory id", MEMORY_ID);
}

export function contextVmContextPackId(value: string): ContextVmContextPackId {
  return brandedId(value, "context pack id", CONTEXT_PACK_ID);
}

export function contextVmCheckpointId(value: string): ContextVmCheckpointId {
  return brandedId(value, "checkpoint id", CHECKPOINT_ID);
}

export function contextVmSessionId(value: string): ContextVmSessionId {
  return brandedId(value, "session id", SAFE_EXTERNAL_ID);
}

export function contextVmTaskId(value: string): ContextVmTaskId {
  return brandedId(value, "task id", SAFE_EXTERNAL_ID);
}

export function parseContextVmEventV1(value: unknown): ContextVmEventV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("ContextVM event must be an object");
  }
  const event = value as Record<string, unknown>;
  const required = [
    "schemaVersion", "id", "sessionId", "sequenceNo", "source", "occurredAt",
    "recordedAt", "actor", "kind", "payload", "artifacts", "parentEventIds",
    "contentHash", "sensitivity", "redaction",
  ];
  const allowed = new Set([...required, "taskId"]);
  if (
    !required.every((key) => key in event) ||
    Object.keys(event).some((key) => !allowed.has(key)) ||
    event.schemaVersion !== 1 ||
    !Number.isSafeInteger(event.sequenceNo) ||
    Number(event.sequenceNo) < 1 ||
    typeof event.occurredAt !== "string" ||
    !Number.isFinite(Date.parse(event.occurredAt)) ||
    typeof event.recordedAt !== "string" ||
    !Number.isFinite(Date.parse(event.recordedAt)) ||
    typeof event.contentHash !== "string" ||
    !/^[0-9a-f]{64}$/u.test(event.contentHash) ||
    !Array.isArray(event.artifacts) ||
    !Array.isArray(event.parentEventIds)
  ) {
    throw new Error("invalid ContextVM event");
  }
  contextVmEventId(String(event.id));
  contextVmSessionId(String(event.sessionId));
  if (event.taskId !== undefined) contextVmTaskId(String(event.taskId));
  for (const id of event.parentEventIds) contextVmEventId(String(id));
  return structuredClone(event) as ContextVmEventV1;
}

const MEMORY_SOURCE_TYPES = new Set<ContextVmMemorySourceTypeV1>([
  "decision",
  "user_message",
  "tool_result",
  "test_result",
  "file_change",
  "code",
  "artifact",
]);
const MEMORY_RELATIONS = new Set<ContextVmMemoryRelationKind>([
  "depends_on", "caused_by", "supports", "contradicts", "supersedes",
  "implements", "tests", "blocks", "resolves", "derived_from", "mentions",
  "part_of", "owned_by",
]);
const EVIDENCE_QUALITIES = new Set<ContextVmEvidenceQualityV1>([
  "derived",
  "accepted",
  "verified",
]);

function parseMissingMemory(value: unknown): ContextVmMissingMemoryV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("ContextVM missing-memory request must be an object");
  }
  const record = value as Record<string, unknown>;
  const keys = new Set([
    "kind",
    "entities",
    "relation",
    "timeRange",
    "requiredSourceTypes",
    "minimumEvidenceQuality",
  ]);
  const entities = record.entities;
  const sourceTypes = record.requiredSourceTypes;
  const timeRange = record.timeRange;
  if (
    Object.keys(record).some((key) => !keys.has(key)) ||
    typeof record.kind !== "string" ||
    !/^[a-z][a-z0-9_:-]{0,79}$/u.test(record.kind) ||
    !Array.isArray(entities) ||
    entities.length < 1 ||
    entities.length > 8 ||
    entities.some(
      (entity) =>
        typeof entity !== "string" ||
        !entity.trim() ||
        entity.length > 240 ||
        /[*?]/u.test(entity),
    ) ||
    (
      record.relation !== null &&
      !MEMORY_RELATIONS.has(record.relation as ContextVmMemoryRelationKind)
    ) ||
    !Array.isArray(sourceTypes) ||
    sourceTypes.length < 1 ||
    sourceTypes.length > 8 ||
    sourceTypes.some(
      (sourceType) =>
        !MEMORY_SOURCE_TYPES.has(sourceType as ContextVmMemorySourceTypeV1),
    ) ||
    !EVIDENCE_QUALITIES.has(
      record.minimumEvidenceQuality as ContextVmEvidenceQualityV1,
    )
  ) {
    throw new Error("invalid ContextVM missing-memory request");
  }
  if (timeRange !== null) {
    if (!timeRange || typeof timeRange !== "object" || Array.isArray(timeRange)) {
      throw new Error("invalid ContextVM memory time range");
    }
    const range = timeRange as Record<string, unknown>;
    if (
      Object.keys(range).some((key) => !["start", "end"].includes(key)) ||
      typeof range.start !== "string" ||
      typeof range.end !== "string" ||
      !Number.isFinite(Date.parse(range.start)) ||
      !Number.isFinite(Date.parse(range.end)) ||
      Date.parse(range.start) >= Date.parse(range.end)
    ) {
      throw new Error("invalid ContextVM memory time range");
    }
  }
  return structuredClone(record) as ContextVmMissingMemoryV1;
}

export function parseContextVmMemoryDecisionV1(
  value: unknown,
): ContextVmMemoryDecisionV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("ContextVM memory decision must be an object");
  }
  const record = value as Record<string, unknown>;
  if (record.schemaVersion !== 1) {
    throw new Error("invalid ContextVM memory decision schema");
  }
  if (record.status === "READY") {
    if (
      Object.keys(record).some(
        (key) => !["schemaVersion", "status", "answerOrAction"].includes(key),
      ) ||
      !record.answerOrAction ||
      typeof record.answerOrAction !== "object" ||
      Array.isArray(record.answerOrAction) ||
      JSON.stringify(record.answerOrAction).length > 128 * 1024
    ) {
      throw new Error("invalid ContextVM READY decision");
    }
    return structuredClone(record) as ContextVmMemoryDecisionV1;
  }
  if (
    record.status !== "NEED_MEMORY" ||
    Object.keys(record).some(
      (key) => !["schemaVersion", "status", "missing"].includes(key),
    ) ||
    !Array.isArray(record.missing) ||
    record.missing.length < 1 ||
    record.missing.length > 8
  ) {
    throw new Error("invalid ContextVM NEED_MEMORY decision");
  }
  return {
    schemaVersion: 1,
    status: "NEED_MEMORY",
    missing: record.missing.map(parseMissingMemory),
  };
}

export function parseContextVmMemoryDecisionV2(
  value: unknown,
): ContextVmMemoryDecisionV2 {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("ContextVM memory decision must be an object");
  }
  const record = value as Record<string, unknown>;
  if (record.schemaVersion !== 2) {
    throw new Error("invalid ContextVM memory decision schema");
  }
  if (record.status === "READY") {
    if (
      Object.keys(record).some(
        (key) => !["schemaVersion", "status"].includes(key),
      )
    ) {
      throw new Error("invalid ContextVM READY decision");
    }
    return { schemaVersion: 2, status: "READY" };
  }
  if (
    record.status !== "NEED_MEMORY" ||
    Object.keys(record).some(
      (key) => !["schemaVersion", "status", "missing"].includes(key),
    ) ||
    !Array.isArray(record.missing) ||
    record.missing.length < 1 ||
    record.missing.length > 8
  ) {
    throw new Error("invalid ContextVM NEED_MEMORY decision");
  }
  return {
    schemaVersion: 2,
    status: "NEED_MEMORY",
    missing: record.missing.map(parseMissingMemory),
  };
}

function exactObject(
  value: unknown,
  keys: readonly string[],
  label: string,
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const record = value as Record<string, unknown>;
  const actual = Object.keys(record).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    throw new Error(`${label} has unexpected or missing fields`);
  }
  return record;
}

function validHash(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/u.test(value);
}

export function parseContextVmStateCheckpointV1(
  value: unknown,
): ContextVmStateCheckpointV1 {
  const checkpoint = exactObject(value, [
    "schemaVersion", "id", "sessionId", "capturedThroughSequence",
    "sourceEventRange", "reducerVersion", "state", "stateHash", "reason",
    "createdAt",
  ], "ContextVM checkpoint");
  if (
    checkpoint.schemaVersion !== 1 ||
    checkpoint.reducerVersion !== "contextvm-state-v1" ||
    !Number.isSafeInteger(checkpoint.capturedThroughSequence) ||
    Number(checkpoint.capturedThroughSequence) < 1 ||
    !validHash(checkpoint.stateHash) ||
    typeof checkpoint.createdAt !== "string" ||
    !Number.isFinite(Date.parse(checkpoint.createdAt)) ||
    !["explicit", "session_checkpoint", "task_closed", "event_threshold"]
      .includes(String(checkpoint.reason))
  ) {
    throw new Error("invalid ContextVM checkpoint");
  }
  contextVmCheckpointId(String(checkpoint.id));
  contextVmSessionId(String(checkpoint.sessionId));
  const range = exactObject(
    checkpoint.sourceEventRange,
    ["start", "end"],
    "ContextVM checkpoint source range",
  );
  if (
    !Number.isSafeInteger(range.start) ||
    Number(range.start) !== 1 ||
    !Number.isSafeInteger(range.end) ||
    Number(range.end) !== Number(checkpoint.capturedThroughSequence)
  ) {
    throw new Error("invalid ContextVM checkpoint source range");
  }
  const state = exactObject(checkpoint.state, [
    "schemaVersion", "reducerVersion", "sessionId", "throughSequence",
    "activeGoal", "tasks", "constraints", "obligations", "artifactVersions",
    "terminalStatus",
  ], "ContextVM reconstructed state");
  if (
    state.schemaVersion !== 1 ||
    state.reducerVersion !== "contextvm-state-v1" ||
    state.sessionId !== checkpoint.sessionId ||
    state.throughSequence !== checkpoint.capturedThroughSequence ||
    (state.activeGoal !== null && typeof state.activeGoal !== "string") ||
    !Array.isArray(state.tasks) ||
    !Array.isArray(state.constraints) ||
    !Array.isArray(state.obligations) ||
    !Array.isArray(state.artifactVersions) ||
    ![null, "completed", "failed", "cancelled"].includes(
      state.terminalStatus as null | string,
    )
  ) {
    throw new Error("invalid ContextVM reconstructed state");
  }
  for (const [index, value] of state.tasks.entries()) {
    const task = exactObject(
      value,
      ["taskId", "status", "summary", "sourceEventId"],
      `ContextVM recovered task ${index}`,
    );
    contextVmTaskId(String(task.taskId));
    contextVmEventId(String(task.sourceEventId));
    if (
      typeof task.summary !== "string" ||
      ![
        "active", "waiting_approval", "executing", "verifying", "completed",
        "failed", "cancelled",
      ].includes(String(task.status))
    ) {
      throw new Error("invalid ContextVM recovered task");
    }
  }
  for (const [index, value] of state.constraints.entries()) {
    const constraint = exactObject(
      value,
      ["id", "text", "sourceEventId"],
      `ContextVM recovered constraint ${index}`,
    );
    contextVmEventId(String(constraint.sourceEventId));
    if (
      typeof constraint.id !== "string" ||
      !constraint.id ||
      typeof constraint.text !== "string" ||
      !constraint.text
    ) {
      throw new Error("invalid ContextVM recovered constraint");
    }
  }
  for (const [index, value] of state.obligations.entries()) {
    const obligation = exactObject(
      value,
      ["id", "kind", "status", "summary", "sourceEventId"],
      `ContextVM recovery obligation ${index}`,
    );
    contextVmEventId(String(obligation.sourceEventId));
    if (
      typeof obligation.id !== "string" ||
      !obligation.id ||
      typeof obligation.summary !== "string" ||
      !["approval", "tool_transaction", "verification", "task"].includes(
        String(obligation.kind),
      ) ||
      !["pending", "in_doubt"].includes(String(obligation.status))
    ) {
      throw new Error("invalid ContextVM recovery obligation");
    }
  }
  for (const [index, value] of state.artifactVersions.entries()) {
    const artifact = exactObject(
      value,
      ["artifactId", "sha256", "sourceEventId"],
      `ContextVM artifact version ${index}`,
    );
    contextVmArtifactId(String(artifact.artifactId));
    contextVmEventId(String(artifact.sourceEventId));
    if (!validHash(artifact.sha256)) {
      throw new Error("invalid ContextVM artifact version");
    }
  }
  return structuredClone(checkpoint) as ContextVmStateCheckpointV1;
}

export function parseContextVmConsolidationCandidateV1(
  value: unknown,
): ContextVmConsolidationCandidateV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("ContextVM consolidation candidate must be an object");
  }
  const record = value as Record<string, unknown>;
  const allowed = new Set([
    "schemaVersion", "namespace", "sessionId", "taskId", "outputKind",
    "trigger", "claims",
  ]);
  if (
    Object.keys(record).some((key) => !allowed.has(key)) ||
    record.schemaVersion !== 1 ||
    typeof record.namespace !== "string" ||
    !record.namespace.trim() ||
    ![
      "session_summary", "task_summary", "accepted_decision",
      "reusable_procedure", "failure_pattern",
    ].includes(String(record.outputKind)) ||
    ![
      "session_checkpoint", "task_closed", "event_threshold",
      "repeated_pattern", "accepted_decision", "explicit_save",
    ].includes(String(record.trigger)) ||
    !Array.isArray(record.claims) ||
    record.claims.length < 1 ||
    record.claims.length > 128
  ) {
    throw new Error("invalid ContextVM consolidation candidate");
  }
  contextVmSessionId(String(record.sessionId));
  if (record.taskId !== undefined) contextVmTaskId(String(record.taskId));
  for (const [index, value] of record.claims.entries()) {
    const claim = exactObject(
      value,
      ["kind", "value", "sources"],
      `ContextVM consolidation claim ${index}`,
    );
    if (
      !["goal", "constraint", "outcome", "decision", "procedure_step", "failure"]
        .includes(String(claim.kind)) ||
      typeof claim.value !== "string" ||
      !claim.value.trim() ||
      claim.value.length > 2_000 ||
      !Array.isArray(claim.sources) ||
      claim.sources.length < 1 ||
      claim.sources.length > 32
    ) {
      throw new Error("invalid ContextVM consolidation claim");
    }
    for (const [sourceIndex, sourceValue] of claim.sources.entries()) {
      if (
        !sourceValue ||
        typeof sourceValue !== "object" ||
        Array.isArray(sourceValue)
      ) {
        throw new Error("invalid ContextVM consolidation source");
      }
      const source = sourceValue as Record<string, unknown>;
      if (source.type === "event") {
        exactObject(
          source,
          ["type", "eventId"],
          `ContextVM consolidation source ${index}.${sourceIndex}`,
        );
        contextVmEventId(String(source.eventId));
      } else if (source.type === "artifact") {
        const keys = source.locator === undefined
          ? ["type", "artifactId"]
          : ["type", "artifactId", "locator"];
        exactObject(
          source,
          keys,
          `ContextVM consolidation source ${index}.${sourceIndex}`,
        );
        contextVmArtifactId(String(source.artifactId));
      } else if (source.type === "memory") {
        exactObject(
          source,
          ["type", "memoryId"],
          `ContextVM consolidation source ${index}.${sourceIndex}`,
        );
        contextVmMemoryId(String(source.memoryId));
      } else {
        throw new Error("invalid ContextVM consolidation source type");
      }
    }
  }
  return structuredClone(record) as ContextVmConsolidationCandidateV1;
}
