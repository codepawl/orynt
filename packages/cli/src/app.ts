import { createHash, randomUUID } from "node:crypto";
import path from "node:path";

import {
  createClaudeModelTierConfiguration,
  createLegacySingleModelProfile,
  createOpencodeGoModelTierConfiguration,
  estimateInvocationCostUsd,
  migrateOrchestrationProfileToModelTiers,
  modelTierConfigurationToOrchestrationProfile,
  redactSensitivePayload,
  resolveOrchestrationProfile,
  validateOrchestrationPlan,
  type ModelInvocationRecord,
  type ModelTierConfigurationV1,
  type ContextLifecycleSnapshotV1,
  type OrchestrationChildTask,
  type OrchestrationPlan,
  type OrchestrationProfile,
} from "@codepawl/shared";
import type {
  AgentImageInput,
  ProviderUsageDetail,
  ProviderUsageSnapshotV1,
} from "@codepawl/model-runtime";

import {
  DEFAULT_CLI_ORCHESTRATION_PROFILE,
  DEFAULT_CLI_MODEL_ID,
  DEFAULT_CLI_THINKING_EFFORT,
  applyCliOrchestrationOverrides,
  cliHelp,
  parseCliArgs,
  type CliArguments,
} from "./runtime.js";
import {
  codexSetupHelp,
  codexSetupStatusJson,
  type CodexSetupResult,
} from "./codexSetup.js";
import {
  opencodeSetupStatusJson,
  probeOpencodeEnvironment,
  runOpencodeSetup,
} from "./opencodeSetup.js";
import {
  claudeSetupHelp,
  claudeSetupStatusJson,
  probeClaudeEnvironment,
  runClaudeSetup,
} from "./claudeSetup.js";
import {
  doctorExitCode,
  doctorHelp,
  renderDoctorReport,
  type DoctorReportV1,
  type DoctorRequest,
} from "./doctor.js";
import {
  providerUsageExitCode,
  providerUsageHelp,
  renderProviderUsage,
} from "./usage.js";
import { ORYNT_VERSION } from "./version.js";
import {
  evaluateAgentAction,
  type CliAgentTurnRequest,
  type CliAgentTurnResult,
  type ProposedRepositoryAction,
} from "./agent.js";
import type {
  ComposerChoice,
  ComposerDraftSnapshot,
  ComposerInitialValue,
  ComposerStatusContext,
  LiveComposerContext,
  LiveComposerHandle,
  LiveComposerSubmission,
  LiveComposerSubmissionResult,
} from "./composer.js";
import type { InlineActivityHandle } from "./composer.js";
import type { InlineMessageStreamHandle } from "./composer.js";
import {
  runInteractiveSession,
  type CliRunRequest,
  type CliRunResult,
  type InteractiveSessionOptions,
  type InteractiveSessionState,
  type ProviderStatus,
} from "./session.js";
import type {
  CliAppearancePreferences,
  CliPreferences,
  CliSessionListOptions,
  CliSessionPage,
  CliSessionSnapshot,
  CliTranscriptPage,
  CliWorkingConfig,
} from "./state.js";
import {
  DEFAULT_CLI_APPEARANCE,
  normalizeCliWorkingConfig,
} from "./state.js";
import {
  DEFAULT_TERMINAL_THEME_ID,
} from "./terminal-theme.js";
import type {
  TerminalAppearanceResolution,
  TerminalThemeId,
} from "./terminal-theme.js";
import {
  RunPresenter,
  renderRunCompletion,
  terminalSafeText,
  type ActivityDetailLevel,
  type CliModelOption,
} from "./ui.js";
import { buildBoundRepositoryTaskPlan } from "./task-plan.js";
import {
  DEFAULT_CLI_SHORTCUTS,
  type CliShortcutPreferences,
} from "./shortcuts.js";
import {
  DEFAULT_CLI_STATUSLINE,
  type CliStatuslinePreferences,
} from "./statusline.js";
import {
  DEFAULT_CLI_CLIPBOARD,
  type CliClipboardPreferences,
} from "./clipboard.js";

export type CliApplicationDependencies = {
  cwd: string;
  isTTY: boolean;
  color?: boolean;
  themeId?: TerminalThemeId;
  richText?: boolean;
  width?: number;
  height?: number;
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
  setProviderUsage?: (
    usage: ProviderUsageSnapshotV1 | undefined,
  ) => void;
  takeSubmittedImages?: () => AgentImageInput[];
  takeSubmittedDraft?: () => ComposerDraftSnapshot | undefined;
  select?: (
    prompt: string,
    choices: ComposerChoice[],
    currentValue?: string,
  ) => Promise<string>;
  remember?: (value: string) => void;
  beginActivity?: (label: string) => InlineActivityHandle;
  beginStartupActivity?: (label: string) => InlineActivityHandle;
  beginMessageStream?: (label?: string) => InlineMessageStreamHandle;
  write: (value: string) => void;
  /** Writes one responsive centered line using the first variant that fits. */
  writeCentered?: (variants: readonly string[]) => void;
  clear: () => void;
  probeProvider: () => Promise<ProviderStatus>;
  setupProvider?: (initialStatus?: ProviderStatus) => Promise<CodexSetupResult>;
  listModels?: () => Promise<CliModelOption[]>;
  turn?: (request: CliAgentTurnRequest) => Promise<CliAgentTurnResult>;
  readOnlyRole?: InteractiveSessionOptions["readOnlyRole"];
  run: (request: CliRunRequest) => Promise<CliRunResult>;
  diagnose?: (request: DoctorRequest) => Promise<DoctorReportV1>;
  readProviderUsage?: (
    detail: ProviderUsageDetail,
  ) => Promise<ProviderUsageSnapshotV1>;
  codeIntelStatus?: InteractiveSessionOptions["codeIntelStatus"];
  listSkills?: InteractiveSessionOptions["listSkills"];
  routeSkills?: InteractiveSessionOptions["routeSkills"];
  snapshotSkills?: InteractiveSessionOptions["snapshotSkills"];
  persistSession?: (session: CliSessionSnapshot) => Promise<unknown>;
  loadSession?: (sessionId: string) => Promise<CliSessionSnapshot | undefined>;
  listSessions?: (options?: CliSessionListOptions) => Promise<CliSessionPage>;
  appendTranscript?: InteractiveSessionOptions["appendTranscript"];
  readTranscript?: (
    sessionId: string,
    options?: { limit?: number; cursor?: number },
  ) => Promise<CliTranscriptPage>;
  copyText?: (value: string) => Promise<void>;
  notify?: (text: string, role?: "success" | "danger") => void;
  compactContext?: InteractiveSessionOptions["compactContext"];
  loadPreferences?: () => Promise<CliPreferences>;
  persistWorkingConfig?: (patch: CliWorkingConfig) => Promise<void>;
  persistActivityDetails?: (
    activityDetails: ActivityDetailLevel,
  ) => Promise<void>;
  persistSkillRouting?: InteractiveSessionOptions["persistSkillRouting"];
  persistCapabilityRuntime?: InteractiveSessionOptions["persistCapabilityRuntime"];
  appearanceResolution?: TerminalAppearanceResolution;
  persistAppearance?: (
    patch: Partial<CliAppearancePreferences>,
  ) => Promise<void>;
  applyAppearance?: (
    appearance: CliAppearancePreferences,
  ) => TerminalAppearanceResolution;
  persistClipboard?: (
    preferences: CliClipboardPreferences,
  ) => Promise<void>;
  applyClipboard?: (preferences: CliClipboardPreferences) => void;
  persistShortcuts?: (shortcuts: CliShortcutPreferences) => Promise<void>;
  applyShortcuts?: (shortcuts: CliShortcutPreferences) => void;
  persistStatusline?: (
    statusline: CliStatuslinePreferences,
  ) => Promise<void>;
  applyStatusline?: (statusline: CliStatuslinePreferences) => void;
  hasAcknowledgedStartupBoundary?: () => Promise<boolean>;
  acknowledgeStartupBoundary?: () => Promise<void>;
  prepareRunSignal?: () => AbortSignal;
  cancelRunSignal?: (signal: AbortSignal) => void;
  releaseRunSignal?: (signal: AbortSignal) => void;
};

