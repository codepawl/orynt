import path from "node:path";

import type {
  ModelTierConfigurationV1,
  OrchestrationProfile,
  RepositoryDiffArtifactV1,
  RunEvent,
  RunEventType,
} from "@codepawl/shared";
import {
  REPOSITORY_DIFF_PREVIEW_MAX_BYTES,
  REPOSITORY_DIFF_PREVIEW_MAX_LINES,
} from "@codepawl/shared";

import {
  TERMINAL_THEMES,
  type TerminalRole,
  type TerminalTheme,
  type TerminalThemeId,
} from "./terminal-theme.js";
import {
  createTerminalDesignSystem,
  renderTerminalDetailRows,
  terminalTextWidth,
  wrapTerminalParagraph,
} from "./terminal-presentation.js";
import {
  shortcutListLabel,
  shortcutPreferences,
  type CliShortcutPreferences,
} from "./shortcuts.js";

export type ThinkingEffort = "minimal" | "none" | "low" | "medium" | "high" | "xhigh";
export type ActivityDetailLevel = "off" | "important" | "full";
export type HelpTopic = "commands" | "shortcuts" | "getting-started";

export type CliModelOption = {
  id: string;
  /**
   * Owning provider. Absent means `codex-cli`, matching the tier-binding
   * default, so a mixed-provider catalog resolves against the right bindings.
   */
  providerId?: "codex-cli" | "openai-api" | "anthropic-api" | "opencode-api";
  label: string;
  description?: string;
  supportedThinkingEfforts: ThinkingEffort[];
  defaultThinkingEffort?: ThinkingEffort;
  contextWindowTokens?: number;
  effectiveContextWindowTokens?: number;
  providerAutoCompactAtTokens?: number;
};

export type InteractiveCommand =
  | { kind: "empty" }
  | { kind: "exit" }
  | { kind: "help"; topic: string }
  | { kind: "status" }
  | { kind: "context"; value: string }
  | { kind: "copy"; value: string }
  | { kind: "clear" }
  | { kind: "plan" }
  | { kind: "state" }
  | { kind: "evidence" }
  | { kind: "diff"; value: string }
  | { kind: "verify" }
  | { kind: "cost" }
  | { kind: "usage"; verbose: boolean }
  | { kind: "doctor"; verbose: boolean }
  | { kind: "setup" }
  | { kind: "repo"; value: string }
  | { kind: "model"; value: string }
  | { kind: "tier"; value: string }
  | { kind: "settings"; value: string }
  | { kind: "skills"; value: string }
  | { kind: "effort"; value: string }
  | { kind: "goal"; value: string }
  | { kind: "criteria"; value: string }
  | { kind: "resume"; value: string }
  | { kind: "sessions"; value: string }
  | { kind: "next"; value: string }
  | { kind: "stop" }
  | { kind: "pending"; value: string }
  | { kind: "paste"; value: string }
  | { kind: "prompt"; value: string }
  | { kind: "unknown"; value: string };

export type SlashCommandDefinition = {
  command: `/${string}`;
  aliases: readonly `/${string}`[];
  usage: string;
  description: string;
  argument: "none" | "optional" | "required";
  argumentAssist?: SlashArgumentAssist;
  group: "Customize" | "Workspace" | "Inspect" | "Session" | "Legacy";
  hidden?: boolean;
  parse: (argument: string, original: string) => InteractiveCommand;
};

export type SlashArgumentAssist = {
  choices: readonly SlashArgumentChoice[];
  wildcard?: SlashArgumentWildcard;
};

export type SlashArgumentChoice = {
  value: string;
  description: string;
  canSubmit?: boolean;
  next?: SlashArgumentAssist;
};

export type SlashArgumentWildcard = {
  consume: "token" | "rest";
  canSubmit: boolean;
  next?: SlashArgumentAssist;
};

export type SlashInputSuggestion = {
  kind: "command" | "argument";
  label: string;
  description: string;
  completion: string;
  replaceStart: number;
  replaceEnd: number;
  appendSpace: boolean;
  continueAssist: boolean;
};

export type SlashInputAssist = {
  suggestions: SlashInputSuggestion[];
  canSubmit: boolean;
};

export type WelcomeState = {
  repositoryPath: string;
  modelId: string;
  thinkingEffort: ThinkingEffort;
  orchestrationProfile?: OrchestrationProfile;
  modelTierConfiguration?: ModelTierConfigurationV1;
  providerReady: boolean;
};

type RenderOptions = {
  color: boolean;
  themeId?: TerminalThemeId;
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
  kind: "clear" | "cost" | "evidence" | "plan" | "setup" | "state" | "status" | "verify",
  group: SlashCommandDefinition["group"],
  aliases: SlashCommandDefinition["aliases"] = [],
): SlashCommandDefinition {
  return {
    command,
    aliases,
    usage: command,
    description,
    argument: "none",
    group,
    parse: () => ({ kind }),
  };
}

function valueCommand(
  command: SlashCommandDefinition["command"],
  usage: string,
  description: string,
  kind: "criteria" | "effort" | "goal" | "model" | "repo",
  group: SlashCommandDefinition["group"],
  hidden = false,
): SlashCommandDefinition {
  return {
    command,
    aliases: [],
    usage,
    description,
    argument: "required",
    group,
    ...(hidden ? { hidden: true } : {}),
    parse: (argument, original) => commandWithValue(kind, argument, original),
  };
}

function argumentChoices(
  choices: readonly SlashArgumentChoice[],
  wildcard?: SlashArgumentWildcard,
): SlashArgumentAssist {
  return {
    choices,
    ...(wildcard ? { wildcard } : {}),
  };
}

function terminalChoice(
  value: string,
  description: string,
): SlashArgumentChoice {
  return { value, description, canSubmit: true };
}

const TIER_ARGUMENT_ASSIST = argumentChoices([
  terminalChoice("auto", "Let task and safety routing choose the minimum"),
  terminalChoice("light", "Use at least the bounded read-only tier"),
  terminalChoice("medium", "Use at least the planning and mutable-work tier"),
  terminalChoice("heavy", "Use at least the strongest review tier"),
]);

const EFFORT_ARGUMENT_ASSIST = argumentChoices(
  ["minimal", "none", "low", "medium", "high", "xhigh"].map((value) =>
    terminalChoice(value, `Use ${value} thinking effort`)
  ),
);

const ROLE_ARGUMENT_ASSIST = argumentChoices(
  ["coordinator", "implementer", "helper", "reviewer"].map((value) => ({
    value,
    description: `Configure the ${value} role`,
    next: argumentChoices([], {
      consume: "token",
      canSubmit: true,
      next: EFFORT_ARGUMENT_ASSIST,
    }),
  })),
);

const ROLE_EFFORT_ARGUMENT_ASSIST = argumentChoices(
  ["coordinator", "implementer", "helper", "reviewer"].map((value) => ({
    value,
    description: `Set effort for the ${value} role`,
    next: EFFORT_ARGUMENT_ASSIST,
  })),
);

const SETTINGS_AGENT_ARGUMENT_ASSIST = argumentChoices([
  {
    value: "profile",
    description: "Apply an orchestration preset",
    next: argumentChoices(
      ["auto", "quality", "balanced", "economy"].map((value) =>
        terminalChoice(value, `Use the ${value} orchestration preset`)
      ),
    ),
  },
  {
    value: "role",
    description: "Set a role model and optional effort",
    next: ROLE_ARGUMENT_ASSIST,
  },
  {
    value: "effort",
    description: "Set thinking effort for one role",
    next: ROLE_EFFORT_ARGUMENT_ASSIST,
  },
  {
    value: "review",
    description: "Choose when independent review runs",
    next: argumentChoices([
      terminalChoice("always", "Review every mutable run"),
      terminalChoice("conditional", "Review when task risk requires it"),
      terminalChoice("failure-only", "Review only after a failure"),
    ]),
  },
  {
    value: "helpers",
    description: "Set the maximum read-only helper count",
    next: argumentChoices(
      ["0", "1", "2"].map((value) =>
        terminalChoice(value, `${value} read-only helpers`)
      ),
    ),
  },
  {
    value: "depth",
    description: "Set the orchestration depth limit",
    next: argumentChoices(
      ["1", "2"].map((value) =>
        terminalChoice(value, `Maximum depth ${value}`)
      ),
    ),
  },
  {
    value: "recovery",
    description: "Set the automatic recovery attempt limit",
    next: argumentChoices(
      ["0", "1"].map((value) =>
        terminalChoice(value, `${value} recovery attempts`)
      ),
    ),
  },
]);

