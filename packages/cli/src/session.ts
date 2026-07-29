import { createHash, randomUUID } from "node:crypto";
import path from "node:path";

import type { DesktopRepositoryRunOutput } from "@codepawl/coding-apprentice";
import {
  createLegacySingleModelProfile,
  createOrchestrationPreset,
  redactSensitivePayload,
  resolveOrchestrationProfile,
  validateOrchestrationRecoveryTask,
  validateOrchestrationPlan,
  type OrchestrationPreset,
  type OrchestrationProfile,
  type OrchestrationRole,
  type OrchestrationChildTask,
  type OrchestrationPlan,
  type ModelInvocationRecord,
  type ResolvedOrchestrationProfile,
  type RunEventType,
} from "@codepawl/shared";

import {
  evaluateAgentAction,
  resolveCliConversationRepository,
  type AgentActionAuthorization,
  type CliAgentTurnRequest,
  type CliAgentTurnResult,
  type CliConversationTurn,
  type CliReadOnlyRoleRequest,
  type CliReadOnlyRoleResult,
  type ProposedRepositoryAction,
} from "./agent.js";
import type {
  CliRunSnapshot,
  CliSessionSnapshot,
  CliWorkingConfig,
} from "./state.js";
import { normalizeCliWorkingConfig } from "./state.js";
import {
  INTERRUPTED_INPUT,
  type InlineActivityHandle,
  type ComposerChoice,
} from "./composer.js";
import {
  RunPresenter,
  parseInteractiveInput,
  renderCommandHelp,
  renderRunCompletion,
  renderTreeRows,
  renderWelcome,
  terminalSafeMultilineText,
  terminalSafeText,
  type CliModelOption,
  type ThinkingEffort,
  type WelcomeState,
} from "./ui.js";
import {
  createTerminalTheme,
  type TerminalRole,
  type TerminalTheme,
} from "./terminal-theme.js";

export type CliRunEvent = {
  type: RunEventType;
  payload: unknown;
};

export type CliRunRequest = {
  instruction: string;
  repositoryPath: string;
  modelId: string;
  thinkingEffort: ThinkingEffort;
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
  activeGoal?: string;
  acceptanceCriteria: string[];
  selectedSkillIds?: string[];
  authorization: AgentActionAuthorization & {
    source: "automatic_policy" | "operator" | "headless";
    expectedPaths: string[];
    allowDestructiveChanges: boolean;
    allowChangedFileLimitExceeded: boolean;
  };
  onEvent: (event: CliRunEvent) => void;
  signal?: AbortSignal;
};

export type CliRunResult = DesktopRepositoryRunOutput & { cliSnapshot?: CliRunSnapshot };

export type ProviderStatus = {
  ready: boolean;
  detail: string;
};

export type InteractiveSessionState = WelcomeState & {
  providerDetail: string;
  sessionId?: string;
  mode?: CliSessionSnapshot["mode"];
  goal?: string;
  acceptanceCriteria?: string[];
  selectedSkillIds?: string[];
  conversationSummary?: string;
  turnCount?: number;
  lastRun?: CliRunSnapshot;
  createdAt?: string;
};

export type InteractiveTerminal = {
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
  color: boolean;
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
  listModels?: () => Promise<CliModelOption[]>;
  diagnose?: (repositoryPath?: string) => Promise<string[]>;
  listSkills?: (
    repositoryPath: string,
  ) => Promise<
    Array<{
      id: string;
      name: string;
      scope: string;
      eligible: boolean;
      health: string;
    }>
  >;
  persistSession?: (session: CliSessionSnapshot) => Promise<void>;
  loadSession?: (sessionId: string) => Promise<CliSessionSnapshot | undefined>;
  persistWorkingConfig?: (patch: CliWorkingConfig) => Promise<void>;
  startupBoundaryAcknowledged?: boolean;
  acknowledgeStartupBoundary?: () => Promise<void>;
  prepareRunSignal?: () => AbortSignal;
  releaseRunSignal?: (signal: AbortSignal) => void;
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
  options: { fallbackRow?: boolean } = {},
): InlineActivityHandle {
  if (terminal.beginActivity) return terminal.beginActivity(label);
  if (options.fallbackRow) terminal.write(`  ◇ ${terminalSafeText(label)}`);
  return NOOP_ACTIVITY;
}

