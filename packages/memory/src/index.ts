import { createHash } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";

import { MEMORY_STORE_SCHEMA_VERSION } from "@codepawl/shared";
import type {
  Actor,
  ArtifactRef,
  CandidateRule,
  CandidateRuleEvidence,
  CandidateRuleQuery,
  CandidateRuleStatus,
  CandidateRuleStatusUpdateOptions,
  CandidateRuleWriteInput,
  CodexResultBundle,
  EpisodeWriteInput,
  EpisodicMemoryItem,
  MemoryExtractionInput,
  MemoryExtractionResult,
  MemoryExtractor,
  MemoryItemKind,
  MemoryMutationOptions,
  MemoryNamespace,
  MemoryProvenance,
  MemoryQuery,
  MemoryRedactionResult,
  MemoryRetrievalHit,
  MemoryRetrievalQuery,
  MemoryRetentionPolicy,
  MemoryStoreEnvelopeV2,
  MemoryTombstone,
  MemoryReviewDecision,
  SemanticMemoryEditInput,
  SemanticMemoryItem,
  SemanticMemoryQuery,
  SemanticMemoryStatusUpdateInput,
  SemanticMemoryWriteInput,
  MemoryStore,
  MemorySummary,
  RunEvent,
  RunStore,
  VerificationEvidence,
  VerificationResult,
} from "@codepawl/shared";

type LegacyMemoryDatabase = {
  episodes: EpisodicMemoryItem[];
  candidateRules: CandidateRule[];
  semanticMemory: SemanticMemoryItem[];
};

type MemoryDatabase = MemoryStoreEnvelopeV2;

type LocalJsonMemoryStoreOptions = {
  memoryRoot?: string;
  storeFileName?: string;
};

type LocalMemoryExtractorOptions = {
  memoryStore: MemoryStore;
  runStore?: RunStore;
  actor?: Actor;
  managedMemoryRoot?: string;
};

export class MemoryStoreFailure extends Error {
  readonly code:
    | "unsafe_path"
    | "episode_not_found"
    | "candidate_rule_not_found"
    | "semantic_memory_not_found"
    | "invalid_status_transition"
    | "revision_conflict"
    | "not_restorable"
    | "purge_not_due";

  constructor(code: MemoryStoreFailure["code"], message: string) {
    super(message);
    this.name = "MemoryStoreFailure";
    this.code = code;
  }
}

export class MemoryExtractionFailure extends Error {
  readonly code: "unsafe_path" | "write_failed";

  constructor(code: MemoryExtractionFailure["code"], message: string) {
    super(message);
    this.name = "MemoryExtractionFailure";
    this.code = code;
  }
}

const DEFAULT_ACTOR: Actor = { kind: "runtime", id: "memory-extractor", displayName: "Memory Extractor" };
const TRASH_RETENTION_DAYS = 30;
const DEFAULT_RETRIEVAL_LIMIT = 20;
const MAX_RETRIEVAL_LIMIT = 100;
const mutationQueues = new Map<string, Promise<void>>();
let atomicWriteSequence = 0;
const SENSITIVE_KEY_PATTERN = /\b(password|secret|api[-_\s]?key|token|otp|authorization|cookie|credential|private[-_\s]?key|raw[-_\s]?value)\b/i;
const KEY_VALUE_SECRET_PATTERN = /\b(password|secret|api[-_\s]?key|token|otp|authorization|cookie|credential|private[-_\s]?key|raw[-_\s]?value)\b\s*[:=]\s*[^\s,;]+/gi;
const SECRET_VALUE_PATTERN = /\b(?:sk-[A-Za-z0-9_-]{8,}|ghp_[A-Za-z0-9_]{8,}|Bearer\s+[A-Za-z0-9._-]{8,})\b/g;
const PRIVATE_KEY_PATTERN = /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g;

function now() {
  return new Date().toISOString();
}

function clone<T>(value: T): T {
  return value === undefined
    ? value
    : typeof globalThis.structuredClone === "function"
      ? structuredClone(value)
      : JSON.parse(JSON.stringify(value));
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function slug(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "memory"
  );
}

function id(prefix: string, value: string): string {
  return `${prefix}-${slug(value)}-${sha256(value).slice(0, 10)}`;
}

function isInsideOrEqual(child: string, parent: string): boolean {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function namespaceMatches(namespace: MemoryNamespace, query?: Partial<MemoryNamespace>): boolean {
  if (!query) {
    return true;
  }
  return (
    (query.capabilityId === undefined || namespace.capabilityId === query.capabilityId) &&
    (query.workspaceId === undefined || namespace.workspaceId === query.workspaceId) &&
    (query.repositoryPath === undefined || namespace.repositoryPath === query.repositoryPath) &&
    (query.projectId === undefined || namespace.projectId === query.projectId)
  );
}

function redactString(value: string, pathLabel: string, paths: string[]): string {
  let redacted = false;
  const next = value
    .replace(PRIVATE_KEY_PATTERN, () => {
      redacted = true;
      return "[REDACTED_PRIVATE_KEY]";
    })
    .replace(KEY_VALUE_SECRET_PATTERN, (_match, key) => {
      redacted = true;
      return `${key}: [REDACTED]`;
    })
    .replace(SECRET_VALUE_PATTERN, () => {
      redacted = true;
      return "[REDACTED]";
    });

  if (SENSITIVE_KEY_PATTERN.test(value) && next === value) {
    paths.push(pathLabel);
    return "[REDACTED]";
  }
  if (redacted) {
    paths.push(pathLabel);
  }
  return next;
}

function redactUnknown(value: unknown, pathLabel: string, paths: string[]): unknown {
  if (typeof value === "string") {
    return redactString(value, pathLabel, paths);
  }
  if (Array.isArray(value)) {
    return value.map((item, index) => redactUnknown(item, `${pathLabel}[${index}]`, paths));
  }
  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      const nestedPath = pathLabel ? `${pathLabel}.${key}` : key;
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        output[key] = "[REDACTED]";
        paths.push(nestedPath);
      } else {
        output[key] = redactUnknown(nested, nestedPath, paths);
      }
    }
    return output;
  }
  return value;
}