const SETTINGS_APPEARANCE_ARGUMENT_ASSIST = argumentChoices([
  {
    value: "screen",
    description: "Choose fullscreen viewport or terminal-native scrollback",
    next: argumentChoices(
      ["auto", "fullscreen", "inline"].map((value) =>
        terminalChoice(value, `Use ${value} screen mode`)
      ),
    ),
  },
  {
    value: "theme",
    description: "Choose the terminal color theme",
    next: argumentChoices(
      TERMINAL_THEMES.map(({ id, label }) =>
        terminalChoice(id, `Use the ${label} theme`)
      ),
    ),
  },
  ...["color", "motion", "rich-text"].map((value) => ({
    value,
    description: `Configure ${value}`,
    next: argumentChoices([
      terminalChoice("on", `Enable ${value}`),
      terminalChoice("off", `Disable ${value}`),
    ]),
  })),
]);

const SETTINGS_INTELLIGENCE_ARGUMENT_ASSIST = argumentChoices([
  terminalChoice("show", "Show intelligence settings"),
  terminalChoice("reset", "Restore default intelligence settings"),
  {
    value: "improve",
    description: "Configure automatic improvement review",
    next: argumentChoices([
      terminalChoice("off", "Disable automatic improvement"),
      terminalChoice("shadow-review", "Review improvements without promotion"),
    ]),
  },
  {
    value: "routing",
    description: "Configure capability routing",
    next: argumentChoices([
      terminalChoice("off", "Disable automatic capability routing"),
      terminalChoice("auto-read-only", "Allow automatic read-only routing"),
    ]),
  },
  {
    value: "subagents",
    description: "Configure bounded subagent execution",
    next: argumentChoices([
      {
        value: "mode",
        description: "Choose the subagent operating mode",
        next: argumentChoices([
          terminalChoice("off", "Disable subagents"),
          terminalChoice("read-only", "Allow read-only subagents"),
          terminalChoice("adaptive", "Route bounded subagents adaptively"),
        ]),
      },
      {
        value: "concurrency",
        description: "Set maximum concurrent subagents",
        next: argumentChoices(
          ["1", "2", "3", "4"].map((value) =>
            terminalChoice(value, `At most ${value} concurrent subagents`)
          ),
        ),
      },
    ]),
  },
  {
    value: "capabilities",
    description: "Configure capability namespace and tool limits",
    next: argumentChoices([
      {
        value: "namespaces",
        description: "Set the namespace limit",
        next: argumentChoices(
          ["1", "2", "3"].map((value) =>
            terminalChoice(value, `At most ${value} capability namespaces`)
          ),
        ),
      },
      {
        value: "tools",
        description: "Set the per-namespace tool limit",
        next: argumentChoices(
          Array.from({ length: 10 }, (_, index) => String(index + 1)).map(
            (value) =>
              terminalChoice(value, `At most ${value} tools per namespace`),
          ),
        ),
      },
    ]),
  },
  {
    value: "memory",
    description: "Configure memory retrieval limits",
    next: argumentChoices([
      {
        value: "top-k",
        description: "Set the maximum retrieved result count",
        next: argumentChoices(
          ["1", "2", "3", "4", "5"].map((value) =>
            terminalChoice(value, `Retrieve at most ${value} memory results`)
          ),
        ),
      },
      {
        value: "token-budget",
        description: "Set an exact token budget from 256 to 4000",
        next: argumentChoices([], {
          consume: "token",
          canSubmit: true,
        }),
      },
    ]),
  },
]);

const SETTINGS_SHORTCUTS_ARGUMENT_ASSIST = argumentChoices([
  terminalChoice("show", "Show composer shortcut bindings"),
  terminalChoice("reset", "Restore default composer shortcuts"),
  {
    value: "set",
    description: "Set one composer shortcut action",
    next: argumentChoices(
      ["clear", "undo", "redo"].map((value) => ({
        value,
        description: `Set the ${value} shortcut`,
        next: argumentChoices([], {
          consume: "rest",
          canSubmit: true,
        }),
      })),
    ),
  },
]);

const SETTINGS_STATUSLINE_ARGUMENT_ASSIST = argumentChoices([
  terminalChoice("show", "Show statusline fields"),
  terminalChoice("reset", "Restore concise statusline defaults"),
  {
    value: "set",
    description: "Toggle one statusline field",
    next: argumentChoices(
      ["enabled", "profile", "role", "model", "effort", "context", "quota", "shortcuts"].map(
        (value) => ({
          value,
          description: `Configure statusline ${value}`,
          next: argumentChoices([
            terminalChoice("on", `Show or enable ${value}`),
            terminalChoice("off", `Hide or disable ${value}`),
          ]),
        }),
      ),
    ),
  },
  {
    value: "context-format",
    description: "Choose one context usage representation",
    next: argumentChoices([
      terminalChoice("tokens", "Show used and maximum context tokens"),
      terminalChoice("percent", "Show context usage as a percentage"),
    ]),
  },
]);

const SETTINGS_CLIPBOARD_ARGUMENT_ASSIST = argumentChoices([
  terminalChoice("show", "Show clipboard behavior"),
  terminalChoice("reset", "Restore clipboard defaults"),
  {
    value: "copy-on-select",
    description: "Copy chat selection when the mouse button is released",
    next: argumentChoices([
      terminalChoice("on", "Enable automatic copy on mouse release"),
      terminalChoice("off", "Require an explicit copy shortcut"),
    ]),
  },
]);

const SETTINGS_ARGUMENT_ASSIST = argumentChoices([
  terminalChoice("show", "Show all current settings"),
  {
    value: "clipboard",
    description: "Configure chat selection copying",
    canSubmit: true,
    next: SETTINGS_CLIPBOARD_ARGUMENT_ASSIST,
  },
  {
    value: "agent",
    description: "Configure orchestration and model roles",
    canSubmit: true,
    next: SETTINGS_AGENT_ARGUMENT_ASSIST,
  },
  {
    value: "appearance",
    description: "Configure color, motion, and rich text",
    next: SETTINGS_APPEARANCE_ARGUMENT_ASSIST,
  },
  {
    value: "intelligence",
    description: "Configure capability routing and subagents",
    canSubmit: true,
    next: SETTINGS_INTELLIGENCE_ARGUMENT_ASSIST,
  },
  {
    value: "shortcuts",
    description: "Configure composer shortcuts",
    canSubmit: true,
    next: SETTINGS_SHORTCUTS_ARGUMENT_ASSIST,
  },
  {
    value: "statusline",
    description: "Configure prompt footer runtime facts",
    canSubmit: true,
    next: SETTINGS_STATUSLINE_ARGUMENT_ASSIST,
  },
  {
    value: "activity",
    description: "Choose chat activity detail",
    next: argumentChoices([
      terminalChoice("off", "Hide non-essential activity"),
      terminalChoice("important", "Show important activity"),
      terminalChoice("full", "Show all activity"),
    ]),
  },
]);

