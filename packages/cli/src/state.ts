import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { constants, type Stats } from "node:fs";
import {
  chmod,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import {
  atomicWriteFileDurable,
  LocalStateError,
  withExclusiveFileLock,
} from "@codepawl/local-state";
import {
  createDefaultCapabilityRuntimeSettings,
  createLegacySingleModelProfile,
  createSingleModelTierConfiguration,
  hashPromptUnderstandingBasis,
  isModelTierConfiguration,
  isOrchestrationProfile,
  migrateOrchestrationProfileToModelTiers,
  parsePromptUnderstandingV1,
  parseRepositoryDiffArtifactV1,
  redactSensitivePayload,
  REPOSITORY_DIFF_ARTIFACT_MAX_BYTES,
  validateCapabilityRuntimeSettings,
  validateContextLifecycleSnapshotV1,
  type CliTranscriptEntryV1,
  type CapabilityRuntimeSettingsV1,
  type ModelTierConfigurationV1,
  type OrchestrationProfile,
  type PromptUnderstandingBasisV1,
  type PromptUnderstandingV1,
  type RedactionMetadata,
  type RepositoryDiffArtifactV1,
  type ContextLifecycleSnapshotV1,
} from "@codepawl/shared";
import {
  DEFAULT_TERMINAL_THEME_ID,
  isTerminalThemeId,
  TERMINAL_SCREEN_MODES,
  type TerminalScreenMode,
  type TerminalThemeId,
} from "./terminal-theme.js";

import type { ActivityDetailLevel, ThinkingEffort } from "./ui.js";
import {
  DEFAULT_CLI_SHORTCUTS,
  shortcutPreferences,
  validateShortcutPreferences,
  type CliShortcutPreferences,
} from "./shortcuts.js";
import {
  DEFAULT_CLI_STATUSLINE,
  statuslinePreferences,
  validateStatuslinePreferences,
  type CliStatuslinePreferences,
} from "./statusline.js";
import {
  clipboardPreferences,
  DEFAULT_CLI_CLIPBOARD,
  validateClipboardPreferences,
  type CliClipboardPreferences,
} from "./clipboard.js";

export type CliRunSnapshot = {
  runId: string;
  status: string;
  summary: string;
  verification: "passed" | "failed" | "pending";
  evidenceCount: number;
  artifactManifestPath: string;
  artifacts: Record<string, string | null>;
  eventTypes: string[];
  repositoryDiff?: CliRepositoryDiffSnapshot;
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
  resources?: {
    artifactRoot: string;
    sandboxWorktreePath?: string;
    sandboxChanged: boolean;
    artifactPurgedAt?: string;
    sandboxRemovedAt?: string;
  };
};

export type CliRepositoryDiffReference = {
  artifactRoot: string;
  path: string;
  sha256: string;
  byteLength: number;
};

export type CliRepositoryDiffSnapshot =
  | {
      available: true;
      reference: CliRepositoryDiffReference;
      totals: RepositoryDiffArtifactV1["totals"];
      truncated: boolean;
      redactionCount: number;
    }
  | {
      available: false;
      reason: string;
    };

/**
 * A resumable prompt-understanding checkpoint. It contains only a bounded,
 * redacted draft and has no execution authority. A new process must obtain an
 * explicit operator reconfirmation before it may use this draft for planning.
 */
export type CliPromptUnderstandingDraft = {
  schemaVersion: 1;
  basis: PromptUnderstandingBasisV1;
  understanding: PromptUnderstandingV1;
  clarificationRounds: number;
  requiresReconfirmation: boolean;
};

export type CliSessionSnapshot = {
  schemaVersion: 4;
  sessionId: string;
  revision: number;
  redaction?: RedactionMetadata;
  title?: string;
  pinned?: boolean;
  trashedAt?: string;
  repositoryPath: string;
  orchestrationProfile: OrchestrationProfile;
  modelTierConfiguration: ModelTierConfigurationV1;
  /** Coordinator aliases retained for older UI and external integrations. */
  modelId: string;
  thinkingEffort: ThinkingEffort;
  mode: "plan" | "bounded_execute";
  goal?: string;
  acceptanceCriteria: string[];
  selectedSkillIds?: string[];
  conversationSummary?: string;
  recentTurns?: CliPersistedConversationTurn[];
  context?: ContextLifecycleSnapshotV1;
  providerThreadId?: string;
  transcript?: {
    schemaVersion: 1;
    entryCount: number;
    lastSequence: number;
    lastHash?: string;
  };
  promptUnderstandingDraft?: CliPromptUnderstandingDraft;
  turnCount?: number;
  lastRun?: CliRunSnapshot;
  lastTurnTelemetry?: {
    schemaVersion: 1;
    totalDurationMs: number;
    stages: Array<{
      name:
        | "prompt_context"
        | "prompt_understanding"
        | "skill_routing"
        | "coordinator_context"
        | "coordinator_inference";
      durationMs: number;
    }>;
    repositorySnapshotChars?: number;
    recordedAt: string;
  };
  createdAt: string;
  updatedAt: string;
};

export type CliPersistedConversationTurn = {
  role: "user" | "agent";
  content: string;
  recordedAt: string;
};

export type CliTranscriptPage = {
  entries: CliTranscriptEntryV1[];
  total: number;
  nextCursor?: number;
};

export type CliSessionCatalogEntry = {
  sessionId: string;
  title: string;
  repositoryPath: string;
  pinned: boolean;
  trashedAt?: string;
  turnCount: number;
  snapshotBytes: number;
  lastRunId?: string;
  verification?: CliRunSnapshot["verification"];
  modifiedWorktreeProtected: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CliSessionListOptions = {
  repositoryPath?: string;
  includeTrash?: boolean;
  cursor?: string;
  limit?: number;
  /** Store-owned retention scan; callers should use paginated limits. */
  internalMaintenanceScan?: boolean;
};

export type CliSessionPage = {
  entries: CliSessionCatalogEntry[];
  nextCursor?: string;
  issues?: Array<{
    sessionId: string;
    reason: "invalid_or_unreadable_snapshot";
  }>;
};

export type CliSessionMaintenanceReport = {
  inspected: number;
  trashed: string[];
  purged: string[];
  skippedProtected: string[];
  artifactCleanup: string[];
  sandboxCleanup: string[];
  cleanupBlocked: string[];
  budgetExhausted: boolean;
};

type CliSessionMaintenanceAuditEntry = {
  operationId: string;
  sessionId: string;
  action: "trash" | "purge" | "artifact_cleanup" | "sandbox_cleanup";
  status: "completed" | "blocked";
  recordedAt: string;
  reason?: string;
};

export type CreateSessionSnapshotInput = {
  sessionId: string;
  repositoryPath: string;
  modelId: string;
  thinkingEffort: ThinkingEffort;
  orchestrationProfile?: OrchestrationProfile;
  modelTierConfiguration?: ModelTierConfigurationV1;
  now?: string;
};

export type CliWorkingConfig = {
  repositoryPath?: string;
  orchestrationProfile?: OrchestrationProfile;
  modelTierConfiguration?: ModelTierConfigurationV1;
  /** Legacy input aliases. New callers should update orchestrationProfile. */
  modelId?: string;
  thinkingEffort?: ThinkingEffort;
};

export type CliAppearancePreferences = {
  color: boolean;
  motion: boolean;
  richText: boolean;
  themeId: TerminalThemeId;
  screenMode: TerminalScreenMode;
};

export type CliSessionRetentionPolicy = {
  mode: "automatic_audited" | "audit_only";
  consentedAt?: string;
};

export const DEFAULT_CLI_APPEARANCE: CliAppearancePreferences = {
  color: true,
  motion: true,
  richText: true,
  themeId: DEFAULT_TERMINAL_THEME_ID,
  screenMode: "auto",
};

export type CliPreferences = {
  schemaVersion: 12;
  activityDetails: ActivityDetailLevel;
  skillRouting: "auto_trusted" | "manual";
  appearance: CliAppearancePreferences;
  clipboard: CliClipboardPreferences;
  shortcuts: CliShortcutPreferences;
  statusline: CliStatuslinePreferences;
  capabilityRuntime?: CapabilityRuntimeSettingsV1;
  updateCheckConsent?: "unknown" | "enabled" | "disabled";
  startupBoundaryAcknowledgedAt?: string;
  workingConfig?: CliWorkingConfig;
  sessionRetention?: CliSessionRetentionPolicy;
};

type LegacyCliSessionSnapshot = Omit<
  CliSessionSnapshot,
  "schemaVersion" | "orchestrationProfile" | "modelTierConfiguration" | "revision"
> & {
  schemaVersion: 1;
  revision?: number;
};

type LegacyV2CliSessionSnapshot = Omit<
  CliSessionSnapshot,
  "schemaVersion" | "revision"
> & {
  schemaVersion: 2;
  revision?: number;
};

type LegacyV3CliSessionSnapshot = Omit<
  CliSessionSnapshot,
  "schemaVersion"
> & {
  schemaVersion: 3;
};

type LegacyV11CliPreferences = Omit<
  CliPreferences,
  "schemaVersion" | "skillRouting"
> & {
  schemaVersion: 11;
};

type LegacyV10CliPreferences = Omit<
  LegacyV11CliPreferences,
  "schemaVersion" | "clipboard"
> & {
  schemaVersion: 10;
};

type LegacyV9CliPreferences = Omit<
  LegacyV10CliPreferences,
  "schemaVersion"
> & {
  schemaVersion: 9;
  appearance: Omit<CliAppearancePreferences, "screenMode">;
};

type LegacyV8CliPreferences = Omit<
  LegacyV9CliPreferences,
  "schemaVersion" | "statusline"
> & {
  schemaVersion: 8;
};

type LegacyV7CliPreferences = Omit<
  LegacyV8CliPreferences,
  "schemaVersion"
> & {
  schemaVersion: 7;
  appearance: Omit<CliAppearancePreferences, "themeId">;
};

type LegacyV6CliPreferences = Omit<
  LegacyV7CliPreferences,
  "schemaVersion" | "shortcuts"
> & {
  schemaVersion: 6;
};

type LegacyV5CliPreferences = Omit<
  LegacyV6CliPreferences,
  "schemaVersion" | "activityDetails"
> & {
  schemaVersion: 5;
  debugMode: boolean;
};

type LegacyV4CliPreferences = Omit<
  LegacyV5CliPreferences,
  "schemaVersion"
> & {
  schemaVersion: 4;
  appearance: Omit<CliAppearancePreferences, "richText" | "themeId">;
};

type LegacyV3CliPreferences = Omit<
  LegacyV4CliPreferences,
  "schemaVersion" | "appearance"
> & {
  schemaVersion: 3;
};

type LegacyV2CliPreferences = Omit<
  LegacyV3CliPreferences,
  "schemaVersion" | "debugMode"
> & {
  schemaVersion: 2;
  debugMode?: boolean;
};

type LegacyCliPreferences = Omit<LegacyV2CliPreferences, "schemaVersion"> & {
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
const MAX_SESSION_FILE_BYTES = 128 * 1024;
const MAX_TRANSCRIPT_FILE_BYTES = 16 * 1024 * 1024;
const MAX_SESSION_SUMMARY = 4_000;
const MAX_RECENT_TURNS = 12;
const MAX_RECENT_TURN_TEXT = 2_000;
const MAX_SESSION_TITLE = 96;
const DEFAULT_SESSION_LIMIT = 20;
const MAX_SESSION_LIMIT = 200;
const SESSION_RETENTION_DAYS = 90;
const SESSION_TRASH_DAYS = 30;
const SESSION_ACTIVE_LIMIT = 200;
const MAINTENANCE_ENTRY_BUDGET = 8;
const ARTIFACT_RETENTION_DAYS = 30;
const CLEAN_SANDBOX_RETENTION_DAYS = 7;
const execFileAsync = promisify(execFile);

function emptyRedactionMetadata(): RedactionMetadata {
  return {
    applied: false,
    redactedPaths: [],
    policyVersion: 2,
    redactionCount: 0,
    categories: [],
  };
}

function isManagedChild(candidate: string, parent: string): boolean {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return (
    relative !== "" &&
    !relative.startsWith(`..${path.sep}`) &&
    relative !== ".." &&
    !path.isAbsolute(relative)
  );
}

async function removeCleanManagedWorktree(
  repositoryPath: string,
  worktreePath: string,
  managedRoot: string,
): Promise<void> {
  const [realManagedRoot, realWorktreePath] = await Promise.all([
    realpath(managedRoot),
    realpath(worktreePath),
  ]);
  if (!isManagedChild(realWorktreePath, realManagedRoot)) {
    throw new Error("sandbox path is outside the managed root");
  }
  const metadata = await lstat(worktreePath);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw new Error("sandbox worktree path is not a real directory");
  }
  const [{ stdout }, ignored, repositoryCommonDir, worktreeCommonDir] =
    await Promise.all([
      execFileAsync(
        "git",
        ["-C", realWorktreePath, "status", "--porcelain", "--untracked-files=all"],
        { timeout: 10_000, maxBuffer: 2_000_000 },
      ),
      execFileAsync(
        "git",
        [
          "-C",
          realWorktreePath,
          "ls-files",
          "--others",
          "--ignored",
          "--exclude-standard",
          "-z",
        ],
        { timeout: 10_000, maxBuffer: 2_000_000 },
      ),
      execFileAsync(
        "git",
        ["-C", repositoryPath, "rev-parse", "--path-format=absolute", "--git-common-dir"],
        { timeout: 10_000, maxBuffer: 2_000_000 },
      ),
      execFileAsync(
        "git",
        ["-C", realWorktreePath, "rev-parse", "--path-format=absolute", "--git-common-dir"],
        { timeout: 10_000, maxBuffer: 2_000_000 },
      ),
    ]);
  if (
    path.resolve(String(repositoryCommonDir.stdout).trim()) !==
    path.resolve(String(worktreeCommonDir.stdout).trim())
  ) {
    throw new Error("sandbox worktree belongs to a different repository");
  }
  if (String(stdout).trim() || String(ignored.stdout).length > 0) {
    throw new Error("sandbox worktree contains tracked, untracked, or ignored changes");
  }
  await execFileAsync(
    "git",
    ["-C", repositoryPath, "worktree", "remove", realWorktreePath],
    { timeout: 30_000, maxBuffer: 2_000_000 },
  );
}

async function removeManagedArtifactRoot(
  artifactRoot: string,
  managedRoot: string,
): Promise<void> {
  const [realManagedRoot, realArtifactRoot] = await Promise.all([
    realpath(managedRoot),
    realpath(artifactRoot),
  ]);
  if (!isManagedChild(realArtifactRoot, realManagedRoot)) {
    throw new Error("artifact path is outside the managed root");
  }
  const metadata = await lstat(artifactRoot);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw new Error("artifact path is not a real directory");
  }
  await rm(realArtifactRoot, { recursive: true, force: true });
}

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
  if (patch.modelTierConfiguration !== undefined) {
    if (!isModelTierConfiguration(patch.modelTierConfiguration)) {
      throw new Error("Invalid Orynt model tier configuration preference");
    }
    normalized.modelTierConfiguration = structuredClone(
      patch.modelTierConfiguration,
    );
    const coordinatorTier =
      patch.modelTierConfiguration.roles.coordinator;
    normalized.modelId =
      patch.modelTierConfiguration.tiers[coordinatorTier].modelId;
    normalized.thinkingEffort =
      patch.modelTierConfiguration.tiers[coordinatorTier].thinkingEffort;
  }
  return normalized;
}

