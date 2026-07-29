import { randomUUID } from "node:crypto";
import { constants, type Stats } from "node:fs";
import {
  chmod,
  lstat,
  mkdir,
  open,
  readFile,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import {
  createLegacySingleModelProfile,
  isOrchestrationProfile,
  redactSensitivePayload,
  type OrchestrationProfile,
} from "@codepawl/shared";

import type { ThinkingEffort } from "./ui.js";

export type CliRunSnapshot = {
  runId: string;
  status: string;
  summary: string;
  verification: "passed" | "failed" | "pending";
  evidenceCount: number;
  artifactManifestPath: string;
  artifacts: Record<string, string | null>;
  eventTypes: string[];
  estimatedTotalTokens?: number;
  estimatedCostUsd?: number;
  costPerSuccessfulTask?: number;
  workingState?: {
    mode: string;
    activeChunkCount: number;
    hardConstraints: string[];
    selectedOptionId?: string;
  };
  memory?: {
    summary: string;
    episodeCount: number;
    candidateRuleCount: number;
  };
};

export type CliSessionSnapshot = {
  schemaVersion: 2;
  sessionId: string;
  repositoryPath: string;
  orchestrationProfile: OrchestrationProfile;
  /** Coordinator aliases retained for older UI and external integrations. */
  modelId: string;
  thinkingEffort: ThinkingEffort;
  mode: "plan" | "bounded_execute";
  goal?: string;
  acceptanceCriteria: string[];
  selectedSkillIds?: string[];
  conversationSummary?: string;
  turnCount?: number;
  lastRun?: CliRunSnapshot;
  createdAt: string;
  updatedAt: string;
};

export type CreateSessionSnapshotInput = {
  sessionId: string;
  repositoryPath: string;
  modelId: string;
  thinkingEffort: ThinkingEffort;
  orchestrationProfile?: OrchestrationProfile;
  now?: string;
};

export type CliWorkingConfig = {
  repositoryPath?: string;
  orchestrationProfile?: OrchestrationProfile;
  /** Legacy input aliases. New callers should update orchestrationProfile. */
  modelId?: string;
  thinkingEffort?: ThinkingEffort;
};

export type CliPreferences = {
  schemaVersion: 2;
  startupBoundaryAcknowledgedAt?: string;
  workingConfig?: CliWorkingConfig;
};

type LegacyCliSessionSnapshot = Omit<
  CliSessionSnapshot,
  "schemaVersion" | "orchestrationProfile"
> & {
  schemaVersion: 1;
};

type LegacyCliPreferences = Omit<CliPreferences, "schemaVersion"> & {
  schemaVersion: 1;
};

const VALID_THINKING_EFFORTS = new Set<ThinkingEffort>([
  "minimal",
  "none",
  "low",
  "medium",
  "high",
  "xhigh",
]);
const MAX_MODEL_ID_LENGTH = 200;

function isValidModelId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value === value.trim() &&
    value.length > 0 &&
    value.length <= MAX_MODEL_ID_LENGTH
  );
}

export function normalizeCliWorkingConfig(
  patch: CliWorkingConfig,
): CliWorkingConfig {
  const normalized: CliWorkingConfig = {};
  if (patch.repositoryPath !== undefined) {
    if (!patch.repositoryPath.trim()) {
      throw new Error("Invalid Orynt repository preference");
    }
    normalized.repositoryPath = path.resolve(patch.repositoryPath);
  }
  if (patch.modelId !== undefined) {
    const modelId = patch.modelId.trim();
    if (!isValidModelId(modelId)) {
      throw new Error("Invalid Orynt model preference");
    }
    normalized.modelId = modelId;
  }
  if (patch.thinkingEffort !== undefined) {
    if (!VALID_THINKING_EFFORTS.has(patch.thinkingEffort)) {
      throw new Error("Invalid Orynt thinking effort preference");
    }
    normalized.thinkingEffort = patch.thinkingEffort;
  }
  if (patch.orchestrationProfile !== undefined) {
    if (!isOrchestrationProfile(patch.orchestrationProfile)) {
      throw new Error("Invalid Orynt orchestration profile preference");
    }
    normalized.orchestrationProfile = structuredClone(
      patch.orchestrationProfile,
    );
    normalized.modelId =
      patch.orchestrationProfile.roles.coordinator.modelId;
    normalized.thinkingEffort =
      patch.orchestrationProfile.roles.coordinator.thinkingEffort;
  }
  return normalized;
}