const SKILLS_ARGUMENT_ASSIST = argumentChoices([
  terminalChoice("list", "List discovered Agent Skills"),
  {
    value: "auto",
    description: "Configure trusted skill auto-selection",
    next: argumentChoices([
      terminalChoice("on", "Auto-select trusted skills"),
      terminalChoice("off", "Use manual attachments only"),
      terminalChoice("status", "Show the current routing mode"),
    ]),
  },
  {
    value: "use",
    description: "Attach a skill by ID",
    next: argumentChoices([], {
      consume: "token",
      canSubmit: true,
    }),
  },
  {
    value: "remove",
    description: "Detach a skill by ID",
    next: argumentChoices([], {
      consume: "token",
      canSubmit: true,
    }),
  },
  terminalChoice("clear", "Detach all Agent Skills"),
]);

const HELP_TOPICS: readonly HelpTopic[] = [
  "commands",
  "shortcuts",
  "getting-started",
];

const HELP_ARGUMENT_ASSIST = argumentChoices([
  terminalChoice("commands", "Show slash-command reference"),
  terminalChoice("shortcuts", "Show composer and navigation shortcuts"),
  terminalChoice("getting-started", "Learn the interactive Orynt workflow"),
]);

export const SLASH_COMMANDS: readonly SlashCommandDefinition[] = [
  {
    command: "/help",
    aliases: [],
    usage: "/help [commands|shortcuts|getting-started]",
    description: "Show command, shortcut, or getting-started help",
    argument: "optional",
    argumentAssist: HELP_ARGUMENT_ASSIST,
    group: "Session",
    parse: (argument) => ({
      kind: "help",
      topic: argument.trim().toLowerCase() || "commands",
    }),
  },
  simpleCommand("/status", "Check provider and run configuration", "status", "Inspect"),
  {
    command: "/context",
    aliases: [],
    usage: "/context [history [limit]|compact]",
    description: "Inspect or compact the model context",
    argument: "optional",
    group: "Inspect",
    argumentAssist: argumentChoices([
      {
        value: "history",
        description: "Show stored chat history",
        next: argumentChoices([], {
          consume: "token",
          canSubmit: true,
        }),
      },
      terminalChoice("compact", "Compact context at a safe boundary"),
    ]),
    parse: (argument) => ({ kind: "context", value: argument }),
  },
  {
    command: "/paste",
    aliases: [],
    usage: "/paste [auto|text|image]",
    description: "Paste clipboard text or an image",
    argument: "optional",
    group: "Session",
    argumentAssist: argumentChoices([
      terminalChoice("auto", "Prefer an image, then text"),
      terminalChoice("text", "Paste clipboard text"),
      terminalChoice("image", "Attach a clipboard image"),
    ]),
    parse: (argument) => ({ kind: "paste", value: argument }),
  },
  {
    command: "/copy",
    aliases: [],
    usage: "/copy [latest|previous|all|n]",
    description: "Copy an Agent response or choose one interactively",
    argument: "optional",
    group: "Session",
    argumentAssist: argumentChoices(
      [
        terminalChoice("latest", "Copy the latest Agent response"),
        terminalChoice("previous", "Copy the previous Agent response"),
        terminalChoice("all", "Copy every Agent response in this session"),
      ],
      { consume: "token", canSubmit: true },
    ),
    parse: (argument) => ({ kind: "copy", value: argument }),
  },
  {
    command: "/next",
    aliases: [],
    usage: "/next <message>",
    description: "Send a message after the active operation",
    argument: "required",
    group: "Session",
    parse: (argument, original) =>
      argument ? { kind: "next", value: argument } : { kind: "unknown", value: original },
  },
  {
    command: "/stop",
    aliases: [],
    usage: "/stop",
    description: "Stop the active operation and pause pending messages",
    argument: "none",
    group: "Session",
    parse: () => ({ kind: "stop" }),
  },
  {
    command: "/pending",
    aliases: [],
    usage: "/pending [drop <n>|clear|resume]",
    description: "Inspect or manage messages waiting to run",
    argument: "optional",
    group: "Session",
    argumentAssist: argumentChoices([
      {
        value: "drop",
        description: "Remove one pending message by number",
        next: argumentChoices([], {
          consume: "token",
          canSubmit: true,
        }),
      },
      terminalChoice("clear", "Remove all pending messages"),
      terminalChoice("resume", "Resume FIFO processing"),
    ]),
    parse: (argument) => ({ kind: "pending", value: argument }),
  },
  valueCommand("/repo", "/repo <path>", "Change the repository workspace", "repo", "Workspace"),
  {
    command: "/model",
    aliases: [],
    usage: "/model [show|profile|role|effort]",
    description: "Configure the orchestration profile and role models",
    argument: "optional",
    group: "Legacy",
    hidden: true,
    parse: (argument) => ({ kind: "model", value: argument }),
  },
  {
    command: "/tier",
    aliases: [],
    usage: "/tier <auto|light|medium|heavy>",
    description: "Set the minimum model tier for the next request",
    argument: "optional",
    argumentAssist: TIER_ARGUMENT_ASSIST,
    group: "Customize",
    parse: (argument) => ({ kind: "tier", value: argument }),
  },
  {
    command: "/settings",
    aliases: [],
    usage: "/settings [show|agent|appearance|clipboard|intelligence|shortcuts|statusline|activity]",
    description: "Open guided settings or use section subcommands",
    argument: "optional",
    argumentAssist: SETTINGS_ARGUMENT_ASSIST,
    group: "Customize",
    parse: (argument) => ({ kind: "settings", value: argument }),
  },
  valueCommand(
    "/effort",
    "/effort <level>",
    "Legacy command; use /settings agent effort <role> <level>",
    "effort",
    "Legacy",
    true,
  ),
  {
    command: "/goal",
    aliases: [],
    usage: "/goal [text|--clear]",
    description: "Show, set, or clear the active objective",
    argument: "optional",
    argumentAssist: argumentChoices(
      [terminalChoice("--clear", "Clear the active objective")],
      { consume: "rest", canSubmit: true },
    ),
    group: "Workspace",
    parse: (argument) => ({ kind: "goal", value: argument }),
  },
  {
    command: "/skills",
    aliases: [],
    usage: "/skills [list|use <id>|remove <id>|clear]",
    description: "List or attach explicit Agent Skills to this session",
    argument: "optional",
    argumentAssist: SKILLS_ARGUMENT_ASSIST,
    group: "Workspace",
    parse: (argument) => ({ kind: "skills", value: argument || "list" }),
  },
  valueCommand("/criteria", "/criteria <a; b>", "Set acceptance criteria", "criteria", "Workspace"),
  simpleCommand("/plan", "Show the bounded operator plan", "plan", "Inspect"),
  simpleCommand("/state", "Show compact typed working state", "state", "Inspect"),
  simpleCommand("/evidence", "Show artifacts from the last run", "evidence", "Inspect"),
  {
    command: "/diff",
    aliases: [],
    usage: "/diff [path]",
    description: "Show the redacted diff from the last run",
    argument: "optional",
    group: "Inspect",
    parse: (argument) => ({ kind: "diff", value: argument }),
  },
  simpleCommand("/verify", "Show the last verifier verdict", "verify", "Inspect"),
  simpleCommand("/cost", "Show the last run cost", "cost", "Inspect"),
  {
    command: "/usage",
    aliases: [],
    usage: "/usage [verbose]",
    description: "Show normalized provider quota and account usage",
    argument: "optional",
    argumentAssist: argumentChoices([
      terminalChoice("verbose", "Include lifetime usage statistics"),
    ]),
    group: "Inspect",
    parse: (argument, original) =>
      !argument || argument === "verbose"
        ? { kind: "usage", verbose: argument === "verbose" }
        : { kind: "unknown", value: original },
  },
  {
    command: "/doctor",
    aliases: [],
    usage: "/doctor [verbose]",
    description: "Diagnose runtime, repository, state, provider, and model tiers",
    argument: "optional",
    argumentAssist: argumentChoices([
      terminalChoice("verbose", "Expand passing checks and evidence"),
    ]),
    group: "Inspect",
    parse: (argument, original) =>
      !argument || argument === "verbose"
        ? { kind: "doctor", verbose: argument === "verbose" }
        : { kind: "unknown", value: original },
  },
  simpleCommand("/setup", "Repair Codex installation or login", "setup", "Inspect"),
  {
    command: "/sessions",
    aliases: [],
    usage: "/sessions",
    description: "List saved sessions for this repository",
    argument: "none",
    group: "Workspace",
    parse: () => ({ kind: "sessions", value: "" }),
  },
  {
    command: "/resume",
    aliases: [],
    usage: "/resume [id]",
    description: "Restore latest or a named session",
    argument: "optional",
    argumentAssist: argumentChoices(
      [terminalChoice("latest", "Restore the latest saved session")],
      { consume: "token", canSubmit: true },
    ),
    group: "Workspace",
    parse: (argument) => ({ kind: "resume", value: argument }),
  },
  simpleCommand("/clear", "Clear and redraw Orynt", "clear", "Session"),
  {
    command: "/exit",
    aliases: ["/quit"],
    usage: "/exit",
    description: "End this session",
    argument: "none",
    group: "Session",
    parse: () => ({ kind: "exit" }),
  },
] as const;