export function createSessionSnapshot(input: CreateSessionSnapshotInput): CliSessionSnapshot {
  const timestamp = input.now ?? new Date().toISOString();
  const orchestrationProfile =
    input.orchestrationProfile ??
    createLegacySingleModelProfile(input.modelId, input.thinkingEffort);
  const modelTierConfiguration =
    input.modelTierConfiguration ??
    (input.orchestrationProfile
      ? migrateOrchestrationProfileToModelTiers(orchestrationProfile)
      : createSingleModelTierConfiguration(
          input.modelId,
          input.thinkingEffort,
        ));
  const coordinatorTier = modelTierConfiguration.roles.coordinator;
  const coordinator = modelTierConfiguration.tiers[coordinatorTier];
  return {
    schemaVersion: 4,
    sessionId: input.sessionId,
    revision: 0,
    redaction: emptyRedactionMetadata(),
    repositoryPath: path.resolve(input.repositoryPath),
    orchestrationProfile,
    modelTierConfiguration,
    modelId: coordinator.modelId,
    thinkingEffort: coordinator.thinkingEffort,
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

const MAX_PROMPT_DRAFT_TEXT = 8_000;
const MAX_PROMPT_DRAFT_ANSWER_TEXT = 2_000;
const MAX_PROMPT_DRAFT_COLLECTION = 12;
const MAX_PROMPT_DRAFT_QUESTION_COUNT = 3;
const MAX_PROMPT_DRAFT_OPTION_COUNT = 4;

function redactBoundedText(value: string, maxLength: number): string {
  const redacted = redactSensitivePayload(value).payload;
  return (typeof redacted === "string" ? redacted : "[REDACTED]")
    .trim()
    .slice(0, maxLength);
}

function redactBoundedUniqueTexts(
  values: readonly string[],
  limit: number,
): string[] {
  return [...new Set(
    values.slice(0, 24).map((value) => redactBoundedText(value, limit)),
  )];
}

function sanitizePromptUnderstanding(
  source: PromptUnderstandingV1,
  promptId: string,
): PromptUnderstandingV1 {
  const understanding: PromptUnderstandingV1 = {
    schemaVersion: 1,
    promptId,
    ...(source.inputId === undefined ? {} : { inputId: source.inputId }),
    outcome: source.outcome,
    readiness: source.readiness,
    reply: redactBoundedText(source.reply, MAX_PROMPT_DRAFT_TEXT),
    ...(source.conversationSummary === undefined
      ? {}
      : {
          conversationSummary: redactBoundedText(
            source.conversationSummary,
            4_000,
          ),
        }),
    refinedBrief: source.refinedBrief === null
      ? null
      : {
          goal: redactBoundedText(
            source.refinedBrief.goal,
            MAX_PROMPT_DRAFT_TEXT,
          ),
          deliverables: redactBoundedUniqueTexts(
            source.refinedBrief.deliverables,
            4_000,
          ),
          constraints: redactBoundedUniqueTexts(
            source.refinedBrief.constraints,
            4_000,
          ),
          acceptanceCriteria: redactBoundedUniqueTexts(
            source.refinedBrief.acceptanceCriteria,
            4_000,
          ),
          nonGoals: redactBoundedUniqueTexts(
            source.refinedBrief.nonGoals,
            4_000,
          ),
        },
    questions: source.questions
      .slice(0, MAX_PROMPT_DRAFT_QUESTION_COUNT)
      .map((question) => ({
        id: question.id,
        prompt: redactBoundedText(question.prompt, 2_000),
        rationale: redactBoundedText(question.rationale, 1_000),
        kind: question.kind,
        options: question.options
          .slice(0, MAX_PROMPT_DRAFT_OPTION_COUNT)
          .map((option) => ({
            id: option.id,
            label: redactBoundedText(option.label, 200),
            description: redactBoundedText(option.description, 500),
            recommended: option.recommended,
          })),
      })),
    assumptions: source.assumptions
      .slice(0, MAX_PROMPT_DRAFT_COLLECTION)
      .map((assumption) => ({
        id: assumption.id,
        text: redactBoundedText(assumption.text, 4_000),
        affectsScope: assumption.affectsScope,
      })),
  };
  return parsePromptUnderstandingV1(understanding);
}

/**
 * Redacts and bounds pending clarification data before it reaches the private
 * resumable-session store. The refreshed prompt id binds the sanitized basis,
 * making it impossible to accidentally resume against the original raw text.
 */
export function sanitizeCliPromptUnderstandingDraft(
  draft: Omit<CliPromptUnderstandingDraft, "requiresReconfirmation"> & {
    requiresReconfirmation?: boolean;
  },
): CliPromptUnderstandingDraft {
  const basis: PromptUnderstandingBasisV1 = {
    ...structuredClone(draft.basis),
    rawPrompt: redactBoundedText(draft.basis.rawPrompt, MAX_PROMPT_DRAFT_TEXT),
    ...(draft.basis.activeGoal === undefined
      ? {}
      : {
          activeGoal: redactBoundedText(
            draft.basis.activeGoal,
            MAX_PROMPT_DRAFT_ANSWER_TEXT,
          ),
        }),
    acceptanceCriteria: draft.basis.acceptanceCriteria
      .slice(0, MAX_PROMPT_DRAFT_COLLECTION)
      .map((criterion) =>
        redactBoundedText(criterion, MAX_PROMPT_DRAFT_ANSWER_TEXT),
      )
      .filter(Boolean),
    clarificationAnswers: draft.basis.clarificationAnswers
      .slice(0, 9)
      .map((answer) => ({
        ...structuredClone(answer),
        questionId: answer.questionId.slice(0, 120),
        answer: redactBoundedText(answer.answer, MAX_PROMPT_DRAFT_ANSWER_TEXT),
        ...(answer.selectedOptionId === undefined
          ? {}
          : { selectedOptionId: answer.selectedOptionId.slice(0, 120) }),
        ...(answer.note === undefined
          ? {}
          : { note: redactBoundedText(answer.note, MAX_PROMPT_DRAFT_ANSWER_TEXT) }),
      })),
    confirmedAssumptions: draft.basis.confirmedAssumptions
      .slice(0, MAX_PROMPT_DRAFT_COLLECTION)
      .map((assumption) => ({
        ...structuredClone(assumption),
        assumptionId: assumption.assumptionId.slice(0, 120),
        text: redactBoundedText(
          assumption.text,
          MAX_PROMPT_DRAFT_ANSWER_TEXT,
        ),
      })),
    ...(draft.basis.attachments === undefined
      ? {}
      : {
          attachments: draft.basis.attachments
            .slice(0, 4)
            .map((attachment) => structuredClone(attachment)),
        }),
  };
  const understanding = sanitizePromptUnderstanding(
    draft.understanding,
    hashPromptUnderstandingBasis(basis),
  );
  return {
    schemaVersion: 1,
    basis,
    understanding,
    clarificationRounds: Math.min(3, Math.max(0, Math.floor(draft.clarificationRounds))),
    requiresReconfirmation: draft.requiresReconfirmation ?? false,
  };
}

function isPromptUnderstandingDraft(
  value: unknown,
): value is CliPromptUnderstandingDraft {
  const candidate = record(value);
  if (
    candidate.schemaVersion !== 1 ||
    !Number.isInteger(candidate.clarificationRounds) ||
    (candidate.clarificationRounds as number) < 0 ||
    (candidate.clarificationRounds as number) > 3 ||
    typeof candidate.requiresReconfirmation !== "boolean" ||
    typeof candidate.basis !== "object" ||
    candidate.basis === null ||
    typeof candidate.understanding !== "object" ||
    candidate.understanding === null
  ) {
    return false;
  }
  try {
    const basis = candidate.basis as PromptUnderstandingBasisV1;
    const understanding = parsePromptUnderstandingV1(candidate.understanding);
    return understanding.promptId === hashPromptUnderstandingBasis(basis);
  } catch {
    return false;
  }
}

function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    return new Date(value).toISOString() === value;
  } catch {
    return false;
  }
}