export function createSessionSnapshot(input: CreateSessionSnapshotInput): CliSessionSnapshot {
  const timestamp = input.now ?? new Date().toISOString();
  const orchestrationProfile =
    input.orchestrationProfile ??
    createLegacySingleModelProfile(input.modelId, input.thinkingEffort);
  return {
    schemaVersion: 2,
    sessionId: input.sessionId,
    repositoryPath: path.resolve(input.repositoryPath),
    orchestrationProfile,
    modelId: orchestrationProfile.roles.coordinator.modelId,
    thinkingEffort: orchestrationProfile.roles.coordinator.thinkingEffort,
    mode: "plan",
    acceptanceCriteria: [],
    selectedSkillIds: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    return new Date(value).toISOString() === value;
  } catch {
    return false;
  }
}

export async function readRunSnapshot(manifestPath: string): Promise<CliRunSnapshot> {
  const parsed = JSON.parse(await readFile(manifestPath, "utf8")) as unknown;
  const manifest = record(parsed);
  const runId = typeof manifest.runId === "string" ? manifest.runId : "unknown-run";
  const status = typeof manifest.status === "string" ? manifest.status : "unknown";
  const summary = typeof manifest.summary === "string" ? manifest.summary : "No run summary was recorded.";
  const eventTypes = strings(manifest.eventTypes);
  const artifactsRecord = record(manifest.artifacts);
  const artifacts = Object.fromEntries(
    Object.entries(artifactsRecord).filter((entry): entry is [string, string | null] => typeof entry[1] === "string" || entry[1] === null),
  );
  const budgetedAgent = record(manifest.budgetedAgent);
  const compactWorkingState = record(budgetedAgent.compactWorkingState);
  const cost = record(budgetedAgent.cost);
  const memoryRecord = record(manifest.memory);
  const activeChunks = strings(compactWorkingState.activeChunks);
  const hardConstraints = strings(compactWorkingState.hardConstraints);
  const mode = typeof budgetedAgent.mode === "string" ? budgetedAgent.mode : undefined;
  const selectedOptionId = typeof budgetedAgent.selectedOptionId === "string" ? budgetedAgent.selectedOptionId : undefined;
  const memorySummary = typeof memoryRecord.summary === "string" ? memoryRecord.summary : undefined;
  const verification = eventTypes.includes("verification_passed") || status === "pass"
    ? "passed"
    : eventTypes.includes("verification_failed") || status === "fail"
      ? "failed"
      : "pending";

  return {
    runId,
    status,
    summary,
    verification,
    evidenceCount: Object.values(artifacts).filter((value): value is string => typeof value === "string" && Boolean(value)).length,
    artifactManifestPath: path.resolve(manifestPath),
    artifacts,
    eventTypes,
    estimatedTotalTokens: finiteNumber(cost.estimatedTotalTokens),
    estimatedCostUsd: finiteNumber(cost.estimatedCostUsd),
    costPerSuccessfulTask: finiteNumber(cost.costPerSuccessfulTask),
    ...(mode
      ? {
          workingState: {
            mode,
            activeChunkCount: activeChunks.length,
            hardConstraints,
            ...(selectedOptionId ? { selectedOptionId } : {}),
          },
        }
      : {}),
    ...(memorySummary
      ? {
          memory: {
            summary: memorySummary,
            episodeCount: finiteNumber(memoryRecord.episodeCount) ?? 0,
            candidateRuleCount: finiteNumber(memoryRecord.candidateRuleCount) ?? 0,
          },
        }
      : {}),
  };
}