function commandToken(input: string): string {
  return input.trimStart().split(/\s+/u, 1)[0]?.toLowerCase() ?? "";
}

function commandEditDistance(left: string, right: string): number {
  const previous = Array.from(
    { length: right.length + 1 },
    (_, index) => index,
  );
  let previousPrevious: number[] | undefined;
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitutionCost =
        left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      let distance = Math.min(
        (current[rightIndex - 1] ?? 0) + 1,
        (previous[rightIndex] ?? 0) + 1,
        (previous[rightIndex - 1] ?? 0) + substitutionCost,
      );
      if (
        previousPrevious &&
        leftIndex > 1 &&
        rightIndex > 1 &&
        left[leftIndex - 1] === right[rightIndex - 2] &&
        left[leftIndex - 2] === right[rightIndex - 1]
      ) {
        distance = Math.min(
          distance,
          (previousPrevious[rightIndex - 2] ?? 0) + 1,
        );
      }
      current[rightIndex] = distance;
    }
    previousPrevious = [...previous];
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length] ?? Math.max(left.length, right.length);
}

function commandSuggestionThreshold(length: number): number {
  if (length <= 1) return 0;
  if (length <= 4) return 1;
  if (length <= 8) return 2;
  return 3;
}

export function suggestSlashCommands(
  input: string,
  limit = 3,
): SlashCommandDefinition[] {
  const token = commandToken(input);
  if (
    !token.startsWith("/") ||
    token.length <= 2 ||
    limit <= 0
  ) {
    return [];
  }
  const value = token.slice(1);
  const threshold = commandSuggestionThreshold(value.length);
  return SLASH_COMMANDS.flatMap((definition, registryIndex) => {
    if (definition.hidden) return [];
    const distance = Math.min(
      ...[definition.command, ...definition.aliases].map((candidate) =>
        commandEditDistance(value, candidate.slice(1).toLowerCase())
      ),
    );
    return distance <= threshold
      ? [{ definition, distance, registryIndex }]
      : [];
  })
    .sort(
      (left, right) =>
        left.distance - right.distance ||
        left.registryIndex - right.registryIndex,
    )
    .slice(0, limit)
    .map(({ definition }) => definition);
}

export function filterSlashCommands(input: string): SlashCommandDefinition[] {
  const value = input.trimStart().toLowerCase();
  if (!value.startsWith("/") || /\s/.test(value)) {
    return [];
  }
  const prefixMatches = SLASH_COMMANDS.filter(
    (definition) =>
      !definition.hidden &&
      (definition.command.startsWith(value) ||
        definition.aliases.some((alias) => alias.startsWith(value))),
  );
  return prefixMatches.length > 0
    ? prefixMatches
    : suggestSlashCommands(value);
}

type SlashInputToken = {
  value: string;
  start: number;
  end: number;
};

function slashInputTokens(input: string): SlashInputToken[] {
  return Array.from(input.matchAll(/\S+/gu), (match) => ({
    value: match[0],
    start: match.index,
    end: match.index + match[0].length,
  }));
}

function activeSlashToken(
  input: string,
  cursor: number,
  tokens: SlashInputToken[],
): { index: number; token: SlashInputToken } | undefined {
  const boundedCursor = Math.max(0, Math.min(cursor, input.length));
  const containing = tokens.findIndex(
    ({ start, end }) => boundedCursor >= start && boundedCursor <= end,
  );
  if (containing >= 0) {
    const token = tokens[containing];
    if (token) return { index: containing, token };
  }
  const previousCount = tokens.filter(({ end }) => end < boundedCursor).length;
  return {
    index: previousCount,
    token: {
      value: "",
      start: boundedCursor,
      end: boundedCursor,
    },
  };
}

function exactArgumentChoice(
  node: SlashArgumentAssist,
  value: string,
): SlashArgumentChoice | undefined {
  const normalized = value.toLocaleLowerCase();
  return node.choices.find(
    (choice) => choice.value.toLocaleLowerCase() === normalized,
  );
}

function choiceCanSubmit(choice: SlashArgumentChoice): boolean {
  return choice.canSubmit ?? !choice.next;
}

function argumentMatches(
  node: SlashArgumentAssist,
  value: string,
): SlashArgumentChoice[] {
  const normalized = value.toLocaleLowerCase();
  const prefixMatches = node.choices.filter((choice) =>
    choice.value.toLocaleLowerCase().startsWith(normalized)
  );
  if (prefixMatches.length > 0 || !normalized || node.wildcard) {
    return prefixMatches;
  }
  const threshold = commandSuggestionThreshold(normalized.length);
  return node.choices
    .map((choice, registryIndex) => ({
      choice,
      registryIndex,
      distance: commandEditDistance(
        normalized,
        choice.value.toLocaleLowerCase(),
      ),
    }))
    .filter(({ distance }) => distance <= threshold)
    .sort(
      (left, right) =>
        left.distance - right.distance ||
        left.registryIndex - right.registryIndex,
    )
    .map(({ choice }) => choice);
}

function commandInputSuggestion(
  definition: SlashCommandDefinition,
  token: SlashInputToken,
): SlashInputSuggestion {
  const continueAssist = Boolean(
    definition.argumentAssist?.choices.length,
  );
  return {
    kind: "command",
    label: definition.usage,
    description: definition.description,
    completion: definition.command,
    replaceStart: token.start,
    replaceEnd: token.end,
    appendSpace: definition.argument !== "none",
    continueAssist,
  };
}

function argumentInputSuggestion(
  choice: SlashArgumentChoice,
  token: SlashInputToken,
): SlashInputSuggestion {
  return {
    kind: "argument",
    label: choice.value,
    description: choice.description,
    completion: choice.value,
    replaceStart: token.start,
    replaceEnd: token.end,
    appendSpace: Boolean(choice.next),
    continueAssist: Boolean(choice.next?.choices.length),
  };
}

