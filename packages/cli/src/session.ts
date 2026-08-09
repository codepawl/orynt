import { createHash, randomUUID } from "node:crypto";
import path from "node:path";

import type { RepositoryAgentRunOutput } from "@codepawl/coding-apprentice";
import type {
  AgentImageInput,
  ProviderUsageDetail,
  ProviderUsageSnapshotV1,
} from "@codepawl/model-runtime";
import {
  createDefaultCapabilityRuntimeSettings,
  createLegacySingleModelProfile,
  migrateOrchestrationProfileToModelTiers,
  modelTierConfigurationToOrchestrationProfile,
  createOrchestrationPreset,
  redactSensitivePayload,
  resolveOrchestrationProfile,
  validateOrchestrationRecoveryTask,
  validateOrchestrationPlan,
  type OrchestrationPreset,
  type OrchestrationProfile,
  type OrchestrationProviderId,
  type OrchestrationRole,
  type OrchestrationChildTask,
  type OrchestrationPlan,
  type ModelInvocationRecord,
  type CapabilityRuntimeSettingsV1,
  type ContextTokenBreakdownV1,
  type ModelTier,
  type ModelTierProviderId,
  type PromptUnderstandingAssumptionV1,
  type PromptUnderstandingBasisV1,
  type PromptUnderstandingQuestionV1,
  type PromptUnderstandingV1,
  type RepositoryTaskPlanV1,
  type ResolvedOrchestrationProfile,
  type RunEventType,
  type SkillContextSnapshot,
} from "@codepawl/shared";
import { ContextController } from "@codepawl/agent-runtime";

import {
  evaluateAgentAction,
  resolveCliConversationRepository,
  type AgentActionAuthorization,
  type CliAgentTurnRequest,
  type CliAgentTurnResult,
  type CliAgentActivityEvent,
  type CliConversationTurn,
  type CliReadOnlyRoleRequest,
  type CliReadOnlyRoleResult,
  type CliSkillRoutingCandidate,
  type CliSkillRoutingResult,
  type ProposedRepositoryAction,
} from "./agent.js";
import type {
  CliAppearancePreferences,
  CliPromptUnderstandingDraft,
  CliPersistedConversationTurn,
  CliRunSnapshot,
  CliSessionCatalogEntry,
  CliSessionListOptions,
  CliSessionPage,
  CliSessionSnapshot,
  CliTranscriptPage,
  CliWorkingConfig,
} from "./state.js";
import {
  normalizeCliWorkingConfig,
  readRepositoryDiffArtifact,
  sanitizeCliPromptUnderstandingDraft,
} from "./state.js";
import {
  agentMessagePrefix,
  CLEAR_PENDING_INPUT,
  COMPOSER_PROMPT,
  displayWidth,
  EDIT_PENDING_INPUT,
  INTERRUPTED_INPUT,
  NAVIGATE_BACK_INPUT,
  truncate,
  type InlineActivityHandle,
  type InlineMessageStreamHandle,
  type ClarificationRequest,
  type ClarificationResult,
  type ComposerChoice,
  type ComposerDraftSnapshot,
  type ComposerInitialValue,
  type ComposerStatusContext,
  type LiveComposerContext,
  type LiveComposerHandle,
  type LiveComposerSubmission,
  type LiveComposerSubmissionResult,
} from "./composer.js";
import {
  RunPresenter,
  parseInteractiveInput,
  renderInteractiveHelp,
  renderRepositoryDiff,
  renderUnknownCommand,
  renderRunCompletion,
  renderTreeRows,
  renderWelcome,
  terminalSafeMultilineText,
  terminalSafeText,
  type ActivityDetailLevel,
  type InteractiveCommand,
  type CliModelOption,
  type ThinkingEffort,
  type WelcomeState,
} from "./ui.js";
import type { CodexSetupResult } from "./codexSetup.js";
import {
  renderDoctorReport,
  type DoctorReportV1,
  type DoctorRequest,
} from "./doctor.js";
import {
  providerUsageSummary,
  renderProviderUsage,
} from "./usage.js";
import {
  DEFAULT_TERMINAL_THEME_ID,
  TERMINAL_THEMES,
  terminalThemeDefinition,
  type TerminalAppearanceResolution,
  type TerminalRole,
  type TerminalTheme,
  type TerminalThemeId,
  type TerminalScreenMode,
} from "./terminal-theme.js";
import {
  createTerminalDesignSystem,
  renderTerminalDetailRows,
  wrapTerminalParagraph,
  type TerminalDetailRow,
} from "./terminal-presentation.js";
import type { TerminalOutput } from "./terminal-presentation.js";
import { renderRichText } from "./rich-text.js";
import {
  renderSessionList,
  sessionComposerChoice,
} from "./sessions.js";
import {
  DEFAULT_CLI_SHORTCUTS,
  normalizeShortcutBinding,
  portableShortcutBindings,
  shortcutListLabel,
  shortcutPreferences,
  validateShortcutPreferences,
  type CliShortcutPreferences,
  type ComposerShortcutAction,
} from "./shortcuts.js";
import {
  DEFAULT_CLI_STATUSLINE,
  statuslinePreferences,
  type CliStatuslineField,
  type CliStatuslinePreferences,
} from "./statusline.js";
import {
  clipboardPreferences,
  DEFAULT_CLI_CLIPBOARD,
  type CliClipboardPreferences,
} from "./clipboard.js";
import {
  buildBoundRepositoryTaskPlan,
  verifyApprovedRepositoryTaskPlan,
} from "./task-plan.js";

export type CliRunEvent = {
  type: RunEventType;
  payload: unknown;
};

export type CliRunRequest = {
  /** Stable ContextVM authority scope for this CLI conversation. */
  sessionId?: string;
  /** Stable logical task identity for recovery and audit lineage. */
  taskId?: string;
  instruction: string;
  images?: AgentImageInput[];
  repositoryPath: string;
  modelId: string;
  thinkingEffort: ThinkingEffort;
  taskPlan: RepositoryTaskPlanV1;
  orchestration?: {
    profile: ResolvedOrchestrationProfile;
    plan?: OrchestrationPlan;
    priorInvocations: ModelInvocationRecord[];
  };
  postVerificationReview?: (context: {
    runId: string;
    repositoryPath: string;
    sandboxWorktreePath: string;
    status: CliRunResult["status"];
    summary: string;
    signal?: AbortSignal;
  }) => Promise<
    | {
        invocation: ModelInvocationRecord;
        summary: string;
        recoveryTask?: OrchestrationChildTask;
      }
    | undefined
  >;
  postVerificationReviewSkipReason?: string;
  activeGoal?: string;
  acceptanceCriteria: string[];
  selectedSkillIds?: string[];
  skillContext?: SkillContextSnapshot;
  capabilitySettings?: CapabilityRuntimeSettingsV1;
  authorization: AgentActionAuthorization & {
    source: "automatic_policy" | "operator" | "headless";
    expectedPaths: string[];
    allowDestructiveChanges: boolean;
    allowChangedFileLimitExceeded: boolean;
    planId: string;
    planRevision: number;
    planDigest: string;
  };
  onEvent: (event: CliRunEvent) => void;
  signal?: AbortSignal;
};

export type CliRunResult = RepositoryAgentRunOutput & { cliSnapshot?: CliRunSnapshot };

export type CodexProviderCode =
  | "CODEX_READY"
  | "CODEX_CLI_MISSING"
  | "CODEX_CLI_OUTDATED"
  | "CODEX_APP_SERVER_UNAVAILABLE"
  | "CODEX_AUTH_REQUIRED"
  | "CODEX_PROBE_FAILED";

export type ClaudeProviderCode =
  | "CLAUDE_READY"
  | "CLAUDE_AUTH_REQUIRED"
  | "CLAUDE_AUTH_INVALID"
  | "CLAUDE_CREDENTIAL_CONFLICT"
  | "CLAUDE_MODEL_ACCESS_DENIED"
  | "CLAUDE_RATE_LIMITED"
  | "CLAUDE_CLI_MISSING"
  | "CLAUDE_STREAM_PROTOCOL_UNAVAILABLE"
  | "CLAUDE_PROBE_FAILED";

export type OpencodeProviderCode =
  | "OPENCODE_READY"
  | "OPENCODE_AUTH_REQUIRED"
  | "OPENCODE_AUTH_INVALID"
  | "OPENCODE_PROBE_FAILED";

export type ProviderCode =
  | CodexProviderCode
  | ClaudeProviderCode
  | OpencodeProviderCode;

export type CodexNextAction =
  | "none"
  | "install"
  | "update"
  | "login"
  | "configure"
  | "diagnose";

/** Retained for callers that only handle the Codex provider. */
export type ProviderNextAction = CodexNextAction;

export type ProviderStatus = {
  ready: boolean;
  detail: string;
  provider?: "codex" | "anthropic" | "opencode";
  transport?: "app_server" | "http" | "stdio";
  version?: string;
  authenticated?: boolean;
  dynamicTools?: boolean;
  code?: ProviderCode;
  nextAction?: CodexNextAction;
  remediationCommand?: string;
};

export type InteractiveSessionState = WelcomeState & {
  providerDetail: string;
  activityDetails?: ActivityDetailLevel;
  sessionId?: string;
  mode?: CliSessionSnapshot["mode"];
  goal?: string;
  acceptanceCriteria?: string[];
  selectedSkillIds?: string[];
  conversationSummary?: string;
  recentTurns?: CliPersistedConversationTurn[];
  context?: CliSessionSnapshot["context"];
  providerThreadId?: string;
  transcript?: CliSessionSnapshot["transcript"];
  revision?: number;
  title?: string;
  pinned?: boolean;
  trashedAt?: string;
  promptUnderstandingDraft?: CliPromptUnderstandingDraft;
  turnCount?: number;
  lastRun?: CliRunSnapshot;
  lastTurnTelemetry?: CliSessionSnapshot["lastTurnTelemetry"];
  createdAt?: string;
  nextMinimumTier?: ModelTier;
};

export type InteractiveTerminal = {
  ask: (prompt: string) => Promise<string>;
  compose?: (
    prompt: string,
    initialValue?: ComposerInitialValue,
    statusContext?: ComposerStatusContext,
  ) => Promise<string>;
  beginLiveInput?: (
    context: LiveComposerContext,
    onSubmission: (
      submission: LiveComposerSubmission,
    ) => LiveComposerSubmissionResult | void,
    initialValue?: ComposerInitialValue,
  ) => LiveComposerHandle;
  takeSubmittedImages?: () => AgentImageInput[];
  takeSubmittedDraft?: () => ComposerDraftSnapshot | undefined;
  select?: (
    prompt: string,
    choices: ComposerChoice[],
    currentValue?: string,
  ) => Promise<string>;
  clarify?: (
    request: ClarificationRequest,
  ) => Promise<ClarificationResult>;
  remember?: (value: string) => void;
  beginActivity?: (
    label: string,
    options?: { immediate?: boolean },
  ) => InlineActivityHandle;
  beginMessageStream?: (label?: string) => InlineMessageStreamHandle;
  write: (value: TerminalOutput) => void;
  /** Writes one responsive centered line using the first variant that fits. */
  writeCentered?: (variants: readonly TerminalOutput[]) => void;
  notify?: (text: string, role?: "success" | "danger") => void;
  setProviderUsage?: (
    usage: ProviderUsageSnapshotV1 | undefined,
  ) => void;
  clear: () => void;
  color: boolean;
  themeId?: TerminalThemeId;
  richText?: boolean;
  isTTY?: boolean;
  width?: number;
  height?: number;
};

export type InteractiveSessionOptions = {
  initialPrompt?: string;
  state: InteractiveSessionState;
  terminal: InteractiveTerminal;
  run: (request: CliRunRequest) => Promise<CliRunResult>;
  turn?: (request: CliAgentTurnRequest) => Promise<CliAgentTurnResult>;
  readOnlyRole?: (
    request: CliReadOnlyRoleRequest,
  ) => Promise<CliReadOnlyRoleResult>;
  probeProvider: () => Promise<ProviderStatus>;
  setupProvider?: (initialStatus?: ProviderStatus) => Promise<CodexSetupResult>;
  listModels?: () => Promise<CliModelOption[]>;
  diagnose?: (request: DoctorRequest) => Promise<DoctorReportV1>;
  readProviderUsage?: (
    detail: ProviderUsageDetail,
  ) => Promise<ProviderUsageSnapshotV1>;
  codeIntelStatus?: () => {
    enabled: boolean;
    failure?: string;
    sessions: number;
    state?: string;
    serverFingerprint?: string;
  };
  listSkills?: (
    repositoryPath: string,
  ) => Promise<
    Array<{
      id: string;
      name: string;
      description: string;
      scope: string;
      trust: "trusted" | "community" | "untrusted";
      eligible: boolean;
      health: string;
    }>
  >;
  routeSkills?: (request: {
    prompt: string;
    activeGoal?: string;
    candidates: CliSkillRoutingCandidate[];
    modelId: string;
    /**
     * Provider of the routed binding. The skill router selects the Light tier,
     * whose provider need not match the coordinator's, so this must travel with
     * the model id: an omitted provider falls back to the Codex transport and
     * would dispatch a non-Codex model id there.
     */
    providerId?: ModelTierProviderId;
    thinkingEffort: ThinkingEffort;
    signal?: AbortSignal;
    timeoutMs?: number;
  }) => Promise<CliSkillRoutingResult>;
  snapshotSkills?: (request: {
    repositoryPath: string;
    runId: string;
    skillIds: string[];
  }) => Promise<SkillContextSnapshot>;
  persistSession?: (session: CliSessionSnapshot) => Promise<unknown>;
  loadSession?: (sessionId: string) => Promise<CliSessionSnapshot | undefined>;
  listSessions?: (options?: CliSessionListOptions) => Promise<CliSessionPage>;
  appendTranscript?: (
    sessionId: string,
    logicalTurnId: string,
    messages: Array<{ role: "user" | "agent"; content: string }>,
    recordedAt?: string,
  ) => Promise<CliSessionSnapshot["transcript"]>;
  readTranscript?: (
    sessionId: string,
    options?: { limit?: number; cursor?: number },
  ) => Promise<CliTranscriptPage>;
  copyText?: (value: string) => Promise<void>;
  compactContext?: (threadId: string) => Promise<void>;
  persistWorkingConfig?: (patch: CliWorkingConfig) => Promise<void>;
  persistActivityDetails?: (
    activityDetails: ActivityDetailLevel,
  ) => Promise<void>;
  skillRouting?: "auto_trusted" | "manual";
  persistSkillRouting?: (
    skillRouting: "auto_trusted" | "manual",
  ) => Promise<void>;
  capabilityRuntimeSettings?: CapabilityRuntimeSettingsV1;
  persistCapabilityRuntime?: (
    settings: CapabilityRuntimeSettingsV1,
  ) => Promise<void>;
  appearancePreferences?: CliAppearancePreferences;
  appearanceResolution?: TerminalAppearanceResolution;
  persistAppearance?: (
    patch: Partial<CliAppearancePreferences>,
  ) => Promise<void>;
  applyAppearance?: (
    appearance: CliAppearancePreferences,
  ) => TerminalAppearanceResolution;
  clipboardPreferences?: CliClipboardPreferences;
  persistClipboard?: (
    preferences: CliClipboardPreferences,
  ) => Promise<void>;
  applyClipboard?: (preferences: CliClipboardPreferences) => void;
  shortcutPreferences?: CliShortcutPreferences;
  persistShortcuts?: (shortcuts: CliShortcutPreferences) => Promise<void>;
  applyShortcuts?: (shortcuts: CliShortcutPreferences) => void;
  statuslinePreferences?: CliStatuslinePreferences;
  persistStatusline?: (
    statusline: CliStatuslinePreferences,
  ) => Promise<void>;
  applyStatusline?: (statusline: CliStatuslinePreferences) => void;
  activityDetailsOverride?: ActivityDetailLevel;
  startupBoundaryAcknowledged?: boolean;
  acknowledgeStartupBoundary?: () => Promise<void>;
  prepareRunSignal?: () => AbortSignal;
  cancelRunSignal?: (signal: AbortSignal) => void;
  releaseRunSignal?: (signal: AbortSignal) => void;
  now?: () => number;
};

const VALID_EFFORTS = new Set<ThinkingEffort>(["minimal", "none", "low", "medium", "high", "xhigh"]);
const EDITABLE_PRESETS = ["auto", "quality", "balanced", "economy"] as const;
const ORCHESTRATION_ROLES = [
  "coordinator",
  "implementer",
  "helper",
  "reviewer",
] as const;
const MAX_CONVERSATION_SUMMARY = 4_000;

const NOOP_ACTIVITY: InlineActivityHandle = {
  update: () => undefined,
  settle: () => undefined,
  fail: () => undefined,
  stop: () => undefined,
};

function beginTerminalActivity(
  terminal: InteractiveTerminal,
  label: string,
  options: { fallbackRow?: boolean; immediate?: boolean } = {},
): InlineActivityHandle {
  if (terminal.beginActivity) {
    return terminal.beginActivity(label, {
      immediate: options.immediate,
    });
  }
  if (options.fallbackRow) {
    terminal.write(
      createTerminalDesignSystem(
        terminal.color,
        terminal.themeId,
      ).renderProductText(`  ◇ ${terminalSafeText(label)}`),
    );
  }
  return NOOP_ACTIVITY;
}

function beginTerminalMessageStream(
  terminal: InteractiveTerminal,
  label = "Agent",
): InlineMessageStreamHandle {
  if (terminal.beginMessageStream) return terminal.beginMessageStream(label);
  let latest = "";
  let finished = false;
  return {
    update: (text) => {
      if (!finished) latest = text;
    },
    finish: (finalText) => {
      if (finished) return;
      finished = true;
      const output = finalText ?? latest;
      if (output) {
        terminal.write(
          createTerminalDesignSystem(
            terminal.color,
            terminal.themeId,
          ).renderProductText(terminalAgentMessage(terminal, label, output)),
        );
      }
    },
    abort: () => {
      finished = true;
    },
  };
}

function terminalAgentMessage(
  terminal: Pick<
    InteractiveTerminal,
    "color" | "themeId" | "richText" | "width"
  >,
  label: string,
  output: string,
): string {
  const theme = createTerminalDesignSystem(terminal.color, terminal.themeId).theme;
  return `\n${theme.paint("agent", agentMessagePrefix(label))} ${renderRichText(
    terminalSafeMultilineText(output),
    {
      enabled: terminal.richText ?? false,
      theme,
      width: Math.max(20, (terminal.width ?? 88) - agentMessagePrefix(label).length - 1),
      continuationIndent: " ".repeat(agentMessagePrefix(label).length + 1),
    },
  )}`;
}

function settingState(value: boolean): "on" | "off" {
  return value ? "on" : "off";
}

function activityDetailLabel(level: ActivityDetailLevel): string {
  return level === "off"
    ? "Off"
    : level === "full"
      ? "Full"
      : "Important";
}

function effectiveAppearanceText(
  name: "Color" | "Motion" | "Rich text",
  saved: boolean,
  effective: boolean,
  override?: string,
): string {
  const savedText = settingState(saved);
  if (!override || saved === effective) return `${name} ${savedText}`;
  return `${name} ${savedText} · effective ${settingState(effective)} (${override})`;
}

function terminalDetailText(
  title: string,
  rows: readonly TerminalDetailRow[],
  width: number | undefined,
): string {
  return [
    title,
    ...renderTerminalDetailRows(rows, { width }),
  ].join("\n");
}

function settingsText(
  state: InteractiveSessionState,
  appearance: CliAppearancePreferences,
  resolution: TerminalAppearanceResolution,
  capabilityRuntime: CapabilityRuntimeSettingsV1,
  clipboard: CliClipboardPreferences,
  shortcuts: CliShortcutPreferences,
  statusline: CliStatuslinePreferences,
  activityDetailsOverride?: ActivityDetailLevel,
  width: number | undefined = 88,
): string {
  const profile =
    state.orchestrationProfile ??
    createLegacySingleModelProfile(state.modelId, state.thinkingEffort);
  const savedTheme = terminalThemeDefinition(appearance.themeId);
  const effectiveTheme = terminalThemeDefinition(resolution.themeId);
  const themeText =
    resolution.themeOverride && appearance.themeId !== resolution.themeId
      ? `${savedTheme.label} · effective ${effectiveTheme.label} (${resolution.themeOverride})`
      : savedTheme.label;
  const screenText =
    appearance.screenMode === resolution.screenMode &&
      resolution.screenOverride === undefined
      ? appearance.screenMode
      : `${appearance.screenMode} · effective ${resolution.screenMode}${
        resolution.screenOverride ? ` (${resolution.screenOverride})` : ""
      }`;
  return terminalDetailText("Settings", [
    {
      label: "Agent",
      value: `${profile.preset} · ${profile.roles.coordinator.modelId}`,
    },
    {
      label: "Appearance",
      value: `Screen ${screenText} · Theme ${themeText} · ${effectiveAppearanceText("Color", appearance.color, resolution.color, resolution.colorOverride)} · ${effectiveAppearanceText("Motion", appearance.motion, resolution.motion, resolution.motionOverride)} · ${effectiveAppearanceText("Rich text", appearance.richText, resolution.richText, resolution.richTextOverride)}`,
    },
    {
      label: "Intelligence",
      value: `${capabilityRuntime.routingMode.replaceAll("_", " ")} routing · ${capabilityRuntime.autoImproveMode.replaceAll("_", " ")} improvement · ${capabilityRuntime.subagents.mode.replaceAll("_", " ")} subagents (${capabilityRuntime.subagents.maxConcurrency} max) · ${capabilityRuntime.maxNamespaces} namespaces · ${capabilityRuntime.maxToolsPerNamespace} tools each · memory ${capabilityRuntime.memoryTopK} results / ${capabilityRuntime.memoryTokenBudget} tokens`,
    },
    {
      label: "Clipboard",
      value: `copy on select ${settingState(clipboard.copyOnSelect)}`,
    },
    {
      label: "Shortcuts",
      value: `clear ${shortcutListLabel(shortcuts.clear)} · undo ${shortcutListLabel(shortcuts.undo)} · redo ${shortcutListLabel(shortcuts.redo)}`,
    },
    {
      label: "Statusline",
      value: `${statusline.enabled ? "On" : "Off"} · profile ${settingState(statusline.profile)} · role ${settingState(statusline.role)} · model ${settingState(statusline.model)} · effort ${settingState(statusline.effort)} · context ${settingState(statusline.context)} · shortcuts ${settingState(statusline.shortcuts)}`,
    },
    {
      label: "Activity",
      value: `${activityDetailLabel(state.activityDetails ?? "important")}${activityDetailsOverride ? ` · ${activityDetailLabel(activityDetailsOverride)} launch override` : ""} · audit artifacts always full`,
    },
  ], width);
}

function intelligenceSettingsText(
  settings: CapabilityRuntimeSettingsV1,
  width: number | undefined = 88,
): string {
  return terminalDetailText("Intelligence", [
    {
      label: "Routing",
      value: settings.routingMode.replaceAll("_", " "),
    },
    {
      label: "Improvement",
      value: settings.autoImproveMode.replaceAll("_", " "),
    },
    {
      label: "Subagents",
      value: `${settings.subagents.mode.replaceAll("_", " ")} · max ${settings.subagents.maxConcurrency} · depth ${settings.subagents.maxDepth}`,
    },
    {
      label: "Capabilities",
      value: `${settings.maxNamespaces} namespaces · ${settings.maxToolsPerNamespace} tools each`,
    },
    {
      label: "Memory",
      value: `${settings.memoryTopK} results · ${settings.memoryTokenBudget} tokens`,
    },
  ], width);
}

export type TurnDurationStatus = "success" | "failed" | "cancelled";

export function formatTurnDuration(elapsedMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1_000));
  if (totalSeconds === 0) return "<1s";
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes === 0) return `${seconds}s`;
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);
  if (hours === 0) return `${minutes}m ${seconds}s`;
  return `${hours}h ${minutes}m ${seconds}s`;
}

function turnDurationTextVariants(
  status: TurnDurationStatus,
  elapsedMs: number,
): string[] {
  const duration = formatTurnDuration(elapsedMs);
  const fullLabel =
    status === "success"
      ? `✦ Crafted in ${duration}`
      : status === "failed"
        ? `✕ Stopped after ${duration}`
        : `◇ Cancelled after ${duration}`;
  const compactLabel =
    status === "success"
      ? `✦ ${duration}`
      : status === "failed"
        ? `✕ ${duration}`
        : `◇ ${duration}`;
  const decorated = (label: string): string[] =>
    Array.from(
      { length: 7 },
      (_, index) => {
        const dashes = "─".repeat(7 - index);
        return `${dashes} ${label} ${dashes}`;
      },
    );
  return [
    ...decorated(fullLabel),
    ...decorated(compactLabel),
    compactLabel,
  ];
}

/** Returns ordered full-to-compact duration ornaments for responsive output. */
export function turnDurationLineVariants(
  status: TurnDurationStatus,
  elapsedMs: number,
  options: { color: boolean; themeId?: TerminalThemeId },
): TerminalOutput[] {
  const theme = createTerminalDesignSystem(
    options.color,
    options.themeId,
  ).theme;
  return turnDurationTextVariants(status, elapsedMs).map((variant) =>
    theme.paint("muted", variant) as TerminalOutput
  );
}

export function turnDurationLine(
  status: TurnDurationStatus,
  elapsedMs: number,
  options: { color: boolean; themeId?: TerminalThemeId; width?: number },
): string {
  const targetWidth = Math.max(1, (options.width ?? 84) - 1);
  const variants = turnDurationTextVariants(status, elapsedMs);
  const ornament = variants.find((variant) =>
    displayWidth(variant) <= targetWidth
  ) ?? truncate(variants.at(-1) ?? "", targetWidth);
  const leftPadding = " ".repeat(
    Math.max(0, Math.floor((targetWidth - displayWidth(ornament)) / 2)),
  );
  return createTerminalDesignSystem(
    options.color,
    options.themeId,
  ).theme.paint("muted", `${leftPadding}${ornament}`);
}

export class ActiveTurnTimer {
  private activeStartedAt: number;
  private activeElapsedMs = 0;
  private paused = false;
  private finished = false;

  constructor(
    private readonly now: () => number = () => performance.now(),
  ) {
    this.activeStartedAt = this.now();
  }

  pause(): void {
    if (this.paused || this.finished) return;
    this.activeElapsedMs += Math.max(0, this.now() - this.activeStartedAt);
    this.paused = true;
  }

  resume(): void {
    if (!this.paused || this.finished) return;
    this.activeStartedAt = this.now();
    this.paused = false;
  }

  finish(): number {
    if (this.finished) return this.activeElapsedMs;
    if (!this.paused) {
      this.activeElapsedMs += Math.max(0, this.now() - this.activeStartedAt);
    }
    this.finished = true;
    return this.activeElapsedMs;
  }
}

function compactAgentActivity(event: CliAgentActivityEvent): string {
  const compact = (value: string) =>
    terminalSafeMultilineText(value)
      .replace(/\s+/gu, " ")
      .trim()
      .slice(0, 180);
  if (event.kind === "message") return `Agent ${compact(event.text)}`;
  if (event.kind === "reasoning") return `Think ${compact(event.text)}`;
  if (event.kind === "skill") {
    return `Skill ${compact(event.skillId)} · ${event.source}${
      event.detail ? ` · ${compact(event.detail)}` : ""
    }`;
  }
  const presentation = toolActivityPresentation(event);
  return `${presentation.label} ${compactToolActivityDetail(event)}`;
}

type ToolActivityEvent = Extract<CliAgentActivityEvent, { kind: "tool" }>;

const TOOL_ACTIVITY_PRESENTATION = {
  read: { icon: "▤", label: "Read" },
  list: { icon: "≡", label: "List" },
  search: { icon: "⌕", label: "Search" },
  run: { icon: "▶", label: "Run" },
  edit: { icon: "✎", label: "Edit" },
  diff: { icon: "Δ", label: "Diff" },
  web: { icon: "◎", label: "Web" },
  mcp: { icon: "◆", label: "MCP" },
  inspect: { icon: "◇", label: "Inspect" },
  other: { icon: "◇", label: "Tool" },
} as const;

function fallbackToolAction(
  event: ToolActivityEvent,
): keyof typeof TOOL_ACTIVITY_PRESENTATION {
  if (event.toolKind === "command") return "run";
  if (event.toolKind === "mcp") return "mcp";
  if (event.toolKind === "web_search") return "web";
  if (event.toolKind === "file_change") return "edit";
  return "other";
}

