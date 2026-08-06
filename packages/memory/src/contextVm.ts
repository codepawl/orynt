import { createHash, randomBytes } from "node:crypto";
import { access, chmod, mkdir, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { zstdCompress, zstdDecompress } from "node:zlib";

import { atomicWriteFileDurable } from "@codepawl/local-state";
import {
  contextVmArtifactId,
  contextVmCheckpointId,
  contextVmContextPackId,
  contextVmEventId,
  contextVmMemoryId,
  contextVmSessionId,
  contextVmTaskId,
  parseContextVmEventV1,
  parseContextVmConsolidationCandidateV1,
  parseContextVmStateCheckpointV1,
  redactSensitivePayload,
  redactSensitiveText,
  type ContextVmArtifactInputV1,
  type ContextVmArtifactRefV1,
  type ContextVmEventId,
  type ContextVmEventStoreV1,
  type ContextVmEventV1,
  type ContextVmMemoryId,
  type ContextVmMemoryPageV1,
  type ContextVmMemoryStoreV1,
  type ContextVmContradictionV1,
  type ContextVmCurrentFactResultV1,
  type NewContextVmMemoryPageV1,
  type ContextVmScanRequestV1,
  type ContextVmSessionId,
  type ContextVmTaskId,
  type ContextVmStatusV1,
  type ContextVmVerificationCheckV1,
  type ContextVmVerificationReportV1,
  type ContextVmExtractionCandidateV1,
  type ContextVmExtractionReportV1,
  type ContextVmIndexRebuildReportV1,
  type ContextVmRetrievalCandidateV1,
  type ContextVmRetrievalRequestV1,
  type ContextVmRetrievalResultV1,
  type ContextVmContextPackId,
  type ContextVmContextPackManifestV1,
  type ContextVmContextPackV1,
  type ContextVmCheckpointId,
  type ContextVmConsolidationCandidateV1,
  type ContextVmConsolidationReportV1,
  type ContextVmConsolidationTriggerV1,
  type ContextVmReconstructedStateV1,
  type ContextVmRecoveryObligationV1,
  type ContextVmRecoveryResultV1,
  type ContextVmStateCheckpointV1,
  type CanonicalTraceEventV1,
  type NewContextVmEventV1,
  type MemoryStoreEnvelopeV2,
  type RedactionMetadata,
} from "@codepawl/shared";
import {
  DeterministicContextVmPageCache,
  type ContextVmCacheSignals,
} from "./contextVmCache.js";

const compressZstd = promisify(zstdCompress);
const decompressZstd = promisify(zstdDecompress);

type SqliteStatement = {
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
  run(...params: unknown[]): unknown;
};

type SqliteDatabase = {
  exec(sql: string): unknown;
  prepare(sql: string): SqliteStatement;
  close(): void;
};

type RawSqliteDatabase = {
  exec(sql: string): unknown;
  prepare?(sql: string): SqliteStatement;
  query?(sql: string): SqliteStatement;
  close(): void;
};

type SqliteDatabaseConstructor = new (filename: string) => RawSqliteDatabase;

const sqliteModule = await import(
  (process.versions as Record<string, string | undefined>).bun
    ? "bun:sqlite"
    : "node:sqlite"
) as unknown as {
  Database?: SqliteDatabaseConstructor;
  DatabaseSync?: SqliteDatabaseConstructor;
};
const SqliteConstructor =
  sqliteModule.DatabaseSync ?? sqliteModule.Database;

function openSqliteDatabase(filename: string): SqliteDatabase {
  if (!SqliteConstructor) {
    throw new Error("The active runtime does not expose a supported SQLite API");
  }
  const database = new SqliteConstructor(filename);
  return {
    exec: (sql) => database.exec(sql),
    prepare: (sql) => {
      const statement = database.prepare?.(sql) ?? database.query?.(sql);
      if (!statement) throw new Error("The active SQLite runtime cannot prepare statements");
      return statement;
    },
    close: () => database.close(),
  };
}
const DATABASE_SCHEMA_VERSION = 10;
const RETRIEVAL_INDEX_VERSION = 1;
const EXTRACTOR_VERSION = "contextvm-deterministic-v1";
const MAX_SCAN_LIMIT = 10_000;
const MAX_BATCH_SIZE = 10_000;
const COMPRESSION_THRESHOLD = 4 * 1024;
const MAX_INLINE_PAYLOAD_BYTES = 64 * 1024;

const MIGRATION_1 = `
CREATE TABLE schema_migrations (
  version INTEGER PRIMARY KEY,
  checksum TEXT NOT NULL,
  applied_at TEXT NOT NULL
) STRICT;
CREATE TABLE artifacts (
  id TEXT PRIMARY KEY,
  sha256 TEXT NOT NULL UNIQUE,
  encoding TEXT NOT NULL CHECK(encoding IN ('identity', 'zstd')),
  uncompressed_bytes INTEGER NOT NULL CHECK(uncompressed_bytes >= 0),
  stored_bytes INTEGER NOT NULL CHECK(stored_bytes >= 0),
  archive_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
) STRICT;
CREATE TABLE events (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  task_id TEXT,
  sequence_no INTEGER NOT NULL CHECK(sequence_no >= 1),
  source_kind TEXT NOT NULL,
  source_id TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  actor_json TEXT NOT NULL,
  kind TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  sensitivity TEXT NOT NULL,
  redaction_json TEXT NOT NULL,
  UNIQUE(session_id, sequence_no),
  UNIQUE(source_kind, source_id)
) STRICT;
CREATE INDEX idx_contextvm_events_session_seq ON events(session_id, sequence_no);
CREATE INDEX idx_contextvm_events_task_time ON events(task_id, occurred_at);
CREATE TABLE event_artifacts (
  event_id TEXT NOT NULL REFERENCES events(id),
  position INTEGER NOT NULL CHECK(position >= 0),
  artifact_id TEXT NOT NULL REFERENCES artifacts(id),
  media_type TEXT NOT NULL,
  sensitivity TEXT NOT NULL,
  label TEXT,
  PRIMARY KEY(event_id, position)
) STRICT;
CREATE TABLE event_parents (
  event_id TEXT NOT NULL REFERENCES events(id),
  parent_event_id TEXT NOT NULL REFERENCES events(id),
  PRIMARY KEY(event_id, parent_event_id),
  CHECK(event_id <> parent_event_id)
) STRICT;
`;

const MIGRATION_2 = `
CREATE TABLE memory_state (
  singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
  revision INTEGER NOT NULL CHECK(revision >= 0),
  envelope_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  source_artifact_id TEXT REFERENCES artifacts(id)
) STRICT;
CREATE TABLE memory_pages (
  id TEXT PRIMARY KEY,
  legacy_key TEXT,
  namespace TEXT NOT NULL,
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  summary TEXT NOT NULL,
  content_json TEXT NOT NULL,
  normalized_content TEXT NOT NULL,
  subject TEXT,
  predicate TEXT,
  valid_from TEXT NOT NULL,
  valid_until TEXT,
  superseded_by TEXT REFERENCES memory_pages(id),
  confidence REAL NOT NULL CHECK(confidence >= 0 AND confidence <= 1),
  importance REAL NOT NULL CHECK(importance >= 0 AND importance <= 1),
  evidence_priority TEXT NOT NULL,
  producer TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  token_count INTEGER NOT NULL CHECK(token_count >= 0),
  content_hash TEXT NOT NULL,
  current INTEGER NOT NULL CHECK(current IN (0, 1))
) STRICT;
CREATE UNIQUE INDEX idx_contextvm_memory_legacy_version
  ON memory_pages(legacy_key, content_hash) WHERE legacy_key IS NOT NULL;
CREATE INDEX idx_contextvm_memory_current_fact
  ON memory_pages(namespace, subject, predicate, current);
CREATE TABLE memory_sources (
  memory_id TEXT NOT NULL REFERENCES memory_pages(id),
  position INTEGER NOT NULL CHECK(position >= 0),
  source_type TEXT NOT NULL CHECK(source_type IN ('event', 'artifact', 'memory')),
  source_id TEXT NOT NULL,
  locator TEXT,
  PRIMARY KEY(memory_id, position)
) STRICT;
CREATE TABLE memory_entities (
  memory_id TEXT NOT NULL REFERENCES memory_pages(id),
  entity_id TEXT NOT NULL,
  PRIMARY KEY(memory_id, entity_id)
) STRICT;
CREATE TABLE memory_tasks (
  memory_id TEXT NOT NULL REFERENCES memory_pages(id),
  task_id TEXT NOT NULL,
  PRIMARY KEY(memory_id, task_id)
) STRICT;
CREATE TABLE memory_relations (
  memory_id TEXT NOT NULL REFERENCES memory_pages(id),
  relation_type TEXT NOT NULL,
  target_memory_id TEXT NOT NULL REFERENCES memory_pages(id),
  PRIMARY KEY(memory_id, relation_type, target_memory_id),
  CHECK(memory_id <> target_memory_id)
) STRICT;
CREATE TABLE memory_contradictions (
  id TEXT PRIMARY KEY,
  namespace TEXT NOT NULL,
  subject TEXT NOT NULL,
  predicate TEXT NOT NULL,
  left_memory_id TEXT NOT NULL REFERENCES memory_pages(id),
  right_memory_id TEXT NOT NULL REFERENCES memory_pages(id),
  status TEXT NOT NULL CHECK(status IN ('unresolved', 'resolved')),
  resolution_memory_id TEXT REFERENCES memory_pages(id),
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  UNIQUE(left_memory_id, right_memory_id)
) STRICT;
CREATE TABLE memory_audit (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  operation TEXT NOT NULL,
  memory_id TEXT,
  revision INTEGER NOT NULL,
  occurred_at TEXT NOT NULL,
  details_json TEXT NOT NULL
) STRICT;
`;

const MIGRATION_3 = `
CREATE VIRTUAL TABLE memory_fts USING fts5(
  memory_id UNINDEXED,
  summary,
  normalized_content,
  subject,
  predicate,
  identifiers,
  tokenize = 'unicode61'
);
CREATE TABLE memory_identifiers (
  memory_id TEXT NOT NULL REFERENCES memory_pages(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  value TEXT NOT NULL,
  search_key TEXT NOT NULL,
  PRIMARY KEY(memory_id, kind, search_key)
) STRICT;
CREATE INDEX idx_contextvm_memory_identifier_search
  ON memory_identifiers(search_key, kind);
CREATE TABLE extraction_runs (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  extractor_version TEXT NOT NULL,
  input_hash TEXT NOT NULL,
  output_hash TEXT NOT NULL,
  candidate_count INTEGER NOT NULL CHECK(candidate_count >= 0),
  admitted_count INTEGER NOT NULL CHECK(admitted_count >= 0),
  rejected_count INTEGER NOT NULL CHECK(rejected_count >= 0),
  created_at TEXT NOT NULL,
  UNIQUE(session_id, extractor_version, input_hash)
) STRICT;
CREATE TABLE extraction_candidates (
  extraction_id TEXT NOT NULL REFERENCES extraction_runs(id) ON DELETE CASCADE,
  candidate_hash TEXT NOT NULL,
  candidate_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('admitted', 'rejected')),
  reason TEXT NOT NULL,
  memory_id TEXT REFERENCES memory_pages(id),
  PRIMARY KEY(extraction_id, candidate_hash)
) STRICT;
CREATE TABLE extraction_candidate_sources (
  extraction_id TEXT NOT NULL,
  candidate_hash TEXT NOT NULL,
  event_id TEXT NOT NULL REFERENCES events(id),
  PRIMARY KEY(extraction_id, candidate_hash, event_id),
  FOREIGN KEY(extraction_id, candidate_hash)
    REFERENCES extraction_candidates(extraction_id, candidate_hash) ON DELETE CASCADE
) STRICT;
CREATE TABLE memory_index_state (
  singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
  index_version INTEGER NOT NULL,
  indexed_memory_pages INTEGER NOT NULL,
  identifier_count INTEGER NOT NULL,
  digest TEXT NOT NULL,
  rebuilt_at TEXT NOT NULL
) STRICT;
INSERT INTO memory_fts
  (memory_id, summary, normalized_content, subject, predicate, identifiers)
SELECT id, summary, normalized_content, COALESCE(subject, ''),
       COALESCE(predicate, ''), ''
FROM memory_pages;
`;

const MIGRATION_4 = `
CREATE TABLE context_packs (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  task_id TEXT,
  namespace TEXT NOT NULL,
  request_json TEXT NOT NULL,
  manifest_json TEXT NOT NULL,
  rendered_artifact_id TEXT REFERENCES artifacts(id),
  rendered_hash TEXT NOT NULL,
  rendered_tokens INTEGER NOT NULL CHECK(rendered_tokens >= 0),
  hard_budget_tokens INTEGER NOT NULL CHECK(hard_budget_tokens >= 0),
  created_at TEXT NOT NULL,
  CHECK(rendered_tokens <= hard_budget_tokens)
) STRICT;
CREATE TABLE context_pack_items (
  context_pack_id TEXT NOT NULL REFERENCES context_packs(id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK(position >= 0),
  section TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  token_count INTEGER NOT NULL CHECK(token_count >= 0),
  load_reason TEXT NOT NULL,
  retrieval_scores_json TEXT,
  content_hash TEXT NOT NULL,
  PRIMARY KEY(context_pack_id, position)
) STRICT;
CREATE INDEX idx_contextvm_context_packs_session
  ON context_packs(session_id, created_at);
`;

const MIGRATION_5 = `
CREATE TABLE canonical_trace_projection (
  source_run_event_id TEXT PRIMARY KEY,
  canonical_event_id TEXT NOT NULL UNIQUE,
  run_id TEXT NOT NULL,
  sequence_no INTEGER NOT NULL,
  contextvm_event_id TEXT NOT NULL REFERENCES events(id),
  repository_scope_json TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  projected_at TEXT NOT NULL,
  UNIQUE(run_id, sequence_no)
) STRICT;
CREATE INDEX idx_contextvm_projection_run_sequence
  ON canonical_trace_projection(run_id, sequence_no);
CREATE TABLE canonical_trace_watermarks (
  run_id TEXT PRIMARY KEY,
  sequence_no INTEGER NOT NULL CHECK(sequence_no >= 0),
  source_run_event_id TEXT,
  content_hash TEXT,
  updated_at TEXT NOT NULL
) STRICT;
`;

const MIGRATION_6 = `
CREATE TABLE state_checkpoints (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  captured_through_sequence INTEGER NOT NULL CHECK(captured_through_sequence >= 1),
  source_start_sequence INTEGER NOT NULL CHECK(source_start_sequence = 1),
  source_end_sequence INTEGER NOT NULL CHECK(source_end_sequence = captured_through_sequence),
  reducer_version TEXT NOT NULL,
  state_json TEXT NOT NULL,
  state_hash TEXT NOT NULL,
  reason TEXT NOT NULL,
  checkpoint_event_id TEXT NOT NULL REFERENCES events(id),
  created_at TEXT NOT NULL,
  UNIQUE(session_id, captured_through_sequence, state_hash)
) STRICT;
CREATE INDEX idx_contextvm_checkpoints_session_sequence
  ON state_checkpoints(session_id, captured_through_sequence DESC);
`;

const MIGRATION_7 = `
CREATE TABLE consolidation_runs (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  task_id TEXT,
  namespace TEXT NOT NULL,
  trigger TEXT NOT NULL,
  input_hash TEXT NOT NULL,
  source_event_count INTEGER NOT NULL CHECK(source_event_count >= 0),
  generation INTEGER NOT NULL CHECK(generation >= 1),
  report_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(session_id, namespace, trigger, input_hash, generation)
) STRICT;
CREATE TABLE consolidation_outputs (
  consolidation_id TEXT NOT NULL REFERENCES consolidation_runs(id),
  position INTEGER NOT NULL CHECK(position >= 0),
  memory_id TEXT NOT NULL REFERENCES memory_pages(id),
  output_kind TEXT NOT NULL,
  PRIMARY KEY(consolidation_id, position),
  UNIQUE(memory_id)
) STRICT;
CREATE INDEX idx_contextvm_consolidation_session
  ON consolidation_runs(session_id, created_at);
`;

const MIGRATION_8 = `
ALTER TABLE memory_pages ADD COLUMN sensitivity TEXT NOT NULL DEFAULT 'internal'
  CHECK(sensitivity IN ('public', 'internal', 'personal', 'restricted', 'secret', 'credential'));
ALTER TABLE memory_pages ADD COLUMN owner_id TEXT;
CREATE INDEX idx_contextvm_memory_access
  ON memory_pages(namespace, sensitivity, owner_id, current);
CREATE TABLE context_invocations (
  invocation_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  task_id TEXT,
  role TEXT NOT NULL,
  provider TEXT NOT NULL,
  context_pack_id TEXT,
  context_pack_hash TEXT,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  completed_at TEXT
) STRICT;
CREATE INDEX idx_contextvm_invocations_session
  ON context_invocations(session_id, created_at);
CREATE TABLE context_pack_decisions (
  invocation_id TEXT NOT NULL REFERENCES context_invocations(invocation_id),
  round INTEGER NOT NULL CHECK(round >= 0),
  decision_json TEXT NOT NULL,
  context_pack_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(invocation_id, round)
) STRICT;
`;

const MIGRATION_9 = `
CREATE TABLE context_invocation_audit (
  invocation_id TEXT PRIMARY KEY REFERENCES context_invocations(invocation_id),
  model_id TEXT NOT NULL,
  retrieval_mode TEXT NOT NULL CHECK(retrieval_mode IN ('authority_only', 'hybrid')),
  ordered_context_pack_ids_json TEXT NOT NULL,
  terminal_reason TEXT,
  checkpoint_id TEXT REFERENCES state_checkpoints(id),
  updated_at TEXT NOT NULL
) STRICT;
CREATE TABLE context_provider_dispatches (
  invocation_id TEXT NOT NULL REFERENCES context_invocations(invocation_id),
  attempt INTEGER NOT NULL CHECK(attempt >= 1),
  transport TEXT NOT NULL CHECK(transport IN (
    'codex-cli', 'codex-app-server', 'openai-responses', 'scripted'
  )),
  model_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN (
    'prepared', 'dispatched', 'completed', 'failed', 'in_doubt'
  )),
  context_pack_id TEXT REFERENCES context_packs(id),
  context_pack_hash TEXT,
  failure_reason TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT,
  PRIMARY KEY(invocation_id, attempt)
) STRICT;
CREATE INDEX idx_contextvm_dispatch_status
  ON context_provider_dispatches(status, created_at);
`;

const MIGRATION_10 = `
ALTER TABLE context_invocation_audit
  ADD COLUMN parent_invocation_id TEXT REFERENCES context_invocations(invocation_id);
CREATE TABLE context_provider_attempts (
  attempt_id TEXT PRIMARY KEY,
  invocation_id TEXT NOT NULL REFERENCES context_invocations(invocation_id),
  phase TEXT NOT NULL CHECK(phase IN ('readiness', 'inference')),
  attempt INTEGER NOT NULL CHECK(attempt >= 1),
  transport TEXT NOT NULL CHECK(transport IN (
    'codex-cli', 'codex-app-server', 'openai-responses', 'scripted'
  )),
  model_id TEXT NOT NULL,
  thinking_effort TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN (
    'prepared', 'dispatched', 'completed', 'failed', 'in_doubt'
  )),
  context_pack_ids_json TEXT NOT NULL,
  context_hash TEXT NOT NULL,
  result_hash TEXT,
  usage_json TEXT,
  failure_reason TEXT,
  created_at TEXT NOT NULL,
  dispatched_at TEXT,
  completed_at TEXT,
  UNIQUE(invocation_id, phase, attempt)
) STRICT;
CREATE INDEX idx_contextvm_attempts_recovery
  ON context_provider_attempts(invocation_id, status, created_at);
CREATE TABLE context_memory_exemptions (
  exemption_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  task_id TEXT,
  operation TEXT NOT NULL,
  reason TEXT NOT NULL CHECK(reason IN (
    'asset_generation', 'provider_probe', 'non_agent_generation'
  )),
  transport TEXT NOT NULL,
  model_id TEXT NOT NULL,
  input_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
) STRICT;
CREATE INDEX idx_contextvm_exemptions_session
  ON context_memory_exemptions(session_id, created_at);
`;

const MIGRATIONS = new Map([
  [1, MIGRATION_1],
  [2, MIGRATION_2],
  [3, MIGRATION_3],
  [4, MIGRATION_4],
  [5, MIGRATION_5],
  [6, MIGRATION_6],
  [7, MIGRATION_7],
  [8, MIGRATION_8],
  [9, MIGRATION_9],
  [10, MIGRATION_10],
]);

export type ContextVmStoreOptions = {
  root: string;
  now?: () => string;
  cacheMaxBytes?: number;
};

export type ContextVmInvocationAuditInputV1 = {
  invocationId: string;
  sessionId: ContextVmSessionId;
  taskId?: ContextVmTaskId;
  role: string;
  provider: string;
  modelId: string;
  retrievalMode: "authority_only" | "hybrid";
  parentInvocationId?: string;
};

export type ContextVmInvocationCompletionInputV1 = {
  invocationId: string;
  status: "ready" | "blocked" | "abstained" | "failed";
  contextPackIds: ContextVmContextPackId[];
  contextPackHash?: string;
  terminalReason?: string;
  checkpointId?: ContextVmCheckpointId;
};

type StoredArtifact = {
  ref: ContextVmArtifactRefV1;
  archiveKey: string;
  storedBytes: Uint8Array;
};

type EventRow = {
  id: string;
  session_id: string;
  task_id: string | null;
  sequence_no: number;
  source_kind: string;
  source_id: string;
  occurred_at: string;
  recorded_at: string;
  actor_json: string;
  kind: string;
  payload_json: string;
  content_hash: string;
  sensitivity: string;
  redaction_json: string;
};

type MemoryPageRow = {
  id: string;
  legacy_key: string | null;
  namespace: string;
  kind: string;
  status: string;
  summary: string;
  content_json: string;
  normalized_content: string;
  subject: string | null;
  predicate: string | null;
  valid_from: string;
  valid_until: string | null;
  superseded_by: string | null;
  confidence: number;
  importance: number;
  evidence_priority: string;
  producer: string;
  created_at: string;
  updated_at: string;
  token_count: number;
  content_hash: string;
  current: number;
  sensitivity: string;
  owner_id: string | null;
};

const EVIDENCE_PRIORITY = {
  model_inference: 0,
  summary: 1,
  derived_state: 2,
  accepted_decision: 3,
  verified_tool: 4,
  current_user: 5,
} as const;

export class ContextVmFailure extends Error {
  readonly code:
    | "invalid_input"
    | "not_initialized"
    | "schema_unsupported"
    | "duplicate_conflict"
    | "integrity_failure"
    | "archive_failure"
    | "database_failure";

  constructor(code: ContextVmFailure["code"], message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ContextVmFailure";
    this.code = code;
  }
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, nested]) => `${JSON.stringify(key)}:${canonical(nested)}`)
    .join(",")}}`;
}

function jsonValue(value: unknown, label: string): unknown {
  try {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) throw new Error("value is undefined");
    return JSON.parse(serialized);
  } catch (error) {
    throw new ContextVmFailure(
      "invalid_input",
      `${label} must be finite JSON data`,
      { cause: error },
    );
  }
}

function eventContentHash(input: {
  sessionId: string;
  taskId?: string;
  source: NewContextVmEventV1["source"];
  occurredAt: string;
  actor: NewContextVmEventV1["actor"];
  kind: NewContextVmEventV1["kind"];
  payload: unknown;
  artifacts: ContextVmArtifactRefV1[];
  parentEventIds: readonly string[];
  sensitivity: NewContextVmEventV1["sensitivity"];
  redaction: RedactionMetadata;
}): string {
  return sha256(canonical({
    ...input,
    artifacts: input.artifacts.map(({ id, sha256: digest, mediaType, sensitivity }) => ({
      id, sha256: digest, mediaType, sensitivity,
    })),
  }));
}

function eventId(): ContextVmEventId {
  const timestamp = Date.now().toString(36).padStart(10, "0");
  return contextVmEventId(`evt_${timestamp}_${randomBytes(12).toString("hex")}`);
}

function exists(filePath: string): Promise<boolean> {
  return access(filePath).then(() => true, () => false);
}

function mergeRedaction(
  payload: RedactionMetadata,
  artifacts: RedactionMetadata[],
): RedactionMetadata {
  const values = [payload, ...artifacts];
  return {
    applied: values.some(({ applied }) => applied),
    redactedPaths: [...new Set(values.flatMap(({ redactedPaths }) => redactedPaths))],
    policyVersion: 2,
    redactionCount: values.reduce((sum, item) => sum + (item.redactionCount ?? 0), 0),
    categories: [...new Set(values.flatMap((item) => item.categories ?? []))],
  };
}

function validateInput(input: NewContextVmEventV1): void {
  contextVmSessionId(input.sessionId);
  if (input.taskId !== undefined) contextVmTaskId(input.taskId);
  if (
    !input.source.id.trim() ||
    input.source.id.length > 500 ||
    !Number.isFinite(Date.parse(input.occurredAt)) ||
    !input.actor.id ||
    !Array.isArray(input.parentEventIds ?? []) ||
    input.payload === undefined
  ) {
    throw new ContextVmFailure("invalid_input", "invalid ContextVM event input");
  }
  for (const parentId of input.parentEventIds ?? []) contextVmEventId(parentId);
}

const IDENTIFIER_PATTERN =
  /(?:[A-Za-z0-9_.-]+\/)+[A-Za-z0-9_.@-]+|[A-Fa-f0-9]{12,64}|[A-Z][A-Z0-9_]{2,}|[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)+/gu;

function retrievalTokens(value: string): string[] {
  return [...new Set(
    value
      .normalize("NFKC")
      .toLowerCase()
      .match(/[a-z0-9_.@/-]+/gu) ?? [],
  )].filter((token) => token.length > 1).slice(0, 32);
}

function memoryIdentifiers(page: {
  summary: string;
  normalizedContent: string;
  subject?: string;
  predicate?: string;
}): Array<{ kind: string; value: string; searchKey: string }> {
  const values = [
    page.subject,
    page.predicate,
    ...`${page.summary}\n${page.normalizedContent}`.matchAll(IDENTIFIER_PATTERN),
  ].flatMap((value) => {
    if (!value) return [];
    return typeof value === "string" ? [value] : [value[0]];
  });
  const unique = new Map<string, { kind: string; value: string; searchKey: string }>();
  for (const value of values) {
    const kind = value.includes("/") ? "path" : /^[a-f0-9]{12,64}$/iu.test(value)
      ? "hash"
      : value.includes(".") ? "symbol" : "identifier";
    const searchKey = value.normalize("NFKC").toLowerCase();
    unique.set(`${kind}:${searchKey}`, { kind, value, searchKey });
  }
  return [...unique.values()].sort((left, right) =>
    `${left.kind}:${left.searchKey}`.localeCompare(`${right.kind}:${right.searchKey}`));
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function payloadRecord(event: ContextVmEventV1): Record<string, unknown> {
  if (!event.payload || typeof event.payload !== "object" || Array.isArray(event.payload)) {
    return {};
  }
  const payload = event.payload as Record<string, unknown>;
  const nested =
    payload.redactedPayload &&
    typeof payload.redactedPayload === "object" &&
    !Array.isArray(payload.redactedPayload)
      ? payload.redactedPayload as Record<string, unknown>
      : {};
  return { ...payload, ...nested };
}

function eventSummary(event: ContextVmEventV1): string {
  const payload = payloadRecord(event);
  for (const key of ["summary", "goal", "instruction", "reason"]) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) return value.trim().slice(0, 500);
  }
  return `${String(payload.eventType ?? event.kind)} at sequence ${event.sequenceNo}`;
}

function eventType(event: ContextVmEventV1): string {
  const value = payloadRecord(event).eventType;
  return typeof value === "string" ? value : event.kind;
}

function recoveryAbortError(): Error {
  const error = new Error("ContextVM recovery was cancelled");
  error.name = "AbortError";
  return error;
}

function reduceContextVmEvents(
  sessionId: ContextVmSessionId,
  events: readonly ContextVmEventV1[],
  initial?: ContextVmReconstructedStateV1,
): ContextVmReconstructedStateV1 {
  const tasks = new Map(
    (initial?.tasks ?? []).map((task) => [task.taskId, structuredClone(task)]),
  );
  const constraints = new Map(
    (initial?.constraints ?? []).map((constraint) => [constraint.id, structuredClone(constraint)]),
  );
  const obligations = new Map(
    (initial?.obligations ?? []).map((obligation) => [obligation.id, structuredClone(obligation)]),
  );
  const artifacts = new Map(
    (initial?.artifactVersions ?? []).map((artifact) => [artifact.artifactId, structuredClone(artifact)]),
  );
  let activeGoal = initial?.activeGoal ?? null;
  let terminalStatus = initial?.terminalStatus ?? null;
  let throughSequence = initial?.throughSequence ?? 0;
  const closeTaskObligations = (taskId: string) => {
    for (const [id, obligation] of obligations) {
      if (id.endsWith(`:${taskId}`)) obligations.delete(id);
    }
  };
  for (const event of events) {
    if (event.sessionId !== sessionId || event.sequenceNo <= throughSequence) {
      throw new ContextVmFailure(
        "integrity_failure",
        "ContextVM recovery event identity or order is invalid",
      );
    }
    if (event.sequenceNo !== throughSequence + 1) {
      throw new ContextVmFailure(
        "integrity_failure",
        `ContextVM recovery expected sequence ${throughSequence + 1}`,
      );
    }
    throughSequence = event.sequenceNo;
    const type = eventType(event);
    const summary = eventSummary(event);
    const taskId = event.taskId ?? contextVmTaskId(`session-${sessionId}`.slice(0, 240));
    const payload = payloadRecord(event);
    if (type === "goal_received" || event.kind === "user_message") {
      activeGoal = summary;
      const values = Array.isArray(payload.constraints) ? payload.constraints : [];
      values.forEach((value, index) => {
        if (typeof value !== "string" || !value.trim()) return;
        constraints.set(`event:${event.id}:${index}`, {
          id: `event:${event.id}:${index}`,
          text: value.trim().slice(0, 2_000),
          sourceEventId: event.id,
        });
      });
    }
    if (event.kind === "constraint") {
      constraints.set(`event:${event.id}`, {
        id: `event:${event.id}`,
        text: summary,
        sourceEventId: event.id,
      });
    }
    if (type === "run_started") {
      terminalStatus = null;
      tasks.set(taskId, {
        taskId,
        status: "active",
        summary,
        sourceEventId: event.id,
      });
      obligations.set(`task:${taskId}`, {
        id: `task:${taskId}`,
        kind: "task",
        status: "pending",
        summary,
        sourceEventId: event.id,
      });
    }
    if (
      type === "approval_required" ||
      type === "codex_execution_approval_required" ||
      type === "manual_review_required"
    ) {
      tasks.set(taskId, { taskId, status: "waiting_approval", summary, sourceEventId: event.id });
      obligations.set(`approval:${taskId}`, {
        id: `approval:${taskId}`,
        kind: "approval",
        status: "pending",
        summary,
        sourceEventId: event.id,
      });
    }
    if (
      type === "codex_execution_approved" ||
      type === "action_blocked" ||
      type === "action_blocked_or_approved"
    ) {
      obligations.delete(`approval:${taskId}`);
    }
    if (
      type === "codex_execution_started" ||
      type === "verification_command_started" ||
      event.kind === "tool_request"
    ) {
      tasks.set(taskId, { taskId, status: "executing", summary, sourceEventId: event.id });
      obligations.set(`tool:${taskId}`, {
        id: `tool:${taskId}`,
        kind: "tool_transaction",
        status: "in_doubt",
        summary,
        sourceEventId: event.id,
      });
    }
    if (
      type === "codex_execution_finished" ||
      type === "codex_execution_failed" ||
      type === "verification_command_finished" ||
      event.kind === "tool_result"
    ) {
      obligations.delete(`tool:${taskId}`);
    }
    if (type === "verification_started") {
      tasks.set(taskId, { taskId, status: "verifying", summary, sourceEventId: event.id });
      obligations.set(`verification:${taskId}`, {
        id: `verification:${taskId}`,
        kind: "verification",
        status: "pending",
        summary,
        sourceEventId: event.id,
      });
    }
    if (type === "verification_passed" || type === "verification_failed") {
      obligations.delete(`verification:${taskId}`);
      tasks.set(taskId, {
        taskId,
        status: type === "verification_passed" ? "completed" : "failed",
        summary,
        sourceEventId: event.id,
      });
    }
    if (type === "run_finished") {
      terminalStatus = "completed";
      tasks.set(taskId, { taskId, status: "completed", summary, sourceEventId: event.id });
      closeTaskObligations(taskId);
    } else if (
      event.kind === "error" &&
      ["codex_execution_failed", "codex_result_import_failed"].includes(type)
    ) {
      terminalStatus = "failed";
      tasks.set(taskId, { taskId, status: "failed", summary, sourceEventId: event.id });
    }
    for (const artifact of event.artifacts) {
      artifacts.set(artifact.id, {
        artifactId: artifact.id,
        sha256: artifact.sha256,
        sourceEventId: event.id,
      });
    }
  }
  return {
    schemaVersion: 1,
    reducerVersion: "contextvm-state-v1",
    sessionId,
    throughSequence,
    activeGoal,
    tasks: [...tasks.values()].sort((left, right) =>
      left.taskId.localeCompare(right.taskId)),
    constraints: [...constraints.values()].sort((left, right) =>
      left.id.localeCompare(right.id)),
    obligations: [...obligations.values()].sort((left, right) =>
      left.id.localeCompare(right.id)),
    artifactVersions: [...artifacts.values()].sort((left, right) =>
      left.artifactId.localeCompare(right.artifactId)),
    terminalStatus,
  };
}

export class LocalSqliteContextVmStore implements ContextVmEventStoreV1, ContextVmMemoryStoreV1 {
  readonly root: string;
  readonly databasePath: string;
  readonly archiveRoot: string;
  private readonly now: () => string;
  private readonly pageCache: DeterministicContextVmPageCache;
  private database?: SqliteDatabase;
  private initializing?: Promise<void>;

  constructor(options: ContextVmStoreOptions) {
    if (!path.isAbsolute(options.root)) {
      throw new ContextVmFailure("invalid_input", "ContextVM root must be absolute");
    }
    this.root = path.resolve(options.root);
    this.databasePath = path.join(this.root, "db", "contextvm.sqlite3");
    this.archiveRoot = path.join(this.root, "archive", "sha256");
    this.now = options.now ?? (() => new Date().toISOString());
    this.pageCache = new DeterministicContextVmPageCache(
      options.cacheMaxBytes,
    );
  }

  async initialize(): Promise<ContextVmStatusV1> {
    await this.ensureInitialized();
    return this.status();
  }

  async appendEvent(input: NewContextVmEventV1): Promise<ContextVmEventV1> {
    return (await this.appendEvents([input]))[0]!;
  }

  async appendEvents(inputs: NewContextVmEventV1[]): Promise<ContextVmEventV1[]> {
    await this.ensureInitialized();
    if (inputs.length === 0) return [];
    if (inputs.length > MAX_BATCH_SIZE) {
      throw new ContextVmFailure("invalid_input", `ContextVM batch exceeds ${MAX_BATCH_SIZE} events`);
    }
    for (const input of inputs) validateInput(input);

    const prepared = [];
    for (const input of inputs) {
      const redactedPayload = redactSensitivePayload(
        jsonValue(input.payload, "ContextVM payload"),
      );
      if (Buffer.byteLength(canonical(redactedPayload.payload)) > MAX_INLINE_PAYLOAD_BYTES) {
        throw new ContextVmFailure(
          "invalid_input",
          `ContextVM inline payload exceeds ${MAX_INLINE_PAYLOAD_BYTES} bytes; store large evidence as an artifact`,
        );
      }
      const artifacts = await Promise.all(
        (input.artifacts ?? []).map((artifact, index) =>
          this.prepareArtifact(artifact, index),
        ),
      );
      const redaction = mergeRedaction(
        redactedPayload.redaction,
        artifacts.map(({ redaction }) => redaction),
      );
      prepared.push({
        input,
        payload: redactedPayload.payload,
        artifacts: artifacts.map(({ artifact }) => artifact),
        redaction,
      });
    }

    const database = this.requireDatabase();
    database.exec("BEGIN IMMEDIATE");
    try {
      const output: ContextVmEventV1[] = [];
      const nextSequence = new Map<string, number>();
      for (const item of prepared) {
        const hash = eventContentHash({
          sessionId: item.input.sessionId,
          taskId: item.input.taskId,
          source: item.input.source,
          occurredAt: item.input.occurredAt,
          actor: item.input.actor,
          kind: item.input.kind,
          payload: item.payload,
          artifacts: item.artifacts.map(({ ref }) => ref),
          parentEventIds: item.input.parentEventIds ?? [],
          sensitivity: item.input.sensitivity,
          redaction: item.redaction,
        });
        const duplicate = database.prepare(
          "SELECT id, content_hash FROM events WHERE source_kind = ? AND source_id = ?",
        ).get(item.input.source.kind, item.input.source.id) as
          | { id: string; content_hash: string }
          | undefined;
        if (duplicate) {
          if (duplicate.content_hash !== hash) {
            throw new ContextVmFailure(
              "duplicate_conflict",
              `ContextVM source was replayed with different content: ${item.input.source.kind}:${item.input.source.id}`,
            );
          }
          output.push(this.loadEvent(database, duplicate.id)!);
          continue;
        }

        for (const parentId of item.input.parentEventIds ?? []) {
          if (!database.prepare("SELECT 1 FROM events WHERE id = ?").get(parentId)) {
            throw new ContextVmFailure("invalid_input", `ContextVM parent event not found: ${parentId}`);
          }
        }
        let sequence = nextSequence.get(item.input.sessionId);
        if (sequence === undefined) {
          const row = database.prepare(
            "SELECT COALESCE(MAX(sequence_no), 0) AS sequence FROM events WHERE session_id = ?",
          ).get(item.input.sessionId) as { sequence: number };
          sequence = Number(row.sequence) + 1;
        }
        nextSequence.set(item.input.sessionId, sequence + 1);
        const id = eventId();
        const recordedAt = this.now();
        for (const { ref, archiveKey } of item.artifacts) {
          database.prepare(`
            INSERT OR IGNORE INTO artifacts
              (id, sha256, encoding, uncompressed_bytes, stored_bytes, archive_key, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `).run(
            ref.id, ref.sha256, ref.encoding, ref.uncompressedBytes,
            ref.storedBytes, archiveKey, recordedAt,
          );
        }
        database.prepare(`
          INSERT INTO events
            (id, session_id, task_id, sequence_no, source_kind, source_id, occurred_at, recorded_at,
             actor_json, kind, payload_json, content_hash, sensitivity, redaction_json)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          id, item.input.sessionId, item.input.taskId ?? null, sequence,
          item.input.source.kind, item.input.source.id, item.input.occurredAt,
          recordedAt, canonical(item.input.actor), item.input.kind,
          canonical(item.payload), hash, item.input.sensitivity, canonical(item.redaction),
        );
        item.artifacts.forEach(({ ref }, position) => {
          database.prepare(
            "INSERT INTO event_artifacts (event_id, position, artifact_id, media_type, sensitivity, label) VALUES (?, ?, ?, ?, ?, ?)",
          ).run(id, position, ref.id, ref.mediaType, ref.sensitivity, ref.label ?? null);
        });
        for (const parentId of item.input.parentEventIds ?? []) {
          database.prepare(
            "INSERT INTO event_parents (event_id, parent_event_id) VALUES (?, ?)",
          ).run(id, parentId);
        }
        output.push(this.loadEvent(database, id)!);
      }
      database.exec("COMMIT");
      return output.map(parseContextVmEventV1);
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }

  async projectCanonicalTraceEvents(
    events: CanonicalTraceEventV1[],
  ): Promise<number> {
    await this.ensureInitialized();
    if (events.length === 0) return 0;
    const runId = events[0]!.runId;
    if (events.some((event) => event.runId !== runId)) {
      throw new ContextVmFailure(
        "invalid_input",
        "canonical projection batch must contain one run",
      );
    }
    let projected = await this.canonicalProjectionWatermark(runId);
    for (const event of events) {
      if (event.sequenceNo <= projected) {
        const existing = this.requireDatabase().prepare(`
          SELECT content_hash FROM canonical_trace_projection
          WHERE source_run_event_id = ?
        `).get(event.sourceRunEventId) as { content_hash: string } | undefined;
        if (!existing || existing.content_hash !== event.contentHash) {
          throw new ContextVmFailure(
            "duplicate_conflict",
            `canonical projection conflict: ${event.sourceRunEventId}`,
          );
        }
        continue;
      }
      if (event.sequenceNo !== projected + 1) {
        throw new ContextVmFailure(
          "invalid_input",
          `canonical projection expected sequence ${projected + 1}`,
        );
      }
      const projectedEvent = await this.appendEvent({
        sessionId: contextVmSessionId(event.runId),
        taskId: contextVmTaskId(event.taskId),
        source: {
          kind: "orynt_run_event",
          id: event.sourceRunEventId,
        },
        occurredAt: event.occurredAt,
        actor: {
          kind:
            event.actor === "user" ? "user"
            : event.actor === "verifier" ? "verifier"
            : event.actor === "policy" ? "policy"
            : event.actor === "system" ? "system"
            : "runtime",
          id: `canonical-${event.actor}`,
        },
        kind:
          event.phase === "verify" ? "test_result"
          : event.phase === "recovery" ? "recovery"
          : event.eventType === "goal_received" ? "user_message"
          : event.eventType.includes("command") ? "command_run"
          : event.eventType.includes("failed") ? "error"
          : "state_transition",
        payload: {
          ...(event.redactedPayload &&
          typeof event.redactedPayload === "object" &&
          !Array.isArray(event.redactedPayload)
            ? event.redactedPayload as Record<string, unknown>
            : {}),
          canonicalTraceEventId: event.eventId,
          canonicalContentHash: event.contentHash,
          eventType: event.eventType,
          phase: event.phase,
          previousEventId: event.previousEventId ?? null,
          causalParentEventIds: event.causalParentEventIds,
          repositoryScope: event.repositoryScope,
          redactedPayload: event.redactedPayload,
          artifactRefs: event.artifactRefs,
        },
        sensitivity: "internal",
      });
      const database = this.requireDatabase();
      database.exec("BEGIN IMMEDIATE");
      try {
        database.prepare(`
          INSERT INTO canonical_trace_projection
            (source_run_event_id, canonical_event_id, run_id, sequence_no,
             contextvm_event_id, repository_scope_json, content_hash, projected_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          event.sourceRunEventId,
          event.eventId,
          event.runId,
          event.sequenceNo,
          projectedEvent.id,
          canonical(event.repositoryScope),
          event.contentHash,
          this.now(),
        );
        database.prepare(`
          INSERT INTO canonical_trace_watermarks
            (run_id, sequence_no, source_run_event_id, content_hash, updated_at)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(run_id) DO UPDATE SET
            sequence_no = excluded.sequence_no,
            source_run_event_id = excluded.source_run_event_id,
            content_hash = excluded.content_hash,
            updated_at = excluded.updated_at
        `).run(
          event.runId,
          event.sequenceNo,
          event.sourceRunEventId,
          event.contentHash,
          this.now(),
        );
        database.exec("COMMIT");
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
      projected = event.sequenceNo;
    }
    return projected;
  }

  async canonicalProjectionWatermark(runId: string): Promise<number> {
    await this.ensureInitialized();
    const row = this.requireDatabase().prepare(`
      SELECT sequence_no FROM canonical_trace_watermarks WHERE run_id = ?
    `).get(runId) as { sequence_no: number } | undefined;
    return Number(row?.sequence_no ?? 0);
  }

  async getCanonicalSourceEvent(
    sourceRunEventId: string,
  ): Promise<ContextVmEventV1 | undefined> {
    await this.ensureInitialized();
    const row = this.requireDatabase().prepare(`
      SELECT contextvm_event_id FROM canonical_trace_projection
      WHERE source_run_event_id = ?
    `).get(sourceRunEventId) as { contextvm_event_id: string } | undefined;
    return row
      ? this.getEvent(contextVmEventId(row.contextvm_event_id))
      : undefined;
  }

  async getEvent(id: ContextVmEventId): Promise<ContextVmEventV1 | undefined> {
    await this.ensureInitialized();
    contextVmEventId(id);
    return this.loadEvent(this.requireDatabase(), id);
  }

  async scanSession(request: ContextVmScanRequestV1): Promise<ContextVmEventV1[]> {
    await this.ensureInitialized();
    contextVmSessionId(request.sessionId);
    const after = Math.max(0, Math.trunc(request.afterSequence ?? 0));
    const limit = Math.max(1, Math.min(Math.trunc(request.limit ?? 100), MAX_SCAN_LIMIT));
    const rows = this.requireDatabase().prepare(`
      SELECT * FROM events
      WHERE session_id = ? AND sequence_no > ?
      ORDER BY sequence_no ASC
      LIMIT ?
    `).all(request.sessionId, after, limit) as unknown as EventRow[];
    return this.hydrateEventRows(this.requireDatabase(), rows);
  }

  async archiveArtifact(input: ContextVmArtifactInputV1): Promise<ContextVmArtifactRefV1> {
    await this.ensureInitialized();
    const prepared = await this.prepareArtifact(input, 0);
    const database = this.requireDatabase();
    database.prepare(`
      INSERT OR IGNORE INTO artifacts
        (id, sha256, encoding, uncompressed_bytes, stored_bytes, archive_key, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      prepared.artifact.ref.id,
      prepared.artifact.ref.sha256,
      prepared.artifact.ref.encoding,
      prepared.artifact.ref.uncompressedBytes,
      prepared.artifact.ref.storedBytes,
      prepared.artifact.archiveKey,
      this.now(),
    );
    return prepared.artifact.ref;
  }

  async putMemoryPage(input: NewContextVmMemoryPageV1): Promise<ContextVmMemoryPageV1> {
    await this.ensureInitialized();
    const sensitivity = input.sensitivity ?? "internal";
    if (
      !input.namespace.trim() ||
      !input.summary.trim() ||
      !input.producer.trim() ||
      input.sources.length === 0 ||
      !Number.isFinite(input.confidence) ||
      input.confidence < 0 ||
      input.confidence > 1 ||
      !Number.isFinite(input.importance) ||
      input.importance < 0 ||
      input.importance > 1
    ) {
      throw new ContextVmFailure("invalid_input", "invalid ContextVM memory page");
    }
    if (
      sensitivity === "secret" ||
      sensitivity === "credential" ||
      ((sensitivity === "personal" || sensitivity === "restricted") &&
        !input.ownerId?.trim()) ||
      ((sensitivity === "public" || sensitivity === "internal") &&
        input.ownerId !== undefined)
    ) {
      throw new ContextVmFailure(
        "invalid_input",
        "ContextVM derived memory violates the sensitivity admission policy",
      );
    }
    if ((input.subject === undefined) !== (input.predicate === undefined)) {
      throw new ContextVmFailure(
        "invalid_input",
        "ContextVM fact subject and predicate must be provided together",
      );
    }
    const database = this.requireDatabase();
    const normalizedContent = canonical(jsonValue(input.content, "ContextVM memory content"));
    const hash = sha256(canonical({
      namespace: input.namespace,
      kind: input.kind,
      status: input.status,
      summary: input.summary,
      content: JSON.parse(normalizedContent),
      subject: input.subject,
      predicate: input.predicate,
      entityIds: [...input.entityIds].sort(),
      taskIds: [...input.taskIds].sort(),
      relations: [...input.relations].sort((a, b) =>
        `${a.type}:${a.targetMemoryId}`.localeCompare(`${b.type}:${b.targetMemoryId}`)),
      validFrom: input.validFrom,
      validUntil: input.validUntil,
      confidence: input.confidence,
      importance: input.importance,
      evidencePriority: input.evidencePriority,
      producer: input.producer,
      sensitivity,
      ownerId: input.ownerId,
    }));
    const createdAt = input.createdAt ?? this.now();
    const updatedAt = input.updatedAt ?? createdAt;
    const id = input.id ?? this.newMemoryId(hash);

    database.exec("BEGIN IMMEDIATE");
    try {
      this.validateMemorySources(database, input.sources);
      const duplicate = database.prepare(
        "SELECT * FROM memory_pages WHERE content_hash = ? AND namespace = ? AND current = 1 LIMIT 1",
      ).get(hash, input.namespace) as MemoryPageRow | undefined;
      if (duplicate) {
        this.mergeMemorySources(database, contextVmMemoryId(duplicate.id), input.sources);
        database.exec("COMMIT");
        this.pageCache.invalidate(contextVmMemoryId(duplicate.id));
        return this.cachedMemoryPage(database, duplicate).page;
      }
      this.validateMemoryRelations(database, id, input.relations);

      let current = 1;
      const currentFacts = input.subject && input.predicate
        ? database.prepare(`
            SELECT * FROM memory_pages
            WHERE namespace = ? AND subject = ? AND predicate = ? AND current = 1
            ORDER BY created_at ASC
          `).all(input.namespace, input.subject, input.predicate) as unknown as MemoryPageRow[]
        : [];
      const sameFact = currentFacts.find(
        (row) => row.normalized_content === normalizedContent,
      );
      if (sameFact) {
        this.mergeMemorySources(
          database,
          contextVmMemoryId(sameFact.id),
          input.sources,
        );
        database.exec("COMMIT");
        this.pageCache.invalidate(contextVmMemoryId(sameFact.id));
        return this.cachedMemoryPage(database, sameFact).page;
      }
      const highestPriority = currentFacts.reduce(
        (maximum, row) => Math.max(
          maximum,
          EVIDENCE_PRIORITY[row.evidence_priority as keyof typeof EVIDENCE_PRIORITY] ?? -1,
        ),
        -1,
      );
      const incomingPriority = EVIDENCE_PRIORITY[input.evidencePriority];
      if (currentFacts.length > 0 && incomingPriority < highestPriority) current = 0;

      this.insertMemoryPage(database, {
        id,
        namespace: input.namespace,
        kind: input.kind,
        status: input.status,
        summary: input.summary,
        content: JSON.parse(normalizedContent),
        normalizedContent,
        ...(input.subject ? { subject: input.subject } : {}),
        ...(input.predicate ? { predicate: input.predicate } : {}),
        sources: input.sources,
        entityIds: input.entityIds,
        taskIds: input.taskIds,
        relations: input.relations,
        validFrom: input.validFrom,
        ...(input.validUntil ? { validUntil: input.validUntil } : {}),
        confidence: input.confidence,
        importance: input.importance,
        evidencePriority: input.evidencePriority,
        producer: input.producer,
        createdAt,
        updatedAt,
        tokenCount: normalizedContent.split(/\s+/u).filter(Boolean).length,
        contentHash: hash,
        sensitivity,
        ...(input.ownerId ? { ownerId: input.ownerId } : {}),
      }, current);

      for (const existing of currentFacts) {
        const existingPriority =
          EVIDENCE_PRIORITY[existing.evidence_priority as keyof typeof EVIDENCE_PRIORITY] ?? -1;
        const sameValue = existing.normalized_content === normalizedContent;
        if (sameValue) continue;
        const contradictionId = `contradiction_${sha256(
          [existing.id, id].sort().join(":"),
        ).slice(0, 32)}`;
        const supersedes = incomingPriority > existingPriority;
        database.prepare(`
          INSERT OR IGNORE INTO memory_contradictions
            (id, namespace, subject, predicate, left_memory_id, right_memory_id,
             status, resolution_memory_id, created_at, resolved_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          contradictionId,
          input.namespace,
          input.subject!,
          input.predicate!,
          existing.id,
          id,
          supersedes ? "resolved" : "unresolved",
          supersedes ? id : null,
          createdAt,
          supersedes ? createdAt : null,
        );
        if (supersedes) {
          database.prepare(
            "UPDATE memory_pages SET current = 0, valid_until = ?, superseded_by = ?, updated_at = ? WHERE id = ?",
          ).run(input.validFrom, id, updatedAt, existing.id);
          database.prepare(
            "INSERT OR IGNORE INTO memory_relations (memory_id, relation_type, target_memory_id) VALUES (?, 'supersedes', ?)",
          ).run(id, existing.id);
        }
      }
      database.prepare(`
        INSERT INTO memory_audit (operation, memory_id, revision, occurred_at, details_json)
        VALUES ('memory.put', ?, COALESCE((SELECT revision FROM memory_state WHERE singleton = 1), 0), ?, ?)
      `).run(id, updatedAt, canonical({ contentHash: hash }));
      database.exec("COMMIT");
      this.pageCache.clear();
      return this.cachedMemoryPage(
        database,
        database.prepare("SELECT * FROM memory_pages WHERE id = ?").get(id) as MemoryPageRow,
      ).page;
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }

  async getMemoryPage(id: ContextVmMemoryId): Promise<ContextVmMemoryPageV1 | undefined> {
    await this.ensureInitialized();
    contextVmMemoryId(id);
    const database = this.requireDatabase();
    const row = database.prepare("SELECT * FROM memory_pages WHERE id = ?").get(id) as
      | MemoryPageRow
      | undefined;
    return row ? this.cachedMemoryPage(database, row).page : undefined;
  }

  cacheMetrics() {
    return this.pageCache.metrics();
  }

  pinCachedPages(ids: readonly ContextVmMemoryId[], reason: string): void {
    this.pageCache.pin(ids, reason);
  }

  unpinCachedPages(ids: readonly ContextVmMemoryId[], reason: string): void {
    this.pageCache.unpin(ids, reason);
  }

  async inspectMemory(id: ContextVmMemoryId): Promise<{
    page: ContextVmMemoryPageV1;
    contradictions: ContextVmContradictionV1[];
  } | undefined> {
    const page = await this.getMemoryPage(id);
    if (!page) return undefined;
    const contradictions = this.requireDatabase().prepare(`
      SELECT * FROM memory_contradictions
      WHERE left_memory_id = ? OR right_memory_id = ?
      ORDER BY created_at ASC
    `).all(id, id) as Array<Record<string, string | null>>;
    return {
      page,
      contradictions: contradictions.map((row) => ({
        schemaVersion: 1,
        id: String(row.id),
        namespace: String(row.namespace),
        subject: String(row.subject),
        predicate: String(row.predicate),
        leftMemoryId: contextVmMemoryId(String(row.left_memory_id)),
        rightMemoryId: contextVmMemoryId(String(row.right_memory_id)),
        status: row.status as ContextVmContradictionV1["status"],
        ...(row.resolution_memory_id
          ? { resolutionMemoryId: contextVmMemoryId(row.resolution_memory_id) }
          : {}),
        createdAt: String(row.created_at),
        ...(row.resolved_at ? { resolvedAt: row.resolved_at } : {}),
      })),
    };
  }

  async inspectMemoryByLegacyId(id: string): Promise<{
    page: ContextVmMemoryPageV1;
    contradictions: ContextVmContradictionV1[];
  } | undefined> {
    await this.ensureInitialized();
    const row = this.requireDatabase().prepare(`
      SELECT id FROM memory_pages
      WHERE current = 1 AND legacy_key IN (?, ?, ?)
      LIMIT 1
    `).get(`episode:${id}`, `candidate_rule:${id}`, `semantic_memory:${id}`) as
      | { id: string }
      | undefined;
    return row
      ? this.inspectMemory(contextVmMemoryId(row.id))
      : undefined;
  }

  async queryCurrentFact(input: {
    namespace: string;
    subject: string;
    predicate: string;
  }): Promise<ContextVmCurrentFactResultV1> {
    await this.ensureInitialized();
    const rows = this.requireDatabase().prepare(`
      SELECT * FROM memory_pages
      WHERE namespace = ? AND subject = ? AND predicate = ? AND current = 1
      ORDER BY created_at ASC
    `).all(input.namespace, input.subject, input.predicate) as unknown as MemoryPageRow[];
    const pages = rows.map((row) => this.memoryPageFromRow(this.requireDatabase(), row));
    if (pages.length === 0) return { status: "missing", candidates: [] };
    if (pages.length === 1) return { status: "resolved", candidates: [pages[0]!] };
    return { status: "conflicted", candidates: pages };
  }

  async queryMemoryHistory(input: {
    namespace: string;
    subject: string;
    predicate: string;
  }): Promise<ContextVmMemoryPageV1[]> {
    await this.ensureInitialized();
    return (this.requireDatabase().prepare(`
      SELECT * FROM memory_pages
      WHERE namespace = ? AND subject = ? AND predicate = ?
      ORDER BY valid_from ASC, created_at ASC
    `).all(input.namespace, input.subject, input.predicate) as unknown as MemoryPageRow[])
      .map((row) => this.memoryPageFromRow(this.requireDatabase(), row));
  }

  async retrieveMemoryPages(
    input: ContextVmRetrievalRequestV1,
  ): Promise<ContextVmRetrievalResultV1> {
    await this.ensureInitialized();
    const cacheBefore = this.pageCache.metrics();
    if (
      !input.namespace.trim() ||
      input.query.length > 1_000 ||
      (input.asOf && !Number.isFinite(Date.parse(input.asOf))) ||
      (input.hopLimit ?? 0) > 2
    ) {
      throw new ContextVmFailure("invalid_input", "invalid ContextVM retrieval request");
    }
    const database = this.requireDatabase();
    const topK = Math.max(1, Math.min(input.topK ?? 20, 100));
    const tokens = retrievalTokens(input.query);
    const queryKeys = new Set([
      input.query.normalize("NFKC").toLowerCase(),
      ...tokens,
    ]);
    const scores = new Map<string, { lexical: number; exact: number }>();
    if (tokens.length > 0) {
      const ftsQuery = tokens.map((token) => `"${token.replaceAll("\"", "\"\"")}"`).join(" OR ");
      const rows = database.prepare(`
        SELECT memory_id, bm25(memory_fts) AS rank
        FROM memory_fts WHERE memory_fts MATCH ? LIMIT 500
      `).all(ftsQuery) as Array<{ memory_id: string; rank: number }>;
      for (const row of rows) {
        scores.set(row.memory_id, {
          lexical: clampScore(1 / (1 + Math.abs(Number(row.rank)))),
          exact: 0,
        });
      }
    }
    if (queryKeys.size > 0) {
      const keys = [...queryKeys].slice(0, 64);
      const placeholders = keys.map(() => "?").join(", ");
      const rows = database.prepare(`
        SELECT DISTINCT memory_id FROM memory_identifiers
        WHERE search_key IN (${placeholders}) LIMIT 500
      `).all(...keys) as Array<{ memory_id: string }>;
      for (const row of rows) {
        const existing = scores.get(row.memory_id) ?? { lexical: 0, exact: 0 };
        scores.set(row.memory_id, { ...existing, exact: 1 });
      }
    }
    if (tokens.length === 0 && queryKeys.has("")) {
      queryKeys.delete("");
    }

    let candidateIds = [...scores.keys()];
    if (candidateIds.length === 0 && input.query.trim() === "") {
      candidateIds = (database.prepare(`
        SELECT id FROM memory_pages WHERE namespace = ? ORDER BY updated_at DESC LIMIT 500
      `).all(input.namespace) as Array<{ id: string }>).map(({ id }) => id);
    }
    const requiredEntities = new Set(input.entityIds ?? []);
    const requiredTasks = new Set(input.taskIds ?? []);
    const requiredArtifacts = new Set(input.artifactIds ?? []);
    const asOf = input.asOf;
    const allowedSensitivity = new Set(
      input.allowedSensitivity ?? ["public", "internal"],
    );
    if (
      [...allowedSensitivity].some(
        (value) => value === "secret" || value === "credential",
      )
    ) {
      throw new ContextVmFailure(
        "invalid_input",
        "ContextVM retrieval cannot authorize secret or credential memory",
      );
    }
    const pages: ContextVmRetrievalCandidateV1[] = [];
    const seedIds: string[] = [];
    for (const id of candidateIds.slice(0, 500)) {
      const row = database.prepare("SELECT * FROM memory_pages WHERE id = ? AND namespace = ?")
        .get(id, input.namespace) as MemoryPageRow | undefined;
      if (!row) continue;
      if (!allowedSensitivity.has(
        row.sensitivity as NonNullable<ContextVmMemoryPageV1["sensitivity"]>,
      )) continue;
      if (
        (row.sensitivity === "personal" || row.sensitivity === "restricted") &&
        (!input.principalId || row.owner_id !== input.principalId)
      ) continue;
      if (!input.includeHistory && !asOf && Number(row.current) !== 1) continue;
      if (asOf && (row.valid_from > asOf || (row.valid_until && row.valid_until <= asOf))) continue;
      const sourceQuality = row.evidence_priority === "current_user" ? 1
        : row.evidence_priority === "verified_tool" ? 0.9
        : row.evidence_priority === "accepted_decision" ? 0.8
        : row.evidence_priority === "derived_state" ? 0.65
        : row.evidence_priority === "summary" ? 0.45 : 0.25;
      const cached = this.cachedMemoryPage(database, row, {
        currentTaskRelevance: Math.max(
          scores.get(id)?.lexical ?? 0,
          scores.get(id)?.exact ?? 0,
        ),
        dependencyCentrality: Math.min(1, Number(row.current)),
        sourceQuality,
        userImportance: Number(row.importance),
      });
      const page = cached.page;
      const pageArtifacts = new Set(page.sources.flatMap((source) =>
        source.type === "artifact" ? [source.artifactId] : []));
      if ([...requiredEntities].some((value) => !page.entityIds.includes(value))) continue;
      if ([...requiredTasks].some((value) => !page.taskIds.includes(value))) continue;
      if ([...requiredArtifacts].some((value) => !pageArtifacts.has(value))) continue;
      seedIds.push(id);
      const base = scores.get(id) ?? { lexical: 0, exact: 0 };
      const structural = requiredEntities.size + requiredTasks.size + requiredArtifacts.size > 0 ? 1 : 0;
      const temporal = asOf || Number(row.current) === 1 ? 1 : 0.25;
      const conflict = Boolean(database.prepare(`
        SELECT 1 FROM memory_contradictions
        WHERE status = 'unresolved' AND (left_memory_id = ? OR right_memory_id = ?) LIMIT 1
      `).get(id, id));
      const component = {
        lexical: base.lexical,
        exact: base.exact,
        graph: 0,
        temporal,
        structural,
        sourceQuality,
        importance: page.importance,
      };
      const total = clampScore(
        component.lexical * 0.25 + component.exact * 0.25 +
        component.graph * 0.15 + component.temporal * 0.10 +
        component.structural * 0.10 + component.sourceQuality * 0.10 +
        component.importance * 0.05 - (conflict ? 0.25 : 0),
      );
      pages.push({
        page,
        scores: { ...component, total },
        reasons: [
          ...(base.lexical > 0 ? ["lexical_match"] : []),
          ...(base.exact > 0 ? ["exact_identifier"] : []),
          ...(structural ? ["structural_filter"] : []),
          ...(asOf
            ? ["valid_at_requested_time"]
            : Number(row.current) === 1
              ? ["current"]
              : ["historical"]),
          ...(conflict ? ["unresolved_conflict"] : []),
        ],
        conflicted: conflict,
      });
    }

    const hopLimit = input.hopLimit ?? 0;
    let frontier = [...seedIds];
    const visited = new Set(seedIds);
    for (let hop = 1; hop <= hopLimit && frontier.length > 0; hop += 1) {
      const next: string[] = [];
      for (const sourceId of frontier) {
        const related = database.prepare(`
          SELECT target_memory_id AS id FROM memory_relations WHERE memory_id = ?
          UNION SELECT memory_id AS id FROM memory_relations WHERE target_memory_id = ?
        `).all(sourceId, sourceId) as Array<{ id: string }>;
        for (const { id } of related) {
          if (visited.has(id) || visited.size >= 500) continue;
          visited.add(id);
          next.push(id);
          const row = database.prepare("SELECT * FROM memory_pages WHERE id = ? AND namespace = ?")
            .get(id, input.namespace) as MemoryPageRow | undefined;
          if (!row || (!input.includeHistory && !asOf && Number(row.current) !== 1)) continue;
          if (!allowedSensitivity.has(
            row.sensitivity as NonNullable<ContextVmMemoryPageV1["sensitivity"]>,
          )) continue;
          if (
            (row.sensitivity === "personal" || row.sensitivity === "restricted") &&
            (!input.principalId || row.owner_id !== input.principalId)
          ) continue;
          const cached = this.cachedMemoryPage(database, row, {
            dependencyCentrality: hop === 1 ? 1 : 0.5,
            expectedFutureUse: 0.75,
            userImportance: Number(row.importance),
          });
          const page = cached.page;
          const graph = hop === 1 ? 1 : 0.5;
          const total = clampScore(graph * 0.15 + 0.10 + page.importance * 0.05);
          pages.push({
            page,
            scores: {
              lexical: 0, exact: 0, graph, temporal: 1, structural: 0,
              sourceQuality: 0, importance: page.importance, total,
            },
            reasons: [`graph_${hop}_hop`, "current"],
            conflicted: false,
          });
        }
      }
      frontier = next;
    }
    const deduplicated = new Map<string, ContextVmRetrievalCandidateV1>();
    for (const candidate of pages) {
      const prior = deduplicated.get(candidate.page.id);
      if (!prior || candidate.scores.total > prior.scores.total) {
        deduplicated.set(candidate.page.id, candidate);
      }
    }
    const ordered = [...deduplicated.values()].sort((left, right) =>
      right.scores.total - left.scores.total ||
      right.page.validFrom.localeCompare(left.page.validFrom) ||
      left.page.id.localeCompare(right.page.id));
    const selected = ordered.slice(0, topK);
    const selectedIds = new Set(selected.map(({ page }) => page.id));
    const prefetchIds = new Set<string>();
    for (const candidate of selected) {
      for (const relation of candidate.page.relations) {
        if (prefetchIds.size >= 16) break;
        if (!selectedIds.has(relation.targetMemoryId)) {
          prefetchIds.add(relation.targetMemoryId);
        }
      }
      if (prefetchIds.size >= 16) break;
    }
    for (const id of prefetchIds) {
      const row = database.prepare(
        "SELECT * FROM memory_pages WHERE id = ? AND namespace = ? AND current = 1",
      ).get(id, input.namespace) as MemoryPageRow | undefined;
      if (!row) continue;
      if (!allowedSensitivity.has(
        row.sensitivity as NonNullable<ContextVmMemoryPageV1["sensitivity"]>,
      )) continue;
      if (
        (row.sensitivity === "personal" || row.sensitivity === "restricted") &&
        (!input.principalId || row.owner_id !== input.principalId)
      ) continue;
      this.cachedMemoryPage(database, row, {
        dependencyCentrality: 1,
        expectedFutureUse: 1,
        sourceQuality: row.evidence_priority === "current_user"
          ? 1
          : row.evidence_priority === "verified_tool"
            ? 0.9
            : row.evidence_priority === "accepted_decision"
              ? 0.8
              : 0.5,
        userImportance: Number(row.importance),
        prefetch: true,
      });
    }
    const cacheAfter = this.pageCache.metrics();
    return {
      schemaVersion: 1,
      query: input.query,
      candidates: selected,
      candidateCount: ordered.length,
      truncated: ordered.length > topK,
      cache: {
        hits: cacheAfter.hits - cacheBefore.hits,
        misses: cacheAfter.misses - cacheBefore.misses,
        prefetchLoads:
          cacheAfter.prefetchLoads - cacheBefore.prefetchLoads,
      },
    };
  }

  async rebuildRetrievalIndex(): Promise<ContextVmIndexRebuildReportV1> {
    await this.ensureInitialized();
    const database = this.requireDatabase();
    const rebuiltAt = this.now();
    database.exec("BEGIN IMMEDIATE");
    try {
      database.exec("DELETE FROM memory_fts; DELETE FROM memory_identifiers;");
      const rows = database.prepare("SELECT * FROM memory_pages ORDER BY id").all() as unknown as MemoryPageRow[];
      for (const row of rows) this.indexMemoryPage(database, this.memoryPageFromRow(database, row));
      const identifiers = database.prepare("SELECT COUNT(*) AS count FROM memory_identifiers")
        .get() as { count: number };
      const digest = sha256(canonical(rows.map((row) => [row.id, row.content_hash])));
      database.prepare(`
        INSERT INTO memory_index_state
          (singleton, index_version, indexed_memory_pages, identifier_count, digest, rebuilt_at)
        VALUES (1, ?, ?, ?, ?, ?)
        ON CONFLICT(singleton) DO UPDATE SET
          index_version = excluded.index_version,
          indexed_memory_pages = excluded.indexed_memory_pages,
          identifier_count = excluded.identifier_count,
          digest = excluded.digest,
          rebuilt_at = excluded.rebuilt_at
      `).run(RETRIEVAL_INDEX_VERSION, rows.length, Number(identifiers.count), digest, rebuiltAt);
      database.exec("COMMIT");
      return {
        schemaVersion: 1,
        indexVersion: RETRIEVAL_INDEX_VERSION,
        indexedMemoryPages: rows.length,
        identifierCount: Number(identifiers.count),
        digest,
        rebuiltAt,
      };
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }

  async extractSession(
    sessionId: ContextVmSessionId,
    namespace: string,
  ): Promise<ContextVmExtractionReportV1> {
    const events = await this.scanSession({ sessionId, limit: MAX_SCAN_LIMIT });
    const inputHash = sha256(canonical(events.map(({ id, contentHash }) => [id, contentHash])));
    const existing = this.requireDatabase().prepare(`
      SELECT id, output_hash FROM extraction_runs
      WHERE session_id = ? AND extractor_version = ? AND input_hash = ?
    `).get(sessionId, EXTRACTOR_VERSION, inputHash) as
      | { id: string; output_hash: string }
      | undefined;
    if (existing) {
      const candidates = (this.requireDatabase().prepare(`
        SELECT candidate_json FROM extraction_candidates
        WHERE extraction_id = ? ORDER BY candidate_hash
      `).all(existing.id) as Array<{ candidate_json: string }>)
        .map(({ candidate_json }) => JSON.parse(candidate_json) as ContextVmExtractionCandidateV1);
      return {
        schemaVersion: 1,
        extractorVersion: EXTRACTOR_VERSION,
        sessionId,
        inputHash,
        outputHash: existing.output_hash,
        candidates,
        unsupportedEventIds: events
          .filter((event) => !candidates.some((candidate) => candidate.sourceEventIds.includes(event.id)))
          .map(({ id }) => id),
      };
    }

    const candidates: ContextVmExtractionCandidateV1[] = [];
    const unsupportedEventIds: ContextVmEventId[] = [];
    for (const event of events) {
      const payload = event.payload && typeof event.payload === "object" && !Array.isArray(event.payload)
        ? event.payload as Record<string, unknown>
        : {};
      const goal = typeof payload.goal === "string" ? payload.goal.trim() : "";
      const summaryValue = typeof payload.summary === "string" ? payload.summary.trim() : "";
      const mapping =
        event.kind === "constraint" ? { kind: "constraint" as const, memoryKind: "constraint" as const }
        : event.kind === "user_message" && goal ? { kind: "goal" as const, memoryKind: "fact" as const }
        : event.kind === "command_run" ? { kind: "command_result" as const, memoryKind: "observation" as const }
        : event.kind === "test_result" ? { kind: "test_result" as const, memoryKind: "observation" as const }
        : event.kind === "file_write" ? { kind: "file_change" as const, memoryKind: "observation" as const }
        : event.kind === "state_transition" || event.kind === "decision"
          ? { kind: "state_transition" as const, memoryKind: event.kind === "decision" ? "decision" as const : "observation" as const }
        : event.kind === "tool_result" ? { kind: "tool_result" as const, memoryKind: "observation" as const }
        : event.kind === "error" ? { kind: "failure_pattern" as const, memoryKind: "failure_pattern" as const }
        : undefined;
      if (!mapping) {
        unsupportedEventIds.push(event.id);
        continue;
      }
      const summary = (goal || summaryValue || `${mapping.kind}: ${event.source.id}`).slice(0, 500);
      const content = {
        eventKind: event.kind,
        sourceType: event.source.kind,
        sourceId: event.source.id,
        payload,
        artifactIds: event.artifacts.map(({ id }) => id),
      };
      const candidateHash = sha256(canonical({
        extractorVersion: EXTRACTOR_VERSION,
        kind: mapping.kind,
        sourceEventIds: [event.id],
        summary,
        content,
      }));
      const timestamp = Math.max(0, Date.parse(event.occurredAt));
      const memoryId = contextVmMemoryId(
        `mem_${timestamp.toString(36).padStart(10, "0").slice(-10)}_${candidateHash.slice(0, 24)}`,
      );
      const page = await this.putMemoryPage({
        id: memoryId,
        namespace,
        kind: mapping.memoryKind,
        status: mapping.kind === "failure_pattern" ? "candidate" : "active",
        summary,
        content,
        sources: [
          { type: "event", eventId: event.id },
          ...event.artifacts.map(({ id }) => ({ type: "artifact" as const, artifactId: id })),
        ],
        entityIds: [],
        taskIds: event.taskId ? [event.taskId] : [],
        relations: [],
        validFrom: event.occurredAt,
        confidence: mapping.kind === "failure_pattern" ? 0.75 : 0.9,
        importance: mapping.kind === "goal" || mapping.kind === "constraint" ? 0.9 : 0.6,
        evidencePriority:
          mapping.kind === "goal" || mapping.kind === "constraint"
            ? "current_user"
            : event.kind === "command_run" || event.kind === "test_result" || event.kind === "tool_result"
              ? "verified_tool"
              : "derived_state",
        producer: EXTRACTOR_VERSION,
        createdAt: event.occurredAt,
        updatedAt: event.occurredAt,
      });
      candidates.push({
        schemaVersion: 1,
        extractorVersion: EXTRACTOR_VERSION,
        candidateHash,
        kind: mapping.kind,
        sourceEventIds: [event.id],
        summary,
        content,
        status: "admitted",
        reason: "structured_supported_event",
        memoryId: page.id,
      });
    }
    candidates.sort((left, right) => left.candidateHash.localeCompare(right.candidateHash));
    const outputHash = sha256(canonical(candidates));
    const extractionId = `extract_${sha256(`${sessionId}:${EXTRACTOR_VERSION}:${inputHash}`).slice(0, 32)}`;
    const database = this.requireDatabase();
    database.exec("BEGIN IMMEDIATE");
    try {
      database.prepare(`
        INSERT INTO extraction_runs
          (id, session_id, extractor_version, input_hash, output_hash,
           candidate_count, admitted_count, rejected_count, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        extractionId, sessionId, EXTRACTOR_VERSION, inputHash, outputHash,
        candidates.length, candidates.length, 0,
        events.at(-1)?.occurredAt ?? this.now(),
      );
      for (const candidate of candidates) {
        database.prepare(`
          INSERT INTO extraction_candidates
            (extraction_id, candidate_hash, candidate_json, status, reason, memory_id)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          extractionId, candidate.candidateHash, canonical(candidate),
          candidate.status, candidate.reason, candidate.memoryId ?? null,
        );
        for (const eventId of candidate.sourceEventIds) {
          database.prepare(`
            INSERT INTO extraction_candidate_sources
              (extraction_id, candidate_hash, event_id) VALUES (?, ?, ?)
          `).run(extractionId, candidate.candidateHash, eventId);
        }
      }
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
    return {
      schemaVersion: 1,
      extractorVersion: EXTRACTOR_VERSION,
      sessionId,
      inputHash,
      outputHash,
      candidates,
      unsupportedEventIds,
    };
  }

  async persistContextPack(
    pack: ContextVmContextPackV1,
  ): Promise<ContextVmContextPackManifestV1> {
    await this.ensureInitialized();
    contextVmContextPackId(pack.manifest.id);
    contextVmSessionId(pack.request.sessionId);
    if (pack.request.taskId) contextVmTaskId(pack.request.taskId);
    if (
      pack.manifest.renderedTokens > pack.manifest.hardBudgetTokens ||
      sha256(pack.rendered) !== pack.manifest.renderedHash ||
      pack.manifest.items.reduce((sum, item) => sum + item.tokenCount, 0) >
        pack.manifest.renderedTokens
    ) {
      throw new ContextVmFailure("invalid_input", "invalid ContextVM context pack");
    }
    let manifest = structuredClone(pack.manifest);
    if (pack.rendered) {
      const artifact = await this.archiveArtifact({
        mediaType: "text/plain",
        bytes: Buffer.from(pack.rendered, "utf8"),
        sensitivity: "personal",
        label: `Context pack ${pack.manifest.id}`,
      });
      if (artifact.sha256 !== pack.manifest.renderedHash) {
        throw new ContextVmFailure(
          "invalid_input",
          "Context pack changed during archive redaction",
        );
      }
      manifest = { ...manifest, renderedArtifactId: artifact.id };
    }
    const database = this.requireDatabase();
    database.exec("BEGIN IMMEDIATE");
    try {
      const duplicate = database.prepare(
        "SELECT manifest_json FROM context_packs WHERE id = ?",
      ).get(manifest.id) as { manifest_json: string } | undefined;
      if (duplicate) {
        const stored = JSON.parse(duplicate.manifest_json) as ContextVmContextPackManifestV1;
        if (stored.renderedHash !== manifest.renderedHash) {
          throw new ContextVmFailure(
            "duplicate_conflict",
            `Context pack id replayed with different content: ${manifest.id}`,
          );
        }
        database.exec("COMMIT");
        return stored;
      }
      database.prepare(`
        INSERT INTO context_packs
          (id, session_id, task_id, namespace, request_json, manifest_json,
           rendered_artifact_id, rendered_hash, rendered_tokens,
           hard_budget_tokens, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        manifest.id,
        pack.request.sessionId,
        pack.request.taskId ?? null,
        pack.request.namespace,
        canonical(pack.request),
        canonical(manifest),
        manifest.renderedArtifactId ?? null,
        manifest.renderedHash,
        manifest.renderedTokens,
        manifest.hardBudgetTokens,
        manifest.createdAt,
      );
      manifest.items.forEach((item, position) => {
        database.prepare(`
          INSERT INTO context_pack_items
            (context_pack_id, position, section, source_type, source_id,
             token_count, load_reason, retrieval_scores_json, content_hash)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          manifest.id,
          position,
          item.section,
          item.sourceType,
          item.sourceId,
          item.tokenCount,
          item.loadReason,
          item.retrievalScores ? canonical(item.retrievalScores) : null,
          item.contentHash,
        );
      });
      database.exec("COMMIT");
      return manifest;
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }

  async beginInvocationAudit(
    input: ContextVmInvocationAuditInputV1,
  ): Promise<void> {
    await this.ensureInitialized();
    contextVmSessionId(input.sessionId);
    if (input.taskId) contextVmTaskId(input.taskId);
    if (!input.invocationId.trim() || !input.role.trim() ||
      !input.provider.trim() || !input.modelId.trim()) {
      throw new ContextVmFailure("invalid_input", "invalid ContextVM invocation audit");
    }
    const database = this.requireDatabase();
    const createdAt = this.now();
    database.exec("BEGIN IMMEDIATE");
    try {
      database.prepare(`
        INSERT INTO context_invocations
          (invocation_id, session_id, task_id, role, provider, status, created_at)
        VALUES (?, ?, ?, ?, ?, 'preparing', ?)
      `).run(
        input.invocationId,
        input.sessionId,
        input.taskId ?? null,
        input.role,
        input.provider,
        createdAt,
      );
      database.prepare(`
        INSERT INTO context_invocation_audit
          (invocation_id, model_id, retrieval_mode,
           ordered_context_pack_ids_json, updated_at, parent_invocation_id)
        VALUES (?, ?, ?, '[]', ?, ?)
      `).run(
        input.invocationId,
        input.modelId,
        input.retrievalMode,
        createdAt,
        input.parentInvocationId ?? null,
      );
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      const existing = database.prepare(`
        SELECT session_id, role, provider
        FROM context_invocations WHERE invocation_id = ?
      `).get(input.invocationId) as {
        session_id: string;
        role: string;
        provider: string;
      } | undefined;
      if (
        existing?.session_id === input.sessionId &&
        existing.role === input.role &&
        existing.provider === input.provider
      ) return;
      throw error;
    }
  }

  async recordInvocationDecision(input: {
    invocationId: string;
    round: number;
    decision: unknown;
    contextPackId: ContextVmContextPackId;
  }): Promise<void> {
    await this.ensureInitialized();
    contextVmContextPackId(input.contextPackId);
    if (!Number.isInteger(input.round) || input.round < 0) {
      throw new ContextVmFailure("invalid_input", "invalid ContextVM decision round");
    }
    this.requireDatabase().prepare(`
      INSERT INTO context_pack_decisions
        (invocation_id, round, decision_json, context_pack_id, created_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(invocation_id, round) DO UPDATE SET
        decision_json = excluded.decision_json,
        context_pack_id = excluded.context_pack_id
    `).run(
      input.invocationId,
      input.round,
      canonical(input.decision),
      input.contextPackId,
      this.now(),
    );
  }

  async recordProviderDispatch(input: {
    invocationId: string;
    attempt: number;
    transport:
      | "codex-cli"
      | "codex-app-server"
      | "openai-responses"
      | "scripted";
    modelId: string;
    status: "prepared" | "dispatched" | "completed" | "failed" | "in_doubt";
    contextPackId?: ContextVmContextPackId;
    contextPackHash?: string;
    failureReason?: string;
  }): Promise<void> {
    await this.ensureInitialized();
    if (!Number.isInteger(input.attempt) || input.attempt < 1) {
      throw new ContextVmFailure("invalid_input", "invalid provider dispatch attempt");
    }
    if (input.contextPackId) contextVmContextPackId(input.contextPackId);
    const now = this.now();
    this.requireDatabase().prepare(`
      INSERT INTO context_provider_dispatches
        (invocation_id, attempt, transport, model_id, status,
         context_pack_id, context_pack_hash, failure_reason,
         created_at, completed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(invocation_id, attempt) DO UPDATE SET
        status = excluded.status,
        context_pack_id = COALESCE(excluded.context_pack_id, context_pack_id),
        context_pack_hash = COALESCE(excluded.context_pack_hash, context_pack_hash),
        failure_reason = excluded.failure_reason,
        completed_at = excluded.completed_at
    `).run(
      input.invocationId,
      input.attempt,
      input.transport,
      input.modelId,
      input.status,
      input.contextPackId ?? null,
      input.contextPackHash ?? null,
      input.failureReason ?? null,
      now,
      ["completed", "failed"].includes(input.status) ? now : null,
    );
  }

  async recordProviderAttempt(input: {
    attemptId: string;
    invocationId: string;
    phase: "readiness" | "inference";
    attempt: number;
    transport:
      | "codex-cli"
      | "codex-app-server"
      | "openai-responses"
      | "scripted";
    modelId: string;
    thinkingEffort: string;
    status: "prepared" | "dispatched" | "completed" | "failed" | "in_doubt";
    contextPackIds: ContextVmContextPackId[];
    contextHash: string;
    resultHash?: string;
    usage?: unknown;
    failureReason?: string;
  }): Promise<void> {
    await this.ensureInitialized();
    if (
      !input.attemptId.trim() ||
      !Number.isInteger(input.attempt) ||
      input.attempt < 1 ||
      !/^[0-9a-f]{64}$/u.test(input.contextHash) ||
      (input.resultHash !== undefined && !/^[0-9a-f]{64}$/u.test(input.resultHash))
    ) {
      throw new ContextVmFailure("invalid_input", "invalid provider attempt");
    }
    input.contextPackIds.forEach(contextVmContextPackId);
    const database = this.requireDatabase();
    const now = this.now();
    const existing = database.prepare(`
      SELECT status FROM context_provider_attempts
      WHERE attempt_id = ?
    `).get(input.attemptId) as { status: string } | undefined;
    if (
      existing &&
      !(
        existing.status === "prepared" && input.status === "dispatched" ||
        existing.status === "dispatched" &&
          ["completed", "failed", "in_doubt"].includes(input.status) ||
        existing.status === input.status
      )
    ) {
      throw new ContextVmFailure(
        "duplicate_conflict",
        `invalid provider attempt transition ${existing.status} -> ${input.status}`,
      );
    }
    database.prepare(`
      INSERT INTO context_provider_attempts
        (attempt_id, invocation_id, phase, attempt, transport, model_id,
         thinking_effort, status, context_pack_ids_json, context_hash,
         result_hash, usage_json, failure_reason, created_at, dispatched_at,
         completed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(attempt_id) DO UPDATE SET
        status = excluded.status,
        result_hash = COALESCE(excluded.result_hash, result_hash),
        usage_json = COALESCE(excluded.usage_json, usage_json),
        failure_reason = excluded.failure_reason,
        dispatched_at = COALESCE(excluded.dispatched_at, dispatched_at),
        completed_at = excluded.completed_at
    `).run(
      input.attemptId,
      input.invocationId,
      input.phase,
      input.attempt,
      input.transport,
      input.modelId,
      input.thinkingEffort,
      input.status,
      canonical(input.contextPackIds),
      input.contextHash,
      input.resultHash ?? null,
      input.usage === undefined ? null : canonical(input.usage),
      input.failureReason ?? null,
      now,
      input.status === "dispatched" ? now : null,
      ["completed", "failed"].includes(input.status) ? now : null,
    );
  }

  async recoverProviderAttempts(sessionId: ContextVmSessionId): Promise<{
    inDoubtInvocationIds: string[];
  }> {
    await this.ensureInitialized();
    contextVmSessionId(sessionId);
    const database = this.requireDatabase();
    database.prepare(`
      UPDATE context_provider_attempts
      SET status = 'in_doubt',
          failure_reason = COALESCE(failure_reason, 'process_ended_after_dispatch')
      WHERE status = 'dispatched'
        AND invocation_id IN (
          SELECT invocation_id FROM context_invocations WHERE session_id = ?
        )
    `).run(sessionId);
    const rows = database.prepare(`
      SELECT DISTINCT invocation_id
      FROM context_provider_attempts
      WHERE status = 'in_doubt'
        AND invocation_id IN (
          SELECT invocation_id FROM context_invocations WHERE session_id = ?
        )
      ORDER BY invocation_id
    `).all(sessionId) as Array<{ invocation_id: string }>;
    return { inDoubtInvocationIds: rows.map(({ invocation_id }) => invocation_id) };
  }

  async recordMemoryExemption(input: {
    exemptionId: string;
    sessionId: ContextVmSessionId;
    taskId?: ContextVmTaskId;
    operation: string;
    reason: "asset_generation" | "provider_probe" | "non_agent_generation";
    transport: string;
    modelId: string;
    inputHash: string;
  }): Promise<void> {
    await this.ensureInitialized();
    contextVmSessionId(input.sessionId);
    if (input.taskId) contextVmTaskId(input.taskId);
    if (!input.exemptionId.trim() || !/^[0-9a-f]{64}$/u.test(input.inputHash)) {
      throw new ContextVmFailure("invalid_input", "invalid memory exemption");
    }
    this.requireDatabase().prepare(`
      INSERT INTO context_memory_exemptions
        (exemption_id, session_id, task_id, operation, reason, transport,
         model_id, input_hash, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.exemptionId,
      input.sessionId,
      input.taskId ?? null,
      input.operation,
      input.reason,
      input.transport,
      input.modelId,
      input.inputHash,
      this.now(),
    );
  }

  async completeInvocationAudit(
    input: ContextVmInvocationCompletionInputV1,
  ): Promise<void> {
    await this.ensureInitialized();
    input.contextPackIds.forEach(contextVmContextPackId);
    if (input.checkpointId) contextVmCheckpointId(input.checkpointId);
    const database = this.requireDatabase();
    const completedAt = this.now();
    const rootPackId = input.contextPackIds[0] ?? null;
    database.exec("BEGIN IMMEDIATE");
    try {
      database.prepare(`
        UPDATE context_invocations SET
          context_pack_id = ?,
          context_pack_hash = ?,
          status = ?,
          completed_at = ?
        WHERE invocation_id = ?
      `).run(
        rootPackId,
        input.contextPackHash ?? null,
        input.status,
        completedAt,
        input.invocationId,
      );
      database.prepare(`
        UPDATE context_invocation_audit SET
          ordered_context_pack_ids_json = ?,
          terminal_reason = ?,
          checkpoint_id = ?,
          updated_at = ?
        WHERE invocation_id = ?
      `).run(
        canonical(input.contextPackIds),
        input.terminalReason ?? null,
        input.checkpointId ?? null,
        completedAt,
        input.invocationId,
      );
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }

  async inspectContextPack(
    id: ContextVmContextPackId,
  ): Promise<ContextVmContextPackManifestV1 | undefined> {
    await this.ensureInitialized();
    contextVmContextPackId(id);
    const row = this.requireDatabase().prepare(
      "SELECT manifest_json FROM context_packs WHERE id = ?",
    ).get(id) as { manifest_json: string } | undefined;
    return row
      ? JSON.parse(row.manifest_json) as ContextVmContextPackManifestV1
      : undefined;
  }

  private async sessionEvents(
    sessionId: ContextVmSessionId,
    signal?: AbortSignal,
  ): Promise<ContextVmEventV1[]> {
    const events: ContextVmEventV1[] = [];
    let afterSequence = 0;
    for (;;) {
      if (signal?.aborted) throw recoveryAbortError();
      const page = await this.scanSession({
        sessionId,
        afterSequence,
        limit: MAX_SCAN_LIMIT,
      });
      events.push(...page);
      if (page.length < MAX_SCAN_LIMIT) break;
      afterSequence = page.at(-1)!.sequenceNo;
    }
    return events;
  }

  async createStateCheckpoint(input: {
    sessionId: ContextVmSessionId;
    reason: ContextVmStateCheckpointV1["reason"];
  }): Promise<ContextVmStateCheckpointV1> {
    await this.ensureInitialized();
    contextVmSessionId(input.sessionId);
    if (
      !["explicit", "session_checkpoint", "task_closed", "event_threshold"]
        .includes(input.reason)
    ) {
      throw new ContextVmFailure("invalid_input", "invalid ContextVM checkpoint reason");
    }
    const events = await this.sessionEvents(input.sessionId);
    if (events.length === 0) {
      throw new ContextVmFailure(
        "invalid_input",
        `ContextVM session has no events: ${input.sessionId}`,
      );
    }
    const latestCheckpoint = this.requireDatabase().prepare(`
      SELECT * FROM state_checkpoints
      WHERE session_id = ?
      ORDER BY captured_through_sequence DESC, created_at DESC
      LIMIT 1
    `).get(input.sessionId) as {
      id: string;
      captured_through_sequence: number;
      source_start_sequence: number;
      source_end_sequence: number;
      reducer_version: string;
      state_json: string;
      state_hash: string;
      reason: ContextVmStateCheckpointV1["reason"];
      created_at: string;
    } | undefined;
    if (
      latestCheckpoint &&
      events
        .filter(({ sequenceNo }) =>
          sequenceNo > Number(latestCheckpoint.captured_through_sequence))
        .every(({ kind }) => kind === "checkpoint" || kind === "recovery")
    ) {
      const state = JSON.parse(
        latestCheckpoint.state_json,
      ) as ContextVmReconstructedStateV1;
      if (sha256(canonical(state)) === latestCheckpoint.state_hash) {
        return parseContextVmStateCheckpointV1({
          schemaVersion: 1,
          id: latestCheckpoint.id,
          sessionId: input.sessionId,
          capturedThroughSequence:
            Number(latestCheckpoint.captured_through_sequence),
          sourceEventRange: {
            start: Number(latestCheckpoint.source_start_sequence),
            end: Number(latestCheckpoint.source_end_sequence),
          },
          reducerVersion: latestCheckpoint.reducer_version,
          state,
          stateHash: latestCheckpoint.state_hash,
          reason: latestCheckpoint.reason,
          createdAt: latestCheckpoint.created_at,
        });
      }
    }
    const capturedThroughSequence = events.at(-1)!.sequenceNo;
    const state = reduceContextVmEvents(input.sessionId, events);
    const stateHash = sha256(canonical(state));
    const id = contextVmCheckpointId(
      `chk_${sha256(`${input.sessionId}:${capturedThroughSequence}:${stateHash}`).slice(0, 32)}`,
    );
    const existing = this.requireDatabase().prepare(
      "SELECT state_json, state_hash, reason, created_at FROM state_checkpoints WHERE id = ?",
    ).get(id) as {
      state_json: string;
      state_hash: string;
      reason: ContextVmStateCheckpointV1["reason"];
      created_at: string;
    } | undefined;
    if (existing) {
      return parseContextVmStateCheckpointV1({
        schemaVersion: 1,
        id,
        sessionId: input.sessionId,
        capturedThroughSequence,
        sourceEventRange: { start: 1, end: capturedThroughSequence },
        reducerVersion: "contextvm-state-v1",
        state: JSON.parse(existing.state_json),
        stateHash: existing.state_hash,
        reason: existing.reason,
        createdAt: existing.created_at,
      });
    }
    const createdAt = this.now();
    const auditId = eventId();
    const auditSource = {
      kind: "memory_runtime" as const,
      id: `checkpoint:${id}`,
    };
    const auditActor = { kind: "runtime" as const, id: "contextvm-recovery" };
    const auditPayload = {
      checkpointId: id,
      capturedThroughSequence,
      stateHash,
      reason: input.reason,
    };
    const redacted = redactSensitivePayload(auditPayload);
    const auditRedaction = mergeRedaction(redacted.redaction, []);
    const auditHash = eventContentHash({
      sessionId: input.sessionId,
      taskId: undefined,
      source: auditSource,
      occurredAt: createdAt,
      actor: auditActor,
      kind: "checkpoint",
      payload: redacted.payload,
      artifacts: [],
      parentEventIds: [],
      sensitivity: "internal",
      redaction: auditRedaction,
    });
    const checkpoint = parseContextVmStateCheckpointV1({
      schemaVersion: 1,
      id,
      sessionId: input.sessionId,
      capturedThroughSequence,
      sourceEventRange: { start: 1, end: capturedThroughSequence },
      reducerVersion: "contextvm-state-v1",
      state,
      stateHash,
      reason: input.reason,
      createdAt,
    });
    const database = this.requireDatabase();
    database.exec("BEGIN IMMEDIATE");
    try {
      const latest = database.prepare(
        "SELECT COALESCE(MAX(sequence_no), 0) AS sequence FROM events WHERE session_id = ?",
      ).get(input.sessionId) as { sequence: number };
      if (Number(latest.sequence) !== capturedThroughSequence) {
        throw new ContextVmFailure(
          "duplicate_conflict",
          "ContextVM session changed while creating its checkpoint",
        );
      }
      database.prepare(`
        INSERT INTO events
          (id, session_id, task_id, sequence_no, source_kind, source_id,
           occurred_at, recorded_at, actor_json, kind, payload_json,
           content_hash, sensitivity, redaction_json)
        VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, 'checkpoint', ?, ?, 'internal', ?)
      `).run(
        auditId,
        input.sessionId,
        capturedThroughSequence + 1,
        auditSource.kind,
        auditSource.id,
        createdAt,
        createdAt,
        canonical(auditActor),
        canonical(redacted.payload),
        auditHash,
        canonical(auditRedaction),
      );
      database.prepare(`
        INSERT INTO state_checkpoints
          (id, session_id, captured_through_sequence, source_start_sequence,
           source_end_sequence, reducer_version, state_json, state_hash,
           reason, checkpoint_event_id, created_at)
        VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        input.sessionId,
        capturedThroughSequence,
        capturedThroughSequence,
        checkpoint.reducerVersion,
        canonical(state),
        stateHash,
        input.reason,
        auditId,
        createdAt,
      );
      database.exec("COMMIT");
      return checkpoint;
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }

  async recoverSessionState(
    sessionId: ContextVmSessionId,
    signal?: AbortSignal,
  ): Promise<ContextVmRecoveryResultV1> {
    await this.ensureInitialized();
    contextVmSessionId(sessionId);
    if (signal?.aborted) throw recoveryAbortError();
    const started = performance.now();
    const warnings: string[] = [];
    const rows = this.requireDatabase().prepare(`
      SELECT * FROM state_checkpoints
      WHERE session_id = ?
      ORDER BY captured_through_sequence DESC, created_at DESC
    `).all(sessionId) as Array<{
      id: string;
      captured_through_sequence: number;
      source_start_sequence: number;
      source_end_sequence: number;
      reducer_version: string;
      state_json: string;
      state_hash: string;
      reason: ContextVmStateCheckpointV1["reason"];
      created_at: string;
    }>;
    let initial: ContextVmReconstructedStateV1 | undefined;
    let checkpointId: ContextVmCheckpointId | undefined;
    let selectedIndex = -1;
    for (const [index, row] of rows.entries()) {
      if (signal?.aborted) throw recoveryAbortError();
      try {
        const state = JSON.parse(row.state_json) as ContextVmReconstructedStateV1;
        const checkpoint = parseContextVmStateCheckpointV1({
          schemaVersion: 1,
          id: row.id,
          sessionId,
          capturedThroughSequence: Number(row.captured_through_sequence),
          sourceEventRange: {
            start: Number(row.source_start_sequence),
            end: Number(row.source_end_sequence),
          },
          reducerVersion: row.reducer_version,
          state,
          stateHash: row.state_hash,
          reason: row.reason,
          createdAt: row.created_at,
        });
        if (sha256(canonical(checkpoint.state)) !== checkpoint.stateHash) {
          throw new Error("state hash mismatch");
        }
        const range = this.requireDatabase().prepare(`
          SELECT COUNT(*) AS count, MIN(sequence_no) AS first, MAX(sequence_no) AS last
          FROM events WHERE session_id = ? AND sequence_no <= ?
        `).get(sessionId, checkpoint.capturedThroughSequence) as {
          count: number;
          first: number | null;
          last: number | null;
        };
        if (
          Number(range.count) !== checkpoint.capturedThroughSequence ||
          Number(range.first) !== 1 ||
          Number(range.last) !== checkpoint.capturedThroughSequence
        ) {
          throw new Error("source event range mismatch");
        }
        initial = checkpoint.state;
        checkpointId = checkpoint.id;
        selectedIndex = index;
        break;
      } catch (error) {
        warnings.push(
          `Ignored checkpoint ${row.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
    const allEvents = await this.sessionEvents(sessionId, signal);
    if (allEvents.length === 0) {
      return {
        schemaVersion: 1,
        status: "blocked",
        source: "none",
        warnings: [...warnings, "The session has no canonical events."],
        durationMs: Math.max(0, performance.now() - started),
      };
    }
    let state: ContextVmReconstructedStateV1;
    try {
      state = initial
        ? reduceContextVmEvents(
            sessionId,
            allEvents.filter(({ sequenceNo }) =>
              sequenceNo > initial!.throughSequence),
            initial,
          )
        : reduceContextVmEvents(sessionId, allEvents);
    } catch (error) {
      return {
        schemaVersion: 1,
        status: "blocked",
        source: checkpointId
          ? selectedIndex === 0 ? "checkpoint" : "earlier_checkpoint"
          : "full_replay",
        ...(checkpointId ? { checkpointId } : {}),
        warnings: [
          ...warnings,
          error instanceof Error ? error.message : String(error),
        ],
        durationMs: Math.max(0, performance.now() - started),
      };
    }
    const stateHash = sha256(canonical(state));
    const inDoubt = state.obligations.some(({ status }) => status === "in_doubt");
    const source = checkpointId
      ? selectedIndex === 0 ? "checkpoint" as const : "earlier_checkpoint" as const
      : "full_replay" as const;
    const status: ContextVmRecoveryResultV1["status"] = inDoubt
      ? "recovery_required"
      : warnings.length > 0 || source !== "checkpoint"
        ? "recovered_with_fallback"
        : "recovered";
    const result: ContextVmRecoveryResultV1 = {
      schemaVersion: 1,
      status,
      source,
      ...(checkpointId ? { checkpointId } : {}),
      state,
      stateHash,
      warnings,
      durationMs: Math.max(0, performance.now() - started),
    };
    await this.appendEvent({
      sessionId,
      source: {
        kind: "memory_runtime",
        id: `recovery:${sha256(`${sessionId}:${state.throughSequence}:${stateHash}`).slice(0, 32)}`,
      },
      occurredAt: this.now(),
      actor: { kind: "runtime", id: "contextvm-recovery" },
      kind: "recovery",
      payload: {
        status,
        source,
        checkpointId: checkpointId ?? null,
        recoveredThroughSequence: state.throughSequence,
        stateHash,
        inDoubtObligationCount: state.obligations.filter(
          ({ status }) => status === "in_doubt",
        ).length,
      },
      sensitivity: "internal",
    });
    return result;
  }

  async consolidateSession(input: {
    sessionId: ContextVmSessionId;
    namespace: string;
    trigger: ContextVmConsolidationTriggerV1;
    taskId?: ContextVmTaskId;
  }): Promise<ContextVmConsolidationReportV1> {
    await this.ensureInitialized();
    contextVmSessionId(input.sessionId);
    if (input.taskId) contextVmTaskId(input.taskId);
    if (!input.namespace.trim()) {
      throw new ContextVmFailure("invalid_input", "ContextVM consolidation namespace is required");
    }
    const events = (await this.sessionEvents(input.sessionId))
      .filter((event) => !input.taskId || event.taskId === input.taskId);
    if (events.length === 0) {
      throw new ContextVmFailure("invalid_input", "ContextVM consolidation has no source events");
    }
    if (input.trigger === "event_threshold" && events.length < 250) {
      throw new ContextVmFailure(
        "invalid_input",
        "ContextVM event-threshold consolidation requires at least 250 events",
      );
    }
    if (
      input.trigger === "task_closed" &&
      !events.some((event) => eventType(event) === "run_finished")
    ) {
      throw new ContextVmFailure(
        "invalid_input",
        "ContextVM task-closed consolidation requires a terminal event",
      );
    }
    const inputHash = sha256(canonical(events.map(({ id, contentHash }) => [id, contentHash])));
    const prior = this.requireDatabase().prepare(`
      SELECT report_json FROM consolidation_runs
      WHERE session_id = ? AND namespace = ? AND trigger = ? AND input_hash = ?
      ORDER BY generation DESC LIMIT 1
    `).get(input.sessionId, input.namespace, input.trigger, inputHash) as {
      report_json: string;
    } | undefined;
    if (prior) {
      const report = JSON.parse(prior.report_json) as ContextVmConsolidationReportV1;
      const active = report.outputMemoryIds.every((id) =>
        Boolean(this.requireDatabase().prepare(
          "SELECT 1 FROM memory_pages WHERE id = ? AND current = 1 AND status <> 'deleted'",
        ).get(id)));
      if (active) return report;
    }
    const claimsFor = (
      kind: ContextVmConsolidationCandidateV1["claims"][number]["kind"],
      selected: ContextVmEventV1[],
    ) => selected.map((event) => ({
      kind,
      value: eventSummary(event),
      sources: [{ type: "event" as const, eventId: event.id }],
    }));
    const goals = events.filter((event) =>
      eventType(event) === "goal_received" || event.kind === "user_message");
    const constraints = events.filter(({ kind }) => kind === "constraint");
    const outcomes = events.filter((event) =>
      eventType(event) === "run_finished" ||
      eventType(event) === "verification_passed" ||
      eventType(event) === "verification_failed");
    const decisions = events.filter(({ kind }) => kind === "decision");
    const acceptedDecisions = decisions.filter((event) => {
      const payload = payloadRecord(event);
      return (
        event.actor.kind === "user" ||
        payload.accepted === true ||
        payload.status === "accepted"
      );
    });
    const grouped = (selected: ContextVmEventV1[]) => {
      const groups = new Map<string, ContextVmEventV1[]>();
      for (const event of selected) {
        const key = eventSummary(event).normalize("NFKC").toLowerCase();
        const values = groups.get(key) ?? [];
        values.push(event);
        groups.set(key, values);
      }
      return [...groups.values()].filter((values) => values.length >= 3);
    };
    const procedures = grouped(events.filter((event) => {
      if (event.kind !== "command_run" && event.kind !== "tool_result") {
        return false;
      }
      const payload = payloadRecord(event);
      return (
        payload.exitCode === 0 ||
        payload.success === true ||
        payload.status === "pass" ||
        payload.status === "success"
      );
    }));
    const failures = grouped(events.filter(({ kind }) => kind === "error"));
    if (
      input.trigger === "repeated_pattern" &&
      procedures.length === 0 &&
      failures.length === 0
    ) {
      throw new ContextVmFailure(
        "invalid_input",
        "ContextVM repeated-pattern consolidation requires three identical sources",
      );
    }
    if (
      input.trigger === "accepted_decision" &&
      acceptedDecisions.length === 0
    ) {
      throw new ContextVmFailure(
        "invalid_input",
        "ContextVM accepted-decision consolidation requires decision evidence",
      );
    }
    const candidates: ContextVmConsolidationCandidateV1[] = [];
    const summaryClaims = [
      ...claimsFor("goal", goals.slice(-1)),
      ...claimsFor("constraint", constraints),
      ...claimsFor("outcome", outcomes.slice(-3)),
    ];
    if (summaryClaims.length > 0) {
      candidates.push({
        schemaVersion: 1,
        namespace: input.namespace,
        sessionId: input.sessionId,
        ...(input.taskId ? { taskId: input.taskId } : {}),
        outputKind: input.taskId ? "task_summary" : "session_summary",
        trigger: input.trigger,
        claims: summaryClaims,
      });
    }
    for (const event of acceptedDecisions) {
      candidates.push({
        schemaVersion: 1,
        namespace: input.namespace,
        sessionId: input.sessionId,
        ...(event.taskId ? { taskId: event.taskId } : {}),
        outputKind: "accepted_decision",
        trigger: input.trigger,
        claims: claimsFor("decision", [event]),
      });
    }
    for (const group of procedures) {
      candidates.push({
        schemaVersion: 1,
        namespace: input.namespace,
        sessionId: input.sessionId,
        ...(input.taskId ? { taskId: input.taskId } : {}),
        outputKind: "reusable_procedure",
        trigger: input.trigger,
        claims: claimsFor("procedure_step", group),
      });
    }
    for (const group of failures) {
      candidates.push({
        schemaVersion: 1,
        namespace: input.namespace,
        sessionId: input.sessionId,
        ...(input.taskId ? { taskId: input.taskId } : {}),
        outputKind: "failure_pattern",
        trigger: input.trigger,
        claims: claimsFor("failure", group),
      });
    }
    const database = this.requireDatabase();
    const generation = Number((database.prepare(`
      SELECT COALESCE(MAX(generation), 0) AS generation
      FROM consolidation_runs
      WHERE session_id = ? AND namespace = ? AND trigger = ? AND input_hash = ?
    `).get(input.sessionId, input.namespace, input.trigger, inputHash) as {
      generation: number;
    }).generation) + 1;
    const outputMemoryIds: ContextVmMemoryId[] = [];
    const rejected: ContextVmConsolidationReportV1["rejected"] = [];
    for (const unparsed of candidates) {
      try {
        const candidate = parseContextVmConsolidationCandidateV1(unparsed);
        for (const claim of candidate.claims) {
          for (const source of claim.sources) {
            if (source.type !== "event") {
              throw new Error("summary-of-summary and non-raw consolidation are disabled");
            }
            const event = events.find(({ id }) => id === source.eventId);
            if (!event || eventSummary(event) !== claim.value) {
              throw new Error("claim is not an exact structured source value");
            }
          }
        }
        const outputHash = sha256(canonical(candidate));
        const memoryId = contextVmMemoryId(
          `mem_${Math.max(0, Date.parse(events.at(-1)!.occurredAt)).toString(36).padStart(10, "0").slice(-10)}_${sha256(`${outputHash}:${generation}`).slice(0, 24)}`,
        );
        const sourceRefs = [...new Map(candidate.claims.flatMap(({ sources }) =>
          sources.map((source) => [`${source.type}:${"eventId" in source ? source.eventId : ""}`, source] as const),
        )).values()];
        const summary = candidate.claims.map(({ value }) => value).join(" · ").slice(0, 500);
        const kind =
          candidate.outputKind.endsWith("summary") ? "summary" as const
          : candidate.outputKind === "accepted_decision" ? "decision" as const
          : candidate.outputKind === "reusable_procedure" ? "procedure" as const
          : "failure_pattern" as const;
        const page = await this.putMemoryPage({
          id: memoryId,
          namespace: candidate.namespace,
          kind,
          status: candidate.outputKind === "failure_pattern"
            ? "candidate"
            : candidate.outputKind === "accepted_decision" ? "accepted" : "active",
          summary,
          content: {
            consolidationVersion: "contextvm-consolidator-v1",
            outputKind: candidate.outputKind,
            trigger: candidate.trigger,
            generation,
            claims: candidate.claims,
            sourceClosureHash: sha256(canonical(sourceRefs)),
          },
          sources: sourceRefs,
          entityIds: [],
          taskIds: candidate.taskId ? [candidate.taskId] : [],
          relations: [],
          validFrom: events[0]!.occurredAt,
          confidence: 1,
          importance: candidate.outputKind.endsWith("summary") ? 0.7 : 0.8,
          evidencePriority: candidate.outputKind === "accepted_decision"
            ? "accepted_decision"
            : "summary",
          producer: "contextvm-consolidator-v1",
          createdAt: events.at(-1)!.occurredAt,
          updatedAt: events.at(-1)!.occurredAt,
        });
        outputMemoryIds.push(page.id);
      } catch (error) {
        rejected.push({
          outputKind: unparsed.outputKind,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }
    const createdAt = this.now();
    const report: ContextVmConsolidationReportV1 = {
      schemaVersion: 1,
      sessionId: input.sessionId,
      trigger: input.trigger,
      inputHash,
      outputMemoryIds,
      rejected,
      sourceEventCount: events.length,
      createdAt,
    };
    const consolidationId = `con_${sha256(`${input.sessionId}:${input.namespace}:${input.trigger}:${inputHash}:${generation}`).slice(0, 32)}`;
    database.exec("BEGIN IMMEDIATE");
    try {
      database.prepare(`
        INSERT INTO consolidation_runs
          (id, session_id, task_id, namespace, trigger, input_hash,
           source_event_count, generation, report_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        consolidationId,
        input.sessionId,
        input.taskId ?? null,
        input.namespace,
        input.trigger,
        inputHash,
        events.length,
        generation,
        canonical(report),
        createdAt,
      );
      outputMemoryIds.forEach((memoryId, position) => {
        database.prepare(`
          INSERT INTO consolidation_outputs
            (consolidation_id, position, memory_id, output_kind)
          VALUES (?, ?, ?, ?)
        `).run(
          consolidationId,
          position,
          memoryId,
          candidates[position]?.outputKind ?? "derived",
        );
      });
      database.exec("COMMIT");
      return report;
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }

  async discardConsolidatedMemory(id: ContextVmMemoryId): Promise<void> {
    await this.ensureInitialized();
    contextVmMemoryId(id);
    const database = this.requireDatabase();
    const page = database.prepare(`
      SELECT producer, status FROM memory_pages
      WHERE id = ? AND EXISTS (
        SELECT 1 FROM consolidation_outputs WHERE memory_id = memory_pages.id
      )
    `).get(id) as { producer: string; status: string } | undefined;
    if (!page || page.producer !== "contextvm-consolidator-v1") {
      throw new ContextVmFailure(
        "invalid_input",
        "Only ContextVM consolidated memory may be discarded",
      );
    }
    if (page.status === "deleted") return;
    database.exec("BEGIN IMMEDIATE");
    try {
      database.prepare(`
        UPDATE memory_pages
        SET status = 'deleted', current = 0, valid_until = ?, updated_at = ?
        WHERE id = ?
      `).run(this.now(), this.now(), id);
      database.prepare(`
        INSERT INTO memory_audit
          (operation, memory_id, revision, occurred_at, details_json)
        VALUES ('consolidation.discard', ?, 0, ?, ?)
      `).run(id, this.now(), canonical({ producer: page.producer }));
      database.exec("COMMIT");
      this.pageCache.invalidate(id);
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }

  async getMemoryEnvelope(): Promise<MemoryStoreEnvelopeV2> {
    await this.ensureInitialized();
    const row = this.requireDatabase().prepare(
      "SELECT envelope_json FROM memory_state WHERE singleton = 1",
    ).get() as { envelope_json: string } | undefined;
    if (row) return JSON.parse(row.envelope_json) as MemoryStoreEnvelopeV2;
    return {
      schemaVersion: 3,
      revision: 0,
      updatedAt: new Date(0).toISOString(),
      episodes: [],
      candidateRules: [],
      semanticMemory: [],
      tombstones: [],
      auditLog: [],
    };
  }

  async importMemoryEnvelope(
    envelope: MemoryStoreEnvelopeV2,
    options: { sourceLabel: string; sourceBytes?: Uint8Array },
  ): Promise<void> {
    await this.ensureInitialized();
    const hasState = Boolean(this.requireDatabase().prepare(
      "SELECT 1 FROM memory_state WHERE singleton = 1",
    ).get());
    const existing = await this.getMemoryEnvelope();
    if (hasState) {
      if (canonical(existing) === canonical(envelope)) return;
      throw new ContextVmFailure(
        "duplicate_conflict",
        "ContextVM memory already contains different authoritative state",
      );
    }
    const artifact = await this.archiveArtifact({
      mediaType: "application/json",
      bytes:
        options.sourceBytes ??
        Buffer.from(`${JSON.stringify(envelope, null, 2)}\n`, "utf8"),
      sensitivity: "personal",
      label: options.sourceLabel,
    });
    const database = this.requireDatabase();
    database.exec("BEGIN IMMEDIATE");
    try {
      this.writeMemoryEnvelope(database, envelope, artifact, "legacy.import");
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }

  async mutateMemoryEnvelope<T>(
    expectedRevision: number | undefined,
    mutate: (envelope: MemoryStoreEnvelopeV2) => T,
  ): Promise<T> {
    await this.ensureInitialized();
    const before = await this.getMemoryEnvelope();
    if (
      expectedRevision !== undefined &&
      before.revision !== expectedRevision
    ) {
      throw new ContextVmFailure(
        "duplicate_conflict",
        `memory revision conflict: expected ${expectedRevision}, current ${before.revision}`,
      );
    }
    const next = structuredClone(before);
    const result = mutate(next);
    next.revision = before.revision + 1;
    next.updatedAt = this.now();
    const artifact = await this.archiveArtifact({
      mediaType: "application/json",
      bytes: Buffer.from(`${JSON.stringify(next, null, 2)}\n`, "utf8"),
      sensitivity: "personal",
      label: `ContextVM memory revision ${next.revision}`,
    });
    const database = this.requireDatabase();
    database.exec("BEGIN IMMEDIATE");
    try {
      const current = database.prepare(
        "SELECT revision FROM memory_state WHERE singleton = 1",
      ).get() as { revision: number } | undefined;
      if (Number(current?.revision ?? 0) !== before.revision) {
        throw new ContextVmFailure(
          "duplicate_conflict",
          `memory revision changed concurrently: expected ${before.revision}, current ${current?.revision ?? 0}`,
        );
      }
      this.writeMemoryEnvelope(database, next, artifact, "memory.mutate");
      database.exec("COMMIT");
      return structuredClone(result);
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }

  async status(): Promise<ContextVmStatusV1> {
    await this.ensureInitialized();
    const database = this.requireDatabase();
    const counts = database.prepare(`
      SELECT
        (SELECT COUNT(*) FROM events) AS events,
        (SELECT COUNT(DISTINCT session_id) FROM events) AS sessions,
        (SELECT COUNT(*) FROM artifacts) AS artifacts,
        (SELECT COALESCE(SUM(stored_bytes), 0) FROM artifacts) AS archive_bytes,
        (SELECT COUNT(*) FROM memory_pages) AS memory_pages,
        (SELECT COUNT(*) FROM state_checkpoints) AS checkpoints,
        (SELECT COUNT(*) FROM consolidation_runs) AS consolidations,
        (SELECT MAX(captured_through_sequence) FROM state_checkpoints) AS latest_checkpoint,
        (SELECT COUNT(*) FROM memory_contradictions WHERE status = 'unresolved') AS contradictions,
        (SELECT COALESCE(MAX(revision), 0) FROM memory_state) AS memory_revision
    `).get() as {
      events: number; sessions: number; artifacts: number; archive_bytes: number;
      memory_pages: number; checkpoints: number; consolidations: number;
      latest_checkpoint: number | null; contradictions: number; memory_revision: number;
    };
    const journal = database.prepare("PRAGMA journal_mode").get() as { journal_mode: string };
    const foreignKeys = database.prepare("PRAGMA foreign_keys").get() as { foreign_keys: number };
    return {
      schemaVersion: 1,
      health:
        Number(counts.events) === 0 && Number(counts.memory_pages) === 0
          ? "empty"
          : "ready",
      databaseSchemaVersion: DATABASE_SCHEMA_VERSION,
      journalMode: journal.journal_mode,
      foreignKeys: Number(foreignKeys.foreign_keys) === 1,
      eventCount: Number(counts.events),
      sessionCount: Number(counts.sessions),
      artifactCount: Number(counts.artifacts),
      memoryPageCount: Number(counts.memory_pages),
      checkpointCount: Number(counts.checkpoints),
      consolidationCount: Number(counts.consolidations),
      latestCheckpointSequence:
        counts.latest_checkpoint === null ? null : Number(counts.latest_checkpoint),
      unresolvedContradictionCount: Number(counts.contradictions),
      memoryRevision: Number(counts.memory_revision),
      archiveBytes: Number(counts.archive_bytes),
      databasePath: this.databasePath,
      archiveRoot: this.archiveRoot,
      cache: this.pageCache.metrics(),
    };
  }

  async verify(): Promise<ContextVmVerificationReportV1> {
    await this.ensureInitialized();
    const database = this.requireDatabase();
    const checks: ContextVmVerificationCheckV1[] = [];
    const integrity = database.prepare("PRAGMA integrity_check").all() as Array<{ integrity_check: string }>;
    checks.push({
      id: "sqlite_integrity",
      status: integrity.every((row) => row.integrity_check === "ok") ? "pass" : "fail",
      summary: integrity.map((row) => row.integrity_check).join("; "),
    });
    const migrationRows = database.prepare(
      "SELECT version, checksum FROM schema_migrations ORDER BY version",
    ).all() as Array<{ version: number; checksum: string }>;
    const migrationsValid =
      migrationRows.length === MIGRATIONS.size &&
      migrationRows.every(({ version, checksum }) =>
        checksum === sha256(MIGRATIONS.get(Number(version)) ?? ""));
    checks.push({
      id: "migration_checksum",
      status: migrationsValid ? "pass" : "fail",
      summary: migrationsValid
        ? `Migrations 1-${DATABASE_SCHEMA_VERSION} checksums match.`
        : "At least one ContextVM migration checksum is missing or mismatched.",
    });
    const status = await this.status();
    checks.push({
      id: "sqlite_configuration",
      status: status.journalMode === "wal" && status.foreignKeys ? "pass" : "fail",
      summary: `journal_mode=${status.journalMode}; foreign_keys=${status.foreignKeys ? "on" : "off"}`,
    });
    const indexCounts = database.prepare(`
      SELECT
        (SELECT COUNT(*) FROM memory_pages) AS pages,
        (SELECT COUNT(*) FROM memory_fts) AS indexed
    `).get() as { pages: number; indexed: number };
    checks.push({
      id: "retrieval_index",
      status: Number(indexCounts.pages) === Number(indexCounts.indexed) ? "pass" : "fail",
      summary: Number(indexCounts.pages) === Number(indexCounts.indexed)
        ? `Indexed ${Number(indexCounts.indexed)} memory page(s).`
        : `Retrieval index has ${Number(indexCounts.indexed)} row(s) for ${Number(indexCounts.pages)} memory page(s).`,
    });
    const invalidPack = database.prepare(`
      SELECT id FROM context_packs
      WHERE rendered_tokens > hard_budget_tokens
         OR rendered_artifact_id IS NOT NULL
            AND NOT EXISTS (
              SELECT 1 FROM artifacts WHERE artifacts.id = context_packs.rendered_artifact_id
            )
      LIMIT 1
    `).get();
    checks.push({
      id: "context_pack_integrity",
      status: invalidPack ? "fail" : "pass",
      summary: invalidPack
        ? "At least one context pack exceeds its budget or references missing evidence."
        : "Context-pack budgets and rendered evidence references are valid.",
    });
    const invalidInvocation = database.prepare(`
      SELECT invocation_id
      FROM context_invocation_audit audit
      WHERE NOT json_valid(audit.ordered_context_pack_ids_json)
         OR EXISTS (
           SELECT 1
           FROM json_each(audit.ordered_context_pack_ids_json) ordered_pack
           WHERE NOT EXISTS (
             SELECT 1 FROM context_packs
             WHERE context_packs.id = ordered_pack.value
           )
         )
         OR audit.checkpoint_id IS NOT NULL
            AND NOT EXISTS (
              SELECT 1 FROM state_checkpoints
              WHERE state_checkpoints.id = audit.checkpoint_id
            )
         OR EXISTS (
           SELECT 1
           FROM context_pack_decisions decision
           WHERE decision.invocation_id = audit.invocation_id
             AND (
               NOT json_valid(decision.decision_json)
               OR NOT EXISTS (
                 SELECT 1 FROM context_packs
                 WHERE context_packs.id = decision.context_pack_id
               )
             )
         )
      LIMIT 1
    `).get();
    checks.push({
      id: "invocation_audit_integrity",
      status: invalidInvocation ? "fail" : "pass",
      summary: invalidInvocation
        ? "At least one invocation audit references missing or malformed evidence."
        : "Invocation decisions, ordered context packs, and checkpoints are referentially valid.",
    });
    const invalidProviderAttempt = database.prepare(`
      SELECT attempt_id
      FROM context_provider_attempts attempt
      WHERE NOT json_valid(attempt.context_pack_ids_json)
         OR length(attempt.context_hash) != 64
         OR attempt.result_hash IS NOT NULL AND length(attempt.result_hash) != 64
         OR EXISTS (
           SELECT 1 FROM json_each(attempt.context_pack_ids_json) pack
           WHERE NOT EXISTS (
             SELECT 1 FROM context_packs WHERE context_packs.id = pack.value
           )
         )
         OR attempt.status = 'completed' AND attempt.completed_at IS NULL
      LIMIT 1
    `).get();
    checks.push({
      id: "provider_attempt_integrity",
      status: invalidProviderAttempt ? "fail" : "pass",
      summary: invalidProviderAttempt
        ? "At least one provider attempt has malformed or missing context evidence."
        : "Provider attempts have valid context lineage, hashes, and terminal timestamps.",
    });
    let checkpointFailure = "";
    for (const row of database.prepare(`
      SELECT * FROM state_checkpoints
      ORDER BY session_id, captured_through_sequence
    `).all() as Array<{
      id: string;
      session_id: string;
      captured_through_sequence: number;
      source_start_sequence: number;
      source_end_sequence: number;
      reducer_version: string;
      state_json: string;
      state_hash: string;
      reason: ContextVmStateCheckpointV1["reason"];
      checkpoint_event_id: string;
      created_at: string;
    }>) {
      try {
        const state = JSON.parse(row.state_json);
        parseContextVmStateCheckpointV1({
          schemaVersion: 1,
          id: row.id,
          sessionId: row.session_id,
          capturedThroughSequence: Number(row.captured_through_sequence),
          sourceEventRange: {
            start: Number(row.source_start_sequence),
            end: Number(row.source_end_sequence),
          },
          reducerVersion: row.reducer_version,
          state,
          stateHash: row.state_hash,
          reason: row.reason,
          createdAt: row.created_at,
        });
        if (sha256(canonical(state)) !== row.state_hash) {
          throw new Error("state hash mismatch");
        }
        if (!database.prepare(
          "SELECT 1 FROM events WHERE id = ? AND kind = 'checkpoint'",
        ).get(row.checkpoint_event_id)) {
          throw new Error("checkpoint audit event is missing");
        }
      } catch (error) {
        checkpointFailure = `Checkpoint ${row.id} is invalid: ${
          error instanceof Error ? error.message : String(error)
        }`;
        break;
      }
    }
    checks.push({
      id: "checkpoint_integrity",
      status: checkpointFailure ? "fail" : "pass",
      summary: checkpointFailure ||
        `Verified ${status.checkpointCount} immutable checkpoint(s).`,
    });
    const invalidConsolidation = database.prepare(`
      SELECT co.memory_id
      FROM consolidation_outputs co
      LEFT JOIN memory_pages mp ON mp.id = co.memory_id
      WHERE mp.id IS NULL
         OR mp.producer <> 'contextvm-consolidator-v1'
         OR EXISTS (
           SELECT 1 FROM memory_sources ms
           WHERE ms.memory_id = co.memory_id AND ms.source_type <> 'event'
         )
      LIMIT 1
    `).get();
    checks.push({
      id: "consolidation_provenance",
      status: invalidConsolidation ? "fail" : "pass",
      summary: invalidConsolidation
        ? "A consolidated page is missing or lacks direct raw-event provenance."
        : `Verified ${status.consolidationCount} consolidation run(s) without summary-of-summary.`,
    });
    const gap = database.prepare(`
      SELECT session_id FROM events GROUP BY session_id
      HAVING MIN(sequence_no) <> 1 OR MAX(sequence_no) <> COUNT(*)
      LIMIT 1
    `).get();
    checks.push({
      id: "event_sequences",
      status: gap ? "fail" : "pass",
      summary: gap ? "At least one session has a non-contiguous event sequence." : "All event sequences are contiguous.",
    });
    const eventArtifacts = new Map<string, ContextVmArtifactRefV1[]>();
    for (const row of database.prepare(`
      SELECT ea.event_id, ea.position, ea.media_type, ea.sensitivity, ea.label, a.*
      FROM event_artifacts ea JOIN artifacts a ON a.id = ea.artifact_id
      ORDER BY ea.event_id, ea.position
    `).all() as Array<{
      event_id: string; label: string | null; id: string; sha256: string;
      media_type: string; sensitivity: string; encoding: string;
      uncompressed_bytes: number; stored_bytes: number;
    }>) {
      const refs = eventArtifacts.get(row.event_id) ?? [];
      refs.push({
        id: contextVmArtifactId(row.id),
        sha256: row.sha256,
        mediaType: row.media_type,
        sensitivity: row.sensitivity as ContextVmArtifactRefV1["sensitivity"],
        encoding: row.encoding as ContextVmArtifactRefV1["encoding"],
        uncompressedBytes: Number(row.uncompressed_bytes),
        storedBytes: Number(row.stored_bytes),
        ...(row.label ? { label: row.label } : {}),
      });
      eventArtifacts.set(row.event_id, refs);
    }
    const eventParents = new Map<string, ContextVmEventId[]>();
    for (const row of database.prepare(
      "SELECT event_id, parent_event_id FROM event_parents ORDER BY event_id, parent_event_id",
    ).all() as Array<{ event_id: string; parent_event_id: string }>) {
      const parents = eventParents.get(row.event_id) ?? [];
      parents.push(contextVmEventId(row.parent_event_id));
      eventParents.set(row.event_id, parents);
    }
    let eventHashFailure = "";
    for (const row of database.prepare("SELECT * FROM events ORDER BY session_id, sequence_no").all() as unknown as EventRow[]) {
      const calculated = eventContentHash({
        sessionId: row.session_id,
        taskId: row.task_id ?? undefined,
        source: {
          kind: row.source_kind as NewContextVmEventV1["source"]["kind"],
          id: row.source_id,
        },
        occurredAt: row.occurred_at,
        actor: JSON.parse(row.actor_json),
        kind: row.kind as NewContextVmEventV1["kind"],
        payload: JSON.parse(row.payload_json),
        artifacts: eventArtifacts.get(row.id) ?? [],
        parentEventIds: eventParents.get(row.id) ?? [],
        sensitivity: row.sensitivity as NewContextVmEventV1["sensitivity"],
        redaction: JSON.parse(row.redaction_json),
      });
      if (calculated !== row.content_hash) {
        eventHashFailure = `Event hash mismatch: ${row.id}`;
        break;
      }
    }
    checks.push({
      id: "event_hashes",
      status: eventHashFailure ? "fail" : "pass",
      summary: eventHashFailure || `Verified ${status.eventCount} event content hash(es).`,
    });
    const missingSources = database.prepare(`
      SELECT id FROM memory_pages
      WHERE NOT EXISTS (
        SELECT 1 FROM memory_sources WHERE memory_sources.memory_id = memory_pages.id
      )
      LIMIT 1
    `).get();
    checks.push({
      id: "memory_provenance",
      status: missingSources ? "fail" : "pass",
      summary: missingSources
        ? "At least one memory page has no provenance source."
        : `All ${status.memoryPageCount} memory page(s) have provenance.`,
    });
    const danglingSource = database.prepare(`
      SELECT memory_id FROM memory_sources
      WHERE
        (source_type = 'event' AND NOT EXISTS (
          SELECT 1 FROM events WHERE events.id = memory_sources.source_id
        ))
        OR
        (source_type = 'artifact' AND NOT EXISTS (
          SELECT 1 FROM artifacts WHERE artifacts.id = memory_sources.source_id
        ))
        OR
        (source_type = 'memory' AND NOT EXISTS (
          SELECT 1 FROM memory_pages WHERE memory_pages.id = memory_sources.source_id
        ))
      LIMIT 1
    `).get();
    checks.push({
      id: "memory_source_references",
      status: danglingSource ? "fail" : "pass",
      summary: danglingSource
        ? "At least one memory provenance source is dangling."
        : "All memory provenance sources resolve.",
    });
    const invalidValidity = database.prepare(`
      SELECT id FROM memory_pages
      WHERE valid_until IS NOT NULL AND valid_until < valid_from
      LIMIT 1
    `).get();
    checks.push({
      id: "memory_validity",
      status: invalidValidity ? "fail" : "pass",
      summary: invalidValidity
        ? "At least one memory validity interval is inverted."
        : "Memory validity intervals are ordered.",
    });
    const supersessionCycle = database.prepare(`
      WITH RECURSIVE chain(origin, current) AS (
        SELECT id, superseded_by FROM memory_pages WHERE superseded_by IS NOT NULL
        UNION ALL
        SELECT chain.origin, memory_pages.superseded_by
        FROM chain JOIN memory_pages ON memory_pages.id = chain.current
        WHERE memory_pages.superseded_by IS NOT NULL
      )
      SELECT origin FROM chain WHERE origin = current LIMIT 1
    `).get();
    checks.push({
      id: "memory_supersession_cycles",
      status: supersessionCycle ? "fail" : "pass",
      summary: supersessionCycle
        ? "A memory supersession cycle exists."
        : "No memory supersession cycles.",
    });
    const invalidContradiction = database.prepare(`
      SELECT c.id FROM memory_contradictions c
      JOIN memory_pages left_page ON left_page.id = c.left_memory_id
      JOIN memory_pages right_page ON right_page.id = c.right_memory_id
      WHERE
        c.left_memory_id = c.right_memory_id
        OR left_page.namespace <> c.namespace
        OR right_page.namespace <> c.namespace
        OR left_page.subject <> c.subject
        OR right_page.subject <> c.subject
        OR left_page.predicate <> c.predicate
        OR right_page.predicate <> c.predicate
        OR (c.status = 'resolved' AND c.resolution_memory_id IS NULL)
        OR (c.status = 'unresolved' AND c.resolution_memory_id IS NOT NULL)
      LIMIT 1
    `).get();
    checks.push({
      id: "memory_contradictions",
      status: invalidContradiction ? "fail" : "pass",
      summary: invalidContradiction
        ? "At least one contradiction record is inconsistent."
        : `${status.unresolvedContradictionCount} unresolved contradiction(s); records are consistent.`,
    });

    let artifactFailure = "";
    const referencedKeys = new Set<string>();
    const artifacts = database.prepare("SELECT * FROM artifacts ORDER BY id").all() as Array<{
      id: string; sha256: string; encoding: string; archive_key: string;
    }>;
    for (const artifact of artifacts) {
      referencedKeys.add(artifact.archive_key);
      try {
        const stored = await readFile(path.join(this.root, artifact.archive_key));
        const bytes = artifact.encoding === "zstd"
          ? await decompressZstd(stored)
          : stored;
        if (sha256(bytes) !== artifact.sha256) {
          artifactFailure = `Artifact hash mismatch: ${artifact.id}`;
          break;
        }
      } catch (error) {
        artifactFailure = `Artifact unavailable: ${artifact.id}: ${error instanceof Error ? error.message : String(error)}`;
        break;
      }
    }
    checks.push({
      id: "archive_integrity",
      status: artifactFailure ? "fail" : "pass",
      summary: artifactFailure || `Verified ${artifacts.length} archive object(s).`,
    });
    const archiveKeys = await this.archiveKeys();
    const orphanCount = archiveKeys.filter((key) => !referencedKeys.has(key)).length;
    checks.push({
      id: "archive_orphans",
      status: orphanCount > 0 ? "warn" : "pass",
      summary: orphanCount > 0
        ? `${orphanCount} unreferenced archive object(s) remain; no object was deleted.`
        : "No unreferenced archive objects.",
    });
    return {
      schemaVersion: 1,
      status: checks.some(({ status: checkStatus }) => checkStatus === "fail") ? "fail" : "pass",
      checkedAt: this.now(),
      checks,
      eventCount: status.eventCount,
      artifactCount: status.artifactCount,
      orphanArtifactCount: orphanCount,
      memoryPageCount: status.memoryPageCount,
      unresolvedContradictionCount: status.unresolvedContradictionCount,
    };
  }

  close(): void {
    this.pageCache.clear();
    this.database?.close();
    this.database = undefined;
    this.initializing = undefined;
  }

  private async ensureInitialized(): Promise<void> {
    this.initializing ??= this.initializeInternal();
    return this.initializing;
  }

  private async initializeInternal(): Promise<void> {
    await mkdir(path.dirname(this.databasePath), { recursive: true, mode: 0o700 });
    await mkdir(this.archiveRoot, { recursive: true, mode: 0o700 });
    await chmod(this.root, 0o700).catch(() => undefined);
    await chmod(path.dirname(this.databasePath), 0o700).catch(() => undefined);
    await chmod(this.archiveRoot, 0o700).catch(() => undefined);
    const database = openSqliteDatabase(this.databasePath);
    try {
      database.exec("PRAGMA journal_mode=WAL");
      database.exec("PRAGMA foreign_keys=ON");
      database.exec("PRAGMA synchronous=FULL");
      database.exec("PRAGMA busy_timeout=5000");
      await chmod(this.databasePath, 0o600).catch(() => undefined);
      await chmod(`${this.databasePath}-wal`, 0o600).catch(() => undefined);
      await chmod(`${this.databasePath}-shm`, 0o600).catch(() => undefined);
      const hasMigrations = database.prepare(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'",
      ).get();
      if (!hasMigrations) {
        database.exec("BEGIN IMMEDIATE");
        try {
          database.exec(MIGRATION_1);
          database.prepare(
            "INSERT INTO schema_migrations (version, checksum, applied_at) VALUES (?, ?, ?)",
          ).run(1, sha256(MIGRATION_1), this.now());
          database.exec("COMMIT");
        } catch (error) {
          database.exec("ROLLBACK");
          throw error;
        }
      }
      for (const [version, sql] of MIGRATIONS) {
        const migration = database.prepare(
          "SELECT checksum FROM schema_migrations WHERE version = ?",
        ).get(version) as { checksum: string } | undefined;
        if (migration && migration.checksum !== sha256(sql)) {
          throw new ContextVmFailure(
            "schema_unsupported",
            `ContextVM migration ${version} checksum does not match this build`,
          );
        }
        if (!migration) {
          database.exec("BEGIN IMMEDIATE");
          try {
            database.exec(sql);
            database.prepare(
              "INSERT INTO schema_migrations (version, checksum, applied_at) VALUES (?, ?, ?)",
            ).run(version, sha256(sql), this.now());
            database.exec("COMMIT");
          } catch (error) {
            database.exec("ROLLBACK");
            throw error;
          }
        }
      }
      this.database = database;
    } catch (error) {
      database.close();
      throw error;
    }
  }

  private requireDatabase(): SqliteDatabase {
    if (!this.database) throw new ContextVmFailure("not_initialized", "ContextVM is not initialized");
    return this.database;
  }

  private async prepareArtifact(
    input: ContextVmArtifactInputV1,
    index: number,
  ): Promise<{ artifact: StoredArtifact; redaction: RedactionMetadata }> {
    if (!input.mediaType.trim() || input.mediaType.length > 200) {
      throw new ContextVmFailure("invalid_input", "ContextVM artifact media type is invalid");
    }
    let bytes = Buffer.from(input.bytes);
    let redaction: RedactionMetadata = { applied: false, redactedPaths: [], policyVersion: 2, redactionCount: 0, categories: [] };
    if (input.mediaType.startsWith("text/") || input.mediaType === "application/json") {
      const result = redactSensitiveText(bytes.toString("utf8"));
      bytes = Buffer.from(result.value, "utf8");
      redaction = {
        ...result.redaction,
        redactedPaths: result.redaction.redactedPaths.map(() => `artifacts[${index}]`),
      };
    }
    const digest = sha256(bytes);
    const id = contextVmArtifactId(`artifact_sha256_${digest}`);
    const compressed = bytes.length >= COMPRESSION_THRESHOLD
      ? Buffer.from(await compressZstd(bytes))
      : undefined;
    const useCompression = Boolean(compressed && compressed.length <= bytes.length * 0.9);
    const storedBytes = useCompression ? compressed! : bytes;
    const encoding = useCompression ? "zstd" as const : "identity" as const;
    const relative = path.join("archive", "sha256", digest.slice(0, 2), `${digest}.${encoding === "zstd" ? "zst" : "bin"}`);
    const target = path.join(this.root, relative);
    if (!(await exists(target))) {
      await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
      await atomicWriteFileDurable(target, storedBytes);
      await chmod(target, 0o600);
    } else {
      const existing = await readFile(target);
      if (!existing.equals(storedBytes)) {
        throw new ContextVmFailure("archive_failure", `ContextVM archive collision: ${digest}`);
      }
    }
    const label = input.label
      ? redactSensitiveText(input.label).value.slice(0, 500)
      : undefined;
    return {
      artifact: {
        ref: {
          id,
          sha256: digest,
          mediaType: input.mediaType,
          sensitivity: input.sensitivity,
          encoding,
          uncompressedBytes: bytes.length,
          storedBytes: storedBytes.length,
          ...(label ? { label } : {}),
        },
        archiveKey: relative,
        storedBytes,
      },
      redaction,
    };
  }

  private loadEvent(database: SqliteDatabase, id: string): ContextVmEventV1 | undefined {
    const row = database.prepare("SELECT * FROM events WHERE id = ?").get(id) as EventRow | undefined;
    return row ? this.eventFromRow(database, row) : undefined;
  }

  private hydrateEventRows(
    database: SqliteDatabase,
    rows: EventRow[],
  ): ContextVmEventV1[] {
    if (rows.length === 0) return [];
    const sessionId = rows[0]!.session_id;
    const first = Number(rows[0]!.sequence_no);
    const last = Number(rows.at(-1)!.sequence_no);
    const artifactRows = database.prepare(`
      SELECT ea.event_id, a.*, ea.media_type, ea.sensitivity, ea.label
      FROM events e
      JOIN event_artifacts ea ON ea.event_id = e.id
      JOIN artifacts a ON a.id = ea.artifact_id
      WHERE e.session_id = ? AND e.sequence_no BETWEEN ? AND ?
      ORDER BY ea.event_id, ea.position
    `).all(sessionId, first, last) as Array<{
      event_id: string;
      id: string; sha256: string; media_type: string; sensitivity: string;
      encoding: string; uncompressed_bytes: number; stored_bytes: number;
      label: string | null;
    }>;
    const artifacts = new Map<string, typeof artifactRows>();
    for (const artifact of artifactRows) {
      const values = artifacts.get(artifact.event_id) ?? [];
      values.push(artifact);
      artifacts.set(artifact.event_id, values);
    }
    const parentRows = database.prepare(`
      SELECT ep.event_id, ep.parent_event_id
      FROM events e JOIN event_parents ep ON ep.event_id = e.id
      WHERE e.session_id = ? AND e.sequence_no BETWEEN ? AND ?
      ORDER BY ep.event_id, ep.parent_event_id
    `).all(sessionId, first, last) as Array<{
      event_id: string;
      parent_event_id: string;
    }>;
    const parents = new Map<string, string[]>();
    for (const parent of parentRows) {
      const values = parents.get(parent.event_id) ?? [];
      values.push(parent.parent_event_id);
      parents.set(parent.event_id, values);
    }
    return rows.map((row) =>
      this.eventFromRow(
        database,
        row,
        artifacts.get(row.id) ?? [],
        parents.get(row.id) ?? [],
      ));
  }

  private eventFromRow(
    database: SqliteDatabase,
    row: EventRow,
    hydratedArtifacts?: Array<{
      id: string; sha256: string; media_type: string; sensitivity: string;
      encoding: string; uncompressed_bytes: number; stored_bytes: number;
      label: string | null;
    }>,
    hydratedParents?: string[],
  ): ContextVmEventV1 {
    const artifacts = hydratedArtifacts ?? database.prepare(`
      SELECT a.*, ea.media_type, ea.sensitivity, ea.label FROM event_artifacts ea
      JOIN artifacts a ON a.id = ea.artifact_id
      WHERE ea.event_id = ? ORDER BY ea.position
    `).all(row.id) as Array<{
      id: string; sha256: string; media_type: string; sensitivity: string; encoding: string;
      uncompressed_bytes: number; stored_bytes: number; label: string | null;
    }>;
    const parents = hydratedParents ?? (database.prepare(
      "SELECT parent_event_id FROM event_parents WHERE event_id = ? ORDER BY parent_event_id",
    ).all(row.id) as Array<{ parent_event_id: string }>)
      .map(({ parent_event_id }) => parent_event_id);
    return parseContextVmEventV1({
      schemaVersion: 1,
      id: contextVmEventId(row.id),
      sessionId: contextVmSessionId(row.session_id),
      ...(row.task_id ? { taskId: contextVmTaskId(row.task_id) } : {}),
      sequenceNo: Number(row.sequence_no),
      source: { kind: row.source_kind, id: row.source_id },
      occurredAt: row.occurred_at,
      recordedAt: row.recorded_at,
      actor: JSON.parse(row.actor_json),
      kind: row.kind,
      payload: JSON.parse(row.payload_json),
      artifacts: artifacts.map((artifact) => ({
        id: contextVmArtifactId(artifact.id),
        sha256: artifact.sha256,
        mediaType: artifact.media_type,
        sensitivity: artifact.sensitivity,
        encoding: artifact.encoding,
        uncompressedBytes: Number(artifact.uncompressed_bytes),
        storedBytes: Number(artifact.stored_bytes),
        ...(artifact.label ? { label: artifact.label } : {}),
      })),
      parentEventIds: parents.map((parentId) => contextVmEventId(parentId)),
      contentHash: row.content_hash,
      sensitivity: row.sensitivity,
      redaction: JSON.parse(row.redaction_json),
    });
  }

  private newMemoryId(seed: string): ContextVmMemoryId {
    const digest = /^[0-9a-f]{64}$/u.test(seed) ? seed : sha256(seed);
    return contextVmMemoryId(`mem_${digest.slice(0, 10)}_${digest.slice(10, 34)}`);
  }

  private validateMemorySources(
    database: SqliteDatabase,
    sources: NewContextVmMemoryPageV1["sources"],
  ): void {
    for (const source of sources) {
      const found =
        source.type === "event"
          ? database.prepare("SELECT 1 FROM events WHERE id = ?").get(source.eventId)
          : source.type === "artifact"
            ? database.prepare("SELECT 1 FROM artifacts WHERE id = ?").get(source.artifactId)
            : database.prepare("SELECT 1 FROM memory_pages WHERE id = ?").get(source.memoryId);
      if (!found) {
        throw new ContextVmFailure(
          "invalid_input",
          `ContextVM memory source does not exist: ${
            source.type === "event"
              ? source.eventId
              : source.type === "artifact"
                ? source.artifactId
                : source.memoryId
          }`,
        );
      }
    }
  }

  private mergeMemorySources(
    database: SqliteDatabase,
    memoryId: ContextVmMemoryId,
    sources: NewContextVmMemoryPageV1["sources"],
  ): void {
    const existing = database.prepare(`
      SELECT source_type, source_id, locator FROM memory_sources
      WHERE memory_id = ?
    `).all(memoryId) as Array<{
      source_type: string;
      source_id: string;
      locator: string | null;
    }>;
    const keys = new Set(existing.map((source) =>
      `${source.source_type}:${source.source_id}:${source.locator ?? ""}`));
    let position = existing.length;
    for (const source of sources) {
      const sourceId =
        source.type === "event"
          ? source.eventId
          : source.type === "artifact"
            ? source.artifactId
            : source.memoryId;
      const locator = source.type === "artifact" ? source.locator ?? null : null;
      const key = `${source.type}:${sourceId}:${locator ?? ""}`;
      if (keys.has(key)) continue;
      database.prepare(`
        INSERT INTO memory_sources
          (memory_id, position, source_type, source_id, locator)
        VALUES (?, ?, ?, ?, ?)
      `).run(memoryId, position, source.type, sourceId, locator);
      keys.add(key);
      position += 1;
    }
  }

  private validateMemoryRelations(
    database: SqliteDatabase,
    id: ContextVmMemoryId,
    relations: NewContextVmMemoryPageV1["relations"],
  ): void {
    for (const relation of relations) {
      if (relation.targetMemoryId === id) {
        throw new ContextVmFailure("invalid_input", "ContextVM memory relation cannot target itself");
      }
      if (!database.prepare("SELECT 1 FROM memory_pages WHERE id = ?").get(relation.targetMemoryId)) {
        throw new ContextVmFailure(
          "invalid_input",
          `ContextVM relation target does not exist: ${relation.targetMemoryId}`,
        );
      }
      if (relation.type === "supersedes") {
        const reachesOrigin = database.prepare(`
          WITH RECURSIVE chain(id) AS (
            SELECT superseded_by FROM memory_pages WHERE id = ?
            UNION ALL
            SELECT memory_pages.superseded_by
            FROM chain JOIN memory_pages ON memory_pages.id = chain.id
            WHERE memory_pages.superseded_by IS NOT NULL
          )
          SELECT 1 FROM chain WHERE id = ? LIMIT 1
        `).get(relation.targetMemoryId, id);
        if (reachesOrigin) {
          throw new ContextVmFailure("invalid_input", "ContextVM supersession cycle rejected");
        }
      }
    }
  }

  private insertMemoryPage(
    database: SqliteDatabase,
    page: Omit<ContextVmMemoryPageV1, "schemaVersion">,
    current: number,
    legacyKey?: string,
  ): void {
    database.prepare(`
      INSERT INTO memory_pages
        (id, legacy_key, namespace, kind, status, summary, content_json,
         normalized_content, subject, predicate, valid_from, valid_until,
         superseded_by, confidence, importance, evidence_priority, producer,
         created_at, updated_at, token_count, content_hash, current, sensitivity,
         owner_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      page.id,
      legacyKey ?? null,
      page.namespace,
      page.kind,
      page.status,
      page.summary,
      canonical(page.content),
      page.normalizedContent,
      page.subject ?? null,
      page.predicate ?? null,
      page.validFrom,
      page.validUntil ?? null,
      page.supersededBy ?? null,
      page.confidence,
      page.importance,
      page.evidencePriority,
      page.producer,
      page.createdAt,
      page.updatedAt,
      page.tokenCount,
      page.contentHash,
      current,
      page.sensitivity ?? "internal",
      page.ownerId ?? null,
    );
    page.sources.forEach((source, position) => {
      database.prepare(`
        INSERT INTO memory_sources
          (memory_id, position, source_type, source_id, locator)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        page.id,
        position,
        source.type,
        source.type === "event"
          ? source.eventId
          : source.type === "artifact"
            ? source.artifactId
            : source.memoryId,
        source.type === "artifact" ? source.locator ?? null : null,
      );
    });
    for (const entityId of page.entityIds) {
      database.prepare(
        "INSERT INTO memory_entities (memory_id, entity_id) VALUES (?, ?)",
      ).run(page.id, entityId);
    }
    for (const taskId of page.taskIds) {
      database.prepare(
        "INSERT INTO memory_tasks (memory_id, task_id) VALUES (?, ?)",
      ).run(page.id, taskId);
    }
    for (const relation of page.relations) {
      database.prepare(`
        INSERT INTO memory_relations (memory_id, relation_type, target_memory_id)
        VALUES (?, ?, ?)
      `).run(page.id, relation.type, relation.targetMemoryId);
    }
    this.indexMemoryPage(database, page);
  }

  private indexMemoryPage(
    database: SqliteDatabase,
    page: Pick<
      ContextVmMemoryPageV1,
      "id" | "summary" | "normalizedContent" | "subject" | "predicate"
    >,
  ): void {
    const identifiers = memoryIdentifiers(page);
    database.prepare("DELETE FROM memory_fts WHERE memory_id = ?").run(page.id);
    database.prepare("DELETE FROM memory_identifiers WHERE memory_id = ?").run(page.id);
    database.prepare(`
      INSERT INTO memory_fts
        (memory_id, summary, normalized_content, subject, predicate, identifiers)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      page.id,
      page.summary,
      page.normalizedContent,
      page.subject ?? "",
      page.predicate ?? "",
      identifiers.map(({ value }) => value).join(" "),
    );
    for (const identifier of identifiers) {
      database.prepare(`
        INSERT OR IGNORE INTO memory_identifiers
          (memory_id, kind, value, search_key) VALUES (?, ?, ?, ?)
      `).run(page.id, identifier.kind, identifier.value, identifier.searchKey);
    }
  }

  private cachedMemoryPage(
    database: SqliteDatabase,
    row: MemoryPageRow,
    signals: ContextVmCacheSignals = {},
  ): { page: ContextVmMemoryPageV1; cacheHit: boolean } {
    const id = contextVmMemoryId(row.id);
    const cached = this.pageCache.get(id, row.content_hash);
    if (cached) return { page: cached, cacheHit: true };
    const page = this.memoryPageFromRow(database, row);
    this.pageCache.put(page, signals);
    return { page, cacheHit: false };
  }

  private memoryPageFromRow(
    database: SqliteDatabase,
    row: MemoryPageRow,
  ): ContextVmMemoryPageV1 {
    const sources = database.prepare(`
      SELECT source_type, source_id, locator FROM memory_sources
      WHERE memory_id = ? ORDER BY position
    `).all(row.id) as Array<{
      source_type: "event" | "artifact" | "memory";
      source_id: string;
      locator: string | null;
    }>;
    const entities = database.prepare(
      "SELECT entity_id FROM memory_entities WHERE memory_id = ? ORDER BY entity_id",
    ).all(row.id) as Array<{ entity_id: string }>;
    const tasks = database.prepare(
      "SELECT task_id FROM memory_tasks WHERE memory_id = ? ORDER BY task_id",
    ).all(row.id) as Array<{ task_id: string }>;
    const relations = database.prepare(`
      SELECT relation_type, target_memory_id FROM memory_relations
      WHERE memory_id = ? ORDER BY relation_type, target_memory_id
    `).all(row.id) as Array<{ relation_type: ContextVmMemoryPageV1["relations"][number]["type"]; target_memory_id: string }>;
    return {
      schemaVersion: 1,
      id: contextVmMemoryId(row.id),
      namespace: row.namespace,
      kind: row.kind as ContextVmMemoryPageV1["kind"],
      status: row.status as ContextVmMemoryPageV1["status"],
      summary: row.summary,
      content: JSON.parse(row.content_json),
      normalizedContent: row.normalized_content,
      ...(row.subject ? { subject: row.subject } : {}),
      ...(row.predicate ? { predicate: row.predicate } : {}),
      sources: sources.map((source) =>
        source.source_type === "event"
          ? { type: "event", eventId: contextVmEventId(source.source_id) }
          : source.source_type === "artifact"
            ? {
                type: "artifact",
                artifactId: contextVmArtifactId(source.source_id),
                ...(source.locator ? { locator: source.locator } : {}),
              }
            : { type: "memory", memoryId: contextVmMemoryId(source.source_id) }),
      entityIds: entities.map(({ entity_id }) => entity_id),
      taskIds: tasks.map(({ task_id }) => contextVmTaskId(task_id)),
      relations: relations.map((relation) => ({
        type: relation.relation_type,
        targetMemoryId: contextVmMemoryId(relation.target_memory_id),
      })),
      validFrom: row.valid_from,
      ...(row.valid_until ? { validUntil: row.valid_until } : {}),
      ...(row.superseded_by
        ? { supersededBy: contextVmMemoryId(row.superseded_by) }
        : {}),
      confidence: Number(row.confidence),
      importance: Number(row.importance),
      evidencePriority: row.evidence_priority as ContextVmMemoryPageV1["evidencePriority"],
      producer: row.producer,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      tokenCount: Number(row.token_count),
      contentHash: row.content_hash,
      sensitivity: row.sensitivity as NonNullable<ContextVmMemoryPageV1["sensitivity"]>,
      ...(row.owner_id ? { ownerId: row.owner_id } : {}),
    };
  }

  private memoryItemCount(envelope: MemoryStoreEnvelopeV2): number {
    return envelope.episodes.length +
      envelope.candidateRules.length +
      envelope.semanticMemory.length;
  }

  private writeMemoryEnvelope(
    database: SqliteDatabase,
    envelope: MemoryStoreEnvelopeV2,
    sourceArtifact: ContextVmArtifactRefV1,
    operation: string,
  ): void {
    const normalizedEnvelope = jsonValue(
      envelope,
      "ContextVM memory envelope",
    ) as MemoryStoreEnvelopeV2;
    database.prepare(`
      INSERT INTO memory_state
        (singleton, revision, envelope_json, updated_at, source_artifact_id)
      VALUES (1, ?, ?, ?, ?)
      ON CONFLICT(singleton) DO UPDATE SET
        revision = excluded.revision,
        envelope_json = excluded.envelope_json,
        updated_at = excluded.updated_at,
        source_artifact_id = excluded.source_artifact_id
    `).run(
      normalizedEnvelope.revision,
      canonical(normalizedEnvelope),
      normalizedEnvelope.updatedAt,
      sourceArtifact.id,
    );
    this.syncLegacyMemoryPages(database, normalizedEnvelope, sourceArtifact);
    database.prepare(`
      INSERT INTO memory_audit (operation, revision, occurred_at, details_json)
      VALUES (?, ?, ?, ?)
    `).run(
      operation,
      normalizedEnvelope.revision,
      normalizedEnvelope.updatedAt,
      canonical({
        sourceArtifactId: sourceArtifact.id,
        itemCount: this.memoryItemCount(normalizedEnvelope),
      }),
    );
  }

  private syncLegacyMemoryPages(
    database: SqliteDatabase,
    envelope: MemoryStoreEnvelopeV2,
    sourceArtifact: ContextVmArtifactRefV1,
  ): void {
    const items = [
      ...envelope.episodes.map((value) => ({
        legacyKey: `episode:${value.id}`,
        value,
        kind: value.kind === "verifier_failure_pattern"
          ? "failure_pattern" as const
          : "episode" as const,
        status: "active" as const,
        summary: value.summary,
        confidence: value.confidence,
        validFrom: value.createdAt,
        validUntil: value.expiresAt,
        namespace: canonical(value.namespace),
        evidencePriority: "derived_state" as const,
      })),
      ...envelope.candidateRules.map((value) => ({
        legacyKey: `candidate_rule:${value.id}`,
        value,
        kind: "procedure" as const,
        status: value.status === "accepted"
          ? "accepted" as const
          : value.status,
        summary: `${value.title}: ${value.rule}`,
        confidence: value.evidence.length > 0
          ? Math.max(...value.evidence.map(({ confidence }) => confidence))
          : 0,
        validFrom: value.createdAt,
        validUntil: value.status === "superseded" ? value.updatedAt : undefined,
        namespace: canonical(value.namespace),
        evidencePriority: value.status === "accepted"
          ? "accepted_decision" as const
          : "derived_state" as const,
      })),
      ...envelope.semanticMemory.map((value) => ({
        legacyKey: `semantic_memory:${value.id}`,
        value,
        kind: "fact" as const,
        status: value.status === "approved"
          ? "active" as const
          : value.status,
        summary: value.summary,
        confidence: value.confidence,
        validFrom: value.createdAt,
        validUntil: value.deletedAt,
        namespace: canonical(value.namespace),
        evidencePriority: value.activation?.basis === "explicit_user_preference"
          ? "current_user" as const
          : value.activation?.basis === "verifier_backed_fact"
            ? "verified_tool" as const
            : "derived_state" as const,
      })),
    ];
    const activeKeys = new Set(items.map(({ legacyKey }) => legacyKey));
    for (const item of items) {
      const normalizedValue = jsonValue(
        item.value,
        `ContextVM legacy memory ${item.legacyKey}`,
      );
      const content = canonical(normalizedValue);
      const hash = sha256(content);
      const existing = database.prepare(
        "SELECT * FROM memory_pages WHERE legacy_key = ? AND current = 1",
      ).get(item.legacyKey) as MemoryPageRow | undefined;
      if (existing?.content_hash === hash) continue;
      const id = this.newMemoryId(`${item.legacyKey}:${hash}`);
      const itemUpdatedAt =
        "updatedAt" in item.value
          ? item.value.updatedAt
          : item.value.createdAt;
      if (existing) {
        database.prepare(`
          UPDATE memory_pages
          SET current = 0, valid_until = ?, superseded_by = ?, updated_at = ?
          WHERE id = ?
        `).run(itemUpdatedAt, id, envelope.updatedAt, existing.id);
      }
      this.insertMemoryPage(database, {
        id,
        namespace: item.namespace,
        kind: item.kind,
        status: item.status,
        summary: item.summary,
        content: normalizedValue,
        normalizedContent: content,
        sources: [{
          type: "artifact",
          artifactId: sourceArtifact.id,
          locator: item.legacyKey,
        }],
        entityIds: [],
        taskIds: [],
        relations: existing
          ? [{ type: "supersedes", targetMemoryId: contextVmMemoryId(existing.id) }]
          : [],
        validFrom: item.validFrom,
        ...(item.validUntil ? { validUntil: item.validUntil } : {}),
        confidence: item.confidence,
        importance: 0.5,
        evidencePriority: item.evidencePriority,
        producer: "orynt-memory-adapter",
        createdAt: item.value.createdAt,
        updatedAt: itemUpdatedAt,
        tokenCount: content.split(/\s+/u).filter(Boolean).length,
        contentHash: hash,
      }, 1, item.legacyKey);
    }
    const currentRows = database.prepare(
      "SELECT id, legacy_key FROM memory_pages WHERE legacy_key IS NOT NULL AND current = 1",
    ).all() as Array<{ id: string; legacy_key: string }>;
    for (const row of currentRows) {
      if (!activeKeys.has(row.legacy_key)) {
        database.prepare(
          "UPDATE memory_pages SET current = 0, valid_until = ?, updated_at = ? WHERE id = ?",
        ).run(envelope.updatedAt, envelope.updatedAt, row.id);
      }
    }
  }

  private async archiveKeys(): Promise<string[]> {
    if (!(await exists(this.archiveRoot))) return [];
    const prefixes = await readdir(this.archiveRoot, { withFileTypes: true });
    const keys: string[] = [];
    for (const prefix of prefixes) {
      if (!prefix.isDirectory()) continue;
      const prefixRoot = path.join(this.archiveRoot, prefix.name);
      for (const item of await readdir(prefixRoot, { withFileTypes: true })) {
        if (item.isFile()) {
          keys.push(path.relative(this.root, path.join(prefixRoot, item.name)));
        }
      }
    }
    return keys;
  }
}

export const CONTEXTVM_DATABASE_SCHEMA_VERSION = DATABASE_SCHEMA_VERSION;
