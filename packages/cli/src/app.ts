import { createHash, randomUUID } from "node:crypto";
import path from "node:path";

import {
  createLegacySingleModelProfile,
  redactSensitivePayload,
  resolveOrchestrationProfile,
  validateOrchestrationPlan,
  type ModelInvocationRecord,
  type OrchestrationChildTask,
  type OrchestrationPlan,
  type OrchestrationProfile,
} from "@codepawl/shared";

import {
  DEFAULT_CLI_ORCHESTRATION_PROFILE,
  DEFAULT_CLI_MODEL_ID,
  DEFAULT_CLI_THINKING_EFFORT,
  applyCliOrchestrationOverrides,
  cliHelp,
  parseCliArgs,
  type CliArguments,
} from "./runtime.js";
import type { CliAgentTurnRequest, CliAgentTurnResult } from "./agent.js";
import type { ComposerChoice } from "./composer.js";
import type { InlineActivityHandle } from "./composer.js";
import {
  runInteractiveSession,
  type CliRunRequest,
  type CliRunResult,
  type InteractiveSessionOptions,
  type InteractiveSessionState,
  type ProviderStatus,
} from "./session.js";
import type {
  CliPreferences,
  CliSessionSnapshot,
  CliWorkingConfig,
} from "./state.js";
import { normalizeCliWorkingConfig } from "./state.js";
import {
  RunPresenter,
  renderRunCompletion,
  terminalSafeText,
  type CliModelOption,
} from "./ui.js";

export type CliApplicationDependencies = {
  cwd: string;
  isTTY: boolean;
  color?: boolean;
  width?: number;
  height?: number;
  ask: (prompt: string) => Promise<string>;
  compose?: (prompt: string) => Promise<string>;
  select?: (
    prompt: string,
    choices: ComposerChoice[],
    currentValue?: string,
  ) => Promise<string>;
  remember?: (value: string) => void;
  beginActivity?: (label: string) => InlineActivityHandle;
  write: (value: string) => void;
  clear: () => void;
  probeProvider: () => Promise<ProviderStatus>;
  listModels?: () => Promise<CliModelOption[]>;
  turn?: (request: CliAgentTurnRequest) => Promise<CliAgentTurnResult>;
  readOnlyRole?: InteractiveSessionOptions["readOnlyRole"];
  run: (request: CliRunRequest) => Promise<CliRunResult>;
  diagnose?: (repositoryPath?: string) => Promise<string[]>;
  persistSession?: (session: CliSessionSnapshot) => Promise<void>;
  loadSession?: (sessionId: string) => Promise<CliSessionSnapshot | undefined>;
  loadPreferences?: () => Promise<CliPreferences>;
  persistWorkingConfig?: (patch: CliWorkingConfig) => Promise<void>;
  hasAcknowledgedStartupBoundary?: () => Promise<boolean>;
  acknowledgeStartupBoundary?: () => Promise<void>;
  prepareRunSignal?: () => AbortSignal;
  releaseRunSignal?: (signal: AbortSignal) => void;
};

function failureClassification(message: string): "permission" | "environment" | "transient" | "model" | "unknown" {
  if (/permission|approval|denied|unauthorized/i.test(message)) return "permission";
  if (/not found|enoent|repository|git |workspace/i.test(message)) return "environment";
  if (/timeout|timed out|temporary|transient/i.test(message)) return "transient";
  if (/codex|model|401|429/i.test(message)) return "model";
  return "unknown";
}

function jsonLine(value: Record<string, unknown>): string {
  return JSON.stringify({ schemaVersion: 1, ...value });
}