function mergeRedactions(...items: MemoryRedactionResult[]): MemoryRedactionResult {
  const redactedPaths = [...new Set(items.flatMap((item) => item.redactedPaths))];
  return {
    applied: items.some((item) => item.applied),
    redactedPaths,
    redactionCount: items.reduce((sum, item) => sum + item.redactionCount, 0),
  };
}

function redactEpisodeInput(input: EpisodeWriteInput): { episode: EpisodeWriteInput; redaction: MemoryRedactionResult } {
  const redactedPaths: string[] = [];
  const episode = clone(input);
  episode.summary = redactString(episode.summary, "summary", redactedPaths);
  episode.content = redactUnknown(episode.content, "content", redactedPaths) as Record<string, unknown>;
  return {
    episode,
    redaction: {
      applied: redactedPaths.length > 0,
      redactedPaths: [...new Set(redactedPaths)],
      redactionCount: redactedPaths.length,
    },
  };
}

function redactRuleInput(input: CandidateRuleWriteInput): { rule: CandidateRuleWriteInput; redaction: MemoryRedactionResult } {
  const redactedPaths: string[] = [];
  const rule = clone(input);
  rule.title = redactString(rule.title, "title", redactedPaths);
  rule.rule = redactString(rule.rule, "rule", redactedPaths);
  rule.evidence = rule.evidence.map((item, index) => ({
    ...item,
    summary: redactString(item.summary, `evidence[${index}].summary`, redactedPaths),
  }));
  return {
    rule,
    redaction: {
      applied: redactedPaths.length > 0,
      redactedPaths: [...new Set(redactedPaths)],
      redactionCount: redactedPaths.length,
    },
  };
}

function redactSemanticMemoryInput(input: SemanticMemoryWriteInput | SemanticMemoryEditInput): {
  memory: SemanticMemoryWriteInput | SemanticMemoryEditInput;
  redaction: MemoryRedactionResult;
} {
  const redactedPaths: string[] = [];
  const memory = clone(input);
  if ("summary" in memory && memory.summary !== undefined) {
    memory.summary = redactString(memory.summary, "summary", redactedPaths);
  }
  if ("content" in memory && memory.content !== undefined) {
    memory.content = redactUnknown(memory.content, "content", redactedPaths) as Record<string, unknown>;
  }
  return {
    memory,
    redaction: {
      applied: redactedPaths.length > 0,
      redactedPaths: [...new Set(redactedPaths)],
      redactionCount: redactedPaths.length,
    },
  };
}

function expiresAt(createdAt: string, retention: MemoryRetentionPolicy): string | undefined {
  if (retention.retainUntil) {
    return retention.retainUntil;
  }
  if (retention.ttlDays === undefined) {
    return undefined;
  }
  const date = new Date(createdAt);
  date.setUTCDate(date.getUTCDate() + retention.ttlDays);
  return date.toISOString();
}

function textMatches(value: unknown, text?: string): boolean {
  if (!text) {
    return true;
  }
  return JSON.stringify(value).toLowerCase().includes(text.toLowerCase());
}

function limit<T>(values: T[], max?: number): T[] {
  return max === undefined ? values : values.slice(0, max);
}