const PRODUCT_UI_SKILL_ID = "orynt-builtin:product-ui-design";

function shouldAttachProductUiSkill(
  prompt: string,
  pathEnvelope: readonly string[],
  operations: readonly string[],
): boolean {
  if (!operations.some((operation) => operation !== "read")) return false;
  const normalized = prompt.toLowerCase();
  if (
    /\b(landing page|marketing site|portfolio|blog|editorial|campaign page)\b/u.test(
      normalized,
    )
  ) {
    return false;
  }
  const hasProductUiIntent =
    /\b(board|dashboard|admin|workflow|form|calculator|support desk|ticket|frontend|user interface|responsive|aria|data-testid)\b/u.test(
      normalized,
    );
  const hasFrontendPath = pathEnvelope.some((candidate) =>
    /(^|\/)(index\.html|styles?\.css|[^/]+\.(?:css|html|jsx|tsx|vue|svelte))$/iu.test(
      candidate,
    )
  );
  return hasProductUiIntent && hasFrontendPath;
}

function failureClassification(
  message: string,
): "planning" | "permission" | "environment" | "transient" | "model" | "unknown" {
  if (
    /\[TASK_PLAN_INVALID\]|task plan|repository task|planning blocked/iu.test(
      message,
    )
  ) {
    return "planning";
  }
  if (/permission|approval|denied|unauthorized/i.test(message)) return "permission";
  if (/not found|enoent|repository|git |workspace/i.test(message)) return "environment";
  if (/timeout|timed out|temporary|transient/i.test(message)) return "transient";
  if (/codex|model|401|429/i.test(message)) return "model";
  return "unknown";
}

function failureCode(message: string): string | undefined {
  if (/\[TASK_PLAN_INVALID\]|task plan|repository task/iu.test(message)) {
    return "TASK_PLAN_INVALID";
  }
  if (/\[HEADLESS_SKILL_CONTEXT_UNAVAILABLE\]/u.test(message)) {
    return "HEADLESS_SKILL_CONTEXT_UNAVAILABLE";
  }
  return undefined;
}

type RepositoryRunFailureDetails = {
  runId: string;
  artifactRoot: string;
  artifactManifestPath: string;
  eventLogPath: string;
  outcome: {
    status: string;
    classification: string;
    code: string;
    verifierFailureClass?: string;
  };
};

function repositoryRunFailureDetails(
  error: unknown,
): RepositoryRunFailureDetails | undefined {
  if (!error || typeof error !== "object") return undefined;
  const candidate = error as Partial<RepositoryRunFailureDetails>;
  if (
    typeof candidate.runId !== "string" ||
    typeof candidate.artifactRoot !== "string" ||
    typeof candidate.artifactManifestPath !== "string" ||
    typeof candidate.eventLogPath !== "string" ||
    !candidate.outcome ||
    typeof candidate.outcome !== "object" ||
    typeof candidate.outcome.status !== "string" ||
    typeof candidate.outcome.classification !== "string" ||
    typeof candidate.outcome.code !== "string"
  ) {
    return undefined;
  }
  return candidate as RepositoryRunFailureDetails;
}

function jsonLine(value: Record<string, unknown>): string {
  return JSON.stringify({ schemaVersion: 1, ...value });
}

async function loadWorkingConfig(
  dependencies: CliApplicationDependencies,
  preferences?: CliPreferences,
): Promise<CliWorkingConfig> {
  if (preferences?.workingConfig !== undefined) {
    return preferences.workingConfig;
  }
  if (!dependencies.persistWorkingConfig) return {};
  const latest = await dependencies.loadSession?.("latest");
  const bootstrapped = normalizeCliWorkingConfig(
    latest && !latest.trashedAt
      ? {
        repositoryPath: latest.repositoryPath,
        orchestrationProfile: latest.orchestrationProfile,
        modelTierConfiguration: latest.modelTierConfiguration,
        modelId: latest.modelId,
        thinkingEffort: latest.thinkingEffort,
      }
      : {
        repositoryPath: path.resolve(dependencies.cwd),
        orchestrationProfile: DEFAULT_CLI_ORCHESTRATION_PROFILE,
      },
  );
  await dependencies.persistWorkingConfig(bootstrapped);
  return bootstrapped;
}

type ResolvedWorkingConfig = {
  repositoryPath: string;
  orchestrationProfile: OrchestrationProfile;
  modelTierConfiguration: ModelTierConfigurationV1;
  modelId: string;
  thinkingEffort: typeof DEFAULT_CLI_THINKING_EFFORT;
};

