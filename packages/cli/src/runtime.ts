import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { runRepositoryAgent } from "@codepawl/coding-apprentice";
import { LocalIntelligenceRuntime } from "@codepawl/intelligence-runtime";
import { captureRepositoryEvidenceScope } from "@codepawl/repository-sandbox";
import {
  createDefaultCapabilityRuntimeSettings,
  createDefaultModelTierConfiguration,
  createDefaultRunBudget,
  createLegacySingleModelProfile,
  createOrchestrationPreset,
  contextVmSessionId,
  contextVmTaskId,
  contextVmContextPackId,
  type ContextVmInvocationArtifactV1,
  type ContextVmDecisionDriverV2,
  type ContextVmInvocationRoleV1,
  type ModelTier,
  type ModelTierBinding,
  type OrchestrationPreset,
  type OrchestrationProfile,
  type OrchestrationRole,
} from "@codepawl/shared";

import type { CliRunRequest, CliRunResult } from "./session.js";
import { probeCodexCli } from "./codexSetup.js";
import { LocalSkillCliManager } from "./skillRuntime.js";
import { createContextVmReadinessDriver } from "./contextVmReadiness.js";
import {
  finishImprovementRun,
  improvementTaskTemplateId,
  prepareImprovementEvaluation,
} from "./improvementScheduler.js";
import { normalizeCliWorkingConfig, readRunSnapshot } from "./state.js";
import type {
  ActivityDetailLevel,
  CliModelOption,
  ThinkingEffort,
} from "./ui.js";
import { ORYNT_VERSION } from "./version.js";
import {
  isTerminalThemeId,
  terminalScreenModeRequested,
  TERMINAL_THEME_IDS,
  type TerminalThemeId,
} from "./terminal-theme.js";

const execFileAsync = promisify(execFile);
const VALID_EFFORTS = new Set<ThinkingEffort>(["minimal", "none", "low", "medium", "high", "xhigh"]);
const MAX_SELECTABLE_MODELS = 500;
export const DEFAULT_CLI_MODEL_ID = "gpt-5.5";
export const DEFAULT_CLI_THINKING_EFFORT: ThinkingEffort = "high";
export const DEFAULT_CLI_ORCHESTRATION_PROFILE =
  createLegacySingleModelProfile(
    DEFAULT_CLI_MODEL_ID,
    DEFAULT_CLI_THINKING_EFFORT,
  );
const PROFILE_NAMES = new Set<OrchestrationPreset>([
  "auto",
  "quality",
  "balanced",
  "economy",
  "custom",
]);
const ROLE_NAMES = new Set<OrchestrationRole>([
  "coordinator",
  "implementer",
  "helper",
  "reviewer",
]);

export type CliArguments = {
  repositoryPath: string;
  modelId: string;
  thinkingEffort: ThinkingEffort;
  color: boolean;
  themeId?: TerminalThemeId;
  explicitConfig: {
    repository: boolean;
    model: boolean;
    thinkingEffort: boolean;
    orchestration: boolean;
  };
  profile?: OrchestrationPreset;
  minimumTier?: ModelTier;
  roleModels: Partial<Record<OrchestrationRole, string>>;
  roleEfforts: Partial<Record<OrchestrationRole, ThinkingEffort>>;
  initialPrompt?: string;
  help?: boolean;
  version?: boolean;
  command?: "run" | "doctor" | "setup" | "usage";
  jsonl?: boolean;
  json?: boolean;
  check?: boolean;
  verbose?: boolean;
  activityDetails?: ActivityDetailLevel;
  approveOnce?: boolean;
  resumeSessionId?: string;
  live?: boolean;
  confirmLive?: boolean;
};