function addDays(value: string, days: number): string {
  const date = new Date(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

function isExpired(item: EpisodicMemoryItem, at: string): boolean {
  return item.expiresAt !== undefined && Date.parse(item.expiresAt) <= Date.parse(at);
}

function emptyDatabase(updatedAt = now()): MemoryDatabase {
  return {
    schemaVersion: MEMORY_STORE_SCHEMA_VERSION,
    revision: 0,
    updatedAt,
    episodes: [],
    candidateRules: [],
    semanticMemory: [],
    tombstones: [],
  };
}

function migrateDatabase(value: unknown): MemoryDatabase {
  if (!value || typeof value !== "object") {
    return emptyDatabase();
  }
  const parsed = value as Partial<MemoryDatabase & LegacyMemoryDatabase>;
  const base = {
    episodes: Array.isArray(parsed.episodes) ? parsed.episodes : [],
    candidateRules: Array.isArray(parsed.candidateRules) ? parsed.candidateRules : [],
    semanticMemory: Array.isArray(parsed.semanticMemory) ? parsed.semanticMemory : [],
  };
  if (parsed.schemaVersion === MEMORY_STORE_SCHEMA_VERSION) {
    return {
      schemaVersion: MEMORY_STORE_SCHEMA_VERSION,
      revision: Number.isSafeInteger(parsed.revision) && Number(parsed.revision) >= 0 ? Number(parsed.revision) : 0,
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : now(),
      ...base,
      tombstones: Array.isArray(parsed.tombstones) ? parsed.tombstones : [],
    };
  }
  return {
    schemaVersion: MEMORY_STORE_SCHEMA_VERSION,
    revision: 0,
    updatedAt: now(),
    ...base,
    tombstones: [],
  };
}

function retrievalTokens(text?: string): string[] {
  return [...new Set((text ?? "").toLowerCase().match(/[a-z0-9._/-]+/g) ?? [])].sort();
}

function tokenOverlap(value: unknown, tokens: string[]): number {
  if (tokens.length === 0) {
    return 1;
  }
  const haystack = JSON.stringify(value).toLowerCase();
  return tokens.filter((token) => haystack.includes(token)).length / tokens.length;
}

function retrievalScore(base: number, confidence: number, overlap: number): number {
  return Number((base + Math.max(0, Math.min(1, confidence)) * 0.2 + overlap * 0.2).toFixed(6));
}

function isAutoActivationEligible(
  input: SemanticMemoryWriteInput,
  redaction: MemoryRedactionResult,
): boolean {
  const activation = input.activation;
  return (
    input.status === "candidate" &&
    activation?.requested === true &&
    (activation.basis === "explicit_user_preference" || activation.basis === "verifier_backed_fact") &&
    activation.conflictsWith.length === 0 &&
    input.sensitivity !== "sensitive" &&
    !redaction.applied
  );
}

export class LocalJsonMemoryStore implements MemoryStore {
  readonly memoryRoot: string;
  private readonly storePath: string;

  constructor(options: LocalJsonMemoryStoreOptions = {}) {
    this.memoryRoot = path.resolve(options.memoryRoot ?? path.join(tmpdir(), "orynt", "memory"));
    this.storePath = path.join(this.memoryRoot, options.storeFileName ?? "memory-store.json");
  }

  async writeEpisode(
    input: EpisodeWriteInput,
    storePath = this.storePath,
    options: MemoryMutationOptions = {},
  ): Promise<EpisodicMemoryItem> {
    const safeStorePath = this.validateStorePath(storePath);
    return this.mutateDatabase(
      safeStorePath,
      options,
      (database) => {
        const { episode: redactedInput, redaction } = redactEpisodeInput(input);
        const createdAt = redactedInput.createdAt ?? now();
        const episode: EpisodicMemoryItem = {
          id:
            redactedInput.id ??
            id(
              "episode",
              `${redactedInput.provenance.runId}:${redactedInput.kind}:${redactedInput.summary}:${database.episodes.length}`,
            ),
          namespace: clone(redactedInput.namespace),
          kind: redactedInput.kind,
          summary: redactedInput.summary,
          content: clone(redactedInput.content),
          provenance: clone(redactedInput.provenance),
          retention: clone(redactedInput.retention),
          redaction: mergeRedactions(
            redaction,
            redactedInput.redaction ?? { applied: false, redactedPaths: [], redactionCount: 0 },
          ),
          confidence: redactedInput.confidence,
          createdAt,
          expiresAt: redactedInput.expiresAt ?? expiresAt(createdAt, redactedInput.retention),
        };
        database.episodes.push(episode);
        return episode;
      },
    );
  }

  async listEpisodes(query: MemoryQuery = {}): Promise<EpisodicMemoryItem[]> {
    return this.queryEpisodes(query);
  }

  async getEpisode(idValue: string): Promise<EpisodicMemoryItem | undefined> {
    const database = await this.readDatabase();
    const episode = database.episodes.find((item) => item.id === idValue);
    return episode && !isExpired(episode, now()) ? clone(episode) : undefined;
  }

  async queryEpisodes(query: MemoryQuery): Promise<EpisodicMemoryItem[]> {
    const database = await this.readDatabase();
    const currentTime = now();
    return limit(
      database.episodes.filter(
        (episode) =>
          !isExpired(episode, currentTime) &&
          namespaceMatches(episode.namespace, query.namespace) &&
          (query.kinds === undefined || query.kinds.includes(episode.kind)) &&
          (query.runId === undefined || episode.provenance.runId === query.runId) &&
          textMatches(episode, query.text),
      ),
      query.limit,
    ).map(clone);
  }

  async writeCandidateRule(
    input: CandidateRuleWriteInput,
    options: MemoryMutationOptions = {},
  ): Promise<CandidateRule> {
    return this.mutateDatabase(
      this.storePath,
      options,
      (database) => {
        const { rule: redactedInput, redaction } = redactRuleInput(input);
        const createdAt = redactedInput.createdAt ?? now();
        const rule: CandidateRule = {
          id:
            redactedInput.id ??
            id(
              "candidate-rule",
              `${redactedInput.provenance.runId}:${redactedInput.title}:${redactedInput.rule}:${database.candidateRules.length}`,
            ),
          namespace: clone(redactedInput.namespace),
          status: redactedInput.status ?? "candidate",
          title: redactedInput.title,
          rule: redactedInput.rule,
          scope: clone(redactedInput.scope),
          evidence: clone(redactedInput.evidence),
          provenance: clone(redactedInput.provenance),
          redaction: mergeRedactions(
            redaction,
            redactedInput.redaction ?? { applied: false, redactedPaths: [], redactionCount: 0 },
          ),
          reviewDecisions: clone(redactedInput.reviewDecisions ?? []),
          createdAt,
          updatedAt: redactedInput.updatedAt ?? createdAt,
          supersededBy: redactedInput.supersededBy,
        };
        database.candidateRules.push(rule);
        return rule;
      },
    );
  }

  async listCandidateRules(query: CandidateRuleQuery = {}): Promise<CandidateRule[]> {
    const database = await this.readDatabase();
    return limit(
      database.candidateRules.filter(
        (rule) =>
          namespaceMatches(rule.namespace, query.namespace) &&
          (query.statuses === undefined || query.statuses.includes(rule.status)) &&
          textMatches(rule, query.text),
      ),
      query.limit,
    ).map(clone);
  }

  async updateCandidateRuleStatus(
    idValue: string,
    status: CandidateRuleStatus,
    options: CandidateRuleStatusUpdateOptions = {},
  ): Promise<CandidateRule> {
    return this.mutateDatabase(
      this.storePath,
      options,
      (database) => {
        const index = database.candidateRules.findIndex((rule) => rule.id === idValue);
        if (index < 0) {
          throw new MemoryStoreFailure(
            "candidate_rule_not_found",
            `candidate rule not found: ${idValue}`,
          );
        }
        const current = database.candidateRules[index];
        if (!canTransition(current.status, status)) {
          throw new MemoryStoreFailure(
            "invalid_status_transition",
            `invalid candidate rule status transition: ${current.status} -> ${status}`,
          );
        }
        const decidedAt = options.decidedAt ?? now();
        const reviewDecisions: MemoryReviewDecision[] = [
          ...(current.reviewDecisions ?? []),
          ...(options.actor && options.reason
            ? [
                {
                  status,
                  actor: options.actor,
                  reason: options.reason,
                  runId: options.runId,
                  decidedAt,
                },
              ]
            : []),
        ];
        const updated: CandidateRule = {
          ...current,
          status,
          reviewDecisions,
          updatedAt: decidedAt,
          supersededBy:
            status === "superseded" ? options.supersededBy : current.supersededBy,
        };
        database.candidateRules[index] = updated;
        return updated;
      },
    );
  }

  async writeSemanticMemory(
    input: SemanticMemoryWriteInput,
    options: MemoryMutationOptions = {},
  ): Promise<SemanticMemoryItem> {
    return this.mutateDatabase(
      this.storePath,
      options,
      (database) => {
        const { memory: redactedInput, redaction } = redactSemanticMemoryInput(input) as {
          memory: SemanticMemoryWriteInput;
          redaction: MemoryRedactionResult;
        };
        const createdAt = redactedInput.createdAt ?? now();
        const combinedRedaction = mergeRedactions(
          redaction,
          redactedInput.redaction ?? { applied: false, redactedPaths: [], redactionCount: 0 },
        );
        const autoActivated = isAutoActivationEligible(redactedInput, combinedRedaction);
        const status = autoActivated ? "approved" : redactedInput.status;
        const item: SemanticMemoryItem = {
          id:
            redactedInput.id ??
            id(
              "semantic-memory",
              `${redactedInput.provenance.runId}:${redactedInput.summary}:${database.semanticMemory.length}`,
            ),
          namespace: clone(redactedInput.namespace),
          status,
          summary: redactedInput.summary,
          content: clone(redactedInput.content),
          sensitivity: redactedInput.sensitivity,
          confidence: redactedInput.confidence,
          provenance: clone(redactedInput.provenance),
          redaction: combinedRedaction,
          reviewDecisions: [
            ...(redactedInput.reviewDecisions ?? []),
            ...(autoActivated
              ? [
                  {
                    status: "approved" as const,
                    actor: "memory-policy",
                    reason: `Low-risk auto-activation: ${redactedInput.activation?.basis}.`,
                    runId: redactedInput.provenance.runId,
                    decidedAt: createdAt,
                  },
                ]
              : []),
          ],
          activation: redactedInput.activation
            ? {
                ...clone(redactedInput.activation),
                activatedAt: autoActivated ? createdAt : redactedInput.activation.activatedAt,
              }
            : undefined,
          createdAt,
          updatedAt: redactedInput.updatedAt ?? createdAt,
        };
        database.semanticMemory.push(item);
        return item;
      },
    );
  }

  async listSemanticMemory(query: SemanticMemoryQuery = {}): Promise<SemanticMemoryItem[]> {
    const database = await this.readDatabase();
    return limit(
      database.semanticMemory.filter(
        (item) =>
          namespaceMatches(item.namespace, query.namespace) &&
          (query.includeDeleted === true || item.status !== "deleted") &&
          (query.statuses === undefined || query.statuses.includes(item.status)) &&
          textMatches(item, query.text),
      ),
      query.limit,
    ).map(clone);
  }

  async updateSemanticMemoryStatus(
    input: SemanticMemoryStatusUpdateInput,
    options: MemoryMutationOptions = {},
  ): Promise<SemanticMemoryItem> {
    if (input.status === "deleted") {
      return this.deleteSemanticMemory(input, options);
    }
    return this.updateSemanticMemory(input, { status: input.status }, options);
  }

  async editSemanticMemory(
    input: SemanticMemoryEditInput,
    options: MemoryMutationOptions = {},
  ): Promise<SemanticMemoryItem> {
    const { memory: redactedInput, redaction } = redactSemanticMemoryInput(input) as {
      memory: SemanticMemoryEditInput;
      redaction: MemoryRedactionResult;
    };
    const patch: Partial<SemanticMemoryItem> & { redaction?: MemoryRedactionResult } = { redaction };
    if (redactedInput.summary !== undefined) {
      patch.summary = redactedInput.summary;
    }
    if (redactedInput.content !== undefined) {
      patch.content = redactedInput.content;
    }
    if (redactedInput.sensitivity !== undefined) {
      patch.sensitivity = redactedInput.sensitivity;
    }
    if (redactedInput.confidence !== undefined) {
      patch.confidence = redactedInput.confidence;
    }
    return this.updateSemanticMemory(redactedInput, patch, options);
  }

  async deleteSemanticMemory(
    input: Omit<SemanticMemoryStatusUpdateInput, "status">,
    options: MemoryMutationOptions = {},
  ): Promise<SemanticMemoryItem> {
    const deletedAt = input.decidedAt ?? now();
    return this.mutateDatabase(
      this.storePath,
      options,
      (database) => {
        const index = database.semanticMemory.findIndex((item) => item.id === input.id);
        if (index < 0) {
          throw new MemoryStoreFailure(
            "semantic_memory_not_found",
            `semantic memory not found: ${input.id}`,
          );
        }
        const current = database.semanticMemory[index];
        if (current.status === "deleted") {
          return current;
        }
        const updated: SemanticMemoryItem = {
          ...current,
          status: "deleted",
          statusBeforeTrash: current.status,
          deletedAt,
          purgeAfter: addDays(deletedAt, TRASH_RETENTION_DAYS),
          updatedAt: deletedAt,
          reviewDecisions: [
            ...current.reviewDecisions,
            {
              status: "deleted",
              actor: input.actor,
              reason: input.reason,
              runId: input.runId,
              decidedAt: deletedAt,
            },
          ],
        };
        database.semanticMemory[index] = updated;
        return updated;
      },
    );
  }

  async restoreSemanticMemory(
    input: Omit<SemanticMemoryStatusUpdateInput, "status">,
    options: MemoryMutationOptions = {},
  ): Promise<SemanticMemoryItem> {
    const restoredAt = input.decidedAt ?? now();
    return this.mutateDatabase(
      this.storePath,
      options,
      (database) => {
        const index = database.semanticMemory.findIndex((item) => item.id === input.id);
        if (index < 0) {
          throw new MemoryStoreFailure(
            "semantic_memory_not_found",
            `semantic memory not found: ${input.id}`,
          );
        }
        const current = database.semanticMemory[index];
        if (current.status !== "deleted" || current.purgedAt) {
          throw new MemoryStoreFailure(
            "not_restorable",
            `semantic memory is not restorable: ${input.id}`,
          );
        }
        if (current.purgeAfter && Date.parse(restoredAt) >= Date.parse(current.purgeAfter)) {
          throw new MemoryStoreFailure(
            "not_restorable",
            `semantic memory restore window expired: ${input.id}`,
          );
        }
        const restoredStatus = current.statusBeforeTrash ?? "candidate";
        const updated: SemanticMemoryItem = {
          ...current,
          status: restoredStatus,
          deletedAt: undefined,
          purgeAfter: undefined,
          statusBeforeTrash: undefined,
          updatedAt: restoredAt,
        };
        database.semanticMemory[index] = updated;
        return updated;
      },
    );
  }

  async purgeSemanticMemory(
    input: Omit<SemanticMemoryStatusUpdateInput, "status">,
    options: MemoryMutationOptions = {},
  ): Promise<MemoryTombstone> {
    const purgedAt = input.decidedAt ?? now();
    return this.mutateDatabase(
      this.storePath,
      options,
      (database) => {
        const index = database.semanticMemory.findIndex((item) => item.id === input.id);
        if (index < 0) {
          const existing = database.tombstones.find((item) => item.id === input.id);
          if (existing) {
            return existing;
          }
          throw new MemoryStoreFailure(
            "semantic_memory_not_found",
            `semantic memory not found: ${input.id}`,
          );
        }
        const current = database.semanticMemory[index];
        if (
          current.status !== "deleted" ||
          !current.deletedAt ||
          !current.purgeAfter ||
          Date.parse(purgedAt) < Date.parse(current.purgeAfter)
        ) {
          throw new MemoryStoreFailure(
            "purge_not_due",
            `semantic memory purge is not due: ${input.id}`,
          );
        }
        const tombstone: MemoryTombstone = {
          id: current.id,
          kind: "semantic_memory",
          namespace: clone(current.namespace),
          deletedAt: current.deletedAt,
          purgedAt,
          provenanceRunId: current.provenance.runId,
          reason: input.reason,
        };
        database.semanticMemory.splice(index, 1);
        database.tombstones.push(tombstone);
        return tombstone;
      },
    );
  }

  async retrieveMemory(query: MemoryRetrievalQuery): Promise<MemoryRetrievalHit[]> {
    const database = await this.readDatabase();
    const at = query.now ?? now();
    const kinds = new Set(query.kinds ?? [
      "episode",
      "candidate_rule",
      "semantic_memory",
    ]);
    const tokens = retrievalTokens(query.text);
    const hits: MemoryRetrievalHit[] = [];

    if (kinds.has("episode")) {
      for (const episode of database.episodes) {
        if (
          isExpired(episode, at) ||
          !namespaceMatches(episode.namespace, query.namespace)
        ) {
          continue;
        }
        const overlap = tokenOverlap(episode, tokens);
        if (tokens.length > 0 && overlap === 0) {
          continue;
        }
        hits.push({
          id: episode.id,
          kind: "episode",
          summary: episode.summary,
          score: retrievalScore(0.4, episode.confidence, overlap),
          confidence: episode.confidence,
          namespace: clone(episode.namespace),
          provenance: clone(episode.provenance),
          advisory: true,
          createdAt: episode.createdAt,
        });
      }
    }

    if (kinds.has("candidate_rule")) {
      for (const rule of database.candidateRules) {
        if (
          rule.status !== "accepted" ||
          !namespaceMatches(rule.namespace, query.namespace)
        ) {
          continue;
        }
        const overlap = tokenOverlap(rule, tokens);
        if (tokens.length > 0 && overlap === 0) {
          continue;
        }
        const confidence =
          rule.evidence.length === 0
            ? 0
            : Math.max(...rule.evidence.map((item) => item.confidence));
        hits.push({
          id: rule.id,
          kind: "candidate_rule",
          summary: `${rule.title}: ${rule.rule}`,
          score: retrievalScore(0.6, confidence, overlap),
          confidence,
          namespace: clone(rule.namespace),
          provenance: clone(rule.provenance),
          advisory: true,
          createdAt: rule.updatedAt,
          status: rule.status,
        });
      }
    }

    if (kinds.has("semantic_memory")) {
      for (const item of database.semanticMemory) {
        if (
          item.status !== "approved" ||
          (!query.includeSensitive && item.sensitivity === "sensitive") ||
          (item.activation?.conflictsWith.length ?? 0) > 0 ||
          !namespaceMatches(item.namespace, query.namespace)
        ) {
          continue;
        }
        const overlap = tokenOverlap(item, tokens);
        if (tokens.length > 0 && overlap === 0) {
          continue;
        }
        hits.push({
          id: item.id,
          kind: "semantic_memory",
          summary: item.summary,
          score: retrievalScore(0.55, item.confidence, overlap),
          confidence: item.confidence,
          namespace: clone(item.namespace),
          provenance: clone(item.provenance),
          advisory: true,
          createdAt: item.updatedAt,
          status: item.status,
        });
      }
    }

    return hits
      .sort(
        (left, right) =>
          right.score - left.score ||
          right.createdAt.localeCompare(left.createdAt) ||
          left.id.localeCompare(right.id),
      )
      .slice(0, Math.max(0, Math.min(query.limit ?? DEFAULT_RETRIEVAL_LIMIT, MAX_RETRIEVAL_LIMIT)))
      .map(clone);
  }

  async getStoreSnapshot(): Promise<MemoryStoreEnvelopeV2> {
    return clone(await this.readDatabase());
  }

  async summarizeMemory(namespace?: Partial<MemoryNamespace>): Promise<MemorySummary> {
    const [episodes, candidateRules] = await Promise.all([this.queryEpisodes({ namespace }), this.listCandidateRules({ namespace })]);
    const namespaceKeys = new Set([...episodes.map((episode) => namespaceKey(episode.namespace)), ...candidateRules.map((rule) => namespaceKey(rule.namespace))]);
    return {
      episodeCount: episodes.length,
      candidateRuleCount: candidateRules.length,
      candidateRuleStatusCounts: {
        candidate: candidateRules.filter((rule) => rule.status === "candidate").length,
        accepted: candidateRules.filter((rule) => rule.status === "accepted").length,
        rejected: candidateRules.filter((rule) => rule.status === "rejected").length,
        superseded: candidateRules.filter((rule) => rule.status === "superseded").length,
      },
      namespaceCount: namespaceKeys.size,
    };
  }

  validateStorePath(candidate = this.storePath): string {
    const resolved = path.resolve(candidate);
    if (!isInsideOrEqual(resolved, this.memoryRoot)) {
      throw new MemoryStoreFailure("unsafe_path", "memory store path is outside the managed memory root");
    }
    return resolved;
  }

  async artifactRef(kind: ArtifactRef["kind"], label: string, source: unknown, suffix: string): Promise<ArtifactRef> {
    const artifactJson = `${JSON.stringify(source, null, 2)}\n`;
    const digest = sha256(artifactJson);
    const artifactPath = this.validateStorePath(
      path.join(this.memoryRoot, "artifacts", `${slug(suffix)}-${digest.slice(0, 12)}.json`),
    );
    try {
      await readFile(artifactPath, "utf8");
    } catch (error) {
      if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) {
        throw error;
      }
      await this.writeAtomic(artifactPath, artifactJson);
    }
    return {
      id: `${slug(label)}-${digest.slice(0, 10)}`,
      kind,
      uri: `file://${artifactPath}`,
      label,
      sha256: digest,
    };
  }

  private async readDatabase(storePath = this.storePath): Promise<MemoryDatabase> {
    const safeStorePath = this.validateStorePath(storePath);
    try {
      return migrateDatabase(JSON.parse(await readFile(safeStorePath, "utf8")));
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
        return emptyDatabase();
      }
      throw error;
    }
  }

  private async writeDatabase(database: MemoryDatabase, storePath = this.storePath): Promise<void> {
    const safeStorePath = this.validateStorePath(storePath);
    await this.writeAtomic(safeStorePath, `${JSON.stringify(database, null, 2)}\n`);
  }

  private async updateSemanticMemory(
    input: SemanticMemoryStatusUpdateInput | SemanticMemoryEditInput,
    patch: Partial<SemanticMemoryItem> & { redaction?: MemoryRedactionResult } = {},
    options: MemoryMutationOptions = {},
  ): Promise<SemanticMemoryItem> {
    return this.mutateDatabase(
      this.storePath,
      options,
      (database) => {
        const index = database.semanticMemory.findIndex((item) => item.id === input.id);
        if (index < 0) {
          throw new MemoryStoreFailure(
            "semantic_memory_not_found",
            `semantic memory not found: ${input.id}`,
          );
        }
        const current = database.semanticMemory[index];
        if (current.status === "deleted") {
          throw new MemoryStoreFailure(
            "invalid_status_transition",
            `trashed semantic memory must be restored before mutation: ${input.id}`,
          );
        }
        const updatedAt =
          "decidedAt" in input && input.decidedAt ? input.decidedAt : now();
        const reviewStatus = "status" in input ? input.status : undefined;
        const reviewDecisions = reviewStatus
          ? [
              ...current.reviewDecisions,
              {
                status: reviewStatus,
                actor: input.actor,
                reason: input.reason,
                runId: "runId" in input ? input.runId : undefined,
                decidedAt: updatedAt,
              },
            ]
          : current.reviewDecisions;
        const updated: SemanticMemoryItem = {
          ...current,
          ...patch,
          redaction: mergeRedactions(
            current.redaction,
            patch.redaction ?? { applied: false, redactedPaths: [], redactionCount: 0 },
          ),
          reviewDecisions,
          updatedAt,
        };
        database.semanticMemory[index] = updated;
        return updated;
      },
    );
  }

  private async mutateDatabase<T>(
    storePath: string,
    options: MemoryMutationOptions,
    mutate: (database: MemoryDatabase) => T,
  ): Promise<T> {
    const safeStorePath = this.validateStorePath(storePath);
    return this.withMutationLock(safeStorePath, async () => {
      const database = await this.readDatabase(safeStorePath);
      if (
        options.expectedRevision !== undefined &&
        options.expectedRevision !== database.revision
      ) {
        throw new MemoryStoreFailure(
          "revision_conflict",
          `memory store revision conflict: expected ${options.expectedRevision}, current ${database.revision}`,
        );
      }
      const result = mutate(database);
      database.revision += 1;
      database.updatedAt = now();
      await this.writeDatabase(database, safeStorePath);
      return clone(result);
    });
  }

  private async withMutationLock<T>(storePath: string, work: () => Promise<T>): Promise<T> {
    const previous = mutationQueues.get(storePath) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const queued = previous.then(() => current);
    mutationQueues.set(storePath, queued);
    await previous;
    try {
      return await work();
    } finally {
      release();
      if (mutationQueues.get(storePath) === queued) {
        mutationQueues.delete(storePath);
      }
    }
  }

  private async writeAtomic(targetPath: string, content: string): Promise<void> {
    const safeTarget = this.validateStorePath(targetPath);
    await mkdir(path.dirname(safeTarget), { recursive: true });
    atomicWriteSequence += 1;
    const temporaryPath = `${safeTarget}.tmp-${process.pid}-${atomicWriteSequence}`;
    try {
      await writeFile(temporaryPath, content, "utf8");
      await rename(temporaryPath, safeTarget);
    } finally {
      await rm(temporaryPath, { force: true }).catch(() => undefined);
    }
  }
}

