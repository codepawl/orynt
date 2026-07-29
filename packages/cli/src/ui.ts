import type {
  OrchestrationProfile,
  RunEvent,
  RunEventType,
} from "@codepawl/shared";

import {
  createTerminalTheme,
  type TerminalRole,
  type TerminalTheme,
} from "./terminal-theme.js";

export type ThinkingEffort = "minimal" | "none" | "low" | "medium" | "high" | "xhigh";

export type CliModelOption = {
  id: string;
  label: string;
  description?: string;
  supportedThinkingEfforts: ThinkingEffort[];
  defaultThinkingEffort?: ThinkingEffort;
};

export type InteractiveCommand =
  | { kind: "empty" }
  | { kind: "exit" }
  | { kind: "help" }
  | { kind: "status" }
  | { kind: "clear" }
  | { kind: "plan" }
  | { kind: "state" }
  | { kind: "evidence" }
  | { kind: "verify" }
  | { kind: "cost" }
  | { kind: "doctor" }
  | { kind: "repo"; value: string }
  | { kind: "model"; value: string }
  | { kind: "skills"; value: string }
  | { kind: "effort"; value: string }
  | { kind: "goal"; value: string }
  | { kind: "criteria"; value: string }
  | { kind: "resume"; value: string }
  | { kind: "prompt"; value: string }
  | { kind: "unknown"; value: string };

export type SlashCommandDefinition = {
  command: `/${string}`;
  aliases: readonly `/${string}`[];
  usage: string;
  description: string;
  argument: "none" | "optional" | "required";
  parse: (argument: string, original: string) => InteractiveCommand;
};

export type WelcomeState = {
  repositoryPath: string;
  modelId: string;
  thinkingEffort: ThinkingEffort;
  orchestrationProfile?: OrchestrationProfile;
  providerReady: boolean;
};

type RenderOptions = {
  color: boolean;
  width?: number;
};

type PresentableRunEvent = Pick<RunEvent, "type" | "payload">;

const BIDI_CONTROL_PATTERN = /\p{Bidi_Control}/gu;
const SINGLE_BIDI_CONTROL_PATTERN = /^\p{Bidi_Control}$/u;

export function terminalSafeText(value: string): string {
  const escaped = JSON.stringify(value).slice(1, -1);
  return escaped
    .replace(/[\u007f-\u009f]/gu, (character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return `\\u${codePoint.toString(16).padStart(4, "0")}`;
    })
    .replace(BIDI_CONTROL_PATTERN, (character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return `\\u${codePoint.toString(16).padStart(4, "0")}`;
    });
}

function terminalSafePrintableText(value: string): string {
  return Array.from(value, (character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    if (
      codePoint < 0x20 ||
      (codePoint >= 0x7f && codePoint <= 0x9f) ||
      SINGLE_BIDI_CONTROL_PATTERN.test(character)
    ) {
      return `\\u${codePoint.toString(16).padStart(4, "0")}`;
    }
    return character;
  }).join("");
}

export function terminalSafeMultilineText(value: string): string {
  return value
    .replace(/\r\n?/gu, "\n")
    .split("\n")
    .map((line) => terminalSafePrintableText(line))
    .join("\n");
}

export function renderTreeRows(
  rows: readonly string[],
  indent = "  ",
): string[] {
  return rows.map(
    (row, index) =>
      `${indent}${index === rows.length - 1 ? "└─" : "├─"} ${row}`,
  );
}

function commandWithValue(
  kind: "repo" | "model" | "effort" | "goal" | "criteria",
  value: string,
  original: string,
): InteractiveCommand {
  return value ? { kind, value } : { kind: "unknown", value: original };
}

function simpleCommand(
  command: SlashCommandDefinition["command"],
  description: string,
  kind: "clear" | "cost" | "doctor" | "evidence" | "help" | "plan" | "state" | "status" | "verify",
  aliases: SlashCommandDefinition["aliases"] = [],
): SlashCommandDefinition {
  return {
    command,
    aliases,
    usage: command,
    description,
    argument: "none",
    parse: () => ({ kind }),
  };
}

function valueCommand(
  command: SlashCommandDefinition["command"],
  usage: string,
  description: string,
  kind: "criteria" | "effort" | "goal" | "model" | "repo",
): SlashCommandDefinition {
  return {
    command,
    aliases: [],
    usage,
    description,
    argument: "required",
    parse: (argument, original) => commandWithValue(kind, argument, original),
  };
}