function nextValue(argv: string[], index: number, option: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${option} requires a value`);
  }
  return value;
}

function roleAssignment(
  value: string,
  option: string,
): [OrchestrationRole, string] {
  const separator = value.indexOf("=");
  const role = value.slice(0, separator) as OrchestrationRole;
  const assigned = value.slice(separator + 1).trim();
  if (separator <= 0 || !ROLE_NAMES.has(role) || !assigned) {
    throw new Error(
      `${option} requires role=value where role is coordinator, implementer, helper, or reviewer`,
    );
  }
  return [role, assigned];
}

export function applyCliOrchestrationOverrides(
  base: OrchestrationProfile,
  input: Pick<CliArguments, "profile" | "roleModels" | "roleEfforts">,
): OrchestrationProfile {
  let profile =
    input.profile && input.profile !== "custom" && input.profile !== "auto"
      ? createOrchestrationPreset(input.profile)
      : input.profile === "auto"
        ? { ...createOrchestrationPreset("balanced"), preset: "auto" as const }
        : structuredClone(base);
  const hasOverrides =
    Object.keys(input.roleModels).length > 0 ||
    Object.keys(input.roleEfforts).length > 0;
  if (input.profile === "custom" || hasOverrides) {
    profile = { ...profile, preset: "custom" };
  }
  for (const role of ROLE_NAMES) {
    const modelId = input.roleModels[role];
    const thinkingEffort = input.roleEfforts[role];
    if (!modelId && !thinkingEffort) continue;
    profile.roles[role] = {
      ...profile.roles[role],
      ...(modelId ? { modelId } : {}),
      ...(thinkingEffort ? { thinkingEffort } : {}),
    };
  }
  return profile;
}

export function parseCliArgs(argv: string[], cwd: string): CliArguments {
  let repositoryPath = path.resolve(cwd);
  let modelId = DEFAULT_CLI_MODEL_ID;
  let thinkingEffort: ThinkingEffort = DEFAULT_CLI_THINKING_EFFORT;
  const explicitConfig = {
    repository: false,
    model: false,
    thinkingEffort: false,
    orchestration: false,
  };
  let profile: OrchestrationPreset | undefined;
  let minimumTier: ModelTier | undefined;
  const roleModels: Partial<Record<OrchestrationRole, string>> = {};
  const roleEfforts: Partial<Record<OrchestrationRole, ThinkingEffort>> = {};
  let color = true;
  let themeId: TerminalThemeId | undefined;
  let help = false;
  let version = false;
  let command: CliArguments["command"];
  let jsonl = false;
  let json = false;
  let check = false;
  let verbose = false;
  let activityDetails: ActivityDetailLevel | undefined;
  let approveOnce = false;
  let resumeSessionId: string | undefined;
  let live = false;
  let confirmLive = false;
  let endOfOptions = false;
  const promptTokens: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--") {
      endOfOptions = true;
      continue;
    }
    if (endOfOptions) {
      promptTokens.push(argument);
      continue;
    }
    if (
      promptTokens.length === 0 &&
      command === undefined &&
      (
        argument === "run" ||
        argument === "doctor" ||
        argument === "setup" ||
        argument === "usage"
      )
    ) {
      command = argument;
      continue;
    }
    if (argument === "--repo" || argument === "-C") {
      repositoryPath = path.resolve(cwd, nextValue(argv, index, argument));
      explicitConfig.repository = true;
      index += 1;
      continue;
    }
    if (argument === "--model" || argument === "-m") {
      throw new Error(
        `${argument} was replaced by --profile and --role-model role=id`,
      );
    }
    if (argument === "--effort") {
      throw new Error(
        "--effort was replaced by --role-effort role=level",
      );
    }
    if (argument === "--profile") {
      const value = nextValue(argv, index, argument) as OrchestrationPreset;
      if (!PROFILE_NAMES.has(value)) {
        throw new Error(`Unsupported orchestration profile: ${value}`);
      }
      profile = value;
      explicitConfig.orchestration = true;
      index += 1;
      continue;
    }
    if (argument === "--minimum-tier") {
      const value = nextValue(argv, index, argument) as ModelTier;
      if (!["light", "medium", "heavy"].includes(value)) {
        throw new Error(`Unsupported minimum model tier: ${value}`);
      }
      minimumTier = value;
      index += 1;
      continue;
    }
    if (argument === "--role-model") {
      const [role, value] = roleAssignment(
        nextValue(argv, index, argument),
        argument,
      );
      roleModels[role] = normalizeCliWorkingConfig({ modelId: value }).modelId;
      explicitConfig.orchestration = true;
      index += 1;
      continue;
    }
    if (argument === "--role-effort") {
      const [role, value] = roleAssignment(
        nextValue(argv, index, argument),
        argument,
      );
      if (!VALID_EFFORTS.has(value as ThinkingEffort)) {
        throw new Error(`Unsupported thinking effort: ${value}`);
      }
      roleEfforts[role] = value as ThinkingEffort;
      explicitConfig.orchestration = true;
      index += 1;
      continue;
    }
    if (argument === "--plain" || argument === "--no-color") {
      color = false;
      continue;
    }
    if (argument === "--theme") {
      const value = nextValue(argv, index, argument);
      if (!isTerminalThemeId(value)) {
        throw new Error(
          `Unsupported terminal theme: ${value}. Valid themes: ${TERMINAL_THEME_IDS.join(", ")}`,
        );
      }
      themeId = value;
      index += 1;
      continue;
    }
    if (argument === "--screen") {
      terminalScreenModeRequested([argument, nextValue(argv, index, argument)]);
      index += 1;
      continue;
    }
    if (argument === "--jsonl") {
      jsonl = true;
      continue;
    }
    if (argument === "--json") {
      json = true;
      continue;
    }
    if (argument === "--check") {
      check = true;
      continue;
    }
    if (argument === "--verbose") {
      verbose = true;
      continue;
    }
    if (argument === "--debug") {
      throw new Error(
        "--debug was replaced by --activity-details <off|important|full>",
      );
    }
    if (argument === "--activity-details") {
      const value = nextValue(argv, index, argument);
      if (!["off", "important", "full"].includes(value)) {
        throw new Error(
          "--activity-details must be off, important, or full",
        );
      }
      activityDetails = value as ActivityDetailLevel;
      index += 1;
      continue;
    }
    if (argument === "--live") {
      live = true;
      continue;
    }
    if (argument === "--confirm-live") {
      confirmLive = true;
      continue;
    }
    if (argument === "--approve-once") {
      approveOnce = true;
      continue;
    }
    if (argument === "--resume") {
      resumeSessionId = nextValue(argv, index, argument);
      index += 1;
      continue;
    }
    if (argument === "--help" || argument === "-h") {
      help = true;
      continue;
    }
    if (argument === "--version" || argument === "-v") {
      version = true;
      continue;
    }
    if (argument.startsWith("-")) {
      throw new Error(`Unknown option: ${argument}`);
    }
    promptTokens.push(argument);
  }

  if (command === "run" && !approveOnce) {
    throw new Error("orynt run requires --approve-once to authorize exactly one bounded execution");
  }
  if (command === "run" && promptTokens.length === 0) {
    throw new Error("orynt run requires a goal");
  }
  if (jsonl && command !== "run") {
    throw new Error("--jsonl is only valid with orynt run");
  }
  if (
    json &&
    !(
      command === "doctor" ||
      command === "usage" ||
      (command === "setup" && check)
    )
  ) {
    throw new Error(
      "--json is only valid with orynt doctor, orynt usage, or orynt setup --check",
    );
  }
  if (check && command !== "setup") {
    throw new Error("--check is only valid with orynt setup");
  }
  if (verbose && command !== "doctor" && command !== "usage") {
    throw new Error("--verbose is only valid with orynt doctor or orynt usage");
  }
  if (
    (command === "doctor" || command === "setup" || command === "usage") &&
    promptTokens.length > 0
  ) {
    throw new Error(`orynt ${command} does not accept a goal`);
  }
  if ((live || confirmLive) && command !== "doctor") {
    throw new Error("--live and --confirm-live are only valid with orynt doctor");
  }
  if (live && !confirmLive) {
    throw new Error(
      "orynt doctor --live performs provider calls and requires --confirm-live",
    );
  }
  if (confirmLive && !live) {
    throw new Error("--confirm-live requires orynt doctor --live");
  }

  return {
    repositoryPath,
    modelId,
    thinkingEffort,
    color,
    ...(themeId ? { themeId } : {}),
    explicitConfig,
    roleModels,
    roleEfforts,
    ...(profile ? { profile } : {}),
    ...(minimumTier ? { minimumTier } : {}),
    ...(promptTokens.length > 0 ? { initialPrompt: promptTokens.join(" ") } : {}),
    ...(help ? { help } : {}),
    ...(version ? { version } : {}),
    ...(command ? { command } : {}),
    ...(jsonl ? { jsonl } : {}),
    ...(json ? { json } : {}),
    ...(check ? { check } : {}),
    ...(verbose ? { verbose } : {}),
    ...(activityDetails ? { activityDetails } : {}),
    ...(approveOnce ? { approveOnce } : {}),
    ...(resumeSessionId ? { resumeSessionId } : {}),
    ...(live ? { live } : {}),
    ...(confirmLive ? { confirmLive } : {}),
  };
}

function commandFailureDetail(error: unknown): string {
  if (typeof error === "object" && error !== null) {
    const candidate = error as { code?: unknown; stderr?: unknown; stdout?: unknown; message?: unknown };
    const output = [candidate.stderr, candidate.stdout]
      .filter((value): value is string => typeof value === "string" && Boolean(value.trim()))
      .join(" ")
      .trim();
    if (output) {
      return output.replace(/\s+/g, " ").slice(0, 240);
    }
    if (candidate.code === "ENOENT") {
      return "codex executable not found on PATH";
    }
    if (typeof candidate.message === "string") {
      return candidate.message.replace(/\s+/g, " ").slice(0, 240);
    }
  }
  return String(error);
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function modelThinkingEfforts(model: Record<string, unknown>): ThinkingEffort[] {
  const structured = Array.isArray(model.supported_reasoning_levels)
    ? model.supported_reasoning_levels
        .map((level) => record(level).effort)
        .filter((effort): effort is string => typeof effort === "string")
    : [];
  const flat = [
    model.supported_thinking_efforts,
    model.supportedThinkingEfforts,
    model.supported_reasoning_efforts,
  ].find(Array.isArray);
  const candidates = structured.length > 0
    ? structured
    : Array.isArray(flat)
      ? flat.filter((effort): effort is string => typeof effort === "string")
      : [];
  return [...new Set(
    candidates.filter((effort): effort is ThinkingEffort =>
      VALID_EFFORTS.has(effort as ThinkingEffort)
    ),
  )];
}

export function parseCodexModelCatalog(raw: string): CliModelOption[] {
  const root = record(JSON.parse(raw) as unknown);
  const models = Array.isArray(root.models) ? root.models : [];
  const seen = new Set<string>();
  return models
    .map((value, index) => {
      const model = record(value);
      const id = typeof model.slug === "string" ? model.slug.trim() : "";
      const visibility = typeof model.visibility === "string" ? model.visibility : "";
      if (
        !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/u.test(id) ||
        visibility !== "list"
      ) return undefined;
      const label =
        typeof model.display_name === "string" && model.display_name.trim()
          ? model.display_name.trim().slice(0, 160)
          : id;
      const description =
        typeof model.description === "string" && model.description.trim()
          ? model.description.trim().slice(0, 500)
          : undefined;
      const supportedThinkingEfforts = modelThinkingEfforts(model);
      const rawDefault = [
        model.default_reasoning_level,
        model.default_thinking_effort,
        model.defaultThinkingEffort,
        model.default_reasoning_effort,
      ].find((effort) => typeof effort === "string");
      const defaultThinkingEffort =
        typeof rawDefault === "string" &&
        VALID_EFFORTS.has(rawDefault as ThinkingEffort)
          ? rawDefault as ThinkingEffort
          : undefined;
      const positiveInteger = (...values: unknown[]): number | undefined => {
        const value = values.find(
          (candidate) =>
            typeof candidate === "number" &&
            Number.isFinite(candidate) &&
            candidate > 0,
        );
        return value === undefined ? undefined : Math.trunc(value as number);
      };
      const contextWindowTokens = positiveInteger(
        model.context_window,
        model.context_window_tokens,
        model.max_context_window,
      );
      const explicitEffective = positiveInteger(
        model.effective_context_window,
        model.effective_context_window_tokens,
      );
      const effectivePercent =
        typeof model.effective_context_window_percent === "number" &&
          Number.isFinite(model.effective_context_window_percent)
          ? model.effective_context_window_percent
          : undefined;
      const effectiveContextWindowTokens =
        explicitEffective ??
        (contextWindowTokens && effectivePercent && effectivePercent > 0
          ? Math.trunc(
              contextWindowTokens * Math.min(100, effectivePercent) / 100,
            )
          : undefined);
      const providerAutoCompactAtTokens =
        positiveInteger(
          model.auto_compact_token_limit,
          model.provider_auto_compact_at_tokens,
        ) ??
        (contextWindowTokens
          ? Math.trunc(contextWindowTokens * 0.9)
          : undefined);
      return {
        priority:
          typeof model.priority === "number" && Number.isFinite(model.priority)
            ? model.priority
            : Number.MAX_SAFE_INTEGER,
        index,
        option: {
          id,
          label,
          ...(description ? { description } : {}),
          supportedThinkingEfforts,
          ...(defaultThinkingEffort ? { defaultThinkingEffort } : {}),
          ...(contextWindowTokens ? { contextWindowTokens } : {}),
          ...(effectiveContextWindowTokens
            ? { effectiveContextWindowTokens }
            : {}),
          ...(providerAutoCompactAtTokens
            ? { providerAutoCompactAtTokens }
            : {}),
        } satisfies CliModelOption,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    .sort(
      (left, right) =>
        left.priority - right.priority ||
        left.option.label.localeCompare(right.option.label) ||
        left.index - right.index,
    )
    .map((entry) => entry.option)
    .filter((option) => {
      if (seen.has(option.id)) return false;
      seen.add(option.id);
      return true;
    })
    .slice(0, MAX_SELECTABLE_MODELS);
}

export async function listCodexModels(): Promise<CliModelOption[]> {
  try {
    const { stdout } = await execFileAsync("codex", ["debug", "models"], {
      timeout: 15_000,
      maxBuffer: 8_000_000,
    });
    const models = parseCodexModelCatalog(String(stdout));
    if (models.length === 0) {
      throw new Error("Codex returned no selectable models");
    }
    return models;
  } catch (error) {
    throw new Error(`Could not load Codex models: ${commandFailureDetail(error)}`);
  }
}

export { probeCodexCli };

export function oryntStateRoot(): string {
  const base = process.env.ORYNT_STATE_HOME?.trim() ||
    (process.platform === "win32"
      ? process.env.LOCALAPPDATA?.trim() ||
        path.join(os.homedir(), "AppData", "Local")
      : process.platform === "darwin"
        ? path.join(os.homedir(), "Library", "Application Support")
        : process.env.XDG_STATE_HOME?.trim() ||
          path.join(os.homedir(), ".local", "state"));
  return path.join(base, "orynt");
}

export type CliContextRecoveryPreparation = {
  invocationId?: string;
  checkpointId?: string;
  contextPackId?: string;
  contextPackIds?: string[];
  renderedContextHash?: string;
  artifact?: ContextVmInvocationArtifactV1;
  inferenceAttemptId?: string;
  seed?: string;
};

export type CliContextInvocationInput = {
  sessionId: string;
  invocationId: string;
  role: ContextVmInvocationRoleV1;
  providerId:
    | "codex-cli"
    | "codex-app-server"
    | "openai-responses"
    | "scripted";
  modelId: string;
  thinkingEffort: ThinkingEffort;
  taskId?: string;
  parentInvocationId?: string;
  prompt: string;
  activeGoal?: string;
  conversationSummary?: string;
  recentTurns?: Array<{
    role: "user" | "agent";
    content: string;
  }>;
  acceptanceCriteria: string[];
  stateRoot?: string;
  signal?: AbortSignal;
};

export interface CliContextVmInvocationPort {
  prepare(
    input: Omit<CliContextInvocationInput, "stateRoot">,
  ): Promise<CliContextRecoveryPreparation>;
  recordInferenceStarted(input: {
    preparation: CliContextRecoveryPreparation;
    transport: CliContextInvocationInput["providerId"];
    modelId: string;
    thinkingEffort: ThinkingEffort;
    attempt?: number;
  }): Promise<string>;
  recordProviderResult(input: {
    preparation: CliContextRecoveryPreparation;
    attemptId: string;
    status: "completed" | "failed";
    result?: unknown;
    usage?: unknown;
    failureReason?: string;
  }): Promise<void>;
  checkpoint(sessionId: string, reason?: "explicit" | "session_checkpoint" | "task_closed"): Promise<string>;
  recordMemoryExemption(input: {
    sessionId: string;
    operation: string;
    reason: "asset_generation" | "provider_probe" | "non_agent_generation";
    transport: string;
    modelId: string;
    input: string;
  }): Promise<void>;
  close(): Promise<void>;
}

async function resolveCliContextInvocation(
  input: CliContextInvocationInput,
  intelligence: LocalIntelligenceRuntime,
  decisionDriver: ContextVmDecisionDriverV2 = createContextVmReadinessDriver(),
): Promise<CliContextRecoveryPreparation> {
  if (input.signal?.aborted) {
    throw Object.assign(new Error("Context preparation cancelled"), {
      name: "AbortError",
    });
  }
  const resolved = await intelligence.resolveInvocationContextV2({
    invocation: {
      schemaVersion: 2,
      invocationId: input.invocationId,
      namespace: `cli-session:${input.sessionId}`,
      sessionId: contextVmSessionId(input.sessionId),
      ...(input.taskId ? { taskId: contextVmTaskId(input.taskId) } : {}),
      role: input.role,
      transport: input.providerId,
      modelId: input.modelId,
      thinkingEffort: input.thinkingEffort,
      ...(input.parentInvocationId
        ? { parentInvocationId: input.parentInvocationId }
        : {}),
      userRequest: input.prompt,
      ...(input.activeGoal ? { currentGoal: input.activeGoal } : {}),
      ...(input.conversationSummary || input.recentTurns?.length
        ? {
            conversationContext: {
              ...(input.conversationSummary
                ? { summary: input.conversationSummary.slice(0, 4_000) }
                : {}),
              recentTurns: (input.recentTurns ?? []).slice(-6).map((turn) => ({
                role: turn.role === "agent"
                  ? "assistant" as const
                  : "user" as const,
                content: turn.content.slice(0, 2_000),
              })),
            },
          }
        : {}),
      constraints: input.acceptanceCriteria.slice(0, 20).map((text, index) => ({
        id: `acceptance-${index + 1}`,
        text,
        required: true,
        source: "user" as const,
      })),
      requestedEntities: [],
      riskLevel: "low",
      hardBudgetTokens: 2_000,
      retrievalMode: input.role === "prompt_understanding"
        ? "authority_only"
        : "hybrid",
      readiness: {
        maxOutputTokens: 1_024,
        timeoutMs: 30_000,
        maxFaultRounds: 3,
      },
    },
    decide: decisionDriver,
    ...(input.signal ? { signal: input.signal } : {}),
  });
  if (resolved.status !== "ready") {
    throw new Error(
      `ContextVM ${resolved.status} invocation ${input.invocationId}: ${resolved.reason}`,
    );
  }
  return {
    invocationId: resolved.artifact.invocationId,
    checkpointId: resolved.artifact.checkpointId
      ? String(resolved.artifact.checkpointId)
      : undefined,
    contextPackId: String(resolved.artifact.rootContextPackId),
    contextPackIds: resolved.artifact.orderedContextPackIds.map(String),
    renderedContextHash: resolved.artifact.renderedContextHash,
    artifact: resolved.artifact,
    ...(resolved.renderedContext.trim()
      ? { seed: resolved.renderedContext }
      : {}),
  };
}

export function createCliContextVmInvocationPort(
  stateRoot: string,
): CliContextVmInvocationPort {
  const intelligence = new LocalIntelligenceRuntime(stateRoot);
  const recoveredSessions = new Set<string>();
  const sessionIds = new Set<string>();
  return {
    prepare: async (input) => {
      if (!recoveredSessions.has(input.sessionId)) {
        await intelligence.recoverContextVmSession(
          input.sessionId,
          input.signal,
        );
        const providerRecovery = await intelligence.contextVm
          .recoverProviderAttempts(contextVmSessionId(input.sessionId));
        if (providerRecovery.inDoubtInvocationIds.length > 0) {
          throw new Error(
            `ContextVM recovery blocked by in-doubt invocation(s): ${
              providerRecovery.inDoubtInvocationIds.join(", ")
            }`,
          );
        }
        recoveredSessions.add(input.sessionId);
      }
      sessionIds.add(input.sessionId);
      return resolveCliContextInvocation(
        input,
        intelligence,
        createContextVmReadinessDriver(),
      );
    },
    recordInferenceStarted: async (input) => {
      const artifact = input.preparation.artifact;
      if (!artifact) {
        throw new Error("ContextVM inference cannot start without an invocation artifact.");
      }
      const attempt = input.attempt ?? 1;
      const attemptId = `${artifact.invocationId}:inference:${attempt}`;
      const base = {
        attemptId,
        invocationId: artifact.invocationId,
        phase: "inference" as const,
        attempt,
        transport: input.transport,
        modelId: input.modelId,
        thinkingEffort: input.thinkingEffort,
        contextPackIds: artifact.orderedContextPackIds,
        contextHash: artifact.renderedContextHash,
      };
      await intelligence.contextVm.recordProviderAttempt({
        ...base,
        status: "prepared",
      });
      await intelligence.checkpointContextVmSession(
        String(artifact.sessionId),
        "session_checkpoint",
      );
      await intelligence.contextVm.recordProviderAttempt({
        ...base,
        status: "dispatched",
      });
      return attemptId;
    },
    recordProviderResult: async (input) => {
      const artifact = input.preparation.artifact;
      if (!artifact) {
        throw new Error("ContextVM provider result has no invocation artifact.");
      }
      const attempt = Number(input.attemptId.split(":").at(-1) ?? 1);
      await intelligence.contextVm.recordProviderAttempt({
        attemptId: input.attemptId,
        invocationId: artifact.invocationId,
        phase: "inference",
        attempt,
        transport: artifact.attempts[0]?.transport ?? "scripted",
        modelId: artifact.attempts[0]?.modelId ?? "unknown",
        thinkingEffort: artifact.attempts[0]?.thinkingEffort ?? "medium",
        status: input.status,
        contextPackIds: artifact.orderedContextPackIds,
        contextHash: artifact.renderedContextHash,
        ...(input.result !== undefined
          ? {
              resultHash: createHash("sha256")
                .update(JSON.stringify(input.result))
                .digest("hex"),
            }
          : {}),
        ...(input.usage !== undefined ? { usage: input.usage } : {}),
        ...(input.failureReason
          ? { failureReason: input.failureReason }
          : {}),
      });
      await intelligence.checkpointContextVmSession(
        String(artifact.sessionId),
        "session_checkpoint",
      );
    },
    checkpoint: async (sessionId, reason = "session_checkpoint") => {
      const checkpoint = await intelligence.checkpointContextVmSession(
        sessionId,
        reason,
      );
      return String(checkpoint.id);
    },
    recordMemoryExemption: async (input) => {
      await intelligence.contextVm.recordMemoryExemption({
        exemptionId: `exemption-${randomUUID()}`,
        sessionId: contextVmSessionId(input.sessionId),
        operation: input.operation,
        reason: input.reason,
        transport: input.transport,
        modelId: input.modelId,
        inputHash: createHash("sha256").update(input.input).digest("hex"),
      });
    },
    close: async () => {
      for (const sessionId of sessionIds) {
        await intelligence.checkpointContextVmSession(
          sessionId,
          "session_checkpoint",
        ).catch(() => undefined);
      }
      intelligence.contextVm.close();
    },
  };
}

export async function prepareCliContextInvocation(
  input: CliContextInvocationInput,
): Promise<CliContextRecoveryPreparation> {
  const temporaryRoot =
    input.stateRoot === undefined && input.sessionId.startsWith("ephemeral-")
      ? await mkdtemp(path.join(os.tmpdir(), "orynt-context-invocation-"))
      : undefined;
  const intelligence = new LocalIntelligenceRuntime(
    input.stateRoot ?? temporaryRoot ?? oryntStateRoot(),
  );
  try {
    if (!input.sessionId.startsWith("ephemeral-") && input.providerId !== "scripted") {
      throw new Error(
        "Production ContextVM invocation requires the shared lifecycle port.",
      );
    }
    return await resolveCliContextInvocation(
      input,
      intelligence,
      async ({ pack }) =>
        pack.manifest.status === "ready"
          ? { schemaVersion: 2, status: "READY" }
          : {
              schemaVersion: 2,
              status: "NEED_MEMORY",
              missing: [{
                kind: "context_gap",
                entities: ["context_gap"],
                relation: null,
                timeRange: null,
                requiredSourceTypes: ["artifact"],
                minimumEvidenceQuality: "verified",
              }],
            },
    );
  } finally {
    intelligence.contextVm.close();
    if (temporaryRoot) {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  }
}

export async function prepareCliContextRecovery(input: {
  sessionId: string;
  prompt: string;
  activeGoal?: string;
  conversationSummary?: string;
  recentTurns?: CliContextInvocationInput["recentTurns"];
  acceptanceCriteria: string[];
  providerId?:
    | "codex-cli"
    | "codex-app-server"
    | "openai-responses"
    | "scripted";
  modelId?: string;
  thinkingEffort?: ThinkingEffort;
  taskId?: string;
  parentInvocationId?: string;
  port?: CliContextVmInvocationPort;
  signal?: AbortSignal;
}): Promise<CliContextRecoveryPreparation> {
  const {
    port,
    providerId = "scripted",
    modelId = "context-recovery",
    thinkingEffort = "medium",
    ...invocation
  } = input;
  const request = {
    ...invocation,
    invocationId: `recovery-${randomUUID()}`,
    role: "recovery",
    providerId,
    modelId,
    thinkingEffort,
  } as const;
  return port ? port.prepare(request) : prepareCliContextInvocation(request);
}

export type CliRepositoryTaskDependencies = {
  stateRoot?: string;
  repositoryAgent?: typeof runRepositoryAgent;
  contextVmDecisionDriver?: ContextVmDecisionDriverV2;
};

export async function runCliRepositoryTask(
  request: CliRunRequest,
  dependencies: CliRepositoryTaskDependencies = {},
): Promise<CliRunResult> {
  const root = dependencies.stateRoot ?? oryntStateRoot();
  const taskSuffix = randomUUID().replaceAll("-", "").slice(0, 12);
  const defaultBudget = createDefaultRunBudget();
  const capabilitySettings =
    request.capabilitySettings ?? createDefaultCapabilityRuntimeSettings();
  const intelligence = new LocalIntelligenceRuntime(root);
  await intelligence.initialize();
  try {
  const repositoryScope = await captureRepositoryEvidenceScope(
    request.repositoryPath,
  );
  const workspaceId = `repository-${repositoryScope.localRepositoryId}`;
  const memoryNamespace = {
    capabilityId: "coding-apprentice",
    workspaceId,
    repositoryPath: path.resolve(request.repositoryPath),
  };
  const repositorySessionId = contextVmSessionId(
    request.sessionId ?? `cli-${taskSuffix}`,
  );
  const repositoryTaskId = contextVmTaskId(request.taskId ?? `cli-${taskSuffix}`);
  const contextInvocation = await intelligence.resolveInvocationContextV2({
    invocation: {
      schemaVersion: 2,
      invocationId: `implementer-${taskSuffix}`,
      namespace: [
        memoryNamespace.capabilityId,
        memoryNamespace.workspaceId,
        memoryNamespace.repositoryPath ?? "",
        "",
      ].join("|"),
      sessionId: repositorySessionId,
      taskId: repositoryTaskId,
      role: "implementer",
      transport: "codex-cli",
      modelId: request.orchestration?.profile.roles.implementer.modelId ??
        request.modelId ??
        DEFAULT_CLI_MODEL_ID,
      thinkingEffort: request.thinkingEffort,
      userRequest: request.instruction,
      ...(request.activeGoal ? { currentGoal: request.activeGoal } : {}),
      constraints: request.acceptanceCriteria.map((text, index) => ({
        id: `acceptance-${index + 1}`,
        text,
        required: true,
        source: "user" as const,
      })),
      requestedEntities: [],
      riskLevel: "high",
      hardBudgetTokens: Math.max(
        256,
        Math.min(4_000, capabilitySettings.memoryTokenBudget),
      ),
      readiness: {
        maxOutputTokens: 1_024,
        timeoutMs: 30_000,
        maxFaultRounds: 3,
      },
    },
    loadRevisionBoundEvidence: async () => {
      const evidence = await intelligence.buildRevisionBoundEvidence({
        namespace: memoryNamespace,
        query: request.instruction,
        workspaceId,
        repository: repositoryScope,
        taskId: repositoryTaskId,
        itemBudget: Math.max(1, Math.min(20, capabilitySettings.memoryTopK)),
        tokenBudget: Math.max(
          256,
          Math.min(4_000, capabilitySettings.memoryTokenBudget),
        ),
      });
      return evidence.rendered.trim()
        ? [{
            sourceId: `repository:${repositoryScope.revisionKey ?? repositoryScope.localRepositoryId}`,
            text: evidence.rendered,
            evidenceQuality: "verified" as const,
          }]
        : [];
    },
    decide: dependencies.contextVmDecisionDriver ??
      createContextVmReadinessDriver(),
  });
  if (contextInvocation.status !== "ready") {
    throw new Error(
      `ContextVM refused repository execution: ${contextInvocation.reason}`,
    );
  }
  const renderedContext = contextInvocation.renderedContext;
  const implementerModelId =
    request.orchestration?.profile.roles.implementer.modelId ??
    request.modelId;
  const initialContextPack = {
    schemaVersion: 1 as const,
    invocationId: contextInvocation.artifact.invocationId,
    id: String(contextInvocation.artifact.rootContextPackId),
    orderedContextPackIds:
      contextInvocation.artifact.orderedContextPackIds.map(String),
    rendered: renderedContext,
    renderedHash: contextInvocation.artifact.renderedContextHash,
    checkpointId: String(contextInvocation.artifact.checkpointId),
    providerTransport: "codex-cli",
    modelId: implementerModelId,
    attempts: contextInvocation.artifact.attempts.map((attempt) => ({
      ...attempt,
      contextPackIds: attempt.contextPackIds.map(String),
    })),
  };
  const inferenceAttempts = new Map<string, {
    invocationId: string;
    contextPackIds: typeof contextInvocation.artifact.orderedContextPackIds;
    contextHash: string;
  }>();
  let inferenceAttemptSequence = 0;
  const implementerBudget = request.orchestration?.profile.roles.implementer;
  const skillContextResult = request.skillContext
    ? { context: request.skillContext }
    : request.selectedSkillIds?.length
    ? (await new LocalSkillCliManager(root).snapshotContext({
        repositoryPath: request.repositoryPath,
        runId: `cli-${taskSuffix}`,
        skillIds: request.selectedSkillIds,
      })) as {
        context?: Parameters<typeof runRepositoryAgent>[0]["skillContext"];
      }
    : undefined;
  if (
    (request.selectedSkillIds?.length || request.skillContext) &&
    !skillContextResult?.context
  ) {
    throw new Error("Skill context snapshot was incomplete");
  }
  const improvementEvaluation = await prepareImprovementEvaluation({
    stateRoot: root,
    instruction: request.instruction,
    maximumModelTokens: defaultBudget.maxModelTokens,
    settings: capabilitySettings,
  });
  const effectiveInstruction =
    improvementEvaluation?.instruction ?? request.instruction;
  const startedAt = performance.now();
  const result = await (dependencies.repositoryAgent ?? runRepositoryAgent)({
    goal: effectiveInstruction,
    ...(request.images?.length
      ? { images: request.images.map((image) => ({ ...image })) }
      : {}),
    activeGoal: request.activeGoal,
    acceptanceCriteria: request.acceptanceCriteria,
    taskPlan: request.taskPlan,
    authorization: {
      source: request.authorization.source,
      reason: request.authorization.reasons.join(" "),
      expectedPaths: request.authorization.expectedPaths,
      planId: request.authorization.planId,
      planRevision: request.authorization.planRevision,
      planDigest: request.authorization.planDigest,
      allowDestructiveChanges: request.authorization.allowDestructiveChanges,
      allowChangedFileLimitExceeded:
        request.authorization.allowChangedFileLimitExceeded,
    },
    taskId: `cli-${taskSuffix}`,
    workspaceId,
    repositoryPath: request.repositoryPath,
    sandboxRoot: path.join(root, "sandboxes"),
    artifactRoot: path.join(root, "artifacts"),
    memoryRoot: intelligence.layout.memoryRoot,
    memoryNamespace,
    contextPack: initialContextPack,
    contextVmLifecycle: {
      beforeInference: async ({ contextPack }) => {
        inferenceAttemptSequence += 1;
        const attemptId =
          `${contextPack.invocationId}:inference:${inferenceAttemptSequence}`;
        const contextPackIds =
          contextPack.orderedContextPackIds.map(contextVmContextPackId);
        const base = {
          attemptId,
          invocationId: contextPack.invocationId,
          phase: "inference" as const,
          attempt: inferenceAttemptSequence,
          transport: "codex-cli" as const,
          modelId: contextPack.modelId,
          thinkingEffort: request.thinkingEffort,
          contextPackIds,
          contextHash: contextPack.renderedHash,
        };
        await intelligence.contextVm.recordProviderAttempt({
          ...base,
          status: "prepared",
        });
        await intelligence.contextVm.recordProviderAttempt({
          ...base,
          status: "dispatched",
        });
        inferenceAttempts.set(attemptId, {
          invocationId: contextPack.invocationId,
          contextPackIds,
          contextHash: contextPack.renderedHash,
        });
        return attemptId;
      },
      afterInference: async (input) => {
        const attempt = inferenceAttempts.get(input.attemptId);
        if (!attempt) {
          throw new Error(`Unknown ContextVM inference attempt: ${input.attemptId}`);
        }
        await intelligence.contextVm.recordProviderAttempt({
          attemptId: input.attemptId,
          invocationId: attempt.invocationId,
          phase: "inference",
          attempt: Number(input.attemptId.split(":").at(-1)),
          transport: "codex-cli",
          modelId: implementerModelId,
          thinkingEffort: request.thinkingEffort,
          status: input.status,
          contextPackIds: attempt.contextPackIds,
          contextHash: attempt.contextHash,
          ...(input.result !== undefined
            ? {
                resultHash: createHash("sha256")
                  .update(JSON.stringify(input.result))
                  .digest("hex"),
              }
            : {}),
          ...(input.failureReason
            ? { failureReason: input.failureReason }
            : {}),
        });
      },
      prepareRecovery: async (input) => {
        const recovery = await intelligence.resolveInvocationContextV2({
          invocation: {
            schemaVersion: 2,
            invocationId: `recovery-${randomUUID()}`,
            parentInvocationId: input.parentInvocationId,
            namespace: [
              memoryNamespace.capabilityId,
              memoryNamespace.workspaceId,
              memoryNamespace.repositoryPath ?? "",
              "",
            ].join("|"),
            sessionId: repositorySessionId,
            taskId: contextVmTaskId(input.taskId),
            role: "recovery",
            transport: "codex-cli",
            modelId: implementerModelId,
            thinkingEffort: request.thinkingEffort,
            userRequest: input.instruction,
            currentGoal: request.activeGoal ?? request.instruction,
            currentAction: input.verifierSummary,
            constraints: request.acceptanceCriteria.map((text, index) => ({
              id: `acceptance-${index + 1}`,
              text,
              required: true,
              source: "user" as const,
            })),
            requestedEntities: [],
            riskLevel: "high",
            hardBudgetTokens: Math.max(
              256,
              Math.min(4_000, capabilitySettings.memoryTokenBudget),
            ),
            retrievalMode: "hybrid",
            readiness: {
              maxOutputTokens: 1_024,
              timeoutMs: 30_000,
              maxFaultRounds: 3,
            },
          },
          decide: dependencies.contextVmDecisionDriver ??
            createContextVmReadinessDriver(),
          ...(request.signal ? { signal: request.signal } : {}),
        });
        if (recovery.status !== "ready") {
          throw new Error(
            `ContextVM refused recovery inference: ${recovery.reason}`,
          );
        }
        return {
          schemaVersion: 1,
          invocationId: recovery.artifact.invocationId,
          id: String(recovery.artifact.rootContextPackId),
          orderedContextPackIds:
            recovery.artifact.orderedContextPackIds.map(String),
          rendered: recovery.renderedContext,
          renderedHash: recovery.artifact.renderedContextHash,
          checkpointId: String(recovery.artifact.checkpointId),
          providerTransport: "codex-cli",
          modelId: implementerModelId,
          attempts: recovery.artifact.attempts.map((attempt) => ({
            ...attempt,
            contextPackIds: attempt.contextPackIds.map(String),
          })),
        };
      },
    },
    cognitiveStateRoot: intelligence.layout.cognitiveStateRoot,
    ...(skillContextResult?.context
      ? { skillContext: skillContextResult.context }
      : {}),
    budget: {
      ...defaultBudget,
      ...(implementerBudget
        ? {
            maxWallTimeMs: Math.min(
              defaultBudget.maxWallTimeMs,
              implementerBudget.maxWallTimeMs,
            ),
            maxModelTokens: Math.min(
              defaultBudget.maxModelTokens,
              implementerBudget.maxTokens,
            ),
          }
        : {}),
    },
    modelConnection: {
      providerId: "codex-cli",
      providerLabel: "Codex CLI",
      modelId: request.modelId,
      modelLabel: request.modelId,
      authMethod: "codexCliSession",
    },
    thinkingEffort: request.thinkingEffort,
    ...(request.orchestration
      ? { orchestration: request.orchestration }
      : {}),
    ...(request.postVerificationReview
      ? { postVerificationReview: request.postVerificationReview }
      : {}),
    onRunEvent: request.onEvent,
    signal: request.signal,
  }, { memoryStore: intelligence.memoryStore });
  await finishImprovementRun({
    stateRoot: root,
    runId: result.runId,
    taskId: `cli-${taskSuffix}`,
    taskTemplateId: improvementTaskTemplateId(request.instruction),
    repositoryDomain: path.basename(request.repositoryPath) || "repository",
    modelTier:
      request.orchestration?.profile.roles.implementer.modelTier ?? "medium",
    verifierPassed: result.status === "pass",
    latencyMs: Math.max(0, performance.now() - startedAt),
    artifactRefs: [`orynt-artifact://runs/${result.runId}/manifest.json`],
    settings: capabilitySettings,
    ...(improvementEvaluation ? { evaluation: improvementEvaluation } : {}),
  });
  await intelligence.checkpointContextVmSession(
    String(repositorySessionId),
    "task_closed",
  );
  const cliSnapshot = await readRunSnapshot(result.artifactManifestPath);
  return { ...result, cliSnapshot };
  } finally {
    intelligence.contextVm.close();
  }
}

