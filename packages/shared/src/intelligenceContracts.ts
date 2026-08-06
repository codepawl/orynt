import type {
  CapabilityOutcomeV1,
  ImprovementCandidateV1,
} from "./capabilityContracts.js";
import type { ContextVmStatusV1 } from "./contextVmContracts.js";
import type { MemoryNamespace, MemoryStoreRevision } from "./memoryContracts.js";

export const INTELLIGENCE_LAYOUT_VERSION = 2 as const;
export const IMPROVEMENT_STORE_SCHEMA_VERSION = 2 as const;

export type IntelligenceStateLayoutV2 = {
  layoutVersion: typeof INTELLIGENCE_LAYOUT_VERSION;
  stateRoot: string;
  intelligenceRoot: string;
  contextVmRoot: string;
  contextVmDatabasePath: string;
  contextVmArchiveRoot: string;
  contextVmReportsRoot: string;
  memoryRoot: string;
  memoryStorePath: string;
  memoryArtifactsRoot: string;
  improvementsRoot: string;
  improvementStorePath: string;
  improvementArtifactsRoot: string;
  migrationsRoot: string;
  cognitiveStateRoot: string;
};

/** @deprecated Use IntelligenceStateLayoutV2. */
export type IntelligenceStateLayoutV1 = IntelligenceStateLayoutV2;

export type ActiveImprovementV2 = {
  candidateId: string;
  targetId: string;
  targetClass: ImprovementCandidateV1["targetClass"];
  targetScope: ImprovementCandidateV1["targetScope"];
  artifactRef: string;
  artifactDigest: string;
  previousArtifactRef?: string;
  activatedAt: string;
};

export type ImprovementAuditEntryV2 = {
  id: string;
  operation:
    | "outcome.appended"
    | "candidate.upserted"
    | "candidate.decided"
    | "candidate.quarantined"
    | "target.activated"
    | "target.rolled_back";
  targetId: string;
  recordedAt: string;
  reasonCodes: string[];
  committedRevision: number;
};

export type ImprovementStoreEnvelopeV2 = {
  schemaVersion: typeof IMPROVEMENT_STORE_SCHEMA_VERSION;
  revision: number;
  outcomes: CapabilityOutcomeV1[];
  candidates: ImprovementCandidateV1[];
  activeTargets: Record<string, ActiveImprovementV2>;
  audit: ImprovementAuditEntryV2[];
  updatedAt: string;
};

export type AgentIntelligenceItemKind =
  | "semantic"
  | "procedural"
  | "episodic"
  | "active_improvement";

export type AgentIntelligenceItemV1 = {
  id: string;
  kind: AgentIntelligenceItemKind;
  summary: string;
  confidence: number;
  lifecycleStatus: string;
  advisory: true;
  sourceRunId?: string;
  sourceArtifactRefs: string[];
  sourceRevision: number;
};

export type IntelligenceExclusionReason =
  | "expired"
  | "unapproved"
  | "sensitive"
  | "conflicted"
  | "namespace_mismatch"
  | "token_budget"
  | "limit";

export type ContextVmRetrievalViewV1 = {
  schemaVersion: 1;
  status: "ready" | "empty" | "partial" | "blocked";
  namespace: MemoryNamespace;
  query: string;
  memoryRevision: MemoryStoreRevision;
  improvementRevision: number;
  selected: AgentIntelligenceItemV1[];
  excludedCounts: Partial<Record<IntelligenceExclusionReason, number>>;
  gaps: string[];
  generatedAt: string;
};

/** @deprecated Migration decoder and fixture compatibility only. */
export type AgentIntelligenceContextV1 = ContextVmRetrievalViewV1;

export type IntelligenceSearchQueryV1 = {
  query: string;
  kinds?: AgentIntelligenceItemKind[];
  limit?: number;
};

export type IntelligenceSearchResultV1 = {
  schemaVersion: 1;
  contextStatus: ContextVmRetrievalViewV1["status"];
  namespace: MemoryNamespace;
  memoryRevision: number;
  improvementRevision: number;
  items: AgentIntelligenceItemV1[];
  truncated: boolean;
  gaps: string[];
};

export type IntelligenceStatusV2 = {
  schemaVersion: 2;
  layoutVersion: typeof INTELLIGENCE_LAYOUT_VERSION;
  health: "ready" | "empty" | "blocked";
  memory: {
    schemaVersion: number;
    revision: number;
    itemCount: number;
  };
  improvements: {
    schemaVersion: number;
    revision: number;
    outcomeCount: number;
    candidateCount: number;
    activeTargetCount: number;
  };
  migration: {
    required: boolean;
    blocked: boolean;
    backupIds: string[];
  };
  contextVm: ContextVmStatusV1 & {
    derivedMemoryAuthority: "contextvm_sqlite_v2";
    migrationState: "completed";
  };
  canonicalPaths: {
    memoryStore: string;
    improvementStore: string;
  };
};

/** @deprecated Use IntelligenceStatusV2. */
export type IntelligenceStatusV1 = IntelligenceStatusV2;