export const SLASH_COMMANDS: readonly SlashCommandDefinition[] = [
  simpleCommand("/help", "Show command help", "help"),
  simpleCommand("/status", "Check provider and run configuration", "status"),
  valueCommand("/repo", "/repo <path>", "Change the repository workspace", "repo"),
  {
    command: "/model",
    aliases: [],
    usage: "/model [show|profile|role|effort]",
    description: "Configure the orchestration profile and role models",
    argument: "optional",
    parse: (argument) => ({ kind: "model", value: argument }),
  },
  valueCommand(
    "/effort",
    "/effort <level>",
    "Legacy command; use /model effort <role> <level>",
    "effort",
  ),
  {
    command: "/goal",
    aliases: [],
    usage: "/goal [text|--clear]",
    description: "Show, set, or clear the active objective",
    argument: "optional",
    parse: (argument) => ({ kind: "goal", value: argument }),
  },
  {
    command: "/skills",
    aliases: [],
    usage: "/skills [list|use <id>|remove <id>|clear]",
    description: "List or attach explicit Agent Skills to this session",
    argument: "optional",
    parse: (argument) => ({ kind: "skills", value: argument || "list" }),
  },
  valueCommand("/criteria", "/criteria <a; b>", "Set acceptance criteria", "criteria"),
  simpleCommand("/plan", "Show the bounded operator plan", "plan"),
  simpleCommand("/state", "Show compact typed working state", "state"),
  simpleCommand("/evidence", "Show artifacts from the last run", "evidence"),
  simpleCommand("/verify", "Show the last verifier verdict", "verify"),
  simpleCommand("/cost", "Show the last run cost", "cost"),
  simpleCommand("/doctor", "Diagnose terminal, provider, and repository", "doctor"),
  {
    command: "/resume",
    aliases: [],
    usage: "/resume [id]",
    description: "Restore latest or a named session",
    argument: "optional",
    parse: (argument) => ({ kind: "resume", value: argument || "latest" }),
  },
  simpleCommand("/clear", "Clear and redraw Orynt", "clear"),
  {
    command: "/exit",
    aliases: ["/quit"],
    usage: "/exit",
    description: "End this session",
    argument: "none",
    parse: () => ({ kind: "exit" }),
  },
] as const;

export function filterSlashCommands(input: string): SlashCommandDefinition[] {
  const value = input.trimStart().toLowerCase();
  if (!value.startsWith("/") || /\s/.test(value)) {
    return [];
  }
  return SLASH_COMMANDS.filter(
    (definition) =>
      definition.command.startsWith(value) ||
      definition.aliases.some((alias) => alias.startsWith(value)),
  );
}

export function renderCommandHelp(): string {
  const width = Math.max(...SLASH_COMMANDS.map((definition) => definition.usage.length));
  return [
    "Commands",
    ...SLASH_COMMANDS.map(
      (definition) => `  ${definition.usage.padEnd(width)}  ${definition.description}`,
    ),
    "",
    "Any other text becomes a conversational prompt for the repository agent.",
  ].join("\n");
}

export function parseInteractiveInput(input: string): InteractiveCommand {
  const value = input.trim();
  if (!value) {
    return { kind: "empty" };
  }
  if (!value.startsWith("/")) {
    return { kind: "prompt", value };
  }

  const [rawCommand, ...rest] = value.split(/\s+/);
  const command = rawCommand.toLowerCase();
  const argument = rest.join(" ").trim();
  const definition = SLASH_COMMANDS.find(
    (candidate) => candidate.command === command || candidate.aliases.includes(command as `/${string}`),
  );
  return definition?.parse(argument, value) ?? { kind: "unknown", value };
}

export function renderWelcome(state: WelcomeState, options: RenderOptions): string {
  const theme = createTerminalTheme(options.color);
  const width = Math.max(56, Math.min(options.width ?? 84, 104));
  const divider = "─".repeat(width);
  const provider = state.providerReady ? "ready" : "not ready";
  const profile = state.orchestrationProfile;
  const modelLine = profile
    ? `${profile.preset} · ${profile.roles.coordinator.modelId}/${profile.roles.implementer.modelId}`
    : `${state.modelId} · ${state.thinkingEffort}`;
  return [
    theme.strong("ORYNT"),
    theme.paint("muted", "perceive → remember → plan → act → verify → improve"),
    theme.paint("muted", divider),
    `Workspace  ${terminalSafeText(state.repositoryPath)}`,
    `Models     ${terminalSafeText(modelLine)}  Codex CLI: ${provider}`,
    `${theme.paint("attention", "Safety")}     Read-only chat · policy-gated repository actions`,
    "",
    "Message the agent, or type /help for commands.",
  ].join("\n");
}