function isInsideOrEqual(candidate: string, root: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== ".." &&
      !path.isAbsolute(relative))
  );
}

export async function readRepositoryDiffArtifact(
  reference: CliRepositoryDiffReference,
): Promise<RepositoryDiffArtifactV1> {
  const artifactRoot = path.resolve(reference.artifactRoot);
  const artifactPath = path.resolve(reference.path);
  if (!isInsideOrEqual(artifactPath, artifactRoot)) {
    throw new Error("Repository diff artifact is outside its managed run root.");
  }
  const [realArtifactRoot, realArtifactPath] = await Promise.all([
    realpath(artifactRoot),
    realpath(artifactPath),
  ]);
  if (!isInsideOrEqual(realArtifactPath, realArtifactRoot)) {
    throw new Error(
      "Repository diff artifact resolves outside its managed run root.",
    );
  }
  if (
    !/^[a-f0-9]{64}$/u.test(reference.sha256) ||
    !Number.isSafeInteger(reference.byteLength) ||
    reference.byteLength < 0 ||
    reference.byteLength > REPOSITORY_DIFF_ARTIFACT_MAX_BYTES
  ) {
    throw new Error("Repository diff artifact metadata is invalid.");
  }
  const metadata = await lstat(artifactPath);
  if (
    metadata.size !== reference.byteLength ||
    metadata.size > REPOSITORY_DIFF_ARTIFACT_MAX_BYTES
  ) {
    throw new Error("Repository diff artifact size does not match its manifest.");
  }
  const text = await readPrivateTextFile(artifactPath);
  if (
    createHash("sha256").update(text).digest("hex") !== reference.sha256
  ) {
    throw new Error("Repository diff artifact digest does not match its manifest.");
  }
  return parseRepositoryDiffArtifactV1(JSON.parse(text) as unknown);
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
    Object.entries(artifactsRecord).flatMap(([name, raw]) => {
      if (typeof raw === "string" || raw === null) return [[name, raw]];
      const descriptor = record(raw);
      return typeof descriptor.path === "string"
        ? [[name, descriptor.path]]
        : [];
    }),
  ) as Record<string, string | null>;
  const repositoryDiffDescriptor = record(artifactsRecord.repositoryDiff);
  let repositoryDiff: CliRepositoryDiffSnapshot | undefined;
  if (Object.keys(repositoryDiffDescriptor).length > 0) {
    const reference: CliRepositoryDiffReference | undefined =
      typeof repositoryDiffDescriptor.path === "string" &&
      typeof repositoryDiffDescriptor.sha256 === "string" &&
      typeof repositoryDiffDescriptor.byteLength === "number"
        ? {
            artifactRoot: path.dirname(path.resolve(manifestPath)),
            path: repositoryDiffDescriptor.path,
            sha256: repositoryDiffDescriptor.sha256,
            byteLength: repositoryDiffDescriptor.byteLength,
          }
        : undefined;
    if (!reference) {
      repositoryDiff = {
        available: false,
        reason: "Repository diff manifest metadata is incomplete.",
      };
    } else {
      try {
        const diff = await readRepositoryDiffArtifact(reference);
        repositoryDiff = {
          available: true,
          reference,
          totals: diff.totals,
          truncated: diff.truncated,
          redactionCount: diff.redactionCount,
        };
      } catch (error) {
        repositoryDiff = {
          available: false,
          reason:
            error instanceof Error
              ? error.message
              : "Repository diff artifact is unavailable.",
        };
      }
    }
  }
  const budgetedAgent = record(manifest.budgetedAgent);
  const compactWorkingState = record(budgetedAgent.compactWorkingState);
  const cost = record(budgetedAgent.cost);
  const memoryRecord = record(manifest.memory);
  const artifactRoot =
    typeof manifest.artifactRoot === "string"
      ? path.resolve(manifest.artifactRoot)
      : path.dirname(path.resolve(manifestPath));
  const sandboxWorktreePath =
    typeof manifest.sandboxWorktreePath === "string"
      ? path.resolve(manifest.sandboxWorktreePath)
      : undefined;
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
    resources: {
      artifactRoot,
      ...(sandboxWorktreePath ? { sandboxWorktreePath } : {}),
      sandboxChanged:
        repositoryDiff?.available === true &&
        repositoryDiff.totals.files > 0,
    },
    ...(repositoryDiff ? { repositoryDiff } : {}),
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

function transcriptEntryHash(
  value: Omit<CliTranscriptEntryV1, "contentHash" | "schemaVersion">,
): string {
  return createHash("sha256")
    .update(JSON.stringify({
      sequence: value.sequence,
      logicalTurnId: value.logicalTurnId,
      role: value.role,
      content: value.content,
      recordedAt: value.recordedAt,
      previousHash: value.previousHash ?? null,
    }))
    .digest("hex");
}