export class InMemoryMemoryStore extends LocalJsonMemoryStore {
  constructor() {
    super({ memoryRoot: path.join(tmpdir(), "orynt", "memory", `in-memory-${Date.now()}-${Math.random().toString(36).slice(2)}`) });
  }
}

function namespaceKey(namespace: MemoryNamespace): string {
  return [namespace.capabilityId, namespace.workspaceId, namespace.repositoryPath ?? "", namespace.projectId ?? ""].join("|");
}

function canTransition(from: CandidateRuleStatus, to: CandidateRuleStatus): boolean {
  if (from === to) {
    return true;
  }
  if (from === "candidate") {
    return to === "accepted" || to === "rejected" || to === "superseded";
  }
  if (from === "accepted") {
    return to === "superseded";
  }
  return false;
}

function eventIds(events: RunEvent[], ...types: string[]): string[] {
  return events.filter((event) => types.includes(event.type)).map((event) => event.id);
}

function artifactRefs(events: RunEvent[], importBundle?: CodexResultBundle, verificationResult?: VerificationResult): ArtifactRef[] {
  const refs = [...events.flatMap((event) => event.artifacts), ...(importBundle?.artifacts ?? []), ...(verificationResult?.artifacts ?? [])];
  const seen = new Set<string>();
  return refs.filter((ref) => {
    if (seen.has(ref.id)) {
      return false;
    }
    seen.add(ref.id);
    return true;
  });
}