function eventPayload(event: PresentableRunEvent): Record<string, unknown> {
  return typeof event.payload === "object" && event.payload !== null ? (event.payload as Record<string, unknown>) : {};
}

function payloadText(payload: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function row(icon: string, label: string, detail: string): string {
  return `  ${icon} ${label.padEnd(9)} ${detail}`;
}

const FAILED_EVENTS = new Set<RunEventType>([
  "sandbox_create_failed",
  "codex_contract_write_failed",
  "codex_execution_failed",
  "codex_execution_blocked",
  "codex_result_import_failed",
  "verification_failed",
  "memory_extraction_failed",
  "budget_exceeded",
  "policy_violation",
]);

const MILESTONES = [
  {
    eventTypes: new Set<RunEventType>(["run_started"]),
    label: "Prepare",
    detail: "Creating isolated worktree and contract",
  },
  {
    eventTypes: new Set<RunEventType>(["codex_execution_started"]),
    label: "Run",
    detail: "Codex working inside repository sandbox",
  },
  {
    eventTypes: new Set<RunEventType>(["verification_started"]),
    label: "Verify",
    detail: "Running policy and verifier checks",
  },
] as const;

const ORYNT_MANAGED_CHANGE_PATHS = new Set([
  ".codex/",
  ".codex/orynt-beta-verify.mjs",
]);

export type RunPresentationSnapshot = {
  finalAgentResponse?: string;
  changedFiles?: string[];
  verifierSummary?: string;
  manualReviewSummary?: string;
  failureSummary?: string;
};

export type HumanRunCompletion = {
  runId?: string;
  status: string;
  summary?: string;
  verification?: string;
  evidenceCount?: number;
  artifactManifestPath?: string;
  errorMessage?: string;
  interactive: boolean;
};

function payloadStrings(payload: Record<string, unknown>, key: string): string[] | undefined {
  const value = payload[key];
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : undefined;
}

function normalizedHumanChangePath(value: string): string | undefined {
  const normalized = value.replace(/^\.\//u, "");
  return ORYNT_MANAGED_CHANGE_PATHS.has(normalized) ? undefined : normalized;
}

export class RunPresenter {
  private lastMilestone = -1;
  private finalAgentResponse?: string;
  private fallbackAgentResponse?: string;
  private changedFiles?: string[];
  private verifierSummary?: string;
  private manualReviewSummary?: string;
  private fatalFailureSummary?: string;
  private verifierFailureSummary?: string;
  private readonly theme: TerminalTheme;

  constructor(options: { color: boolean }) {
    this.theme = createTerminalTheme(options.color);
  }

  present(event: PresentableRunEvent): string[] {
    const payload = eventPayload(event);
    const summary = payloadText(payload, ["summary", "reason", "message", "text"]);

    if (event.type === "codex_agent_message") {
      this.fallbackAgentResponse = payloadText(payload, ["message", "summary"]);
    }
    if (event.type === "codex_execution_finished") {
      this.finalAgentResponse =
        payloadText(payload, ["lastMessagePreview"]) ?? this.fallbackAgentResponse;
    }
    if (event.type === "codex_sandbox_diff_inspected") {
      const changedFiles = payloadStrings(payload, "changedFiles") ?? [];
      this.changedFiles = [
        ...new Set(
          changedFiles
            .map((filePath) => normalizedHumanChangePath(filePath))
            .filter((filePath): filePath is string => Boolean(filePath)),
        ),
      ];
    }
    if (
      event.type === "verification_recorded" ||
      event.type === "verification_passed" ||
      event.type === "verification_failed"
    ) {
      this.verifierSummary = summary;
      if (event.type === "verification_passed") {
        this.verifierFailureSummary = undefined;
      }
    }
    if (event.type === "manual_review_required") {
      this.manualReviewSummary = summary ?? "Manual review required";
    }
    if (FAILED_EVENTS.has(event.type)) {
      if (event.type === "verification_failed") {
        this.verifierFailureSummary =
          summary ?? event.type.replaceAll("_", " ");
      } else {
        this.fatalFailureSummary =
          summary ?? event.type.replaceAll("_", " ");
      }
    }

    const milestone = MILESTONES.findIndex(({ eventTypes }) => eventTypes.has(event.type));
    if (milestone < 0 || milestone <= this.lastMilestone) {
      return [];
    }
    const output: string[] = [];
    for (let index = this.lastMilestone + 1; index <= milestone; index += 1) {
      const current = MILESTONES[index];
      if (current) {
        output.push(this.theme.paint("muted", row("◇", current.label, current.detail)));
      }
    }
    this.lastMilestone = milestone;
    return output;
  }

  snapshot(): RunPresentationSnapshot {
    return {
      ...(this.finalAgentResponse ?? this.fallbackAgentResponse
        ? { finalAgentResponse: this.finalAgentResponse ?? this.fallbackAgentResponse }
        : {}),
      ...(this.changedFiles ? { changedFiles: [...this.changedFiles] } : {}),
      ...(this.verifierSummary ? { verifierSummary: this.verifierSummary } : {}),
      ...(this.manualReviewSummary ? { manualReviewSummary: this.manualReviewSummary } : {}),
      ...(this.fatalFailureSummary ?? this.verifierFailureSummary
        ? {
            failureSummary:
              this.fatalFailureSummary ?? this.verifierFailureSummary,
          }
        : {}),
    };
  }
}

function indentedMultiline(value: string): string[] {
  return terminalSafeMultilineText(value)
    .trim()
    .split("\n")
    .map((line) => `  ${line}`);
}

function statusLabel(value: string): string {
  if (value === "pass" || value === "passed") return "Passed";
  if (value === "fail" || value === "failed") return "Failed";
  return value ? `${value[0]?.toUpperCase()}${value.slice(1)}` : "Unknown";
}

export function renderRunCompletion(
  completion: HumanRunCompletion,
  presentation: RunPresentationSnapshot,
  options: { color: boolean },
): string {
  const verification = completion.verification ?? completion.status;
  const cancelled = completion.status === "cancelled";
  const reviewRequired =
    Boolean(presentation.manualReviewSummary) ||
    completion.status === "partial" ||
    completion.status === "manual_review_required";
  const failureRequired =
    (!cancelled && Boolean(completion.errorMessage)) ||
    Boolean(presentation.failureSummary) ||
    completion.status === "fail" ||
    completion.status === "failed" ||
    verification === "fail" ||
    verification === "failed";
  const passed =
    !reviewRequired &&
    !failureRequired &&
    completion.status === "pass" &&
    (verification === "pass" || verification === "passed");
  const icon = passed ? "✓" : cancelled ? "◇" : failureRequired ? "✕" : "!";
  const role: TerminalRole = passed
    ? "success"
    : failureRequired
      ? "danger"
      : "attention";
  const detail = cancelled
    ? "Repository action cancelled"
    : passed
    ? "Verified successfully"
    : terminalSafeText(
        completion.errorMessage ??
          presentation.failureSummary ??
          presentation.manualReviewSummary ??
          completion.summary ??
          `Run ${completion.status}`,
      );
  const theme = createTerminalTheme(options.color);
  const output = [
    row(theme.paint(role, icon), cancelled ? "Stopped" : "Done", detail),
  ];

  if (presentation.finalAgentResponse) {
    output.push(
      "",
      passed ? "Agent report" : "Agent report · unverified",
      ...indentedMultiline(presentation.finalAgentResponse),
    );
  }

  if (presentation.changedFiles) {
    output.push("");
    if (presentation.changedFiles.length === 0) {
      output.push("Changes · no repository files changed");
    } else {
      output.push(
        `Changes · ${presentation.changedFiles.length} file${presentation.changedFiles.length === 1 ? "" : "s"}`,
        ...presentation.changedFiles.map((filePath) => `  ${terminalSafeText(filePath)}`),
      );
    }
  } else {
    output.push("", "Changes · not recorded");
  }

  const verifierSummary =
    presentation.verifierSummary ?? completion.summary ?? "No verifier summary recorded.";
  output.push(
    "",
    "Verification",
    `  ${statusLabel(verification)} · ${terminalSafeText(verifierSummary)}`,
  );

  if (completion.artifactManifestPath || completion.runId) {
    output.push("", "Evidence");
    if (completion.artifactManifestPath) {
      const evidence = completion.evidenceCount === undefined
        ? "Manifest"
        : `${completion.evidenceCount} artifact${completion.evidenceCount === 1 ? "" : "s"}`;
      output.push(`  ${evidence} · ${terminalSafeText(completion.artifactManifestPath)}`);
    }
    if (completion.runId) {
      output.push(`  Run ${terminalSafeText(completion.runId)}`);
    }
  }

  if (!passed) {
    output.push(
      "",
      "Next",
      completion.interactive
        ? "  Use /verify and /evidence to inspect the failure."
        : "  Inspect the artifact manifest and verifier evidence.",
    );
  }

  return output.join("\n");
}
