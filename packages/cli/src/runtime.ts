import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { access } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { runDesktopRepositoryBeta } from "@codepawl/coding-apprentice";
import {
  createDefaultRunBudget,
  createLegacySingleModelProfile,
  createOrchestrationPreset,
  type OrchestrationPreset,
  type OrchestrationProfile,
  type OrchestrationRole,
} from "@codepawl/shared";

import type { CliRunRequest, CliRunResult, ProviderStatus } from "./session.js";
import { LocalSkillCliManager } from "./skillRuntime.js";
import { normalizeCliWorkingConfig, readRunSnapshot } from "./state.js";
import type { CliModelOption, ThinkingEffort } from "./ui.js";

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
  explicitConfig: {
    repository: boolean;
    model: boolean;
    thinkingEffort: boolean;
    orchestration: boolean;
  };
  profile?: OrchestrationPreset;
  roleModels: Partial<Record<OrchestrationRole, string>>;
  roleEfforts: Partial<Record<OrchestrationRole, ThinkingEffort>>;
  initialPrompt?: string;
  help?: boolean;
  version?: boolean;
  command?: "run" | "doctor";
  jsonl?: boolean;
  approveOnce?: boolean;
  resumeSessionId?: string;
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
  const roleModels: Partial<Record<OrchestrationRole, string>> = {};
  const roleEfforts: Partial<Record<OrchestrationRole, ThinkingEffort>> = {};
  let color = true;
  let help = false;
  let version = false;
  let command: CliArguments["command"];
  let jsonl = false;
  let approveOnce = false;
  let resumeSessionId: string | undefined;
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
    if (promptTokens.length === 0 && command === undefined && (argument === "run" || argument === "doctor")) {
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
    if (argument === "--jsonl") {
      jsonl = true;
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
  if (command === "doctor" && promptTokens.length > 0) {
    throw new Error("orynt doctor does not accept a goal");
  }

  return {
    repositoryPath,
    modelId,
    thinkingEffort,
    color,
    explicitConfig,
    roleModels,
    roleEfforts,
    ...(profile ? { profile } : {}),
    ...(promptTokens.length > 0 ? { initialPrompt: promptTokens.join(" ") } : {}),
    ...(help ? { help } : {}),
    ...(version ? { version } : {}),
    ...(command ? { command } : {}),
    ...(jsonl ? { jsonl } : {}),
    ...(approveOnce ? { approveOnce } : {}),
    ...(resumeSessionId ? { resumeSessionId } : {}),
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

export async function probeCodexCli(): Promise<ProviderStatus> {
  try {
    const { stdout, stderr } = await execFileAsync("codex", ["login", "status"], {
      timeout: 15_000,
      maxBuffer: 512_000,
    });
    const detail = `${stdout ?? ""} ${stderr ?? ""}`.trim().replace(/\s+/g, " ");
    return { ready: true, detail: detail || "authenticated session detected" };
  } catch (error) {
    return { ready: false, detail: commandFailureDetail(error) };
  }
}

export function oryntStateRoot(): string {
  const base = process.env.XDG_STATE_HOME?.trim() || path.join(os.homedir(), ".local", "state");
  return path.join(base, "orynt");
}

export async function runCliRepositoryTask(request: CliRunRequest): Promise<CliRunResult> {
  const root = oryntStateRoot();
  const taskSuffix = randomUUID().replaceAll("-", "").slice(0, 12);
  const defaultBudget = createDefaultRunBudget();
  const implementerBudget = request.orchestration?.profile.roles.implementer;
  const skillContextResult = request.selectedSkillIds?.length
    ? (await new LocalSkillCliManager(root).snapshotContext({
        repositoryPath: request.repositoryPath,
        runId: `cli-${taskSuffix}`,
        skillIds: request.selectedSkillIds,
      })) as {
        context?: Parameters<typeof runDesktopRepositoryBeta>[0]["skillContext"];
      }
    : undefined;
  if (request.selectedSkillIds?.length && !skillContextResult?.context) {
    throw new Error("Skill context snapshot was incomplete");
  }
  const result = await runDesktopRepositoryBeta({
    goal: request.instruction,
    activeGoal: request.activeGoal,
    acceptanceCriteria: request.acceptanceCriteria,
    authorization: {
      source: request.authorization.source,
      reason: request.authorization.reasons.join(" "),
      expectedPaths: request.authorization.expectedPaths,
      allowDestructiveChanges: request.authorization.allowDestructiveChanges,
      allowChangedFileLimitExceeded:
        request.authorization.allowChangedFileLimitExceeded,
    },
    taskId: `cli-${taskSuffix}`,
    workspaceId: `repository-${path.basename(request.repositoryPath) || "root"}`,
    repositoryPath: request.repositoryPath,
    sandboxRoot: path.join(root, "sandboxes"),
    artifactRoot: path.join(root, "artifacts"),
    memoryRoot: path.join(root, "memory"),
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
  });
  return { ...result, cliSnapshot: await readRunSnapshot(result.artifactManifestPath) };
}

export type DoctorReportInput = {
  isTTY: boolean;
  color: boolean;
  term?: string;
  repositoryPath: string;
  repositoryReady: boolean;
  gitReady: boolean;
  provider: ProviderStatus;
};

export function formatDoctorReport(input: DoctorReportInput): string[] {
  const recovery = !input.repositoryReady
    ? "choose an existing repository with --repo"
    : !input.gitReady
      ? "initialize Git or choose a Git repository"
      : !input.provider.ready
        ? "run codex login, then orynt doctor"
        : "none required";
  return [
    "Orynt doctor",
    `  TTY: ${input.isTTY ? "interactive" : "non-interactive"} · ${input.color ? "ANSI color" : "plain output"}`,
    `  TERM: ${input.term || "not set"}`,
    `  Repository: ${input.repositoryReady ? "ready" : "not ready"} · ${input.repositoryPath}`,
    `  Git: ${input.gitReady ? "ready" : "not ready"}`,
    `  Codex CLI: ${input.provider.ready ? "ready" : "not ready"} · ${input.provider.detail}`,
    `  Recovery: ${recovery}`,
  ];
}

export async function diagnoseCli(input: {
  repositoryPath: string;
  isTTY: boolean;
  color: boolean;
  term?: string;
}): Promise<string[]> {
  const repositoryReady = await access(input.repositoryPath).then(() => true, () => false);
  const gitReady = repositoryReady
    ? await execFileAsync("git", ["-C", input.repositoryPath, "rev-parse", "--show-toplevel"], { timeout: 10_000 }).then(() => true, () => false)
    : false;
  const provider = await probeCodexCli();
  return formatDoctorReport({ ...input, repositoryReady, gitReady, provider });
}

export function cliHelp(): string {
  return [
    "Orynt 0.1.0 — supervised repository agent",
    "",
    "Usage: orynt [options] [prompt]",
    "       orynt run --approve-once [--jsonl] [options] <goal>",
    "       orynt doctor [options]",
    "",
    "Options:",
    "  -C, --repo <path>      Repository workspace (default: current directory)",
    "      --profile <name>   auto | quality | balanced | economy | custom",
    "      --role-model <r=m> Override a role model (repeatable)",
    "      --role-effort <r=e> Override a role effort (repeatable)",
    "      --plain            Disable ANSI color and inline animation",
    "      --no-color         Disable ANSI color; keep inline animation",
    "      --resume <id>      Resume latest or a named typed session",
    "      --approve-once     Authorize exactly one bounded headless run",
    "      --jsonl            Emit headless run events as JSON Lines",
    "  -h, --help             Show help",
    "  -v, --version          Show version",
    "",
    "Interactive text starts an agent conversation. Headless execution requires the explicit one-run --approve-once grant.",
  ].join("\n");
}