function resolveWorkingConfig(
  args: CliArguments,
  saved: CliWorkingConfig,
  resumed?: CliSessionSnapshot,
): ResolvedWorkingConfig {
  const baseProfile =
    resumed?.orchestrationProfile ??
    (resumed
      ? createLegacySingleModelProfile(
          resumed.modelId,
          resumed.thinkingEffort,
        )
      : undefined) ??
    saved.orchestrationProfile ??
    (saved.modelId && saved.thinkingEffort
      ? createLegacySingleModelProfile(saved.modelId, saved.thinkingEffort)
      : undefined) ??
    DEFAULT_CLI_ORCHESTRATION_PROFILE;
  const orchestrationProfile = args.explicitConfig.orchestration
    ? applyCliOrchestrationOverrides(baseProfile, args)
    : baseProfile;
  const modelTierConfiguration = args.explicitConfig.orchestration
    ? migrateOrchestrationProfileToModelTiers(orchestrationProfile)
    : resumed?.modelTierConfiguration ??
      saved.modelTierConfiguration ??
      migrateOrchestrationProfileToModelTiers(orchestrationProfile);
  const coordinatorTier = modelTierConfiguration.roles.coordinator;
  const coordinator = modelTierConfiguration.tiers[coordinatorTier];
  return {
    repositoryPath: args.explicitConfig.repository
      ? args.repositoryPath
      : resumed?.repositoryPath ?? saved.repositoryPath ?? args.repositoryPath,
    orchestrationProfile,
    modelTierConfiguration,
    modelId: coordinator.modelId,
    thinkingEffort: coordinator.thinkingEffort,
  };
}

async function resolvedProfileForTask(
  tierConfiguration: ModelTierConfigurationV1,
  instruction: string,
  dependencies: CliApplicationDependencies,
  requestedMinimumTier?: import("@codepawl/shared").ModelTier,
  task?: {
    operations: string[];
    estimatedChangedFiles: number;
  },
) {
  const { profile } = modelTierConfigurationToOrchestrationProfile(
    tierConfiguration,
    {
      instruction,
      requestedMinimumTier,
      ...(task
        ? {
            operations: task.operations,
            estimatedChangedFiles: task.estimatedChangedFiles,
          }
        : {}),
    },
  );
  const models = dependencies.listModels
    ? await dependencies.listModels()
    : Object.values(profile.roles).map((binding) => ({
        id: binding.modelId,
        label: binding.modelId,
        supportedThinkingEfforts: [binding.thinkingEffort],
      }));
  return resolveOrchestrationProfile(profile, models, { instruction });
}

/**
 * Telemetry stages that consume a model invocation before repository work
 * begins. Skill routing is included because it can start its own model turn;
 * omitting it hid that invocation's latency and tokens from every artifact.
 */
type PlanningInvocationStage =
  | "prompt_understanding"
  | "skill_routing"
  | "coordinator_inference";

const PLANNING_STAGE_TASK_IDS: Record<PlanningInvocationStage, string> = {
  prompt_understanding: "headless-prompt-understanding",
  skill_routing: "headless-skill-routing",
  coordinator_inference: "headless-coordinator",
};

const PLANNING_STAGE_PHASES: Record<
  PlanningInvocationStage,
  NonNullable<ModelInvocationRecord["phase"]>
> = {
  prompt_understanding: "prompt_understanding",
  skill_routing: "skill_routing",
  coordinator_inference: "coordination",
};

