import {
  access,
  cp,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";

import {
  LocalCapabilityLedger,
  LocalImprovementRuntime,
} from "@codepawl/capability-runtime";
import {
  atomicWriteFileDurable,
  withExclusiveFileLock,
} from "@codepawl/local-state";
import {
  LocalJsonMemoryStore,
  LocalSqliteContextVmStore,
  SqliteContextVmMemoryStore,
} from "@codepawl/memory";
import type {
  AgentFunctionTool,
  AgentToolCall,
  AgentToolExecutor,
  AgentToolResult,
} from "@codepawl/model-runtime";
import {
  IMPROVEMENT_STORE_SCHEMA_VERSION,
  INTELLIGENCE_LAYOUT_VERSION,
  MEMORY_STORE_SCHEMA_VERSION,
  canonicalEvidenceJson,
  contextVmContextPackId,
  contextVmSessionId,
  contextVmTaskId,
  parseContextVmMemoryDecisionV1,
  parseContextVmMemoryDecisionV2,
  redactSensitiveText,
  type ActiveImprovementV2,
  type ContextVmRetrievalViewV1,
  type RevisionBoundEvidenceClosureV1,
  type AgentEvidenceQueryProfileV1,
  type AgentIntelligenceItemKind,
  type AgentIntelligenceItemV1,
  type CapabilityRuntimeSettingsV1,
  type ImprovementStoreEnvelopeV2,
  type IntelligenceSearchQueryV1,
  type IntelligenceSearchResultV1,
  type IntelligenceStateLayoutV1,
  type IntelligenceStatusV1,
  type ContextVmVerificationReportV1,
  type ContextVmRetrievalRequestV1,
  type ContextVmContextPackItemV1,
  type ContextVmContextPackV1,
  type ContextVmContextRequestV1,
  type ContextVmMemoryDecisionV1,
  type ContextVmMemoryDecisionV2,
  type ContextVmInvocationRequestV1,
  type ContextVmInvocationRequestV2,
  type ContextVmDecisionDriverV1,
  type ContextVmDecisionDriverV2,
  type ContextVmResolvedInvocationV1,
  type ContextVmResolvedInvocationV2,
  type ContextVmMissingMemoryV1,
  type ContextVmPageFaultOutcomeV1,
  type ContextVmPageFaultRoundV1,
  type ContextVmRetrievalCandidateV1,
  type MemoryNamespace,
  type RepositoryEvidenceScopeV1,
} from "@codepawl/shared";

const MIGRATION_ID = "legacy-v1";
const CONTEXTVM_MEMORY_MIGRATION_ID = "contextvm-memory-v1";
const MAX_SEARCH_LIMIT = 20;
const MAX_PAGE_FAULT_ROUNDS = 3;
const MAX_PAGE_FAULT_TOKENS = 12_000;

function canonicalMissing(
  missing: readonly ContextVmMissingMemoryV1[],
): ContextVmMissingMemoryV1[] {
  return missing
    .map((item) => ({
      ...item,
      entities: [...new Set(item.entities.map((entity) => entity.trim()))]
        .sort(),
      requiredSourceTypes: [...new Set(item.requiredSourceTypes)].sort(),
    }))
    .sort((left, right) =>
      JSON.stringify(left).localeCompare(JSON.stringify(right))
    );
}

function faultHash(missing: readonly ContextVmMissingMemoryV1[]): string {
  return digest(JSON.stringify(canonicalMissing(missing)));
}

function evidenceQuality(
  candidate: ContextVmRetrievalCandidateV1,
): "derived" | "accepted" | "verified" | "unsupported" {
  if (
    candidate.page.evidencePriority === "current_user" ||
    candidate.page.evidencePriority === "verified_tool"
  ) {
    return "verified";
  }
  if (candidate.page.evidencePriority === "accepted_decision") {
    return "accepted";
  }
  if (candidate.page.evidencePriority === "derived_state") return "derived";
  return "unsupported";
}

function meetsEvidenceQuality(
  candidate: ContextVmRetrievalCandidateV1,
  minimum: ContextVmMissingMemoryV1["minimumEvidenceQuality"],
): boolean {
  const rank = { unsupported: 0, derived: 1, accepted: 2, verified: 3 };
  return rank[evidenceQuality(candidate)] >= rank[minimum];
}

function matchesRequiredSourceType(
  candidate: ContextVmRetrievalCandidateV1,
  missing: ContextVmMissingMemoryV1,
): boolean {
  const content =
    candidate.page.content &&
      typeof candidate.page.content === "object" &&
      !Array.isArray(candidate.page.content)
      ? candidate.page.content as Record<string, unknown>
      : {};
  const eventKind = String(content.eventKind ?? "");
  const available = new Set<string>([
    candidate.page.kind,
    eventKind,
    ...(candidate.page.sources.some(({ type }) => type === "artifact")
      ? ["artifact"]
      : []),
    ...(eventKind === "file_write" || eventKind === "file_read"
      ? ["file_change", "code"]
      : []),
  ]);
  return missing.requiredSourceTypes.some((sourceType) =>
    available.has(sourceType)
  );
}

function matchesMissingMemory(
  candidate: ContextVmRetrievalCandidateV1,
  missing: ContextVmMissingMemoryV1,
): boolean {
  const searchable = [
    candidate.page.summary,
    candidate.page.normalizedContent,
    ...candidate.page.entityIds,
  ].join("\n").toLocaleLowerCase();
  if (
    missing.entities.some(
      (entity) => !searchable.includes(entity.toLocaleLowerCase()),
    )
  ) {
    return false;
  }
  if (
    missing.relation &&
    !candidate.page.relations.some(({ type }) => type === missing.relation)
  ) {
    return false;
  }
  if (missing.timeRange) {
    const pageStart = Date.parse(candidate.page.validFrom);
    const pageEnd = candidate.page.validUntil
      ? Date.parse(candidate.page.validUntil)
      : Number.POSITIVE_INFINITY;
    if (
      pageStart >= Date.parse(missing.timeRange.end) ||
      pageEnd <= Date.parse(missing.timeRange.start)
    ) {
      return false;
    }
  }
  return (
    meetsEvidenceQuality(candidate, missing.minimumEvidenceQuality) &&
    matchesRequiredSourceType(candidate, missing)
  );
}

function evidenceQueryProfile(query: string): AgentEvidenceQueryProfileV1 {
  const normalized = query.toLowerCase();
  if (/\b(why|cause|caused|because|root cause|reason)\b/u.test(normalized)) {
    return { intent: "causal", expectedEvidenceTypes: ["decision", "test_result", "error"], reasons: ["causal_lexical_cue"] };
  }
  if (/\b(before|after|previous|latest|history|when|changed)\b/u.test(normalized)) {
    return { intent: "temporal", expectedEvidenceTypes: ["state_transition", "test_result"], reasons: ["temporal_lexical_cue"] };
  }
  if (/\b(depends|related|calls|imports|uses|relationship)\b/u.test(normalized)) {
    return { intent: "relational", expectedEvidenceTypes: ["dependency", "relation"], reasons: ["relational_lexical_cue"] };
  }
  return { intent: "local", expectedEvidenceTypes: ["fact", "procedure", "test_result"], reasons: ["default_local_profile"] };
}

export class IntelligenceStateFailure extends Error {
  readonly code:
    | "INTELLIGENCE_MIGRATION_BLOCKED"
    | "INTELLIGENCE_STORE_BLOCKED";

  constructor(code: IntelligenceStateFailure["code"], message: string) {
    super(message);
    this.name = "IntelligenceStateFailure";
    this.code = code;
  }
}

export function resolveIntelligenceStateLayout(
  stateRoot: string,
): IntelligenceStateLayoutV1 {
  if (!path.isAbsolute(stateRoot)) {
    throw new Error("Intelligence state root must be absolute.");
  }
  const resolvedStateRoot = path.resolve(stateRoot);
  const intelligenceRoot = path.join(resolvedStateRoot, "intelligence");
  const contextVmRoot = path.join(intelligenceRoot, "contextvm");
  const memoryRoot = path.join(intelligenceRoot, "memory");
  const improvementsRoot = path.join(intelligenceRoot, "improvements");
  return {
    layoutVersion: INTELLIGENCE_LAYOUT_VERSION,
    stateRoot: resolvedStateRoot,
    intelligenceRoot,
    contextVmRoot,
    contextVmDatabasePath: path.join(contextVmRoot, "db", "contextvm.sqlite3"),
    contextVmArchiveRoot: path.join(contextVmRoot, "archive", "sha256"),
    contextVmReportsRoot: path.join(contextVmRoot, "reports"),
    memoryRoot,
    memoryStorePath: path.join(memoryRoot, "store-v3.json"),
    memoryArtifactsRoot: path.join(memoryRoot, "artifacts"),
    improvementsRoot,
    improvementStorePath: path.join(improvementsRoot, "store-v2.json"),
    improvementArtifactsRoot: path.join(improvementsRoot, "artifacts"),
    migrationsRoot: path.join(intelligenceRoot, "migrations"),
    cognitiveStateRoot: path.join(resolvedStateRoot, "runtime", "cognitive-state"),
  };
}

function exists(filePath: string): Promise<boolean> {
  return access(filePath).then(() => true, () => false);
}

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function contextVmNamespace(namespace: MemoryNamespace): string {
  return [
    namespace.capabilityId,
    namespace.workspaceId,
    namespace.repositoryPath ?? "",
    namespace.projectId ?? "",
  ].join("|");
}

function estimateContextTokens(value: string): number {
  // A UTF-8 byte is a conservative upper bound for tokenizer output across
  // providers. Correctness takes precedence over packing density.
  return Buffer.byteLength(value, "utf8");
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function rewriteManagedPaths(
  value: unknown,
  legacyRoot: string,
  canonicalRoot: string,
): unknown {
  if (typeof value === "string") {
    return value.replaceAll(legacyRoot, canonicalRoot);
  }
  if (Array.isArray(value)) {
    return value.map((item) =>
      rewriteManagedPaths(item, legacyRoot, canonicalRoot)
    );
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [
        key,
        rewriteManagedPaths(nested, legacyRoot, canonicalRoot),
      ]),
    );
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function legacyImprovementStore(
  ledger: unknown,
  activeRegistry: unknown,
): ImprovementStoreEnvelopeV2 {
  if (
    !isRecord(ledger) ||
    ledger.schemaVersion !== 1 ||
    !Array.isArray(ledger.outcomes) ||
    !Array.isArray(ledger.candidates) ||
    !Array.isArray(ledger.audit)
  ) {
    throw new IntelligenceStateFailure(
      "INTELLIGENCE_MIGRATION_BLOCKED",
      "Legacy improvement ledger has an invalid schema.",
    );
  }
  const activeTargets =
    isRecord(activeRegistry) && isRecord(activeRegistry.active)
      ? activeRegistry.active as Record<string, ActiveImprovementV2>
      : {};
  return {
    schemaVersion: IMPROVEMENT_STORE_SCHEMA_VERSION,
    revision:
      Number.isInteger(ledger.revision) ? Number(ledger.revision) : 0,
    outcomes: structuredClone(ledger.outcomes) as ImprovementStoreEnvelopeV2["outcomes"],
    candidates: structuredClone(ledger.candidates) as ImprovementStoreEnvelopeV2["candidates"],
    activeTargets: structuredClone(activeTargets),
    audit: (ledger.audit as Array<Record<string, unknown>>).map(
      (entry, index) => ({
        id:
          typeof entry.id === "string"
            ? entry.id
            : `legacy-audit-${index}`,
        operation:
          typeof entry.operation === "string"
            ? entry.operation as ImprovementStoreEnvelopeV2["audit"][number]["operation"]
            : "candidate.upserted",
        targetId:
          typeof entry.targetId === "string" ? entry.targetId : "legacy",
        recordedAt:
          typeof entry.recordedAt === "string"
            ? entry.recordedAt
            : new Date(0).toISOString(),
        reasonCodes: Array.isArray(entry.reasonCodes)
          ? entry.reasonCodes.filter(
              (item): item is string => typeof item === "string",
            )
          : ["legacy_migration"],
        committedRevision: index + 1,
      }),
    ),
    updatedAt:
      typeof ledger.updatedAt === "string"
        ? ledger.updatedAt
        : new Date(0).toISOString(),
  };
}

export class LocalIntelligenceRuntime {
  readonly layout: IntelligenceStateLayoutV1;
  readonly memoryStore: SqliteContextVmMemoryStore;
  readonly contextVm: LocalSqliteContextVmStore;
  readonly improvementLedger: LocalCapabilityLedger;
  readonly improvementRuntime: LocalImprovementRuntime;
  private initialized = false;

  constructor(stateRoot: string) {
    this.layout = resolveIntelligenceStateLayout(stateRoot);
    this.contextVm = new LocalSqliteContextVmStore({
      root: this.layout.contextVmRoot,
    });
    this.memoryStore = new SqliteContextVmMemoryStore({
      contextVm: this.contextVm,
      legacyMemoryRoot: this.layout.memoryRoot,
    });
    this.improvementLedger = new LocalCapabilityLedger(
      this.layout.intelligenceRoot,
    );
    this.improvementRuntime = new LocalImprovementRuntime(
      this.layout.stateRoot,
    );
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    await mkdir(this.layout.intelligenceRoot, {
      recursive: true,
      mode: 0o700,
    });
    await this.contextVm.initialize();
    await this.migrateLegacyState();
    await this.migrateContextVmMemory();
    try {
      await Promise.all([
        this.memoryStore.getStoreSnapshot(),
        this.improvementLedger.load(),
      ]);
      await this.improvementRuntime.loadActiveArtifacts();
    } catch (error) {
      throw new IntelligenceStateFailure(
        "INTELLIGENCE_STORE_BLOCKED",
        `Canonical intelligence state is invalid: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    this.initialized = true;
  }

  private async migrateLegacyState(): Promise<void> {
    const legacyMemoryRoot = path.join(this.layout.stateRoot, "memory");
    const legacyMemoryStore = path.join(legacyMemoryRoot, "memory-store.json");
    const legacyLedger = path.join(
      this.layout.intelligenceRoot,
      "capability-ledger-v1.json",
    );
    const legacyActive = path.join(
      this.layout.improvementsRoot,
      "active-v1.json",
    );
    const hasLegacyMemory = await exists(legacyMemoryStore);
    const hasLegacyLedger = await exists(legacyLedger);
    const hasLegacyActive = await exists(legacyActive);
    if (!hasLegacyMemory && !hasLegacyLedger && !hasLegacyActive) return;

    const migrationRoot = path.join(
      this.layout.migrationsRoot,
      MIGRATION_ID,
    );
    const backupRoot = path.join(migrationRoot, "legacy");
    const journalPath = path.join(migrationRoot, "journal-v1.json");
    const resumingMigration = await exists(journalPath);
    if (
      !resumingMigration &&
      (
        (hasLegacyMemory && await exists(this.layout.memoryStorePath)) ||
        (
          (hasLegacyLedger || hasLegacyActive) &&
          await exists(this.layout.improvementStorePath)
        )
      )
    ) {
      throw new IntelligenceStateFailure(
        "INTELLIGENCE_MIGRATION_BLOCKED",
        "Legacy and canonical intelligence stores both exist without a migration journal. Refusing to guess which state is authoritative.",
      );
    }
    await mkdir(backupRoot, { recursive: true, mode: 0o700 });
    await atomicWriteFileDurable(
      journalPath,
      json({
        schemaVersion: 1,
        id: MIGRATION_ID,
        phase: "staging",
        updatedAt: new Date().toISOString(),
      }),
    );

    try {
      if (
        hasLegacyMemory &&
        !(await exists(this.layout.memoryStorePath))
      ) {
        const legacyStore = new LocalJsonMemoryStore({
          memoryRoot: legacyMemoryRoot,
        });
        const snapshot = await legacyStore.getStoreSnapshot();
        if (snapshot.schemaVersion !== MEMORY_STORE_SCHEMA_VERSION) {
          throw new Error("Legacy memory schema is unsupported.");
        }
        const legacyArtifacts = path.join(legacyMemoryRoot, "artifacts");
        if (await exists(legacyArtifacts)) {
          await cp(legacyArtifacts, this.layout.memoryArtifactsRoot, {
            recursive: true,
            errorOnExist: false,
          });
        }
        await atomicWriteFileDurable(
          this.layout.memoryStorePath,
          json(
            rewriteManagedPaths(
              snapshot,
              legacyMemoryRoot,
              this.layout.memoryRoot,
            ),
          ),
        );
      }

      if (
        (hasLegacyLedger || hasLegacyActive) &&
        !(await exists(this.layout.improvementStorePath))
      ) {
        const ledger = hasLegacyLedger
          ? JSON.parse(await readFile(legacyLedger, "utf8")) as unknown
          : {
              schemaVersion: 1,
              revision: 0,
              outcomes: [],
              candidates: [],
              audit: [],
              updatedAt: new Date(0).toISOString(),
            };
        const active = hasLegacyActive
          ? JSON.parse(await readFile(legacyActive, "utf8")) as unknown
          : undefined;
        await atomicWriteFileDurable(
          this.layout.improvementStorePath,
          json(legacyImprovementStore(ledger, active)),
        );
      }

      const canonicalJsonMemory = new LocalJsonMemoryStore({
        memoryRoot: this.layout.memoryRoot,
        storeFileName: "store-v3.json",
      });
      await Promise.all([
        canonicalJsonMemory.getStoreSnapshot(),
        this.improvementLedger.load(),
      ]);
      await atomicWriteFileDurable(
        journalPath,
        json({
          schemaVersion: 1,
          id: MIGRATION_ID,
          phase: "canonical_committed",
          updatedAt: new Date().toISOString(),
        }),
      );

      const backupMemory = path.join(backupRoot, "memory");
      const legacyCognitiveState = path.join(
        legacyMemoryRoot,
        "cognitive-state",
      );
      if (
        hasLegacyMemory &&
        await exists(legacyCognitiveState) &&
        !(await exists(this.layout.cognitiveStateRoot))
      ) {
        await mkdir(path.dirname(this.layout.cognitiveStateRoot), {
          recursive: true,
        });
        await rename(legacyCognitiveState, this.layout.cognitiveStateRoot);
      }
      if (hasLegacyMemory && !(await exists(backupMemory))) {
        await rename(legacyMemoryRoot, backupMemory);
      }
      if (hasLegacyLedger && await exists(legacyLedger)) {
        await rename(
          legacyLedger,
          path.join(backupRoot, "capability-ledger-v1.json"),
        );
      }
      if (hasLegacyActive && await exists(legacyActive)) {
        await rename(
          legacyActive,
          path.join(backupRoot, "active-v1.json"),
        );
      }
      await atomicWriteFileDurable(
        journalPath,
        json({
          schemaVersion: 1,
          id: MIGRATION_ID,
          phase: "completed",
          updatedAt: new Date().toISOString(),
        }),
      );
    } catch (error) {
      await atomicWriteFileDurable(
        journalPath,
        json({
          schemaVersion: 1,
          id: MIGRATION_ID,
          phase: "blocked",
          error: error instanceof Error ? error.message : String(error),
          updatedAt: new Date().toISOString(),
        }),
      );
      throw new IntelligenceStateFailure(
        "INTELLIGENCE_MIGRATION_BLOCKED",
        `Intelligence migration failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private async migrateContextVmMemory(): Promise<void> {
    const migrationRoot = path.join(
      this.layout.migrationsRoot,
      CONTEXTVM_MEMORY_MIGRATION_ID,
    );
    const journalPath = path.join(migrationRoot, "journal-v1.json");
    const backupRoot = path.join(migrationRoot, "legacy-json-v3");
    const hasLegacyJson = await exists(this.layout.memoryStorePath);
    const hasCompletedJournal = await exists(journalPath)
      ? JSON.parse(await readFile(journalPath, "utf8") as string).phase === "completed"
      : false;
    if (!hasLegacyJson && hasCompletedJournal) return;
    if (!hasLegacyJson) {
      await mkdir(migrationRoot, { recursive: true, mode: 0o700 });
      await mkdir(this.layout.memoryRoot, { recursive: true, mode: 0o700 });
      await atomicWriteFileDurable(
        path.join(this.layout.memoryRoot, ".contextvm-authority"),
        json({
          schemaVersion: 1,
          authority: "contextvm_sqlite_v2",
          source: "empty",
          migratedAt: new Date().toISOString(),
        }),
      );
      await atomicWriteFileDurable(
        journalPath,
        json({
          schemaVersion: 1,
          id: CONTEXTVM_MEMORY_MIGRATION_ID,
          phase: "completed",
          source: "empty",
          updatedAt: new Date().toISOString(),
        }),
      );
      return;
    }

    await mkdir(backupRoot, { recursive: true, mode: 0o700 });
    await atomicWriteFileDurable(
      journalPath,
      json({
        schemaVersion: 1,
        id: CONTEXTVM_MEMORY_MIGRATION_ID,
        phase: "staging",
        updatedAt: new Date().toISOString(),
      }),
    );
    try {
      await withExclusiveFileLock(this.layout.memoryStorePath, async () => {
      const sourceBytes = await readFile(this.layout.memoryStorePath);
      const sourceDigest = createHash("sha256")
        .update(sourceBytes)
        .digest("hex");
      await atomicWriteFileDurable(
        journalPath,
        json({
          schemaVersion: 1,
          id: CONTEXTVM_MEMORY_MIGRATION_ID,
          phase: "staging",
          sourceDigest,
          updatedAt: new Date().toISOString(),
        }),
      );
      const legacyStore = new LocalJsonMemoryStore({
        memoryRoot: this.layout.memoryRoot,
        storeFileName: "store-v3.json",
      });
      const snapshot = await legacyStore.getStoreSnapshot();
      if (snapshot.schemaVersion !== MEMORY_STORE_SCHEMA_VERSION) {
        throw new Error("Canonical JSON memory schema is unsupported.");
      }
      await this.contextVm.importMemoryEnvelope(snapshot, {
        sourceLabel: "Legacy JSON memory v3 migration snapshot",
        sourceBytes,
      });
      const imported = await this.contextVm.getMemoryEnvelope();
      if (!isDeepStrictEqual(imported, snapshot)) {
        throw new Error("ContextVM memory round-trip verification failed.");
      }
      await atomicWriteFileDurable(
        journalPath,
        json({
          schemaVersion: 1,
          id: CONTEXTVM_MEMORY_MIGRATION_ID,
          phase: "verified",
          sourceDigest,
          revision: imported.revision,
          itemCount:
            imported.episodes.length +
            imported.candidateRules.length +
            imported.semanticMemory.length,
          updatedAt: new Date().toISOString(),
        }),
      );
      await atomicWriteFileDurable(
        path.join(this.layout.memoryRoot, ".contextvm-authority"),
        json({
          schemaVersion: 1,
          authority: "contextvm_sqlite_v2",
          sourceDigest,
          migratedAt: new Date().toISOString(),
        }),
      );
      const backupStorePath = path.join(backupRoot, "store-v3.json");
      if (!(await exists(backupStorePath))) {
        await rename(this.layout.memoryStorePath, backupStorePath);
      }
      if (
        await exists(this.layout.memoryArtifactsRoot) &&
        !(await exists(path.join(backupRoot, "artifacts")))
      ) {
        await rename(
          this.layout.memoryArtifactsRoot,
          path.join(backupRoot, "artifacts"),
        );
      }
      await atomicWriteFileDurable(
        journalPath,
        json({
          schemaVersion: 1,
          id: CONTEXTVM_MEMORY_MIGRATION_ID,
          phase: "completed",
          authority: "contextvm_sqlite_v2",
          sourceDigest,
          revision: imported.revision,
          updatedAt: new Date().toISOString(),
        }),
      );
      });
    } catch (error) {
      await atomicWriteFileDurable(
        journalPath,
        json({
          schemaVersion: 1,
          id: CONTEXTVM_MEMORY_MIGRATION_ID,
          phase: "blocked",
          error: error instanceof Error ? error.message : String(error),
          updatedAt: new Date().toISOString(),
        }),
      );
      throw new IntelligenceStateFailure(
        "INTELLIGENCE_MIGRATION_BLOCKED",
        `ContextVM memory migration failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  async buildContextPack(
    request: ContextVmContextRequestV1,
  ): Promise<ContextVmContextPackV1> {
    await this.initialize();
    if (
      request.schemaVersion !== 1 ||
      !request.namespace.trim() ||
      !request.userRequest.trim() ||
      !Number.isInteger(request.hardBudgetTokens) ||
      request.hardBudgetTokens < 256 ||
      request.hardBudgetTokens > 4_000
    ) {
      throw new Error("Invalid ContextVM context request.");
    }
    if (
      request.conversationContext &&
      (
        (request.conversationContext.summary?.length ?? 0) > 4_000 ||
        request.conversationContext.recentTurns.length > 6 ||
        request.conversationContext.recentTurns.some((turn) =>
          !["user", "assistant"].includes(turn.role) ||
          !turn.content.trim() ||
          turn.content.length > 2_000
        )
      )
    ) {
      throw new Error("Invalid ContextVM conversation context.");
    }
    if (
      request.continuation &&
      (
        !Number.isInteger(request.continuation.round) ||
        request.continuation.round < 1 ||
        request.continuation.round > MAX_PAGE_FAULT_ROUNDS ||
        !/^[0-9a-f]{64}$/u.test(request.continuation.faultHash) ||
        request.continuation.missing.length < 1 ||
        request.continuation.missing.length > 8
      )
    ) {
      throw new Error("Invalid ContextVM context continuation.");
    }
    const requestHash = digest(JSON.stringify(request));
    const createdAt = new Date().toISOString();
    const reserve = Math.max(32, Math.floor(request.hardBudgetTokens * 0.1));
    const contentBudget = request.hardBudgetTokens - reserve;
    const items: ContextVmContextPackItemV1[] = [];
    const seen = new Set<string>();
    if (request.continuation) {
      let previousId: typeof request.continuation.previousContextPackId
        | undefined = request.continuation.previousContextPackId;
      const visited = new Set<string>();
      while (previousId) {
        if (visited.has(previousId) || visited.size > MAX_PAGE_FAULT_ROUNDS) {
          throw new Error("ContextVM continuation lineage is cyclic or too deep.");
        }
        visited.add(previousId);
        const previous = await this.contextVm.inspectContextPack(previousId);
        if (!previous) {
          throw new Error(
            `ContextVM continuation parent was not found: ${previousId}`,
          );
        }
        for (const item of previous.items) seen.add(item.contentHash);
        if (previous.id === request.continuation.rootContextPackId) break;
        previousId = previous.previousContextPackId;
      }
      if (!visited.has(request.continuation.rootContextPackId)) {
        throw new Error("ContextVM continuation does not reach its root pack.");
      }
    }
    const add = (
      section: ContextVmContextPackItemV1["section"],
      sourceType: ContextVmContextPackItemV1["sourceType"],
      sourceId: string,
      rawText: string,
      loadReason: string,
      retrievalScores?: ContextVmContextPackItemV1["retrievalScores"],
      metadata?: Pick<
        ContextVmContextPackItemV1,
        "entityIds" | "sourceTypes" | "evidenceQuality" | "sensitivity"
      >,
    ): boolean => {
      const redacted = redactSensitiveText(rawText);
      const contentHash = digest(redacted.value);
      if (seen.has(contentHash)) return true;
      const tokenCount = estimateContextTokens(redacted.value);
      if (
        items.reduce((sum, item) => sum + item.tokenCount, 0) + tokenCount >
        contentBudget
      ) return false;
      seen.add(contentHash);
      items.push({
        section,
        sourceType,
        sourceId,
        text: redacted.value,
        tokenCount,
        loadReason,
        ...(retrievalScores ? { retrievalScores } : {}),
        ...(metadata ?? {}),
        contentHash,
        redaction: redacted.redaction,
      });
      return true;
    };

    const mandatory = [
      ...(request.policy
        ? [{
            section: "policy" as const,
            id: "request:policy",
            text: request.policy,
            reason: "mandatory_policy",
          }]
        : []),
      {
        section: "current_goal" as const,
        id: "request:goal",
        text: request.currentGoal ?? request.userRequest,
        reason: "mandatory_current_goal",
      },
      ...request.constraints.filter(({ required }) => required).map((constraint) => ({
        section: "active_constraints" as const,
        id: `constraint:${constraint.id}`,
        text: constraint.text,
        reason: "mandatory_required_constraint",
      })),
    ];
    const mandatoryTokens = mandatory.reduce(
      (sum, item) => sum + estimateContextTokens(redactSensitiveText(item.text).value),
      0,
    );
    const gaps: string[] = [];
    if (mandatoryTokens > contentBudget) {
      gaps.push("Mandatory policy, goal, and constraints exceed the hard context budget.");
    } else {
      for (const item of mandatory) {
        add(item.section, "inline", item.id, item.text, item.reason);
      }
      if (request.currentPlan) {
        add(
          "current_task_state",
          "inline",
          "request:plan",
          request.currentPlan,
          "current_plan",
        );
      }
      if (request.currentAction) {
        add(
          "current_task_state",
          "inline",
          "request:action",
          request.currentAction,
          "current_action",
        );
      }
      if (request.conversationContext) {
        const selectedTurns: Array<{
          index: number;
          role: "user" | "assistant";
          text: string;
        }> = [];
        let remainingConversationBudget =
          contentBudget -
          items.reduce((sum, item) => sum + item.tokenCount, 0);
        for (
          let index = request.conversationContext.recentTurns.length - 1;
          index >= 0;
          index -= 1
        ) {
          const turn = request.conversationContext.recentTurns[index]!;
          const text = `${turn.role === "user" ? "User" : "Assistant"}: ${turn.content}`;
          const tokens = estimateContextTokens(redactSensitiveText(text).value);
          if (tokens > remainingConversationBudget) break;
          selectedTurns.unshift({
            index,
            role: turn.role,
            text,
          });
          remainingConversationBudget -= tokens;
        }
        if (
          selectedTurns.length <
            request.conversationContext.recentTurns.length
        ) {
          gaps.push(
            "Older conversation turns were omitted by the hard token budget.",
          );
        }
        for (const turn of selectedTurns) {
          add(
            "recent_interaction",
            "inline",
            `request:conversation-turn:${turn.index}`,
            turn.text,
            `bounded_conversation_${turn.role}`,
          );
        }
        if (request.conversationContext.summary) {
          add(
            "recent_interaction",
            "inline",
            "request:conversation-summary",
            `Advisory summary: ${request.conversationContext.summary}`,
            "bounded_conversation_summary",
          );
        }
      }
      for (const constraint of request.constraints.filter(({ required }) => !required)) {
        if (!add(
          "active_constraints",
          "inline",
          `constraint:${constraint.id}`,
          constraint.text,
          "preferred_constraint",
        )) break;
      }
      for (const evidence of request.revisionBoundEvidence ?? []) {
        if (!add(
          "verified_evidence",
          "artifact",
          evidence.sourceId,
          evidence.text,
          "revision_bound_runtime_evidence",
          undefined,
          {
            sourceTypes: ["artifact"],
            evidenceQuality: evidence.evidenceQuality,
            sensitivity: "internal",
          },
        )) {
          gaps.push("Revision-bound runtime evidence was omitted by the hard token budget.");
          break;
        }
      }
      if ((request.retrievalMode ?? "hybrid") === "hybrid") {
        const recent = await this.contextVm.scanSession({
          sessionId: request.sessionId,
          limit: 10,
        });
        for (const event of recent.slice(-6)) {
        const summary = event.payload && typeof event.payload === "object" &&
          !Array.isArray(event.payload) &&
          typeof (event.payload as Record<string, unknown>).summary === "string"
          ? String((event.payload as Record<string, unknown>).summary)
          : `${event.kind} from ${event.actor.id}`;
          if (!add(
            "recent_interaction",
            "event",
            event.id,
            summary,
            "recent_session_event",
          )) break;
        }
        const retrievalQueries = request.continuation
        ? request.continuation.missing.map((missing) => ({
            missing,
            query: [
              missing.kind,
              ...missing.entities,
              missing.relation ?? "",
              ...missing.requiredSourceTypes,
            ].filter(Boolean).join(" "),
          }))
        : [{
            missing: undefined,
            query: request.userRequest,
          }];
        const retrieved = new Map<string, ContextVmRetrievalCandidateV1>();
        for (const retrievalQuery of retrievalQueries) {
        const retrieval = await this.contextVm.retrieveMemoryPages({
          namespace: request.namespace,
          query: retrievalQuery.query,
          entityIds: retrievalQuery.missing
            ? []
            : request.requestedEntities,
          ...(retrievalQuery.missing?.timeRange
            ? {
                includeHistory: true,
              }
            : {}),
          hopLimit:
            retrievalQuery.missing?.relation ||
              (retrievalQuery.missing?.entities.length ??
                request.requestedEntities.length) > 0
              ? 2
              : 1,
          topK: 100,
          ...(request.principalId ? { principalId: request.principalId } : {}),
          ...(request.allowedSensitivity
            ? { allowedSensitivity: request.allowedSensitivity }
            : {}),
        });
        for (const candidate of retrieval.candidates) {
          if (
            retrievalQuery.missing &&
            !matchesMissingMemory(candidate, retrievalQuery.missing)
          ) {
            continue;
          }
          const prior = retrieved.get(candidate.page.id);
          if (!prior || prior.scores.total < candidate.scores.total) {
            retrieved.set(candidate.page.id, candidate);
          }
        }
        }
        for (const candidate of [...retrieved.values()].sort(
        (left, right) =>
          right.scores.total - left.scores.total ||
          left.page.id.localeCompare(right.page.id),
        )) {
        const section = candidate.conflicted
          ? "conflicts_stale" as const
          : "verified_evidence" as const;
        const reason = candidate.conflicted
          ? "unresolved_conflict"
          : candidate.reasons.join("+") || "hybrid_retrieval";
        if (!add(
          section,
          "memory",
          candidate.page.id,
          candidate.page.summary,
          reason,
          candidate.scores,
          {
            entityIds: candidate.page.entityIds,
            sourceTypes: [
              candidate.page.kind === "decision"
                ? "decision"
                : candidate.page.kind === "observation"
                  ? "tool_result"
                  : candidate.page.kind === "procedure"
                    ? "code"
                    : "artifact",
            ],
            evidenceQuality:
              candidate.page.evidencePriority === "current_user" ||
                candidate.page.evidencePriority === "verified_tool"
                ? "verified"
                : candidate.page.evidencePriority === "accepted_decision"
                  ? "accepted"
                  : "derived",
            sensitivity: candidate.page.sensitivity ?? "internal",
          },
        )) {
          gaps.push("Additional retrieved evidence was omitted by the hard token budget.");
          break;
        }
        if (
          request.riskLevel === "high" &&
          (
            candidate.page.evidencePriority === "summary" ||
            candidate.page.producer === "contextvm-consolidator-v1"
          )
        ) {
          let loadedRawSource = false;
          for (const source of candidate.page.sources) {
            if (source.type !== "event") continue;
            const event = await this.contextVm.getEvent(source.eventId);
            if (!event) continue;
            const raw = JSON.stringify(event.payload);
            if (!add(
              "verified_evidence",
              "event",
              event.id,
              raw.slice(0, 2_000),
              `high_risk_raw_provenance:${candidate.page.id}`,
            )) {
              gaps.push(
                `Raw provenance for consolidated memory ${candidate.page.id} was omitted by the hard token budget.`,
              );
              break;
            }
            loadedRawSource = true;
          }
          if (!loadedRawSource) {
            gaps.push(
              `Consolidated memory ${candidate.page.id} has no loadable raw event provenance for high-risk use.`,
            );
          }
        }
        }
      }
      add(
        "memory_operations",
        "inline",
        "contextvm:operations",
        "Available operations: intelligence search, inspect, verify, and explain-context.",
        "available_memory_operations",
      );
    }

    const sectionLabels: Record<ContextVmContextPackItemV1["section"], string> = {
      policy: "POLICY",
      current_goal: "CURRENT GOAL",
      active_constraints: "ACTIVE CONSTRAINTS",
      current_task_state: "CURRENT TASK STATE",
      recent_interaction: "RECENT INTERACTION",
      verified_evidence: "VERIFIED EVIDENCE",
      conflicts_stale: "CONFLICTS / STALE INFORMATION",
      unresolved_dependencies: "UNRESOLVED DEPENDENCIES",
      memory_operations: "AVAILABLE MEMORY OPERATIONS",
    };
    const rendered = [...new Set(items.map(({ section }) => section))]
      .map((section) => {
        const body = items
          .filter((item) => item.section === section)
          .map((item) => {
            const trust = item.sourceType === "inline" &&
                (item.section === "policy" ||
                  item.section === "current_goal" ||
                  item.section === "active_constraints" ||
                  item.section === "current_task_state")
              ? "TRUSTED_AUTHORITY"
              : "UNTRUSTED_EVIDENCE";
            return [
              `<${trust} source="${item.sourceType}:${item.sourceId}">`,
              item.text,
              `</${trust}>`,
            ].join("\n");
          })
          .join("\n");
        return `[${sectionLabels[section]}]\n${body}`;
      })
      .join("\n\n");
    const renderedTokens = items.reduce((sum, item) => sum + item.tokenCount, 0);
    const renderedHash = digest(rendered);
    const requestedSlots = Math.max(
      1,
      1 + request.constraints.filter(({ required }) => required).length +
        request.requestedEntities.length,
    );
    const coveredSlots =
      (mandatoryTokens <= contentBudget ? 1 : 0) +
      request.constraints.filter((constraint) => constraint.required && seen.has(
        digest(redactSensitiveText(constraint.text).value),
      )).length +
      request.requestedEntities.filter((entity) =>
        items.some((item) => item.entityIds?.includes(entity))).length;
    const evidence = items.filter(({ retrievalScores }) => retrievalScores);
    const evidenceQualityScore = evidence.length === 0
      ? 0
      : evidence.reduce(
          (sum, item) => sum + (item.retrievalScores?.sourceQuality ?? 0),
          0,
        ) / evidence.length;
    const unresolvedDependencies = (request.continuation
      ? []
      : request.requestedEntities)
      .filter((entity) => !items.some((item) => item.entityIds?.includes(entity)))
      .map((entity) => ({
        kind: "requested_entity",
        entity,
        severity: request.riskLevel === "high" ? "high" as const : "medium" as const,
      }));
    if (request.continuation) {
      for (const missing of request.continuation.missing) {
        for (const entity of missing.entities) {
          if (
            items.some((item) => item.entityIds?.includes(entity))
          ) {
            continue;
          }
          unresolvedDependencies.push({
            kind: missing.kind,
            entity,
            severity: request.riskLevel === "high"
              ? "high" as const
              : "medium" as const,
          });
        }
      }
    }
    if (unresolvedDependencies.length > 0) {
      gaps.push("One or more requested entities have no loaded evidence.");
    }
    const id = contextVmContextPackId(
      `ctx_${digest(`${requestHash}:${renderedHash}`).slice(0, 32)}`,
    );
    const pack: ContextVmContextPackV1 = {
      schemaVersion: 1,
      request: structuredClone(request),
      manifest: {
        schemaVersion: 1,
        id,
        status: mandatoryTokens > contentBudget
          ? "blocked"
          : gaps.length > 0 ? "partial" : "ready",
        requestHash,
        hardBudgetTokens: request.hardBudgetTokens,
        renderedTokens,
        reservedOutputTokens: reserve,
        coverageScore: Math.min(1, coveredSlots / requestedSlots),
        evidenceQualityScore,
        estimatorVersion: "utf8-upper-bound-v1",
        items,
        unresolvedDependencies,
        gaps,
        renderedHash,
        ...(request.continuation
          ? {
              rootContextPackId: request.continuation.rootContextPackId,
              previousContextPackId:
                request.continuation.previousContextPackId,
              faultRound: request.continuation.round,
              faultHash: request.continuation.faultHash,
            }
          : {}),
        createdAt,
      },
      rendered,
    };
    pack.manifest = await this.contextVm.persistContextPack(pack);
    return pack;
  }

  async resolveInvocationContext(input: {
    invocation: ContextVmInvocationRequestV1;
    decide: ContextVmDecisionDriverV1;
    thinkingEffort?: string;
    parentInvocationId?: string;
    loadRevisionBoundEvidence?: () => Promise<
      NonNullable<ContextVmInvocationRequestV1["revisionBoundEvidence"]>
    >;
    signal?: AbortSignal;
  }): Promise<ContextVmResolvedInvocationV1> {
    await this.initialize();
    let invocation = input.invocation;
    if (
      invocation.schemaVersion !== 1 ||
      !invocation.invocationId.trim() ||
      !invocation.modelId.trim()
    ) {
      throw new Error("Invalid ContextVM invocation request.");
    }
    if (input.loadRevisionBoundEvidence) {
      invocation = {
        ...invocation,
        revisionBoundEvidence: await input.loadRevisionBoundEvidence(),
      };
    }
    await this.contextVm.beginInvocationAudit({
      invocationId: invocation.invocationId,
      sessionId: invocation.sessionId,
      ...(invocation.taskId ? { taskId: invocation.taskId } : {}),
      role: invocation.role,
      provider: invocation.providerId,
      modelId: invocation.modelId,
      retrievalMode: invocation.retrievalMode ?? "hybrid",
      ...(input.parentInvocationId
        ? { parentInvocationId: input.parentInvocationId }
        : {}),
    });
    await this.contextVm.appendEvent({
      sessionId: invocation.sessionId,
      ...(invocation.taskId ? { taskId: invocation.taskId } : {}),
      source: {
        kind: "memory_runtime",
        id: `${invocation.invocationId}:user-input`,
      },
      occurredAt: new Date().toISOString(),
      actor: { kind: "user", id: "cli-user" },
      kind: "user_message",
      payload: {
        eventType: "user_input_recorded",
        invocationId: invocation.invocationId,
        summary: invocation.userRequest,
      },
      sensitivity: "personal",
    });
    await this.contextVm.createStateCheckpoint({
      sessionId: invocation.sessionId,
      reason: "session_checkpoint",
    });
    await this.contextVm.appendEvent({
      sessionId: invocation.sessionId,
      ...(invocation.taskId ? { taskId: invocation.taskId } : {}),
      source: {
        kind: "memory_runtime",
        id: invocation.invocationId,
      },
      occurredAt: new Date().toISOString(),
      actor: { kind: "runtime", id: "contextvm-invocation-v1" },
      kind: "state_transition",
      payload: {
        eventType: "model_inference_requested",
        invocationId: invocation.invocationId,
        role: invocation.role,
        providerId: invocation.providerId,
        modelId: invocation.modelId,
      },
      sensitivity: "internal",
    });
    let rootPack = await this.buildContextPack({
      schemaVersion: 1,
      namespace: invocation.namespace,
      sessionId: invocation.sessionId,
      ...(invocation.taskId ? { taskId: invocation.taskId } : {}),
      userRequest: invocation.userRequest,
      ...(invocation.currentGoal ? { currentGoal: invocation.currentGoal } : {}),
      ...(invocation.currentPlan ? { currentPlan: invocation.currentPlan } : {}),
      ...(invocation.currentAction
        ? { currentAction: invocation.currentAction }
        : {}),
      ...(invocation.conversationContext
        ? { conversationContext: invocation.conversationContext }
        : {}),
      ...(invocation.policy ? { policy: invocation.policy } : {}),
      ...(invocation.revisionBoundEvidence
        ? { revisionBoundEvidence: invocation.revisionBoundEvidence }
        : {}),
      constraints: invocation.constraints,
      requestedEntities: invocation.requestedEntities,
      riskLevel: invocation.riskLevel,
      hardBudgetTokens: invocation.hardBudgetTokens,
      invocationId: invocation.invocationId,
      role: invocation.role,
      ...(invocation.principalId ? { principalId: invocation.principalId } : {}),
      ...(invocation.allowedSensitivity
        ? { allowedSensitivity: invocation.allowedSensitivity }
        : {}),
      ...(invocation.retrievalMode
        ? { retrievalMode: invocation.retrievalMode }
        : {}),
    });
    if (rootPack.manifest.status === "blocked") {
      await this.contextVm.completeInvocationAudit({
        invocationId: invocation.invocationId,
        status: "blocked",
        contextPackIds: [rootPack.manifest.id],
        contextPackHash: rootPack.manifest.renderedHash,
        terminalReason: "context_pack_blocked",
      });
      return {
        schemaVersion: 1,
        status: "blocked",
        invocationId: invocation.invocationId,
        rootContextPackId: rootPack.manifest.id,
        contextPackIds: [rootPack.manifest.id],
        reason: "context_pack_blocked",
        faultRounds: [],
      };
    }
    await this.contextVm.createStateCheckpoint({
      sessionId: invocation.sessionId,
      reason: "session_checkpoint",
    });

    const packs = [rootPack];
    const outcome = await this.resolveMemoryDecisionLoop({
      initialPack: rootPack,
      decide: async ({ pack, round, signal }) => {
        if (packs.at(-1)?.manifest.id !== pack.manifest.id) packs.push(pack);
        const deterministicReadinessRole =
          invocation.role === "prompt_understanding" ||
          invocation.role === "coordinator";
        if (
          round === 0 &&
          deterministicReadinessRole &&
          pack.manifest.status === "ready" &&
          pack.manifest.gaps.length === 0 &&
          pack.manifest.unresolvedDependencies.length === 0
        ) {
          const decision: ContextVmMemoryDecisionV2 = {
            schemaVersion: 2,
            status: "READY",
          };
          await this.contextVm.recordInvocationDecision({
            invocationId: invocation.invocationId,
            round,
            decision,
            contextPackId: pack.manifest.id,
          });
          return {
            schemaVersion: 1,
            status: "READY",
            answerOrAction: {
              readinessOnly: true,
              source: "deterministic_manifest",
            },
          };
        }
        const attempt = round + 1;
        const attemptId = `${invocation.invocationId}:readiness:${attempt}`;
        await this.contextVm.recordProviderAttempt({
          attemptId,
          invocationId: invocation.invocationId,
          phase: "readiness",
          attempt,
          transport: invocation.providerId,
          modelId: invocation.modelId,
          thinkingEffort: input.thinkingEffort ?? "medium",
          status: "prepared",
          contextPackIds: [pack.manifest.id],
          contextHash: pack.manifest.renderedHash,
        });
        await this.contextVm.recordProviderDispatch({
          invocationId: invocation.invocationId,
          attempt,
          transport: invocation.providerId,
          modelId: invocation.modelId,
          status: "dispatched",
          contextPackId: pack.manifest.id,
          contextPackHash: pack.manifest.renderedHash,
        });
        await this.contextVm.recordProviderAttempt({
          attemptId,
          invocationId: invocation.invocationId,
          phase: "readiness",
          attempt,
          transport: invocation.providerId,
          modelId: invocation.modelId,
          thinkingEffort: input.thinkingEffort ?? "medium",
          status: "dispatched",
          contextPackIds: [pack.manifest.id],
          contextHash: pack.manifest.renderedHash,
        });
        let rawDecision: unknown;
        try {
          rawDecision = await input.decide({
            invocation,
            pack,
            round,
            ...(signal ? { signal } : {}),
          });
        } catch (error) {
          await this.contextVm.recordProviderDispatch({
            invocationId: invocation.invocationId,
            attempt,
            transport: invocation.providerId,
            modelId: invocation.modelId,
            status: "failed",
            contextPackId: pack.manifest.id,
            contextPackHash: pack.manifest.renderedHash,
            failureReason: error instanceof Error ? error.message : String(error),
          });
          await this.contextVm.recordProviderAttempt({
            attemptId,
            invocationId: invocation.invocationId,
            phase: "readiness",
            attempt,
            transport: invocation.providerId,
            modelId: invocation.modelId,
            thinkingEffort: input.thinkingEffort ?? "medium",
            status: "failed",
            contextPackIds: [pack.manifest.id],
            contextHash: pack.manifest.renderedHash,
            failureReason: error instanceof Error ? error.message : String(error),
          });
          throw error;
        }
        let decision: ContextVmMemoryDecisionV2;
        try {
          decision = parseContextVmMemoryDecisionV2(rawDecision);
        } catch (error) {
          throw Object.assign(
            new Error(error instanceof Error ? error.message : String(error)),
            { name: "ContextVmDecisionValidationError" },
          );
        }
        await this.contextVm.recordProviderDispatch({
          invocationId: invocation.invocationId,
          attempt,
          transport: invocation.providerId,
          modelId: invocation.modelId,
          status: "completed",
          contextPackId: pack.manifest.id,
          contextPackHash: pack.manifest.renderedHash,
        });
        await this.contextVm.recordProviderAttempt({
          attemptId,
          invocationId: invocation.invocationId,
          phase: "readiness",
          attempt,
          transport: invocation.providerId,
          modelId: invocation.modelId,
          thinkingEffort: input.thinkingEffort ?? "medium",
          status: "completed",
          contextPackIds: [pack.manifest.id],
          contextHash: pack.manifest.renderedHash,
          resultHash: digest(JSON.stringify(decision)),
        });
        await this.contextVm.recordInvocationDecision({
          invocationId: invocation.invocationId,
          round,
          decision,
          contextPackId: pack.manifest.id,
        });
        return decision.status === "READY"
          ? {
              schemaVersion: 1,
              status: "READY",
              answerOrAction: { readinessOnly: true },
            }
          : {
              schemaVersion: 1,
              status: "NEED_MEMORY",
              missing: decision.missing,
            };
      },
      ...(input.signal ? { signal: input.signal } : {}),
    });
    if (outcome.status !== "ready") {
      await this.contextVm.completeInvocationAudit({
        invocationId: invocation.invocationId,
        status: "abstained",
        contextPackIds: packs.map(({ manifest }) => manifest.id),
        contextPackHash: rootPack.manifest.renderedHash,
        terminalReason: outcome.reason,
      });
      return {
        schemaVersion: 1,
        status: "abstained",
        invocationId: invocation.invocationId,
        rootContextPackId: rootPack.manifest.id,
        contextPackIds: packs.map(({ manifest }) => manifest.id),
        reason: outcome.reason,
        faultRounds: outcome.rounds,
      };
    }
    const renderedContext = packs
      .map(({ rendered }) => rendered)
      .filter(Boolean)
      .join("\n\n");
    const checkpoint = await this.contextVm.createStateCheckpoint({
      sessionId: invocation.sessionId,
      reason: "session_checkpoint",
    });
    await this.contextVm.completeInvocationAudit({
      invocationId: invocation.invocationId,
      status: "ready",
      contextPackIds: packs.map(({ manifest }) => manifest.id),
      contextPackHash: digest(renderedContext),
      checkpointId: checkpoint.id,
    });
    return {
      schemaVersion: 1,
      status: "ready",
      invocationId: invocation.invocationId,
      rootContextPackId: rootPack.manifest.id,
      contextPackIds: packs.map(({ manifest }) => manifest.id),
      renderedContext,
      renderedContextHash: digest(renderedContext),
      coverageScore: Math.min(
        ...packs.map(({ manifest }) => manifest.coverageScore),
      ),
      faultRounds: outcome.rounds,
      checkpointId: checkpoint.id,
    };
  }

  async resolveInvocationContextV2(input: {
    invocation: ContextVmInvocationRequestV2;
    decide: ContextVmDecisionDriverV2;
    loadRevisionBoundEvidence?: () => Promise<
      NonNullable<ContextVmInvocationRequestV2["revisionBoundEvidence"]>
    >;
    signal?: AbortSignal;
  }): Promise<ContextVmResolvedInvocationV2> {
    const invocation = input.invocation;
    try {
      const resolved = await this.resolveInvocationContext({
        invocation: {
          ...invocation,
          schemaVersion: 1,
          providerId: invocation.transport,
        },
        decide: ({ pack, round, signal }) => input.decide({
          invocation,
          pack,
          round,
          ...(signal ? { signal } : {}),
        }),
        thinkingEffort: invocation.thinkingEffort,
        ...(invocation.parentInvocationId
          ? { parentInvocationId: invocation.parentInvocationId }
          : {}),
        ...(input.loadRevisionBoundEvidence
          ? { loadRevisionBoundEvidence: input.loadRevisionBoundEvidence }
          : {}),
        ...(input.signal ? { signal: input.signal } : {}),
      });
      if (resolved.status !== "ready") {
        return {
          schemaVersion: 2,
          status: resolved.status,
          invocationId: resolved.invocationId,
          reason: resolved.reason,
          contextPackIds: resolved.contextPackIds,
          faultRounds: resolved.faultRounds,
        };
      }
      const attemptCount = Math.max(1, resolved.faultRounds.length + 1);
      return {
        schemaVersion: 2,
        status: "ready",
        artifact: {
          schemaVersion: 1,
          invocationId: resolved.invocationId,
          ...(invocation.parentInvocationId
            ? { parentInvocationId: invocation.parentInvocationId }
            : {}),
          sessionId: invocation.sessionId,
          ...(invocation.taskId ? { taskId: invocation.taskId } : {}),
          role: invocation.role,
          rootContextPackId: resolved.rootContextPackId,
          orderedContextPackIds: resolved.contextPackIds,
          renderedContextHash: resolved.renderedContextHash,
          ...(resolved.checkpointId
            ? { checkpointId: resolved.checkpointId }
            : {}),
          attempts: Array.from({ length: attemptCount }, (_, index) => ({
            attemptId: `${resolved.invocationId}:readiness:${index + 1}`,
            phase: "readiness" as const,
            attempt: index + 1,
            transport: invocation.transport,
            modelId: invocation.modelId,
            thinkingEffort: invocation.thinkingEffort,
            status: "completed" as const,
            contextPackIds: [
              resolved.contextPackIds[Math.min(
                index,
                resolved.contextPackIds.length - 1,
              )]!,
            ],
            contextHash: resolved.renderedContextHash,
          })),
        },
        renderedContext: resolved.renderedContext,
        coverageScore: resolved.coverageScore,
        faultRounds: resolved.faultRounds,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const errorName = error instanceof Error ? error.name : "";
      const reason = input.signal?.aborted || errorName === "AbortError"
        ? "provider_cancelled" as const
        : errorName === "TimeoutError" || /timed? out|timeout/iu.test(message)
          ? "provider_timeout" as const
          : errorName === "ContextVmDecisionValidationError"
            ? "malformed_decision" as const
            : "provider_failure" as const;
      await this.contextVm.completeInvocationAudit({
        invocationId: invocation.invocationId,
        status: "failed",
        contextPackIds: [],
        terminalReason: reason,
      }).catch(() => undefined);
      return {
        schemaVersion: 2,
        status: "abstained",
        invocationId: invocation.invocationId,
        reason,
        contextPackIds: [],
        faultRounds: [],
      };
    }
  }

  async resolveMemoryDecisionLoop(input: {
    initialPack: ContextVmContextPackV1;
    decide(request: {
      pack: ContextVmContextPackV1;
      round: number;
      signal?: AbortSignal;
    }): Promise<unknown>;
    signal?: AbortSignal;
  }): Promise<ContextVmPageFaultOutcomeV1> {
    await this.initialize();
    const rootPackId = input.initialPack.manifest.id;
    const rounds: ContextVmPageFaultRoundV1[] = [];
    const seenFaults = new Set<string>();
    const pinned = new Set(
      input.initialPack.manifest.items.flatMap((item) =>
        item.sourceType === "memory"
          ? [item.sourceId as ContextVmPageFaultRoundV1["loadedMemoryIds"][number]]
          : []
      ),
    );
    const pinReason = `page-fault:${rootPackId}`;
    this.contextVm.pinCachedPages([...pinned], pinReason);
    let currentPack = input.initialPack;
    let cumulativeFaultTokens = 0;
    const cumulativeLimit = Math.min(
      MAX_PAGE_FAULT_TOKENS,
      input.initialPack.request.hardBudgetTokens * MAX_PAGE_FAULT_ROUNDS,
    );
    const appendAudit = async (
      kind: "memory_fault" | "memory_resolution",
      round: number,
      phase: string,
      payload: Record<string, unknown>,
    ): Promise<void> => {
      await this.contextVm.appendEvent({
        sessionId: input.initialPack.request.sessionId,
        ...(input.initialPack.request.taskId
          ? { taskId: input.initialPack.request.taskId }
          : {}),
        source: {
          kind: "memory_runtime",
          id: `${rootPackId}:${round}:${phase}`,
        },
        occurredAt: new Date().toISOString(),
        actor: { kind: "runtime", id: "contextvm-page-fault-v1" },
        kind,
        payload,
        sensitivity: "internal",
      });
    };
    const abstain = (
      reason: Extract<
        ContextVmPageFaultOutcomeV1,
        { status: "abstained" }
      >["reason"],
    ): ContextVmPageFaultOutcomeV1 => ({
      schemaVersion: 1,
      status: "abstained",
      reason,
      rounds,
      cumulativeFaultTokens,
    });

    try {
      for (let decisionRound = 0;; decisionRound += 1) {
        if (input.signal?.aborted) {
          throw Object.assign(new Error("ContextVM page-fault loop cancelled"), {
            name: "AbortError",
          });
        }
        let rawDecision: unknown;
        try {
          rawDecision = await input.decide({
            pack: currentPack,
            round: decisionRound,
            ...(input.signal ? { signal: input.signal } : {}),
          });
        } catch (error) {
          throw error;
        }
        let decision: ContextVmMemoryDecisionV1;
        try {
          decision = parseContextVmMemoryDecisionV1(rawDecision);
        } catch (error) {
          await appendAudit("memory_fault", decisionRound, "malformed", {
            status: "rejected",
            reason: "malformed_request",
            detail: error instanceof Error ? error.message : String(error),
          });
          return abstain("malformed_request");
        }
        if (decision.status === "READY") {
          return {
            schemaVersion: 1,
            status: "ready",
            decision,
            rounds,
            cumulativeFaultTokens,
          };
        }
        if (decisionRound >= MAX_PAGE_FAULT_ROUNDS) {
          await appendAudit("memory_fault", decisionRound, "round-limit", {
            status: "rejected",
            reason: "round_limit",
          });
          return abstain("round_limit");
        }

        const missing = canonicalMissing(decision.missing);
        const hash = faultHash(missing);
        if (seenFaults.has(hash)) {
          await appendAudit("memory_fault", decisionRound + 1, "repeated", {
            status: "rejected",
            reason: "repeated_fault",
            faultHash: hash,
          });
          return abstain("repeated_fault");
        }
        seenFaults.add(hash);
        const round = decisionRound + 1;
        await appendAudit("memory_fault", round, "request", {
          status: "accepted",
          faultHash: hash,
          missing,
          previousContextPackId: currentPack.manifest.id,
        });

        const nextPack = await this.buildContextPack({
          ...input.initialPack.request,
          requestedEntities: [
            ...new Set([
              ...input.initialPack.request.requestedEntities,
              ...missing.flatMap(({ entities }) => entities),
            ]),
          ],
          continuation: {
            rootContextPackId: rootPackId,
            previousContextPackId: currentPack.manifest.id,
            round,
            faultHash: hash,
            missing,
          },
        });
        cumulativeFaultTokens += nextPack.manifest.renderedTokens;
        const loadedMemoryIds = nextPack.manifest.items.flatMap((item) =>
          item.sourceType === "memory"
            ? [
                item.sourceId as ContextVmPageFaultRoundV1[
                  "loadedMemoryIds"
                ][number],
              ]
            : []
        );
        const loadedMemoryItems = nextPack.manifest.items.filter(
          ({ sourceType }) => sourceType === "memory",
        );
        const unresolved = missing.filter((item) =>
          item.entities.some((entity) =>
            !loadedMemoryItems.some((packItem) =>
              packItem.entityIds?.includes(entity)
            )
          )
        );
        const faultRound: ContextVmPageFaultRoundV1 = {
          round,
          faultHash: hash,
          contextPackId: nextPack.manifest.id,
          loadedMemoryIds,
          unresolved,
          renderedTokens: nextPack.manifest.renderedTokens,
        };
        rounds.push(faultRound);
        await appendAudit("memory_resolution", round, "resolution", {
          status: unresolved.length === 0 ? "resolved" : "unresolved",
          faultHash: hash,
          contextPackId: nextPack.manifest.id,
          loadedMemoryIds,
          unresolved,
          renderedTokens: nextPack.manifest.renderedTokens,
          cumulativeFaultTokens,
        });
        if (cumulativeFaultTokens > cumulativeLimit) {
          await appendAudit("memory_resolution", round, "token-limit", {
            status: "abstained",
            reason: "token_limit",
            faultHash: hash,
            cumulativeFaultTokens,
            cumulativeLimit,
          });
          return abstain("token_limit");
        }
        if (loadedMemoryIds.length === 0 || unresolved.length > 0) {
          return abstain("unresolved");
        }
        for (const id of loadedMemoryIds) pinned.add(id);
        this.contextVm.pinCachedPages(loadedMemoryIds, pinReason);
        currentPack = nextPack;
      }
    } finally {
      this.contextVm.unpinCachedPages([...pinned], pinReason);
    }
  }

  async buildRevisionBoundEvidence(input: {
    namespace: MemoryNamespace;
    query: string;
    workspaceId: string;
    repository: RepositoryEvidenceScopeV1;
    taskId?: string;
    runId?: string;
    itemBudget: number;
    tokenBudget: number;
  }): Promise<RevisionBoundEvidenceClosureV1> {
    await this.initialize();
    const queryProfile = evidenceQueryProfile(input.query);
    const gaps: RevisionBoundEvidenceClosureV1["gaps"] = [];
    const conflicts: RevisionBoundEvidenceClosureV1["conflicts"] = [];
    const items: RevisionBoundEvidenceClosureV1["items"] = [];
    const omissionReasons: string[] = [];
    let omittedCount = 0;
    let estimatedTokensUsed = 0;
    if (
      input.repository.completeness !== "complete" ||
      !input.repository.revisionKey
    ) {
      gaps.push({
        code: "repository_revision_unavailable",
        detail: "Revision-bound evidence was omitted because a complete repository revision identity is unavailable.",
      });
    } else {
      const retrieval = await this.contextVm.retrieveMemoryPages({
        namespace: contextVmNamespace(input.namespace),
        query: input.query,
        topK: Math.max(20, input.itemBudget * 4),
        hopLimit: queryProfile.intent === "local" ? 1 : 2,
      });
      for (const candidate of retrieval.candidates) {
        if (candidate.conflicted) {
          conflicts.push({
            evidenceIds: [
              candidate.page.id,
              ...candidate.page.relations
                .filter(({ type }) => type === "contradicts")
                .map(({ targetMemoryId }) => targetMemoryId),
            ],
            status: "unresolved",
          });
          continue;
        }
        const sourceEvents = [];
        for (const source of candidate.page.sources) {
          if (source.type !== "event") continue;
          const event = await this.contextVm.getEvent(source.eventId);
          if (event) sourceEvents.push(event);
        }
        const eligibleSources = sourceEvents.filter((event) => {
          const payload = event.payload as Record<string, unknown>;
          const scope = payload.repositoryScope as
            | RepositoryEvidenceScopeV1
            | undefined;
          return (
            scope?.localRepositoryId === input.repository.localRepositoryId &&
            scope.revisionKey === input.repository.revisionKey
          );
        });
        if (eligibleSources.length === 0) {
          gaps.push({
            code: sourceEvents.length === 0
              ? "source_evidence_unresolved"
              : "legacy_unscoped",
            detail: `Evidence ${candidate.page.id} was excluded because no canonical source at the exact repository revision was resolved.`,
          });
          continue;
        }
        const source = eligibleSources[0]!;
        const sourcePayload = source.payload as Record<string, unknown>;
        const rawExcerpt = JSON.stringify(sourcePayload.redactedPayload ?? {});
        const redactedExcerpt = redactSensitiveText(rawExcerpt.slice(0, 1_200));
        const sourceEventIds = eligibleSources.map((event) => {
          const payload = event.payload as Record<string, unknown>;
          return String(payload.sourceRunEventId ?? event.source.id);
        });
        const artifactRefs = Array.isArray(sourcePayload.artifactRefs)
          ? sourcePayload.artifactRefs
          : [];
        const sourceScope = sourcePayload.repositoryScope as RepositoryEvidenceScopeV1;
        const trust =
          candidate.page.evidencePriority === "current_user"
            ? "user" as const
            : candidate.page.evidencePriority === "verified_tool"
              ? candidate.page.producer.toLowerCase().includes("verifier")
                ? "verifier" as const
                : "tool" as const
              : candidate.page.evidencePriority === "model_inference"
                ? "model" as const
                : "system" as const;
        const item = {
          evidenceId: candidate.page.id,
          kind: candidate.page.kind,
          advisory: true as const,
          trust,
          displaySummary: redactSensitiveText(candidate.page.summary).value,
          sourceExcerpt: redactedExcerpt.value,
          sourceEventIds,
          artifactRefs: structuredClone(artifactRefs) as RevisionBoundEvidenceClosureV1["items"][number]["artifactRefs"],
          sourceRevisionKey: sourceScope.revisionKey,
          occurredAt: source.occurredAt,
          score: candidate.scores.total,
          scoreComponents: candidate.scores,
          loadReasons: [...candidate.reasons, "exact_repository_revision", "canonical_source_closed"],
          redaction: redactedExcerpt.redaction,
          contentHash: digest(redactedExcerpt.value),
        };
        const tokens = estimateContextTokens(
          `${item.displaySummary}\n${item.sourceExcerpt}`,
        );
        if (
          items.length >= input.itemBudget ||
          estimatedTokensUsed + tokens > input.tokenBudget
        ) {
          omittedCount += 1;
          omissionReasons.push(
            items.length >= input.itemBudget
              ? "item_budget"
              : "token_budget",
          );
          continue;
        }
        items.push(item);
        estimatedTokensUsed += tokens;
      }
    }
    const memorySnapshot = await this.memoryStore.getStoreSnapshot();
    const queryTerms = input.query.toLowerCase().split(/\W+/u).filter(
        (term) => term.length > 2,
      );
    for (const preference of memorySnapshot.semanticMemory) {
        if (
          preference.status !== "approved" ||
          preference.activation?.basis !== "explicit_user_preference" ||
          !preference.activation.requested ||
          preference.activation.conflictsWith.length > 0 ||
          preference.namespace.capabilityId !== input.namespace.capabilityId ||
          preference.namespace.workspaceId !== input.namespace.workspaceId ||
          queryTerms.every(
            (term) => !preference.summary.toLowerCase().includes(term),
          )
        ) continue;
        const sources = (
          await Promise.all(
            preference.provenance.eventIds.map((id) =>
              this.contextVm.getCanonicalSourceEvent(id)),
          )
        ).filter((event) => event !== undefined);
        if (sources.length === 0) {
          gaps.push({
            code: "source_evidence_unresolved",
            detail: `Revision-independent preference ${preference.id} was excluded because its canonical source could not be resolved.`,
          });
          continue;
        }
        const excerpt = redactSensitiveText(
          JSON.stringify(
            (sources[0]!.payload as Record<string, unknown>).redactedPayload ??
              preference.content,
          ).slice(0, 1_200),
        );
        const lexical = queryTerms.length === 0
          ? 0
          : queryTerms.filter((term) =>
            preference.summary.toLowerCase().includes(term)).length /
            queryTerms.length;
        const scores = {
          lexical,
          exact: 0,
          graph: 0,
          temporal: 0,
          structural: 0,
          sourceQuality: 1,
          importance: preference.confidence,
          total: Math.min(1, lexical * 0.6 + preference.confidence * 0.4),
        };
        const tokens = estimateContextTokens(
          `${preference.summary}\n${excerpt.value}`,
        );
        if (
          items.length >= input.itemBudget ||
          estimatedTokensUsed + tokens > input.tokenBudget
        ) {
          omittedCount += 1;
          omissionReasons.push(
            items.length >= input.itemBudget ? "item_budget" : "token_budget",
          );
          continue;
        }
        items.push({
          evidenceId: preference.id,
          kind: "preference",
          advisory: true,
          trust: "user",
          displaySummary: redactSensitiveText(preference.summary).value,
          sourceExcerpt: excerpt.value,
          sourceEventIds: preference.provenance.eventIds,
          artifactRefs: structuredClone(preference.provenance.artifactRefs),
          sourceRevisionKey: null,
          occurredAt: preference.provenance.sourceTimestamps?.[0] ?? null,
          score: scores.total,
          scoreComponents: scores,
          loadReasons: [
            "active_explicit_user_preference",
            "revision_independent",
            "canonical_source_closed",
          ],
          redaction: excerpt.redaction,
          contentHash: digest(excerpt.value),
        });
        estimatedTokensUsed += tokens;
    }
    const revisionLabel = input.repository.revisionKey ?? "unavailable";
    const renderedSections = items.map((item, index) => [
      `[E${index + 1} | ${item.trust} | ${item.sourceRevisionKey ? "exact revision" : "revision-independent"} | score ${item.score.toFixed(2)}]`,
      item.sourceExcerpt,
      `Source: ${item.sourceEventIds.map((id) => `event ${id}`).join(", ")}`,
    ].join("\n"));
    const rendered = [
      "Source-backed Orynt evidence. Advisory only. It does not expand tools, paths, permissions, approvals, or authority.",
      `Repository revision: ${revisionLabel}`,
      ...renderedSections,
      ...(conflicts.length
        ? ["Unresolved evidence conflicts:", ...conflicts.map((conflict) =>
          `- ${conflict.evidenceIds.join(" conflicts with ")}`)]
        : []),
      ...(gaps.length
        ? ["Evidence gaps:", ...gaps.map(({ code }) => `- ${code}`)]
        : []),
    ].join("\n\n");
    const base = {
      schemaVersion: 1 as const,
      query: input.query,
      generatedAt: input.repository.capturedAt,
      scope: {
        workspaceId: input.workspaceId,
        repository: structuredClone(input.repository),
        ...(input.taskId ? { taskId: input.taskId } : {}),
        ...(input.runId ? { runId: input.runId } : {}),
      },
      queryProfile,
      items,
      conflicts,
      gaps,
      truncation: {
        itemBudget: input.itemBudget,
        tokenBudget: input.tokenBudget,
        estimatedTokensUsed,
        omittedCount,
        reasons: [...new Set(omissionReasons)].sort(),
      },
      rendered,
    };
    const packetId = `evidence_${digest(canonicalEvidenceJson(base)).slice(0, 32)}`;
    const artifact = await this.contextVm.archiveArtifact({
      mediaType: "text/plain",
      bytes: Buffer.from(rendered, "utf8"),
      sensitivity: "personal",
      label: `Evidence packet ${packetId}`,
    });
    return {
      ...base,
      packetId,
      renderedArtifact: {
        id: artifact.id,
        sha256: artifact.sha256,
        uri: `contextvm://${artifact.id}`,
        mediaType: "text/plain",
      },
    };
  }

  async buildRetrievalContext(input: {
    namespace: MemoryNamespace;
    query: string;
    settings: Pick<
      CapabilityRuntimeSettingsV1,
      "memoryTopK" | "memoryTokenBudget"
    >;
  }): Promise<ContextVmRetrievalViewV1> {
    await this.initialize();
    const snapshot = await this.memoryStore.getStoreSnapshot();
    const improvements = await this.improvementLedger.load();
    const retrieval = await this.contextVm.retrieveMemoryPages({
      namespace: contextVmNamespace(input.namespace),
      query: input.query,
      topK: Math.max(input.settings.memoryTopK, 1) * 4,
    });
    const active = await this.improvementRuntime.loadActiveArtifacts();
    const candidates: AgentIntelligenceItemV1[] = [
      ...retrieval.candidates
        .filter((candidate) => !candidate.conflicted)
        .map((candidate) => ({
        id: candidate.page.id,
        kind:
          candidate.page.kind === "fact"
            ? "semantic" as const
            : candidate.page.kind === "procedure" ||
                candidate.page.kind === "constraint" ||
                candidate.page.kind === "decision"
              ? "procedural" as const
              : "episodic" as const,
        summary: candidate.page.summary,
        confidence: candidate.page.confidence,
        lifecycleStatus: candidate.page.status,
        advisory: true as const,
        sourceArtifactRefs: candidate.page.sources.flatMap((source) =>
          source.type === "artifact" ? [`contextvm://${source.artifactId}`] : []),
        sourceRevision: snapshot.revision,
      })),
      ...active.map((item) => ({
        id: item.candidateId,
        kind: "active_improvement" as const,
        summary:
          item.artifact.kind === "learned_skill" ||
          item.artifact.kind === "user_overlay"
            ? item.artifact.instruction
            : `Active ${item.artifact.kind} profile for ${item.targetId}.`,
        confidence: 1,
        lifecycleStatus: "active",
        advisory: true as const,
        sourceArtifactRefs: [item.artifactRef],
        sourceRevision: improvements.revision,
      })),
    ].sort(
      (left, right) =>
        Number(right.kind === "active_improvement") -
          Number(left.kind === "active_improvement") ||
        right.confidence - left.confidence ||
        left.id.localeCompare(right.id),
    );
    const selected: AgentIntelligenceItemV1[] = [];
    let estimatedTokens = 0;
    for (const item of candidates) {
      const cost = Math.ceil(item.summary.length / 4);
      if (
        selected.length >= input.settings.memoryTopK ||
        estimatedTokens + cost > input.settings.memoryTokenBudget
      ) {
        continue;
      }
      selected.push(item);
      estimatedTokens += cost;
    }
    const excluded = Math.max(0, candidates.length - selected.length);
    return {
      schemaVersion: 1,
      status:
        selected.length === 0
          ? "empty"
          : excluded > 0
            ? "partial"
            : "ready",
      namespace: structuredClone(input.namespace),
      query: input.query,
      memoryRevision: snapshot.revision,
      improvementRevision: improvements.revision,
      selected,
      excludedCounts:
        excluded > 0 ? { token_budget: excluded } : {},
      gaps:
        selected.length === 0
          ? ["No approved, in-scope intelligence matched this query."]
          : excluded > 0
            ? ["Additional matching intelligence was omitted by the context budget."]
            : [],
      generatedAt: new Date().toISOString(),
    };
  }

  async search(
    namespace: MemoryNamespace,
    input: IntelligenceSearchQueryV1,
    settings: Pick<
      CapabilityRuntimeSettingsV1,
      "memoryTopK" | "memoryTokenBudget"
    >,
  ): Promise<IntelligenceSearchResultV1> {
    const limit = Math.max(
      1,
      Math.min(input.limit ?? settings.memoryTopK, MAX_SEARCH_LIMIT),
    );
    const context = await this.buildRetrievalContext({
      namespace,
      query: input.query,
      settings: {
        memoryTopK: limit,
        memoryTokenBudget: settings.memoryTokenBudget,
      },
    });
    const items = input.kinds?.length
      ? context.selected.filter(({ kind }) => input.kinds!.includes(kind))
      : context.selected;
    return {
      schemaVersion: 1,
      contextStatus: context.status,
      namespace: context.namespace,
      memoryRevision: context.memoryRevision,
      improvementRevision: context.improvementRevision,
      items,
      truncated:
        context.status === "partial" || items.length < context.selected.length,
      gaps: context.gaps,
    };
  }

  createSearchExecutor(input: {
    namespace: MemoryNamespace;
    settings: Pick<
      CapabilityRuntimeSettingsV1,
      "memoryTopK" | "memoryTokenBudget"
    >;
  }): AgentToolExecutor {
    const tool: AgentFunctionTool = {
      type: "function",
      name: "intelligence_search",
      description:
        "Search approved, namespace-scoped Orynt memory and explicitly active local improvements. Read-only.",
      strict: true,
      parameters: {
        type: "object",
        additionalProperties: false,
        required: ["query"],
        properties: {
          query: { type: "string", minLength: 1, maxLength: 1_000 },
          kinds: {
            type: "array",
            maxItems: 4,
            items: {
              type: "string",
              enum: [
                "semantic",
                "procedural",
                "episodic",
                "active_improvement",
              ] satisfies AgentIntelligenceItemKind[],
            },
          },
          limit: { type: "integer", minimum: 1, maximum: MAX_SEARCH_LIMIT },
        },
      },
    };
    return new IntelligenceSearchExecutor(this, input, tool);
  }

  async status(): Promise<IntelligenceStatusV1> {
    await this.initialize();
    const [memory, improvements, backupIds, contextVm] = await Promise.all([
      this.memoryStore.getStoreSnapshot(),
      this.improvementLedger.load(),
      readdir(this.layout.migrationsRoot).catch(() => [] as string[]),
      this.contextVm.status(),
    ]);
    const itemCount =
      memory.episodes.length +
      memory.candidateRules.length +
      memory.semanticMemory.length;
    return {
      schemaVersion: 2,
      layoutVersion: INTELLIGENCE_LAYOUT_VERSION,
      health:
        itemCount === 0 &&
        improvements.candidates.length === 0 &&
        improvements.outcomes.length === 0
          ? "empty"
          : "ready",
      memory: {
        schemaVersion: memory.schemaVersion,
        revision: memory.revision,
        itemCount,
      },
      improvements: {
        schemaVersion: improvements.schemaVersion,
        revision: improvements.revision,
        outcomeCount: improvements.outcomes.length,
        candidateCount: improvements.candidates.length,
        activeTargetCount: Object.keys(improvements.activeTargets).length,
      },
      migration: {
        required: false,
        blocked: false,
        backupIds,
      },
      contextVm: {
        ...contextVm,
        derivedMemoryAuthority: "contextvm_sqlite_v2",
        migrationState: "completed",
      },
      canonicalPaths: {
        memoryStore: this.layout.contextVmDatabasePath,
        improvementStore: this.layout.improvementStorePath,
      },
    };
  }

  async verifyContextVm(): Promise<ContextVmVerificationReportV1> {
    await this.initialize();
    return this.contextVm.verify();
  }

  async searchContextVm(
    namespace: MemoryNamespace,
    input: Omit<ContextVmRetrievalRequestV1, "namespace">,
  ) {
    await this.initialize();
    return this.contextVm.retrieveMemoryPages({
      ...input,
      namespace: contextVmNamespace(namespace),
    });
  }

  async searchContextVmNamespace(
    namespace: string,
    input: Omit<ContextVmRetrievalRequestV1, "namespace">,
  ) {
    await this.initialize();
    return this.contextVm.retrieveMemoryPages({ ...input, namespace });
  }

  async rebuildContextVmIndex() {
    await this.initialize();
    return this.contextVm.rebuildRetrievalIndex();
  }

  async checkpointContextVmSession(
    sessionId: string,
    reason: "explicit" | "session_checkpoint" | "task_closed" | "event_threshold" =
      "explicit",
  ) {
    await this.initialize();
    return this.contextVm.createStateCheckpoint({
      sessionId: contextVmSessionId(sessionId),
      reason,
    });
  }

  async recoverContextVmSession(sessionId: string, signal?: AbortSignal) {
    await this.initialize();
    return this.contextVm.recoverSessionState(
      contextVmSessionId(sessionId),
      signal,
    );
  }

  async consolidateContextVmSession(input: {
    sessionId: string;
    namespace: string;
    trigger:
      | "session_checkpoint"
      | "task_closed"
      | "event_threshold"
      | "repeated_pattern"
      | "accepted_decision"
      | "explicit_save";
    taskId?: string;
  }) {
    await this.initialize();
    return this.contextVm.consolidateSession({
      sessionId: contextVmSessionId(input.sessionId),
      namespace: input.namespace,
      trigger: input.trigger,
      ...(input.taskId ? { taskId: contextVmTaskId(input.taskId) } : {}),
    });
  }

  async inspectMemory(memoryId: string) {
    await this.initialize();
    return memoryId.startsWith("mem_")
      ? this.contextVm.inspectMemory(
          memoryId as Parameters<typeof this.contextVm.inspectMemory>[0],
        )
      : this.contextVm.inspectMemoryByLegacyId(memoryId);
  }

  async listBackups(): Promise<string[]> {
    await this.initialize();
    return (await readdir(this.layout.migrationsRoot).catch(() => [] as string[]))
      .sort();
  }

  async cleanupBackup(backupId: string): Promise<void> {
    await this.initialize();
    if (
      !backupId ||
      backupId === "." ||
      backupId === ".." ||
      path.basename(backupId) !== backupId
    ) {
      throw new Error("Backup id must be one exact migration directory name.");
    }
    const known = await this.listBackups();
    if (!known.includes(backupId)) {
      throw new Error(`Unknown intelligence backup: ${backupId}`);
    }
    await rm(path.join(this.layout.migrationsRoot, backupId), {
      recursive: true,
      force: false,
    });
  }
}

class IntelligenceSearchExecutor implements AgentToolExecutor {
  constructor(
    private readonly runtime: LocalIntelligenceRuntime,
    private readonly input: {
      namespace: MemoryNamespace;
      settings: Pick<
        CapabilityRuntimeSettingsV1,
        "memoryTopK" | "memoryTokenBudget"
      >;
    },
    private readonly tool: AgentFunctionTool,
  ) {}

  tools(): AgentFunctionTool[] {
    return [structuredClone(this.tool)];
  }

  async execute(call: AgentToolCall): Promise<AgentToolResult> {
    if (call.name !== this.tool.name) {
      return {
        output: JSON.stringify({ error: "Unknown intelligence tool." }),
        isError: true,
      };
    }
    const args = isRecord(call.arguments) ? call.arguments : {};
    if (typeof args.query !== "string" || !args.query.trim()) {
      return {
        output: JSON.stringify({ error: "query is required" }),
        isError: true,
      };
    }
    const kinds = Array.isArray(args.kinds)
      ? args.kinds.filter(
          (item): item is AgentIntelligenceItemKind =>
            typeof item === "string" &&
            [
              "semantic",
              "procedural",
              "episodic",
              "active_improvement",
            ].includes(item),
        )
      : undefined;
    const result = await this.runtime.search(
      this.input.namespace,
      {
        query: args.query.slice(0, 1_000),
        ...(kinds?.length ? { kinds } : {}),
        ...(Number.isInteger(args.limit)
          ? { limit: Number(args.limit) }
          : {}),
      },
      this.input.settings,
    );
    return { output: JSON.stringify(result) };
  }
}