function toolActivityPresentation(event: ToolActivityEvent): {
  icon: string;
  label: string;
} {
  return TOOL_ACTIVITY_PRESENTATION[
    event.action ?? fallbackToolAction(event)
  ];
}

function compactToolActivityDetail(event: ToolActivityEvent): string {
  const redacted = redactSensitivePayload(event.label).payload;
  const detail = terminalSafeMultilineText(String(redacted))
    .replace(/\s+/gu, " ")
    .trim();
  if (detail) return detail.slice(0, 180);
  return terminalSafeText(event.toolName ?? "tool").slice(0, 180);
}

function toolActivityLine(event: ToolActivityEvent): string {
  const presentation = toolActivityPresentation(event);
  const duration = event.durationMs === undefined
    ? ""
    : ` · ${formatToolDuration(event.durationMs)}`;
  const suffix = event.status === "failed" ? `${duration} · failed` : duration;
  const icon = event.status === "failed" ? "✕" : presentation.icon;
  return `  ${icon} ${presentation.label.padEnd(7)} ${compactToolActivityDetail(event)}${suffix}`;
}

function formatToolDuration(durationMs: number): string {
  const safeDurationMs = Math.max(0, durationMs);
  if (safeDurationMs < 100) return "<0.1s";
  if (safeDurationMs < 10_000) {
    return `${(safeDurationMs / 1_000).toFixed(1)}s`;
  }
  const totalSeconds = Math.floor(safeDurationMs / 1_000);
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes === 0) return `${totalSeconds}s`;
  return `${totalMinutes}m ${String(seconds).padStart(2, "0")}s`;
}

function activityAuditSummary(
  toolCallCount: number,
  failedToolCallCount: number,
  skillCount: number,
): string {
  const tools = `${toolCallCount} tool call${toolCallCount === 1 ? "" : "s"}`;
  const failed = failedToolCallCount > 0
    ? ` · ${failedToolCallCount} failed`
    : "";
  const skills = `${skillCount} skill${skillCount === 1 ? "" : "s"} attached`;
  return `  ◇ Activity  ${tools}${failed} · ${skills}`;
}

function runEventContextUsage(
  event: CliRunEvent,
): ContextTokenBreakdownV1 | undefined {
  if (
    event.type !== "codex_context_usage" ||
    typeof event.payload !== "object" ||
    event.payload === null
  ) {
    return undefined;
  }
  const current = (event.payload as { current?: unknown }).current;
  if (typeof current !== "object" || current === null) return undefined;
  const candidate = current as Record<string, unknown>;
  const keys = [
    "inputTokens",
    "cachedInputTokens",
    "outputTokens",
    "reasoningOutputTokens",
    "totalTokens",
  ] as const;
  if (
    keys.some(
      (key) =>
        typeof candidate[key] !== "number" ||
        !Number.isFinite(candidate[key]) ||
        (candidate[key] as number) < 0,
    )
  ) {
    return undefined;
  }
  return Object.fromEntries(
    keys.map((key) => [key, Math.trunc(candidate[key] as number)]),
  ) as ContextTokenBreakdownV1;
}

function mergeSkillContexts(
  runId: string,
  contexts: readonly SkillContextSnapshot[],
): SkillContextSnapshot | undefined {
  const skills = contexts
    .flatMap((context) => context.skills)
    .sort((left, right) => left.skillId.localeCompare(right.skillId));
  if (skills.length === 0) return undefined;
  return {
    schemaVersion: 1,
    runId,
    createdAt: new Date().toISOString(),
    skills,
    digest: createHash("sha256").update(JSON.stringify(skills)).digest("hex"),
  };
}

function completedInvocation(input: {
  id?: string;
  runId?: string;
  taskId: string;
  role: ModelInvocationRecord["role"];
  providerId?: ModelInvocationRecord["providerId"];
  modelId: string;
  thinkingEffort: ThinkingEffort;
  modelTier?: ModelInvocationRecord["modelTier"];
  routingReasonCodes?: ModelInvocationRecord["routingReasonCodes"];
  context: string;
  startedAt: string;
  artifactRefs?: string[];
  parentInvocationId?: string;
}): ModelInvocationRecord {
  return {
    schemaVersion: 1,
    id: input.id ?? `invocation-${randomUUID()}`,
    runId: input.runId ?? "pending-controlled-run",
    ...(input.parentInvocationId
      ? { parentInvocationId: input.parentInvocationId }
      : {}),
    taskId: input.taskId,
    role: input.role,
    providerId: input.providerId ?? "codex-cli",
    modelId: input.modelId,
    thinkingEffort: input.thinkingEffort,
    contextHash: createHash("sha256").update(input.context).digest("hex"),
    status: "completed",
    inputTokens: null,
    outputTokens: null,
    estimatedCostUsd: null,
    startedAt: input.startedAt,
    completedAt: new Date().toISOString(),
    retryIndex: 0,
    artifactRefs: [...(input.artifactRefs ?? [])],
    ...(input.modelTier ? { modelTier: input.modelTier } : {}),
    ...(input.routingReasonCodes
      ? { routingReasonCodes: [...input.routingReasonCodes] }
      : {}),
  };
}

function appendConversationOutcome(
  state: InteractiveSessionState,
  outcome: string,
): void {
  const suffix = `Action outcome: ${outcome}`.trim();
  const base = state.conversationSummary?.trim() ?? "";
  const separator = base ? "\n" : "";
  const availableBaseLength = Math.max(
    0,
    MAX_CONVERSATION_SUMMARY - separator.length - suffix.length,
  );
  state.conversationSummary = `${base.slice(0, availableBaseLength)}${separator}${suffix}`;
}

const PROVIDER_LABELS: Record<OrchestrationProviderId, string> = {
  "codex-cli": "Codex",
  "openai-api": "OpenAI API",
  "anthropic-api": "Anthropic API",
  "opencode-api": "OpenCode",
};

function modelChoiceDescription(model: CliModelOption): string {
  const efforts = model.supportedThinkingEfforts.length > 0
    ? `effort: ${model.supportedThinkingEfforts.join(", ")}`
    : "effort: provider default";
  // The catalog can mix providers, so the picker has to say which one a model
  // belongs to; the id alone is not always obvious.
  const provider = PROVIDER_LABELS[model.providerId ?? "codex-cli"] ?? "Codex";
  return model.description
    ? `${provider} · ${model.description} · ${efforts}`
    : `${provider} · ${efforts}`;
}

function modelSelectionText(models: CliModelOption[], currentModelId: string): string {
  return [
    `Models · current ${terminalSafeText(currentModelId)}`,
    ...models.map(
      (model, index) =>
        `  ${String(index + 1).padStart(2)}  ${terminalSafeText(model.label)} · ${terminalSafeText(model.id)}`,
    ),
  ].join("\n");
}

function orchestrationProfileText(
  profile: OrchestrationProfile,
  width: number | undefined = 88,
): string {
  return terminalDetailText(
    `Orchestration profile · ${profile.preset}`,
    [
      ...ORCHESTRATION_ROLES.map((role) => {
        const binding = profile.roles[role];
        return {
          label: role,
          value: `${terminalSafeText(binding.modelId)} · ${binding.thinkingEffort}`,
        };
      }),
      {
        label: "Review",
        value: profile.reviewerPolicy.replace("_", " "),
      },
      {
        label: "Limits",
        value: `${profile.maxReadOnlyHelpers} helpers · depth ${profile.maxDepth} · ${profile.maxRecoveryAttempts} recovery`,
      },
      {
        label: "Budgets",
        value: "wall time hard · token/cost advisory unless provider-enforced",
      },
    ],
    width,
  );
}

function presetProfile(preset: typeof EDITABLE_PRESETS[number]): OrchestrationProfile {
  return preset === "auto"
    ? { ...createOrchestrationPreset("balanced"), preset: "auto" }
    : createOrchestrationPreset(preset);
}

function profileChoiceDetails(profile: OrchestrationProfile): string[] {
  return [
    "Impact · applies to this session and future launches; Advanced can override individual roles",
    `Models · coordinator ${profile.roles.coordinator.modelId}/${profile.roles.coordinator.thinkingEffort} · implementer ${profile.roles.implementer.modelId}/${profile.roles.implementer.thinkingEffort}`,
    `Support · helper ${profile.roles.helper.modelId}/${profile.roles.helper.thinkingEffort} · reviewer ${profile.roles.reviewer.modelId}/${profile.roles.reviewer.thinkingEffort}`,
    `Policy · review ${profile.reviewerPolicy.replaceAll("_", " ")} · ${profile.maxReadOnlyHelpers} helpers · depth ${profile.maxDepth} · ${profile.maxRecoveryAttempts} recovery`,
  ];
}

function setProfile(
  state: InteractiveSessionState,
  profile: OrchestrationProfile,
): void {
  state.orchestrationProfile = profile;
  state.modelTierConfiguration =
    migrateOrchestrationProfileToModelTiers(profile);
  state.modelId = profile.roles.coordinator.modelId;
  state.thinkingEffort = profile.roles.coordinator.thinkingEffort;
}

function roleName(value: string): OrchestrationRole | undefined {
  return ORCHESTRATION_ROLES.find((role) => role === value);
}

async function resolveSessionProfile(
  state: InteractiveSessionState,
  listModels: (() => Promise<CliModelOption[]>) | undefined,
  instruction: string,
  action?: ProposedRepositoryAction,
): Promise<ResolvedOrchestrationProfile> {
  const profile = state.orchestrationProfile;
  const tiers = state.modelTierConfiguration;
  if (!profile || !tiers) {
    throw new Error("The session has no model tier configuration");
  }
  const tiered = modelTierConfigurationToOrchestrationProfile(tiers, {
    instruction,
    estimatedChangedFiles: action?.estimatedChangedFiles,
    operations: action?.operations,
    requestedMinimumTier: state.nextMinimumTier,
  });
  const models = listModels
    ? await listModels()
    : Object.values(tiered.profile.roles).map((binding) => ({
        id: binding.modelId,
        label: binding.modelId,
        supportedThinkingEfforts: [binding.thinkingEffort],
      }));
  return resolveOrchestrationProfile(tiered.profile, models);
}

function statusText(
  state: InteractiveSessionState,
  codeIntel?: ReturnType<
    NonNullable<InteractiveSessionOptions["codeIntelStatus"]>
  >,
  usage?: ProviderUsageSnapshotV1,
  width: number | undefined = 88,
): string {
  const rows: TerminalDetailRow[] = [
    { label: "ID", value: terminalSafeText(state.sessionId ?? "unsaved") },
    { label: "Revision", value: String(state.revision ?? 0) },
    { label: "Repository", value: terminalSafeText(state.repositoryPath) },
    {
      label: "Profile",
      value: terminalSafeText(state.orchestrationProfile?.preset ?? "legacy"),
    },
    {
      label: "Coordinator",
      value: terminalSafeText(`${state.modelId} · ${state.thinkingEffort}`),
    },
    {
      label: "Implementer",
      value: terminalSafeText(
      state.orchestrationProfile
        ? `${state.orchestrationProfile.roles.implementer.modelId} · ${state.orchestrationProfile.roles.implementer.thinkingEffort}`
        : `${state.modelId} · ${state.thinkingEffort}`,
      ),
    },
    {
      label: "Provider",
      value: `${state.providerReady ? "ready" : "not ready"} · ${terminalSafeText(state.providerDetail)}`,
    },
    {
      label: "Usage",
      value:
      usage
        ? terminalSafeText(providerUsageSummary(usage))
        : "unavailable",
    },
    {
      label: "Code intel",
      value:
      codeIntel?.failure
        ? `degraded · ${terminalSafeText(codeIntel.failure)}`
        : codeIntel?.enabled
          ? `${terminalSafeText(codeIntel.state ?? "warming")} · ${codeIntel.sessions} persistent session${codeIntel.sessions === 1 ? "" : "s"}`
          : "not started",
    },
    { label: "Mode", value: terminalSafeText(state.mode ?? "plan") },
    { label: "Goal", value: terminalSafeText(state.goal ?? "not set") },
    { label: "Turns", value: String(state.turnCount ?? 0) },
    {
      label: "Context",
      value:
      state.context?.usage.usedPercent !== undefined
        ? `${state.context.usage.usedPercent.toFixed(0)}% used · ${
            state.context.usage.remainingTokens?.toLocaleString() ?? "unknown"
          } tokens left`
        : state.context?.usage.usedTokens !== undefined
          ? `${state.context.usage.usedTokens.toLocaleString()} tokens · window unknown`
          : "usage unavailable",
    },
    {
      label: "Transcript",
      value: `${state.transcript?.entryCount ?? 0} messages stored · ${
      state.recentTurns?.length ?? 0
    } recent in prompt`,
    },
    {
      label: "Resources",
      value:
      state.lastRun?.resources?.sandboxChanged
        ? "modified worktree protected from automatic cleanup"
        : state.lastRun?.resources?.sandboxWorktreePath &&
            !state.lastRun.resources.sandboxRemovedAt
          ? "clean worktree tracked"
          : "none linked",
    },
    {
      label: "Boundary",
      value: "repository-only, isolated worktree, verifier required",
    },
  ];
  return terminalDetailText("Session", rows, width);
}

function contextText(
  state: InteractiveSessionState,
  capacityError?: string,
  width: number | undefined = 88,
): string {
  const context = state.context;
  if (!context) {
    return terminalDetailText("Context", [
      {
        label: "Usage",
        value: capacityError
          ? `unavailable · ${terminalSafeText(capacityError)}`
          : "unavailable until model metadata is loaded",
      },
      {
        label: "Transcript",
        value: `${state.transcript?.entryCount ?? 0} messages stored`,
      },
      {
        label: "Policy",
        value: "warn 75% · compact 85% · recover 95%",
      },
    ], width);
  }
  const usage = context.usage;
  const capacity = context.capacity;
  const lastTurnRows = state.lastTurnTelemetry
    ? [
        {
          label: "Last turn",
          value: `${(state.lastTurnTelemetry.totalDurationMs / 1_000).toFixed(1)}s · ${
            state.lastTurnTelemetry.stages.length
          } measured stages`,
        },
        {
          label: "Stages",
          value: state.lastTurnTelemetry.stages
            .map(({ name, durationMs }) =>
              `${name.replaceAll("_", " ")} ${(durationMs / 1_000).toFixed(1)}s`
            )
            .join(" · "),
        },
        ...(state.lastTurnTelemetry.repositorySnapshotChars === undefined
          ? []
          : [{
              label: "Orynt input",
              value: `${state.lastTurnTelemetry.repositorySnapshotChars.toLocaleString()} repository snapshot characters`,
            }]),
      ]
    : [];
  return terminalDetailText("Context", [
    { label: "Model", value: terminalSafeText(capacity.modelId) },
    {
      label: "Raw window",
      value: `${
        capacity.contextWindowTokens?.toLocaleString() ?? "unknown"
      } tokens`,
    },
    {
      label: "Usable",
      value: `${
        capacity.effectiveWindowTokens?.toLocaleString() ?? "unknown"
      } tokens · ${terminalSafeText(capacity.source)}`,
    },
    {
      label: "Usage",
      value:
        usage.usedTokens !== undefined &&
          capacity.contextWindowTokens !== undefined &&
          capacity.contextWindowTokens > 0
          ? `${usage.usedTokens.toLocaleString()} / ${
              capacity.contextWindowTokens.toLocaleString()
            } raw · ${(
            usage.usedTokens / capacity.contextWindowTokens * 100
            ).toFixed(1)}%`
          : `${usage.usedTokens?.toLocaleString() ?? "unknown"} used · raw percentage unavailable`,
    },
    {
      label: "Available",
      value: `${
        usage.remainingTokens?.toLocaleString() ?? "unknown"
      } usable tokens`,
    },
    { label: "Precision", value: terminalSafeText(usage.precision) },
    { label: "State", value: terminalSafeText(context.state) },
    {
      label: "Policy",
      value: `warn ${context.thresholds.warnPercent}% · compact ${context.thresholds.compactPercent}% · recover ${context.thresholds.hardPercent}%`,
    },
    {
      label: "Compaction",
      value: `${context.compactionCount} compact · ${context.recoveryCount} recovery · ${context.overflowRetryCount} retry`,
    },
    {
      label: "Transcript",
      value: `${state.transcript?.entryCount ?? 0} messages stored`,
    },
    ...lastTurnRows,
  ], width);
}

function boundaryText(
  title: string,
  state: InteractiveSessionState,
  extraRows: readonly string[] = [],
): string {
  const rows = [
    `Repository  ${terminalSafeText(state.repositoryPath)}`,
    `Profile     ${terminalSafeText(state.orchestrationProfile?.preset ?? "legacy")}`,
    `Models      ${terminalSafeText(
      state.orchestrationProfile
        ? `${state.orchestrationProfile.roles.coordinator.modelId} → ${state.orchestrationProfile.roles.implementer.modelId}`
        : state.modelId,
    )}`,
    "Chat        repository read-only · no approval",
    "Actions     safe repository work may be auto-authorized",
    "Review      broad or sensitive repository work requires approval",
    "Scope       repository-only isolated git worktree; host takeover unavailable",
    "Reversible  source workspace is not edited directly; sandbox is retained",
    "Evidence    contract, event log, artifact manifest, verifier verdict",
    "Policy      deterministic authorization + verifier gates",
    ...extraRows,
  ];
  return [
    "",
    title,
    ...renderTreeRows(rows),
  ].join("\n");
}

function paintPrefix(
  theme: TerminalTheme,
  role: TerminalRole,
  value: string,
  prefix: string,
): string {
  return value.startsWith(prefix)
    ? `${theme.paint(role, prefix)}${value.slice(prefix.length)}`
    : value;
}

export function startupBoundaryText(
  state: InteractiveSessionState,
  options: { color?: boolean; themeId?: TerminalThemeId } = {},
): string {
  const theme = createTerminalDesignSystem(options.color ?? false, options.themeId).theme;
  return [
    boundaryText(
      `${theme.paint("attention", "Safety acknowledgement")} · shown once`,
      state,
      [
        "Note        Acknowledging this boundary does not approve sensitive work.",
      ],
    ),
  ].join("\n");
}

export function approvalText(
  state: InteractiveSessionState,
  action: ProposedRepositoryAction,
  authorization: AgentActionAuthorization,
  options: { color?: boolean; themeId?: TerminalThemeId } = {},
): string {
  const theme = createTerminalDesignSystem(options.color ?? false, options.themeId).theme;
  const rows = [
    `Instruction  ${terminalSafeText(action.instruction)}`,
    `Repository   ${terminalSafeText(state.repositoryPath)}`,
    `Goal         ${terminalSafeText(state.goal ?? "not set")}`,
    `Paths        ${terminalSafeText(action.estimatedPaths.join(", ") || "not declared")}`,
    `Estimate     ${action.estimatedChangedFiles} changed file${action.estimatedChangedFiles === 1 ? "" : "s"}`,
    "Recovery     up to 1 verifier-driven retry · same sandbox and approved paths",
    `Reason       ${terminalSafeText(authorization.reasons.join(" "))}`,
  ];
  return [
    "",
    `${theme.paint("attention", "Action approval")} · this repository run only`,
    ...renderTreeRows(rows),
  ].join("\n");
}

function isApproval(value: string): boolean {
  return /^(y|yes)$/i.test(value.trim());
}

function isRejection(value: string): boolean {
  return /^(n|no)$/i.test(value.trim());
}

function selectedPromptOption(
  question: PromptUnderstandingQuestionV1,
  value: string,
) {
  const normalized = value.trim().toLocaleLowerCase();
  return question.options.find(
    (option) =>
      option.id.toLocaleLowerCase() === normalized ||
      option.label.toLocaleLowerCase() === normalized,
  );
}

function unansweredPromptQuestion(
  draft: CliPromptUnderstandingDraft,
): PromptUnderstandingQuestionV1 | undefined {
  const answered = new Set(
    draft.basis.clarificationAnswers.map((answer) => answer.questionId),
  );
  return draft.understanding.questions.find(
    (question) => !answered.has(question.id),
  );
}

function promptQuestionGroup(kind: PromptUnderstandingQuestionV1["kind"]): string {
  return kind === "outcome"
    ? "Outcome"
    : kind === "constraint"
      ? "Constraints"
      : "Validation";
}

/**
 * Render questions as readable groups instead of a forced selector so every
 * question still accepts arbitrary operator text. Option ids and labels are
 * both recognized when the next composer message is submitted.
 */
export function promptUnderstandingQuestionsText(
  understanding: PromptUnderstandingV1,
  options: { round: number; color?: boolean; themeId?: TerminalThemeId } = { round: 1 },
): string {
  const theme = createTerminalDesignSystem(options.color ?? false, options.themeId).theme;
  const groups = new Map<string, PromptUnderstandingQuestionV1[]>();
  for (const question of understanding.questions.slice(0, 1)) {
    const group = promptQuestionGroup(question.kind);
    groups.set(group, [...(groups.get(group) ?? []), question]);
  }
  const rows = [...groups.entries()].flatMap(([group, questions]) => [
    theme.paint("attention", group),
    ...questions.flatMap((question) => [
      `  ${terminalSafeText(question.prompt)}`,
      `    Why: ${terminalSafeText(question.rationale)}`,
      ...(question.options.length > 0
        ? question.options.map(
            (option) =>
              `    ${terminalSafeText(option.id)} · ${terminalSafeText(option.label)}${option.recommended ? " · recommended" : ""}\n      ${terminalSafeText(option.description)}`,
          )
        : []),
    ]),
  ]);
  return [
    `Task clarification · round ${options.round}/3`,
    ...rows,
    "Reply to the next question with an option id, its label, or any free-form answer.",
  ].join("\n");
}

function promptClarificationRequest(
  understanding: PromptUnderstandingV1,
  round: number,
): ClarificationRequest {
  return {
    title: `Task clarification · round ${round}/3`,
    timeoutMs: 120_000,
    questions: understanding.questions.map((question) => ({
      id: question.id,
      prompt: question.prompt,
      rationale: question.rationale,
      group: promptQuestionGroup(question.kind),
      selectionMode: question.selectionMode ?? "single",
      options: question.options.map((option) => ({
        id: option.id,
        label: option.label,
        description: option.description,
        recommended: option.recommended,
        ...(option.recommendationReason !== undefined
          ? { recommendationReason: option.recommendationReason }
          : {}),
        ...(option.conflictsWith !== undefined
          ? { conflictsWith: option.conflictsWith }
          : {}),
      })),
    })),
  };
}

function clarificationBasis(
  basis: PromptUnderstandingBasisV1,
  understanding: PromptUnderstandingV1,
  result: Extract<
    ClarificationResult,
    { status: "submitted" | "auto_submitted" }
  >,
): PromptUnderstandingBasisV1 {
  const questions = new Map(
    understanding.questions.map((question) => [question.id, question]),
  );
  return {
    ...basis,
    clarificationAnswers: [
      ...basis.clarificationAnswers,
      ...result.answers.map((answer) => {
        const question = questions.get(answer.questionId);
        const selectedOptions = answer.selectedOptionIds.flatMap((optionId) => {
          const option = question?.options.find(
            (candidate) => candidate.id === optionId,
          );
          return option ? [option] : [];
        });
        return {
          questionId: answer.questionId,
          answer: selectedOptions.map(({ label }) => label).join(", "),
          selectedOptionIds: [...answer.selectedOptionIds],
          ...(selectedOptions.length === 1
            ? { selectedOptionId: selectedOptions[0]!.id }
            : {}),
          ...(answer.note ? { note: answer.note } : {}),
          ...(answer.optionNotes?.length
            ? {
                optionNotes: answer.optionNotes.map((optionNote) => ({
                  ...optionNote,
                })),
              }
            : {}),
        };
      }),
    ],
  };
}

function clarificationSummaryText(
  understanding: PromptUnderstandingV1,
  result: Extract<
    ClarificationResult,
    { status: "submitted" | "auto_submitted" }
  >,
): string {
  const questions = new Map(
    understanding.questions.map((question) => [question.id, question]),
  );
  return [
    result.status === "auto_submitted"
      ? "Clarification summary · auto-submitted after 120s"
      : "Clarification summary",
    ...result.answers.flatMap((answer, index) => {
      const question = questions.get(answer.questionId);
      const labels = answer.selectedOptionIds.map(
        (optionId) =>
          question?.options.find((option) => option.id === optionId)?.label ??
          optionId,
      );
      return [
        `  ${index + 1}. ${terminalSafeText(question?.prompt ?? answer.questionId)}`,
        `     ${terminalSafeText(labels.join(", "))}${answer.autoFilled ? " · auto-filled" : ""}`,
        ...(answer.note
          ? [`     Note · ${terminalSafeText(answer.note)}`]
          : []),
        ...(answer.optionNotes ?? []).map((optionNote) => {
          const label =
            question?.options.find(
              (option) => option.id === optionNote.optionId,
            )?.label ?? optionNote.optionId;
          return `     ${terminalSafeText(label)} · ${terminalSafeText(optionNote.note)}`;
        }),
      ];
    }),
  ].join("\n");
}

function promptAssumptionsText(
  assumptions: readonly PromptUnderstandingAssumptionV1[],
): string {
  return [
    "Scope assumptions need confirmation",
    ...assumptions
      .filter((assumption) => assumption.affectsScope)
      .map((assumption) => `  ${terminalSafeText(assumption.text)}`),
    "Reply yes to confirm these assumptions, or no to stop and restate the task.",
  ].join("\n");
}

function promptUnderstandingDraft(
  basis: PromptUnderstandingBasisV1,
  understanding: PromptUnderstandingV1,
  clarificationRounds: number,
): CliPromptUnderstandingDraft {
  return sanitizeCliPromptUnderstandingDraft({
    schemaVersion: 1,
    basis,
    understanding,
    clarificationRounds,
    requiresReconfirmation: false,
  });
}

type ComposerReadResult =
  | {
      kind: "input";
      value: string;
      images: AgentImageInput[];
      draft?: ComposerDraftSnapshot;
    }
  | { kind: "edit_pending" }
  | { kind: "clear_pending" }
  | { kind: "interrupt" };

async function readComposer(
  terminal: InteractiveTerminal,
  initialValue: ComposerInitialValue = "",
  statusContext?: ComposerStatusContext,
): Promise<ComposerReadResult> {
  let line = terminal.compose
    ? await terminal.compose(
        `\n${COMPOSER_PROMPT}`,
        initialValue,
        statusContext,
      )
    : await terminal.ask(`\n${COMPOSER_PROMPT}`);
  if (line === INTERRUPTED_INPUT) return { kind: "interrupt" };
  if (line === EDIT_PENDING_INPUT) return { kind: "edit_pending" };
  if (line === CLEAR_PENDING_INPUT) return { kind: "clear_pending" };
  const lines: string[] = [];
  while (line.trimEnd().endsWith("\\")) {
    lines.push(line.trimEnd().slice(0, -1).trimEnd());
    line = await terminal.ask("… ");
    if (line === INTERRUPTED_INPUT) return { kind: "interrupt" };
  }
  lines.push(line);
  const value = lines.join("\n").trim();
  terminal.remember?.(value);
  const draft = terminal.takeSubmittedDraft?.();
  return {
    kind: "input",
    value,
    images: terminal.takeSubmittedImages?.() ?? [],
    ...(draft ? { draft } : {}),
  };
}

function composerStatusContext(
  state: InteractiveSessionState,
  pendingCount = 0,
  pendingPaused = false,
): ComposerStatusContext {
  const profile =
    state.orchestrationProfile ??
    createLegacySingleModelProfile(state.modelId, state.thinkingEffort);
  const configuration =
    state.modelTierConfiguration ??
    migrateOrchestrationProfileToModelTiers(profile);
  const coordinatorTier = configuration.roles.coordinator;
  const coordinator = configuration.tiers[coordinatorTier];
  return {
    mode: "next",
    preset: profile.preset,
    modelId: coordinator.modelId,
    thinkingEffort: coordinator.thinkingEffort,
    ...(state.context ? { context: state.context } : {}),
    ...(pendingCount > 0
      ? { pendingCount, pendingPaused }
      : {}),
  };
}

function activeComposerStatusContext(
  preset: string,
  role: OrchestrationRole,
  profile: ResolvedOrchestrationProfile,
): ComposerStatusContext {
  const binding = profile.roles[role];
  return {
    mode: "active",
    preset,
    role,
    modelId: binding.modelId,
    thinkingEffort: binding.thinkingEffort,
  };
}

function phaseComposerStatusContext(
  preset: string,
  phaseLabel: string,
): ComposerStatusContext {
  return {
    mode: "phase",
    preset,
    phaseLabel,
  };
}