function sourceTimestamps(events: RunEvent[]): string[] {
  return events.map((event) => event.timestamp);
}

function provenance(input: MemoryExtractionInput, sources: MemoryProvenance["sources"]): MemoryProvenance {
  return {
    runId: input.run.id,
    taskId: input.run.taskId,
    eventIds: input.events.map((event) => event.id),
    artifactRefs: artifactRefs(input.events, input.importBundle, input.verificationResult),
    sources,
    sourceTimestamps: sourceTimestamps(input.events),
    verificationResultId: input.verificationResult?.id,
    importBundleId: input.importBundle?.id,
  };
}

function commandEvidence(result?: VerificationResult): VerificationEvidence[] {
  return result?.evidence.filter((item) => item.kind === "command") ?? [];
}

function validateExtractorArtifactRoot(root: string, managedRoot: string): string {
  const resolved = path.resolve(root);
  const managed = path.resolve(managedRoot);
  if (!isInsideOrEqual(resolved, managed)) {
    throw new MemoryExtractionFailure("unsafe_path", "memory artifact path is outside the managed memory root");
  }
  return resolved;
}

export class LocalMemoryExtractor implements MemoryExtractor {
  private readonly memoryStore: MemoryStore;
  private readonly runStore?: RunStore;
  private readonly actor: Actor;
  private readonly managedMemoryRoot: string;