export function slashInputAssist(
  input: string,
  cursor = input.length,
): SlashInputAssist {
  if (input.includes("\n")) return { suggestions: [], canSubmit: false };
  const tokens = slashInputTokens(input);
  const active = activeSlashToken(input, cursor, tokens);
  if (!active) return { suggestions: [], canSubmit: false };
  const currentValue = active.token.value.toLocaleLowerCase();

  if (active.index === 0) {
    const suggestions = filterSlashCommands(currentValue).map((definition) =>
      commandInputSuggestion(definition, active.token)
    );
    const exact = SLASH_COMMANDS.find(
      (definition) =>
        !definition.hidden &&
        (
          definition.command === currentValue ||
          definition.aliases.includes(currentValue as `/${string}`)
        ),
    );
    return {
      suggestions,
      canSubmit: Boolean(exact && exact.argument !== "required"),
    };
  }

  const commandToken = tokens[0]?.value.toLocaleLowerCase();
  const definition = SLASH_COMMANDS.find(
    (candidate) =>
      !candidate.hidden &&
      (
        candidate.command === commandToken ||
        candidate.aliases.includes(commandToken as `/${string}`)
      ),
  );
  if (!definition?.argumentAssist) {
    return { suggestions: [], canSubmit: false };
  }

  let node: SlashArgumentAssist | undefined = definition.argumentAssist;
  let canSubmit = definition.argument !== "required";
  for (const token of tokens.slice(1, active.index)) {
    if (!node) return { suggestions: [], canSubmit: false };
    const choice = exactArgumentChoice(node, token.value);
    if (choice) {
      canSubmit = choiceCanSubmit(choice);
      node = choice.next;
      continue;
    }
    const wildcard = node.wildcard;
    if (!wildcard) return { suggestions: [], canSubmit: false };
    canSubmit = wildcard.canSubmit;
    node = wildcard.next;
    if (wildcard.consume === "rest") {
      return { suggestions: [], canSubmit };
    }
  }

  if (!node) return { suggestions: [], canSubmit };
  if (!active.token.value) {
    return {
      suggestions: node.choices.map((choice) =>
        argumentInputSuggestion(choice, active.token)
      ),
      canSubmit,
    };
  }

  const matches = argumentMatches(node, active.token.value);
  const exact = exactArgumentChoice(node, active.token.value);
  if (exact) canSubmit = choiceCanSubmit(exact);
  else if (matches.length > 0) canSubmit = false;
  else if (node.wildcard) canSubmit = node.wildcard.canSubmit;
  else canSubmit = false;
  return {
    suggestions: matches.map((choice) =>
      argumentInputSuggestion(choice, active.token)
    ),
    canSubmit,
  };
}

export function renderUnknownCommand(input: string): string {
  const token = commandToken(input);
  const exactDefinition = SLASH_COMMANDS.find(
    (definition) =>
      definition.command === token ||
      definition.aliases.includes(token as `/${string}`),
  );
  if (exactDefinition?.argument === "required") {
    return `Usage: ${exactDefinition.usage}`;
  }
  const suggestions = suggestSlashCommands(token);
  if (suggestions.length === 0) {
    return `Unknown command: ${terminalSafeText(input)}. Use /help.`;
  }
  const commands = suggestions.map(({ command }) => command);
  const formatted =
    commands.length === 1
      ? commands[0]
      : commands.length === 2
        ? `${commands[0]} or ${commands[1]}`
        : `${commands.slice(0, -1).join(", ")}, or ${commands.at(-1)}`;
  return `Unknown command: ${terminalSafeText(input)}. Did you mean ${formatted}?`;
}

function paintIndentedLine(
  line: string,
  role: TerminalRole,
  theme: TerminalTheme,
): string {
  const [, indent = "", content = ""] = line.match(/^(\s*)(.*)$/u) ?? [];
  return `${indent}${theme.paint(role, content)}`;
}

export type HelpRenderOptions = {
  width?: number;
  color?: boolean;
  themeId?: TerminalThemeId;
  shortcuts?: CliShortcutPreferences;
};

type HelpSection = {
  title: string;
  icon: string;
  rows: Array<{
    label: string;
    value: string;
  }>;
};

function renderHelpHeading(
  title: string,
  width: number,
  theme: TerminalTheme,
): string {
  const leftPadding = " ".repeat(
    Math.max(0, Math.floor((width - terminalTextWidth(title)) / 2)),
  );
  return theme.paintRow("helpHeading", `${leftPadding}${title}`);
}

function renderHelpSectionTitle(
  title: string,
  icon: string,
  width: number,
  theme: TerminalTheme,
): string[] {
  return wrapTerminalParagraph(`${title} ${icon}`, width).map((line) =>
    theme.paint("heading", line)
  );
}

function paintPrefixedLines(
  lines: readonly string[],
  firstPrefix: string,
  continuationPrefix: string,
  role: TerminalRole,
  theme: TerminalTheme,
): string[] {
  return lines.map((line, index) => {
    const prefix = index === 0 ? firstPrefix : continuationPrefix;
    return `${prefix}${theme.paint(role, line.slice(prefix.length))}`;
  });
}

function renderHelpSections(
  title: string,
  sections: readonly HelpSection[],
  options: HelpRenderOptions,
): string {
  const width = Math.max(20, Math.floor(options.width ?? 88));
  const design = createTerminalDesignSystem(
    options.color ?? false,
    options.themeId,
  );
  const lines: string[] = [renderHelpHeading(title, width, design.theme)];
  for (const section of sections) {
    lines.push(
      "",
      ...renderHelpSectionTitle(
        section.title,
        section.icon,
        width,
        design.theme,
      ),
      ...renderTerminalDetailRows(section.rows, { width }).map((line) =>
        design.renderProductText(line)
      ),
    );
  }
  return lines.join("\n");
}

export function renderCommandHelp(
  options: HelpRenderOptions = {},
): string {
  const visible = SLASH_COMMANDS.filter((definition) => !definition.hidden);
  const width = Math.max(20, Math.floor(options.width ?? 88));
  const design = createTerminalDesignSystem(
    options.color ?? false,
    options.themeId,
  );
  const theme = design.theme;
  type VisibleCommandGroup = Exclude<
    SlashCommandDefinition["group"],
    "Legacy"
  >;
  const groups: VisibleCommandGroup[] = [
    "Customize",
    "Workspace",
    "Inspect",
    "Session",
  ];
  const groupIcons: Readonly<Record<VisibleCommandGroup, string>> = {
    Customize: "🛠️",
    Workspace: "📁",
    Inspect: "🔍",
    Session: "💬",
  };
  const lines: string[] = [renderHelpHeading("Commands", width, theme)];
  for (const [groupIndex, group] of groups.entries()) {
    const definitions = visible.filter(
      (definition) => definition.group === group,
    );
    if (definitions.length === 0) continue;
    if (groupIndex > 0) lines.push("");
    lines.push(...renderHelpSectionTitle(group, groupIcons[group], width, theme));
    const eligible = definitions.filter(
      ({ usage }) => width >= 72 && terminalTextWidth(usage) <= 34,
    );
    const usageColumn = Math.min(
      34,
      Math.max(0, ...eligible.map(({ usage }) => terminalTextWidth(usage))),
    );
    for (const [definitionIndex, definition] of definitions.entries()) {
      const last = definitionIndex === definitions.length - 1;
      const prefix = `  ${last ? "└─" : "├─"} `;
      const stem = `  ${last ? "  " : "│ "} `;
      const usageWidth = terminalTextWidth(definition.usage);
      if (width >= 72 && usageWidth <= usageColumn) {
        const paddedUsage = `${definition.usage}${" ".repeat(
          usageColumn - usageWidth,
        )}`;
        const descriptionIndent = `${prefix}${" ".repeat(usageColumn)}  `;
        const descriptionContinuation =
          `${stem}${" ".repeat(usageColumn + 2)}`;
        const descriptionLines = wrapTerminalParagraph(
          definition.description,
          width,
          {
            firstIndent: descriptionIndent,
            continuationIndent: descriptionContinuation,
          },
        );
        const firstDescription =
          descriptionLines[0]?.slice(descriptionIndent.length) ?? "";
        lines.push(
          `${prefix}${theme.paint("command", paddedUsage)}  ${theme.paint(
            "metadata",
            firstDescription,
          )}`,
        );
        lines.push(
          ...paintPrefixedLines(
            descriptionLines.slice(1),
            descriptionContinuation,
            descriptionContinuation,
            "metadata",
            theme,
          ),
        );
        continue;
      }
      lines.push(
        ...paintPrefixedLines(
          wrapTerminalParagraph(definition.usage, width, {
            firstIndent: prefix,
            continuationIndent: stem,
          }),
          prefix,
          stem,
          "command",
          theme,
        ),
      );
      const detailIndent = `${stem}  `;
      lines.push(
        ...paintPrefixedLines(
          wrapTerminalParagraph(definition.description, width, {
            firstIndent: detailIndent,
            continuationIndent: detailIndent,
          }),
          detailIndent,
          detailIndent,
          "metadata",
          theme,
        ),
      );
    }
  }
  const usingOryntLines = renderTerminalDetailRows(
      [
        {
          label: "Settings",
          value:
            "Use /settings interactively, or /settings <section> for direct configuration.",
        },
        {
          label: "Screen",
          value:
            "Auto uses native inline scrollback in Orca and fullscreen on other interactive terminals; choose Fullscreen explicitly to override it.",
        },
        {
          label: "History",
          value:
            "Use PageUp/PageDown; Ctrl+Home moves to the start and Ctrl+End returns to live output.",
        },
        {
          label: "Compatibility",
          value:
            "/model and /effort remain accepted but are configured through /settings agent.",
        },
        {
          label: "Terminal",
          value:
            "In fullscreen, drag to select a range, double-click a word, or triple-click a row; inline mode keeps terminal-native selection.",
        },
        {
          label: "Input",
          value:
            "Any other text becomes a conversational prompt for the repository agent.",
        },
        {
          label: "More help",
          value:
            "Use /help shortcuts for keys or /help getting-started for the interactive workflow.",
        },
      ],
      { width },
    );
  lines.push(
    "",
    ...renderHelpSectionTitle("Using Orynt", "🧭", width, theme),
    ...usingOryntLines.map((line) => design.renderProductText(line)),
  );
  return [
    ...lines,
  ].join("\n");
}