function parseTranscriptEntries(value: string): CliTranscriptEntryV1[] {
  const entries = value
    .split(/\r?\n/u)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as CliTranscriptEntryV1);
  let previousHash: string | undefined;
  for (const [index, entry] of entries.entries()) {
    if (
      entry.schemaVersion !== 1 ||
      entry.sequence !== index + 1 ||
      (entry.role !== "user" && entry.role !== "agent") ||
      typeof entry.logicalTurnId !== "string" ||
      !entry.logicalTurnId ||
      typeof entry.content !== "string" ||
      !isIsoTimestamp(entry.recordedAt) ||
      entry.previousHash !== previousHash ||
      !/^[0-9a-f]{64}$/u.test(entry.contentHash) ||
      transcriptEntryHash(entry) !== entry.contentHash
    ) {
      throw new Error("Invalid Orynt session transcript");
    }
    previousHash = entry.contentHash;
  }
  return entries;
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
    candidate.acceptanceCriteria.length <= 100 &&
    candidate.acceptanceCriteria.every(
      (criterion) =>
        typeof criterion === "string" && criterion.length <= 2_000,
    ) &&
    (candidate.selectedSkillIds === undefined ||
      (Array.isArray(candidate.selectedSkillIds) &&
        candidate.selectedSkillIds.every(
          (skillId) =>
            typeof skillId === "string" &&
            /^[a-zA-Z0-9._:-]{1,200}$/.test(skillId),
        ))) &&
    (candidate.conversationSummary === undefined ||
      (typeof candidate.conversationSummary === "string" &&
        candidate.conversationSummary.length <= MAX_SESSION_SUMMARY)) &&
    (candidate.revision === undefined ||
      (Number.isSafeInteger(candidate.revision) &&
        Number(candidate.revision) >= 0)) &&
    (candidate.title === undefined ||
      (typeof candidate.title === "string" &&
        candidate.title.length <= MAX_SESSION_TITLE)) &&
    (candidate.pinned === undefined || typeof candidate.pinned === "boolean") &&
    (candidate.trashedAt === undefined || isIsoTimestamp(candidate.trashedAt)) &&
    (candidate.recentTurns === undefined ||
      (Array.isArray(candidate.recentTurns) &&
        candidate.recentTurns.length <= MAX_RECENT_TURNS &&
        candidate.recentTurns.every((turn) => {
          const item = record(turn);
          return (
            (item.role === "user" || item.role === "agent") &&
            typeof item.content === "string" &&
            item.content.length <= MAX_RECENT_TURN_TEXT &&
            isIsoTimestamp(item.recordedAt)
          );
        }))) &&
    (candidate.promptUnderstandingDraft === undefined ||
      isPromptUnderstandingDraft(candidate.promptUnderstandingDraft)) &&
    (candidate.turnCount === undefined ||
      (typeof candidate.turnCount === "number" &&
        Number.isInteger(candidate.turnCount) &&
        candidate.turnCount >= 0)) &&
    isIsoTimestamp(candidate.createdAt) &&
    isIsoTimestamp(candidate.updatedAt)
  );
}

function isSessionSnapshot(value: unknown): value is CliSessionSnapshot {
  const candidate = record(value);
  const telemetry = record(candidate.lastTurnTelemetry);
  const telemetryStages = Array.isArray(telemetry.stages)
    ? telemetry.stages
    : [];
  try {
    if (candidate.context !== undefined) {
      validateContextLifecycleSnapshotV1(
        candidate.context as ContextLifecycleSnapshotV1,
      );
    }
  } catch {
    return false;
  }
  const transcript = record(candidate.transcript);
  return (
    candidate.schemaVersion === 4 &&
    Number.isSafeInteger(candidate.revision) &&
    Number(candidate.revision) >= 0 &&
    isOrchestrationProfile(candidate.orchestrationProfile) &&
    isModelTierConfiguration(candidate.modelTierConfiguration) &&
    (candidate.providerThreadId === undefined ||
      (typeof candidate.providerThreadId === "string" &&
        candidate.providerThreadId.length <= 240)) &&
    (candidate.lastTurnTelemetry === undefined ||
      (telemetry.schemaVersion === 1 &&
        typeof telemetry.totalDurationMs === "number" &&
        Number.isFinite(telemetry.totalDurationMs) &&
        telemetry.totalDurationMs >= 0 &&
        telemetryStages.length <= 12 &&
        telemetryStages.every((stage) => {
          const item = record(stage);
          return [
            "prompt_context",
            "prompt_understanding",
            "skill_routing",
            "coordinator_context",
            "coordinator_inference",
          ].includes(String(item.name)) &&
            typeof item.durationMs === "number" &&
            Number.isFinite(item.durationMs) &&
            item.durationMs >= 0;
        }) &&
        (telemetry.repositorySnapshotChars === undefined ||
          (Number.isSafeInteger(telemetry.repositorySnapshotChars) &&
            Number(telemetry.repositorySnapshotChars) >= 0 &&
            Number(telemetry.repositorySnapshotChars) <= 8_000)) &&
        typeof telemetry.recordedAt === "string")) &&
    (candidate.transcript === undefined ||
      (transcript.schemaVersion === 1 &&
        Number.isSafeInteger(transcript.entryCount) &&
        Number(transcript.entryCount) >= 0 &&
        Number.isSafeInteger(transcript.lastSequence) &&
        Number(transcript.lastSequence) >= 0 &&
        (transcript.lastHash === undefined ||
          (typeof transcript.lastHash === "string" &&
            /^[0-9a-f]{64}$/u.test(transcript.lastHash))))) &&
    isLegacySessionSnapshot({ ...candidate, schemaVersion: 1 })
  );
}

function isLegacyV3SessionSnapshot(
  value: unknown,
): value is LegacyV3CliSessionSnapshot {
  const candidate = record(value);
  return (
    candidate.schemaVersion === 3 &&
    Number.isSafeInteger(candidate.revision) &&
    Number(candidate.revision) >= 0 &&
    isOrchestrationProfile(candidate.orchestrationProfile) &&
    isModelTierConfiguration(candidate.modelTierConfiguration) &&
    isLegacySessionSnapshot({ ...candidate, schemaVersion: 1 })
  );
}

