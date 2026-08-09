import type {
  ArtifactRef,
  RedactionMetadata,
  RunEventType,
} from "./runSpine.js";
import type {
  ContextVmRetrievalScoresV1,
} from "./contextVmContracts.js";

export const CANONICAL_TRACE_SCHEMA_VERSION = 1 as const;
export const AGENT_EVIDENCE_PACKET_SCHEMA_VERSION = 1 as const;

export type RepositoryEvidenceScopeV1 = {
  schemaVersion: 1;
  localRepositoryId: string;
  canonicalRepositoryPath: string;
  headCommit: string | null;
  branchRef: string | null;
  dirty: boolean;
  workingStateDigest: string | null;
  revisionKey: string | null;
  completeness: "complete" | "head_only" | "unavailable";
  capturedAt: string;
};

export type CanonicalTracePhaseV1 =
  | "prepare"
  | "run"
  | "verify"
  | "recovery"
  | "done"
  | "unknown";

export type CanonicalTraceActorV1 =
  | "user"
  | "orynt"
  | "model"
  | "tool"
  | "verifier"
  | "policy"
  | "system";

export type CanonicalTraceEventV1 = {
  schemaVersion: typeof CANONICAL_TRACE_SCHEMA_VERSION;
  eventId: string;
  sourceRunEventId: string;
  runId: string;
  taskId: string;
  workspaceId: string;
  sequenceNo: number;
  occurredAt: string;
  eventType: RunEventType;
  phase: CanonicalTracePhaseV1;
  actor: CanonicalTraceActorV1;
  repositoryScope: RepositoryEvidenceScopeV1;
  previousEventId?: string;
  causalParentEventIds: string[];
  redactedPayload: unknown;
  artifactRefs: ArtifactRef[];
  redaction: RedactionMetadata;
  contentHash: string;
};

export type AgentEvidenceQueryIntentV1 =
  | "local"
  | "relational"
  | "temporal"
  | "causal";

export type AgentEvidenceQueryProfileV1 = {
  intent: AgentEvidenceQueryIntentV1;
  expectedEvidenceTypes: string[];
  reasons: string[];
};

export type AgentEvidencePacketItemV1 = {
  evidenceId: string;
  kind: string;
  advisory: true;
  trust: "user" | "verifier" | "tool" | "model" | "system";
  displaySummary: string;
  sourceExcerpt: string;
  sourceEventIds: string[];
  artifactRefs: ArtifactRef[];
  sourceRevisionKey: string | null;
  occurredAt: string | null;
  score: number;
  scoreComponents: ContextVmRetrievalScoresV1;
  loadReasons: string[];
  redaction: RedactionMetadata;
  contentHash: string;
};

export type RevisionBoundEvidenceClosureV1 = {
  schemaVersion: typeof AGENT_EVIDENCE_PACKET_SCHEMA_VERSION;
  packetId: string;
  query: string;
  generatedAt: string;
  scope: {
    workspaceId: string;
    repository: RepositoryEvidenceScopeV1;
    taskId?: string;
    runId?: string;
  };
  queryProfile: AgentEvidenceQueryProfileV1;
  items: AgentEvidencePacketItemV1[];
  conflicts: Array<{
    evidenceIds: string[];
    status: "unresolved" | "superseded";
    resolutionEvidenceId?: string;
  }>;
  gaps: Array<{ code: string; detail: string }>;
  truncation: {
    itemBudget: number;
    tokenBudget: number;
    estimatedTokensUsed: number;
    omittedCount: number;
    reasons: string[];
  };
  renderedArtifact?: {
    id: string;
    sha256: string;
    uri: string;
    mediaType: "text/plain";
  };
  rendered: string;
};

/** @deprecated Migration decoder and fixture compatibility only. */
export type AgentEvidencePacketV1 = RevisionBoundEvidenceClosureV1;

export function canonicalEvidenceJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    const encoded = JSON.stringify(value);
    if (encoded === undefined) throw new Error("canonical evidence value is not JSON");
    return encoded;
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalEvidenceJson).join(",")}]`;
  }
  return `{${Object.entries(value as Record<string, unknown>)
    .filter(([, nested]) => nested !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, nested]) =>
      `${JSON.stringify(key)}:${canonicalEvidenceJson(nested)}`)
    .join(",")}}`;
}

export function parseRepositoryEvidenceScopeV1(
  value: unknown,
): RepositoryEvidenceScopeV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("repository evidence scope must be an object");
  }
  const scope = value as Record<string, unknown>;
  const nullableStrings = [
    "headCommit", "branchRef", "workingStateDigest", "revisionKey",
  ];
  if (
    scope.schemaVersion !== 1 ||
    typeof scope.localRepositoryId !== "string" ||
    !scope.localRepositoryId ||
    typeof scope.canonicalRepositoryPath !== "string" ||
    !scope.canonicalRepositoryPath ||
    typeof scope.dirty !== "boolean" ||
    !nullableStrings.every((key) =>
      scope[key] === null || typeof scope[key] === "string") ||
    !["complete", "head_only", "unavailable"].includes(
      String(scope.completeness),
    ) ||
    typeof scope.capturedAt !== "string" ||
    !Number.isFinite(Date.parse(scope.capturedAt))
  ) {
    throw new Error("repository evidence scope v1 is invalid");
  }
  return structuredClone(value) as RepositoryEvidenceScopeV1;
}

export function parseCanonicalTraceEventV1(
  value: unknown,
): CanonicalTraceEventV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("canonical trace event must be an object");
  }
  const event = value as Record<string, unknown>;
  if (
    event.schemaVersion !== CANONICAL_TRACE_SCHEMA_VERSION ||
    typeof event.eventId !== "string" ||
    typeof event.sourceRunEventId !== "string" ||
    typeof event.runId !== "string" ||
    typeof event.taskId !== "string" ||
    typeof event.workspaceId !== "string" ||
    !Number.isSafeInteger(event.sequenceNo) ||
    Number(event.sequenceNo) < 1 ||
    typeof event.occurredAt !== "string" ||
    !Number.isFinite(Date.parse(event.occurredAt)) ||
    typeof event.eventType !== "string" ||
    !Array.isArray(event.causalParentEventIds) ||
    typeof event.contentHash !== "string" ||
    !/^[a-f0-9]{64}$/u.test(event.contentHash)
  ) {
    throw new Error("canonical trace event v1 is invalid");
  }
  parseRepositoryEvidenceScopeV1(event.repositoryScope);
  return structuredClone(value) as CanonicalTraceEventV1;
}