export function renderShortcutHelp(
  options: HelpRenderOptions = {},
): string {
  const shortcuts = shortcutPreferences(options.shortcuts);
  return renderHelpSections(
    "Shortcuts",
    [
      {
        title: "Write and edit",
        icon: "✍️",
        rows: [
          {
            label: "Send",
            value: "Enter sends the draft; Alt+Enter inserts a new line.",
          },
          {
            label: "Move",
            value:
              "Arrow keys move by character. Ctrl+Left/Right or Alt+B/F moves by word.",
          },
          {
            label: "Select",
            value:
              "Shift+Arrow selects text, Ctrl+Shift+Left/Right selects by word, and Ctrl+A selects all.",
          },
          {
            label: "Clipboard",
            value:
              "Ctrl+Shift+C copies composer or chat selection, Ctrl+X cuts, and Ctrl+Shift+V pastes composer text.",
          },
          {
            label: "Delete",
            value:
              "Ctrl+Backspace or Ctrl+Delete removes a word. Ctrl+W removes the word before the cursor.",
          },
          {
            label: "Clear",
            value: `${shortcutListLabel(shortcuts.clear)} clears a selection or draft.`,
          },
          {
            label: "Undo",
            value: `${shortcutListLabel(shortcuts.undo)} undoes the latest edit.`,
          },
          {
            label: "Redo",
            value: `${shortcutListLabel(shortcuts.redo)} reapplies an undone edit.`,
          },
        ],
      },
      {
        title: "Navigate",
        icon: "🧭",
        rows: [
          {
            label: "Prompt history",
            value:
              "Up/Down recalls submitted prompts when the cursor cannot move further.",
          },
          {
            label: "Conversation",
            value:
              "PageUp/PageDown scrolls the chat. Ctrl+Home goes to the start; Ctrl+End returns to live output.",
          },
          {
            label: "Suggestions",
            value:
              "Up/Down chooses an item, Tab completes it, and Enter confirms or submits.",
          },
          {
            label: "Choices",
            value:
              "Up/Down changes the choice. Enter confirms; Left or Esc goes back.",
          },
          {
            label: "Select chat",
            value:
              "Single-click does not select. Drag selects a range, double-click selects a word, and triple-click selects a row.",
          },
          {
            label: "Mouse wheel",
            value:
              "Over the composer it recalls prompt history; over the conversation it scrolls chat.",
          },
        ],
      },
      {
        title: "Control active work",
        icon: "🎛️",
        rows: [
          {
            label: "Update",
            value:
              "Enter sends a contextual update while an agent operation is active.",
          },
          {
            label: "Queue next",
            value:
              "Tab queues the draft to run after the active operation.",
          },
          {
            label: "Cancel",
            value:
              "Press Ctrl+C twice after the warning to cancel active work; pending messages pause.",
          },
          {
            label: "Edit pending",
            value:
              "With an empty draft, Ctrl+Up recalls the newest pending message.",
          },
          {
            label: "Clear pending",
            value:
              "With an empty draft, press Esc twice after the warning to dismiss all pending messages.",
          },
          {
            label: "Exit",
            value:
              "Use /exit, or press Ctrl+C twice while no operation is active.",
          },
        ],
      },
      {
        title: "Customize",
        icon: "⚙️",
        rows: [
          {
            label: "Settings",
            value:
              "Use /settings shortcuts for editing keys or /settings clipboard for copy-on-select.",
          },
          {
            label: "Command help",
            value: "Use /help commands to see every slash command.",
          },
        ],
      },
    ],
    options,
  );
}

export function renderGettingStartedHelp(
  options: HelpRenderOptions = {},
): string {
  return renderHelpSections(
    "Getting started",
    [
      {
        title: "Start a conversation",
        icon: "💬",
        rows: [
          {
            label: "Ask",
            value:
              "Type plain text to ask about the repository. Questions are read only.",
          },
          {
            label: "Change",
            value:
              "Describe the result, constraints, and proof you expect. Orynt asks before sensitive work.",
          },
          {
            label: "Example",
            value:
              "Fix the failing parser test. Keep the public API unchanged.",
          },
        ],
      },
      {
        title: "Guide active work",
        icon: "🎯",
        rows: [
          {
            label: "Update",
            value:
              "Press Enter to send context to the active operation.",
          },
          {
            label: "Queue",
            value:
              "Press Tab to queue a message for the next operation.",
          },
          {
            label: "Stop",
            value:
              "Press Ctrl+C twice after the warning, or use /stop. Pending messages pause.",
          },
          {
            label: "Pending",
            value:
              "Use /pending to inspect, remove, clear, or resume queued messages.",
          },
        ],
      },
      {
        title: "Check the result",
        icon: "✅",
        rows: [
          {
            label: "Status",
            value: "Use /status to inspect the current runtime configuration.",
          },
          {
            label: "Plan",
            value: "Use /plan to inspect the bounded operator plan.",
          },
          {
            label: "Changes",
            value:
              "Use /diff or /diff <path> to inspect the last redacted repository patch.",
          },
          {
            label: "Verification",
            value:
              "Use /verify to read the latest independent verifier verdict.",
          },
        ],
      },
      {
        title: "Manage the session",
        icon: "🗂️",
        rows: [
          {
            label: "Configure",
            value:
              "Use /settings for guided configuration or a direct settings subcommand.",
          },
          {
            label: "Sessions",
            value:
              "Use /sessions to list saved sessions and /resume to restore one.",
          },
          {
            label: "Context",
            value:
              "Use /context to inspect context usage or /context history to review stored chat.",
          },
          {
            label: "Leave",
            value: "Use /exit to end the interactive session.",
          },
        ],
      },
      {
        title: "Find more help",
        icon: "❓",
        rows: [
          {
            label: "Commands",
            value: "Use /help commands for the slash-command reference.",
          },
          {
            label: "Shortcuts",
            value: "Use /help shortcuts for all interactive keys.",
          },
          {
            label: "Launch options",
            value:
              "Run orynt --help outside the session for startup flags and external subcommands.",
          },
        ],
      },
    ],
    options,
  );
}