  constructor(options: LocalMemoryExtractorOptions) {
    this.memoryStore = options.memoryStore;
    this.runStore = options.runStore;
    this.actor = options.actor ?? DEFAULT_ACTOR;
    this.managedMemoryRoot =
      options.managedMemoryRoot ??
      (options.memoryStore instanceof LocalJsonMemoryStore ? options.memoryStore.memoryRoot : path.join(tmpdir(), "orynt", "memory"));
  }

  async extractRunMemory(input: MemoryExtractionInput): Promise<MemoryExtractionResult> {
    const startedAt = now();
    this.runStore?.appendEvent(input.run.id, {
      type: "memory_extraction_started",
      actor: this.actor,
      payload: {
        summary: "Memory extraction started from redacted run evidence",
        namespace: input.namespace,
      },
    });

    try {
      validateExtractorArtifactRoot(input.artifactRoot, this.managedMemoryRoot);
      const rawEpisodes = await this.createEpisodes(input);
      const rawCandidateRules = await this.createCandidateRules(input);
      const sanitizedEpisodes = rawEpisodes.map((episode) => {
        const redacted = redactEpisodeInput(episode);
        return { ...redacted.episode, redaction: mergeRedactions(redacted.redaction, episode.redaction ?? { applied: false, redactedPaths: [], redactionCount: 0 }) };
      });
      const sanitizedCandidateRules = rawCandidateRules.map((rule) => {
        const redacted = redactRuleInput(rule);
        return { ...redacted.rule, redaction: mergeRedactions(redacted.redaction, rule.redaction ?? { applied: false, redactedPaths: [], redactionCount: 0 }) };
      });
      const redaction = mergeRedactions(
        ...sanitizedEpisodes.map((episode) => episode.redaction ?? { applied: false, redactedPaths: [], redactionCount: 0 }),
        ...sanitizedCandidateRules.map((rule) => rule.redaction ?? { applied: false, redactedPaths: [], redactionCount: 0 }),
      );

      this.runStore?.appendEvent(input.run.id, {
        type: "memory_redaction_applied",
        actor: this.actor,
        payload: {
          summary: redaction.applied
            ? "Memory extraction redacted sensitive values before persistence"
            : "Memory extraction redaction check completed",
          redaction,
        },
      });

      const episodeArtifacts: ArtifactRef[] = [];
      const persistedEpisodes: EpisodicMemoryItem[] = [];
      for (const episodeInput of sanitizedEpisodes) {
        const episode = await this.memoryStore.writeEpisode(episodeInput);
        const artifact = await this.memoryArtifact("memory_episode", "Episodic memory item", episode, episode.id);
        episodeArtifacts.push(artifact);
        persistedEpisodes.push(episode);
        this.runStore?.appendEvent(input.run.id, {
          type: "memory_episode_written",
          actor: this.actor,
          payload: {
            summary: episode.summary,
            episodeId: episode.id,
            kind: episode.kind,
          },
          artifacts: [artifact],
        });
      }

      const ruleArtifacts: ArtifactRef[] = [];
      const persistedRules: CandidateRule[] = [];
      for (const ruleInput of sanitizedCandidateRules) {
        const rule = await this.memoryStore.writeCandidateRule(ruleInput);
        const artifact = await this.memoryArtifact("candidate_rule", "Candidate rule", rule, rule.id);
        ruleArtifacts.push(artifact);
        persistedRules.push(rule);
        this.runStore?.appendEvent(input.run.id, {
          type: "candidate_rule_proposed",
          actor: this.actor,
          payload: {
            summary: rule.title,
            candidateRuleId: rule.id,
            status: rule.status,
          },
          artifacts: [artifact],
        });
      }

      const completedAt = now();
      const result: MemoryExtractionResult = {
        id: id("memory-extraction", `${input.run.id}:${completedAt}`),
        runId: input.run.id,
        taskId: input.run.taskId,
        namespace: clone(input.namespace),
        episodes: persistedEpisodes,
        candidateRules: persistedRules,
        redaction,
        artifacts: [...episodeArtifacts, ...ruleArtifacts],
        startedAt,
        completedAt,
        summary: `Extracted ${persistedEpisodes.length} memory episodes and ${persistedRules.length} candidate rules.`,
      };

      const summaryArtifact = await this.memoryArtifact("memory_summary", "Memory extraction summary", result, result.id);
      result.artifacts.push(summaryArtifact);
      this.runStore?.appendEvent(input.run.id, {
        type: "memory_extraction_finished",
        actor: this.actor,
        payload: {
          summary: result.summary,
          episodeCount: result.episodes.length,
          candidateRuleCount: result.candidateRules.length,
        },
        artifacts: [summaryArtifact],
      });

      return clone(result);
    } catch (error) {
      this.runStore?.appendEvent(input.run.id, {
        type: "memory_extraction_failed",
        actor: this.actor,
        payload: {
          summary: error instanceof Error ? error.message : "Memory extraction failed",
        },
      });
      throw error;
    }
  }