function isLegacyV2SessionSnapshot(
  value: unknown,
): value is LegacyV2CliSessionSnapshot {
  const candidate = record(value);
  return (
    candidate.schemaVersion === 2 &&
    isOrchestrationProfile(candidate.orchestrationProfile) &&
    (candidate.modelTierConfiguration === undefined ||
      isModelTierConfiguration(candidate.modelTierConfiguration)) &&
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
      isOrchestrationProfile(workingConfig.orchestrationProfile)) &&
    (workingConfig.modelTierConfiguration === undefined ||
      isModelTierConfiguration(workingConfig.modelTierConfiguration))
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

function isLegacyV2CliPreferences(
  value: unknown,
): value is LegacyV2CliPreferences {
  const candidate = record(value);
  return (
    candidate.schemaVersion === 2 &&
    (candidate.debugMode === undefined ||
      typeof candidate.debugMode === "boolean") &&
    isLegacyCliPreferences({ ...candidate, schemaVersion: 1 })
  );
}

function isLegacyV3CliPreferences(
  value: unknown,
): value is LegacyV3CliPreferences {
  const candidate = record(value);
  return (
    candidate.schemaVersion === 3 &&
    typeof candidate.debugMode === "boolean" &&
    isLegacyCliPreferences({ ...candidate, schemaVersion: 1 })
  );
}

function isAppearancePreferences(
  value: unknown,
): value is CliAppearancePreferences {
  const candidate = record(value);
  return (
    typeof candidate.color === "boolean" &&
    typeof candidate.motion === "boolean" &&
    typeof candidate.richText === "boolean" &&
    isTerminalThemeId(candidate.themeId) &&
    TERMINAL_SCREEN_MODES.includes(candidate.screenMode as TerminalScreenMode)
  );
}

function isLegacyAppearancePreferences(value: unknown): boolean {
  const candidate = record(value);
  return (
    typeof candidate.color === "boolean" &&
    typeof candidate.motion === "boolean" &&
    typeof candidate.richText === "boolean"
  );
}

function isLegacyV4CliPreferences(
  value: unknown,
): value is LegacyV4CliPreferences {
  const candidate = record(value);
  const appearance = record(candidate.appearance);
  return (
    candidate.schemaVersion === 4 &&
    typeof candidate.debugMode === "boolean" &&
    typeof appearance.color === "boolean" &&
    typeof appearance.motion === "boolean" &&
    isLegacyCliPreferences({ ...candidate, schemaVersion: 1 })
  );
}

function isLegacyV5CliPreferences(
  value: unknown,
): value is LegacyV5CliPreferences {
  const candidate = record(value);
  try {
    if (candidate.capabilityRuntime !== undefined) {
      const runtime = record(candidate.capabilityRuntime);
      validateCapabilityRuntimeSettings(
        {
          ...runtime,
          autoImproveMode:
            runtime.autoImproveMode === "auto" ||
            runtime.autoImproveMode === "suggest" ||
            runtime.autoImproveMode === "bounded_auto"
              ? "shadow_review"
              : runtime.autoImproveMode,
        } as CapabilityRuntimeSettingsV1,
      );
    }
  } catch {
    return false;
  }
  return (
    candidate.schemaVersion === 5 &&
    typeof candidate.debugMode === "boolean" &&
    (
      candidate.updateCheckConsent === undefined ||
      ["unknown", "enabled", "disabled"].includes(
        String(candidate.updateCheckConsent),
      )
    ) &&
    isLegacyAppearancePreferences(candidate.appearance) &&
    isLegacyCliPreferences({ ...candidate, schemaVersion: 1 })
  );
}

function isCliPreferences(value: unknown): value is CliPreferences {
  const candidate = record(value);
  try {
    if (candidate.capabilityRuntime !== undefined) {
      const runtime = record(candidate.capabilityRuntime);
      validateCapabilityRuntimeSettings(
        {
          ...runtime,
          autoImproveMode:
            runtime.autoImproveMode === "auto" ||
            runtime.autoImproveMode === "suggest" ||
            runtime.autoImproveMode === "bounded_auto"
              ? "shadow_review"
              : runtime.autoImproveMode,
        } as CapabilityRuntimeSettingsV1,
      );
    }
    validateShortcutPreferences(
      candidate.shortcuts as CliShortcutPreferences,
    );
    validateStatuslinePreferences(
      candidate.statusline as CliStatuslinePreferences,
    );
    validateClipboardPreferences(
      candidate.clipboard as CliClipboardPreferences,
    );
  } catch {
    return false;
  }
  return (
    candidate.schemaVersion === 12 &&
    ["off", "important", "full"].includes(
      String(candidate.activityDetails),
    ) &&
    ["auto_trusted", "manual"].includes(String(candidate.skillRouting)) &&
    (
      candidate.updateCheckConsent === undefined ||
      ["unknown", "enabled", "disabled"].includes(
        String(candidate.updateCheckConsent),
      )
    ) &&
    (
      candidate.sessionRetention === undefined ||
      (
        ["automatic_audited", "audit_only"].includes(
          String(record(candidate.sessionRetention).mode),
        ) &&
        (
          record(candidate.sessionRetention).consentedAt === undefined ||
          isIsoTimestamp(record(candidate.sessionRetention).consentedAt)
        )
      )
    ) &&
    isAppearancePreferences(candidate.appearance) &&
    isLegacyCliPreferences({ ...candidate, schemaVersion: 1 })
  );
}

function isLegacyV10CliPreferences(
  value: unknown,
): value is LegacyV10CliPreferences {
  const candidate = record(value);
  return (
    candidate.schemaVersion === 10 &&
    isLegacyV11CliPreferences({
      ...candidate,
      schemaVersion: 11,
      clipboard: DEFAULT_CLI_CLIPBOARD,
    })
  );
}

function isLegacyV11CliPreferences(
  value: unknown,
): value is LegacyV11CliPreferences {
  const candidate = record(value);
  return (
    candidate.schemaVersion === 11 &&
    isCliPreferences({
      ...candidate,
      schemaVersion: 12,
      skillRouting: "auto_trusted",
    })
  );
}

function isLegacyV9CliPreferences(
  value: unknown,
): value is LegacyV9CliPreferences {
  const candidate = record(value);
  return (
    candidate.schemaVersion === 9 &&
    isLegacyV10CliPreferences({
      ...candidate,
      schemaVersion: 10,
      appearance: {
        ...record(candidate.appearance),
        screenMode: "auto",
      },
    })
  );
}

function isLegacyV8CliPreferences(
  value: unknown,
): value is LegacyV8CliPreferences {
  const candidate = record(value);
  return (
    candidate.schemaVersion === 8 &&
    isLegacyV9CliPreferences({
      ...candidate,
      schemaVersion: 9,
      statusline: DEFAULT_CLI_STATUSLINE,
    })
  );
}

function isLegacyV6CliPreferences(
  value: unknown,
): value is LegacyV6CliPreferences {
  const candidate = record(value);
  return (
    candidate.schemaVersion === 6 &&
    ["off", "important", "full"].includes(String(candidate.activityDetails)) &&
    isLegacyAppearancePreferences(candidate.appearance) &&
    isLegacyCliPreferences({ ...candidate, schemaVersion: 1 })
  );
}

function isLegacyV7CliPreferences(
  value: unknown,
): value is LegacyV7CliPreferences {
  const candidate = record(value);
  try {
    validateShortcutPreferences(
      candidate.shortcuts as CliShortcutPreferences,
    );
  } catch {
    return false;
  }
  return (
    candidate.schemaVersion === 7 &&
    ["off", "important", "full"].includes(String(candidate.activityDetails)) &&
    isLegacyAppearancePreferences(candidate.appearance) &&
    isLegacyCliPreferences({ ...candidate, schemaVersion: 1 })
  );
}

function migrateSessionSnapshot(
  value:
    | LegacyCliSessionSnapshot
    | LegacyV2CliSessionSnapshot
    | LegacyV3CliSessionSnapshot
    | CliSessionSnapshot,
): CliSessionSnapshot {
  if (value.schemaVersion === 4) {
    return {
      ...value,
      redaction: value.redaction ?? emptyRedactionMetadata(),
    };
  }
  if (value.schemaVersion === 3) {
    return {
      ...value,
      schemaVersion: 4,
      redaction: value.redaction ?? emptyRedactionMetadata(),
    };
  }
  if (value.schemaVersion === 2) {
    return {
      ...value,
      schemaVersion: 4,
      revision: Math.max(0, value.revision ?? 0),
      redaction: value.redaction ?? emptyRedactionMetadata(),
      modelTierConfiguration:
        value.modelTierConfiguration ??
        migrateOrchestrationProfileToModelTiers(value.orchestrationProfile),
    };
  }
  const orchestrationProfile = createLegacySingleModelProfile(
    value.modelId,
    value.thinkingEffort,
  );
  return {
    ...value,
    schemaVersion: 4,
    revision: Math.max(0, value.revision ?? 0),
    redaction: emptyRedactionMetadata(),
    orchestrationProfile,
    modelTierConfiguration:
      migrateOrchestrationProfileToModelTiers(orchestrationProfile),
  };
}

function migratePreferences(
  value:
    | LegacyCliPreferences
    | LegacyV2CliPreferences
    | LegacyV3CliPreferences
    | LegacyV4CliPreferences
    | LegacyV5CliPreferences
    | LegacyV6CliPreferences
    | LegacyV7CliPreferences
    | LegacyV8CliPreferences
    | LegacyV9CliPreferences
    | LegacyV10CliPreferences
    | LegacyV11CliPreferences
    | CliPreferences,
): CliPreferences {
  if (value.schemaVersion === 12) {
    return {
      ...value,
      clipboard: clipboardPreferences(value.clipboard),
      statusline: statuslinePreferences(value.statusline),
    };
  }
  if (value.schemaVersion === 11) {
    return {
      ...value,
      schemaVersion: 12,
      skillRouting: "auto_trusted",
      clipboard: clipboardPreferences(value.clipboard),
      statusline: statuslinePreferences(value.statusline),
    };
  }
  if (value.schemaVersion === 10) {
    return {
      ...value,
      schemaVersion: 12,
      skillRouting: "auto_trusted",
      clipboard: clipboardPreferences(),
      statusline: statuslinePreferences(value.statusline),
    };
  }
  if (value.schemaVersion === 9) {
    return {
      ...value,
      schemaVersion: 12,
      skillRouting: "auto_trusted",
      appearance: {
        ...value.appearance,
        screenMode: "auto",
      },
      clipboard: clipboardPreferences(),
      statusline: statuslinePreferences(value.statusline),
    };
  }
  if (value.schemaVersion === 8) {
    return {
      ...value,
      schemaVersion: 12,
      skillRouting: "auto_trusted",
      appearance: {
        ...value.appearance,
        screenMode: "auto",
      },
      clipboard: clipboardPreferences(),
      statusline: statuslinePreferences(),
    };
  }
  if (value.schemaVersion === 7) {
    return {
      ...value,
      schemaVersion: 12,
      skillRouting: "auto_trusted",
      appearance: {
        ...value.appearance,
        themeId: DEFAULT_TERMINAL_THEME_ID,
        screenMode: "auto",
      },
      clipboard: clipboardPreferences(),
      statusline: statuslinePreferences(),
    };
  }
  if (value.schemaVersion === 6) {
    const migrated = value.capabilityRuntime
      ? {
          ...value,
          capabilityRuntime: {
            ...value.capabilityRuntime,
            autoImproveMode:
              (value.capabilityRuntime.autoImproveMode as string) === "auto" ||
              (value.capabilityRuntime.autoImproveMode as string) === "suggest" ||
              (value.capabilityRuntime.autoImproveMode as string) === "bounded_auto"
                ? "shadow_review"
                : value.capabilityRuntime.autoImproveMode,
          },
        }
      : {
          ...value,
          capabilityRuntime: createDefaultCapabilityRuntimeSettings(),
        };
    return {
      ...migrated,
      schemaVersion: 12,
      skillRouting: "auto_trusted",
      appearance: {
        ...migrated.appearance,
        themeId: DEFAULT_TERMINAL_THEME_ID,
        screenMode: "auto",
      },
      clipboard: clipboardPreferences(),
      shortcuts: shortcutPreferences(),
      statusline: statuslinePreferences(),
    };
  }
  if (value.schemaVersion === 5) {
    const { debugMode, ...legacyPreferences } = value;
    const capabilityRuntime = value.capabilityRuntime
      ? {
          ...value.capabilityRuntime,
          autoImproveMode:
            (value.capabilityRuntime.autoImproveMode as string) === "auto" ||
            (value.capabilityRuntime.autoImproveMode as string) === "suggest" ||
            (value.capabilityRuntime.autoImproveMode as string) === "bounded_auto"
              ? "shadow_review" as const
              : value.capabilityRuntime.autoImproveMode,
        }
      : createDefaultCapabilityRuntimeSettings();
    return {
      ...legacyPreferences,
      schemaVersion: 12,
      skillRouting: "auto_trusted",
      activityDetails: debugMode ? "full" : "important",
      appearance: {
        ...legacyPreferences.appearance,
        themeId: DEFAULT_TERMINAL_THEME_ID,
        screenMode: "auto",
      },
      capabilityRuntime,
      clipboard: clipboardPreferences(),
      shortcuts: shortcutPreferences(),
      statusline: statuslinePreferences(),
    };
  }
  const legacyDebugMode =
    "debugMode" in value && value.debugMode === true;
  const {
    debugMode: _ignoredDebugMode,
    ...legacyValue
  } = value as typeof value & { debugMode?: boolean };
  const workingConfig = value.workingConfig;
  const orchestrationProfile =
    workingConfig?.orchestrationProfile ??
    (workingConfig?.modelId || workingConfig?.thinkingEffort
      ? createLegacySingleModelProfile(
          workingConfig.modelId ?? "gpt-5.5",
          workingConfig.thinkingEffort ?? "high",
        )
      : undefined);
  const modelTierConfiguration =
    workingConfig?.modelTierConfiguration ??
    (orchestrationProfile
      ? migrateOrchestrationProfileToModelTiers(orchestrationProfile)
      : undefined);
  return {
    ...legacyValue,
    schemaVersion: 12,
    skillRouting: "auto_trusted",
    activityDetails: legacyDebugMode ? "full" : "important",
    appearance:
      value.schemaVersion === 4
        ? {
            ...value.appearance,
            richText: true,
            themeId: DEFAULT_TERMINAL_THEME_ID,
            screenMode: "auto",
          }
        : { ...DEFAULT_CLI_APPEARANCE },
    capabilityRuntime: createDefaultCapabilityRuntimeSettings(),
    clipboard: structuredClone(DEFAULT_CLI_CLIPBOARD),
    shortcuts: structuredClone(DEFAULT_CLI_SHORTCUTS),
    statusline: structuredClone(DEFAULT_CLI_STATUSLINE),
    ...(workingConfig
      ? {
          workingConfig: normalizeCliWorkingConfig({
            ...workingConfig,
            ...(orchestrationProfile ? { orchestrationProfile } : {}),
            ...(modelTierConfiguration ? { modelTierConfiguration } : {}),
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
  maxBytes = MAX_SESSION_FILE_BYTES,
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
  if (metadata.size > maxBytes) {
    throw new Error(`Orynt state file is too large: ${filePath}`);
  }
}

async function readPrivateTextFile(
  filePath: string,
  maxBytes = MAX_SESSION_FILE_BYTES,
): Promise<string> {
  const beforeOpen = await lstat(filePath);
  assertPrivateRegularFile(filePath, beforeOpen, maxBytes);
  const handle = await open(
    filePath,
    constants.O_RDONLY | constants.O_NOFOLLOW,
  );
  try {
    const opened = await handle.stat();
    assertPrivateRegularFile(filePath, opened, maxBytes);
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
  const sanitizedRecentTurns = (session.recentTurns ?? [])
    .slice(-MAX_RECENT_TURNS)
    .flatMap((turn) => {
      const content = redactSensitivePayload(turn.content).payload;
      if (typeof content !== "string" || !content.trim()) return [];
      return [{
        role: turn.role,
        content: content.trim().slice(0, MAX_RECENT_TURN_TEXT),
        recordedAt: turn.recordedAt,
      }];
    });
  const normalized: Record<string, unknown> = {
    ...session,
  };
  normalized.schemaVersion = 4;
  normalized.revision = Math.max(0, Math.trunc(session.revision));
  delete normalized.redaction;
  if (session.title) {
    normalized.title = session.title.trim().slice(0, MAX_SESSION_TITLE);
  }
  if (session.conversationSummary) {
    normalized.conversationSummary = session.conversationSummary.slice(
      0,
      MAX_SESSION_SUMMARY,
    );
  }
  if (sanitizedRecentTurns.length > 0) {
    normalized.recentTurns = sanitizedRecentTurns;
  } else {
    delete normalized.recentTurns;
  }
  const redactionResult = redactSensitivePayload(normalized);
  const redacted = redactionResult.payload;
  redacted.redaction = redactionResult.redaction;
  if (session.promptUnderstandingDraft) {
    redacted.promptUnderstandingDraft = sanitizeCliPromptUnderstandingDraft({
      ...session.promptUnderstandingDraft,
      requiresReconfirmation: true,
    });
  }
  const value = `${JSON.stringify(redacted, null, 2)}\n`;
  if (Buffer.byteLength(value) > MAX_SESSION_FILE_BYTES) {
    throw new Error("Orynt session snapshot exceeds the 128 KiB safety limit");
  }
  return value;
}

function sessionTitle(session: CliSessionSnapshot): string {
  return (
    session.title?.trim() ||
    session.goal?.trim() ||
    session.conversationSummary?.trim() ||
    session.sessionId
  ).replace(/\s+/gu, " ").slice(0, MAX_SESSION_TITLE);
}

function catalogEntry(
  session: CliSessionSnapshot,
  snapshotBytes: number,
): CliSessionCatalogEntry {
  return {
    sessionId: session.sessionId,
    title: sessionTitle(session),
    repositoryPath: session.repositoryPath,
    pinned: session.pinned === true,
    ...(session.trashedAt ? { trashedAt: session.trashedAt } : {}),
    turnCount: session.turnCount ?? 0,
    snapshotBytes,
    ...(session.lastRun
      ? {
          lastRunId: session.lastRun.runId,
          verification: session.lastRun.verification,
        }
      : {}),
    modifiedWorktreeProtected:
      session.lastRun?.resources?.sandboxChanged === true,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };
}

export class FileCliSessionStore {
  constructor(private readonly root: string) {}

  private get sessionsRoot(): string {
    return path.join(this.root, "sessions");
  }

  private transcriptPath(sessionId: string): string {
    return path.join(
      this.sessionsRoot,
      `${assertSessionId(sessionId)}.transcript.jsonl`,
    );
  }

  async appendTranscript(
    sessionId: string,
    logicalTurnId: string,
    messages: Array<{ role: "user" | "agent"; content: string }>,
    recordedAt = new Date().toISOString(),
  ): Promise<CliSessionSnapshot["transcript"]> {
    if (!logicalTurnId || logicalTurnId.length > 240) {
      throw new Error("Invalid Orynt transcript logical turn id");
    }
    if (!isIsoTimestamp(recordedAt)) {
      throw new Error("Invalid Orynt transcript timestamp");
    }
    await ensurePrivateDirectory(this.root);
    await ensurePrivateDirectory(this.sessionsRoot);
    const filePath = this.transcriptPath(sessionId);
    return withExclusiveFileLock(filePath, async () => {
      let entries: CliTranscriptEntryV1[] = [];
      try {
        entries = parseTranscriptEntries(
          await readPrivateTextFile(filePath, MAX_TRANSCRIPT_FILE_BYTES),
        );
      } catch (error) {
        if ((error as { code?: string }).code !== "ENOENT") throw error;
      }
      let previousHash = entries.at(-1)?.contentHash;
      for (const message of messages) {
        const redacted = redactSensitivePayload(message.content).payload;
        const content =
          typeof redacted === "string" ? redacted : String(redacted);
        const base = {
          sequence: entries.length + 1,
          logicalTurnId,
          role: message.role,
          content,
          recordedAt,
          ...(previousHash ? { previousHash } : {}),
        };
        const entry: CliTranscriptEntryV1 = {
          schemaVersion: 1,
          ...base,
          contentHash: transcriptEntryHash(base),
        };
        entries.push(entry);
        previousHash = entry.contentHash;
      }
      const serialized = entries.map((entry) => JSON.stringify(entry)).join("\n");
      if (Buffer.byteLength(serialized, "utf8") > MAX_TRANSCRIPT_FILE_BYTES) {
        throw new Error("Orynt session transcript exceeds the 16 MiB safety limit");
      }
      await atomicWriteFileDurable(
        filePath,
        serialized ? `${serialized}\n` : "",
      );
      return {
        schemaVersion: 1,
        entryCount: entries.length,
        lastSequence: entries.at(-1)?.sequence ?? 0,
        ...(previousHash ? { lastHash: previousHash } : {}),
      };
    });
  }

  async readTranscript(
    sessionId: string,
    options: { limit?: number; cursor?: number } = {},
  ): Promise<CliTranscriptPage> {
    const limit = Math.max(1, Math.min(200, Math.trunc(options.limit ?? 20)));
    let entries: CliTranscriptEntryV1[];
    try {
      entries = parseTranscriptEntries(
        await readPrivateTextFile(
          this.transcriptPath(sessionId),
          MAX_TRANSCRIPT_FILE_BYTES,
        ),
      );
    } catch (error) {
      if ((error as { code?: string }).code === "ENOENT") {
        return { entries: [], total: 0 };
      }
      throw error;
    }
    const end = Math.max(
      0,
      Math.min(entries.length, Math.trunc(options.cursor ?? entries.length)),
    );
    const start = Math.max(0, end - limit);
    return {
      entries: entries.slice(start, end).map((entry) =>
        structuredClone(entry)
      ),
      total: entries.length,
      ...(start > 0 ? { nextCursor: start } : {}),
    };
  }

  private async appendMaintenanceAudit(
    entries: CliSessionMaintenanceAuditEntry[],
  ): Promise<void> {
    if (entries.length === 0) return;
    const auditPath = path.join(this.sessionsRoot, "maintenance-audit.json");
    let existing: CliSessionMaintenanceAuditEntry[] = [];
    try {
      const parsed = JSON.parse(await readPrivateTextFile(auditPath)) as unknown;
      if (Array.isArray(parsed)) {
        existing = parsed.filter(
          (entry): entry is CliSessionMaintenanceAuditEntry =>
            typeof record(entry).operationId === "string" &&
            typeof record(entry).sessionId === "string" &&
            typeof record(entry).action === "string" &&
            typeof record(entry).status === "string" &&
            typeof record(entry).recordedAt === "string",
        );
      }
    } catch (error) {
      if ((error as { code?: string }).code !== "ENOENT") throw error;
    }
    await atomicWriteFileDurable(
      auditPath,
      `${JSON.stringify([...existing, ...entries].slice(-200), null, 2)}\n`,
    );
  }

  private async writeSnapshot(
    session: CliSessionSnapshot,
    updateLatest: boolean,
    expectedRevision: number,
  ): Promise<CliSessionSnapshot> {
    const sessionId = assertSessionId(session.sessionId);
    await ensurePrivateDirectory(this.root);
    await ensurePrivateDirectory(this.sessionsRoot);
    const sessionPath = path.join(this.sessionsRoot, `${sessionId}.json`);
    return withExclusiveFileLock(sessionPath, async () => {
      const current = await this.load(sessionId);
      const currentRevision = current?.revision ?? 0;
      if (
        (current && currentRevision !== expectedRevision) ||
        (!current && expectedRevision !== 0)
      ) {
        throw new LocalStateError(
          "revision_conflict",
          `session revision conflict: expected ${expectedRevision}, current ${
            current?.revision ?? "missing"
          }`,
        );
      }
      const next: CliSessionSnapshot = {
        ...session,
        schemaVersion: 4,
        revision: current ? currentRevision + 1 : 1,
      };
      const value = serializedSession(next);
      const normalized = JSON.parse(value) as unknown;
      if (!isSessionSnapshot(normalized)) {
        throw new Error("Invalid Orynt session snapshot");
      }
      await atomicWriteFileDurable(sessionPath, value);
      if (updateLatest) {
        await atomicWriteFileDurable(
          path.join(this.sessionsRoot, "latest"),
          `${sessionId}\n`,
        );
      }
      return normalized;
    });
  }

  async save(session: CliSessionSnapshot): Promise<CliSessionSnapshot> {
    return this.writeSnapshot(session, true, session.revision);
  }

  async load(sessionId: string): Promise<CliSessionSnapshot | undefined> {
    await ensurePrivateDirectory(this.root);
    await ensurePrivateDirectory(this.sessionsRoot);
    try {
      const parsed = JSON.parse(
        await readPrivateTextFile(
          path.join(this.sessionsRoot, `${assertSessionId(sessionId)}.json`),
        ),
      ) as unknown;
      if (
        !isSessionSnapshot(parsed) &&
        !isLegacyV3SessionSnapshot(parsed) &&
        !isLegacyV2SessionSnapshot(parsed) &&
        !isLegacySessionSnapshot(parsed)
      ) {
        throw new Error(`Invalid Orynt session snapshot: ${sessionId}`);
      }
      const migrated = migrateSessionSnapshot(parsed);
      if (parsed.schemaVersion !== 4) {
        await writePrivateTextFileAtomically(
          path.join(this.sessionsRoot, `${assertSessionId(sessionId)}.json`),
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
    await ensurePrivateDirectory(this.sessionsRoot);
    try {
      const sessionId = (
        await readPrivateTextFile(path.join(this.sessionsRoot, "latest"))
      ).trim();
      if (sessionId) {
        const pointed = await this.load(sessionId);
        if (pointed && !pointed.trashedAt) return pointed;
      }
    } catch (error) {
      if ((error as { code?: string }).code !== "ENOENT") throw error;
    }
    const active = await this.list({
      includeTrash: false,
      internalMaintenanceScan: true,
    });
    const candidates = [...active.entries].sort(
      (left, right) =>
        right.updatedAt.localeCompare(left.updatedAt) ||
        left.sessionId.localeCompare(right.sessionId),
    );
    for (const candidate of candidates) {
      const session = await this.load(candidate.sessionId);
      if (session && !session.trashedAt) return session;
    }
    return undefined;
  }

  async list(options: CliSessionListOptions = {}): Promise<CliSessionPage> {
    await ensurePrivateDirectory(this.root);
    await ensurePrivateDirectory(this.sessionsRoot);
    const limit = options.internalMaintenanceScan
      ? Number.MAX_SAFE_INTEGER
      : Math.min(
          MAX_SESSION_LIMIT,
          Math.max(1, Math.trunc(options.limit ?? DEFAULT_SESSION_LIMIT)),
        );
    const names = (await readdir(this.sessionsRoot))
      .filter(
        (name) =>
          name.endsWith(".json") &&
          name !== "catalog.json" &&
          name !== "maintenance.json" &&
          name !== "maintenance-audit.json",
      )
      .sort();
    const entries: CliSessionCatalogEntry[] = [];
    const issues: NonNullable<CliSessionPage["issues"]> = [];
    for (const name of names) {
      const sessionId = name.slice(0, -5);
      let session: CliSessionSnapshot | undefined;
      try {
        session = await this.load(sessionId);
      } catch {
        issues.push({
          sessionId,
          reason: "invalid_or_unreadable_snapshot",
        });
        continue;
      }
      if (!session) continue;
      if (
        options.repositoryPath &&
        path.resolve(session.repositoryPath) !==
          path.resolve(options.repositoryPath)
      ) {
        continue;
      }
      if (!options.includeTrash && session.trashedAt) continue;
      const metadata = await stat(path.join(this.sessionsRoot, name));
      entries.push(catalogEntry(session, metadata.size));
    }
    entries.sort(
      (left, right) =>
        Number(right.pinned) - Number(left.pinned) ||
        right.updatedAt.localeCompare(left.updatedAt) ||
        left.sessionId.localeCompare(right.sessionId),
    );
    const start = options.cursor
      ? Math.max(
          0,
          entries.findIndex(({ sessionId }) => sessionId === options.cursor) +
            1,
        )
      : 0;
    const page = entries.slice(start, start + limit);
    return {
      entries: page,
      ...(start + page.length < entries.length && page.length > 0
        ? { nextCursor: page.at(-1)?.sessionId }
        : {}),
      ...(issues.length > 0 ? { issues } : {}),
    };
  }

  private async update(
    sessionId: string,
    mutate: (session: CliSessionSnapshot) => CliSessionSnapshot,
  ): Promise<CliSessionSnapshot> {
    const current = await this.load(sessionId);
    if (!current) throw new Error(`Session not found: ${sessionId}`);
    const updated = mutate(structuredClone(current));
    updated.updatedAt = new Date().toISOString();
    return this.writeSnapshot(updated, false, current.revision);
  }

  async setPinned(sessionId: string, pinned: boolean): Promise<CliSessionSnapshot> {
    return this.update(sessionId, (session) => ({ ...session, pinned }));
  }

  async trash(sessionId: string): Promise<CliSessionSnapshot> {
    return this.update(sessionId, (session) => {
      if (session.pinned) throw new Error("Pinned sessions cannot be trashed");
      return { ...session, trashedAt: new Date().toISOString() };
    });
  }

  async restore(sessionId: string): Promise<CliSessionSnapshot> {
    return this.update(sessionId, (session) => {
      const restored = { ...session };
      delete restored.trashedAt;
      return restored;
    });
  }

  async maintain(
    now = new Date(),
    apply = false,
  ): Promise<CliSessionMaintenanceReport> {
    const all = await this.list({
      includeTrash: true,
      internalMaintenanceScan: true,
    });
    const report: CliSessionMaintenanceReport = {
      inspected: 0,
      trashed: [],
      purged: [],
      skippedProtected: [],
      artifactCleanup: [],
      sandboxCleanup: [],
      cleanupBlocked: [],
      budgetExhausted: false,
    };
    const retentionCutoff =
      now.getTime() - SESSION_RETENTION_DAYS * 24 * 60 * 60 * 1_000;
    const trashCutoff =
      now.getTime() - SESSION_TRASH_DAYS * 24 * 60 * 60 * 1_000;
    const artifactCutoff =
      now.getTime() - ARTIFACT_RETENTION_DAYS * 24 * 60 * 60 * 1_000;
    const sandboxCutoff =
      now.getTime() - CLEAN_SANDBOX_RETENTION_DAYS * 24 * 60 * 60 * 1_000;
    const active = all.entries.filter((entry) => !entry.trashedAt);
    const overLimit = new Set(
      active.slice(SESSION_ACTIVE_LIMIT).map(({ sessionId }) => sessionId),
    );
    const operationId = randomUUID();
    const auditEntries: CliSessionMaintenanceAuditEntry[] = [];
    for (const entry of [...all.entries].reverse()) {
      if (
        entry.pinned ||
        entry.verification === "pending" ||
        entry.modifiedWorktreeProtected
      ) {
        report.skippedProtected.push(entry.sessionId);
        continue;
      }
      if (report.inspected >= MAINTENANCE_ENTRY_BUDGET) {
        report.budgetExhausted = true;
        break;
      }
      report.inspected += 1;
      const session = await this.load(entry.sessionId);
      if (!session) continue;
      const resources = session.lastRun?.resources;
      let resourceCleanupBlocked = false;
      let resourcesChanged = false;
      if (
        resources?.sandboxWorktreePath &&
        !resources.sandboxRemovedAt &&
        Date.parse(entry.updatedAt) <= sandboxCutoff
      ) {
        report.sandboxCleanup.push(entry.sessionId);
        if (apply) {
          try {
            await removeCleanManagedWorktree(
              session.repositoryPath,
              resources.sandboxWorktreePath,
              path.join(this.root, "sandboxes"),
            );
            resources.sandboxRemovedAt = now.toISOString();
            resourcesChanged = true;
          } catch {
            report.sandboxCleanup.pop();
            report.cleanupBlocked.push(entry.sessionId);
            resourceCleanupBlocked = true;
            auditEntries.push({
              operationId,
              sessionId: entry.sessionId,
              action: "sandbox_cleanup",
              status: "blocked",
              recordedAt: now.toISOString(),
              reason: "worktree_not_clean_or_not_managed",
            });
          }
          if (!resourceCleanupBlocked) {
            auditEntries.push({
              operationId,
              sessionId: entry.sessionId,
              action: "sandbox_cleanup",
              status: "completed",
              recordedAt: now.toISOString(),
            });
          }
        }
      }
      if (
        !resourceCleanupBlocked &&
        resources?.artifactRoot &&
        !resources.artifactPurgedAt &&
        Date.parse(entry.updatedAt) <= artifactCutoff
      ) {
        if (
          isManagedChild(resources.artifactRoot, path.join(this.root, "artifacts"))
        ) {
          report.artifactCleanup.push(entry.sessionId);
          if (apply) {
            try {
              await removeManagedArtifactRoot(
                resources.artifactRoot,
                path.join(this.root, "artifacts"),
              );
              resources.artifactPurgedAt = now.toISOString();
              resourcesChanged = true;
              auditEntries.push({
                operationId,
                sessionId: entry.sessionId,
                action: "artifact_cleanup",
                status: "completed",
                recordedAt: now.toISOString(),
              });
            } catch {
              report.artifactCleanup.pop();
              if (!report.cleanupBlocked.includes(entry.sessionId)) {
                report.cleanupBlocked.push(entry.sessionId);
              }
              resourceCleanupBlocked = true;
              auditEntries.push({
                operationId,
                sessionId: entry.sessionId,
                action: "artifact_cleanup",
                status: "blocked",
                recordedAt: now.toISOString(),
                reason: "artifact_not_managed",
              });
            }
          }
        } else {
          if (!report.cleanupBlocked.includes(entry.sessionId)) {
            report.cleanupBlocked.push(entry.sessionId);
          }
        }
      }
      if (apply && resourcesChanged) {
        await this.writeSnapshot(session, false, session.revision);
      }
      if (resourceCleanupBlocked) continue;
      if (
        entry.trashedAt &&
        Date.parse(entry.trashedAt) <= trashCutoff
      ) {
        report.purged.push(entry.sessionId);
        if (apply) {
          await unlink(
            path.join(this.sessionsRoot, `${assertSessionId(entry.sessionId)}.json`),
          );
          await unlink(this.transcriptPath(entry.sessionId)).catch((error) => {
            if ((error as { code?: string }).code !== "ENOENT") throw error;
          });
          auditEntries.push({
            operationId,
            sessionId: entry.sessionId,
            action: "purge",
            status: "completed",
            recordedAt: now.toISOString(),
          });
        }
        continue;
      }
      if (
        !entry.trashedAt &&
        (Date.parse(entry.updatedAt) <= retentionCutoff ||
          overLimit.has(entry.sessionId))
      ) {
        report.trashed.push(entry.sessionId);
        if (apply) {
          await this.trash(entry.sessionId);
          auditEntries.push({
            operationId,
            sessionId: entry.sessionId,
            action: "trash",
            status: "completed",
            recordedAt: now.toISOString(),
          });
        }
      }
    }
    if (apply) await this.appendMaintenanceAudit(auditEntries);
    return report;
  }

  async maintainIfDue(
    now = new Date(),
  ): Promise<CliSessionMaintenanceReport | undefined> {
    const markerPath = path.join(this.sessionsRoot, "maintenance.json");
    await ensurePrivateDirectory(this.root);
    await ensurePrivateDirectory(this.sessionsRoot);
    return withExclusiveFileLock(markerPath, async () => {
      try {
        const marker = record(
          JSON.parse(await readPrivateTextFile(markerPath)) as unknown,
        );
        const retryDelay =
          marker.budgetExhausted === true
            ? 5 * 60 * 1_000
            : 24 * 60 * 60 * 1_000;
        if (
          typeof marker.completedAt === "string" &&
          now.getTime() - Date.parse(marker.completedAt) < retryDelay
        ) {
          return undefined;
        }
      } catch (error) {
        if ((error as { code?: string }).code !== "ENOENT") throw error;
      }
      const report = await this.maintain(now, true);
      await atomicWriteFileDurable(
        markerPath,
        `${JSON.stringify({
          schemaVersion: 1,
          completedAt: now.toISOString(),
          inspected: report.inspected,
          budgetExhausted: report.budgetExhausted,
        }, null, 2)}\n`,
      );
      return report;
    });
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
      if (
        !isCliPreferences(parsed) &&
        !isLegacyV11CliPreferences(parsed) &&
        !isLegacyV10CliPreferences(parsed) &&
        !isLegacyV9CliPreferences(parsed) &&
        !isLegacyV8CliPreferences(parsed) &&
        !isLegacyV7CliPreferences(parsed) &&
        !isLegacyV6CliPreferences(parsed) &&
        !isLegacyV5CliPreferences(parsed) &&
        !isLegacyV4CliPreferences(parsed) &&
        !isLegacyV3CliPreferences(parsed) &&
        !isLegacyV2CliPreferences(parsed) &&
        !isLegacyCliPreferences(parsed)
      ) {
        throw new Error("Invalid Orynt CLI preferences");
      }
      const migrated = migratePreferences(parsed);
      if (
        parsed.schemaVersion !== 12 ||
        record(record(parsed).capabilityRuntime).autoImproveMode !==
          migrated.capabilityRuntime?.autoImproveMode
      ) {
        await this.write(migrated);
      }
      return migrated;
    } catch (error) {
      if ((error as { code?: string }).code === "ENOENT") {
        return {
          schemaVersion: 12,
          activityDetails: "important",
          skillRouting: "auto_trusted",
          appearance: { ...DEFAULT_CLI_APPEARANCE },
          clipboard: clipboardPreferences(),
          shortcuts: shortcutPreferences(),
          statusline: statuslinePreferences(),
          capabilityRuntime: createDefaultCapabilityRuntimeSettings(),
        };
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

  async saveUpdateCheckConsent(
    updateCheckConsent: "enabled" | "disabled",
  ): Promise<void> {
    await this.write({
      ...(await this.load()),
      updateCheckConsent,
    });
  }

  async saveSessionRetention(
    mode: CliSessionRetentionPolicy["mode"],
    now = new Date().toISOString(),
  ): Promise<void> {
    if (!isIsoTimestamp(now)) {
      throw new Error("Invalid session retention consent timestamp");
    }
    await this.write({
      ...(await this.load()),
      sessionRetention: {
        mode,
        consentedAt: now,
      },
    });
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

  async saveActivityDetails(
    activityDetails: ActivityDetailLevel,
  ): Promise<void> {
    if (!["off", "important", "full"].includes(activityDetails)) {
      throw new Error("Invalid Orynt activity detail preference");
    }
    const preferences = await this.load();
    await this.write({
      ...preferences,
      activityDetails,
    });
  }

  async saveSkillRouting(
    skillRouting: CliPreferences["skillRouting"],
  ): Promise<void> {
    if (skillRouting !== "auto_trusted" && skillRouting !== "manual") {
      throw new Error("Invalid Orynt skill routing preference");
    }
    await this.write({
      ...(await this.load()),
      skillRouting,
    });
  }

  async saveCapabilityRuntime(
    capabilityRuntime: CapabilityRuntimeSettingsV1,
  ): Promise<void> {
    validateCapabilityRuntimeSettings(capabilityRuntime);
    const preferences = await this.load();
    await this.write({
      ...preferences,
      capabilityRuntime: structuredClone(capabilityRuntime),
    });
  }

  async saveAppearance(
    patch: Partial<CliAppearancePreferences>,
  ): Promise<void> {
    const preferences = await this.load();
    const appearance = {
      ...preferences.appearance,
      ...patch,
    };
    if (!isAppearancePreferences(appearance)) {
      throw new Error("Invalid Orynt CLI appearance preferences");
    }
    await this.write({
      ...preferences,
      appearance,
    });
  }

  async saveClipboard(
    clipboard: CliClipboardPreferences,
  ): Promise<void> {
    const normalized = clipboardPreferences(clipboard);
    await this.write({
      ...(await this.load()),
      clipboard: normalized,
    });
  }

  async saveShortcuts(shortcuts: CliShortcutPreferences): Promise<void> {
    const normalized = shortcutPreferences(shortcuts);
    await this.write({
      ...(await this.load()),
      shortcuts: normalized,
    });
  }

  async saveStatusline(statusline: CliStatuslinePreferences): Promise<void> {
    const normalized = statuslinePreferences(statusline);
    await this.write({
      ...(await this.load()),
      statusline: normalized,
    });
  }
}