function assertSessionId(sessionId: string): string {
  if (!/^[a-zA-Z0-9._-]{1,120}$/.test(sessionId)) {
    throw new Error("Invalid Orynt session id");
  }
  return sessionId;
}

function isLegacySessionSnapshot(
  value: unknown,
): value is LegacyCliSessionSnapshot {
  const candidate = record(value);
  return (
    candidate.schemaVersion === 1 &&
    typeof candidate.sessionId === "string" &&
    typeof candidate.repositoryPath === "string" &&
    path.isAbsolute(candidate.repositoryPath) &&
    isValidModelId(candidate.modelId) &&
    VALID_THINKING_EFFORTS.has(candidate.thinkingEffort as ThinkingEffort) &&
    (candidate.mode === "plan" || candidate.mode === "bounded_execute") &&
    Array.isArray(candidate.acceptanceCriteria) &&
    (candidate.selectedSkillIds === undefined ||
      (Array.isArray(candidate.selectedSkillIds) &&
        candidate.selectedSkillIds.every(
          (skillId) =>
            typeof skillId === "string" &&
            /^[a-zA-Z0-9._:-]{1,200}$/.test(skillId),
        ))) &&
    (candidate.conversationSummary === undefined ||
      typeof candidate.conversationSummary === "string") &&
    (candidate.turnCount === undefined ||
      (typeof candidate.turnCount === "number" &&
        Number.isInteger(candidate.turnCount) &&
        candidate.turnCount >= 0)) &&
    typeof candidate.createdAt === "string" &&
    typeof candidate.updatedAt === "string"
  );
}

function isSessionSnapshot(value: unknown): value is CliSessionSnapshot {
  const candidate = record(value);
  return (
    candidate.schemaVersion === 2 &&
    isOrchestrationProfile(candidate.orchestrationProfile) &&
    isLegacySessionSnapshot({ ...candidate, schemaVersion: 1 })
  );
}

function isWorkingConfig(value: unknown): boolean {
  const workingConfig = record(value);
  return (
    (workingConfig.repositoryPath === undefined ||
      (typeof workingConfig.repositoryPath === "string" &&
        path.isAbsolute(workingConfig.repositoryPath))) &&
    (workingConfig.modelId === undefined ||
      isValidModelId(workingConfig.modelId)) &&
    (workingConfig.thinkingEffort === undefined ||
      VALID_THINKING_EFFORTS.has(
        workingConfig.thinkingEffort as ThinkingEffort,
      )) &&
    (workingConfig.orchestrationProfile === undefined ||
      isOrchestrationProfile(workingConfig.orchestrationProfile))
  );
}

function isLegacyCliPreferences(
  value: unknown,
): value is LegacyCliPreferences {
  const candidate = record(value);
  const hasWorkingConfig = candidate.workingConfig !== undefined;
  return (
    candidate.schemaVersion === 1 &&
    (candidate.startupBoundaryAcknowledgedAt === undefined ||
      isIsoTimestamp(candidate.startupBoundaryAcknowledgedAt)) &&
    (!hasWorkingConfig ||
      (typeof candidate.workingConfig === "object" &&
        candidate.workingConfig !== null &&
        !Array.isArray(candidate.workingConfig) &&
        isWorkingConfig(candidate.workingConfig)))
  );
}

function isCliPreferences(value: unknown): value is CliPreferences {
  const candidate = record(value);
  return (
    candidate.schemaVersion === 2 &&
    isLegacyCliPreferences({ ...candidate, schemaVersion: 1 })
  );
}

function migrateSessionSnapshot(
  value: LegacyCliSessionSnapshot | CliSessionSnapshot,
): CliSessionSnapshot {
  if (value.schemaVersion === 2) return value;
  const orchestrationProfile = createLegacySingleModelProfile(
    value.modelId,
    value.thinkingEffort,
  );
  return {
    ...value,
    schemaVersion: 2,
    orchestrationProfile,
  };
}