function planText(
  state: InteractiveSessionState,
  width: number | undefined = 88,
): string {
  return terminalDetailText("Operator plan", [
    { label: "Goal", value: terminalSafeText(state.goal ?? "not set") },
    {
      label: "Acceptance",
      value: terminalSafeText(
        state.acceptanceCriteria?.join("; ") ||
          "runtime contract + verifier gates",
      ),
    },
    {
      label: "1",
      value:
        "Read the current message with active goal and conversation context",
    },
    {
      label: "2",
      value: "Answer in read-only chat or propose a repository-scoped action",
    },
    {
      label: "3",
      value: "Auto-authorize safe actions; request approval for sensitive actions",
    },
    {
      label: "4",
      value: "Import controlled artifacts and run independent verification",
    },
    {
      label: "5",
      value: "Persist compact state, evidence, cost, and candidate memory",
    },
  ], width);
}

function stateText(
  state: InteractiveSessionState,
  width: number | undefined = 88,
): string {
  const run = state.lastRun;
  if (!run) return "Working state: no completed run in this session.";
  return terminalDetailText(
    `Working state · ${terminalSafeText(run.runId)}`,
    [
      {
        label: "Mode",
        value: terminalSafeText(run.workingState?.mode ?? "not recorded"),
      },
      {
        label: "Active chunks",
        value: String(run.workingState?.activeChunkCount ?? 0),
      },
      {
        label: "Constraints",
        value: terminalSafeText(
          run.workingState?.hardConstraints.join("; ") || "not recorded",
        ),
      },
      {
        label: "Selected option",
        value: terminalSafeText(
          run.workingState?.selectedOptionId ?? "not recorded",
        ),
      },
      {
        label: "Memory",
        value: terminalSafeText(run.memory?.summary ?? "not recorded"),
      },
    ],
    width,
  );
}

function evidenceText(
  state: InteractiveSessionState,
  width: number | undefined = 88,
): string {
  const run = state.lastRun;
  if (!run) return "Evidence: no completed run in this session.";
  const artifacts = Object.entries(run.artifacts).filter((entry): entry is [string, string] => typeof entry[1] === "string");
  return terminalDetailText(
    `Evidence · ${run.evidenceCount} artifact${run.evidenceCount === 1 ? "" : "s"}`,
    [
      ...artifacts.map(
        ([name, artifactPath]) => ({
          label: terminalSafeText(name),
          value: terminalSafeText(artifactPath),
        }),
      ),
      {
        label: "Manifest",
        value: terminalSafeText(run.artifactManifestPath),
      },
    ],
    width,
  );
}