function completedInvocation(input: {
  id?: string;
  runId?: string;
  taskId: string;
  role: ModelInvocationRecord["role"];
  modelId: string;
  thinkingEffort: ThinkingEffort;
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
    providerId: "codex-cli",
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

function modelChoiceDescription(model: CliModelOption): string {
  const efforts = model.supportedThinkingEfforts.length > 0
    ? `effort: ${model.supportedThinkingEfforts.join(", ")}`
    : "effort: provider default";
  return model.description ? `${model.description} · ${efforts}` : efforts;
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

function orchestrationProfileText(profile: OrchestrationProfile): string {
  const rows = [
    ...ORCHESTRATION_ROLES.map((role) => {
      const binding = profile.roles[role];
      return `${role.padEnd(12)} ${terminalSafeText(binding.modelId)} · ${binding.thinkingEffort}`;
    }),
    `review       ${profile.reviewerPolicy.replace("_", " ")}`,
    `limits       ${profile.maxReadOnlyHelpers} helpers · depth ${profile.maxDepth} · ${profile.maxRecoveryAttempts} recovery`,
    "budgets      wall time hard · token/cost advisory unless provider-enforced",
  ];
  return [
    `Orchestration profile · ${profile.preset}`,
    ...renderTreeRows(rows),
  ].join("\n");
}

function presetProfile(preset: typeof EDITABLE_PRESETS[number]): OrchestrationProfile {
  return preset === "auto"
    ? { ...createOrchestrationPreset("balanced"), preset: "auto" }
    : createOrchestrationPreset(preset);
}

function setProfile(
  state: InteractiveSessionState,
  profile: OrchestrationProfile,
): void {
  state.orchestrationProfile = profile;
  state.modelId = profile.roles.coordinator.modelId;
  state.thinkingEffort = profile.roles.coordinator.thinkingEffort;
}

function roleName(value: string): OrchestrationRole | undefined {
  return ORCHESTRATION_ROLES.find((role) => role === value);
}

async function resolveSessionProfile(
  state: InteractiveSessionState,
  options: InteractiveSessionOptions,
  instruction: string,
  action?: ProposedRepositoryAction,
): Promise<ResolvedOrchestrationProfile> {
  const profile = state.orchestrationProfile;
  if (!profile) {
    throw new Error("The session has no orchestration profile");
  }
  const models = options.listModels
    ? await options.listModels()
    : Object.values(profile.roles).map((binding) => ({
        id: binding.modelId,
        label: binding.modelId,
        supportedThinkingEfforts: [binding.thinkingEffort],
      }));
  return resolveOrchestrationProfile(profile, models, {
    instruction,
    estimatedChangedFiles: action?.estimatedChangedFiles,
    operations: action?.operations,
  });
}

function statusText(state: InteractiveSessionState): string {
  const rows = [
    `Repository   ${terminalSafeText(state.repositoryPath)}`,
    `Profile      ${terminalSafeText(state.orchestrationProfile?.preset ?? "legacy")}`,
    `Coordinator  ${terminalSafeText(`${state.modelId} · ${state.thinkingEffort}`)}`,
    `Implementer  ${terminalSafeText(
      state.orchestrationProfile
        ? `${state.orchestrationProfile.roles.implementer.modelId} · ${state.orchestrationProfile.roles.implementer.thinkingEffort}`
        : `${state.modelId} · ${state.thinkingEffort}`,
    )}`,
    `Provider     ${state.providerReady ? "ready" : "not ready"} · ${terminalSafeText(state.providerDetail)}`,
    `Mode         ${terminalSafeText(state.mode ?? "plan")}`,
    `Goal         ${terminalSafeText(state.goal ?? "not set")}`,
    `Turns        ${state.turnCount ?? 0}`,
    "Boundary     repository-only, isolated worktree, verifier required",
  ];
  return [
    "Session",
    ...renderTreeRows(rows),
  ].join("\n");
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
  options: { color?: boolean } = {},
): string {
  const theme = createTerminalTheme(options.color ?? false);
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
  options: { color?: boolean } = {},
): string {
  const theme = createTerminalTheme(options.color ?? false);
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

type ComposerReadResult =
  | { kind: "input"; value: string }
  | { kind: "interrupt" };

async function readComposer(terminal: InteractiveTerminal): Promise<ComposerReadResult> {
  let line = await (terminal.compose ?? terminal.ask)("\n❯ ");
  if (line === INTERRUPTED_INPUT) return { kind: "interrupt" };
  const lines: string[] = [];
  while (line.trimEnd().endsWith("\\")) {
    lines.push(line.trimEnd().slice(0, -1).trimEnd());
    line = await terminal.ask("… ");
    if (line === INTERRUPTED_INPUT) return { kind: "interrupt" };
  }
  lines.push(line);
  const value = lines.join("\n").trim();
  terminal.remember?.(value);
  return { kind: "input", value };
}

function planText(state: InteractiveSessionState): string {
  return [
    "Operator plan",
    ...renderTreeRows([
      `Goal         ${terminalSafeText(state.goal ?? "not set")}`,
      `Acceptance   ${terminalSafeText(state.acceptanceCriteria?.join("; ") || "runtime contract + verifier gates")}`,
      "1. Read the current message with active goal and conversation context",
      "2. Answer in read-only chat or propose a repository-scoped action",
      "3. Auto-authorize safe actions; request approval for sensitive actions",
      "4. Import controlled artifacts and run independent verification",
      "5. Persist compact state, evidence, cost, and candidate memory",
    ]),
  ].join("\n");
}

function stateText(state: InteractiveSessionState): string {
  const run = state.lastRun;
  if (!run) return "Working state: no completed run in this session.";
  return [
    `Working state · ${terminalSafeText(run.runId)}`,
    ...renderTreeRows([
      `Mode             ${terminalSafeText(run.workingState?.mode ?? "not recorded")}`,
      `Active chunks    ${run.workingState?.activeChunkCount ?? 0}`,
      `Constraints      ${terminalSafeText(run.workingState?.hardConstraints.join("; ") || "not recorded")}`,
      `Selected option  ${terminalSafeText(run.workingState?.selectedOptionId ?? "not recorded")}`,
      `Memory           ${terminalSafeText(run.memory?.summary ?? "not recorded")}`,
    ]),
  ].join("\n");
}

function evidenceText(state: InteractiveSessionState): string {
  const run = state.lastRun;
  if (!run) return "Evidence: no completed run in this session.";
  const artifacts = Object.entries(run.artifacts).filter((entry): entry is [string, string] => typeof entry[1] === "string");
  return [
    `Evidence · ${run.evidenceCount} artifact${run.evidenceCount === 1 ? "" : "s"}`,
    ...renderTreeRows([
      ...artifacts.map(
        ([name, artifactPath]) =>
          `${terminalSafeText(name)}  ${terminalSafeText(artifactPath)}`,
      ),
      `manifest  ${terminalSafeText(run.artifactManifestPath)}`,
    ]),
  ].join("\n");
}

function verificationText(state: InteractiveSessionState): string {
  const run = state.lastRun;
  return run
    ? `Verification ${terminalSafeText(run.verification)} · ${terminalSafeText(run.summary)}`
    : "Verification pending · no completed run in this session.";
}

function costText(state: InteractiveSessionState): string {
  const run = state.lastRun;
  if (!run) return "Cost: no completed run in this session.";
  const usd = run.estimatedCostUsd === undefined ? "not recorded" : `$${run.estimatedCostUsd.toFixed(4)}`;
  const perSuccess = run.costPerSuccessfulTask === undefined ? "not recorded" : `$${run.costPerSuccessfulTask.toFixed(4)}`;
  return `Cost · tokens ${run.estimatedTotalTokens ?? "not recorded"} · estimated ${usd} · per successful task ${perSuccess}`;
}

function sessionSnapshot(state: InteractiveSessionState): CliSessionSnapshot {
  const now = new Date().toISOString();
  return {
    schemaVersion: 2,
    sessionId: state.sessionId ?? `session-${Date.now()}`,
    repositoryPath: state.repositoryPath,
    orchestrationProfile:
      state.orchestrationProfile ??
      createLegacySingleModelProfile(state.modelId, state.thinkingEffort),
    modelId: state.modelId,
    thinkingEffort: state.thinkingEffort,
    mode: state.mode ?? "plan",
    ...(state.goal ? { goal: state.goal } : {}),
    acceptanceCriteria: state.acceptanceCriteria ?? [],
    selectedSkillIds: state.selectedSkillIds ?? [],
    ...(state.conversationSummary
      ? { conversationSummary: state.conversationSummary }
      : {}),
    turnCount: state.turnCount ?? 0,
    ...(state.lastRun ? { lastRun: state.lastRun } : {}),
    createdAt: state.createdAt ?? now,
    updatedAt: now,
  };
}

export async function runInteractiveSession(
  options: InteractiveSessionOptions,
): Promise<"completed" | "interrupted"> {
  const { terminal } = options;
  const theme = createTerminalTheme(terminal.color);
  const state: InteractiveSessionState = {
    ...options.state,
    orchestrationProfile:
      options.state.orchestrationProfile ??
      createLegacySingleModelProfile(
        options.state.modelId,
        options.state.thinkingEffort,
      ),
    sessionId: options.state.sessionId ?? `session-${Date.now()}`,
    mode: options.state.mode ?? "plan",
    acceptanceCriteria: [...(options.state.acceptanceCriteria ?? [])],
    selectedSkillIds: [...(options.state.selectedSkillIds ?? [])],
    turnCount: options.state.turnCount ?? 0,
    createdAt: options.state.createdAt ?? new Date().toISOString(),
  };
  const persist = async () => options.persistSession?.(sessionSnapshot(state));
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
  const recentTurns: CliConversationTurn[] = [];
  let pendingInitialPrompt = options.initialPrompt?.trim();

  terminal.write(renderWelcome(state, { color: terminal.color, width: terminal.width }));
  if (terminal.isTTY && options.startupBoundaryAcknowledged === false) {
    terminal.write(startupBoundaryText(state, { color: terminal.color }));
    const acknowledgement = await terminal.ask("Acknowledge this supervised repository boundary? [y/N] ");
    if (acknowledgement === INTERRUPTED_INPUT) {
      terminal.write("Startup interrupted. No repository run was started.");
      return "interrupted";
    }
    if (!isApproval(acknowledgement)) {
      terminal.write("Startup cancelled. No repository run was started.");
      return "completed";
    }
    await options.acknowledgeStartupBoundary?.();
    terminal.write("Safety boundary acknowledged. Sensitive work still requires review.");
  }

  for (;;) {
    const composerResult = pendingInitialPrompt
      ? { kind: "input" as const, value: pendingInitialPrompt }
      : await readComposer(terminal);
    pendingInitialPrompt = undefined;
    if (composerResult.kind === "interrupt") {
      terminal.write("Draft cancelled.");
      continue;
    }
    const input = composerResult.value;
    const command = parseInteractiveInput(input);
    if (command.kind === "empty") {
      continue;
    }
    if (command.kind === "exit") {
      terminal.write("Session ended. No background run remains attached.");
      return "completed";
    }
    if (command.kind === "help") {
      terminal.write(renderCommandHelp());
      continue;
    }
    if (command.kind === "clear") {
      terminal.clear();
      terminal.write(renderWelcome(state, { color: terminal.color, width: terminal.width }));
      continue;
    }
    if (command.kind === "status") {
      const activity = beginTerminalActivity(terminal, "Checking Codex provider");
      try {
        const provider = await options.probeProvider();
        state.providerReady = provider.ready;
        state.providerDetail = provider.detail;
        activity.settle("Provider check complete");
      } catch (error) {
        activity.fail("Provider check failed");
        throw error;
      }
      terminal.write(statusText(state));
      continue;
    }
    if (command.kind === "goal") {
      if (!command.value) {
        terminal.write(`Goal: ${terminalSafeText(state.goal ?? "not set")}`);
        continue;
      }
      if (command.value === "--clear") {
        delete state.goal;
        await persist();
        terminal.write("Goal cleared.");
        continue;
      }
      state.goal = command.value;
      await persist();
      terminal.write(`Goal set: ${terminalSafeText(state.goal)}`);
      continue;
    }
    if (command.kind === "skills") {
      const [operation = "list", ...arguments_] = command.value
        .trim()
        .split(/\s+/)
        .filter(Boolean);
      if (operation === "list") {
        if (!options.listSkills) {
          terminal.write("Skill inventory is unavailable in this host.");
          continue;
        }
        try {
          const inventory = await options.listSkills(state.repositoryPath);
          const attached = new Set(state.selectedSkillIds ?? []);
          terminal.write(
            inventory.length
              ? [
                  "Agent Skills",
                  ...inventory.map(
                    (skill) =>
                      `  ${attached.has(skill.id) ? "●" : "○"} ${terminalSafeText(skill.id)} · ${terminalSafeText(skill.scope)} · ${terminalSafeText(skill.health)}${skill.eligible ? "" : " · unavailable"}`,
                  ),
                ].join("\n")
              : "No Agent Skills were discovered for this repository.",
          );
        } catch (error) {
          terminal.write(
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
        terminal.write("All Agent Skill attachments cleared.");
        continue;
      }
      const skillId = arguments_.join(" ").trim();
      if (
        (operation !== "use" && operation !== "remove") ||
        !/^[a-zA-Z0-9._:-]{1,200}$/.test(skillId)
      ) {
        terminal.write("Usage: /skills [list|use <id>|remove <id>|clear]");
        continue;
      }
      const selected = new Set(state.selectedSkillIds ?? []);
      if (operation === "use") {
        const inventory = await options.listSkills?.(state.repositoryPath);
        const skill = inventory?.find((candidate) => candidate.id === skillId);
        if (!skill?.eligible) {
          terminal.write(
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
      terminal.write(
        `${operation === "use" ? "Attached" : "Detached"} Agent Skill: ${terminalSafeText(skillId)}`,
      );
      continue;
    }
    if (command.kind === "criteria") {
      state.acceptanceCriteria = command.value.split(";").map((item) => item.trim()).filter(Boolean);
      await persist();
      terminal.write(`Acceptance criteria: ${terminalSafeText(state.acceptanceCriteria.join("; "))}`);
      continue;
    }
    if (command.kind === "plan") {
      terminal.write(planText(state));
      continue;
    }
    if (command.kind === "state") {
      terminal.write(stateText(state));
      continue;
    }
    if (command.kind === "evidence") {
      terminal.write(evidenceText(state));
      continue;
    }
    if (command.kind === "verify") {
      terminal.write(verificationText(state));
      continue;
    }
    if (command.kind === "cost") {
      terminal.write(costText(state));
      continue;
    }
    if (command.kind === "doctor") {
      const activity = beginTerminalActivity(terminal, "Running diagnostics");
      let diagnostics: string[] | undefined;
      try {
        diagnostics = await options.diagnose?.(state.repositoryPath);
        activity.settle("Diagnostics complete");
      } catch (error) {
        activity.fail("Diagnostics failed");
        terminal.write(
          `Diagnostics failed: ${terminalSafeText(
            error instanceof Error ? error.message : String(error),
          )}`,
        );
        continue;
      }
      terminal.write(
        diagnostics?.map((line) => terminalSafeText(line)).join("\n") ??
          "Doctor diagnostics are unavailable in this host.",
      );
      continue;
    }
    if (command.kind === "resume") {
      const activity = beginTerminalActivity(terminal, "Loading session");
      let resumed: CliSessionSnapshot | undefined;
      try {
        resumed = await options.loadSession?.(command.value);
      } catch (error) {
        activity.fail("Session load failed");
        terminal.write(
          `Session load failed: ${terminalSafeText(
            error instanceof Error ? error.message : String(error),
          )}`,
        );
        continue;
      }
      if (!resumed) {
        activity.fail("Session not found");
        terminal.write(`Session not found: ${terminalSafeText(command.value)}`);
        continue;
      }
      activity.settle("Session loaded");
      Object.assign(state, resumed, {
        providerReady: state.providerReady,
        providerDetail: state.providerDetail,
        acceptanceCriteria: [...resumed.acceptanceCriteria],
      });
      recentTurns.splice(0);
      terminal.write(
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
        terminal.write(
          `Workspace rejected: ${terminalSafeText(command.value)} is not inside a Git repository.`,
        );
        continue;
      }
      if (repositoryPath !== state.repositoryPath) {
        delete state.conversationSummary;
        delete state.goal;
        delete state.lastRun;
      state.acceptanceCriteria = [];
      state.selectedSkillIds = [];
        state.turnCount = 0;
        recentTurns.splice(0);
      }
      state.repositoryPath = repositoryPath;
      await persist();
      const warning = await saveWorkingConfig({ repositoryPath });
      terminal.write(
        `Workspace changed to ${terminalSafeText(state.repositoryPath)}${
          warning ? `\n${warning}` : ""
        }`,
      );
      continue;
    }
    if (command.kind === "model") {
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
        terminal.write(orchestrationProfileText(currentProfile));
        continue;
      }
      if (subcommand === "profile") {
        const preset = tokens[1] as typeof EDITABLE_PRESETS[number] | undefined;
        if (!preset || !EDITABLE_PRESETS.includes(preset)) {
          terminal.write(
            "Usage: /model profile <auto|quality|balanced|economy>",
          );
          continue;
        }
        const profile = presetProfile(preset);
        const warning = await saveProfile(profile);
        terminal.write(
          `${orchestrationProfileText(profile)}${warning ? `\n${warning}` : ""}`,
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
          terminal.write(
            "Usage: /model role <coordinator|implementer|helper|reviewer> <model-id> [effort]",
          );
          continue;
        }
        let normalizedModelId: string;
        try {
          normalizedModelId =
            normalizeCliWorkingConfig({ modelId }).modelId ?? modelId;
        } catch (error) {
          terminal.write(
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
        terminal.write(
          `${orchestrationProfileText(profile)}${warning ? `\n${warning}` : ""}`,
        );
        continue;
      }
      if (subcommand === "effort") {
        const role = roleName(tokens[1] ?? "");
        const effort = tokens[2] as ThinkingEffort | undefined;
        if (!role || !effort || !VALID_EFFORTS.has(effort)) {
          terminal.write(
            "Usage: /model effort <coordinator|implementer|helper|reviewer> <minimal|none|low|medium|high|xhigh>",
          );
          continue;
        }
        const profile = structuredClone(currentProfile);
        profile.preset = "custom";
        profile.roles[role].thinkingEffort = effort;
        const warning = await saveProfile(profile);
        terminal.write(
          `${orchestrationProfileText(profile)}${warning ? `\n${warning}` : ""}`,
        );
        continue;
      }
      if (subcommand) {
        terminal.write(
          "Direct `/model <id>` selection was replaced. Use `/model profile <name>` or `/model role <role> <model-id> [effort]`.",
        );
        continue;
      }
      if (!terminal.isTTY || !terminal.select) {
        terminal.write(
          `${orchestrationProfileText(currentProfile)}\nUse /model profile <name>, /model role <role> <model-id> [effort], or /model effort <role> <level>.`,
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
        terminal.write("Orchestration selection cancelled.");
        continue;
      }
      if (EDITABLE_PRESETS.includes(selected as typeof EDITABLE_PRESETS[number])) {
        const profile = presetProfile(
          selected as typeof EDITABLE_PRESETS[number],
        );
        const warning = await saveProfile(profile);
        terminal.write(
          `${orchestrationProfileText(profile)}${warning ? `\n${warning}` : ""}`,
        );
        continue;
      }
      if (selected !== "advanced" || !options.listModels) {
        terminal.write("Advanced model discovery is unavailable.");
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
        terminal.write("Role selection cancelled.");
        continue;
      }
      let models: CliModelOption[];
      const activity = beginTerminalActivity(terminal, "Discovering models");
      try {
        models = await options.listModels();
        activity.settle("Model discovery complete");
      } catch (error) {
        activity.fail("Model discovery failed");
        terminal.write(
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
        terminal.write("Model selection cancelled.");
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
        terminal.write("Effort selection cancelled.");
        continue;
      }
      const profile = structuredClone(currentProfile);
      profile.preset = "custom";
      profile.roles[role] = {
        ...profile.roles[role],
        modelId: model.id,
        thinkingEffort: selectedEffort as ThinkingEffort,
      };
      const warning = await saveProfile(profile);
      terminal.write(
        `${orchestrationProfileText(profile)}${warning ? `\n${warning}` : ""}`,
      );
      continue;
    }
    if (command.kind === "effort") {
      terminal.write(
        "The global /effort command was replaced. Use /model effort <role> <level>.",
      );
      continue;
    }
    if (command.kind === "unknown") {
      terminal.write(`Unknown command: ${terminalSafeText(command.value)}. Use /help.`);
      continue;
    }

    const providerActivity = beginTerminalActivity(
      terminal,
      "Checking Codex provider",
    );
    let provider: ProviderStatus;
    try {
      provider = await options.probeProvider();
    } catch (error) {
      providerActivity.fail("Provider check failed");
      terminal.write(
        `Codex CLI check failed: ${terminalSafeText(
          error instanceof Error ? error.message : String(error),
        )}`,
      );
      continue;
    }
    providerActivity.settle(
      provider.ready ? "Provider ready" : "Provider unavailable",
    );
    state.providerReady = provider.ready;
    state.providerDetail = provider.detail;
    if (!provider.ready) {
      terminal.write(
        `Codex CLI is not ready: ${terminalSafeText(provider.detail)}\nRun codex login, then use /status.`,
      );
      continue;
    }
    if (!options.turn) {
      terminal.write("Conversational agent is unavailable in this host.");
      continue;
    }

    let turnProfile: ResolvedOrchestrationProfile;
    const profileActivity = beginTerminalActivity(
      terminal,
      "Resolving orchestration profile",
    );
    try {
      turnProfile = await resolveSessionProfile(state, options, command.value);
      profileActivity.settle("Orchestration profile ready");
    } catch (error) {
      profileActivity.fail("Orchestration blocked");
      terminal.write(
        `Orchestration blocked: ${terminalSafeText(
          error instanceof Error ? error.message : String(error),
        )}`,
      );
      continue;
    }
    const coordinator = turnProfile.roles.coordinator;
    const coordinatorActivity = beginTerminalActivity(
      terminal,
      `Coordinate ${coordinator.modelId} · ${coordinator.thinkingEffort}`,
      { fallbackRow: true },
    );
    const coordinatorStartedAt = new Date().toISOString();
    const turnSignal = options.prepareRunSignal?.();
    let turnResult: CliAgentTurnResult;
    try {
      turnResult = await options.turn({
        prompt: command.value,
        repositoryPath: state.repositoryPath,
        modelId: coordinator.modelId,
        thinkingEffort: coordinator.thinkingEffort,
        activeGoal: state.goal,
        acceptanceCriteria: state.acceptanceCriteria ?? [],
        conversationSummary: state.conversationSummary,
        recentTurns: [...recentTurns],
        signal: turnSignal,
      });
    } catch (error) {
      coordinatorActivity.fail(
        turnSignal?.aborted ? "Coordinate cancelled" : "Coordinate failed",
      );
      terminal.write(
        turnSignal?.aborted
          ? "Agent turn cancelled."
          : `Agent turn failed: ${terminalSafeText(error instanceof Error ? error.message : String(error))}`,
      );
      continue;
    } finally {
      if (turnSignal) options.releaseRunSignal?.(turnSignal);
    }
    coordinatorActivity.settle(
      `Coordinate ${coordinator.modelId} · ${coordinator.thinkingEffort}`,
    );
    const coordinatorInvocation = completedInvocation({
      taskId: `coordinate-turn-${(state.turnCount ?? 0) + 1}`,
      role: "coordinator",
      modelId: coordinator.modelId,
      thinkingEffort: coordinator.thinkingEffort,
      context: command.value,
      startedAt: coordinatorStartedAt,
    });

    const redactedSummary = redactSensitivePayload(turnResult.conversationSummary).payload;
    const redactedReply = redactSensitivePayload(turnResult.reply).payload;
    const safeReply =
      typeof redactedReply === "string" ? redactedReply : "Agent response unavailable.";
    state.conversationSummary =
      typeof redactedSummary === "string"
        ? redactedSummary.slice(0, 4_000)
        : "Conversation summary unavailable.";
    state.turnCount = (state.turnCount ?? 0) + 1;
    recentTurns.push(
      { role: "user", content: command.value },
      { role: "agent", content: safeReply },
    );
    if (recentTurns.length > 12) {
      recentTurns.splice(0, recentTurns.length - 12);
    }
    await persist();
    terminal.write(`Agent\n${terminalSafeMultilineText(safeReply)}`);

    if (turnResult.disposition === "answer" || turnResult.disposition === "clarify") {
      continue;
    }
    if (turnResult.disposition === "takeover_required") {
      terminal.write(paintPrefix(
        theme,
        "attention",
        "Takeover required · this repository-only build cannot execute host, root, network, secret, or outside-repository capabilities.",
        "Takeover required",
      ));
      continue;
    }
    if (!turnResult.action) {
      terminal.write(paintPrefix(
        theme,
        "danger",
        "Action blocked · the agent did not return a valid bounded action plan.",
        "Action blocked",
      ));
      continue;
    }

    const authorization = evaluateAgentAction(turnResult.action);
    if (authorization.decision === "takeover_required") {
      terminal.write(paintPrefix(
        theme,
        "attention",
        `Takeover required · ${terminalSafeText(authorization.reasons.join(" "))}\nThis repository-only build did not execute the action.`,
        "Takeover required",
      ));
      continue;
    }
    let authorizationSource: "automatic_policy" | "operator" = "automatic_policy";
    if (authorization.decision === "approval_required") {
      terminal.write(
        approvalText(
          state,
          turnResult.action,
          authorization,
          { color: terminal.color },
        ),
      );
      const approval = await terminal.ask("Approve this sensitive isolated action? [y/N] ");
      if (approval === INTERRUPTED_INPUT) {
        terminal.write("Action approval interrupted. No repository action was started.");
        appendConversationOutcome(
          state,
          "operator interrupted approval; no repository action was started.",
        );
        await persist();
        continue;
      }
      if (!isApproval(approval)) {
        terminal.write("Action cancelled before execution.");
        appendConversationOutcome(
          state,
          "operator denied the proposed repository action.",
        );
        await persist();
        continue;
      }
      authorizationSource = "operator";
    } else {
      terminal.write(
        `${theme.paint("muted", "✓")} Auto-authorized · ${terminalSafeText(authorization.reasons.join(" "))}`,
      );
    }

    const presenter = new RunPresenter({ color: terminal.color });
    const runSignal = options.prepareRunSignal?.();
    state.mode = "bounded_execute";
    let executionProfile: ResolvedOrchestrationProfile | undefined;
    let operationActivity: InlineActivityHandle | undefined;
    try {
      executionProfile = await resolveSessionProfile(
        state,
        options,
        command.value,
        turnResult.action,
      );
      const implementer = executionProfile.roles.implementer;
      const plannedHelperTasks =
        options.readOnlyRole &&
        !executionProfile.omittedRoles.includes("helper")
          ? turnResult.action.helperTasks.slice(
              0,
              executionProfile.maxReadOnlyHelpers,
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
        operationActivity = beginTerminalActivity(
          terminal,
          `Helpers ${helperTasks.length} read-only task${helperTasks.length === 1 ? "" : "s"} · ${helper.modelId}`,
          { fallbackRow: true },
        );
        const helperResults = await Promise.all(
          helperTasks.map(async (task) => {
            const startedAt = new Date().toISOString();
            try {
              const rawResult = await options.readOnlyRole?.({
                role: "helper",
                instruction: task.instruction,
                repositoryPath: state.repositoryPath,
                modelId: helper.modelId,
                thinkingEffort: helper.thinkingEffort,
                context: `Expected paths: ${task.expectedPaths.join(", ") || "not declared"}`,
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
                    modelId: helper.modelId,
                    thinkingEffort: helper.thinkingEffort,
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
                  modelId: helper.modelId,
                  thinkingEffort: helper.thinkingEffort,
                  context: task.instruction,
                  startedAt,
                  parentInvocationId: coordinatorInvocation.id,
                });
              invocation.status = "failed";
              priorInvocations.push(invocation);
              terminal.write(
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
      operationActivity = beginTerminalActivity(
        terminal,
        `Implement ${implementer.modelId} · ${implementer.thinkingEffort}`,
        { fallbackRow: true },
      );
      await persist();
      if (runSignal?.aborted) {
        terminal.write("\nRepository action cancelled before execution.");
        appendConversationOutcome(
          state,
          "cancelled before execution; no repository action was started.",
        );
        continue;
      }
      const result = await options.run({
        instruction: implementationInstruction,
        repositoryPath: state.repositoryPath,
        modelId: implementer.modelId,
        thinkingEffort: implementer.thinkingEffort,
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
                const startedAt = new Date().toISOString();
                operationActivity?.stop();
                operationActivity = beginTerminalActivity(
                  terminal,
                  `Review ${reviewer.modelId} · ${reviewer.thinkingEffort}`,
                  { fallbackRow: true },
                );
                try {
                  const rawReview = await options.readOnlyRole!({
                    role: "reviewer",
                    instruction: `Review repository action: ${turnResult.action!.instruction}`,
                    repositoryPath: context.sandboxWorktreePath,
                    modelId: reviewer.modelId,
                    thinkingEffort: reviewer.thinkingEffort,
                    context: `Verifier: ${context.status}. Run: ${context.runId}. Summary: ${context.summary}`,
                    signal: context.signal,
                    timeoutMs: reviewer.maxWallTimeMs,
                  });
                  const review = redactSensitivePayload(rawReview).payload;
                  terminal.write(
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
                      operationActivity = beginTerminalActivity(
                        terminal,
                        `Recovery ${implementer.modelId} · ${implementer.thinkingEffort}`,
                        { fallbackRow: true },
                      );
                    } catch (error) {
                      terminal.write(
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
                      modelId: reviewer.modelId,
                      thinkingEffort: reviewer.thinkingEffort,
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
                  terminal.write(
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
        activeGoal: state.goal,
        acceptanceCriteria: state.acceptanceCriteria ?? [],
        selectedSkillIds: state.selectedSkillIds ?? [],
        authorization: {
          ...authorization,
          source: authorizationSource,
          expectedPaths: [...turnResult.action.estimatedPaths],
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
          if (event.type === "run_started") {
            operationActivity?.update("Prepare isolated repository run");
          } else if (event.type === "codex_execution_started") {
            operationActivity?.update(
              "Run controlled implementer in isolated sandbox",
            );
          } else if (event.type === "verification_started") {
            operationActivity?.update("Verify repository evidence");
          }
          for (const line of presenter.present(event)) {
            terminal.write(line);
          }
        },
      });
      operationActivity?.settle(
        result.status === "pass"
          ? "Repository run complete"
          : "Repository run finished with verifier findings",
      );
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
      terminal.write(
        `\n${renderRunCompletion(
          {
            runId: result.runId,
            status: result.status,
            summary: state.lastRun.summary,
            verification: state.lastRun.verification,
            evidenceCount: state.lastRun.evidenceCount,
            artifactManifestPath: result.artifactManifestPath,
            interactive: true,
          },
          presenter.snapshot(),
          { color: terminal.color },
        )}`,
      );
      appendConversationOutcome(
        state,
        `${result.status}; verifier ${state.lastRun.verification}; run ${result.runId}.`,
      );
      await persist();
    } catch (error) {
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
        try {
          const review = await options.readOnlyRole({
            role: "reviewer",
            instruction: `Analyze the failed repository action: ${turnResult.action.instruction}`,
            repositoryPath: state.repositoryPath,
            modelId: reviewer.modelId,
            thinkingEffort: reviewer.thinkingEffort,
            context: `Execution failed: ${error instanceof Error ? error.message : String(error)}. Produce a bounded recovery recommendation only; do not edit.`,
            signal: runSignal,
            timeoutMs: reviewer.maxWallTimeMs,
          });
          terminal.write(
            (() => {
              const safeReview = redactSensitivePayload(review).payload;
              return `Recovery review\n${terminalSafeMultilineText(safeReview.summary)}\nRecommendation: ${terminalSafeMultilineText(safeReview.recommendation)}`;
            })(),
          );
        } catch (reviewError) {
          terminal.write(
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
      terminal.write(
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
          { color: terminal.color },
        )}`,
      );
    } finally {
      operationActivity?.stop();
      if (runSignal) options.releaseRunSignal?.(runSignal);
      state.mode = "plan";
      await persist();
    }
  }
}