  private async memoryArtifact(kind: ArtifactRef["kind"], label: string, source: unknown, suffix: string): Promise<ArtifactRef> {
    if (this.memoryStore instanceof LocalJsonMemoryStore) {
      return this.memoryStore.artifactRef(kind, label, source, suffix);
    }
    return {
      id: `${slug(label)}-${sha256(`${suffix}:${JSON.stringify(source)}`).slice(0, 10)}`,
      kind,
      uri: `memory://${suffix}`,
      label,
      sha256: sha256(JSON.stringify(source)),
    };
  }

  private async createEpisodes(input: MemoryExtractionInput): Promise<EpisodeWriteInput[]> {
    const verification = input.verificationResult;
    const importSummary = input.importBundle?.summary.summary;
    const runPassed = verification?.status === "pass";
    const runStatus = verification?.status ?? input.events.at(-1)?.verdict?.status ?? "inconclusive";
    const result: EpisodeWriteInput[] = [
      {
        namespace: input.namespace,
        kind: "run_episode",
        summary: runPassed
          ? `Successful Coding Apprentice run: ${verification?.verdict.reason ?? "verification passed"}`
          : `Failed Coding Apprentice run: ${verification?.verdict.reason ?? importSummary ?? "verification did not pass"}`,
        content: {
          goal: input.run.goal,
          status: runStatus,
          verifierStatus: verification?.status,
          verifierFailureClass: verification?.verdict.failureClass,
          importStatus: input.importBundle?.status,
          changedFiles: input.importBundle?.patch.changedFiles.map((file) => file.path) ?? verification?.diffScope.changedFiles ?? [],
          artifactIds: artifactRefs(input.events, input.importBundle, verification).map((artifact) => artifact.id),
        },
        provenance: provenance(input, ["run_event", "verification_result", "import_summary", "artifact_metadata"]),
        retention: input.retention,
        confidence: verification?.status === "pass" ? 1 : 0.85,
      },
    ];

    for (const command of commandEvidence(verification)) {
      result.push({
        namespace: input.namespace,
        kind: "command_observation",
        summary:
          command.exitCode === 0
            ? `Verification command succeeded: ${command.command ?? command.label}`
            : `Verification command failed: ${command.command ?? command.label}`,
        content: {
          command: command.command ?? command.label,
          exitCode: command.exitCode,
          timedOut: command.timedOut ?? false,
          stdoutSha256: command.stdout ? sha256(command.stdout) : undefined,
          stderrSha256: command.stderr ? sha256(command.stderr) : undefined,
        },
        provenance: provenance(input, ["verification_result", "run_event"]),
        retention: input.retention,
        confidence: command.exitCode === 0 ? 0.9 : 0.85,
      });
    }

    if (verification?.diffScope.withinAllowedScope && verification.diffScope.hasChanges) {
      result.push({
        namespace: input.namespace,
        kind: "allowed_scope_pattern",
        summary: `Verified changes stayed within allowed paths: ${verification.diffScope.allowedFiles.join(", ")}`,
        content: {
          allowedFiles: verification.diffScope.allowedFiles,
          changedFiles: verification.diffScope.changedFiles,
          baseRef: verification.diffScope.baseRef,
        },
        provenance: provenance(input, ["verification_result", "import_summary"]),
        retention: input.retention,
        confidence: 0.85,
      });
    }

    if (verification?.status === "fail") {
      result.push({
        namespace: input.namespace,
        kind: "verifier_failure_pattern",
        summary: `Verifier failure pattern: ${verification.verdict.failureClass ?? verification.verdict.reason}`,
        content: {
          failureClass: verification.verdict.failureClass,
          reason: verification.verdict.reason,
          protectedFiles: verification.diffScope.protectedFiles,
          unexpectedFiles: verification.diffScope.unexpectedFiles,
        },
        provenance: provenance(input, ["verification_result", "run_event"]),
        retention: input.retention,
        confidence: 0.9,
      });
    }

    const protectedFiles = [...(input.importBundle?.patch.protectedFiles ?? []), ...(verification?.diffScope.protectedFiles ?? [])].filter(Boolean);
    if (protectedFiles.length > 0) {
      result.push({
        namespace: input.namespace,
        kind: "protected_path_violation",
        summary: `Protected paths were touched: ${[...new Set(protectedFiles)].join(", ")}`,
        content: {
          protectedFiles: [...new Set(protectedFiles)],
          failureReasons: input.importBundle?.failureReasons ?? [],
          verifierFailureClass: verification?.verdict.failureClass,
        },
        provenance: provenance(input, ["verification_result", "import_summary", "policy_decision", "run_event"]),
        retention: input.retention,
        confidence: 0.95,
      });
    }

    return result;
  }