export function renderInteractiveHelp(
  topic: string,
  options: HelpRenderOptions = {},
): string {
  const normalized = topic.trim().toLowerCase() || "commands";
  if (!HELP_TOPICS.includes(normalized as HelpTopic)) {
    return "Usage: /help [commands|shortcuts|getting-started]";
  }
  if (normalized === "shortcuts") return renderShortcutHelp(options);
  if (normalized === "getting-started") {
    return renderGettingStartedHelp(options);
  }
  return renderCommandHelp(options);
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
  const theme = createTerminalDesignSystem(options.color, options.themeId).theme;
  const width = Math.max(20, Math.floor(options.width ?? 84));
  const repository = terminalSafeText(
    width < 64 ? path.basename(state.repositoryPath) || state.repositoryPath : state.repositoryPath,
  );
  const profileLabel = state.orchestrationProfile
    ? ({
        auto: "Auto picks the model",
        quality: "Quality mode",
        balanced: "Balanced mode",
        economy: "Economy mode",
        custom: "Custom model setup",
      } as const)[state.orchestrationProfile.preset]
    : "Fixed model";
  const providerLine = state.providerReady
    ? `${theme.paint("success", "✓ Codex ready")}`
    : `${theme.paint("attention", "! Codex needs setup")} ${theme.paint("separator", "·")} ${theme.paint("command", "/setup")}`;
  const agentLine = `${theme.paint("focus", "›")} ${theme.paint("model", profileLabel)}`;
  const safety = `${theme.paint("muted", "◇")} ${theme.paint("info", "Chat is read-only")} ${theme.paint("separator", "·")} ${theme.paint("attention", "risky changes ask first")}`;
  const examples = width >= 72
    ? ["explain this repo", "fix a test", "check readiness"]
    : width >= 48
      ? ["explain this repo", "fix a test"]
      : ["explain this repo"];
  const shortcuts = width < 40
    ? ["/help commands", "/status details"]
    : ["/help commands · /status details"];
  return [
    `${theme.paint("brand", "ORYNT")} ${theme.paint("focus", "›")} ${theme.paint("path", repository)}`,
    theme.paint("muted", "An agent that just works."),
    "",
    providerLine,
    agentLine,
    ...(width < 64
      ? [
          `${theme.paint("muted", "◇")} ${theme.paint("info", "Chat is read-only")}`,
          `  ${theme.paint("attention", "Risky changes ask first")}`,
        ]
      : [safety]),
    "",
    `${theme.paint("label", "Try:")} ${examples.map((example) => theme.paint("value", example)).join(theme.paint("separator", " · "))}`,
    ...shortcuts.map((line) =>
      line.split(" · ").map((part) => {
        const [command, ...description] = part.split(" ");
        return `${theme.paint("command", command ?? "")} ${theme.paint("metadata", description.join(" "))}`;
      }).join(theme.paint("separator", " · "))
    ),
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

function runToolPresentation(
  toolKind: string,
  toolName: string,
): { icon: string; label: string } {
  const normalized = toolName.toLocaleLowerCase();
  if (normalized === "repo_read") return { icon: "▤", label: "Read" };
  if (normalized === "repo_list") return { icon: "≡", label: "List" };
  if (normalized === "repo_search") return { icon: "⌕", label: "Search" };
  if (normalized === "repo_exec" || toolKind === "command") {
    return { icon: "▶", label: "Run" };
  }
  if (normalized === "repo_apply_patch" || toolKind === "file_change") {
    return { icon: "✎", label: "Edit" };
  }
  if (normalized === "repo_diff") return { icon: "Δ", label: "Diff" };
  if (normalized === "repo_status") return { icon: "◇", label: "Inspect" };
  if (toolKind === "web_search") return { icon: "◎", label: "Web" };
  if (toolKind === "mcp") return { icon: "◆", label: "MCP" };
  return { icon: "◇", label: "Tool" };
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
  agentResponseStreamed?: boolean;
  changedFiles?: string[];
  verifierSummary?: string;
  manualReviewSummary?: string;
  failureSummary?: string;
  toolCallCount: number;
  failedToolCallCount: number;
};

export type HumanRunCompletion = {
  runId?: string;
  status: string;
  summary?: string;
  verification?: string;
  evidenceCount?: number;
  artifactManifestPath?: string;
  errorMessage?: string;
  repositoryDiff?:
    | {
        available: true;
        totals: RepositoryDiffArtifactV1["totals"];
        truncated: boolean;
      }
    | {
        available: false;
        reason: string;
      };
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
  private agentResponseStreamed = false;
  private readonly completedActivityItems = new Set<string>();
  private readonly toolCallItems = new Set<string>();
  private readonly failedToolItems = new Set<string>();
  private readonly theme: TerminalTheme;
  private readonly activityDetails: ActivityDetailLevel;

  constructor(options: {
    color: boolean;
    themeId?: TerminalThemeId;
    activityDetails?: ActivityDetailLevel;
  }) {
    this.theme = createTerminalDesignSystem(options.color, options.themeId).theme;
    this.activityDetails = options.activityDetails ?? "important";
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

    const output: string[] = [];
    if (
      this.activityDetails === "full" &&
      (event.type === "codex_reasoning_summary" ||
        event.type === "codex_tool_activity") &&
      (payload.status === "completed" || payload.status === "failed")
    ) {
      const itemId = typeof payload.itemId === "string" ? payload.itemId : `${event.type}:${summary ?? ""}`;
      if (!this.completedActivityItems.has(itemId)) {
        this.completedActivityItems.add(itemId);
        if (event.type === "codex_reasoning_summary") {
          const detail = payloadText(payload, ["text", "summary"]);
          if (detail) {
            output.push(this.theme.paint("muted", row("◇", "Think", detail.replace(/\s+/gu, " ").slice(0, 180))));
          }
        } else {
          this.toolCallItems.add(itemId);
          if (payload.status === "failed") {
            this.failedToolItems.add(itemId);
          }
          const toolKind = payloadText(payload, ["toolKind"]) ?? "other";
          const toolName = payloadText(payload, ["toolName"]) ?? "tool";
          const presentation = runToolPresentation(toolKind, toolName);
          const detail = payloadText(payload, ["detail", "summary"]);
          if (detail) {
            output.push(
              this.theme.paint(
                "muted",
                row(
                  payload.status === "failed" ? "✕" : presentation.icon,
                  presentation.label,
                  `${detail.replace(/\s+/gu, " ").slice(0, 180)}${payload.status === "failed" ? " · failed" : ""}`,
                ),
              ),
            );
          }
        }
      }
    }

    const milestone = MILESTONES.findIndex(({ eventTypes }) => eventTypes.has(event.type));
    if (
      this.activityDetails === "off" ||
      milestone < 0 ||
      milestone <= this.lastMilestone
    ) {
      return output;
    }
    for (let index = this.lastMilestone + 1; index <= milestone; index += 1) {
      const current = MILESTONES[index];
      if (current) {
        output.push(this.theme.paint("muted", row("◇", current.label, current.detail)));
      }
    }
    this.lastMilestone = milestone;
    return output;
  }

  agentMessageUpdate(
    event: PresentableRunEvent,
  ): { itemId: string; text: string; status: string } | undefined {
    if (event.type !== "codex_agent_message") return undefined;
    const payload = eventPayload(event);
    const text = payloadText(payload, ["message"]);
    if (!text) return undefined;
    return {
      itemId: payloadText(payload, ["itemId"]) ?? "agent-message",
      text,
      status: payloadText(payload, ["status"]) ?? "updated",
    };
  }

  activityUpdate(
    event: PresentableRunEvent,
  ): { detail: string; status: string } | undefined {
    if (
      event.type !== "codex_reasoning_summary" &&
      event.type !== "codex_tool_activity"
    ) {
      return undefined;
    }
    const payload = eventPayload(event);
    const status = payloadText(payload, ["status"]) ?? "updated";
    if (event.type === "codex_reasoning_summary") {
      const detail = payloadText(payload, ["text", "summary"]);
      return detail
        ? { detail: `Think ${detail.replace(/\s+/gu, " ").slice(0, 180)}`, status }
        : undefined;
    }
    const kind = payloadText(payload, ["toolKind"]) ?? "other";
    const toolName = payloadText(payload, ["toolName"]) ?? "tool";
    const presentation = runToolPresentation(kind, toolName);
    const detail = payloadText(payload, ["detail", "summary"]);
    return detail
      ? {
          detail: `${presentation.label} ${detail.replace(/\s+/gu, " ").slice(0, 180)}`,
          status,
        }
      : undefined;
  }

  markAgentResponseStreamed(): void {
    this.agentResponseStreamed = true;
  }

  snapshot(): RunPresentationSnapshot {
    return {
      ...(this.finalAgentResponse ?? this.fallbackAgentResponse
        ? { finalAgentResponse: this.finalAgentResponse ?? this.fallbackAgentResponse }
        : {}),
      ...(this.agentResponseStreamed ? { agentResponseStreamed: true } : {}),
      ...(this.changedFiles ? { changedFiles: [...this.changedFiles] } : {}),
      ...(this.verifierSummary ? { verifierSummary: this.verifierSummary } : {}),
      ...(this.manualReviewSummary ? { manualReviewSummary: this.manualReviewSummary } : {}),
      ...(this.fatalFailureSummary ?? this.verifierFailureSummary
        ? {
            failureSummary:
              this.fatalFailureSummary ?? this.verifierFailureSummary,
          }
        : {}),
      toolCallCount: this.toolCallItems.size,
      failedToolCallCount: this.failedToolItems.size,
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
  options: { color: boolean; themeId?: TerminalThemeId },
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
  const theme = createTerminalDesignSystem(options.color, options.themeId).theme;
  const output = [
    row(theme.paint(role, icon), cancelled ? "Stopped" : "Done", detail),
  ];

  if (presentation.finalAgentResponse && !presentation.agentResponseStreamed) {
    output.push(
      "",
      passed ? "Agent report" : "Agent report · unverified",
      ...indentedMultiline(presentation.finalAgentResponse),
    );
  }

  if (completion.repositoryDiff?.available) {
    const totals = completion.repositoryDiff.totals;
    output.push(
      "",
      `Changes · ${totals.files} file${totals.files === 1 ? "" : "s"} · +${totals.additions}/-${totals.deletions}`,
      ...(presentation.changedFiles ?? []).map(
        (filePath) => `  ${terminalSafeText(filePath)}`,
      ),
      completion.interactive
        ? "  Use /diff to inspect the redacted patch."
        : `  Redacted patch is recorded in the artifact manifest.`,
      ...(completion.repositoryDiff.truncated
        ? ["  Diff artifact was truncated at its safety limit."]
        : []),
    );
  } else if (presentation.changedFiles) {
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
  if (completion.repositoryDiff && !completion.repositoryDiff.available) {
    output.push(
      `  Diff unavailable · ${terminalSafeText(completion.repositoryDiff.reason)}`,
    );
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

function repositoryDiffStatusLabel(status: string): string {
  return status === "passed" ? "Verified" : "Unverified";
}

function diffFileLabel(
  file: RepositoryDiffArtifactV1["files"][number],
): string {
  const status = ({
    added: "A",
    modified: "M",
    deleted: "D",
    renamed: "R",
    copied: "C",
    untracked: "A",
    unknown: "?",
  } as const)[file.status];
  const counts =
    file.additions === null || file.deletions === null
      ? "binary"
      : `+${file.additions}/-${file.deletions}`;
  const rename = file.previousPath
    ? `${file.previousPath} → ${file.path}`
    : file.path;
  return `${status} ${rename} · ${counts}`;
}

function paintDiffLine(
  line: string,
  theme: TerminalTheme,
): string {
  const safe = terminalSafeMultilineText(line);
  if (line.startsWith("+") && !line.startsWith("+++")) {
    return theme.paintRow("diffAdded", safe);
  }
  if (line.startsWith("-") && !line.startsWith("---")) {
    return theme.paintRow("diffRemoved", safe);
  }
  if (line.startsWith("@@ ")) return theme.paint("diffHunk", safe);
  if (
    line.startsWith("diff --git ") ||
    line.startsWith("index ") ||
    line.startsWith("--- ") ||
    line.startsWith("+++ ")
  ) {
    return theme.paint("metadata", safe);
  }
  return safe;
}

export function renderRepositoryDiff(
  artifact: RepositoryDiffArtifactV1,
  options: {
    color: boolean;
    themeId?: TerminalThemeId;
    verification: string;
    artifactPath: string;
    filePath?: string;
  },
): string {
  const theme = createTerminalDesignSystem(options.color, options.themeId).theme;
  const selected = options.filePath
    ? artifact.files.filter(({ path }) => path === options.filePath)
    : artifact.files;
  if (options.filePath && selected.length === 0) {
    return `Diff path was not changed in the last run: ${terminalSafeText(options.filePath)}`;
  }
  const totals = options.filePath
    ? {
        files: selected.length,
        additions: selected.reduce(
          (total, file) => total + (file.additions ?? 0),
          0,
        ),
        deletions: selected.reduce(
          (total, file) => total + (file.deletions ?? 0),
          0,
        ),
      }
    : artifact.totals;
  const lines = [
    theme.strong(
      `Diff · ${repositoryDiffStatusLabel(options.verification)} · ${totals.files} file${totals.files === 1 ? "" : "s"} · +${totals.additions}/-${totals.deletions}`,
    ),
    theme.paint(
      "metadata",
      `Artifact · ${terminalSafeText(options.artifactPath)} · redacted`,
    ),
  ];
  if (options.verification !== "passed") {
    lines.push(
      theme.paint(
        "attention",
        "Warning · this patch did not receive a passing verifier verdict.",
      ),
    );
  }
  let previewLines = 0;
  let previewBytes = 0;
  let previewTruncated = false;
  for (const file of selected) {
    lines.push("", theme.strong(terminalSafeText(diffFileLabel(file))));
    if (file.binary) {
      lines.push(
        theme.paint("metadata", "  Binary content is not displayed."),
      );
      continue;
    }
    if (!file.patch) {
      lines.push(
        theme.paint("metadata", "  No textual patch was recorded."),
      );
      continue;
    }
    for (const line of file.patch.replace(/\r\n?/gu, "\n").split("\n")) {
      const bytes = Buffer.byteLength(`${line}\n`, "utf8");
      if (
        previewLines >= REPOSITORY_DIFF_PREVIEW_MAX_LINES ||
        previewBytes + bytes > REPOSITORY_DIFF_PREVIEW_MAX_BYTES
      ) {
        previewTruncated = true;
        break;
      }
      lines.push(paintDiffLine(line, theme));
      previewLines += 1;
      previewBytes += bytes;
    }
    if (previewTruncated) break;
  }
  if (artifact.truncated || previewTruncated) {
    lines.push(
      "",
      theme.paint(
        "metadata",
        `Preview truncated · inspect the bounded redacted artifact at ${terminalSafeText(options.artifactPath)}`,
      ),
    );
  }
  return lines.join("\n");
}