export async function diagnoseModelTierLive(
  tier: ModelTier,
  binding: ModelTierBinding,
): Promise<void> {
  const temporaryRoot = await mkdtemp(
    path.join(os.tmpdir(), "orynt-doctor-live-"),
  );
  try {
    const sentinel = `ORYNT_${tier.toUpperCase()}_READY`;
    const { stdout, stderr } = await execFileAsync(
      "codex",
      [
        "exec",
        "--ephemeral",
        "--ignore-user-config",
        "--ignore-rules",
        "--sandbox",
        "read-only",
        "-m",
        binding.modelId,
        "-c",
        `model_reasoning_effort=${JSON.stringify(binding.thinkingEffort)}`,
        "-C",
        temporaryRoot,
        "--skip-git-repo-check",
        `Reply with exactly ${sentinel} and do not use tools.`,
      ],
      {
        timeout: 120_000,
        maxBuffer: 2 * 1024 * 1024,
      },
    );
    if (!`${stdout} ${stderr}`.includes(sentinel)) {
      throw new Error(`${tier} tier did not return the expected readiness marker`);
    }
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

export async function diagnoseModelTiersLive(): Promise<string[]> {
  const configuration = createDefaultModelTierConfiguration();
  const lines = ["Orynt live model tiers"];
  for (const tier of ["light", "medium", "heavy"] as const) {
    const binding = configuration.tiers[tier];
    await diagnoseModelTierLive(tier, binding);
    lines.push(
      `  ${tier}: ready · ${binding.modelId} · ${binding.thinkingEffort}`,
    );
  }
  return lines;
}

export function cliHelp(): string {
  return [
    `Orynt ${ORYNT_VERSION} — supervised repository agent`,
    "",
    "Usage: orynt [options] [prompt]",
    "       orynt run --approve-once [--jsonl] [options] <goal>",
    "       orynt doctor [--verbose] [--json] [--live --confirm-live] [options]",
    "       orynt usage [--verbose] [--json] [--plain]",
    "       orynt setup [--check [--json]]",
    "       orynt browser <doctor|start|attach|tabs|status|close>",
    "       orynt improve <status|list|show|history|hygiene|approve|reject|rollback>",
    "       orynt intelligence <init|status|verify|inspect|search|checkpoint|recover|consolidate|backups|cleanup>",
    "       orynt lsp <list|doctor|restart|add|remove>",
    "       orynt sessions <list|show|pin|unpin|trash|restore|cleanup>",
    "       orynt update [--check|--rollback|--enable-startup-check|--disable-startup-check] [--yes]",
    "",
    "Options:",
    "  -C, --repo <path>      Repository workspace (default: current directory)",
    "      --minimum-tier <t> light | medium | heavy for this run",
    "      --profile <name>   deprecated; configure model tiers instead",
    "      --role-model <r=m> legacy tier-migration input",
    "      --role-effort <r=e> legacy tier-migration input",
    "      --plain            Disable ANSI color and inline animation",
    "      --no-color         Disable ANSI color; keep inline animation",
    "      --theme <id>       quiet-studio | monochrome for this launch",
    "      --screen <mode>    auto | fullscreen | inline",
    "      --resume <id>      Resume latest or a named typed session",
    "      --approve-once     Authorize exactly one bounded headless run",
    "      --jsonl            Emit headless run events as JSON Lines",
    "      --activity-details <level>",
    "                         off | important | full (human-readable output)",
    "      --live             Run explicit live model-tier doctor probes",
    "      --confirm-live     Confirm provider quota use for --live",
    "      --verbose          Expand doctor evidence or provider usage",
    "      --json             Emit one structured doctor, usage, or setup report",
    "  -h, --help             Show help",
    "  -v, --version          Show version",
    "",
    "Interactive text starts an agent conversation. Headless execution requires the explicit one-run --approve-once grant.",
  ].join("\n");
}