  private async createCandidateRules(input: MemoryExtractionInput): Promise<CandidateRuleWriteInput[]> {
    const rules: CandidateRuleWriteInput[] = [];
    const protectedFiles = [
      ...(input.importBundle?.patch.protectedFiles ?? []),
      ...(input.verificationResult?.diffScope.protectedFiles ?? []),
    ].filter(Boolean);
    const unexpectedFiles = [
      ...(input.importBundle?.patch.unexpectedFiles ?? []),
      ...(input.verificationResult?.diffScope.unexpectedFiles ?? []),
    ].filter(Boolean);

    if (protectedFiles.length > 0) {
      rules.push(this.rule(input, "protected_path_violation", "Avoid protected paths without explicit review", `Do not modify protected paths during Coding Apprentice runs: ${[...new Set(protectedFiles)].join(", ")}.`));
    }
    if (unexpectedFiles.length > 0) {
      rules.push(this.rule(input, "unexpected_file_touch", "Keep changes inside allowed scope", `Keep repository edits inside the allowed path scope; unexpected files observed: ${[...new Set(unexpectedFiles)].join(", ")}.`));
    }
    if (commandEvidence(input.verificationResult).some((item) => item.exitCode !== 0 || item.timedOut)) {
      rules.push(this.rule(input, "verifier_failure_pattern", "Treat failing verification command as project evidence", "Use failed verification command evidence when planning follow-up fixes."));
    }

    return rules;
  }

  private rule(input: MemoryExtractionInput, kind: CandidateRuleEvidence["kind"], title: string, ruleText: string): CandidateRuleWriteInput {
    const eventIdList = eventIds(input.events, "verification_recorded", "verification_failed", "codex_result_imported", "manual_review_required");
    return {
      namespace: input.namespace,
      title,
      rule: ruleText,
      scope: {
        repositoryPath: input.namespace.repositoryPath,
        allowedPaths: input.importBundle?.policy.sandbox.repository.allowedPaths ?? [],
        protectedPaths: input.importBundle?.policy.sandbox.repository.protectedPaths ?? [],
        commands: commandEvidence(input.verificationResult).map((item) => item.command ?? item.label),
      },
      evidence: [
        {
          kind,
          summary: ruleText,
          eventIds: eventIdList,
          artifactRefs: artifactRefs(input.events, input.importBundle, input.verificationResult),
          confidence: 0.9,
        },
      ],
      provenance: provenance(input, ["run_event", "verification_result", "import_summary", "artifact_metadata"]),
    };
  }
}