async function loadWorkingConfig(
  dependencies: CliApplicationDependencies,
): Promise<CliWorkingConfig> {
  if (!dependencies.loadPreferences) return {};
  const preferences = await dependencies.loadPreferences();
  if (preferences?.workingConfig !== undefined) {
    return preferences.workingConfig;
  }
  if (!dependencies.persistWorkingConfig) return {};
  const latest = await dependencies.loadSession?.("latest");
  const bootstrapped = normalizeCliWorkingConfig(
    latest
      ? {
        repositoryPath: latest.repositoryPath,
        orchestrationProfile: latest.orchestrationProfile,
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
  const coordinator = orchestrationProfile.roles.coordinator;
  return {
    repositoryPath: args.explicitConfig.repository
      ? args.repositoryPath
      : resumed?.repositoryPath ?? saved.repositoryPath ?? args.repositoryPath,
    orchestrationProfile,
    modelId: coordinator.modelId,
    thinkingEffort: coordinator.thinkingEffort,
  };
}

async function resolvedProfileForTask(
  profile: OrchestrationProfile,
  instruction: string,
  dependencies: CliApplicationDependencies,
) {
  const models = dependencies.listModels
    ? await dependencies.listModels()
    : Object.values(profile.roles).map((binding) => ({
        id: binding.modelId,
        label: binding.modelId,
        supportedThinkingEfforts: [binding.thinkingEffort],
      }));
  return resolveOrchestrationProfile(profile, models, { instruction });
}

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
    dependencies.write(cliHelp());
    return 0;
  }
  if (args.version) {
    dependencies.write("0.1.0");
    return 0;
  }

  if (args.command === "doctor") {
    const diagnostics = await dependencies.diagnose?.(args.repositoryPath);
    dependencies.write(
      diagnostics?.map((line) => terminalSafeText(line)).join("\n") ??
        "Doctor diagnostics are unavailable in this host.",
    );
    return 0;
  }

  const resumed = args.command !== "run" && args.resumeSessionId
    ? await dependencies.loadSession?.(args.resumeSessionId)
    : undefined;
  if (args.command !== "run" && args.resumeSessionId && !resumed) {
    dependencies.write(`Session not found: ${terminalSafeText(args.resumeSessionId)}`);
    return 2;
  }
  if (args.command !== "run" && !dependencies.isTTY) {
    dependencies.write(
      "Interactive conversation requires a TTY. For headless repository work, use `orynt run --approve-once <goal>`.",
    );
    return 2;
  }

  let savedWorkingConfig: CliWorkingConfig;
  try {
    savedWorkingConfig = await loadWorkingConfig(dependencies);
  } catch (error) {
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
          ? jsonLine({ kind: "error", classification: "environment", message })
          : terminalSafeText(message),
      );
      return 1;
    }
    const presenter = new RunPresenter({ color: colorEnabled });
    try {
      const resolvedProfile = await resolvedProfileForTask(
        workingConfig.orchestrationProfile,
        args.initialPrompt ?? "",
        dependencies,
      );
      const implementer = resolvedProfile.roles.implementer;
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
                resolvedProfile.reviewerPolicy === "conditional" ||
                (resolvedProfile.reviewerPolicy === "failure_only" &&
                  context.status !== "pass");
              if (!shouldReview) return undefined;
              const reviewer = resolvedProfile.roles.reviewer;
              const startedAt = new Date().toISOString();
              const rawReview = await dependencies.readOnlyRole!({
                role: "reviewer",
                instruction: `Review headless repository action: ${args.initialPrompt ?? ""}`,
                repositoryPath: context.sandboxWorktreePath,
                modelId: reviewer.modelId,
                thinkingEffort: reviewer.thinkingEffort,
                context: `Verifier: ${context.status}. Run: ${context.runId}. Summary: ${context.summary}`,
                signal: context.signal,
                timeoutMs: reviewer.maxWallTimeMs,
              });
              const review = redactSensitivePayload(rawReview).payload;
              const invocation: ModelInvocationRecord = {
                schemaVersion: 1,
                id: `invocation-${randomUUID()}`,
                runId: context.runId,
                taskId: `review-${context.runId}`,
                role: "reviewer",
                providerId: "codex-cli",
                modelId: reviewer.modelId,
                thinkingEffort: reviewer.thinkingEffort,
                contextHash: createHash("sha256")
                  .update(`${context.status}:${context.summary}`)
                  .digest("hex"),
                status: "completed",
                inputTokens: null,
                outputTokens: null,
                estimatedCostUsd: null,
                startedAt,
                completedAt: new Date().toISOString(),
                retryIndex: 0,
                artifactRefs: [],
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
        instruction: args.initialPrompt ?? "",
        repositoryPath: workingConfig.repositoryPath,
        modelId: implementer.modelId,
        thinkingEffort: implementer.thinkingEffort,
        orchestration: {
          profile: resolvedProfile,
          plan: headlessPlan,
          priorInvocations: [],
        },
        ...(postVerificationReview ? { postVerificationReview } : {}),
        acceptanceCriteria: [],
        authorization: {
          decision: "approval_required",
          risk: "high",
          reasons: ["Headless execution uses the explicit one-run operator grant."],
          source: "headless",
          expectedPaths: [],
          allowDestructiveChanges: true,
          allowChangedFileLimitExceeded: true,
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
              artifactManifestPath: result.artifactManifestPath,
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
                interactive: false,
              },
              presenter.snapshot(),
              { color: colorEnabled },
            ),
      );
      return result.status === "pass" ? 0 : 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const classification = failureClassification(message);
      dependencies.write(
        args.jsonl
          ? jsonLine({ kind: "error", classification, message })
          : renderRunCompletion(
              {
                status: "fail",
                errorMessage: message,
                interactive: false,
              },
              presenter.snapshot(),
              { color: colorEnabled },
            ),
      );
      return 1;
    }
  }

  const startupActivity = dependencies.beginActivity?.(
    "Checking Codex provider",
  );
  let provider: ProviderStatus;
  try {
    provider = await dependencies.probeProvider();
    startupActivity?.stop();
  } catch (error) {
    startupActivity?.fail("Provider check failed");
    throw error;
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
      }
    : {
        ...workingConfig,
        providerReady: provider.ready,
        providerDetail: provider.detail,
      };
  if (resumed && workingConfig.repositoryPath !== resumed.repositoryPath) {
    delete initialState.goal;
    delete initialState.conversationSummary;
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
      select: dependencies.select,
    remember: dependencies.remember,
    beginActivity: dependencies.beginActivity,
      write: dependencies.write,
      clear: dependencies.clear,
      color: args.color && dependencies.isTTY && dependencies.color !== false,
      isTTY: dependencies.isTTY,
      width: dependencies.width,
      height: dependencies.height,
    },
    probeProvider: dependencies.probeProvider,
    listModels: dependencies.listModels,
    turn: dependencies.turn,
    readOnlyRole: dependencies.readOnlyRole,
    run: dependencies.run,
    diagnose: dependencies.diagnose,
    persistSession: dependencies.persistSession,
    loadSession: dependencies.loadSession,
    persistWorkingConfig: dependencies.persistWorkingConfig,
    startupBoundaryAcknowledged,
    acknowledgeStartupBoundary: dependencies.acknowledgeStartupBoundary,
    prepareRunSignal: dependencies.prepareRunSignal,
    releaseRunSignal: dependencies.releaseRunSignal,
  });
  return sessionResult === "interrupted" ? 130 : 0;
}
