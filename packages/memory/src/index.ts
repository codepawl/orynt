import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";

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
  MemoryNamespace,
  MemoryProvenance,
  MemoryQuery,
  MemoryRedactionResult,
  MemoryRetentionPolicy,
  MemoryStore,
  MemorySummary,
  RunEvent,
  RunStore,
  VerificationEvidence,
  VerificationResult,
} from "@codepawl/shared";

type MemoryDatabase = {
  episodes: EpisodicMemoryItem[];
  candidateRules: CandidateRule[];
};

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
  readonly code: "unsafe_path" | "episode_not_found" | "candidate_rule_not_found" | "invalid_status_transition";

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

export class LocalJsonMemoryStore implements MemoryStore {
  readonly memoryRoot: string;
  private readonly storePath: string;

  constructor(options: LocalJsonMemoryStoreOptions = {}) {
    this.memoryRoot = path.resolve(options.memoryRoot ?? path.join(tmpdir(), "codepawl", "memory"));
    this.storePath = path.join(this.memoryRoot, options.storeFileName ?? "memory-store.json");
  }

  async writeEpisode(input: EpisodeWriteInput, storePath = this.storePath): Promise<EpisodicMemoryItem> {
    const safeStorePath = this.validateStorePath(storePath);
    const database = await this.readDatabase(safeStorePath);
    const { episode: redactedInput, redaction } = redactEpisodeInput(input);
    const createdAt = redactedInput.createdAt ?? now();
    const episode: EpisodicMemoryItem = {
      id: redactedInput.id ?? id("episode", `${redactedInput.provenance.runId}:${redactedInput.kind}:${redactedInput.summary}:${database.episodes.length}`),
      namespace: clone(redactedInput.namespace),
      kind: redactedInput.kind,
      summary: redactedInput.summary,
      content: clone(redactedInput.content),
      provenance: clone(redactedInput.provenance),
      retention: clone(redactedInput.retention),
      redaction: mergeRedactions(redaction, redactedInput.redaction ?? { applied: false, redactedPaths: [], redactionCount: 0 }),
      confidence: redactedInput.confidence,
      createdAt,
      expiresAt: redactedInput.expiresAt ?? expiresAt(createdAt, redactedInput.retention),
    };
    database.episodes.push(episode);
    await this.writeDatabase(database, safeStorePath);
    return clone(episode);
  }

  async listEpisodes(query: MemoryQuery = {}): Promise<EpisodicMemoryItem[]> {
    return this.queryEpisodes(query);
  }

  async getEpisode(idValue: string): Promise<EpisodicMemoryItem | undefined> {
    const database = await this.readDatabase();
    const episode = database.episodes.find((item) => item.id === idValue);
    return episode ? clone(episode) : undefined;
  }

  async queryEpisodes(query: MemoryQuery): Promise<EpisodicMemoryItem[]> {
    const database = await this.readDatabase();
    return limit(
      database.episodes.filter(
        (episode) =>
          namespaceMatches(episode.namespace, query.namespace) &&
          (query.kinds === undefined || query.kinds.includes(episode.kind)) &&
          (query.runId === undefined || episode.provenance.runId === query.runId) &&
          textMatches(episode, query.text),
      ),
      query.limit,
    ).map(clone);
  }

  async writeCandidateRule(input: CandidateRuleWriteInput): Promise<CandidateRule> {
    const database = await this.readDatabase();
    const { rule: redactedInput, redaction } = redactRuleInput(input);
    const createdAt = redactedInput.createdAt ?? now();
    const rule: CandidateRule = {
      id: redactedInput.id ?? id("candidate-rule", `${redactedInput.provenance.runId}:${redactedInput.title}:${redactedInput.rule}:${database.candidateRules.length}`),
      namespace: clone(redactedInput.namespace),
      status: redactedInput.status ?? "candidate",
      title: redactedInput.title,
      rule: redactedInput.rule,
      scope: clone(redactedInput.scope),
      evidence: clone(redactedInput.evidence),
      provenance: clone(redactedInput.provenance),
      redaction: mergeRedactions(redaction, redactedInput.redaction ?? { applied: false, redactedPaths: [], redactionCount: 0 }),
      createdAt,
      updatedAt: redactedInput.updatedAt ?? createdAt,
      supersededBy: redactedInput.supersededBy,
    };
    database.candidateRules.push(rule);
    await this.writeDatabase(database);
    return clone(rule);
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
    const database = await this.readDatabase();
    const index = database.candidateRules.findIndex((rule) => rule.id === idValue);
    if (index < 0) {
      throw new MemoryStoreFailure("candidate_rule_not_found", `candidate rule not found: ${idValue}`);
    }
    const current = database.candidateRules[index];
    if (!canTransition(current.status, status)) {
      throw new MemoryStoreFailure("invalid_status_transition", `invalid candidate rule status transition: ${current.status} -> ${status}`);
    }
    const updated: CandidateRule = {
      ...current,
      status,
      updatedAt: now(),
      supersededBy: status === "superseded" ? options.supersededBy : current.supersededBy,
    };
    database.candidateRules[index] = updated;
    await this.writeDatabase(database);
    return clone(updated);
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
    const safeStorePath = this.validateStorePath();
    const artifactJson = JSON.stringify(source);
    return {
      id: `${slug(label)}-${sha256(`${safeStorePath}:${suffix}:${artifactJson}`).slice(0, 10)}`,
      kind,
      uri: `file://${safeStorePath}`,
      label,
      sha256: sha256(artifactJson),
    };
  }

  private async readDatabase(storePath = this.storePath): Promise<MemoryDatabase> {
    const safeStorePath = this.validateStorePath(storePath);
    try {
      const parsed = JSON.parse(await readFile(safeStorePath, "utf8")) as Partial<MemoryDatabase>;
      return {
        episodes: Array.isArray(parsed.episodes) ? parsed.episodes : [],
        candidateRules: Array.isArray(parsed.candidateRules) ? parsed.candidateRules : [],
      };
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
        return { episodes: [], candidateRules: [] };
      }
      throw error;
    }
  }

  private async writeDatabase(database: MemoryDatabase, storePath = this.storePath): Promise<void> {
    const safeStorePath = this.validateStorePath(storePath);
    await mkdir(path.dirname(safeStorePath), { recursive: true });
    await writeFile(safeStorePath, `${JSON.stringify(database, null, 2)}\n`, "utf8");
  }
}

export class InMemoryMemoryStore extends LocalJsonMemoryStore {
  constructor() {
    super({ memoryRoot: path.join(tmpdir(), "codepawl", "memory", `in-memory-${Date.now()}-${Math.random().toString(36).slice(2)}`) });
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
      (options.memoryStore instanceof LocalJsonMemoryStore ? options.memoryStore.memoryRoot : path.join(tmpdir(), "codepawl", "memory"));
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
          stdout: command.stdout,
          stderr: command.stderr,
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