function migratePreferences(
  value: LegacyCliPreferences | CliPreferences,
): CliPreferences {
  if (value.schemaVersion === 2) return value;
  const workingConfig = value.workingConfig;
  const orchestrationProfile =
    workingConfig?.orchestrationProfile ??
    (workingConfig?.modelId || workingConfig?.thinkingEffort
      ? createLegacySingleModelProfile(
          workingConfig.modelId ?? "gpt-5.5",
          workingConfig.thinkingEffort ?? "high",
        )
      : undefined);
  return {
    ...value,
    schemaVersion: 2,
    ...(workingConfig
      ? {
          workingConfig: normalizeCliWorkingConfig({
            ...workingConfig,
            ...(orchestrationProfile ? { orchestrationProfile } : {}),
          }),
        }
      : {}),
  };
}
async function ensurePrivateDirectory(directoryPath: string): Promise<void> {
  try {
    const metadata = await lstat(directoryPath);
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
      throw new Error(`Unsafe Orynt state path: ${directoryPath}`);
    }
    if (typeof process.getuid === "function" && metadata.uid !== process.getuid()) {
      throw new Error(`Orynt state directory is not owned by the current user: ${directoryPath}`);
    }
  } catch (error) {
    if ((error as { code?: string }).code !== "ENOENT") throw error;
    await mkdir(directoryPath, { recursive: true, mode: 0o700 });
    const metadata = await lstat(directoryPath);
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
      throw new Error(`Unsafe Orynt state path: ${directoryPath}`);
    }
  }
  await chmod(directoryPath, 0o700);
}

function assertPrivateRegularFile(
  filePath: string,
  metadata: Stats,
): void {
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Error(`Unsafe Orynt state file: ${filePath}`);
  }
  if (typeof process.getuid === "function" && metadata.uid !== process.getuid()) {
    throw new Error(`Orynt state file is not owned by the current user: ${filePath}`);
  }
  if ((metadata.mode & 0o077) !== 0) {
    throw new Error(`Orynt state file permissions are too broad: ${filePath}`);
  }
}

async function readPrivateTextFile(filePath: string): Promise<string> {
  const beforeOpen = await lstat(filePath);
  assertPrivateRegularFile(filePath, beforeOpen);
  const handle = await open(
    filePath,
    constants.O_RDONLY | constants.O_NOFOLLOW,
  );
  try {
    const opened = await handle.stat();
    assertPrivateRegularFile(filePath, opened);
    if (opened.dev !== beforeOpen.dev || opened.ino !== beforeOpen.ino) {
      throw new Error(`Orynt state file changed while opening: ${filePath}`);
    }
    return await handle.readFile({ encoding: "utf8" });
  } finally {
    await handle.close();
  }
}

async function writePrivateTextFileAtomically(
  filePath: string,
  value: string,
): Promise<void> {
  const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, value, {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    });
    await rename(temporaryPath, filePath);
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
}

function serializedSession(session: CliSessionSnapshot): string {
  const redacted = redactSensitivePayload(session).payload;
  // The generic redactor treats maxTokens as secret-like. Profile bindings are
  // already strictly validated and live in a private 0600 state file.
  redacted.orchestrationProfile = structuredClone(
    session.orchestrationProfile,
  );
  return `${JSON.stringify(redacted, null, 2)}\n`;
}

export class FileCliSessionStore {
  constructor(private readonly root: string) {}

  async save(session: CliSessionSnapshot): Promise<void> {
    if (!isSessionSnapshot(session)) {
      throw new Error("Invalid Orynt session snapshot");
    }
    const sessionId = assertSessionId(session.sessionId);
    const sessionsRoot = path.join(this.root, "sessions");
    await ensurePrivateDirectory(this.root);
    await ensurePrivateDirectory(sessionsRoot);
    const sessionPath = path.join(sessionsRoot, `${sessionId}.json`);
    const value = serializedSession(session);
    await writePrivateTextFileAtomically(sessionPath, value);
    await writePrivateTextFileAtomically(
      path.join(sessionsRoot, "latest"),
      `${sessionId}\n`,
    );
  }