export async function runCliApplication(argv: string[], dependencies: CliApplicationDependencies): Promise<number> {
  let args;
  try {
    args = parseCliArgs(argv, dependencies.cwd);
  } catch (error) {
    dependencies.write(
      `Error: ${terminalSafeText(error instanceof Error ? error.message : String(error))}\n\n${cliHelp()}`,
    );
    return 2;
  }

  if (args.help) {
    dependencies.write(
      args.command === "setup"
        ? args.provider === "anthropic"
          ? claudeSetupHelp()
          : codexSetupHelp()
        : args.command === "usage"
          ? providerUsageHelp()
        : args.command === "doctor"
          ? doctorHelp()
          : cliHelp(),
    );
    return 0;
  }
  if (args.version) {
    dependencies.write(ORYNT_VERSION);
    return 0;
  }

  if (args.command === "usage") {
    if (!dependencies.readProviderUsage) {
      dependencies.write(
        args.json
          ? JSON.stringify({
              schemaVersion: 1,
              kind: "error",
              classification: "environment",
              code: "PROVIDER_USAGE_UNAVAILABLE",
              message: "Provider usage is unavailable in this host.",
            })
          : "Provider usage is unavailable in this host.",
      );
      return 2;
    }
    try {
      const snapshot = await dependencies.readProviderUsage(
        args.verbose || args.json ? "full" : "quota",
      );
      dependencies.write(
        args.json
          ? JSON.stringify(snapshot, null, 2)
          : renderProviderUsage(snapshot, {
              color:
                args.color &&
                dependencies.isTTY &&
                dependencies.color !== false,
              themeId: dependencies.themeId ?? args.themeId,
              width: dependencies.width,
              verbose: args.verbose === true,
            }),
      );
      return providerUsageExitCode(snapshot);
    } catch (error) {
      const message = terminalSafeText(
        error instanceof Error ? error.message : String(error),
      );
      dependencies.write(
        args.json
          ? JSON.stringify({
              schemaVersion: 1,
              kind: "error",
              classification: "environment",
              code: "PROVIDER_USAGE_FAILED",
              message,
            })
          : `Provider usage could not start: ${message}`,
      );
      return 2;
    }
  }

  if (args.command === "doctor") {
    if (!dependencies.diagnose) {
      dependencies.write(
        args.json
          ? JSON.stringify({
              schemaVersion: 1,
              kind: "error",
              classification: "environment",
              code: "DOCTOR_UNAVAILABLE",
              message: "Doctor diagnostics are unavailable in this host.",
            })
          : "Doctor diagnostics are unavailable in this host.",
      );
      return 2;
    }
    let modelTierConfiguration: ModelTierConfigurationV1 | undefined;
    try {
      const preferences = await dependencies.loadPreferences?.();
      modelTierConfiguration = resolveWorkingConfig(
        args,
        preferences?.workingConfig ?? {},
      ).modelTierConfiguration;
    } catch {
      // The structured state check reports the underlying load or migration
      // failure. Continue with the default tier configuration so other probes
      // still provide useful evidence.
    }
    try {
      const report = await dependencies.diagnose({
        repositoryPath: args.repositoryPath,
        ...(modelTierConfiguration ? { modelTierConfiguration } : {}),
        live: args.live === true,
        verbose: args.verbose === true,
      });
      dependencies.write(
        args.json
          ? JSON.stringify(report, null, 2)
          : renderDoctorReport(report, {
              color:
                args.color &&
                dependencies.isTTY &&
                dependencies.color !== false,
              themeId: dependencies.themeId ?? args.themeId,
              width: dependencies.width,
              verbose: args.verbose === true,
            }),
      );
      return doctorExitCode(report);
    } catch (error) {
      const message = terminalSafeText(
        error instanceof Error ? error.message : String(error),
      );
      dependencies.write(
        args.json
          ? JSON.stringify({
              schemaVersion: 1,
              kind: "error",
              classification: "environment",
              code: "DOCTOR_FAILED",
              message,
            })
          : `Doctor could not start: ${message}`,
      );
      return 2;
    }
  }

  if (args.command === "setup" && args.provider === "opencode") {
    const probed = await probeOpencodeEnvironment();
    if (args.check) {
      dependencies.write(
        args.json
          ? opencodeSetupStatusJson(probed)
          : [
              `OpenCode: ${probed.ready ? "ready" : "not ready"} · ${terminalSafeText(probed.detail)}`,
              `Code: ${probed.code}`,
              `Next action: ${probed.nextAction}`,
            ].join("\n"),
      );
      return probed.ready ? 0 : 1;
    }
    const result = await runOpencodeSetup({
      isTTY: dependencies.isTTY,
      write: (value) => dependencies.write(value),
      probe: async () => probed,
    });
    if (result.outcome !== "ready") {
      dependencies.write(
        `OpenCode setup remains incomplete: ${terminalSafeText(result.status.detail)}`,
      );
      return 1;
    }
    // Readiness alone changes nothing: the tier configuration is what routes a
    // turn to a provider, so setup writes it once the credential works.
    const tiers = createOpencodeGoModelTierConfiguration();
    if (!dependencies.persistWorkingConfig) {
      dependencies.write(
        `OpenCode is ready: ${terminalSafeText(result.status.detail)}\nThis host cannot persist model tiers; select OpenCode models in /settings agent.`,
      );
      return 0;
    }
    const existing = await dependencies.loadPreferences?.();
    await dependencies.persistWorkingConfig({
      ...(existing?.workingConfig ?? {}),
      modelTierConfiguration: tiers,
      orchestrationProfile: modelTierConfigurationToOrchestrationProfile(tiers, {
        instruction: "",
      }).profile,
    });
    dependencies.write(
      `OpenCode is ready: ${terminalSafeText(result.status.detail)}\nModel tiers now use ${tiers.tiers.light.modelId} / ${tiers.tiers.medium.modelId} / ${tiers.tiers.heavy.modelId}.`,
    );
    return 0;
  }

  if (args.command === "setup" && args.provider === "anthropic") {
    const probe = await probeClaudeEnvironment();
    if (args.check) {
      dependencies.write(
        args.json
          ? claudeSetupStatusJson(probe.status)
          : [
              `Anthropic API: ${probe.status.ready ? "ready" : "not ready"} · ${terminalSafeText(probe.status.detail)}`,
              `Code: ${probe.status.code}`,
              `Next action: ${probe.status.nextAction}`,
            ].join("\n"),
      );
      return probe.status.ready ? 0 : 1;
    }
    // Anthropic setup has nothing to launch: Orynt only reads an environment
    // variable it must never receive. The flow prints guidance and rechecks.
    const result = await runClaudeSetup({
      isTTY: dependencies.isTTY,
      write: (value) => dependencies.write(value),
    });
    if (result.outcome !== "ready") {
      dependencies.write(
        `Anthropic setup remains incomplete: ${terminalSafeText(result.status.detail)}`,
      );
      return 1;
    }
    // Readiness alone changes nothing: the tier configuration is what routes a
    // turn to a provider, so setup writes it once the credential works.
    const tiers = createClaudeModelTierConfiguration();
    if (dependencies.persistWorkingConfig) {
      const existing = await dependencies.loadPreferences?.();
      await dependencies.persistWorkingConfig({
        ...(existing?.workingConfig ?? {}),
        modelTierConfiguration: tiers,
        orchestrationProfile: modelTierConfigurationToOrchestrationProfile(
          tiers,
          { instruction: "" },
        ).profile,
      });
      dependencies.write(
        `Anthropic is ready: ${terminalSafeText(result.status.detail)}\nModel tiers now use ${tiers.tiers.light.modelId} / ${tiers.tiers.medium.modelId} / ${tiers.tiers.heavy.modelId}.`,
      );
      return 0;
    }
    dependencies.write(
      `Anthropic is ready: ${terminalSafeText(result.status.detail)}\nThis host cannot persist model tiers; select Anthropic models in /settings agent.`,
    );
    return 0;
  }

  if (args.command === "setup") {
    if (args.check) {
      const status = await dependencies.probeProvider();
      dependencies.write(
        args.json
          ? codexSetupStatusJson(status)
          : [
              `Codex CLI: ${status.ready ? "ready" : "not ready"} · ${terminalSafeText(status.detail)}`,
              `Code: ${status.code ?? (status.ready ? "CODEX_READY" : "CODEX_PROBE_FAILED")}`,
              `Next action: ${status.nextAction ?? (status.ready ? "none" : "diagnose")}`,
            ].join("\n"),
      );
      return status.ready ? 0 : 1;
    }
    if (!dependencies.isTTY) {
      dependencies.write(
        "Interactive Codex setup requires a TTY. Use `orynt setup --check --json` to inspect readiness.",
      );
      return 2;
    }
    if (!dependencies.setupProvider) {
      dependencies.write("Interactive Codex setup is unavailable in this host.");
      return 1;
    }
    const result = await dependencies.setupProvider();
    dependencies.write(
      result.status.ready
        ? `Codex CLI is ready: ${terminalSafeText(result.status.detail)}`
        : `Codex setup remains incomplete: ${terminalSafeText(result.status.detail)}`,
    );
    return result.outcome === "ready" ? 0 : 1;
  }

  const resumed = args.command !== "run" && args.resumeSessionId
    ? await dependencies.loadSession?.(args.resumeSessionId)
    : undefined;
  if (args.command !== "run" && args.resumeSessionId && !resumed) {
    dependencies.write(`Session not found: ${terminalSafeText(args.resumeSessionId)}`);
    return 2;
  }
  if (args.command !== "run" && args.resumeSessionId && resumed?.trashedAt) {
    dependencies.write(
      `Session is in Trash: ${terminalSafeText(resumed.sessionId)}. Restore it with \`orynt sessions restore ${terminalSafeText(resumed.sessionId)}\` before resuming.`,
    );
    return 2;
  }
  if (args.command !== "run" && !dependencies.isTTY) {
    dependencies.write(
      "Interactive conversation requires a TTY. For headless repository work, use `orynt run --approve-once <goal>`.",
    );
    return 2;
  }

  const startupActivity =
    args.command !== "run" && dependencies.isTTY
      ? dependencies.beginStartupActivity?.("Loading workspace")
      : undefined;
  let savedWorkingConfig: CliWorkingConfig;
  let savedPreferences: CliPreferences = {
    schemaVersion: 12,
    activityDetails: "important",
    skillRouting: "auto_trusted",
    appearance: { ...DEFAULT_CLI_APPEARANCE },
    clipboard: structuredClone(DEFAULT_CLI_CLIPBOARD),
    shortcuts: structuredClone(DEFAULT_CLI_SHORTCUTS),
    statusline: structuredClone(DEFAULT_CLI_STATUSLINE),
  };
  try {
    savedPreferences =
      (await dependencies.loadPreferences?.()) ?? savedPreferences;
    savedWorkingConfig = await loadWorkingConfig(
      dependencies,
      savedPreferences,
    );
  } catch (error) {
    startupActivity?.stop();
    const message =
      `Could not load or migrate Orynt working config: ${
        error instanceof Error ? error.message : String(error)
      }`;
    dependencies.write(
      args.command === "run" && args.jsonl
        ? jsonLine({ kind: "error", classification: "environment", message })
        : `Error: ${terminalSafeText(message)}`,
    );
    return 2;
  }

  if (args.command === "run") {
    const workingConfig = resolveWorkingConfig(args, savedWorkingConfig);
    const colorEnabled =
      args.color &&
      dependencies.isTTY &&
      dependencies.color !== false;
    const provider = await dependencies.probeProvider();
    if (!provider.ready) {
      const message = `Codex CLI is not ready: ${provider.detail}`;
      dependencies.write(
        args.jsonl
          ? jsonLine({
              kind: "error",
              classification: "environment",
              code: provider.code ?? "CODEX_PROBE_FAILED",
              message,
              remediationCommand:
                provider.remediationCommand ?? "orynt setup --check",
            })
          : `${terminalSafeText(message)}\nRun \`orynt setup\` in an interactive terminal.`,
      );
      return 1;
    }
    const presenter = new RunPresenter({
      color: colorEnabled,
      activityDetails:
        args.activityDetails ?? savedPreferences.activityDetails,
    });
    try {
      const basePlanningProfile = await resolvedProfileForTask(
        workingConfig.modelTierConfiguration,
        args.initialPrompt ?? "",
        dependencies,
        args.minimumTier,
      );
      const planningProfile =
        process.env.ORYNT_REPOOPS_DISABLE_RECOVERY === "1"
          ? { ...basePlanningProfile, maxRecoveryAttempts: 0 }
          : basePlanningProfile;
      if (!dependencies.turn) {
        dependencies.write(
          args.jsonl
            ? jsonLine({
                kind: "error",
                classification: "planning",
                code: "TASK_PLANNER_UNAVAILABLE",
                message: "Headless execution requires the repository task planner.",
              })
            : "Task planning blocked: repository task planner is unavailable.",
        );
        return 2;
      }
      const coordinator = planningProfile.roles.coordinator;
      const planningInvocations: ModelInvocationRecord[] = [];
      let latestPlanningContext: ContextLifecycleSnapshotV1 | undefined;
      const plannedTurn = await dependencies.turn({
        prompt: args.initialPrompt ?? "",
        repositoryPath: workingConfig.repositoryPath,
        modelId: coordinator.modelId,
        providerId: coordinator.providerId,
        thinkingEffort: coordinator.thinkingEffort,
        acceptanceCriteria: [],
        recentTurns: [],
        requireActionForReadyRepositoryUnderstanding: true,
        onContext: (context) => {
          latestPlanningContext = structuredClone(context);
        },
        onTelemetry: (event) => {
          if (
            event.kind !== "stage" ||
            (event.name !== "prompt_understanding" &&
              event.name !== "skill_routing" &&
              event.name !== "coordinator_inference")
          ) {
            return;
          }
          const completedAtMs = Date.now();
          // A deterministic stage consumed no provider usage. Attributing the
          // previous stage's context snapshot to it would invent tokens that
          // were never spent.
          const usage = event.deterministic
            ? undefined
            : latestPlanningContext?.usage.current;
          planningInvocations.push({
            schemaVersion: 1,
            id: `invocation-${randomUUID()}`,
            runId: "pending-controlled-run",
            taskId: PLANNING_STAGE_TASK_IDS[event.name],
            role: "coordinator",
            executionKind: event.deterministic ? "deterministic" : "model",
            providerId: coordinator.providerId,
            modelId: coordinator.modelId,
            thinkingEffort: coordinator.thinkingEffort,
            requestedModelId:
              coordinator.requestedModelId ?? coordinator.modelId,
            requestedThinkingEffort:
              coordinator.requestedThinkingEffort ??
              coordinator.thinkingEffort,
            phase: PLANNING_STAGE_PHASES[event.name],
            contextHash: createHash("sha256")
              .update(
                `${event.name}:${args.initialPrompt ?? ""}`,
              )
              .digest("hex"),
            status: "completed",
            inputTokens: event.deterministic ? 0 : usage?.inputTokens ?? null,
            cachedInputTokens: event.deterministic
              ? 0
              : usage?.cachedInputTokens ?? null,
            outputTokens: event.deterministic ? 0 : usage?.outputTokens ?? null,
            reasoningOutputTokens: event.deterministic
              ? 0
              : usage?.reasoningOutputTokens ?? null,
            estimatedCostUsd: event.deterministic
              ? 0
              : estimateInvocationCostUsd({
                providerId: coordinator.providerId,
                modelId: coordinator.modelId,
                inputTokens: usage?.inputTokens ?? null,
                cachedInputTokens: usage?.cachedInputTokens ?? null,
                outputTokens: usage?.outputTokens ?? null,
              }),
            startedAt: new Date(
              completedAtMs - event.durationMs,
            ).toISOString(),
            completedAt: new Date(completedAtMs).toISOString(),
            durationMs: Math.max(0, Math.round(event.durationMs)),
            // No provider reported these counts, so no precision claim applies;
            // `executionKind` is what explains the zeroes.
            usagePrecision: event.deterministic
              ? "unknown"
              : latestPlanningContext?.usage.precision ?? "unknown",
            retryIndex: 0,
            artifactRefs: [],
            ...(coordinator.modelTier
              ? { modelTier: coordinator.modelTier }
              : {}),
            ...(coordinator.routingReasonCodes
              ? {
                  routingReasonCodes: [
                    ...coordinator.routingReasonCodes,
                  ],
                }
              : {}),
          });
          latestPlanningContext = undefined;
        },
      });
      if (
        plannedTurn.promptUnderstanding?.outcome === "repository_action" &&
        plannedTurn.promptUnderstanding.readiness !== "ready"
      ) {
        const safeUnderstanding = redactSensitivePayload(
          plannedTurn.promptUnderstanding,
        ).payload;
        const message =
          plannedTurn.promptUnderstanding.readiness ===
          "assumption_confirmation_required"
            ? "Headless execution requires explicit confirmation of material scope assumptions."
            : "Headless execution requires clarification before a repository plan can be created.";
        dependencies.write(
          args.jsonl
            ? jsonLine({
                kind: "error",
                classification: "planning",
                code: "PROMPT_CLARIFICATION_REQUIRED",
                message,
                promptUnderstanding: safeUnderstanding,
              })
            : `${terminalSafeText(message)} Re-run with a clarified goal and --approve-once.`,
        );
        return 2;
      }
      if (
        plannedTurn.promptUnderstanding?.outcome === "repository_action" &&
        plannedTurn.promptUnderstanding.readiness === "ready" &&
        !plannedTurn.promptUnderstandingBasis
      ) {
        const message =
          "Headless execution could not bind ready prompt understanding to its immutable prompt basis.";
        dependencies.write(
          args.jsonl
            ? jsonLine({
                kind: "error",
                classification: "planning",
                code: "PROMPT_UNDERSTANDING_BASIS_MISSING",
                message,
              })
            : terminalSafeText(message),
        );
        return 2;
      }
      if (plannedTurn.disposition !== "action" || !plannedTurn.action) {
        dependencies.write(
          args.jsonl
            ? jsonLine({
                kind: "error",
                classification: "planning",
                code: "TASK_PLAN_NOT_ACTIONABLE",
                message:
                  "The repository task planner did not return an executable action.",
              })
            : "Task planning blocked: no executable repository action was produced.",
        );
        return 2;
      }
      const proposedOperations = [
        ...new Set(
          plannedTurn.action.taskPlan.tasks.flatMap(
            (task) => task.operations,
          ),
        ),
      ];
      const baseResolvedProfile = await resolvedProfileForTask(
        workingConfig.modelTierConfiguration,
        args.initialPrompt ?? "",
        dependencies,
        args.minimumTier,
        {
          operations: proposedOperations,
          estimatedChangedFiles:
            plannedTurn.action.taskPlan.tasks.flatMap(
              (task) => task.expectedPaths,
            ).length,
        },
      );
      const resolvedProfile =
        process.env.ORYNT_REPOOPS_DISABLE_RECOVERY === "1"
          ? { ...baseResolvedProfile, maxRecoveryAttempts: 0 }
          : baseResolvedProfile;
      const implementer = resolvedProfile.roles.implementer;
      const taskPlan = buildBoundRepositoryTaskPlan({
        action: plannedTurn.action,
        prompt: args.initialPrompt ?? "",
        acceptanceCriteria: [],
        ...(plannedTurn.promptUnderstandingBasis &&
        plannedTurn.promptUnderstanding
          ? {
              promptUnderstandingBasis: plannedTurn.promptUnderstandingBasis,
              promptUnderstanding: plannedTurn.promptUnderstanding,
            }
          : {}),
        maxModelTokens: implementer.maxTokens,
        maxWallTimeMs: implementer.maxWallTimeMs,
        ...(implementer.maxUsd === undefined
          ? {}
          : { maxUsd: implementer.maxUsd }),
      });
      const planOperations = [
        ...new Set(taskPlan.tasks.flatMap((task) => task.operations)),
      ];
      let headlessSkillContext:
        | Awaited<ReturnType<NonNullable<CliApplicationDependencies["snapshotSkills"]>>>
        | undefined;
      if (
        shouldAttachProductUiSkill(
          args.initialPrompt ?? "",
          taskPlan.pathEnvelope,
          planOperations,
        )
      ) {
        if (!dependencies.snapshotSkills) {
          throw new Error(
            "[HEADLESS_SKILL_CONTEXT_UNAVAILABLE] Product UI guidance was selected, but the packaged skill snapshot service is unavailable.",
          );
        }
        try {
          headlessSkillContext = await dependencies.snapshotSkills({
            repositoryPath: workingConfig.repositoryPath,
            runId: `headless-${randomUUID()}`,
            skillIds: [PRODUCT_UI_SKILL_ID],
          });
        } catch (error) {
          throw new Error(
            `[HEADLESS_SKILL_CONTEXT_UNAVAILABLE] Could not snapshot ${PRODUCT_UI_SKILL_ID}.`,
            { cause: error },
          );
        }
        if (
          headlessSkillContext.skills.length !== 1 ||
          headlessSkillContext.skills[0]?.skillId !== PRODUCT_UI_SKILL_ID
        ) {
          throw new Error(
            `[HEADLESS_SKILL_CONTEXT_UNAVAILABLE] Snapshot did not contain ${PRODUCT_UI_SKILL_ID}.`,
          );
        }
      }
      const authorizationAction: ProposedRepositoryAction = {
        ...plannedTurn.action,
        operations: planOperations,
        estimatedPaths: [...taskPlan.pathEnvelope],
        estimatedChangedFiles: taskPlan.pathEnvelope.length,
      };
      const planAuthorization = evaluateAgentAction(authorizationAction);
      if (planAuthorization.decision === "takeover_required") {
        dependencies.write(
          args.jsonl
            ? jsonLine({
                kind: "error",
                classification: "planning",
                code: "TASK_PLAN_OUTSIDE_REPOSITORY_AUTHORITY",
                message: planAuthorization.reasons.join(" "),
              })
            : `Task planning blocked: ${terminalSafeText(planAuthorization.reasons.join(" "))}`,
        );
        return 2;
      }
      const conditionalReviewRequired =
        planOperations.some((operation) =>
          ["delete", "rename", "dependency", "migration", "unknown"].includes(
            operation,
          ),
        ) ||
        (resolvedProfile.roles.implementer.routingReasonCodes ?? []).some(
          (reason) =>
            [
              "high_risk_domain",
              "sensitive_operation",
              "cross_package_change",
              "broad_change",
              "recovery_attempt",
            ].includes(reason),
        );
      const implementerTaskId = `implement-${randomUUID()}`;
      const headlessPlan: OrchestrationPlan = {
        schemaVersion: 1,
        id: `plan-${randomUUID()}`,
        runId: "pending-controlled-run",
        parentTaskId: "headless-operator",
        summary: "Execute one explicitly approved headless repository action.",
        createdAt: new Date().toISOString(),
        tasks: [
          {
            id: implementerTaskId,
            role: "implementer",
            title: "Implement approved headless repository action",
            instruction: args.initialPrompt ?? "",
            dependencies: [],
            authority: "single_writer",
            expectedPaths: [],
            expectedArtifacts: ["controlled-diff", "verifier-verdict"],
            depth: 1,
          },
          ...(!resolvedProfile.omittedRoles.includes("reviewer")
            ? [
                {
                  id: `review-${randomUUID()}`,
                  role: "reviewer" as const,
                  title: "Review verified headless repository action",
                  instruction: args.initialPrompt ?? "",
                  dependencies: [],
                  authority: "read_only" as const,
                  expectedPaths: [],
                  expectedArtifacts: ["review-summary"],
                  depth: 1,
                },
              ]
            : []),
        ],
      };
      validateOrchestrationPlan(headlessPlan, resolvedProfile);
      const postVerificationReview =
        dependencies.readOnlyRole &&
        !resolvedProfile.omittedRoles.includes("reviewer")
          ? async (context: {
              runId: string;
              repositoryPath: string;
              sandboxWorktreePath: string;
              status: CliRunResult["status"];
              summary: string;
              signal?: AbortSignal;
            }) => {
              if (context.signal?.aborted) return undefined;
              const shouldReview =
                resolvedProfile.reviewerPolicy === "always" ||
                (resolvedProfile.reviewerPolicy === "failure_only" &&
                  context.status !== "pass") ||
                (resolvedProfile.reviewerPolicy === "conditional" &&
                  (context.status !== "pass" ||
                    conditionalReviewRequired));
              if (!shouldReview) return undefined;
              const reviewer = resolvedProfile.roles.reviewer;
              const startedAt = new Date().toISOString();
              const rawReview = await dependencies.readOnlyRole!({
                role: "reviewer",
                instruction: `Review headless repository action: ${args.initialPrompt ?? ""}`,
                repositoryPath: context.sandboxWorktreePath,
                modelId: reviewer.modelId,
                providerId: reviewer.providerId,
                thinkingEffort: reviewer.thinkingEffort,
                context: `Verifier: ${context.status}. Run: ${context.runId}. Summary: ${context.summary}`,
                signal: context.signal,
                timeoutMs: reviewer.maxWallTimeMs,
              });
              const completedAt = new Date().toISOString();
              const reviewUsage = rawReview.context?.usage.current;
              const review = redactSensitivePayload(rawReview).payload;
              const invocation: ModelInvocationRecord = {
                schemaVersion: 1,
                id: `invocation-${randomUUID()}`,
                runId: context.runId,
                taskId: `review-${context.runId}`,
                role: "reviewer",
                providerId: reviewer.providerId,
                modelId: reviewer.modelId,
                thinkingEffort: reviewer.thinkingEffort,
                requestedModelId:
                  reviewer.requestedModelId ?? reviewer.modelId,
                requestedThinkingEffort:
                  reviewer.requestedThinkingEffort ??
                  reviewer.thinkingEffort,
                phase: "review",
                contextHash: createHash("sha256")
                  .update(`${context.status}:${context.summary}`)
                  .digest("hex"),
                status: "completed",
                inputTokens: reviewUsage?.inputTokens ?? null,
                cachedInputTokens:
                  reviewUsage?.cachedInputTokens ?? null,
                outputTokens: reviewUsage?.outputTokens ?? null,
                reasoningOutputTokens:
                  reviewUsage?.reasoningOutputTokens ?? null,
                estimatedCostUsd: estimateInvocationCostUsd({
                  providerId: reviewer.providerId,
                  modelId: reviewer.modelId,
                  inputTokens: reviewUsage?.inputTokens ?? null,
                  cachedInputTokens: reviewUsage?.cachedInputTokens ?? null,
                  outputTokens: reviewUsage?.outputTokens ?? null,
                }),
                startedAt,
                completedAt,
                durationMs: Math.max(
                  0,
                  Date.parse(completedAt) - Date.parse(startedAt),
                ),
                usagePrecision:
                  rawReview.context?.usage.precision ?? "unknown",
                retryIndex: 0,
                artifactRefs: [],
                ...(reviewer.modelTier
                  ? { modelTier: reviewer.modelTier }
                  : {}),
                ...(reviewer.routingReasonCodes
                  ? {
                      routingReasonCodes: [
                        ...reviewer.routingReasonCodes,
                      ],
                    }
                  : {}),
              };
              let recoveryTask: OrchestrationChildTask | undefined;
              if (
                context.status !== "pass" &&
                review.recovery &&
                resolvedProfile.maxRecoveryAttempts > 0
              ) {
                recoveryTask = {
                  id: `recover-${randomUUID()}`,
                  role: "implementer",
                  title: "Repair failed headless verifier result",
                  instruction: review.recovery.instruction,
                  dependencies: [implementerTaskId],
                  authority: "single_writer",
                  expectedPaths: [],
                  expectedArtifacts: [
                    "controlled-diff",
                    "verifier-verdict",
                  ],
                  depth: 2,
                };
              }
              return {
                invocation,
                summary: review.summary,
                ...(recoveryTask ? { recoveryTask } : {}),
              };
            }
          : undefined;
      const result = await dependencies.run({
        instruction: plannedTurn.action.instruction,
        repositoryPath: workingConfig.repositoryPath,
        modelId: implementer.modelId,
        thinkingEffort: implementer.thinkingEffort,
        taskPlan,
        ...(headlessSkillContext
          ? {
              skillContext: headlessSkillContext,
              selectedSkillIds: [PRODUCT_UI_SKILL_ID],
            }
          : {}),
        orchestration: {
          profile: resolvedProfile,
          plan: headlessPlan,
          priorInvocations: planningInvocations,
        },
        ...(postVerificationReview ? { postVerificationReview } : {}),
        ...(postVerificationReview &&
        resolvedProfile.reviewerPolicy === "conditional" &&
        !conditionalReviewRequired
          ? {
              postVerificationReviewSkipReason:
                "conditional_low_risk_verifier_pass",
            }
          : resolvedProfile.reviewerPolicy === "failure_only"
            ? {
                postVerificationReviewSkipReason:
                  "failure_only_verifier_pass",
              }
            : {}),
        acceptanceCriteria: [],
        authorization: {
          decision: "approval_required",
          risk: "high",
          reasons: ["Headless execution uses the explicit one-run operator grant."],
          source: "headless",
          expectedPaths: [...taskPlan.pathEnvelope],
          allowDestructiveChanges: true,
          allowChangedFileLimitExceeded: true,
          planId: taskPlan.id,
          planRevision: taskPlan.revision,
          planDigest: taskPlan.digest,
        },
        onEvent: (event) => {
          if (args.jsonl) {
            dependencies.write(jsonLine({ kind: "event", event }));
          } else {
            for (const line of presenter.present(event)) dependencies.write(line);
          }
        },
      });
      dependencies.write(
        args.jsonl
          ? jsonLine({
              kind: "result",
              runId: result.runId,
              status: result.status,
              artifactRoot: result.artifactRoot,
              artifactManifestPath: result.artifactManifestPath,
              eventLogPath: result.eventLogPath,
              outcome: result.outcome,
              snapshot: result.cliSnapshot,
            })
          : renderRunCompletion(
              {
                runId: result.runId,
                status: result.status,
                summary: result.cliSnapshot?.summary,
                verification: result.cliSnapshot?.verification,
                evidenceCount: result.cliSnapshot?.evidenceCount,
                artifactManifestPath: result.artifactManifestPath,
                repositoryDiff: result.cliSnapshot?.repositoryDiff,
                interactive: false,
              },
              presenter.snapshot(),
              { color: colorEnabled },
            ),
      );
      return result.status === "pass" ? 0 : 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const failure = repositoryRunFailureDetails(error);
      const classification = failureClassification(message);
      const code = failureCode(message);
      dependencies.write(
        args.jsonl
          ? jsonLine(
              failure
                ? {
                    kind: "result",
                    runId: failure.runId,
                    status: failure.outcome.status,
                    artifactRoot: failure.artifactRoot,
                    artifactManifestPath: failure.artifactManifestPath,
                    eventLogPath: failure.eventLogPath,
                    outcome: failure.outcome,
                    classification: failure.outcome.classification,
                    failureClass:
                      failure.outcome.verifierFailureClass ??
                      failure.outcome.code,
                    message,
                  }
                : {
                    kind: "error",
                    classification,
                    ...(code ? { code } : {}),
                    message,
                  },
            )
          : renderRunCompletion(
              {
                status: "fail",
                errorMessage: message,
                artifactManifestPath: failure?.artifactManifestPath,
                interactive: false,
              },
              presenter.snapshot(),
              { color: colorEnabled },
            ),
      );
      return 1;
    }
  }

  startupActivity?.update("Checking Codex");
  let provider: ProviderStatus;
  try {
    provider = await dependencies.probeProvider();
    startupActivity?.stop();
  } catch (error) {
    startupActivity?.fail("Provider check failed");
    throw error;
  }
  if (!provider.ready && dependencies.isTTY && dependencies.setupProvider) {
    const setupResult = await dependencies.setupProvider(provider);
    provider = setupResult.status;
    if (setupResult.outcome !== "ready") {
      dependencies.write(
        `Codex setup remains incomplete: ${terminalSafeText(provider.detail)}`,
      );
      return 1;
    }
  }
  const workingConfig = resolveWorkingConfig(
    args,
    savedWorkingConfig,
    resumed,
  );
  const startupBoundaryAcknowledged = dependencies.isTTY
    ? await dependencies.hasAcknowledgedStartupBoundary?.() ?? true
    : true;
  const initialState: InteractiveSessionState = resumed
    ? {
        ...resumed,
      ...workingConfig,
        providerReady: provider.ready,
        providerDetail: provider.detail,
        activityDetails:
          args.activityDetails ?? savedPreferences.activityDetails,
      }
    : {
        ...workingConfig,
        providerReady: provider.ready,
        providerDetail: provider.detail,
        activityDetails:
          args.activityDetails ?? savedPreferences.activityDetails,
      };
  if (resumed && initialState.promptUnderstandingDraft) {
    initialState.promptUnderstandingDraft = {
      ...initialState.promptUnderstandingDraft,
      requiresReconfirmation: true,
    };
  }
  if (resumed && workingConfig.repositoryPath !== resumed.repositoryPath) {
    delete initialState.goal;
    delete initialState.conversationSummary;
    delete initialState.promptUnderstandingDraft;
    delete initialState.lastRun;
    initialState.acceptanceCriteria = [];
    initialState.turnCount = 0;
  }
  const sessionResult = await runInteractiveSession({
    initialPrompt: args.initialPrompt,
    state: initialState,
    terminal: {
    ask: dependencies.ask,
    compose: dependencies.compose,
    beginLiveInput: dependencies.beginLiveInput,
    takeSubmittedImages: dependencies.takeSubmittedImages,
    takeSubmittedDraft: dependencies.takeSubmittedDraft,
      select: dependencies.select,
      remember: dependencies.remember,
      beginActivity: dependencies.beginActivity,
      beginMessageStream: dependencies.beginMessageStream,
      write: dependencies.write,
      notify: dependencies.notify,
      setProviderUsage: dependencies.setProviderUsage,
      writeCentered: dependencies.writeCentered,
      clear: dependencies.clear,
      color: args.color && dependencies.isTTY && dependencies.color !== false,
      themeId:
        dependencies.appearanceResolution?.themeId ??
        dependencies.themeId ??
        DEFAULT_TERMINAL_THEME_ID,
      richText:
        dependencies.appearanceResolution?.richText ??
        dependencies.richText ??
        false,
      isTTY: dependencies.isTTY,
      get width() {
        return dependencies.width;
      },
      get height() {
        return dependencies.height;
      },
    },
    probeProvider: dependencies.probeProvider,
    setupProvider: dependencies.setupProvider,
    listModels: dependencies.listModels,
    turn: dependencies.turn,
    readOnlyRole: dependencies.readOnlyRole,
    run: dependencies.run,
    diagnose: dependencies.diagnose,
    readProviderUsage: dependencies.readProviderUsage,
    codeIntelStatus: dependencies.codeIntelStatus,
    listSkills: dependencies.listSkills,
    routeSkills: dependencies.routeSkills,
    snapshotSkills: dependencies.snapshotSkills,
    persistSession: dependencies.persistSession,
    loadSession: dependencies.loadSession,
    listSessions: dependencies.listSessions,
    appendTranscript: dependencies.appendTranscript,
    readTranscript: dependencies.readTranscript,
    copyText: dependencies.copyText,
    compactContext: dependencies.compactContext,
    persistWorkingConfig: dependencies.persistWorkingConfig,
    persistActivityDetails: dependencies.persistActivityDetails,
    skillRouting: savedPreferences.skillRouting,
    persistSkillRouting: dependencies.persistSkillRouting,
    capabilityRuntimeSettings: savedPreferences.capabilityRuntime,
    persistCapabilityRuntime: dependencies.persistCapabilityRuntime,
    appearancePreferences: savedPreferences.appearance,
    clipboardPreferences: savedPreferences.clipboard,
    appearanceResolution:
      dependencies.appearanceResolution ?? {
        color: args.color && dependencies.color !== false,
        motion: true,
        richText: dependencies.isTTY,
        themeId:
          dependencies.themeId ??
          args.themeId ??
          DEFAULT_TERMINAL_THEME_ID,
        screenMode: "inline",
      },
    persistAppearance: dependencies.persistAppearance,
    applyAppearance: dependencies.applyAppearance,
    persistClipboard: dependencies.persistClipboard,
    applyClipboard: dependencies.applyClipboard,
    shortcutPreferences: savedPreferences.shortcuts,
    persistShortcuts: dependencies.persistShortcuts,
    applyShortcuts: dependencies.applyShortcuts,
    statuslinePreferences: savedPreferences.statusline,
    persistStatusline: dependencies.persistStatusline,
    applyStatusline: dependencies.applyStatusline,
    activityDetailsOverride: args.activityDetails,
    startupBoundaryAcknowledged,
    acknowledgeStartupBoundary: dependencies.acknowledgeStartupBoundary,
    prepareRunSignal: dependencies.prepareRunSignal,
    cancelRunSignal: dependencies.cancelRunSignal,
    releaseRunSignal: dependencies.releaseRunSignal,
  });
  return sessionResult === "interrupted" ? 130 : 0;
}