async function diffText(
  state: InteractiveSessionState,
  requestedPath: string,
  color: boolean,
  themeId?: TerminalThemeId,
): Promise<string> {
  const run = state.lastRun;
  if (!run) return "Diff: no completed run in this session.";
  const snapshot = run.repositoryDiff;
  if (!snapshot) return "Diff unavailable: the last run did not record a repository diff artifact.";
  if (!snapshot.available) {
    return `Diff unavailable: ${terminalSafeText(snapshot.reason)}`;
  }
  const trimmedPath = requestedPath.trim().replace(/^\.\//u, "");
  if (
    trimmedPath &&
    (
      path.posix.isAbsolute(trimmedPath) ||
      path.win32.isAbsolute(trimmedPath) ||
      trimmedPath.split(/[\\/]/u).includes("..") ||
      trimmedPath.includes("\0")
    )
  ) {
    return "Diff path must be a safe repository-relative path.";
  }
  try {
    const artifact = await readRepositoryDiffArtifact(snapshot.reference);
    if (artifact.runId !== run.runId) {
      return "Diff unavailable: the artifact belongs to a different run.";
    }
    return renderRepositoryDiff(artifact, {
      color,
      themeId,
      verification: run.verification,
      artifactPath: snapshot.reference.path,
      ...(trimmedPath ? { filePath: trimmedPath.replaceAll("\\", "/") } : {}),
    });
  } catch (error) {
    return `Diff unavailable: ${terminalSafeText(
      error instanceof Error ? error.message : String(error),
    )}`;
  }
}

function verificationText(
  state: InteractiveSessionState,
  width: number | undefined = 88,
): string {
  const run = state.lastRun;
  return run
    ? terminalDetailText("Verification", [
        {
          label: "Verdict",
          value: terminalSafeText(run.verification),
        },
        {
          label: "Summary",
          value: terminalSafeText(run.summary),
        },
      ], width)
    : "Verification pending · no completed run in this session.";
}

function costText(
  state: InteractiveSessionState,
  width: number | undefined = 88,
): string {
  const run = state.lastRun;
  if (!run) return "Cost: no completed run in this session.";
  const usd = run.estimatedCostUsd === undefined ? "not recorded" : `$${run.estimatedCostUsd.toFixed(4)}`;
  const perSuccess = run.costPerSuccessfulTask === undefined ? "not recorded" : `$${run.costPerSuccessfulTask.toFixed(4)}`;
  return terminalDetailText("Cost", [
    {
      label: "Tokens",
      value: String(run.estimatedTotalTokens ?? "not recorded"),
    },
    { label: "Estimated", value: usd },
    { label: "Per success", value: perSuccess },
  ], width);
}

function sessionSnapshot(state: InteractiveSessionState): CliSessionSnapshot {
  const now = new Date().toISOString();
  const orchestrationProfile =
    state.orchestrationProfile ??
    createLegacySingleModelProfile(state.modelId, state.thinkingEffort);
  return {
    schemaVersion: 4,
    sessionId: state.sessionId ?? `session-${randomUUID()}`,
    revision: state.revision ?? 0,
    ...(state.title ? { title: state.title } : {}),
    ...(state.pinned ? { pinned: true } : {}),
    ...(state.trashedAt ? { trashedAt: state.trashedAt } : {}),
    repositoryPath: state.repositoryPath,
    orchestrationProfile,
    modelTierConfiguration:
      state.modelTierConfiguration ??
      migrateOrchestrationProfileToModelTiers(orchestrationProfile),
    modelId: state.modelId,
    thinkingEffort: state.thinkingEffort,
    mode: state.mode ?? "plan",
    ...(state.goal ? { goal: state.goal } : {}),
    acceptanceCriteria: state.acceptanceCriteria ?? [],
    selectedSkillIds: state.selectedSkillIds ?? [],
    ...(state.conversationSummary
      ? { conversationSummary: state.conversationSummary }
      : {}),
    ...(state.recentTurns?.length
      ? { recentTurns: state.recentTurns.slice(-12) }
      : {}),
    ...(state.context ? { context: state.context } : {}),
    ...(state.providerThreadId
      ? { providerThreadId: state.providerThreadId }
      : {}),
    ...(state.transcript ? { transcript: state.transcript } : {}),
    ...(state.promptUnderstandingDraft
      ? {
          promptUnderstandingDraft: sanitizeCliPromptUnderstandingDraft(
            {
              ...state.promptUnderstandingDraft,
              requiresReconfirmation: true,
            },
          ),
        }
      : {}),
    turnCount: state.turnCount ?? 0,
    ...(state.lastRun ? { lastRun: state.lastRun } : {}),
    ...(state.lastTurnTelemetry
      ? { lastTurnTelemetry: state.lastTurnTelemetry }
      : {}),
    createdAt: state.createdAt ?? now,
    updatedAt: now,
  };
}

export async function runInteractiveSession(
  options: InteractiveSessionOptions,
): Promise<"completed" | "interrupted"> {
  const { terminal } = options;
  const designSystem = createTerminalDesignSystem(
    terminal.color,
    terminal.themeId,
  );
  const write = (value: string): void => {
    terminal.write(designSystem.renderProductText(value));
  };
  const notifySuccess = (value: string, fallback = value): void => {
    if (terminal.notify) terminal.notify(value, "success");
    else write(fallback);
  };
  let theme = designSystem.theme;
  let skillRouting = options.skillRouting ?? "auto_trusted";
  const state: InteractiveSessionState = {
    ...options.state,
    orchestrationProfile:
      options.state.orchestrationProfile ??
      createLegacySingleModelProfile(
        options.state.modelId,
        options.state.thinkingEffort,
      ),
    modelTierConfiguration:
      options.state.modelTierConfiguration ??
      migrateOrchestrationProfileToModelTiers(
        options.state.orchestrationProfile ??
          createLegacySingleModelProfile(
            options.state.modelId,
            options.state.thinkingEffort,
          ),
      ),
    sessionId: options.state.sessionId ?? `session-${randomUUID()}`,
    mode: options.state.mode ?? "plan",
    acceptanceCriteria: [...(options.state.acceptanceCriteria ?? [])],
    selectedSkillIds: [...(options.state.selectedSkillIds ?? [])],
    turnCount: options.state.turnCount ?? 0,
    activityDetails: options.state.activityDetails ?? "important",
    createdAt: options.state.createdAt ?? new Date().toISOString(),
  };
  if (state.promptUnderstandingDraft) {
    state.promptUnderstandingDraft = sanitizeCliPromptUnderstandingDraft(
      state.promptUnderstandingDraft,
    );
  }
  const discardedRestoredAttachmentDraft = Boolean(
    state.promptUnderstandingDraft?.basis.attachments?.length,
  );
  if (discardedRestoredAttachmentDraft) {
    delete state.promptUnderstandingDraft;
  }
  let modelCatalog: CliModelOption[] | undefined;
  let contextCapacityError: string | undefined;
  const loadModelCatalog = options.listModels
    ? async (): Promise<CliModelOption[]> => {
        if (modelCatalog) return modelCatalog;
        try {
          modelCatalog = await options.listModels!();
          contextCapacityError = undefined;
          return modelCatalog;
        } catch (error) {
          contextCapacityError =
            error instanceof Error ? error.message : String(error);
          throw error;
        }
      }
    : undefined;
  const contextControllerForModel = (
    modelId: string,
  ): ContextController | undefined => {
    const model = modelCatalog?.find((candidate) => candidate.id === modelId);
    if (!model) {
      if (modelCatalog) {
        contextCapacityError =
          `model ${modelId} is missing from the provider catalog`;
      }
      return undefined;
    }
    contextCapacityError = undefined;
    const effectiveWindowTokens =
      model.effectiveContextWindowTokens ?? model.contextWindowTokens;
    if (
      model.contextWindowTokens === undefined &&
      effectiveWindowTokens === undefined
    ) {
      contextCapacityError =
        `model ${modelId} does not publish context capacity`;
      return undefined;
    }
    return new ContextController({
      modelId,
      capacity: {
        source: "model_catalog",
        ...(model.contextWindowTokens !== undefined
          ? { contextWindowTokens: model.contextWindowTokens }
          : {}),
        ...(effectiveWindowTokens !== undefined
          ? { effectiveWindowTokens }
          : {}),
        ...(model.providerAutoCompactAtTokens !== undefined
          ? {
              providerAutoCompactAtTokens:
                model.providerAutoCompactAtTokens,
            }
          : {}),
      },
    });
  };
  const synchronizeContextForModel = (modelId: string): void => {
    if (state.context?.capacity.modelId === modelId) return;
    delete state.providerThreadId;
    const context = contextControllerForModel(modelId)?.snapshot();
    if (context) state.context = context;
    else delete state.context;
  };
  // Provider threads are process-local. A restored snapshot must not present
  // stale usage as if it belonged to the fresh runtime thread.
  delete state.context;
  delete state.providerThreadId;
  let persistenceDegraded = false;
  const persist = async (): Promise<boolean> => {
    try {
      const persisted = await options.persistSession?.(sessionSnapshot(state));
      if (
        typeof persisted === "object" &&
        persisted !== null &&
        "sessionId" in persisted &&
        "revision" in persisted &&
        persisted.sessionId === state.sessionId &&
        typeof persisted.revision === "number" &&
        Number.isSafeInteger(persisted.revision)
      ) {
        state.revision = persisted.revision;
      }
      if (persistenceDegraded) {
        persistenceDegraded = false;
        write("Session persistence restored. Repository actions are available again.");
      }
      return true;
    } catch (error) {
      if (!persistenceDegraded) {
        write(
          `Session state was not saved: ${terminalSafeText(
            error instanceof Error ? error.message : String(error),
          )}\nThis session is temporarily non-resumable. Read-only chat remains available, but repository actions are blocked.`,
        );
      }
      persistenceDegraded = true;
      return false;
    }
  };
  const clearPromptUnderstandingDraft = (): void => {
    delete state.promptUnderstandingDraft;
    promptUnderstandingImages = [];
  };
  const saveWorkingConfig = async (
    patch: CliWorkingConfig,
  ): Promise<string | undefined> => {
    if (!options.persistWorkingConfig) return undefined;
    try {
      await options.persistWorkingConfig(patch);
      return undefined;
    } catch (error) {
      return `Default was not saved: ${terminalSafeText(
        error instanceof Error ? error.message : String(error),
      )}`;
    }
  };
  const recentTurns: CliConversationTurn[] = (state.recentTurns ?? []).map(
    ({ role, content }) => ({ role, content }),
  );
  type CopyableAgentResponse = {
    content: string;
    recordedAt?: string;
    sequence: number;
  };
  const readAgentResponses = async (): Promise<CopyableAgentResponse[]> => {
    if (state.sessionId && options.readTranscript) {
      const entries: CliTranscriptPage["entries"] = [];
      let cursor: number | undefined;
      do {
        const page = await options.readTranscript(state.sessionId, {
          limit: 200,
          ...(cursor !== undefined ? { cursor } : {}),
        });
        entries.push(...page.entries);
        cursor = page.nextCursor;
      } while (cursor !== undefined);
      const responses = entries
        .filter((entry) => entry.role === "agent")
        .sort((left, right) => left.sequence - right.sequence)
        .map((entry) => ({
          content: entry.content,
          recordedAt: entry.recordedAt,
          sequence: entry.sequence,
        }));
      if (responses.length > 0) return responses;
    }
    return recentTurns
      .filter((turn) => turn.role === "agent")
      .map((turn, index) => ({
        content: turn.content,
        sequence: index + 1,
      }));
  };
  let pendingInitialPrompt = options.initialPrompt?.trim();
  let appearancePreferences: CliAppearancePreferences = {
    color: options.appearancePreferences?.color ?? terminal.color,
    motion: options.appearancePreferences?.motion ?? true,
    richText:
      options.appearancePreferences?.richText ??
      terminal.richText ??
      false,
    themeId:
      options.appearancePreferences?.themeId ??
      terminal.themeId ??
      DEFAULT_TERMINAL_THEME_ID,
    screenMode: options.appearancePreferences?.screenMode ?? "auto",
  };
  let shortcutSettings = shortcutPreferences(
    options.shortcutPreferences,
  );
  let statuslineSettings = statuslinePreferences(
    options.statuslinePreferences,
  );
  let providerUsageRefresh: Promise<void> | undefined;
  let providerUsageRefreshQueued = false;
  const refreshProviderUsage = (): Promise<void> => {
    if (!options.readProviderUsage) return Promise.resolve();
    if (providerUsageRefresh) {
      providerUsageRefreshQueued = true;
      return providerUsageRefresh;
    }
    const run = async (): Promise<void> => {
      do {
        providerUsageRefreshQueued = false;
        try {
          const snapshot = await options.readProviderUsage!("quota");
          if (snapshot.status !== "unavailable") {
            options.terminal.setProviderUsage?.(snapshot);
          }
        } catch {
          // Keep the last usable snapshot; explicit usage commands report errors.
        }
      } while (providerUsageRefreshQueued);
    };
    providerUsageRefresh = run().finally(() => {
      providerUsageRefresh = undefined;
      if (providerUsageRefreshQueued) {
        providerUsageRefreshQueued = false;
        void refreshProviderUsage();
      }
    });
    return providerUsageRefresh;
  };
  let clipboardSettings = clipboardPreferences(
    options.clipboardPreferences ?? DEFAULT_CLI_CLIPBOARD,
  );
  let capabilityRuntime =
    options.capabilityRuntimeSettings ??
    createDefaultCapabilityRuntimeSettings();
  let appearanceResolution: TerminalAppearanceResolution =
    options.appearanceResolution ?? {
      color: terminal.color,
      motion: appearancePreferences.motion,
      richText: appearancePreferences.richText,
      themeId: appearancePreferences.themeId,
      screenMode: "inline",
    };
  let pendingCommand: InteractiveCommand | undefined;
  let pendingCommandImages: AgentImageInput[] = [];
  let pendingClarificationBasis: PromptUnderstandingBasisV1 | undefined;
  type PendingPrompt = {
    value: string;
    images: AgentImageInput[];
    draft: ComposerDraftSnapshot;
  };
  const pendingPrompts: PendingPrompt[] = [];
  const maxPendingPrompts = 32;
  let pendingPaused = false;
  let pendingComposerDraft: ComposerInitialValue = "";
  const cloneComposerDraft = (
    draft: ComposerDraftSnapshot,
  ): ComposerDraftSnapshot => structuredClone(draft);
  const promptDraft = (
    value: string,
    images: readonly AgentImageInput[] = [],
    draft?: ComposerDraftSnapshot,
  ): ComposerDraftSnapshot => {
    if (draft) return cloneComposerDraft(draft);
    return {
      value,
      cursor: value.length,
      blocks: [],
      images: images.map((image, index) => ({
        id: index + 1,
        image: { ...image },
      })),
    };
  };
  let promptUnderstandingImages: AgentImageInput[] = [];
  if (discardedRestoredAttachmentDraft) {
    write(
      "Restored image clarification was discarded because attachments are not persisted. Please paste the images again.",
    );
  }
  let modelCommandFromSettings = false;
  const backValue = NAVIGATE_BACK_INPUT;
  const pendingText = (): string => {
    if (pendingPrompts.length === 0) {
      return "Pending · no messages are waiting.";
    }
    return [
      `Pending · ${pendingPrompts.length} message${pendingPrompts.length === 1 ? "" : "s"}${pendingPaused ? " · paused" : ""}`,
      ...pendingPrompts.map((message, index) =>
        `  ${index + 1}. ${terminalSafeText(message.value.replace(/\s+/gu, " ").slice(0, 160))}${
          message.images.length > 0 ? ` · ${message.images.length} image${message.images.length === 1 ? "" : "s"}` : ""
        }`
      ),
    ].join("\n");
  };
  const enqueuePrompt = (
    value: string,
    images: readonly AgentImageInput[] = [],
    draft?: ComposerDraftSnapshot,
  ): boolean => {
    const prompt = value.trim();
    if (!prompt) {
      write("A non-empty message is required.");
      return false;
    }
    if (Buffer.byteLength(prompt) > 64 * 1024) {
      write("Message not sent · the 64 KiB prompt limit was exceeded.");
      pendingComposerDraft = promptDraft(value, images, draft);
      return false;
    }
    if (pendingPrompts.length >= maxPendingPrompts) {
      write(`Message not sent · Pending is full (${maxPendingPrompts}).`);
      pendingComposerDraft = promptDraft(value, images, draft);
      return false;
    }
    pendingPrompts.push({
      value: prompt,
      images: images.map((image) => ({ ...image })),
      draft: promptDraft(value, images, draft),
    });
    write(
      `Next · ${pendingPrompts.length} pending${pendingPaused ? " · paused" : ""}`,
    );
    return true;
  };
  const managePending = (value: string): void => {
    const tokens = value.trim().split(/\s+/u).filter(Boolean);
    const operation = tokens[0]?.toLowerCase();
    if (!operation) {
      write(pendingText());
      return;
    }
    if (operation === "clear" && tokens.length === 1) {
      const removed = pendingPrompts.length;
      pendingPrompts.splice(0);
      pendingPaused = false;
      write(`Pending cleared · removed ${removed} message${removed === 1 ? "" : "s"}.`);
      return;
    }
    if (operation === "resume" && tokens.length === 1) {
      if (pendingPrompts.length === 0) {
        pendingPaused = false;
        write("Pending · no messages are waiting.");
        return;
      }
      pendingPaused = false;
      write(`Pending resumed · ${pendingPrompts.length} message${pendingPrompts.length === 1 ? "" : "s"} waiting.`);
      return;
    }
    if (operation === "drop" && tokens.length === 2) {
      const index = Number(tokens[1]);
      if (!Number.isInteger(index) || index < 1 || index > pendingPrompts.length) {
        write("Usage: /pending drop <n>");
        return;
      }
      pendingPrompts.splice(index - 1, 1);
      if (pendingPrompts.length === 0) pendingPaused = false;
      write(`Pending · removed message ${index}.`);
      return;
    }
    write("Usage: /pending [drop <n>|clear|resume]");
  };
  const beginActivity = (
    label: string,
    activityOptions: {
      fallbackRow?: boolean;
      immediate?: boolean;
    } = {},
  ): InlineActivityHandle => {
    if (state.activityDetails === "off") return NOOP_ACTIVITY;
    const activity = beginTerminalActivity(
      terminal,
      label,
      activityOptions,
    );
    return {
      update: activity.update,
      settle: (nextLabel) => {
        if (state.activityDetails === "off") {
          activity.stop();
        } else {
          activity.settle(nextLabel);
        }
      },
      fail: activity.fail,
      stop: activity.stop,
    };
  };
  const loadSessionPage = async (
    cursor?: string,
  ): Promise<CliSessionPage | undefined> =>
    options.listSessions?.({
      repositoryPath: state.repositoryPath,
      limit: 20,
      ...(cursor ? { cursor } : {}),
    });
  const selectSavedSession = async (
    prompt: string,
  ): Promise<
    | { kind: "selected"; sessionId: string }
    | { kind: "empty" }
    | { kind: "unavailable"; page: CliSessionPage }
    | { kind: "cancelled" }
  > => {
    let page = await loadSessionPage();
    if (!page || page.entries.length === 0) return { kind: "empty" };
    if (!terminal.select) return { kind: "unavailable", page };

    const entries: CliSessionCatalogEntry[] = [];
    const sessionIds = new Set<string>();
    const appendPage = (nextPage: CliSessionPage): void => {
      for (const entry of nextPage.entries) {
        if (sessionIds.has(entry.sessionId)) continue;
        sessionIds.add(entry.sessionId);
        entries.push(entry);
      }
    };
    appendPage(page);

    for (;;) {
      const loadMoreValue = "__orynt_sessions_load_more__";
      const choices = entries.map((entry) =>
        sessionComposerChoice(entry, state.sessionId)
      );
      if (page.nextCursor) {
        choices.push({
          value: loadMoreValue,
          label: "Load more sessions",
          description: `${entries.length} sessions loaded`,
          details: ["Fetch the next page without losing loaded sessions"],
        });
      }
      const selected = await terminal.select(prompt, choices, state.sessionId);
      if (!selected || selected === NAVIGATE_BACK_INPUT) {
        return { kind: "cancelled" };
      }
      if (selected !== loadMoreValue) {
        return { kind: "selected", sessionId: selected };
      }
      if (!page.nextCursor) continue;
      const nextPage = await loadSessionPage(page.nextCursor);
      if (!nextPage || nextPage.entries.length === 0) {
        page = { entries: [], issues: nextPage?.issues };
        continue;
      }
      appendPage(nextPage);
      page = nextPage;
    }
  };

  const saveActivityDetails = async (
    level: ActivityDetailLevel,
    _feedback: "command" | "interactive" = "command",
  ): Promise<boolean> => {
    try {
      if (!options.persistActivityDetails) {
        throw new Error("persistent activity detail settings are unavailable");
      }
      await options.persistActivityDetails(level);
    } catch (error) {
      write(
        `Activity details were not saved: ${terminalSafeText(
          error instanceof Error ? error.message : String(error),
        )}`,
      );
      return false;
    }
    if (!options.activityDetailsOverride) state.activityDetails = level;
    notifySuccess(
      options.activityDetailsOverride
        ? `Saved · Activity ${activityDetailLabel(level)}; ${activityDetailLabel(options.activityDetailsOverride)} override remains active`
        : `Saved · Activity ${activityDetailLabel(level)}`,
      options.activityDetailsOverride
        ? `Activity details saved as ${activityDetailLabel(level)}. The ${activityDetailLabel(options.activityDetailsOverride)} launch override remains active.`
        : `Activity details set to ${activityDetailLabel(level)}.`,
    );
    return true;
  };

  const saveSkillRouting = async (
    next: "auto_trusted" | "manual",
  ): Promise<boolean> => {
    try {
      if (!options.persistSkillRouting) {
        throw new Error("persistent skill routing settings are unavailable");
      }
      await options.persistSkillRouting(next);
      skillRouting = next;
      notifySuccess(
        `Saved · Agent Skill auto-selection ${next === "auto_trusted" ? "enabled" : "disabled"}`,
        `Agent Skill auto-selection ${next === "auto_trusted" ? "enabled" : "disabled"}.`,
      );
      return true;
    } catch (error) {
      write(
        `Agent Skill auto-selection was not saved: ${terminalSafeText(
          error instanceof Error ? error.message : String(error),
        )}`,
      );
      return false;
    }
  };

  const saveAppearanceSetting = async (
    setting: "color" | "motion" | "rich-text",
    enabled: boolean,
    _feedback: "command" | "interactive" = "command",
  ): Promise<boolean> => {
    const preferenceKey = setting === "rich-text" ? "richText" : setting;
    try {
      if (!options.persistAppearance) {
        throw new Error("persistent appearance settings are unavailable");
      }
      await options.persistAppearance({ [preferenceKey]: enabled });
    } catch (error) {
      write(
        `Appearance setting was not saved: ${terminalSafeText(
          error instanceof Error ? error.message : String(error),
        )}`,
      );
      return false;
    }
    appearancePreferences = {
      ...appearancePreferences,
      [preferenceKey]: enabled,
    };
    appearanceResolution =
      options.applyAppearance?.(appearancePreferences) ?? {
        ...appearanceResolution,
        color:
          appearancePreferences.color &&
          appearanceResolution.colorOverride === undefined,
        motion:
          appearancePreferences.motion &&
          appearanceResolution.motionOverride === undefined,
        richText:
          appearancePreferences.richText &&
          appearanceResolution.richTextOverride === undefined,
      };
    terminal.color = appearanceResolution.color;
    terminal.themeId = appearanceResolution.themeId;
    terminal.richText = appearanceResolution.richText;
    designSystem.update(appearanceResolution);
    theme = designSystem.theme;
    const override =
      setting === "color"
        ? appearanceResolution.colorOverride
        : setting === "motion"
          ? appearanceResolution.motionOverride
          : appearanceResolution.richTextOverride;
    const effective =
      setting === "color"
        ? appearanceResolution.color
        : setting === "motion"
          ? appearanceResolution.motion
          : appearanceResolution.richText;
    const label =
      setting === "color"
        ? "Color"
        : setting === "motion"
          ? "Motion"
          : "Rich text";
    notifySuccess(
      override && enabled !== effective
        ? `Saved · ${label} ${settingState(enabled)}; ${override} keeps it ${settingState(effective)}`
        : `Saved · ${label} ${enabled ? "enabled" : "disabled"}`,
      override && enabled !== effective
        ? `${label} saved ${settingState(enabled)}. ${override} keeps it ${settingState(effective)} for this launch.`
        : `${label} ${enabled ? "enabled" : "disabled"}.`,
    );
    return true;
  };

  const saveThemeSetting = async (
    themeId: TerminalThemeId,
    _feedback: "command" | "interactive" = "command",
  ): Promise<boolean> => {
    try {
      if (!options.persistAppearance) {
        throw new Error("persistent appearance settings are unavailable");
      }
      await options.persistAppearance({ themeId });
    } catch (error) {
      write(
        `Theme was not saved: ${terminalSafeText(
          error instanceof Error ? error.message : String(error),
        )}`,
      );
      return false;
    }
    appearancePreferences = { ...appearancePreferences, themeId };
    appearanceResolution =
      options.applyAppearance?.(appearancePreferences) ?? {
        ...appearanceResolution,
        themeId:
          appearanceResolution.themeOverride === undefined
            ? themeId
            : appearanceResolution.themeId,
      };
    terminal.color = appearanceResolution.color;
    terminal.themeId = appearanceResolution.themeId;
    terminal.richText = appearanceResolution.richText;
    designSystem.update(appearanceResolution);
    theme = designSystem.theme;
    if (
      appearanceResolution.themeOverride &&
      themeId !== appearanceResolution.themeId
    ) {
      notifySuccess(
        `Saved · Theme ${terminalThemeDefinition(themeId).label}; ${appearanceResolution.themeOverride} keeps ${terminalThemeDefinition(appearanceResolution.themeId).label}`,
        `Theme saved as ${terminalThemeDefinition(themeId).label}. ${appearanceResolution.themeOverride} keeps ${terminalThemeDefinition(appearanceResolution.themeId).label} active for this launch.`,
      );
    } else {
      notifySuccess(
        `Saved · Theme ${terminalThemeDefinition(themeId).label}`,
        `Theme set to ${terminalThemeDefinition(themeId).label}.`,
      );
    }
    return true;
  };

  const saveScreenSetting = async (
    screenMode: TerminalScreenMode,
    _feedback: "command" | "interactive" = "command",
  ): Promise<boolean> => {
    try {
      if (!options.persistAppearance) {
        throw new Error("persistent appearance settings are unavailable");
      }
      await options.persistAppearance({ screenMode });
    } catch (error) {
      write(
        `Screen mode was not saved: ${terminalSafeText(
          error instanceof Error ? error.message : String(error),
        )}`,
      );
      return false;
    }
    appearancePreferences = { ...appearancePreferences, screenMode };
    notifySuccess(
      `Saved · Screen mode ${screenMode}; applies next launch`,
      `Screen mode saved as ${screenMode}. It will apply on the next launch.`,
    );
    return true;
  };

  const saveShortcutSettings = async (
    next: CliShortcutPreferences,
    _feedback: "command" | "interactive" = "interactive",
  ): Promise<boolean> => {
    try {
      validateShortcutPreferences(next);
      if (!options.persistShortcuts) {
        throw new Error("persistent shortcut settings are unavailable");
      }
      await options.persistShortcuts(next);
    } catch (error) {
      write(
        `Shortcut setting was not saved: ${terminalSafeText(
          error instanceof Error ? error.message : String(error),
        )}`,
      );
      return false;
    }
    shortcutSettings = shortcutPreferences(next);
    options.applyShortcuts?.(shortcutSettings);
    notifySuccess(
      `Saved · Shortcuts clear ${shortcutListLabel(shortcutSettings.clear)}, undo ${shortcutListLabel(shortcutSettings.undo)}, redo ${shortcutListLabel(shortcutSettings.redo)}`,
      `Shortcuts · clear ${shortcutListLabel(shortcutSettings.clear)} · undo ${shortcutListLabel(shortcutSettings.undo)} · redo ${shortcutListLabel(shortcutSettings.redo)}`,
    );
    return true;
  };

  const saveStatuslineSettings = async (
    next: CliStatuslinePreferences,
    _feedback: "command" | "interactive" = "interactive",
  ): Promise<boolean> => {
    try {
      const normalized = statuslinePreferences(next);
      if (!options.persistStatusline) {
        throw new Error("persistent statusline settings are unavailable");
      }
      await options.persistStatusline(normalized);
      statuslineSettings = normalized;
      options.applyStatusline?.(statuslineSettings);
    } catch (error) {
      write(
        `Statusline setting was not saved: ${terminalSafeText(
          error instanceof Error ? error.message : String(error),
        )}`,
      );
      return false;
    }
    notifySuccess(
      `Saved · Statusline ${statuslineSettings.enabled ? "on" : "off"}`,
      `Statusline · ${statuslineSettings.enabled ? "on" : "off"} · profile ${settingState(statuslineSettings.profile)} · role ${settingState(statuslineSettings.role)} · model ${settingState(statuslineSettings.model)} · effort ${settingState(statuslineSettings.effort)} · context ${settingState(statuslineSettings.context)} (${statuslineSettings.contextFormat}) · quota ${settingState(statuslineSettings.quota)} · shortcuts ${settingState(statuslineSettings.shortcuts)}`,
    );
    return true;
  };

  const saveClipboardSettings = async (
    next: CliClipboardPreferences,
    _feedback: "command" | "interactive" = "interactive",
  ): Promise<boolean> => {
    const normalized = clipboardPreferences(next);
    try {
      if (!options.persistClipboard) {
        throw new Error("persistent clipboard settings are unavailable");
      }
      await options.persistClipboard(normalized);
      clipboardSettings = normalized;
      options.applyClipboard?.(clipboardSettings);
    } catch (error) {
      write(
        `Clipboard setting was not saved: ${terminalSafeText(
          error instanceof Error ? error.message : String(error),
        )}`,
      );
      return false;
    }
    notifySuccess(
      `Saved · Copy on select ${settingState(clipboardSettings.copyOnSelect)}`,
      `Clipboard · copy on select ${settingState(clipboardSettings.copyOnSelect)}.`,
    );
    return true;
  };

  const saveProfileSetting = async (
    profile: OrchestrationProfile,
    feedback: "command" | "interactive" = "command",
  ): Promise<boolean> => {
    const warning = await saveWorkingConfig({
      orchestrationProfile: profile,
    });
    if (warning) {
      write(warning);
      return false;
    }
    setProfile(state, profile);
    if (!await persist()) {
      write(
        "Agent setting remains active only for this non-resumable session.",
      );
      return false;
    }
    if (terminal.notify) {
      terminal.notify(
        `Saved · Orchestration profile ${profile.preset}`,
        "success",
      );
    } else if (feedback === "command") {
      write(orchestrationProfileText(profile, terminal.width));
    }
    return true;
  };

  const saveCapabilityRuntimeSetting = async (
    next: CapabilityRuntimeSettingsV1,
  ): Promise<boolean> => {
    try {
      if (!options.persistCapabilityRuntime) {
        throw new Error("persistent capability settings are unavailable");
      }
      await options.persistCapabilityRuntime(next);
      capabilityRuntime = next;
      notifySuccess("Saved · Intelligence settings");
      return true;
    } catch (error) {
      write(
        `Intelligence setting was not saved: ${terminalSafeText(
          error instanceof Error ? error.message : String(error),
        )}`,
      );
      return false;
    }
  };

  const reviewSettingsChange = async (
    prompt: string,
    label: string,
    details: readonly string[],
  ): Promise<"apply" | "back" | "exit"> => {
    if (!terminal.select) return "exit";
    const selected = await terminal.select(
      prompt,
      [
        {
          value: "apply",
          label: `Apply ${label}`,
          description: "Save for this session and future launches.",
          details,
        },
      ],
    );
    if (selected === INTERRUPTED_INPUT || !selected) return "exit";
    return selected === backValue ? "back" : "apply";
  };

  const applyNextMinimumTier = (value: string): boolean => {
    const normalized = value.trim().toLowerCase();
    if (normalized === "auto") {
      state.nextMinimumTier = undefined;
      write("Next request model tier set to Auto.");
      return true;
    }
    if (!["light", "medium", "heavy"].includes(normalized)) {
      return false;
    }
    state.nextMinimumTier = normalized as ModelTier;
    write(
      `Next request minimum model tier set to ${normalized}. Safety routing may raise it.`,
    );
    return true;
  };

  const runTierPicker = async (): Promise<void> => {
    if (!terminal.isTTY || !terminal.select) {
      write("Usage: /tier <auto|light|medium|heavy>");
      return;
    }
    const selected = await terminal.select(
      "Next request tier › ",
      [
        {
          value: "auto",
          label: "Auto",
          description: "Let task and safety routing choose the minimum.",
          details: [
            "Scope · applies to the next request only",
            "Safety · task risk may raise the selected tier",
          ],
        },
        {
          value: "light",
          label: "Light",
          description: "At least the bounded read-only tier.",
          details: [
            "Scope · applies to the next request only",
            "Safety · mutable or risky work routes higher",
          ],
        },
        {
          value: "medium",
          label: "Medium",
          description: "At least the planning and mutable-work tier.",
          details: [
            "Scope · applies to the next request only",
            "Safety · sensitive or recovery work routes higher",
          ],
        },
        {
          value: "heavy",
          label: "Heavy",
          description: "Use the strongest tier as the minimum.",
          details: [
            "Scope · applies to the next request only",
            "Reset · Auto resumes after that request",
          ],
        },
      ],
      state.nextMinimumTier ?? "auto",
    );
    if (
      selected === INTERRUPTED_INPUT ||
      !selected ||
      selected === backValue
    ) {
      return;
    }
    if (!applyNextMinimumTier(selected)) {
      write("Usage: /tier <auto|light|medium|heavy>");
    }
  };

  const runAgentSettings = async (): Promise<"back" | "exit"> => {
    if (!terminal.select) return "exit";
    for (;;) {
      let currentProfile =
        state.orchestrationProfile ??
        createLegacySingleModelProfile(state.modelId, state.thinkingEffort);
      const selected = await terminal.select(
        "Agent › ",
        [
          {
            value: "auto",
            label: "Auto",
            description: "Choose a deterministic preset from task risk.",
            details: profileChoiceDetails(presetProfile("auto")),
          },
          {
            value: "quality",
            label: "Quality",
            description: "Strongest coordinator and review profile.",
            details: profileChoiceDetails(presetProfile("quality")),
          },
          {
            value: "balanced",
            label: "Balanced",
            description: "Default cost, latency, and verification balance.",
            details: profileChoiceDetails(presetProfile("balanced")),
          },
          {
            value: "economy",
            label: "Economy",
            description: "Lower-cost models with failure-only strong review.",
            details: profileChoiceDetails(presetProfile("economy")),
          },
          {
            value: "advanced",
            label: "Customize profile…",
            description: "Roles, review policy, helpers, depth, and recovery.",
            details: [
              "Impact · changes selected controls and turns the profile into Custom",
              "Control · roles, review policy, helpers, depth, and recovery",
              "Safety · implementer is the only role allowed to write",
              "Review · the candidate is shown before anything is saved",
            ],
          },
        ],
        currentProfile.preset,
      );
      if (selected === INTERRUPTED_INPUT || !selected) return "exit";
      if (selected === backValue) return "back";
      if (
        EDITABLE_PRESETS.includes(
          selected as (typeof EDITABLE_PRESETS)[number],
        )
      ) {
        if (selected === currentProfile.preset) continue;
        const nextProfile = presetProfile(
          selected as (typeof EDITABLE_PRESETS)[number],
        );
        const review = await reviewSettingsChange(
          `Review ${selected} › `,
          selected,
          profileChoiceDetails(nextProfile),
        );
        if (review === "exit") return "exit";
        if (review === "apply") {
          await saveProfileSetting(nextProfile, "interactive");
        }
        continue;
      }
      if (selected !== "advanced") {
        continue;
      }

      roleSelection: for (;;) {
        const selectedRole = await terminal.select(
          "Customize profile › ",
          [
            ...ORCHESTRATION_ROLES.map((role) => ({
              value: role,
              label: `Role · ${role}`,
              description:
                role === "implementer"
                  ? "The only role allowed to write."
                  : "Read-only orchestration role.",
            })),
            {
              value: "review-policy",
              label: `Review policy · ${currentProfile.reviewerPolicy.replaceAll("_", " ")}`,
              description: "Choose when the reviewer runs.",
            },
            {
              value: "helpers",
              label: `Read-only helpers · ${currentProfile.maxReadOnlyHelpers}`,
              description: "Maximum parallel helper lanes.",
            },
            {
              value: "depth",
              label: `Orchestration depth · ${currentProfile.maxDepth}`,
              description: "Maximum bounded task depth.",
            },
            {
              value: "recovery",
              label: `Recovery attempts · ${currentProfile.maxRecoveryAttempts}`,
              description: "Retry a failed task at most once.",
            },
          ],
        );
        if (selectedRole === INTERRUPTED_INPUT || !selectedRole) return "exit";
        if (selectedRole === backValue) break roleSelection;
        if (
          selectedRole === "review-policy" ||
          selectedRole === "helpers" ||
          selectedRole === "depth" ||
          selectedRole === "recovery"
        ) {
          const fieldChoices: Record<string, ComposerChoice[]> = {
            "review-policy": [
              { value: "always", label: "Always", description: "Review every completed run." },
              { value: "conditional", label: "Conditional", description: "Review when risk or verification warrants it." },
              { value: "failure_only", label: "Failure only", description: "Use strong review only after verification fails." },
            ],
            helpers: [0, 1, 2].map((value) => ({
              value: String(value),
              label: String(value),
              description: value === 0 ? "Disable helper lanes." : `Allow up to ${value} read-only helper lane${value === 1 ? "" : "s"}.`,
            })),
            depth: [1, 2].map((value) => ({
              value: String(value),
              label: String(value),
              description: `Allow orchestration tasks through depth ${value}.`,
            })),
            recovery: [0, 1].map((value) => ({
              value: String(value),
              label: String(value),
              description: value === 0 ? "Do not retry failed tasks." : "Allow one bounded recovery attempt.",
            })),
          };
          const currentValue =
            selectedRole === "review-policy"
              ? currentProfile.reviewerPolicy
              : selectedRole === "helpers"
                ? String(currentProfile.maxReadOnlyHelpers)
                : selectedRole === "depth"
                  ? String(currentProfile.maxDepth)
                  : String(currentProfile.maxRecoveryAttempts);
          const selectedValue = await terminal.select(
            `${
              selectedRole === "review-policy"
                ? "Review policy"
                : selectedRole === "helpers"
                  ? "Read-only helpers"
                  : selectedRole === "depth"
                    ? "Orchestration depth"
                    : "Recovery attempts"
            } › `,
            fieldChoices[selectedRole] ?? [],
            currentValue,
          );
          if (selectedValue === INTERRUPTED_INPUT || !selectedValue) return "exit";
          if (selectedValue === backValue || selectedValue === currentValue) {
            continue roleSelection;
          }
          const nextProfile = structuredClone(currentProfile);
          nextProfile.preset = "custom";
          if (selectedRole === "review-policy") {
            nextProfile.reviewerPolicy =
              selectedValue as OrchestrationProfile["reviewerPolicy"];
          } else if (selectedRole === "helpers") {
            nextProfile.maxReadOnlyHelpers = Number(selectedValue);
          } else if (selectedRole === "depth") {
            nextProfile.maxDepth = Number(selectedValue);
          } else {
            nextProfile.maxRecoveryAttempts = Number(selectedValue);
          }
          const review = await reviewSettingsChange(
            "Review profile control › ",
            "profile control",
            profileChoiceDetails(nextProfile),
          );
          if (review === "exit") return "exit";
          if (review === "apply") {
            if (await saveProfileSetting(nextProfile, "interactive")) {
              currentProfile = nextProfile;
            }
          }
          continue roleSelection;
        }
        const role = roleName(selectedRole);
        if (!role) continue;
        if (!loadModelCatalog) {
          write("Advanced model discovery is unavailable.");
          continue roleSelection;
        }

        let models: CliModelOption[];
        const activity = beginActivity("Discovering models");
        try {
          models = await loadModelCatalog();
          activity.settle("Model discovery complete");
        } catch (error) {
          activity.fail("Model discovery failed");
          write(
            terminalSafeText(
              error instanceof Error ? error.message : String(error),
            ),
          );
          break roleSelection;
        }

        modelSelection: for (;;) {
          const profile =
            state.orchestrationProfile ??
            createLegacySingleModelProfile(
              state.modelId,
              state.thinkingEffort,
            );
          const selectedModelId = await terminal.select(
            "Model › ",
            [
              ...models.map((model) => ({
                value: model.id,
                label: model.label,
                description: modelChoiceDescription(model),
              })),
            ],
            profile.roles[role].modelId,
          );
          if (selectedModelId === INTERRUPTED_INPUT || !selectedModelId) {
            return "exit";
          }
          if (selectedModelId === backValue) continue roleSelection;
          const model = models.find(
            (candidate) => candidate.id === selectedModelId,
          );
          if (!model) continue;
          const efforts =
            model.supportedThinkingEfforts.length > 0
              ? model.supportedThinkingEfforts
              : [...VALID_EFFORTS];
          const selectedEffort = await terminal.select(
            "Effort › ",
            [
              ...efforts.map((effort) => ({
                value: effort,
                label: effort,
              })),
            ],
            profile.roles[role].thinkingEffort,
          );
          if (selectedEffort === INTERRUPTED_INPUT || !selectedEffort) {
            return "exit";
          }
          if (selectedEffort === backValue) continue modelSelection;
          if (!VALID_EFFORTS.has(selectedEffort as ThinkingEffort)) continue;
          const nextProfile = structuredClone(profile);
          nextProfile.preset = "custom";
          nextProfile.roles[role] = {
            ...nextProfile.roles[role],
            providerId: model.providerId ?? "codex-cli",
            modelId: model.id,
            thinkingEffort: selectedEffort as ThinkingEffort,
          };
          const review = await reviewSettingsChange(
            `Review ${role} › `,
            `${role} override`,
            [
              `Impact · ${role} changes from ${profile.roles[role].modelId}/${profile.roles[role].thinkingEffort} to ${model.id}/${selectedEffort}; preset becomes Custom`,
              "Scope · applies to this session and future launches",
              role === "implementer"
                ? "Authority · this role may write within approved repository boundaries"
                : "Authority · this orchestration role remains read-only",
              "Control · Left or Esc returns without saving",
            ],
          );
          if (review === "exit") return "exit";
          if (review === "back") continue modelSelection;
          await saveProfileSetting(nextProfile, "interactive");
          break roleSelection;
        }
      }
    }
  };

  const runInteractiveSettings = async (): Promise<void> => {
    if (!terminal.select) return;
    for (;;) {
      const category = await terminal.select(
        "Settings › ",
        [
          {
            value: "agent",
            label: "Agent",
            description: "Orchestration profile, role models, and effort.",
            details: [
              "Impact · controls model quality, latency, review, and execution limits",
              "Safety · every Agent change is reviewed before it is saved",
            ],
          },
          {
            value: "appearance",
            label: "Appearance",
            description: "Rich text, semantic color, and inline motion.",
            details: [
              "Impact · visual-only preferences apply immediately",
              "Scope · saved for future launches; launch overrides remain visible",
            ],
          },
          {
            value: "intelligence",
            label: "Intelligence",
            description: "Capability routing, auto improve, and subagents.",
            details: [
              "Impact · controls capability selection and parallel work",
              "Safety · every Intelligence change is reviewed before it is saved",
            ],
          },
          {
            value: "clipboard",
            label: "Clipboard",
            description: "Choose whether mouse selection copies automatically.",
            details: [
              `Copy on select · ${settingState(clipboardSettings.copyOnSelect)}`,
              "Default · off, so selecting text does not replace the clipboard",
              "Control · Ctrl+Shift+C always copies the active selection",
            ],
          },
          {
            value: "shortcuts",
            label: "Shortcuts",
            description: "Draft clearing, undo, and redo bindings.",
            details: [
              `Clear · ${shortcutListLabel(shortcutSettings.clear)}`,
              `Undo/Redo · ${shortcutListLabel(shortcutSettings.undo)} / ${shortcutListLabel(shortcutSettings.redo)}`,
              "Scope · composer drafts only; selection and approval keys stay fixed",
            ],
          },
          {
            value: "statusline",
            label: "Statusline",
            description: "Choose which runtime facts appear below the prompt.",
            details: [
              `State · ${statuslineSettings.enabled ? "On" : "Off"} · model ${settingState(statuslineSettings.model)} · role ${settingState(statuslineSettings.role)}`,
              "Accuracy · active roles use the resolved model and effort",
              "Scope · busy safety controls remain visible",
            ],
          },
          {
            value: "activity",
            label: "Activity details",
            description: "Choose how much progress remains in chat.",
            details: [
              "Impact · changes progress detail, not the persistent audit record",
              "Safety · approvals, warnings, errors, and final results remain visible",
            ],
          },
        ],
      );
      if (
        category === INTERRUPTED_INPUT ||
        !category ||
        category === backValue
      ) {
        return;
      }
      if (category === "agent") {
        const result = await runAgentSettings();
        if (result === "exit") return;
        continue;
      }
      if (category === "appearance") {
        appearanceMenu: for (;;) {
          const setting = await terminal.select(
            "Appearance › ",
            [
              {
                value: "screen",
                label: `Screen · ${appearancePreferences.screenMode}`,
                description: "Fullscreen viewport or terminal-native scrollback.",
                details: [
                  "Impact · fullscreen owns a clean resizable viewport with chat history",
                  "Scope · saved for the next launch",
                ],
              },
              {
                value: "theme",
                label: `Theme · ${terminalThemeDefinition(appearancePreferences.themeId).label}`,
                description: "Terminal color and syntax palette.",
                details: [
                  "Impact · applies immediately across new terminal output",
                  "Scope · saved for future launches; --theme remains authoritative",
                ],
              },
              {
                value: "color",
                label: `Color · ${settingState(appearancePreferences.color)}`,
                description: "Semantic ANSI color for roles and status.",
                details: [
                  "Impact · applies immediately to prompts, roles, and status",
                  "Scope · saved for future launches",
                ],
              },
              {
                value: "motion",
                label: `Motion · ${settingState(appearancePreferences.motion)}`,
                description: "Inline activity animation.",
                details: [
                  "Impact · controls transient spinners and activity animation",
                  "Scope · saved for future launches",
                ],
              },
              {
                value: "rich-text",
                label: `Rich text · ${settingState(appearancePreferences.richText)}`,
                description:
                  "Markdown emphasis, code syntax, and repository paths.",
                details: [
                  "Impact · formats Markdown, code, and paths in conversation output",
                  "Scope · saved for future launches",
                ],
              },
            ],
          );
          if (setting === INTERRUPTED_INPUT || !setting) return;
          if (setting === backValue) break appearanceMenu;
          if (setting === "theme") {
            const selectedTheme = await terminal.select(
              "Theme › ",
              TERMINAL_THEMES.map((candidate) => ({
                value: candidate.id,
                label: candidate.label,
                description: candidate.description,
              })),
              appearancePreferences.themeId,
            );
            if (selectedTheme === INTERRUPTED_INPUT || !selectedTheme) return;
            if (selectedTheme === backValue) continue appearanceMenu;
            const candidate = TERMINAL_THEMES.find(
              (item) => item.id === selectedTheme,
            );
            if (
              candidate &&
              candidate.id !== appearancePreferences.themeId
            ) {
              await saveThemeSetting(candidate.id, "interactive");
            }
            continue appearanceMenu;
          }
          if (setting === "screen") {
            const selectedMode = await terminal.select(
              "Screen › ",
              [
                { value: "auto", label: "Auto", description: "Fullscreen on capable interactive terminals." },
                { value: "fullscreen", label: "Fullscreen", description: "Own the viewport and provide internal chat scrolling." },
                { value: "inline", label: "Inline", description: "Keep terminal-native scrollback compatibility." },
              ],
              appearancePreferences.screenMode,
            );
            if (selectedMode === INTERRUPTED_INPUT || !selectedMode) return;
            if (selectedMode === backValue) continue appearanceMenu;
            if (
              ["auto", "fullscreen", "inline"].includes(selectedMode) &&
              selectedMode !== appearancePreferences.screenMode
            ) {
              await saveScreenSetting(
                selectedMode as TerminalScreenMode,
                "interactive",
              );
            }
            continue appearanceMenu;
          }
          if (
            setting !== "color" &&
            setting !== "motion" &&
            setting !== "rich-text"
          ) {
            continue;
          }
          const current =
            setting === "color"
              ? appearancePreferences.color
              : setting === "motion"
                ? appearancePreferences.motion
                : appearancePreferences.richText;
          const label =
            setting === "color"
              ? "Color"
              : setting === "motion"
                ? "Motion"
                : "Rich text";
          const enabled = await terminal.select(
            `${label} › `,
            [
              {
                value: "on",
                label: "On",
                details: [`Impact · enable ${label.toLocaleLowerCase()} immediately`],
              },
              {
                value: "off",
                label: "Off",
                details: [`Impact · disable ${label.toLocaleLowerCase()} immediately`],
              },
            ],
            settingState(current),
          );
          if (enabled === INTERRUPTED_INPUT || !enabled) return;
          if (enabled === backValue) continue appearanceMenu;
          if ((enabled === "on") !== current) {
            await saveAppearanceSetting(
              setting,
              enabled === "on",
              "interactive",
            );
          }
        }
        continue;
      }
      if (category === "clipboard") {
        const enabled = await terminal.select(
          "Copy on select › ",
          [
            {
              value: "off",
              label: "Off",
              description: "Use Ctrl+Shift+C to copy the selected chat text.",
            },
            {
              value: "on",
              label: "On",
              description: "Copy selected chat text when the mouse button is released.",
            },
          ],
          settingState(clipboardSettings.copyOnSelect),
        );
        if (enabled === INTERRUPTED_INPUT || !enabled) return;
        if (enabled === backValue) continue;
        await saveClipboardSettings({
          copyOnSelect: enabled === "on",
        });
        continue;
      }
      if (category === "shortcuts") {
        shortcutMenu: for (;;) {
          const action = await terminal.select(
            "Shortcuts › ",
            [
              {
                value: "clear",
                label: `Clear draft · ${shortcutListLabel(shortcutSettings.clear)}`,
                description: "Clear a non-empty prompt without exiting.",
              },
              {
                value: "undo",
                label: `Undo · ${shortcutListLabel(shortcutSettings.undo)}`,
                description: "Restore the previous draft edit group.",
              },
              {
                value: "redo",
                label: `Redo · ${shortcutListLabel(shortcutSettings.redo)}`,
                description: "Reapply the most recently undone edit group.",
              },
              {
                value: "reset",
                label: "Restore shortcut defaults",
                description: "Esc/Ctrl+C clear · Ctrl+Z undo · Ctrl+Y redo.",
              },
            ],
          );
          if (action === INTERRUPTED_INPUT || !action) return;
          if (action === backValue) break shortcutMenu;
          if (action === "reset") {
            await saveShortcutSettings(
              structuredClone(DEFAULT_CLI_SHORTCUTS),
            );
            continue shortcutMenu;
          }
          if (!["clear", "undo", "redo"].includes(action)) continue;
          const shortcutAction = action as ComposerShortcutAction;
          const usedByOtherActions = new Set(
            (["clear", "undo", "redo"] as const)
              .filter((candidate) => candidate !== shortcutAction)
              .flatMap((candidate) => shortcutSettings[candidate]),
          );
          const candidates = portableShortcutBindings().filter(
            (binding) => !usedByOtherActions.has(binding),
          );
          const selected = await terminal.select(
            `${shortcutAction === "clear" ? "Clear draft" : shortcutAction === "undo" ? "Undo" : "Redo"} shortcut › `,
            [
              ...(shortcutAction === "clear" &&
              !usedByOtherActions.has("escape") &&
              !usedByOtherActions.has("ctrl+c")
                ? [
                    {
                      value: "escape,ctrl+c",
                      label: "Esc + Ctrl+C",
                      description: "Recommended clear aliases.",
                    },
                  ]
                : []),
              ...candidates.map((binding) => ({
                value: binding,
                label: shortcutListLabel([binding]),
              })),
            ],
            shortcutSettings[shortcutAction].join(","),
          );
          if (selected === INTERRUPTED_INPUT || !selected) return;
          if (selected === backValue) continue shortcutMenu;
          const next = structuredClone(shortcutSettings);
          next[shortcutAction] = selected
            .split(",")
            .map((binding) => normalizeShortcutBinding(binding))
            .filter((binding): binding is NonNullable<typeof binding> =>
              binding !== undefined
            );
          await saveShortcutSettings(next);
        }
        continue;
      }
      if (category === "statusline") {
        statuslineMenu: for (;;) {
          const selected = await terminal.select(
            "Statusline › ",
            [
              ...(
                [
                  ["enabled", "Statusline"],
                  ["profile", "Profile"],
                  ["role", "Role / phase"],
                  ["model", "Resolved model"],
                  ["effort", "Thinking effort"],
                  ["context", "Context usage"],
                  ["quota", "Provider quota"],
                  ["shortcuts", "Idle shortcut hints"],
                ] as const
              ).map(([field, label]) => ({
                value: field,
                label: `${label} · ${settingState(statuslineSettings[field])}`,
                description:
                  field === "shortcuts"
                    ? "Show clear, undo, and redo bindings while idle."
                    : `Toggle ${label.toLocaleLowerCase()} in the prompt footer.`,
              })),
              {
                value: "context-format",
                label: `Context display · ${statuslineSettings.contextFormat}`,
                description: "Show either token counts or percent, never both.",
              },
              {
                value: "reset",
                label: "Restore statusline defaults",
                description: "Keep runtime status concise and hide idle shortcuts.",
              },
            ],
          );
          if (selected === INTERRUPTED_INPUT || !selected) return;
          if (selected === backValue) break statuslineMenu;
          if (selected === "reset") {
            await saveStatuslineSettings(
              structuredClone(DEFAULT_CLI_STATUSLINE),
            );
            continue statuslineMenu;
          }
          if (selected === "context-format") {
            const format = await terminal.select(
              "Context display › ",
              [
                {
                  value: "tokens",
                  label: "Tokens",
                  description: "Show used and maximum context tokens.",
                },
                {
                  value: "percent",
                  label: "Percent",
                  description: "Show one rounded context percentage.",
                },
              ],
              statuslineSettings.contextFormat,
            );
            if (format === INTERRUPTED_INPUT || !format) return;
            if (format === backValue) continue statuslineMenu;
            if (format !== "tokens" && format !== "percent") {
              continue statuslineMenu;
            }
            await saveStatuslineSettings({
              ...statuslineSettings,
              contextFormat: format,
            });
            continue statuslineMenu;
          }
          if (
            ![
              "enabled",
              "profile",
              "role",
              "model",
              "effort",
              "context",
              "quota",
              "shortcuts",
            ].includes(selected)
          ) {
            continue;
          }
          const field = selected as CliStatuslineField;
          const enabled = await terminal.select(
            `${field === "enabled" ? "Statusline" : field} › `,
            [
              { value: "on", label: "On" },
              { value: "off", label: "Off" },
            ],
            settingState(statuslineSettings[field]),
          );
          if (enabled === INTERRUPTED_INPUT || !enabled) return;
          if (enabled === backValue) continue statuslineMenu;
          await saveStatuslineSettings({
            ...statuslineSettings,
            [field]: enabled === "on",
          });
        }
        continue;
      }
      if (category === "intelligence") {
        intelligenceMenu: for (;;) {
          const setting = await terminal.select(
            "Intelligence › ",
            [
              {
                value: "improve",
                label: `Improvement · ${capabilityRuntime.autoImproveMode}`,
                description: "Shadow candidates require explicit review before promotion.",
                details: [
                  "Impact · controls whether improvement candidates run in shadow mode",
                  "Safety · promotion always requires explicit manual review",
                ],
              },
              {
                value: "routing",
                label: `Routing · ${capabilityRuntime.routingMode.replaceAll("_", " ")}`,
                description: "Auto-attach connected healthy read-only capabilities.",
                details: [
                  "Impact · controls automatic selection of healthy capabilities",
                  "Authority · automatic routing never expands beyond read-only",
                ],
              },
              {
                value: "subagents",
                label: `Subagents · ${capabilityRuntime.subagents.mode} · max ${capabilityRuntime.subagents.maxConcurrency}`,
                description: "Run independent bounded lanes concurrently.",
                details: [
                  "Impact · controls parallelism, latency, and model usage",
                  `Limits · max ${capabilityRuntime.subagents.maxConcurrency} concurrent · depth ${capabilityRuntime.subagents.maxDepth}`,
                ],
              },
              {
                value: "customize",
                label: "Customize limits…",
                description: "Capability loading and memory context limits.",
                details: [
                  `Capabilities · ${capabilityRuntime.maxNamespaces} namespaces · ${capabilityRuntime.maxToolsPerNamespace} tools each`,
                  `Memory · ${capabilityRuntime.memoryTopK} results · ${capabilityRuntime.memoryTokenBudget} tokens`,
                  "Safety · every value stays inside bounded runtime limits",
                ],
              },
            ],
          );
          if (setting === INTERRUPTED_INPUT || !setting) return;
          if (setting === backValue) break intelligenceMenu;
          if (setting === "improve") {
            const selected = await terminal.select(
              "Improvement mode › ",
              [
                {
                  value: "shadow_review",
                  label: "Shadow + manual review",
                  details: [
                    "Impact · generate candidates without changing active behavior",
                    "Safety · explicit review is required before promotion",
                  ],
                },
                {
                  value: "off",
                  label: "Off",
                  details: ["Impact · do not generate automatic improvement candidates"],
                },
              ],
              capabilityRuntime.autoImproveMode,
            );
            if (selected === INTERRUPTED_INPUT || !selected) return;
            if (selected === backValue) continue intelligenceMenu;
            const next = {
              ...capabilityRuntime,
              autoImproveMode: selected as CapabilityRuntimeSettingsV1["autoImproveMode"],
            };
            if (next.autoImproveMode === capabilityRuntime.autoImproveMode) continue;
            const review = await reviewSettingsChange(
              "Review improvement › ",
              "improvement setting",
              selected === "shadow_review"
                ? [
                    "Impact · generate shadow candidates for later review",
                    "Safety · candidates cannot promote themselves",
                    "Scope · applies to this session and future launches",
                  ]
                : [
                    "Impact · stop generating automatic improvement candidates",
                    "Scope · applies to this session and future launches",
                  ],
            );
            if (review === "exit") return;
            if (review === "apply") await saveCapabilityRuntimeSetting(next);
            continue;
          }
          if (setting === "routing") {
            const selected = await terminal.select(
              "Capability routing › ",
              [
                {
                  value: "auto_read_only",
                  label: "Auto read-only",
                  details: [
                    "Impact · attach connected healthy capabilities when relevant",
                    "Authority · routing remains read-only and cannot grant access",
                  ],
                },
                {
                  value: "off",
                  label: "Off",
                  details: ["Impact · capabilities must be selected explicitly"],
                },
              ],
              capabilityRuntime.routingMode,
            );
            if (selected === INTERRUPTED_INPUT || !selected) return;
            if (selected === backValue) continue intelligenceMenu;
            const next = {
              ...capabilityRuntime,
              routingMode: selected as CapabilityRuntimeSettingsV1["routingMode"],
            };
            if (next.routingMode === capabilityRuntime.routingMode) continue;
            const review = await reviewSettingsChange(
              "Review routing › ",
              "routing setting",
              selected === "auto_read_only"
                ? [
                    "Impact · automatically attach relevant healthy capabilities",
                    "Authority · never expands access beyond read-only",
                    "Scope · applies to this session and future launches",
                  ]
                : [
                    "Impact · require explicit capability selection",
                    "Scope · applies to this session and future launches",
                  ],
            );
            if (review === "exit") return;
            if (review === "apply") await saveCapabilityRuntimeSetting(next);
            continue;
          }
          if (setting === "subagents") {
            subagentMenu: for (;;) {
              const subagentSetting = await terminal.select(
                "Subagents › ",
                [
                  {
                    value: "mode",
                    label: `Mode · ${capabilityRuntime.subagents.mode.replaceAll("_", " ")}`,
                    description: "Choose when parallel lanes may run.",
                    details: ["Authority · repository and approval boundaries remain unchanged"],
                  },
                  {
                    value: "concurrency",
                    label: `Maximum concurrent · ${capabilityRuntime.subagents.maxConcurrency}`,
                    description: "Bound simultaneous subagent lanes.",
                    details: ["Limit · supported range 1–4 · delegation depth remains 1"],
                  },
                ],
              );
              if (subagentSetting === INTERRUPTED_INPUT || !subagentSetting) return;
              if (subagentSetting === backValue) break subagentMenu;
              const selectedValue =
                subagentSetting === "mode"
                  ? await terminal.select(
                      "Subagent mode › ",
                      [
                        {
                          value: "adaptive",
                          label: "Adaptive",
                          details: ["Impact · use bounded parallel lanes when task structure benefits"],
                        },
                        {
                          value: "read_only",
                          label: "Read-only only",
                          details: ["Authority · parallel lanes may inspect but never write"],
                        },
                        {
                          value: "off",
                          label: "Off",
                          details: ["Impact · keep all work in the coordinator lane"],
                        },
                      ],
                      capabilityRuntime.subagents.mode,
                    )
                  : await terminal.select(
                      "Maximum concurrent subagents › ",
                      [1, 2, 3, 4].map((value) => ({
                        value: String(value),
                        label: String(value),
                        details: [
                          `Impact · allow at most ${value} concurrent subagent${value === 1 ? "" : "s"}`,
                          "Limit · delegation depth remains 1",
                        ],
                      })),
                      String(capabilityRuntime.subagents.maxConcurrency),
                    );
              if (selectedValue === INTERRUPTED_INPUT || !selectedValue) return;
              if (selectedValue === backValue) continue subagentMenu;
              const next = {
                ...capabilityRuntime,
                subagents: {
                  ...capabilityRuntime.subagents,
                  ...(subagentSetting === "mode"
                    ? {
                        mode:
                          selectedValue as CapabilityRuntimeSettingsV1["subagents"]["mode"],
                      }
                    : { maxConcurrency: Number(selectedValue) }),
                },
              };
              if (
                next.subagents.mode === capabilityRuntime.subagents.mode &&
                next.subagents.maxConcurrency ===
                  capabilityRuntime.subagents.maxConcurrency
              ) {
                continue subagentMenu;
              }
              const review = await reviewSettingsChange(
                "Review subagents › ",
                "subagent setting",
                [
                  `Impact · ${next.subagents.mode.replaceAll("_", " ")} mode with at most ${next.subagents.maxConcurrency} concurrent subagents`,
                  "Limit · delegation depth remains 1",
                  next.subagents.mode === "read_only"
                    ? "Authority · every subagent is read-only"
                    : "Authority · existing repository and approval boundaries still apply",
                  "Scope · applies to this session and future launches",
                ],
              );
              if (review === "exit") return;
              if (review === "apply") await saveCapabilityRuntimeSetting(next);
            }
            continue intelligenceMenu;
          }
          if (setting === "customize") {
            intelligenceLimits: for (;;) {
              const limit = await terminal.select(
                "Customize intelligence › ",
                [
                  {
                    value: "namespaces",
                    label: `Capability namespaces · ${capabilityRuntime.maxNamespaces}`,
                    description: "Maximum namespaces loaded for a request.",
                  },
                  {
                    value: "tools",
                    label: `Tools per namespace · ${capabilityRuntime.maxToolsPerNamespace}`,
                    description: "Maximum tools exposed from each namespace.",
                  },
                  {
                    value: "memory-top-k",
                    label: `Memory results · ${capabilityRuntime.memoryTopK}`,
                    description: "Maximum relevant memory items added to context.",
                  },
                  {
                    value: "memory-budget",
                    label: `Memory token budget · ${capabilityRuntime.memoryTokenBudget}`,
                    description: "Maximum tokens reserved for retrieved memory.",
                  },
                  {
                    value: "reset",
                    label: "Restore intelligence defaults",
                    description: "Reset routing, improvement, subagents, and limits.",
                  },
                ],
              );
              if (limit === INTERRUPTED_INPUT || !limit) return;
              if (limit === backValue) break intelligenceLimits;
              let next: CapabilityRuntimeSettingsV1;
              if (limit === "reset") {
                next = createDefaultCapabilityRuntimeSettings();
              } else {
                const range =
                  limit === "namespaces"
                    ? [1, 2, 3]
                    : limit === "tools"
                      ? Array.from({ length: 10 }, (_, index) => index + 1)
                      : limit === "memory-top-k"
                        ? [1, 2, 3, 4, 5]
                        : [256, 512, 1_200, 2_000, 4_000];
                const current =
                  limit === "namespaces"
                    ? capabilityRuntime.maxNamespaces
                    : limit === "tools"
                      ? capabilityRuntime.maxToolsPerNamespace
                      : limit === "memory-top-k"
                        ? capabilityRuntime.memoryTopK
                        : capabilityRuntime.memoryTokenBudget;
                const values = [...new Set([...range, current])].sort(
                  (left, right) => left - right,
                );
                const selected = await terminal.select(
                  `${
                    limit === "namespaces"
                      ? "Capability namespaces"
                      : limit === "tools"
                        ? "Tools per namespace"
                        : limit === "memory-top-k"
                          ? "Memory results"
                          : "Memory token budget"
                  } › `,
                  [
                    ...values.map((value) => ({
                      value: String(value),
                      label: value.toLocaleString("en-US"),
                    })),
                    ...(limit === "memory-budget"
                      ? [{ value: "custom", label: "Custom value…" }]
                      : []),
                  ],
                  String(current),
                );
                if (selected === INTERRUPTED_INPUT || !selected) return;
                if (selected === backValue) continue intelligenceLimits;
                let numeric = Number(selected);
                if (selected === "custom") {
                  const answer = await terminal.ask(
                    `Memory token budget · 256–4000 · current ${current} › `,
                  );
                  if (answer === INTERRUPTED_INPUT) return;
                  numeric = Number(answer.trim());
                }
                const min = limit === "memory-budget" ? 256 : 1;
                const max =
                  limit === "namespaces"
                    ? 3
                    : limit === "tools"
                      ? 10
                      : limit === "memory-top-k"
                        ? 5
                        : 4_000;
                if (!Number.isInteger(numeric) || numeric < min || numeric > max) {
                  write(`Enter a whole number from ${min} to ${max}.`);
                  continue intelligenceLimits;
                }
                next = {
                  ...capabilityRuntime,
                  ...(limit === "namespaces"
                    ? { maxNamespaces: numeric }
                    : limit === "tools"
                      ? { maxToolsPerNamespace: numeric }
                      : limit === "memory-top-k"
                        ? { memoryTopK: numeric }
                        : { memoryTokenBudget: numeric }),
                };
              }
              if (JSON.stringify(next) === JSON.stringify(capabilityRuntime)) {
                continue intelligenceLimits;
              }
              const review = await reviewSettingsChange(
                "Review intelligence limits › ",
                limit === "reset" ? "intelligence defaults" : "intelligence limit",
                [
                  `Capabilities · ${next.maxNamespaces} namespaces · ${next.maxToolsPerNamespace} tools each`,
                  `Memory · ${next.memoryTopK} results · ${next.memoryTokenBudget} tokens`,
                  `Subagents · ${next.subagents.mode.replaceAll("_", " ")} · max ${next.subagents.maxConcurrency}`,
                  "Scope · applies to this session and future launches",
                ],
              );
              if (review === "exit") return;
              if (review === "apply") await saveCapabilityRuntimeSetting(next);
            }
          }
        }
        continue;
      }
      if (category === "activity") {
        const selected = await terminal.select(
          "Activity details › ",
          [
            {
              value: "off",
              label: "Off",
              description:
                "Keep answers, approvals, warnings, errors, and final results.",
              details: [
                "Impact · hide routine progress milestones from conversation",
                "Audit · persistent run logs remain complete",
              ],
            },
            {
              value: "important",
              label: "Important",
              description: "Also keep the main Prepare, Run, and Verify milestones.",
              details: [
                "Impact · keep major milestones without low-level activity noise",
                "Audit · persistent run logs remain complete",
              ],
            },
            {
              value: "full",
              label: "Full",
              description:
                "Also keep readiness, reasoning, and tool summaries.",
              details: [
                "Impact · show the most diagnostic activity in conversation",
                "Audit · persistent run logs remain complete",
              ],
            },
          ],
          state.activityDetails ?? "important",
        );
        if (selected === INTERRUPTED_INPUT || !selected) return;
        if (selected === backValue) continue;
        if (["off", "important", "full"].includes(selected)) {
          if (selected !== (state.activityDetails ?? "important")) {
            await saveActivityDetails(
              selected as ActivityDetailLevel,
              "interactive",
            );
          }
        }
      }
    }
  };

  if (terminal.isTTY && loadModelCatalog) {
    try {
      await loadModelCatalog();
      synchronizeContextForModel(state.modelId);
    } catch {
      // Model discovery is retried when a turn or model picker needs it.
    }
  }

  void refreshProviderUsage();
  write(renderWelcome(state, { color: terminal.color, themeId: terminal.themeId, width: terminal.width }));
  if (terminal.isTTY && options.startupBoundaryAcknowledged === false) {
    write(startupBoundaryText(state, { color: terminal.color, themeId: terminal.themeId }));
    const acknowledgement = await terminal.ask("Continue in this repository? [y/N] ");
    if (acknowledgement === INTERRUPTED_INPUT) {
      write("Startup interrupted. No repository run was started.");
      return "interrupted";
    }
    if (!isApproval(acknowledgement)) {
      write("Startup cancelled. No repository run was started.");
      return "completed";
    }
    await options.acknowledgeStartupBoundary?.();
    write("Safety boundary acknowledged. Sensitive work still requires review.");
  }

  sessionLoop: for (;;) {
    synchronizeContextForModel(state.modelId);
    if (pendingClarificationBasis && !pendingCommand) {
      pendingCommand = {
        kind: "prompt",
        value: pendingClarificationBasis.rawPrompt,
      };
    } else if (!pendingCommand && !pendingInitialPrompt && !pendingPaused && pendingPrompts.length > 0) {
      const pending = pendingPrompts.shift()!;
      pendingCommand = {
        kind: "prompt",
        value: pending.value,
      };
      pendingCommandImages = pending.images;
    }
    const composerResult = pendingCommand
      ? undefined
      : pendingInitialPrompt
      ? { kind: "input" as const, value: pendingInitialPrompt, images: [] }
      : await readComposer(
          terminal,
          pendingComposerDraft,
          composerStatusContext(
            state,
            pendingPrompts.length,
            pendingPaused,
          ),
        );
    pendingComposerDraft = "";
    pendingInitialPrompt = undefined;
    if (composerResult?.kind === "edit_pending") {
      const pending = pendingPrompts.pop();
      if (!pending) {
        write("Pending · no messages are waiting.");
        continue;
      }
      pendingComposerDraft = cloneComposerDraft(pending.draft);
      if (pendingPrompts.length === 0) pendingPaused = false;
      write(
        `Pending edit · recalled newest message · ${pendingPrompts.length} remaining.`,
      );
      continue;
    }
    if (composerResult?.kind === "clear_pending") {
      const removed = pendingPrompts.length;
      pendingPrompts.splice(0);
      pendingPaused = false;
      write(
        `Pending cleared · removed ${removed} message${removed === 1 ? "" : "s"}.`,
      );
      continue;
    }
    if (composerResult?.kind === "interrupt") {
      write("Draft cancelled.");
      continue;
    }
    const command =
      pendingCommand ??
      parseInteractiveInput(
        composerResult?.kind === "input" ? composerResult.value : "",
      );
    let imagesForTurn = pendingCommand
      ? pendingCommandImages
      : composerResult?.kind === "input"
        ? composerResult.images
        : [];
    pendingCommand = undefined;
    pendingCommandImages = [];
    if (command.kind === "empty") {
      continue;
    }
    if (command.kind === "exit") {
      if (pendingPrompts.length > 0) {
        write(
          `Session remains open · ${pendingPrompts.length} pending message${pendingPrompts.length === 1 ? "" : "s"}. Use /pending resume or /pending clear first.`,
        );
        continue;
      }
      write("Session ended. No background run remains attached.");
      return "completed";
    }
    if (command.kind === "next") {
      if (
        !enqueuePrompt(
          command.value,
          imagesForTurn,
          composerResult?.kind === "input"
            ? composerResult.draft
            : undefined,
        )
      ) {
        continue;
      }
      if (!pendingPaused && pendingPrompts.length > 0) {
        const pending = pendingPrompts.shift()!;
        pendingCommand = {
          kind: "prompt",
          value: pending.value,
        };
        pendingCommandImages = pending.images;
      }
      continue;
    }
    if (command.kind === "stop") {
      write("Stop · no agent operation is active.");
      continue;
    }
    if (command.kind === "pending") {
      managePending(command.value);
      continue;
    }
    if (command.kind === "paste") {
      write(
        "Clipboard paste is available only in the interactive TTY composer.",
      );
      continue;
    }
    if (command.kind === "copy") {
      if (!options.copyText) {
        write("Clipboard copy is unavailable in this host.");
        continue;
      }
      let responses: CopyableAgentResponse[];
      try {
        responses = await readAgentResponses();
      } catch (error) {
        write(
          `Copy failed: ${terminalSafeText(
            error instanceof Error ? error.message : String(error),
          )}`,
        );
        continue;
      }
      if (responses.length === 0) {
        write("No Agent response is available to copy.");
        continue;
      }
      const newestFirst = [...responses].reverse();
      let selector = command.value.trim().toLowerCase();
      if (!selector && terminal.select) {
        const selected = await terminal.select(
          "Copy response › ",
          [
            ...newestFirst.map((response, index) => {
              const preview = response.content
                .replace(/\s+/gu, " ")
                .trim()
                .slice(0, 120);
              return {
                value: String(index + 1),
                label: index === 0
                  ? "1 · Latest response"
                  : `${index + 1} · Previous response`,
                description: response.recordedAt
                  ? `${response.recordedAt} · ${preview}`
                  : preview,
              };
            }),
            {
              value: "all",
              label: "All Agent responses",
              description: "Copy every Agent response from oldest to newest.",
            },
          ],
        );
        if (
          selected === INTERRUPTED_INPUT ||
          selected === NAVIGATE_BACK_INPUT ||
          !selected
        ) {
          continue;
        }
        selector = selected;
      }
      if (!selector) selector = "latest";
      const normalizedSelector =
        selector === "latest"
          ? "1"
          : selector === "previous"
            ? "2"
            : selector;
      let content: string;
      let label: string;
      if (normalizedSelector === "all") {
        content = responses.map((response) => response.content)
          .join("\n\n---\n\n");
        label = `${responses.length} Agent responses`;
      } else {
        const index = Number(normalizedSelector);
        if (
          !/^[1-9]\d*$/u.test(normalizedSelector) ||
          !Number.isSafeInteger(index) ||
          index > newestFirst.length
        ) {
          write(
            `Usage: /copy [latest|previous|all|1-${newestFirst.length}]`,
          );
          continue;
        }
        content = newestFirst[index - 1]!.content;
        label = index === 1 ? "latest response" : `response ${index}`;
      }
      try {
        await options.copyText(content);
        const notice =
          `Copied ${label} · ${[...content].length} characters`;
        if (terminal.notify) terminal.notify(notice, "success");
        else write(notice);
      } catch (error) {
        const message =
          `Copy failed · ${terminalSafeText(
            error instanceof Error ? error.message : String(error),
          )}`;
        write(message);
      }
      continue;
    }
    if (command.kind === "help") {
      write(renderInteractiveHelp(command.topic, {
        width: terminal.width,
        color: terminal.color,
        themeId: terminal.themeId,
        shortcuts: shortcutSettings,
      }));
      continue;
    }
    if (command.kind === "clear") {
      terminal.clear();
      write(renderWelcome(state, { color: terminal.color, themeId: terminal.themeId, width: terminal.width }));
      continue;
    }
    if (command.kind === "context") {
      const [action = "show", argument] = command.value
        .trim()
        .split(/\s+/u);
      if (action === "show" || !command.value.trim()) {
        write(contextText(state, contextCapacityError, terminal.width));
        continue;
      }
      if (action === "history") {
        if (!state.sessionId || !options.readTranscript) {
          write("Transcript history is unavailable in this host.");
          continue;
        }
        const requested = argument ? Number(argument) : 20;
        if (!Number.isSafeInteger(requested) || requested < 1) {
          write("Usage: /context history [limit]");
          continue;
        }
        try {
          const page = await options.readTranscript(state.sessionId, {
            limit: Math.min(200, requested),
          });
          if (page.entries.length === 0) {
            write("No stored transcript messages.");
            continue;
          }
          write([
            `Transcript · ${page.entries.length} of ${page.total} messages`,
            ...page.entries.map((entry) =>
              `${entry.role === "user" ? "You" : "Agent"} › ${terminalSafeMultilineText(entry.content)}`
            ),
            ...(page.nextCursor !== undefined
              ? ["Older messages remain stored."]
              : []),
          ].join("\n\n"));
        } catch (error) {
          write(
            `Transcript unavailable: ${terminalSafeText(
              error instanceof Error ? error.message : String(error),
            )}`,
          );
        }
        continue;
      }
      if (action === "compact") {
        if (!state.providerThreadId || !options.compactContext) {
          write("Context compact unavailable · no active provider thread.");
          continue;
        }
        const activity = beginActivity("Compacting context");
        const controller: ContextController = new ContextController({
          modelId: state.modelId,
          ...(state.context ? { snapshot: state.context } : {}),
        });
        controller.beginCompaction();
        try {
          await options.compactContext(state.providerThreadId);
          state.context = controller.completeCompaction();
          await persist();
          activity.settle("Context compacted");
          write("Context compacted · Orynt session and transcript kept.");
        } catch (error) {
          state.context = controller.block("context_compaction_failed");
          await persist();
          activity.fail("Context compact failed");
          write(
            `Context compact failed: ${terminalSafeText(
              error instanceof Error ? error.message : String(error),
            )}`,
          );
        }
        continue;
      }
      write("Usage: /context [history [limit]|compact]");
      continue;
    }
    if (command.kind === "status") {
      const activity = beginActivity("Checking provider status");
      const [providerResult, usageResult] = await Promise.allSettled([
        options.probeProvider(),
        options.readProviderUsage?.("quota") ??
          Promise.reject(new Error("Provider usage is unavailable")),
      ]);
      if (providerResult.status === "fulfilled") {
        const provider = providerResult.value;
        state.providerReady = provider.ready;
        state.providerDetail = provider.detail;
      } else {
        state.providerReady = false;
        state.providerDetail =
          providerResult.reason instanceof Error
            ? providerResult.reason.message
            : String(providerResult.reason);
      }
      if (
        providerResult.status === "rejected" &&
        usageResult.status === "rejected"
      ) {
        activity.fail("Provider status unavailable");
      } else {
        activity.settle("Provider status refreshed");
      }
      write(
        statusText(
          state,
          options.codeIntelStatus?.(),
          usageResult.status === "fulfilled"
            ? usageResult.value
            : undefined,
          terminal.width,
        ),
      );
      continue;
    }
    if (command.kind === "tier") {
      const value = command.value.trim();
      if (!value) {
        await runTierPicker();
        continue;
      }
      if (!applyNextMinimumTier(value)) {
        write("Usage: /tier <auto|light|medium|heavy>");
      }
      continue;
    }
    if (command.kind === "settings") {
      let value = command.value.trim();
      if (!value && terminal.isTTY && terminal.select) {
        await runInteractiveSettings();
        continue;
      }

      const tokens = value.split(/\s+/).filter(Boolean);
      const section = tokens[0]?.toLowerCase();
      if (!section || section === "show") {
        write(
          settingsText(
            state,
            appearancePreferences,
            appearanceResolution,
            capabilityRuntime,
            clipboardSettings,
            shortcutSettings,
            statuslineSettings,
            options.activityDetailsOverride,
            terminal.width,
          ),
        );
        continue;
      }
      if (section === "agent") {
        if (tokens.length === 1 && terminal.isTTY && terminal.select) {
          await runAgentSettings();
          continue;
        }
        const control = tokens[1]?.toLowerCase();
        if (
          control === "review" ||
          control === "helpers" ||
          control === "depth" ||
          control === "recovery"
        ) {
          const raw = tokens[2]?.toLowerCase().replaceAll("-", "_");
          const profile = structuredClone(
            state.orchestrationProfile ??
              createLegacySingleModelProfile(
                state.modelId,
                state.thinkingEffort,
              ),
          );
          const valid =
            control === "review"
              ? ["always", "conditional", "failure_only"].includes(raw ?? "")
              : control === "helpers"
                ? ["0", "1", "2"].includes(raw ?? "")
                : control === "depth"
                  ? ["1", "2"].includes(raw ?? "")
                  : ["0", "1"].includes(raw ?? "");
          if (!valid || tokens.length !== 3) {
            write(
              control === "review"
                ? "Usage: /settings agent review <always|conditional|failure-only>"
                : control === "helpers"
                  ? "Usage: /settings agent helpers <0|1|2>"
                  : control === "depth"
                    ? "Usage: /settings agent depth <1|2>"
                    : "Usage: /settings agent recovery <0|1>",
            );
            continue;
          }
          profile.preset = "custom";
          if (control === "review") {
            profile.reviewerPolicy =
              raw as OrchestrationProfile["reviewerPolicy"];
          } else if (control === "helpers") {
            profile.maxReadOnlyHelpers = Number(raw);
          } else if (control === "depth") {
            profile.maxDepth = Number(raw);
          } else {
            profile.maxRecoveryAttempts = Number(raw);
          }
          await saveProfileSetting(profile);
          continue;
        }
        pendingCommand = {
          kind: "model",
          value: tokens.slice(1).join(" "),
        };
        modelCommandFromSettings = true;
        continue;
      }
      if (section === "debug") {
        write(
          "Debug was replaced by /settings activity <off|important|full>.",
        );
        continue;
      }
      if (section === "activity") {
        const level = tokens[1]?.toLowerCase();
        if (
          !level ||
          !["off", "important", "full"].includes(level) ||
          tokens.length !== 2
        ) {
          write(
            "Usage: /settings activity <off|important|full>",
          );
          continue;
        }
        await saveActivityDetails(level as ActivityDetailLevel);
        continue;
      }
      if (section === "appearance") {
        const setting = tokens[1]?.toLowerCase();
        if (setting === "screen") {
          const mode = tokens[2]?.toLowerCase();
          if (
            !mode ||
            !["auto", "fullscreen", "inline"].includes(mode) ||
            tokens.length !== 3
          ) {
            write(
              "Usage: /settings appearance screen <auto|fullscreen|inline>",
            );
            continue;
          }
          await saveScreenSetting(mode as TerminalScreenMode);
          continue;
        }
        if (setting === "theme") {
          const requestedTheme = tokens[2]?.toLowerCase();
          const candidate = TERMINAL_THEMES.find(
            (item) => item.id === requestedTheme,
          );
          if (!candidate || tokens.length !== 3) {
            write(
              `Usage: /settings appearance theme <${TERMINAL_THEMES.map((item) => item.id).join("|")}>`,
            );
            continue;
          }
          await saveThemeSetting(candidate.id);
          continue;
        }
        const enabled =
          tokens[2]?.toLowerCase() === "on"
            ? true
            : tokens[2]?.toLowerCase() === "off"
              ? false
              : undefined;
        if (
          (setting !== "color" &&
            setting !== "motion" &&
            setting !== "rich-text") ||
          enabled === undefined ||
          tokens.length !== 3
        ) {
          write(
            "Usage: /settings appearance <screen <auto|fullscreen|inline>|theme <id>|color|motion|rich-text> <on|off>",
          );
          continue;
        }
        await saveAppearanceSetting(setting, enabled);
        continue;
      }
      if (section === "clipboard") {
        const operation = tokens[1]?.toLowerCase();
        if (!operation || operation === "show") {
          write(
            terminalDetailText("Clipboard", [
              {
                label: "Copy on select",
                value: settingState(clipboardSettings.copyOnSelect),
              },
            ], terminal.width),
          );
          continue;
        }
        if (operation === "reset" && tokens.length === 2) {
          await saveClipboardSettings(
            structuredClone(DEFAULT_CLI_CLIPBOARD),
            "command",
          );
          continue;
        }
        const value = tokens[2]?.toLowerCase();
        if (
          operation !== "copy-on-select" ||
          !["on", "off"].includes(value ?? "") ||
          tokens.length !== 3
        ) {
          write(
            "Usage: /settings clipboard [show|reset|copy-on-select <on|off>]",
          );
          continue;
        }
        await saveClipboardSettings(
          { copyOnSelect: value === "on" },
          "command",
        );
        continue;
      }
      if (section === "intelligence") {
        const area = tokens[1]?.toLowerCase();
        if (!area || area === "show") {
          write(intelligenceSettingsText(capabilityRuntime, terminal.width));
          continue;
        }
        let next: CapabilityRuntimeSettingsV1 | undefined;
        if (
          area === "reset" &&
          tokens.length === 2
        ) {
          next = createDefaultCapabilityRuntimeSettings();
        } else if (
          area === "improve" &&
          tokens.length === 3 &&
          ["off", "shadow-review", "shadow_review"].includes(
            tokens[2]?.toLowerCase() ?? "",
          )
        ) {
          next = {
            ...capabilityRuntime,
            autoImproveMode:
              tokens[2]?.toLowerCase() === "off"
                ? "off"
                : "shadow_review",
          };
        } else if (
          area === "routing" &&
          tokens.length === 3 &&
          ["off", "auto-read-only", "auto_read_only"].includes(
            tokens[2]?.toLowerCase() ?? "",
          )
        ) {
          next = {
            ...capabilityRuntime,
            routingMode:
              tokens[2]?.toLowerCase() === "off"
                ? "off"
                : "auto_read_only",
          };
        } else if (area === "subagents") {
          const control = tokens[2]?.toLowerCase();
          const raw = tokens[3]?.toLowerCase().replaceAll("-", "_");
          if (
            control === "mode" &&
            tokens.length === 4 &&
            ["off", "read_only", "adaptive"].includes(raw ?? "")
          ) {
            next = {
              ...capabilityRuntime,
              subagents: {
                ...capabilityRuntime.subagents,
                mode:
                  raw as CapabilityRuntimeSettingsV1["subagents"]["mode"],
              },
            };
          } else if (
            control === "concurrency" &&
            tokens.length === 4 &&
            ["1", "2", "3", "4"].includes(raw ?? "")
          ) {
            next = {
              ...capabilityRuntime,
              subagents: {
                ...capabilityRuntime.subagents,
                maxConcurrency: Number(raw),
              },
            };
          }
        } else if (area === "capabilities") {
          const control = tokens[2]?.toLowerCase();
          const numeric = Number(tokens[3]);
          if (
            tokens.length === 4 &&
            Number.isInteger(numeric) &&
            (
              (control === "namespaces" && numeric >= 1 && numeric <= 3) ||
              (control === "tools" && numeric >= 1 && numeric <= 10)
            )
          ) {
            next = {
              ...capabilityRuntime,
              ...(control === "namespaces"
                ? { maxNamespaces: numeric }
                : { maxToolsPerNamespace: numeric }),
            };
          }
        } else if (area === "memory") {
          const control = tokens[2]?.toLowerCase();
          const numeric = Number(tokens[3]);
          if (
            tokens.length === 4 &&
            Number.isInteger(numeric) &&
            (
              (control === "top-k" && numeric >= 1 && numeric <= 5) ||
              (control === "token-budget" &&
                numeric >= 256 &&
                numeric <= 4_000)
            )
          ) {
            next = {
              ...capabilityRuntime,
              ...(control === "top-k"
                ? { memoryTopK: numeric }
                : { memoryTokenBudget: numeric }),
            };
          }
        }
        if (!next) {
          write(
            [
              "Usage:",
              "  /settings intelligence [show|reset]",
              "  /settings intelligence improve <off|shadow-review>",
              "  /settings intelligence routing <off|auto-read-only>",
              "  /settings intelligence subagents <mode <off|read-only|adaptive>|concurrency <1-4>>",
              "  /settings intelligence capabilities <namespaces <1-3>|tools <1-10>>",
              "  /settings intelligence memory <top-k <1-5>|token-budget <256-4000>>",
            ].join("\n"),
          );
          continue;
        }
        if (JSON.stringify(next) === JSON.stringify(capabilityRuntime)) {
          write(intelligenceSettingsText(capabilityRuntime, terminal.width));
          continue;
        }
        if (await saveCapabilityRuntimeSetting(next)) {
          write(intelligenceSettingsText(capabilityRuntime, terminal.width));
        }
        continue;
      }
      if (section === "shortcuts") {
        const operation = tokens[1]?.toLowerCase() ?? "show";
        if (operation === "show" && tokens.length <= 2) {
          write(
            terminalDetailText("Shortcuts", [
              {
                label: "Clear",
                value: shortcutListLabel(shortcutSettings.clear),
              },
              {
                label: "Undo",
                value: shortcutListLabel(shortcutSettings.undo),
              },
              {
                label: "Redo",
                value: shortcutListLabel(shortcutSettings.redo),
              },
            ], terminal.width),
          );
          continue;
        }
        if (operation === "reset" && tokens.length === 2) {
          await saveShortcutSettings(
            structuredClone(DEFAULT_CLI_SHORTCUTS),
            "command",
          );
          continue;
        }
        const action = tokens[2]?.toLowerCase() as
          | ComposerShortcutAction
          | undefined;
        const bindings = tokens[3]
          ?.split(",")
          .map((binding) => normalizeShortcutBinding(binding));
        if (
          operation !== "set" ||
          !action ||
          !["clear", "undo", "redo"].includes(action) ||
          tokens.length !== 4 ||
          !bindings ||
          bindings.length < 1 ||
          bindings.length > 2 ||
          bindings.some((binding) => binding === undefined)
        ) {
          write(
            wrapTerminalParagraph(
              "Usage: /settings shortcuts [show|reset|set <clear|undo|redo> <binding>[,<binding>]]",
              terminal.width,
            ).join("\n"),
          );
          continue;
        }
        const next = structuredClone(shortcutSettings);
        next[action] = bindings as NonNullable<(typeof bindings)[number]>[];
        await saveShortcutSettings(next, "command");
        continue;
      }
      if (section === "statusline") {
        const operation = tokens[1]?.toLowerCase() ?? "show";
        if (operation === "show" && tokens.length <= 2) {
          write(
            terminalDetailText("Statusline", [
              {
                label: "Enabled",
                value: settingState(statuslineSettings.enabled),
              },
              {
                label: "Profile",
                value: settingState(statuslineSettings.profile),
              },
              {
                label: "Role",
                value: settingState(statuslineSettings.role),
              },
              {
                label: "Model",
                value: settingState(statuslineSettings.model),
              },
              {
                label: "Effort",
                value: settingState(statuslineSettings.effort),
              },
              {
                label: "Context",
                value: `${settingState(statuslineSettings.context)} · ${statuslineSettings.contextFormat}`,
              },
              {
                label: "Quota",
                value: settingState(statuslineSettings.quota),
              },
              {
                label: "Shortcuts",
                value: settingState(statuslineSettings.shortcuts),
              },
            ], terminal.width),
          );
          continue;
        }
        if (operation === "reset" && tokens.length === 2) {
          await saveStatuslineSettings(
            structuredClone(DEFAULT_CLI_STATUSLINE),
            "command",
          );
          continue;
        }
        if (
          operation === "context-format" &&
          tokens.length === 3 &&
          (tokens[2] === "tokens" || tokens[2] === "percent")
        ) {
          await saveStatuslineSettings(
            {
              ...statuslineSettings,
              contextFormat: tokens[2],
            },
            "command",
          );
          continue;
        }
        const field = tokens[2]?.toLowerCase() as
          | CliStatuslineField
          | undefined;
        const enabled =
          tokens[3]?.toLowerCase() === "on"
            ? true
            : tokens[3]?.toLowerCase() === "off"
              ? false
              : undefined;
        if (
          operation !== "set" ||
          !field ||
          ![
            "enabled",
            "profile",
            "role",
            "model",
            "effort",
            "context",
            "quota",
            "shortcuts",
          ].includes(field) ||
          enabled === undefined ||
          tokens.length !== 4
        ) {
          write(
            wrapTerminalParagraph(
              "Usage: /settings statusline [show|reset|context-format <tokens|percent>|set <enabled|profile|role|model|effort|context|quota|shortcuts> <on|off>]",
              terminal.width,
            ).join("\n"),
          );
          continue;
        }
        await saveStatuslineSettings(
          { ...statuslineSettings, [field]: enabled },
          "command",
        );
        continue;
      }
      write(
        wrapTerminalParagraph(
          "Usage: /settings [show|agent|appearance|clipboard|intelligence|shortcuts|statusline|activity]",
          terminal.width,
        ).join("\n"),
      );
      continue;
    }
    if (command.kind === "goal") {
      if (!command.value) {
        write(`Goal: ${terminalSafeText(state.goal ?? "not set")}`);
        continue;
      }
      if (command.value === "--clear") {
        delete state.goal;
        clearPromptUnderstandingDraft();
        await persist();
        write("Goal cleared.");
        continue;
      }
      state.goal = command.value;
      clearPromptUnderstandingDraft();
      await persist();
      write(`Goal set: ${terminalSafeText(state.goal)}`);
      continue;
    }
    if (command.kind === "skills") {
      const [operation = "list", ...arguments_] = command.value
        .trim()
        .split(/\s+/)
        .filter(Boolean);
      if (operation === "auto") {
        const value = arguments_[0]?.toLowerCase();
        if (!value || value === "status") {
          write(
            `Agent Skill auto-selection · ${skillRouting === "auto_trusted" ? "on · trusted skills only" : "off · manual attachments only"}`,
          );
          continue;
        }
        if ((value !== "on" && value !== "off") || arguments_.length !== 1) {
          write("Usage: /skills auto [on|off|status]");
          continue;
        }
        await saveSkillRouting(value === "on" ? "auto_trusted" : "manual");
        continue;
      }
      if (operation === "list") {
        if (!options.listSkills) {
          write("Skill inventory is unavailable in this host.");
          continue;
        }
        try {
          const inventory = await options.listSkills(state.repositoryPath);
          const attached = new Set(state.selectedSkillIds ?? []);
          write(
            inventory.length
              ? terminalDetailText(
                  "Agent Skills",
                  inventory.map((skill) => ({
                    label:
                      `${attached.has(skill.id) ? "●" : "○"} ${terminalSafeText(skill.id)}`,
                    value:
                      `${terminalSafeText(skill.scope)} · ${terminalSafeText(skill.health)}${skill.eligible ? "" : " · unavailable"}`,
                  })),
                  terminal.width,
                )
              : "No Agent Skills were discovered for this repository.",
          );
        } catch (error) {
          write(
            `Skill inventory failed: ${terminalSafeText(
              error instanceof Error ? error.message : String(error),
            )}`,
          );
        }
        continue;
      }
      if (operation === "clear") {
        state.selectedSkillIds = [];
        await persist();
        write("All Agent Skill attachments cleared.");
        continue;
      }
      const skillId = arguments_.join(" ").trim();
      if (
        (operation !== "use" && operation !== "remove") ||
        !/^[a-zA-Z0-9._:-]{1,200}$/.test(skillId)
      ) {
        write("Usage: /skills [list|auto [on|off|status]|use <id>|remove <id>|clear]");
        continue;
      }
      const selected = new Set(state.selectedSkillIds ?? []);
      if (operation === "use") {
        const inventory = await options.listSkills?.(state.repositoryPath);
        const skill = inventory?.find((candidate) => candidate.id === skillId);
        if (!skill?.eligible) {
          write(
            `Skill cannot be attached: ${terminalSafeText(skillId)} is missing or unavailable.`,
          );
          continue;
        }
        selected.add(skillId);
      } else {
        selected.delete(skillId);
      }
      state.selectedSkillIds = [...selected].sort();
      await persist();
      write(
        `${operation === "use" ? "Attached" : "Detached"} Agent Skill: ${terminalSafeText(skillId)}`,
      );
      continue;
    }
    if (command.kind === "criteria") {
      state.acceptanceCriteria = command.value.split(";").map((item) => item.trim()).filter(Boolean);
      clearPromptUnderstandingDraft();
      await persist();
      write(`Acceptance criteria: ${terminalSafeText(state.acceptanceCriteria.join("; "))}`);
      continue;
    }
    if (command.kind === "plan") {
      write(planText(state, terminal.width));
      continue;
    }
    if (command.kind === "state") {
      write(stateText(state, terminal.width));
      continue;
    }
    if (command.kind === "evidence") {
      write(evidenceText(state, terminal.width));
      continue;
    }
    if (command.kind === "diff") {
      write(await diffText(state, command.value, terminal.color, terminal.themeId));
      continue;
    }
    if (command.kind === "verify") {
      write(verificationText(state, terminal.width));
      continue;
    }
    if (command.kind === "cost") {
      write(costText(state, terminal.width));
      continue;
    }
    if (command.kind === "usage") {
      if (!options.readProviderUsage) {
        write("Provider usage is unavailable in this host.");
        continue;
      }
      const activity = beginActivity("Reading provider usage");
      try {
        const snapshot = await options.readProviderUsage(
          command.verbose ? "full" : "quota",
        );
        if (snapshot.status === "unavailable") {
          activity.fail("Provider usage unavailable");
        } else {
          activity.settle("Provider usage refreshed");
        }
        write(
          renderProviderUsage(snapshot, {
            color: terminal.color,
            themeId: terminal.themeId,
            width: terminal.width,
            verbose: command.verbose,
          }),
        );
      } catch (error) {
        activity.fail("Provider usage failed");
        write(
          `Provider usage failed: ${terminalSafeText(
            error instanceof Error ? error.message : String(error),
          )}`,
        );
      }
      continue;
    }
    if (command.kind === "doctor") {
      const activity = beginActivity("Running diagnostics");
      let diagnostics: DoctorReportV1 | undefined;
      try {
        diagnostics = await options.diagnose?.({
          repositoryPath: state.repositoryPath,
          ...(state.modelTierConfiguration
            ? { modelTierConfiguration: state.modelTierConfiguration }
            : {}),
          verbose: command.verbose,
        });
        activity.settle("Diagnostics complete");
      } catch (error) {
        activity.fail("Diagnostics failed");
        write(
          `Diagnostics failed: ${terminalSafeText(
            error instanceof Error ? error.message : String(error),
          )}`,
        );
        continue;
      }
      write(
        diagnostics
          ? renderDoctorReport(diagnostics, {
              color: terminal.color,
              themeId: terminal.themeId,
              width: terminal.width,
              verbose: command.verbose,
            })
          : "Doctor diagnostics are unavailable in this host.",
      );
      continue;
    }
    if (command.kind === "setup") {
      if (!options.setupProvider) {
        write("Interactive Codex setup is unavailable in this host.");
        continue;
      }
      const result = await options.setupProvider();
      state.providerReady = result.status.ready;
      state.providerDetail = result.status.detail;
      write(
        result.status.ready
          ? `Codex CLI is ready: ${terminalSafeText(result.status.detail)}`
          : `Codex setup remains incomplete: ${terminalSafeText(result.status.detail)}`,
      );
      continue;
    }
    if (command.kind === "sessions" || command.kind === "resume") {
      let targetSessionId =
        command.kind === "resume" ? command.value.trim() : "";
      if (!targetSessionId) {
        const selection = await selectSavedSession(
          command.kind === "sessions" ? "Saved sessions" : "Resume session",
        );
        if (selection.kind === "empty") {
          write("No saved sessions were found for this repository.");
          continue;
        }
        if (selection.kind === "cancelled") continue;
        if (selection.kind === "unavailable") {
          write(
            [
              "Saved sessions",
              renderSessionList(selection.page.entries, {
                width: terminal.width,
                currentSessionId: state.sessionId,
              }),
              ...(selection.page.nextCursor
                ? ["More sessions are available."]
                : []),
              "Use /resume <id> to restore one.",
            ].join("\n"),
          );
          continue;
        }
        targetSessionId = selection.sessionId;
      }
      if (targetSessionId === state.sessionId) {
        write(
          `Session is already current: ${terminalSafeText(targetSessionId)}`,
        );
        continue;
      }
      const activity = beginActivity("Loading session");
      let resumed: CliSessionSnapshot | undefined;
      try {
        resumed = await options.loadSession?.(targetSessionId);
      } catch (error) {
        activity.fail("Session load failed");
        write(
          `Session load failed: ${terminalSafeText(
            error instanceof Error ? error.message : String(error),
          )}`,
        );
        continue;
      }
      if (!resumed) {
        activity.fail("Session not found");
        write(`Session not found: ${terminalSafeText(targetSessionId)}`);
        continue;
      }
      if (resumed.trashedAt) {
        activity.fail("Session is in Trash");
        write(
          `Session is in Trash: ${terminalSafeText(resumed.sessionId)}. Restore it with \`orynt sessions restore ${terminalSafeText(resumed.sessionId)}\` before resuming.`,
        );
        continue;
      }
      activity.settle("Session loaded");
      Object.assign(state, resumed, {
        providerReady: state.providerReady,
        providerDetail: state.providerDetail,
        acceptanceCriteria: [...resumed.acceptanceCriteria],
      });
      if (state.promptUnderstandingDraft) {
        state.promptUnderstandingDraft = {
          ...state.promptUnderstandingDraft,
          requiresReconfirmation: true,
        };
      }
      recentTurns.splice(
        0,
        recentTurns.length,
        ...(resumed.recentTurns ?? []).map(({ role, content }) => ({
          role,
          content,
        })),
      );
      write(
        `Resumed session ${terminalSafeText(resumed.sessionId)} · ${terminalSafeText(resumed.repositoryPath)}`,
      );
      continue;
    }
    if (command.kind === "repo") {
      let repositoryPath: string;
      try {
        repositoryPath = await resolveCliConversationRepository(
          path.resolve(command.value),
        );
      } catch {
        write(
          `Workspace rejected: ${terminalSafeText(command.value)} is not inside a Git repository.`,
        );
        continue;
      }
      if (repositoryPath !== state.repositoryPath) {
        delete state.conversationSummary;
        delete state.goal;
        delete state.lastRun;
        clearPromptUnderstandingDraft();
      state.acceptanceCriteria = [];
      state.selectedSkillIds = [];
        state.turnCount = 0;
        recentTurns.splice(0);
        state.recentTurns = [];
      }
      state.repositoryPath = repositoryPath;
      await persist();
      const warning = await saveWorkingConfig({ repositoryPath });
      write(
        `Workspace changed to ${terminalSafeText(state.repositoryPath)}${
          warning ? `\n${warning}` : ""
        }`,
      );
      continue;
    }
    if (command.kind === "model") {
      const invokedFromSettings = modelCommandFromSettings;
      modelCommandFromSettings = false;
      const agentCommand = invokedFromSettings
        ? "/settings agent"
        : "/model";
      if (!invokedFromSettings) {
        write(
          "Tip: agent configuration now lives in /settings agent.",
        );
      }
      const currentProfile =
        state.orchestrationProfile ??
        createLegacySingleModelProfile(
          state.modelId,
          state.thinkingEffort,
        );
      const saveProfile = async (profile: OrchestrationProfile) => {
        setProfile(state, profile);
        await persist();
        return saveWorkingConfig({ orchestrationProfile: profile });
      };
      const tokens = command.value.trim().split(/\s+/).filter(Boolean);
      const subcommand = tokens[0]?.toLowerCase();
      if (subcommand === "show") {
        write(orchestrationProfileText(currentProfile, terminal.width));
        continue;
      }
      if (subcommand === "profile") {
        const preset = tokens[1] as typeof EDITABLE_PRESETS[number] | undefined;
        if (!preset || !EDITABLE_PRESETS.includes(preset)) {
          write(
            `Usage: ${agentCommand} profile <auto|quality|balanced|economy>`,
          );
          continue;
        }
        const profile = presetProfile(preset);
        const warning = await saveProfile(profile);
        write(
          `${orchestrationProfileText(profile, terminal.width)}${warning ? `\n${warning}` : ""}`,
        );
        continue;
      }
      if (subcommand === "role") {
        const role = roleName(tokens[1] ?? "");
        const modelId = tokens[2];
        const effort = tokens[3] as ThinkingEffort | undefined;
        if (
          !role ||
          !modelId ||
          (effort !== undefined && !VALID_EFFORTS.has(effort))
        ) {
          write(
            `Usage: ${agentCommand} role <coordinator|implementer|helper|reviewer> <model-id> [effort]`,
          );
          continue;
        }
        let normalizedModelId: string;
        try {
          normalizedModelId =
            normalizeCliWorkingConfig({ modelId }).modelId ?? modelId;
        } catch (error) {
          write(
            terminalSafeText(
              error instanceof Error ? error.message : String(error),
            ),
          );
          continue;
        }
        const profile = structuredClone(currentProfile);
        profile.preset = "custom";
        profile.roles[role] = {
          ...profile.roles[role],
          modelId: normalizedModelId,
          ...(effort ? { thinkingEffort: effort } : {}),
        };
        const warning = await saveProfile(profile);
        write(
          `${orchestrationProfileText(profile, terminal.width)}${warning ? `\n${warning}` : ""}`,
        );
        continue;
      }
      if (subcommand === "effort") {
        const role = roleName(tokens[1] ?? "");
        const effort = tokens[2] as ThinkingEffort | undefined;
        if (!role || !effort || !VALID_EFFORTS.has(effort)) {
          write(
            `Usage: ${agentCommand} effort <coordinator|implementer|helper|reviewer> <minimal|none|low|medium|high|xhigh>`,
          );
          continue;
        }
        const profile = structuredClone(currentProfile);
        profile.preset = "custom";
        profile.roles[role].thinkingEffort = effort;
        const warning = await saveProfile(profile);
        write(
          `${orchestrationProfileText(profile, terminal.width)}${warning ? `\n${warning}` : ""}`,
        );
        continue;
      }
      if (subcommand) {
        write(
          `Use \`${agentCommand} profile <name>\`, \`${agentCommand} role <role> <model-id> [effort]\`, or \`${agentCommand} effort <role> <level>\`.`,
        );
        continue;
      }
      if (!terminal.isTTY || !terminal.select) {
        write(
          `${orchestrationProfileText(currentProfile, terminal.width)}\n${wrapTerminalParagraph(
            `Use ${agentCommand} profile <name>, ${agentCommand} role <role> <model-id> [effort], or ${agentCommand} effort <role> <level>.`,
            terminal.width,
          ).join("\n")}`,
        );
        continue;
      }
      const selected = await terminal.select(
        "Orchestration › ",
        [
          {
            value: "auto",
            label: "Auto",
            description: "Choose a deterministic preset from task risk.",
          },
          {
            value: "quality",
            label: "Quality",
            description: "Sol coordinator, Terra implementer, strongest review.",
          },
          {
            value: "balanced",
            label: "Balanced",
            description: "Default cost, latency, and verification balance.",
          },
          {
            value: "economy",
            label: "Economy",
            description: "Lower-cost models with failure-only Sol review.",
          },
          {
            value: "advanced",
            label: "Advanced role override",
            description: "Choose a role, model, and effort.",
          },
        ],
        currentProfile.preset,
      );
      if (selected === INTERRUPTED_INPUT || !selected) {
        write("Orchestration selection cancelled.");
        continue;
      }
      if (EDITABLE_PRESETS.includes(selected as typeof EDITABLE_PRESETS[number])) {
        const profile = presetProfile(
          selected as typeof EDITABLE_PRESETS[number],
        );
        const warning = await saveProfile(profile);
        write(
          `${orchestrationProfileText(profile, terminal.width)}${warning ? `\n${warning}` : ""}`,
        );
        continue;
      }
      if (selected !== "advanced" || !loadModelCatalog) {
        write("Advanced model discovery is unavailable.");
        continue;
      }
      const selectedRole = await terminal.select(
        "Role › ",
        ORCHESTRATION_ROLES.map((role) => ({
          value: role,
          label: role,
          description:
            role === "implementer"
              ? "The only role allowed to write."
              : "Read-only orchestration role.",
        })),
      );
      const role = roleName(selectedRole);
      if (!role) {
        write("Role selection cancelled.");
        continue;
      }
      let models: CliModelOption[];
      const activity = beginActivity("Discovering models");
      try {
        models = await loadModelCatalog();
        activity.settle("Model discovery complete");
      } catch (error) {
        activity.fail("Model discovery failed");
        write(
          terminalSafeText(error instanceof Error ? error.message : String(error)),
        );
        continue;
      }
      const selectedModelId = await terminal.select(
        "Model › ",
        models.map((model) => ({
          value: model.id,
          label: model.label,
          description: modelChoiceDescription(model),
        })),
        currentProfile.roles[role].modelId,
      );
      const model = models.find((candidate) => candidate.id === selectedModelId);
      if (!model) {
        write("Model selection cancelled.");
        continue;
      }
      const efforts =
        model.supportedThinkingEfforts.length > 0
          ? model.supportedThinkingEfforts
          : [...VALID_EFFORTS];
      const selectedEffort = await terminal.select(
        "Effort › ",
        efforts.map((effort) => ({
          value: effort,
          label: effort,
        })),
        currentProfile.roles[role].thinkingEffort,
      );
      if (!VALID_EFFORTS.has(selectedEffort as ThinkingEffort)) {
        write("Effort selection cancelled.");
        continue;
      }
      const profile = structuredClone(currentProfile);
      profile.preset = "custom";
      profile.roles[role] = {
        ...profile.roles[role],
        providerId: model.providerId ?? "codex-cli",
        modelId: model.id,
        thinkingEffort: selectedEffort as ThinkingEffort,
      };
      const warning = await saveProfile(profile);
      write(
        `${orchestrationProfileText(profile, terminal.width)}${warning ? `\n${warning}` : ""}`,
      );
      continue;
    }
    if (command.kind === "effort") {
      write(
        "The global /effort command was replaced. Use /settings agent effort <role> <level>.",
      );
      continue;
    }
    if (command.kind === "unknown") {
      write(renderUnknownCommand(command.value));
      continue;
    }

    let promptForTurn = command.value;
    let activeGoalForTurn = state.goal;
    let criteriaForTurn = [...(state.acceptanceCriteria ?? [])];
    let promptUnderstandingBasisForTurn: PromptUnderstandingBasisV1 | undefined;
    const pendingDraft = state.promptUnderstandingDraft;
    const resolvedClarificationBasis = pendingClarificationBasis;
    pendingClarificationBasis = undefined;
    if (pendingDraft && resolvedClarificationBasis) {
      imagesForTurn = promptUnderstandingImages.map((image) => ({ ...image }));
      promptForTurn = resolvedClarificationBasis.rawPrompt;
      activeGoalForTurn = resolvedClarificationBasis.activeGoal;
      criteriaForTurn = [...resolvedClarificationBasis.acceptanceCriteria];
      promptUnderstandingBasisForTurn = resolvedClarificationBasis;
    } else if (pendingDraft) {
      imagesForTurn = promptUnderstandingImages.map((image) => ({ ...image }));
      if (pendingDraft.requiresReconfirmation) {
        if (/^(confirm|yes)$/iu.test(command.value.trim())) {
          state.promptUnderstandingDraft = {
            ...pendingDraft,
            requiresReconfirmation: false,
          };
          await persist();
          write(
            pendingDraft.understanding.readiness ===
              "assumption_confirmation_required"
              ? promptAssumptionsText(pendingDraft.understanding.assumptions)
              : promptUnderstandingQuestionsText(
                  pendingDraft.understanding,
                  {
                    round: pendingDraft.clarificationRounds,
                    color: terminal.color,
                    themeId: terminal.themeId,
                  },
                ),
          );
          write(
            "Restored clarification confirmed. Your next message is used only as the pending response.",
          );
          continue;
        }
        clearPromptUnderstandingDraft();
        await persist();
        write(
          "Restored clarification was not reconfirmed, so it was discarded. Treating this as a new request.",
        );
      } else if (
        pendingDraft.understanding.readiness === "clarification_required"
      ) {
        const question = unansweredPromptQuestion(pendingDraft);
        if (!question) {
          clearPromptUnderstandingDraft();
          await persist();
          write(
            "Clarification state was incomplete and was discarded. Please restate the task.",
          );
          continue;
        }
        const answer = command.value.trim();
        if (!answer) {
          write("A clarification answer is required before planning.");
          continue;
        }
        const option = selectedPromptOption(question, answer);
        const basis: PromptUnderstandingBasisV1 = {
          ...pendingDraft.basis,
          clarificationAnswers: [
            ...pendingDraft.basis.clarificationAnswers,
            {
              questionId: question.id,
              answer: option?.label ?? answer,
              ...(option ? { selectedOptionId: option.id } : {}),
            },
          ],
        };
        state.promptUnderstandingDraft = promptUnderstandingDraft(
          basis,
          pendingDraft.understanding,
          pendingDraft.clarificationRounds,
        );
        await persist();
        promptForTurn = basis.rawPrompt;
        activeGoalForTurn = basis.activeGoal;
        criteriaForTurn = [...basis.acceptanceCriteria];
        promptUnderstandingBasisForTurn = basis;
      } else if (
        pendingDraft.understanding.readiness ===
        "assumption_confirmation_required"
      ) {
        if (!isApproval(command.value) && !isRejection(command.value)) {
          write(
            "Reply yes to confirm the listed assumptions or no to reject them.",
          );
          continue;
        }
        if (isRejection(command.value)) {
          clearPromptUnderstandingDraft();
          await persist();
          write(
            "Scope assumptions were not confirmed. No repository plan was created.",
          );
          continue;
        }
        const confirmed = pendingDraft.understanding.assumptions
          .filter((assumption) => assumption.affectsScope)
          .map((assumption) => ({
            assumptionId: assumption.id,
            text: assumption.text,
          }));
        const known = new Set(
          pendingDraft.basis.confirmedAssumptions.map(
            (assumption) => assumption.assumptionId,
          ),
        );
        const basis: PromptUnderstandingBasisV1 = {
          ...pendingDraft.basis,
          confirmedAssumptions: [
            ...pendingDraft.basis.confirmedAssumptions,
            ...confirmed.filter(
              (assumption) => !known.has(assumption.assumptionId),
            ),
          ],
        };
        state.promptUnderstandingDraft = promptUnderstandingDraft(
          basis,
          pendingDraft.understanding,
          pendingDraft.clarificationRounds,
        );
        await persist();
        promptForTurn = basis.rawPrompt;
        activeGoalForTurn = basis.activeGoal;
        criteriaForTurn = [...basis.acceptanceCriteria];
        promptUnderstandingBasisForTurn = basis;
      } else {
        clearPromptUnderstandingDraft();
        await persist();
      }
    }
    if (!pendingDraft) {
      promptUnderstandingImages = imagesForTurn.map((image) => ({ ...image }));
    }

    let liveInput: LiveComposerHandle | undefined;
    const turnTimer = new ActiveTurnTimer(options.now);
    const turnTelemetryStages: NonNullable<
      CliSessionSnapshot["lastTurnTelemetry"]
    >["stages"] = [];
    let repositorySnapshotChars: number | undefined;
    let turnDurationWritten = false;
    let cancellationRequestWritten = false;
    let cancellationWritten = false;
    const writeCancellationRequest = (): void => {
      if (cancellationRequestWritten) return;
      cancellationRequestWritten = true;
      write("Warning · Cancellation requested; waiting for safe cleanup.");
    };
    const writeCancellationComplete = (): void => {
      if (cancellationWritten) return;
      cancellationWritten = true;
      write(
        `Cancelled · active agent operation stopped${
          pendingPrompts.length > 0
            ? ` · ${pendingPrompts.length} pending paused`
            : ""
        }.`,
      );
    };
    const finishTurn = (status: TurnDurationStatus): void => {
      if (turnDurationWritten) return;
      turnDurationWritten = true;
      void refreshProviderUsage();
      if (!state.promptUnderstandingDraft) {
        state.nextMinimumTier = undefined;
      }
      const elapsedMs = turnTimer.finish();
      state.lastTurnTelemetry = {
        schemaVersion: 1,
        totalDurationMs: elapsedMs,
        stages: turnTelemetryStages.slice(0, 12),
        ...(repositorySnapshotChars === undefined
          ? {}
          : { repositorySnapshotChars }),
        recordedAt: new Date(options.now?.() ?? Date.now()).toISOString(),
      };
      const variants = turnDurationLineVariants(status, elapsedMs, {
        color: terminal.color,
        themeId: terminal.themeId,
      }).map((variant) => `\n${variant}` as TerminalOutput);
      if (terminal.writeCentered) {
        terminal.writeCentered(variants);
      } else {
        write(
          `\n${turnDurationLine(status, elapsedMs, {
            color: terminal.color,
            themeId: terminal.themeId,
            width: terminal.width,
          })}`,
        );
      }
      pendingComposerDraft = liveInput?.close() ?? pendingComposerDraft;
      liveInput = undefined;
    };
    const deferredLiveSubmissions: LiveComposerSubmission[] = [];
    let dispatchLiveSubmission = (
      submission: LiveComposerSubmission,
    ): LiveComposerSubmissionResult | void => {
      if (submission.kind === "stop") {
        writeCancellationRequest();
        liveInput?.setContext({
          phase: "stopping",
          pendingCount: pendingPrompts.length,
          paused: pendingPrompts.length > 0,
          status: phaseComposerStatusContext(
            state.orchestrationProfile?.preset ?? "custom",
            "stopping",
          ),
        });
      }
      if (submission.kind === "edit_pending") {
        const pending = pendingPrompts.pop();
        if (!pending) {
          write("Pending · no messages are waiting.");
          return;
        }
        if (pendingPrompts.length === 0) pendingPaused = false;
        liveInput?.setContext({
          phase: "preparing",
          pendingCount: pendingPrompts.length,
          paused: pendingPaused,
          status: phaseComposerStatusContext(
            state.orchestrationProfile?.preset ?? "custom",
            "preparing",
          ),
        });
        write(
          `Pending edit · recalled newest message · ${pendingPrompts.length} remaining.`,
        );
        return { draft: cloneComposerDraft(pending.draft) };
      }
      if (submission.kind === "clear_pending") {
        const removed = pendingPrompts.length;
        pendingPrompts.splice(0);
        pendingPaused = false;
        liveInput?.setContext({
          phase: "preparing",
          pendingCount: 0,
          paused: false,
          status: phaseComposerStatusContext(
            state.orchestrationProfile?.preset ?? "custom",
            "preparing",
          ),
        });
        write(
          `Pending cleared · removed ${removed} message${removed === 1 ? "" : "s"}.`,
        );
        return;
      }
      deferredLiveSubmissions.push(submission);
    };
    if (terminal.beginLiveInput && !liveInput) {
      liveInput = terminal.beginLiveInput(
        {
          phase: "preparing",
          pendingCount: pendingPrompts.length,
          paused: pendingPaused,
          status: phaseComposerStatusContext(
            state.orchestrationProfile?.preset ?? "custom",
            "preparing",
          ),
        },
        (submission) => dispatchLiveSubmission(submission),
        pendingComposerDraft,
      );
      pendingComposerDraft = "";
    }
    const providerActivity = beginActivity("Checking Codex provider");
    let provider: ProviderStatus;
    try {
      provider = await options.probeProvider();
    } catch (error) {
      providerActivity.fail("Provider check failed");
      write(
        `Codex CLI check failed: ${terminalSafeText(
          error instanceof Error ? error.message : String(error),
        )}`,
      );
      finishTurn("failed");
      continue;
    }
    if (
      provider.ready &&
      state.activityDetails !== "full"
    ) {
      providerActivity.stop();
    } else {
      providerActivity.settle(
        provider.ready ? "Provider ready" : "Provider unavailable",
      );
    }
    state.providerReady = provider.ready;
    state.providerDetail = provider.detail;
    if (!provider.ready) {
      write(
        `Codex CLI is not ready: ${terminalSafeText(provider.detail)}\nRun ${
          terminalSafeText(provider.remediationCommand ?? "orynt setup")
        }, then use /status.`,
      );
      finishTurn("failed");
      continue;
    }
    if (!options.turn) {
      write("Conversational agent is unavailable in this host.");
      finishTurn("failed");
      continue;
    }

    let turnProfile: ResolvedOrchestrationProfile;
    const profileActivity = beginActivity("Resolving orchestration profile");
    try {
      turnProfile = await resolveSessionProfile(
        state,
        loadModelCatalog,
        promptForTurn,
      );
      synchronizeContextForModel(turnProfile.roles.coordinator.modelId);
      if (state.activityDetails === "full") {
        profileActivity.settle("Orchestration profile ready");
      } else {
        profileActivity.stop();
      }
    } catch (error) {
      profileActivity.fail("Orchestration blocked");
      write(
        `Orchestration blocked: ${terminalSafeText(
          error instanceof Error ? error.message : String(error),
        )}`,
      );
      finishTurn("failed");
      continue;
    }
    const coordinatorStartedAt = new Date().toISOString();
    const logicalTurnId = `coordinate-${randomUUID()}`;
    let turnResult: CliAgentTurnResult;
    let coordinatorStream: InlineMessageStreamHandle | undefined;
    let coordinatorMessageItemId: string | undefined;
    const coordinatorToolCalls = new Set<string>();
    const coordinatorFailedToolCalls = new Set<string>();
    const coordinatorPersistedToolCalls = new Set<string>();
    const currentRequestMessages = [promptForTurn];
    const currentRequestImages = imagesForTurn.map((image) => ({ ...image }));
    let liveContext: LiveComposerContext = {
      phase: "coordinating",
      pendingCount: pendingPrompts.length,
      paused: pendingPaused,
      status: {
        ...activeComposerStatusContext(
          state.orchestrationProfile?.preset ?? "custom",
          "coordinator",
          turnProfile,
        ),
        ...(state.context ? { context: state.context } : {}),
      },
    };
    let activeAgentContext = state.context
      ? structuredClone(state.context)
      : undefined;
    let activeTurnSignal: AbortSignal | undefined;
    let stopLiveOperation = (): void => undefined;
    let restartRequested = false;
    let stopRequested = false;
    const updateLiveContext = (
      patch: Partial<LiveComposerContext> = {},
    ): void => {
      liveContext = {
        ...liveContext,
        pendingCount: pendingPrompts.length,
        paused: pendingPaused,
        ...patch,
      };
      if (liveContext.status) {
        const statusContext =
          liveContext.status.mode === "active"
            ? activeAgentContext
            : state.context;
        liveContext.status = {
          ...liveContext.status,
          ...(statusContext ? { context: statusContext } : {}),
        };
        if (!statusContext) delete liveContext.status.context;
      }
      liveInput?.setContext(liveContext);
    };
    const canonicalCurrentPrompt = (): string => {
      if (currentRequestMessages.length === 1) {
        return currentRequestMessages[0]!;
      }
      return [
        "Ordered current-request messages (oldest to newest). A later message supersedes only wording it explicitly corrects; otherwise it adds to the request:",
        JSON.stringify(currentRequestMessages),
      ].join("\n");
    };
    const handleLiveSubmission = (
      submission: LiveComposerSubmission,
    ): LiveComposerSubmissionResult | void => {
      if (submission.kind === "edit_pending") {
        const pending = pendingPrompts.pop();
        if (!pending) {
          write("Pending · no messages are waiting.");
          updateLiveContext();
          return;
        }
        if (pendingPrompts.length === 0) pendingPaused = false;
        updateLiveContext();
        write(
          `Pending edit · recalled newest message · ${pendingPrompts.length} remaining.`,
        );
        return { draft: cloneComposerDraft(pending.draft) };
      }
      if (submission.kind === "clear_pending") {
        const removed = pendingPrompts.length;
        pendingPrompts.splice(0);
        pendingPaused = false;
        updateLiveContext();
        write(
          `Pending cleared · removed ${removed} message${removed === 1 ? "" : "s"}.`,
        );
        return;
      }
      if (submission.kind === "stop") {
        stopRequested = true;
        pendingPaused = pendingPrompts.length > 0;
        updateLiveContext({ phase: "stopping" });
        writeCancellationRequest();
        stopLiveOperation();
        return;
      }
      const parsed = parseInteractiveInput(submission.value);
      if (parsed.kind === "stop") {
        stopRequested = true;
        pendingPaused = pendingPrompts.length > 0;
        updateLiveContext({ phase: "stopping" });
        writeCancellationRequest();
        stopLiveOperation();
        return;
      }
      if (parsed.kind === "pending") {
        managePending(parsed.value);
        updateLiveContext();
        return;
      }
      if (parsed.kind === "next") {
        enqueuePrompt(parsed.value, [], submission.draft);
        updateLiveContext();
        return;
      }
      if (parsed.kind !== "prompt") {
        write(
          "That command is available when the active operation is idle. Use /next <message>, /stop, or /pending.",
        );
        return;
      }
      if (
        submission.delivery === "next" ||
        promptUnderstandingBasisForTurn ||
        liveContext.phase !== "coordinating"
      ) {
        enqueuePrompt(
          parsed.value,
          submission.images ?? [],
          submission.draft,
        );
        updateLiveContext();
        return;
      }
      const candidateMessages = [...currentRequestMessages, parsed.value];
      const candidatePrompt = [
        "Ordered current-request messages (oldest to newest). A later message supersedes only wording it explicitly corrects; otherwise it adds to the request:",
        JSON.stringify(candidateMessages),
      ].join("\n");
      if (Buffer.byteLength(candidatePrompt) > 64 * 1024) {
        write(
          "Current request not updated · the combined 64 KiB prompt limit was exceeded. Use /next instead.",
        );
        pendingComposerDraft = promptDraft(
          parsed.value,
          submission.images ?? [],
          submission.draft,
        );
        return;
      }
      currentRequestMessages.push(parsed.value);
      currentRequestImages.push(
        ...(submission.images ?? []).map((image) => ({ ...image })),
      );
      restartRequested = true;
      write(
        `Current request updated · restarting with ${currentRequestMessages.length} messages.`,
      );
      if (activeTurnSignal) options.cancelRunSignal?.(activeTurnSignal);
    };
    dispatchLiveSubmission = handleLiveSubmission;
    if (liveInput) {
      liveInput.setContext(liveContext);
    } else if (terminal.beginLiveInput) {
      liveInput = terminal.beginLiveInput(
        liveContext,
        handleLiveSubmission,
        pendingComposerDraft,
      );
      pendingComposerDraft = "";
    }
    for (const submission of deferredLiveSubmissions) {
      handleLiveSubmission(submission);
    }
    if (stopRequested) {
      writeCancellationComplete();
      finishTurn("cancelled");
      continue;
    }
    let effectiveSkillContext: SkillContextSnapshot | undefined;
    const effectiveSkillIds: string[] = [];
    const resolveTurnSkillContext = async (
      signal: AbortSignal | undefined,
    ): Promise<{
      context?: SkillContextSnapshot;
      attachments: Array<{
        skillId: string;
        source: "explicit" | "auto";
      }>;
      skipped: Array<{ skillId: string; reason: string }>;
    }> => {
      const contexts: SkillContextSnapshot[] = [];
      const attachments: Array<{
        skillId: string;
        source: "explicit" | "auto";
      }> = [];
      const skipped: Array<{ skillId: string; reason: string }> = [];
      const explicitIds = [...new Set(state.selectedSkillIds ?? [])].sort();
      if (explicitIds.length > 0) {
        if (!options.snapshotSkills) {
          throw new Error("Agent Skill snapshot runtime is unavailable");
        }
        contexts.push(await options.snapshotSkills({
          repositoryPath: state.repositoryPath,
          runId: `${logicalTurnId}:explicit`,
          skillIds: explicitIds,
        }));
        attachments.push(
          ...explicitIds.map((skillId) => ({
            skillId,
            source: "explicit" as const,
          })),
        );
      }
      if (
        skillRouting === "auto_trusted" &&
        options.listSkills &&
        options.routeSkills &&
        options.snapshotSkills
      ) {
        try {
          const inventory = await options.listSkills(state.repositoryPath);
          const candidates = inventory
            .filter((skill) =>
              skill.eligible &&
              skill.trust === "trusted" &&
              !explicitIds.includes(skill.id)
            )
            .map((skill) => ({
              id: skill.id,
              name: skill.name,
              description: skill.description,
            }));
          const lightBinding =
            state.modelTierConfiguration?.tiers.light ??
            turnProfile.roles.coordinator;
          const routed = await options.routeSkills({
            prompt: promptForTurn,
            ...(activeGoalForTurn ? { activeGoal: activeGoalForTurn } : {}),
            candidates,
            modelId: lightBinding.modelId,
            ...(lightBinding.providerId
              ? { providerId: lightBinding.providerId }
              : {}),
            thinkingEffort: lightBinding.thinkingEffort,
            ...(signal ? { signal } : {}),
            timeoutMs: lightBinding.maxWallTimeMs,
          });
          for (const skillId of routed.skillIds) {
            try {
              contexts.push(await options.snapshotSkills({
                repositoryPath: state.repositoryPath,
                runId: `${logicalTurnId}:auto:${skillId}`,
                skillIds: [skillId],
              }));
              attachments.push({ skillId, source: "auto" });
            } catch (error) {
              skipped.push({
                skillId,
                reason: error instanceof Error ? error.message : String(error),
              });
            }
          }
        } catch (error) {
          if (signal?.aborted) throw error;
          skipped.push({
            skillId: "auto-selection",
            reason: error instanceof Error ? error.message : String(error),
          });
        }
      }
      effectiveSkillContext = mergeSkillContexts(logicalTurnId, contexts);
      effectiveSkillIds.splice(
        0,
        effectiveSkillIds.length,
        ...attachments.map(({ skillId }) => skillId),
      );
      return {
        ...(effectiveSkillContext ? { context: effectiveSkillContext } : {}),
        attachments,
        skipped,
      };
    };
    coordinatorLoop: for (;;) {
      restartRequested = false;
      promptForTurn = canonicalCurrentPrompt();
      const coordinator = turnProfile.roles.coordinator;
      let coordinatorActivity: InlineActivityHandle | undefined = beginActivity(
        `Coordinate ${coordinator.modelId} · ${coordinator.thinkingEffort}`,
        { fallbackRow: true },
      );
      const turnSignal = options.prepareRunSignal?.();
      activeTurnSignal = turnSignal;
      stopLiveOperation = () => {
        if (activeTurnSignal) options.cancelRunSignal?.(activeTurnSignal);
      };
      if (stopRequested) {
        coordinatorActivity?.stop();
        if (turnSignal) options.releaseRunSignal?.(turnSignal);
        activeTurnSignal = undefined;
        writeCancellationComplete();
        finishTurn("cancelled");
        continue sessionLoop;
      }
      try {
        const result = await options.turn({
          sessionId: state.sessionId,
          prompt: promptForTurn,
          ...(currentRequestImages.length > 0
            ? { images: currentRequestImages.map((image) => ({ ...image })) }
            : {}),
          repositoryPath: state.repositoryPath,
          modelId: coordinator.modelId,
          providerId: coordinator.providerId,
          thinkingEffort: coordinator.thinkingEffort,
          activeGoal: activeGoalForTurn,
          acceptanceCriteria: criteriaForTurn,
          conversationSummary: state.conversationSummary,
          recentTurns: [...recentTurns],
          capabilitySettings: capabilityRuntime,
          ...(state.context ? { context: state.context } : {}),
          ...(state.providerThreadId
            ? { providerThreadId: state.providerThreadId }
            : {}),
          ...(promptUnderstandingBasisForTurn
            ? { promptUnderstandingBasis: promptUnderstandingBasisForTurn }
            : {}),
          resolveSkillContext: () => resolveTurnSkillContext(turnSignal),
          onTelemetry: (event) => {
            if (event.kind === "repository_snapshot") {
              repositorySnapshotChars = event.characters;
              return;
            }
            turnTelemetryStages.push({
              name: event.name,
              durationMs: event.durationMs,
            });
          },
          onActivity: (event) => {
            if (event.kind === "message") {
              coordinatorActivity?.stop();
              coordinatorActivity = undefined;
              let stream = coordinatorStream;
              if (
                coordinatorMessageItemId !== event.itemId ||
                stream === undefined
              ) {
                coordinatorStream?.finish();
                stream = beginTerminalMessageStream(
                  terminal,
                  "Agent",
                );
                coordinatorStream = stream;
                coordinatorMessageItemId = event.itemId;
              }
              stream.update(event.text);
              if (
                event.status === "completed" ||
                event.status === "failed"
              ) {
                stream.finish();
              }
              return;
            }
            const detail = compactAgentActivity(event);
            if (
              event.kind === "skill" &&
              state.activityDetails === "full"
            ) {
              write(
                event.status === "failed"
                  ? `  ✕ ${detail}`
                  : `  ◇ ${detail}`,
              );
              return;
            }
            if (event.kind === "tool") {
              if (event.status === "started") {
                coordinatorStream?.finish();
                coordinatorStream = undefined;
                coordinatorMessageItemId = undefined;
                coordinatorActivity ??= beginActivity(detail, {
                  immediate: true,
                });
                coordinatorActivity.update(detail);
              }
              if (event.status === "completed" || event.status === "failed") {
                coordinatorActivity?.stop();
                coordinatorActivity = undefined;
                coordinatorToolCalls.add(event.itemId);
                if (event.status === "failed") {
                  coordinatorFailedToolCalls.add(event.itemId);
                }
              }
              if (
                state.activityDetails === "full" &&
                (event.status === "completed" || event.status === "failed") &&
                !coordinatorPersistedToolCalls.has(event.itemId)
              ) {
                coordinatorPersistedToolCalls.add(event.itemId);
                write(toolActivityLine(event));
                return;
              }
            }
            if (
              event.status === "completed" &&
              state.activityDetails === "full"
            ) {
              write(`  ◇ ${detail}`);
            } else {
              coordinatorActivity ??= beginActivity(detail);
              coordinatorActivity.update(detail);
            }
          },
          onContext: (context) => {
            state.context = context;
            activeAgentContext = structuredClone(context);
            updateLiveContext();
          },
          signal: turnSignal,
        });
        if (restartRequested) {
          coordinatorStream?.abort();
          coordinatorStream = undefined;
          coordinatorActivity?.stop();
          continue coordinatorLoop;
        }
        turnResult = result;
        if (state.activityDetails === "full") {
          coordinatorActivity?.settle(
            `Coordinate ${coordinator.modelId} · ${coordinator.thinkingEffort}`,
          );
        } else {
          coordinatorActivity?.stop();
        }
        break coordinatorLoop;
      } catch (error) {
        coordinatorStream?.abort();
        coordinatorStream = undefined;
        if (restartRequested && !stopRequested) {
          coordinatorActivity?.stop();
          continue coordinatorLoop;
        }
        coordinatorActivity?.fail(
          turnSignal?.aborted ? "Coordinate cancelled" : "Coordinate failed",
        );
        if (turnSignal?.aborted) {
          writeCancellationComplete();
        } else {
          write(
            `Agent turn failed: ${terminalSafeText(error instanceof Error ? error.message : String(error))}`,
          );
        }
        finishTurn(turnSignal?.aborted ? "cancelled" : "failed");
        continue sessionLoop;
      } finally {
        activeTurnSignal = undefined;
        if (turnSignal) options.releaseRunSignal?.(turnSignal);
      }
    }
    updateLiveContext({
      phase: "preparing",
      status: phaseComposerStatusContext(
        state.orchestrationProfile?.preset ?? "custom",
        "planning",
      ),
    });
    if (stopRequested) {
      writeCancellationComplete();
      finishTurn("cancelled");
      continue;
    }
    const coordinator = turnProfile.roles.coordinator;
    const coordinatorInvocation = completedInvocation({
      taskId: `coordinate-turn-${(state.turnCount ?? 0) + 1}`,
      role: "coordinator",
      providerId: coordinator.providerId,
      modelId: coordinator.modelId,
      thinkingEffort: coordinator.thinkingEffort,
      modelTier: coordinator.modelTier,
      routingReasonCodes: coordinator.routingReasonCodes,
      context: promptForTurn,
      startedAt: coordinatorStartedAt,
    });

    const redactedSummary = redactSensitivePayload(turnResult.conversationSummary).payload;
    const redactedReply = redactSensitivePayload(turnResult.reply).payload;
    const safeReply =
      typeof redactedReply === "string" ? redactedReply : "Agent response unavailable.";
    if (coordinatorStream) {
      coordinatorStream.finish(safeReply);
    } else {
      const finalStream = beginTerminalMessageStream(terminal, "Agent");
      finalStream.finish(safeReply);
    }
    if (state.activityDetails === "full") {
      write(
        activityAuditSummary(
          coordinatorToolCalls.size,
          coordinatorFailedToolCalls.size,
          effectiveSkillIds.length,
        ),
      );
    }
    state.conversationSummary =
      typeof redactedSummary === "string"
        ? redactedSummary.slice(0, 4_000)
        : "Conversation summary unavailable.";
    state.turnCount = (state.turnCount ?? 0) + 1;
    if (turnResult.context) state.context = turnResult.context;
    if (turnResult.providerThreadId) {
      state.providerThreadId = turnResult.providerThreadId;
    }
    recentTurns.push(
      ...currentRequestMessages.map(
        (content): CliConversationTurn => ({ role: "user", content }),
      ),
      { role: "agent", content: safeReply },
    );
    if (recentTurns.length > 12) {
      recentTurns.splice(0, recentTurns.length - 12);
    }
    const recordedAt = new Date().toISOString();
    state.recentTurns = recentTurns.map(({ role, content }) => ({
      role,
      content,
      recordedAt,
    }));
    if (state.sessionId && options.appendTranscript) {
      state.transcript = await options.appendTranscript(
        state.sessionId,
        logicalTurnId,
        [
          ...currentRequestMessages.map((content) => ({
            role: "user" as const,
            content,
          })),
          { role: "agent", content: safeReply },
        ],
        recordedAt,
      );
    }
    await persist();

    const understanding = turnResult.promptUnderstanding;
    const understandingBasis = turnResult.promptUnderstandingBasis;
    if (
      understanding &&
      understanding.outcome === "repository_action" &&
      understanding.readiness !== "ready"
    ) {
      const nextClarificationRound =
        (pendingDraft?.clarificationRounds ?? 0) + 1;
      if (nextClarificationRound > 3) {
        clearPromptUnderstandingDraft();
        await persist();
        write(
          "Task clarification stopped after three rounds. No repository plan was created; please restate the task with the missing constraints.",
        );
        finishTurn("failed");
        continue;
      }
      if (!understandingBasis) {
        write(
          "Task clarification blocked because its immutable prompt basis was unavailable.",
        );
        finishTurn("failed");
        continue;
      }
      state.promptUnderstandingDraft = promptUnderstandingDraft(
        understandingBasis,
        understanding,
        nextClarificationRound,
      );
      await persist();
      if (
        understanding.readiness === "clarification_required" &&
        terminal.clarify
      ) {
        turnTimer.pause();
        const pauseLiveInput = liveInput?.pauseForModal();
        let clarificationResult: ClarificationResult;
        try {
          clarificationResult = await terminal.clarify(
            promptClarificationRequest(
              understanding,
              nextClarificationRound,
            ),
          );
        } finally {
          pendingComposerDraft =
            liveInput?.close() ?? pendingComposerDraft;
          liveInput = undefined;
          pauseLiveInput?.();
          turnTimer.resume();
        }
        if (clarificationResult.status === "cancelled") {
          write(
            "Task clarification cancelled. No repository plan was created.",
          );
          finishTurn("cancelled");
          continue;
        }
        const resolvedBasis = clarificationBasis(
          understandingBasis,
          understanding,
          clarificationResult,
        );
        state.promptUnderstandingDraft = promptUnderstandingDraft(
          resolvedBasis,
          understanding,
          nextClarificationRound,
        );
        await persist();
        write(
          clarificationSummaryText(
            understanding,
            clarificationResult,
          ),
        );
        pendingClarificationBasis = resolvedBasis;
        finishTurn("success");
        continue;
      }
      write(
        understanding.readiness === "clarification_required"
          ? promptUnderstandingQuestionsText(understanding, {
              round: nextClarificationRound,
              color: terminal.color,
              themeId: terminal.themeId,
            })
          : promptAssumptionsText(understanding.assumptions),
      );
      finishTurn("success");
      continue;
    }
    if (
      understanding?.outcome === "repository_action" &&
      understanding.readiness === "ready" &&
      !understandingBasis
    ) {
      write(
        "Task planning blocked because ready prompt understanding lost its immutable prompt basis.",
      );
      finishTurn("failed");
      continue;
    }
    if (understanding && understanding.readiness === "ready") {
      clearPromptUnderstandingDraft();
      await persist();
    }

    if (turnResult.disposition === "answer" || turnResult.disposition === "clarify") {
      finishTurn("success");
      continue;
    }
    if (turnResult.disposition === "takeover_required") {
      write(paintPrefix(
        theme,
        "attention",
        "Takeover required · this repository-only build cannot execute host, root, network, secret, or outside-repository capabilities.",
        "Takeover required",
      ));
      finishTurn("success");
      continue;
    }
    if (!turnResult.action) {
      write(paintPrefix(
        theme,
        "danger",
        "Action blocked · the agent did not return a valid bounded action plan.",
        "Action blocked",
      ));
      finishTurn("failed");
      continue;
    }

    const implementerBudget = turnProfile.roles.implementer;
    let taskPlan: RepositoryTaskPlanV1;
    try {
      taskPlan = buildBoundRepositoryTaskPlan({
        action: turnResult.action,
        prompt: promptForTurn,
        activeGoal: activeGoalForTurn,
        acceptanceCriteria: criteriaForTurn,
        ...(turnResult.promptUnderstandingBasis &&
        turnResult.promptUnderstanding
          ? {
              promptUnderstandingBasis: turnResult.promptUnderstandingBasis,
              promptUnderstanding: turnResult.promptUnderstanding,
            }
          : {}),
        maxModelTokens: implementerBudget.maxTokens,
        maxWallTimeMs: implementerBudget.maxWallTimeMs,
        ...(implementerBudget.maxUsd === undefined
          ? {}
          : { maxUsd: implementerBudget.maxUsd }),
      });
    } catch (error) {
      write(
        paintPrefix(
          theme,
          "danger",
          `Task planning blocked · ${terminalSafeText(
            error instanceof Error ? error.message : String(error),
          )}`,
          "Task planning blocked",
        ),
      );
      finishTurn("failed");
      continue;
    }
    const planOperations = [
      ...new Set(taskPlan.tasks.flatMap((task) => task.operations)),
    ];
    const authorizationAction: ProposedRepositoryAction = {
      ...turnResult.action,
      operations: planOperations,
      estimatedPaths: [...taskPlan.pathEnvelope],
      estimatedChangedFiles: taskPlan.pathEnvelope.length,
    };
    const authorization = evaluateAgentAction(authorizationAction);
    const approvedPlanDigest = taskPlan.digest;
    write(
      [
        `Task plan ${taskPlan.id} · revision ${taskPlan.revision} · ${taskPlan.tasks.length} task${taskPlan.tasks.length === 1 ? "" : "s"}`,
        ...taskPlan.tasks.map(
          (task, index) =>
            `  ${index + 1}. ${terminalSafeText(task.title)} · ${task.authority}${task.dependencies.length > 0 ? ` · after ${task.dependencies.join(", ")}` : ""}`,
        ),
        `  Digest ${taskPlan.digest}`,
      ].join("\n"),
    );
    if (authorization.decision === "takeover_required") {
      write(paintPrefix(
        theme,
        "attention",
        `Takeover required · ${terminalSafeText(authorization.reasons.join(" "))}\nThis repository-only build did not execute the action.`,
        "Takeover required",
      ));
      finishTurn("success");
      continue;
    }
    if (!await persist()) {
      write(
        "Repository action blocked because the current session could not be saved. No approval was requested and no repository work was started.",
      );
      finishTurn("failed");
      continue;
    }
    let authorizationSource: "automatic_policy" | "operator" = "automatic_policy";
    if (authorization.decision === "approval_required") {
      write(
        approvalText(
          state,
          authorizationAction,
          authorization,
          { color: terminal.color, themeId: terminal.themeId },
        ),
      );
      turnTimer.pause();
      const restoreLiveInput = liveInput?.pauseForModal();
      const approval = await terminal.ask("Run this sensitive action? [y/N] ");
      restoreLiveInput?.();
      turnTimer.resume();
      if (approval === INTERRUPTED_INPUT) {
        write("Action approval interrupted. No repository action was started.");
        appendConversationOutcome(
          state,
          "operator interrupted approval; no repository action was started.",
        );
        await persist();
        finishTurn("cancelled");
        continue;
      }
      if (!isApproval(approval)) {
        write("Action cancelled before execution.");
        appendConversationOutcome(
          state,
          "operator denied the proposed repository action.",
        );
        await persist();
        finishTurn("cancelled");
        continue;
      }
      authorizationSource = "operator";
    } else {
      write(
        `${theme.paint("muted", "✓")} Auto-authorized · ${terminalSafeText(authorization.reasons.join(" "))}`,
      );
    }

    if (effectiveSkillIds.length > 0) {
      let labels = [...effectiveSkillIds];
      try {
        const inventory = await options.listSkills?.(state.repositoryPath);
        if (inventory) {
          const names = new Map(inventory.map((skill) => [skill.id, skill.name]));
          labels = labels.map((skillId) => names.get(skillId) ?? skillId);
        }
      } catch {
        // The authoritative runtime attachment path will report inventory failures.
      }
      write(
        `  ◇ Skills ${labels.map((label) => terminalSafeText(label)).join(", ")}`,
      );
    }

    const presenter = new RunPresenter({
      color: terminal.color,
      themeId: terminal.themeId,
      activityDetails: state.activityDetails,
    });
    let runMessageStream: InlineMessageStreamHandle | undefined;
    let runMessageItemId: string | undefined;
    const runSignal = options.prepareRunSignal?.();
    liveContext = {
      phase: "executing",
      pendingCount: pendingPrompts.length,
      paused: pendingPaused,
      status: activeComposerStatusContext(
        state.orchestrationProfile?.preset ?? "custom",
        "implementer",
        turnProfile,
      ),
    };
    if (liveInput) {
      liveInput.setContext(liveContext);
    } else if (terminal.beginLiveInput) {
      liveInput = terminal.beginLiveInput(
        liveContext,
        handleLiveSubmission,
        pendingComposerDraft,
      );
      pendingComposerDraft = "";
    }
    stopLiveOperation = () => {
      if (runSignal) options.cancelRunSignal?.(runSignal);
    };
    state.mode = "bounded_execute";
    let executionProfile: ResolvedOrchestrationProfile | undefined;
    let operationActivity: InlineActivityHandle | undefined;
    try {
      executionProfile = turnProfile;
      const implementer = executionProfile.roles.implementer;
      const plannedHelperTasks =
        options.readOnlyRole &&
        capabilityRuntime.subagents.mode !== "off" &&
        !executionProfile.omittedRoles.includes("helper")
          ? turnResult.action.helperTasks.slice(
              0,
              Math.min(
                executionProfile.maxReadOnlyHelpers,
                capabilityRuntime.subagents.maxConcurrency,
              ),
            )
          : [];
      const orchestrationPlan: OrchestrationPlan = {
        schemaVersion: 1,
        id: `plan-${randomUUID()}`,
        runId: "pending-controlled-run",
        parentTaskId: coordinatorInvocation.taskId,
        summary: turnResult.action.rationale,
        createdAt: new Date().toISOString(),
        tasks: [
          ...plannedHelperTasks.map((task) => ({
            id: task.id,
            role: "helper" as const,
            title: task.title,
            instruction: task.instruction,
            dependencies: [],
            authority: "read_only" as const,
            expectedPaths: task.expectedPaths,
            expectedArtifacts: ["helper-summary"],
            depth: 1,
          })),
          {
            id: `implement-${randomUUID()}`,
            role: "implementer",
            title: "Implement approved repository action",
            instruction: turnResult.action.instruction,
            dependencies: plannedHelperTasks.map((task) => task.id),
            authority: "single_writer",
            expectedPaths: [...turnResult.action.estimatedPaths],
            expectedArtifacts: ["controlled-diff", "verifier-verdict"],
            depth: 1,
          },
          ...(options.readOnlyRole &&
          !executionProfile.omittedRoles.includes("reviewer")
            ? [
                {
                  id: `review-${randomUUID()}`,
                  role: "reviewer" as const,
                  title: "Review verified repository action",
                  instruction: turnResult.action.instruction,
                  dependencies: [],
                  authority: "read_only" as const,
                  expectedPaths: [...turnResult.action.estimatedPaths],
                  expectedArtifacts: ["review-summary"],
                  depth: 1,
                },
              ]
            : []),
        ],
      };
      validateOrchestrationPlan(orchestrationPlan, executionProfile);
      const priorInvocations: ModelInvocationRecord[] = [
        coordinatorInvocation,
      ];
      let implementationInstruction = turnResult.action.instruction;
      if (
        options.readOnlyRole &&
        !executionProfile.omittedRoles.includes("helper") &&
        turnResult.action.helperTasks.length > 0
      ) {
        const helper = executionProfile.roles.helper;
        const helperTasks = plannedHelperTasks;
        activeAgentContext =
          contextControllerForModel(helper.modelId)?.snapshot();
        updateLiveContext({
          phase: "executing",
          status: activeComposerStatusContext(
            state.orchestrationProfile?.preset ?? "custom",
            "helper",
            executionProfile,
          ),
        });
        operationActivity = beginActivity(
          `Helpers ${helperTasks.length} read-only task${helperTasks.length === 1 ? "" : "s"} · ${helper.modelId}`,
          { fallbackRow: true },
        );
        const helperResults = await Promise.all(
          helperTasks.map(async (task) => {
            const startedAt = new Date().toISOString();
            const helperLifecycleContext =
              contextControllerForModel(helper.modelId)?.snapshot();
            try {
              const rawResult = await options.readOnlyRole?.({
                sessionId: state.sessionId,
                invocationId: task.id,
                role: "helper",
                instruction: task.instruction,
                repositoryPath: state.repositoryPath,
                modelId: helper.modelId,
                thinkingEffort: helper.thinkingEffort,
                context: `Expected paths: ${task.expectedPaths.join(", ") || "not declared"}`,
                ...(helperLifecycleContext
                  ? { lifecycleContext: helperLifecycleContext }
                  : {}),
                onContext: (context) => {
                  activeAgentContext = structuredClone(context);
                  updateLiveContext({
                    status: {
                      ...activeComposerStatusContext(
                        state.orchestrationProfile?.preset ?? "custom",
                        "helper",
                        executionProfile!,
                      ),
                      role: `helper:${task.id}`,
                    },
                  });
                },
                onActivity: (event) => {
                  if (event.kind === "message") return;
                  const detail = compactAgentActivity(event);
                  if (event.status === "completed") {
                    write(`  ◇ ${detail}`);
                  } else {
                    operationActivity?.update(detail);
                  }
                },
                signal: runSignal,
                timeoutMs: helper.maxWallTimeMs,
              });
              const result = rawResult
                ? redactSensitivePayload(rawResult).payload
                : undefined;
              if (result) {
                priorInvocations.push(
                  completedInvocation({
                    taskId: task.id,
                    role: "helper",
                    providerId: helper.providerId,
                    modelId: helper.modelId,
                    thinkingEffort: helper.thinkingEffort,
                    modelTier: helper.modelTier,
                    routingReasonCodes: helper.routingReasonCodes,
                    context: task.instruction,
                    startedAt,
                    parentInvocationId: coordinatorInvocation.id,
                  }),
                );
              }
              return { task, result };
            } catch (error) {
              if (
                runSignal?.aborted ||
                (error instanceof Error && error.name === "AbortError")
              ) {
                throw error;
              }
              const invocation = completedInvocation({
                  taskId: task.id,
                  role: "helper",
                  providerId: helper.providerId,
                  modelId: helper.modelId,
                  thinkingEffort: helper.thinkingEffort,
                  modelTier: helper.modelTier,
                  routingReasonCodes: helper.routingReasonCodes,
                  context: task.instruction,
                  startedAt,
                  parentInvocationId: coordinatorInvocation.id,
                });
              invocation.status = "failed";
              priorInvocations.push(invocation);
              write(
                `Helper ${terminalSafeText(task.id)} unavailable · continuing with implementer`,
              );
              return { task, result: undefined };
            }
          }),
        );
        operationActivity.settle(
          `Helpers ${helperTasks.length} read-only task${helperTasks.length === 1 ? "" : "s"} · ${helper.modelId}`,
        );
        operationActivity = undefined;
        const findings = helperResults
          .filter(
            (
              item,
            ): item is {
              task: typeof item.task;
              result: CliReadOnlyRoleResult;
            } => Boolean(item.result),
          )
          .map(
            ({ task, result }) =>
              `Helper ${task.id} (${task.title}):\n${result.summary}\nFindings:\n${result.findings.map((finding) => `- ${finding}`).join("\n")}\nRecommendation: ${result.recommendation}`,
          )
          .join("\n\n");
        if (findings) {
          implementationInstruction = [
            turnResult.action.instruction,
            "",
            "<untrusted_read_only_helper_findings>",
            findings,
            "</untrusted_read_only_helper_findings>",
            "Validate these helper findings against the repository before relying on them.",
          ].join("\n");
        }
      }
      let implementerContextController =
        contextControllerForModel(implementer.modelId);
      activeAgentContext = implementerContextController?.snapshot();
      updateLiveContext({
        phase: "executing",
        status: activeComposerStatusContext(
          state.orchestrationProfile?.preset ?? "custom",
          "implementer",
          executionProfile,
        ),
      });
      operationActivity = beginActivity(
        `Implement ${implementer.modelId} · ${implementer.thinkingEffort}`,
        { fallbackRow: true },
      );
      if (!await persist()) {
        operationActivity.fail("Execution blocked");
        write(
          "Repository action blocked because session persistence became unavailable before execution. No repository work was started.",
        );
        finishTurn("failed");
        continue;
      }
      if (runSignal?.aborted) {
        writeCancellationComplete();
        appendConversationOutcome(
          state,
          "cancelled before execution; no repository action was started.",
        );
        finishTurn("cancelled");
        continue;
      }
      verifyApprovedRepositoryTaskPlan(taskPlan, approvedPlanDigest);
      const result = await options.run({
        sessionId: state.sessionId,
        taskId: taskPlan.id,
        instruction: implementationInstruction,
        ...(currentRequestImages.length > 0
          ? { images: currentRequestImages.map((image) => ({ ...image })) }
          : {}),
        repositoryPath: state.repositoryPath,
        modelId: implementer.modelId,
        thinkingEffort: implementer.thinkingEffort,
        taskPlan,
        orchestration: {
          profile: executionProfile,
          plan: orchestrationPlan,
          priorInvocations: priorInvocations.sort((left, right) =>
            left.taskId.localeCompare(right.taskId),
          ),
        },
        ...(options.readOnlyRole &&
        !executionProfile.omittedRoles.includes("reviewer")
          ? {
              postVerificationReview: async (context) => {
                if (context.signal?.aborted) return undefined;
                const shouldReview =
                  executionProfile?.reviewerPolicy === "always" ||
                  (executionProfile?.reviewerPolicy === "conditional" &&
                    (turnResult.action!.helperTasks.length > 0 ||
                      turnResult.action!.estimatedChangedFiles > 6 ||
                      authorization.risk === "high" ||
                      context.status !== "pass")) ||
                  (executionProfile?.reviewerPolicy === "failure_only" &&
                    context.status !== "pass");
                if (!shouldReview || !executionProfile) return undefined;
                const reviewer = executionProfile.roles.reviewer;
                const reviewerLifecycleContext =
                  contextControllerForModel(reviewer.modelId)?.snapshot();
                activeAgentContext = reviewerLifecycleContext;
                const startedAt = new Date().toISOString();
                updateLiveContext({
                  phase: "executing",
                  status: activeComposerStatusContext(
                    state.orchestrationProfile?.preset ?? "custom",
                    "reviewer",
                    executionProfile,
                  ),
                });
                operationActivity?.stop();
                operationActivity = beginActivity(
                  `Review ${reviewer.modelId} · ${reviewer.thinkingEffort}`,
                  { fallbackRow: true },
                );
                try {
                  const rawReview = await options.readOnlyRole!({
                    sessionId: state.sessionId,
                    invocationId: `review:${context.runId}`,
                    role: "reviewer",
                    instruction: `Review repository action: ${turnResult.action!.instruction}`,
                    repositoryPath: context.sandboxWorktreePath,
                    modelId: reviewer.modelId,
                    thinkingEffort: reviewer.thinkingEffort,
                    context: `Verifier: ${context.status}. Run: ${context.runId}. Summary: ${context.summary}`,
                    ...(reviewerLifecycleContext
                      ? { lifecycleContext: reviewerLifecycleContext }
                      : {}),
                    onContext: (nextContext) => {
                      activeAgentContext = structuredClone(nextContext);
                      updateLiveContext();
                    },
                    onActivity: (event) => {
                      if (event.kind === "message") return;
                      const detail = compactAgentActivity(event);
                      if (event.status === "completed") {
                        write(`  ◇ ${detail}`);
                      } else {
                        operationActivity?.update(detail);
                      }
                    },
                    signal: context.signal,
                    timeoutMs: reviewer.maxWallTimeMs,
                  });
                  const review = redactSensitivePayload(rawReview).payload;
                  write(
                    `Review\n${terminalSafeMultilineText(review.summary)}\nRecommendation: ${terminalSafeMultilineText(review.recommendation)}`,
                  );
                  operationActivity.settle(
                    `Review ${reviewer.modelId} · ${reviewer.thinkingEffort}`,
                  );
                  operationActivity = undefined;
                  let recoveryTask: OrchestrationChildTask | undefined;
                  if (
                    context.status !== "pass" &&
                    review.recovery &&
                    executionProfile.maxRecoveryAttempts > 0
                  ) {
                    const originalWriter = orchestrationPlan.tasks.find(
                      (task) => task.role === "implementer",
                    );
                    recoveryTask = {
                      id: `recover-${randomUUID()}`,
                      role: "implementer" as const,
                      title: "Repair failed verifier result",
                      instruction: review.recovery.instruction,
                      dependencies: originalWriter
                        ? [originalWriter.id]
                        : [],
                      authority: "single_writer" as const,
                      expectedPaths: review.recovery.expectedPaths,
                      expectedArtifacts: [
                        "controlled-diff",
                        "verifier-verdict",
                      ],
                      depth: 2,
                    };
                    try {
                      validateOrchestrationRecoveryTask(
                        recoveryTask,
                        orchestrationPlan,
                        executionProfile,
                      );
                      implementerContextController =
                        contextControllerForModel(implementer.modelId);
                      activeAgentContext =
                        implementerContextController?.snapshot();
                      updateLiveContext({
                        phase: "executing",
                        status: activeComposerStatusContext(
                          state.orchestrationProfile?.preset ?? "custom",
                          "implementer",
                          executionProfile,
                        ),
                      });
                      operationActivity = beginActivity(
                        `Recovery ${implementer.modelId} · ${implementer.thinkingEffort}`,
                        { fallbackRow: true },
                      );
                    } catch (error) {
                      write(
                        `Recovery blocked · ${terminalSafeText(
                          error instanceof Error
                            ? error.message
                            : String(error),
                        )}`,
                      );
                      recoveryTask = undefined;
                    }
                  }
                  return {
                    invocation: completedInvocation({
                      runId: context.runId,
                      taskId: `review-${context.runId}`,
                      role: "reviewer",
                      providerId: reviewer.providerId,
                      modelId: reviewer.modelId,
                      thinkingEffort: reviewer.thinkingEffort,
                      modelTier: reviewer.modelTier,
                      routingReasonCodes: reviewer.routingReasonCodes,
                      context: `${context.status}:${context.summary}`,
                      startedAt,
                      artifactRefs: [],
                      parentInvocationId: coordinatorInvocation.id,
                    }),
                    summary: review.summary,
                    ...(recoveryTask ? { recoveryTask } : {}),
                  };
                } catch (error) {
                  operationActivity?.fail("Review unavailable");
                  operationActivity = undefined;
                  write(
                    `Review unavailable · ${terminalSafeText(
                      String(
                        redactSensitivePayload(
                          error instanceof Error
                            ? error.message
                            : String(error),
                        ).payload,
                      ),
                    )}`,
                  );
                  throw error;
                }
              },
            }
          : {}),
        activeGoal: activeGoalForTurn,
        acceptanceCriteria: criteriaForTurn,
        selectedSkillIds: [...effectiveSkillIds],
        ...(effectiveSkillContext ? { skillContext: effectiveSkillContext } : {}),
        capabilitySettings: capabilityRuntime,
        authorization: {
          ...authorization,
          source: authorizationSource,
          expectedPaths: [...taskPlan.pathEnvelope],
          planId: taskPlan.id,
          planRevision: taskPlan.revision,
          planDigest: taskPlan.digest,
          allowDestructiveChanges:
            authorizationSource === "operator" &&
            turnResult.action.operations.some(
              (operation) => operation === "delete" || operation === "rename",
            ),
          allowChangedFileLimitExceeded:
            authorizationSource === "operator" &&
            turnResult.action.estimatedChangedFiles > 12,
        },
        signal: runSignal,
        onEvent: (event) => {
          const providerUsage = runEventContextUsage(event);
          if (providerUsage && implementerContextController) {
            implementerContextController.recordUsage({
              current: providerUsage,
              precision: "provider",
            });
            activeAgentContext = implementerContextController.snapshot();
            updateLiveContext({
              phase: "executing",
              status: activeComposerStatusContext(
                state.orchestrationProfile?.preset ?? "custom",
                "implementer",
                executionProfile!,
              ),
            });
          }
          const lines = presenter.present(event);
          const messageUpdate = presenter.agentMessageUpdate(event);
          const activityUpdate = presenter.activityUpdate(event);
          if (messageUpdate) {
            operationActivity?.stop();
            operationActivity = undefined;
            if (runMessageItemId !== messageUpdate.itemId) {
              runMessageStream?.finish();
              runMessageStream = beginTerminalMessageStream(terminal, "Agent");
              runMessageItemId = messageUpdate.itemId;
            }
            runMessageStream?.update(messageUpdate.text);
            presenter.markAgentResponseStreamed();
            return;
          }
          if (activityUpdate && activityUpdate.status !== "completed") {
            operationActivity ??= beginActivity(activityUpdate.detail);
            operationActivity.update(activityUpdate.detail);
          }
          if (runMessageStream) {
            runMessageStream.finish(presenter.snapshot().finalAgentResponse);
            runMessageStream = undefined;
            runMessageItemId = undefined;
          }
          if (event.type === "run_started") {
            updateLiveContext({
              phase: "preparing",
              status: phaseComposerStatusContext(
                state.orchestrationProfile?.preset ?? "custom",
                "preparing",
              ),
            });
            operationActivity?.update("Prepare isolated repository run");
          } else if (event.type === "codex_execution_started") {
            updateLiveContext({
              phase: "executing",
              status: activeComposerStatusContext(
                state.orchestrationProfile?.preset ?? "custom",
                "implementer",
                executionProfile!,
              ),
            });
            operationActivity?.update(
              "Run controlled implementer in isolated sandbox",
            );
          } else if (event.type === "verification_started") {
            updateLiveContext({
              phase: "executing",
              status: phaseComposerStatusContext(
                state.orchestrationProfile?.preset ?? "custom",
                "verify",
              ),
            });
            operationActivity?.update("Verify repository evidence");
          }
          for (const line of lines) {
            write(line);
          }
        },
      });
      runMessageStream?.finish(presenter.snapshot().finalAgentResponse);
      runMessageStream = undefined;
      if (state.activityDetails === "full") {
        const presentation = presenter.snapshot();
        write(
          activityAuditSummary(
            presentation.toolCallCount,
            presentation.failedToolCallCount,
            effectiveSkillIds.length,
          ),
        );
      }
      if (state.activityDetails === "off") {
        operationActivity?.stop();
      } else {
        operationActivity?.settle(
          result.status === "pass"
            ? "Repository run complete"
            : "Repository run finished with verifier findings",
        );
      }
      operationActivity = undefined;
      state.lastRun = result.cliSnapshot ?? {
        runId: result.runId,
        status: result.status,
        summary: `Run ${result.status}`,
        verification: result.status === "pass" ? "passed" : result.status === "fail" ? "failed" : "pending",
        evidenceCount: 1,
        artifactManifestPath: result.artifactManifestPath,
        artifacts: { manifest: result.artifactManifestPath },
        eventTypes: [],
      };
      write(
        `\n${renderRunCompletion(
          {
            runId: result.runId,
            status: result.status,
            summary: state.lastRun.summary,
            verification: state.lastRun.verification,
            evidenceCount: state.lastRun.evidenceCount,
            artifactManifestPath: result.artifactManifestPath,
            repositoryDiff: state.lastRun.repositoryDiff,
            interactive: true,
          },
          presenter.snapshot(),
          { color: terminal.color, themeId: terminal.themeId },
        )}`,
      );
      appendConversationOutcome(
        state,
        `${result.status}; verifier ${state.lastRun.verification}; run ${result.runId}.`,
      );
      await persist();
      finishTurn(result.status === "pass" ? "success" : "failed");
    } catch (error) {
      runMessageStream?.abort();
      runMessageStream = undefined;
      operationActivity?.stop();
      operationActivity = undefined;
      const cancelled =
        runSignal?.aborted ||
        (error instanceof Error &&
          error.name === "RepositoryRunCancelledError");
      appendConversationOutcome(
        state,
        cancelled
          ? "cancelled during execution; no further stages were run."
          : "failed before successful verification.",
      );
      if (
        !cancelled &&
        options.readOnlyRole &&
        executionProfile &&
        !executionProfile.omittedRoles.includes("reviewer")
      ) {
        const reviewer = executionProfile.roles.reviewer;
        const reviewerLifecycleContext =
          contextControllerForModel(reviewer.modelId)?.snapshot();
        activeAgentContext = reviewerLifecycleContext;
        updateLiveContext({
          phase: "executing",
          status: activeComposerStatusContext(
            state.orchestrationProfile?.preset ?? "custom",
            "reviewer",
            executionProfile,
          ),
        });
        try {
          const review = await options.readOnlyRole({
            role: "reviewer",
            instruction: `Analyze the failed repository action: ${turnResult.action.instruction}`,
            repositoryPath: state.repositoryPath,
            modelId: reviewer.modelId,
            thinkingEffort: reviewer.thinkingEffort,
            context: `Execution failed: ${error instanceof Error ? error.message : String(error)}. Produce a bounded recovery recommendation only; do not edit.`,
            ...(reviewerLifecycleContext
              ? { lifecycleContext: reviewerLifecycleContext }
              : {}),
            onContext: (nextContext) => {
              activeAgentContext = structuredClone(nextContext);
              updateLiveContext();
            },
            onActivity: (event) => {
              if (event.kind === "message") return;
              const detail = compactAgentActivity(event);
              if (event.status === "completed") {
                write(`  ◇ ${detail}`);
              }
            },
            signal: runSignal,
            timeoutMs: reviewer.maxWallTimeMs,
          });
          write(
            (() => {
              const safeReview = redactSensitivePayload(review).payload;
              return `Recovery review\n${terminalSafeMultilineText(safeReview.summary)}\nRecommendation: ${terminalSafeMultilineText(safeReview.recommendation)}`;
            })(),
          );
        } catch (reviewError) {
          write(
            `Recovery review unavailable · ${terminalSafeText(
              String(
                redactSensitivePayload(
                  reviewError instanceof Error
                    ? reviewError.message
                    : String(reviewError),
                ).payload,
              ),
            )}`,
          );
        }
      }
      write(
        `\n${renderRunCompletion(
          {
            status: cancelled ? "cancelled" : "fail",
            errorMessage: cancelled
              ? undefined
              : error instanceof Error
                ? error.message
                : String(error),
            interactive: true,
          },
          presenter.snapshot(),
          { color: terminal.color, themeId: terminal.themeId },
        )}`,
      );
      if (cancelled) writeCancellationComplete();
      finishTurn(cancelled ? "cancelled" : "failed");
    } finally {
      operationActivity?.stop();
      if (runSignal) options.releaseRunSignal?.(runSignal);
      state.mode = "plan";
      await persist();
    }
  }
}