  async load(sessionId: string): Promise<CliSessionSnapshot | undefined> {
    await ensurePrivateDirectory(this.root);
    await ensurePrivateDirectory(path.join(this.root, "sessions"));
    try {
      const parsed = JSON.parse(
        await readPrivateTextFile(
          path.join(this.root, "sessions", `${assertSessionId(sessionId)}.json`),
        ),
      ) as unknown;
      if (!isSessionSnapshot(parsed) && !isLegacySessionSnapshot(parsed)) {
        throw new Error(`Invalid Orynt session snapshot: ${sessionId}`);
      }
      const migrated = migrateSessionSnapshot(parsed);
      if (parsed.schemaVersion === 1) {
        await writePrivateTextFileAtomically(
          path.join(
            this.root,
            "sessions",
            `${assertSessionId(sessionId)}.json`,
          ),
          serializedSession(migrated),
        );
      }
      return migrated;
    } catch (error) {
      if ((error as { code?: string }).code === "ENOENT") {
        return undefined;
      }
      throw error;
    }
  }

  async loadLatest(): Promise<CliSessionSnapshot | undefined> {
    await ensurePrivateDirectory(this.root);
    await ensurePrivateDirectory(path.join(this.root, "sessions"));
    try {
      const sessionId = (
        await readPrivateTextFile(path.join(this.root, "sessions", "latest"))
      ).trim();
      return sessionId ? this.load(sessionId) : undefined;
    } catch (error) {
      if ((error as { code?: string }).code === "ENOENT") {
        return undefined;
      }
      throw error;
    }
  }
}

export class FileCliPreferencesStore {
  constructor(private readonly root: string) {}

  private get preferencesPath(): string {
    return path.join(this.root, "preferences.json");
  }

  private async write(preferences: CliPreferences): Promise<void> {
    if (!isCliPreferences(preferences)) {
      throw new Error("Invalid Orynt CLI preferences");
    }
    await ensurePrivateDirectory(this.root);
    await writePrivateTextFileAtomically(
      this.preferencesPath,
      `${JSON.stringify(preferences, null, 2)}\n`,
    );
  }

  async load(): Promise<CliPreferences> {
    await ensurePrivateDirectory(this.root);
    try {
      const parsed = JSON.parse(
        await readPrivateTextFile(this.preferencesPath),
      ) as unknown;
      if (!isCliPreferences(parsed) && !isLegacyCliPreferences(parsed)) {
        throw new Error("Invalid Orynt CLI preferences");
      }
      const migrated = migratePreferences(parsed);
      if (parsed.schemaVersion === 1) await this.write(migrated);
      return migrated;
    } catch (error) {
      if ((error as { code?: string }).code === "ENOENT") {
        return { schemaVersion: 2 };
      }
      throw error;
    }
  }

  async hasAcknowledgedStartupBoundary(): Promise<boolean> {
    return Boolean((await this.load()).startupBoundaryAcknowledgedAt);
  }

  async acknowledgeStartupBoundary(now = new Date().toISOString()): Promise<void> {
    if (!isIsoTimestamp(now)) {
      throw new Error("Invalid startup boundary acknowledgement timestamp");
    }
    const preferences: CliPreferences = {
      ...(await this.load()),
      startupBoundaryAcknowledgedAt: now,
    };
    await this.write(preferences);
  }

  async saveWorkingConfig(patch: CliWorkingConfig): Promise<void> {
    const normalized = normalizeCliWorkingConfig(patch);
    if (Object.keys(normalized).length === 0) return;

    const preferences = await this.load();
    await this.write({
      ...preferences,
      workingConfig: {
        ...preferences.workingConfig,
        ...normalized,
      },
    });
  }
}
