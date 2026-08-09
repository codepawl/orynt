const ANSI = "\u001b[";
const RESET = `${ANSI}0m`;
const ERASE_TO_END = `${ANSI}K`;

export const TERMINAL_THEME_IDS = [
  "quiet-studio",
  "monochrome",
] as const;

export type TerminalThemeId = (typeof TERMINAL_THEME_IDS)[number];

export const DEFAULT_TERMINAL_THEME_ID: TerminalThemeId = "quiet-studio";
export const TERMINAL_SCREEN_MODES = ["auto", "fullscreen", "inline"] as const;
export type TerminalScreenMode = (typeof TERMINAL_SCREEN_MODES)[number];
export type EffectiveTerminalScreenMode = Exclude<TerminalScreenMode, "auto">;

export type TerminalRole =
  | "brand"
  | "heading"
  | "label"
  | "value"
  | "command"
  | "model"
  | "identifier"
  | "count"
  | "duration"
  | "info"
  | "pending"
  | "separator"
  | "user"
  | "focus"
  | "selection"
  | "agent"
  | "success"
  | "attention"
  | "danger"
  | "contextHealthy"
  | "contextWarning"
  | "contextCompact"
  | "contextCritical"
  | "muted"
  | "metadata"
  | "diffAdded"
  | "diffRemoved"
  | "helpHeading"
  | "userMessage"
  | "diffHunk"
  | "path"
  | "inlineCode"
  | "codePlain"
  | "codeKeyword"
  | "codeString"
  | "codeNumber"
  | "codeComment";

export type TerminalRowRole =
  | "diffAdded"
  | "diffRemoved"
  | "helpHeading"
  | "userMessage";

export type TerminalThemeDefinition = {
  id: TerminalThemeId;
  label: string;
  description: string;
  styles: Readonly<Record<TerminalRole, string>>;
  contextGradient: readonly [
    readonly [number, number, number],
    readonly [number, number, number],
    readonly [number, number, number],
    readonly [number, number, number],
  ];
};

export type TerminalTheme = {
  id: TerminalThemeId;
  enabled: boolean;
  paint: (role: TerminalRole, value: string) => string;
  paintContextUsage: (progress: number, value: string) => string;
  paintRow: (role: TerminalRowRole, value: string) => string;
  paintRenderedRow: (role: TerminalRowRole, value: string) => string;
  strong: (value: string) => string;
};

export type TerminalAppearance = {
  color: boolean;
  motion: boolean;
  richText: boolean;
  themeId?: TerminalThemeId;
  screenMode?: TerminalScreenMode;
};

export type TerminalAppearanceResolution = Omit<
  TerminalAppearance,
  "themeId"
> & {
  themeId: TerminalThemeId;
  themeOverride?: "--theme";
  colorOverride?: "non-tty" | "NO_COLOR" | "--plain" | "--no-color";
  motionOverride?: "non-tty" | "--plain";
  richTextOverride?: "non-tty" | "--plain";
  screenMode: EffectiveTerminalScreenMode;
  screenOverride?:
    | "--screen"
    | "--plain"
    | "non-tty"
    | "TERM=dumb"
    | "TERM_PROGRAM=Orca"
    | "auto";
};

const QUIET_STUDIO_STYLES: Readonly<Record<TerminalRole, string>> = {
  brand: "1;38;2;198;167;216",
  heading: "1;38;2;198;167;216",
  label: "38;2;180;178;202",
  value: "38;2;223;221;214",
  command: "38;2;143;182;232",
  model: "38;2;198;167;216",
  identifier: "38;2;180;178;202",
  count: "38;2;216;181;106",
  duration: "38;2;216;181;106",
  info: "38;2;143;182;232",
  pending: "38;2;212;169;79",
  separator: "2;38;2;155;154;150",
  user: "38;2;143;182;232",
  focus: "38;2;143;182;232",
  selection: "7",
  agent: "38;2;198;196;191",
  success: "38;2;120;201;155",
  attention: "38;2;212;169;79",
  danger: "38;2;223;114;114",
  contextHealthy: "38;2;120;201;155",
  contextWarning: "38;2;212;169;79",
  contextCompact: "38;2;224;143;77",
  contextCritical: "38;2;223;114;114",
  muted: "2",
  metadata: "2;3",
  diffAdded: "7;38;2;120;201;155",
  diffRemoved: "7;38;2;223;114;114",
  helpHeading: "1;38;2;28;31;38;48;2;198;167;216",
  userMessage: "38;2;52;64;84;48;2;238;241;245",
  diffHunk: "2;3;38;2;143;182;232",
  path: "4;38;2;143;182;232",
  inlineCode: "38;2;198;196;191",
  codePlain: "38;2;198;196;191",
  codeKeyword: "38;2;143;182;232",
  codeString: "38;2;198;167;216",
  codeNumber: "38;2;216;181;106",
  codeComment: "2",
};

const MONOCHROME_STYLES: Readonly<Record<TerminalRole, string>> = {
  brand: "1",
  heading: "1",
  label: "1",
  value: "0",
  command: "4",
  model: "1",
  identifier: "2",
  count: "1",
  duration: "1",
  info: "1",
  pending: "2",
  separator: "2",
  user: "1",
  focus: "1",
  selection: "7",
  agent: "0",
  success: "38;2;120;201;155",
  attention: "38;2;212;169;79",
  danger: "38;2;223;114;114",
  contextHealthy: "38;2;120;201;155",
  contextWarning: "38;2;212;169;79",
  contextCompact: "38;2;224;143;77",
  contextCritical: "38;2;223;114;114",
  muted: "2",
  metadata: "2;3",
  diffAdded: "7;38;2;120;201;155",
  diffRemoved: "7;38;2;223;114;114",
  helpHeading: "1;7",
  userMessage: "38;5;238;48;5;255",
  diffHunk: "2;3",
  path: "4",
  inlineCode: "0",
  codePlain: "0",
  codeKeyword: "1",
  codeString: "0",
  codeNumber: "1",
  codeComment: "2",
};

export const TERMINAL_THEMES: readonly TerminalThemeDefinition[] = [
  {
    id: "quiet-studio",
    label: "Quiet Studio",
    description: "Warm mist, studio blue, and restrained semantic color.",
    styles: QUIET_STUDIO_STYLES,
    contextGradient: [
      [120, 201, 155],
      [212, 169, 79],
      [224, 143, 77],
      [223, 114, 114],
    ],
  },
  {
    id: "monochrome",
    label: "Monochrome",
    description: "Terminal-native text with semantic state color.",
    styles: MONOCHROME_STYLES,
    contextGradient: [
      [120, 201, 155],
      [212, 169, 79],
      [224, 143, 77],
      [223, 114, 114],
    ],
  },
] as const;

const THEME_BY_ID = new Map(
  TERMINAL_THEMES.map((theme) => [theme.id, theme] as const),
);

const TERMINAL_CONTROL = /[\u001b\u0080-\u009f]/u;

export function isTerminalThemeId(value: unknown): value is TerminalThemeId {
  return typeof value === "string" && THEME_BY_ID.has(value as TerminalThemeId);
}

export function terminalThemeDefinition(
  themeId: TerminalThemeId,
): TerminalThemeDefinition {
  return THEME_BY_ID.get(themeId) ?? TERMINAL_THEMES[0];
}

function decorate(enabled: boolean, code: string, value: string): string {
  if (!enabled || !value) return value;
  if (TERMINAL_CONTROL.test(value)) {
    throw new Error("Terminal theme values must not contain terminal controls");
  }
  if (code === "0") return value;
  return `${ANSI}${code}m${value}${RESET}`;
}

function decorateRow(enabled: boolean, code: string, value: string): string {
  if (!enabled || !value) return value;
  if (TERMINAL_CONTROL.test(value)) {
    throw new Error("Terminal theme values must not contain terminal controls");
  }
  if (code === "0") return value;
  return `${ANSI}${code}m${value}${ERASE_TO_END}${RESET}`;
}

function decorateRenderedRow(
  enabled: boolean,
  code: string,
  value: string,
): string {
  if (!enabled) return value;
  const plain = value.replace(/\u001b\[[0-9;]*m/gu, "");
  if (TERMINAL_CONTROL.test(plain)) {
    throw new Error(
      "Rendered terminal rows may contain only SGR styling controls",
    );
  }
  const rowStyle = `${ANSI}${code}m`;
  return `${rowStyle}${value.replace(/\u001b\[0m/gu, `${RESET}${rowStyle}`)}${ERASE_TO_END}${RESET}`;
}

function contextGradientCode(
  definition: TerminalThemeDefinition,
  progress: number,
): string {
  const bounded = Math.min(1, Math.max(0, progress));
  const scaled = bounded * (definition.contextGradient.length - 1);
  const startIndex = Math.min(
    definition.contextGradient.length - 2,
    Math.floor(scaled),
  );
  const fraction = scaled - startIndex;
  const start = definition.contextGradient[startIndex];
  const end = definition.contextGradient[startIndex + 1];
  const channel = (index: number): number =>
    Math.round(start[index]! + (end[index]! - start[index]!) * fraction);
  return `38;2;${channel(0)};${channel(1)};${channel(2)}`;
}

export function createTerminalTheme(
  enabled: boolean,
  themeId: TerminalThemeId = DEFAULT_TERMINAL_THEME_ID,
): TerminalTheme {
  const definition = terminalThemeDefinition(themeId);
  return {
    id: definition.id,
    enabled,
    paint: (role, value) => decorate(enabled, definition.styles[role], value),
    paintContextUsage: (progress, value) =>
      decorate(enabled, contextGradientCode(definition, progress), value),
    paintRow: (role, value) =>
      decorateRow(enabled, definition.styles[role], value),
    paintRenderedRow: (role, value) =>
      decorateRenderedRow(enabled, definition.styles[role], value),
    strong: (value) => decorate(enabled, "1", value),
  };
}

export function resolveTerminalColor(options: {
  isTTY: boolean;
  requested?: boolean;
  env?: NodeJS.ProcessEnv;
}): boolean {
  const environment = options.env ?? process.env;
  return (
    options.isTTY &&
    options.requested !== false &&
    !Object.prototype.hasOwnProperty.call(environment, "NO_COLOR")
  );
}

export function terminalThemeRequested(
  argv: string[],
): TerminalThemeId | undefined {
  let requested: TerminalThemeId | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--") return requested;
    if (argument !== "--theme") continue;
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error("--theme requires a value");
    }
    if (!isTerminalThemeId(value)) {
      throw new Error(
        `Unsupported terminal theme: ${value}. Valid themes: ${TERMINAL_THEME_IDS.join(", ")}`,
      );
    }
    requested = value;
    index += 1;
  }
  return requested;
}

export function terminalScreenModeRequested(
  argv: string[],
): TerminalScreenMode | undefined {
  let requested: TerminalScreenMode | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--") return requested;
    if (argument !== "--screen") continue;
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error("--screen requires a value");
    }
    if (!TERMINAL_SCREEN_MODES.includes(value as TerminalScreenMode)) {
      throw new Error(
        `Unsupported terminal screen mode: ${value}. Valid modes: ${TERMINAL_SCREEN_MODES.join(", ")}`,
      );
    }
    requested = value as TerminalScreenMode;
    index += 1;
  }
  return requested;
}

export function terminalColorRequested(argv: string[]): boolean {
  for (const argument of argv) {
    if (argument === "--") return true;
    if (argument === "--plain" || argument === "--no-color") return false;
  }
  return true;
}

export function terminalMotionRequested(argv: string[]): boolean {
  for (const argument of argv) {
    if (argument === "--") return true;
    if (argument === "--plain") return false;
  }
  return true;
}

export function resolveTerminalAppearance(options: {
  isTTY: boolean;
  saved: TerminalAppearance;
  argv: string[];
  env?: NodeJS.ProcessEnv;
}): TerminalAppearanceResolution {
  const environment = options.env ?? process.env;
  const argumentsBeforeTerminator = options.argv.slice(
    0,
    options.argv.indexOf("--") >= 0
      ? options.argv.indexOf("--")
      : options.argv.length,
  );
  const requestedTheme = terminalThemeRequested(options.argv);
  const requestedScreenMode = terminalScreenModeRequested(options.argv);
  const plain = argumentsBeforeTerminator.includes("--plain");
  const noColorFlag = argumentsBeforeTerminator.includes("--no-color");
  const noColorEnvironment = Object.prototype.hasOwnProperty.call(
    environment,
    "NO_COLOR",
  );
  const colorOverride = !options.isTTY
    ? "non-tty"
    : noColorEnvironment
      ? "NO_COLOR"
      : plain
        ? "--plain"
        : noColorFlag
          ? "--no-color"
          : undefined;
  const motionOverride = !options.isTTY
    ? "non-tty"
    : plain
      ? "--plain"
      : undefined;
  const richTextOverride = !options.isTTY
    ? "non-tty"
    : plain
      ? "--plain"
      : undefined;
  if (plain && requestedScreenMode === "fullscreen") {
    throw new Error("--plain cannot be combined with --screen fullscreen");
  }
  const savedScreenMode = options.saved.screenMode ?? "auto";
  const selectedScreenMode = requestedScreenMode ?? savedScreenMode;
  const dumbTerminal = environment.TERM === "dumb";
  const orcaTerminal =
    environment.TERM_PROGRAM?.toLocaleLowerCase() === "orca";
  const screenMode: EffectiveTerminalScreenMode =
    !options.isTTY || plain || dumbTerminal
      ? "inline"
      : selectedScreenMode === "inline"
        ? "inline"
        : selectedScreenMode === "fullscreen"
          ? "fullscreen"
          : orcaTerminal
            ? "inline"
            : "fullscreen";
  const screenOverride = !options.isTTY
    ? "non-tty"
    : plain
      ? "--plain"
      : dumbTerminal
        ? "TERM=dumb"
        : requestedScreenMode
          ? "--screen"
          : selectedScreenMode === "auto" && orcaTerminal
            ? "TERM_PROGRAM=Orca"
          : selectedScreenMode === "auto"
            ? "auto"
            : undefined;
  return {
    color: options.saved.color && colorOverride === undefined,
    motion: options.saved.motion && motionOverride === undefined,
    richText:
      options.saved.richText !== false && richTextOverride === undefined,
    themeId:
      requestedTheme ??
      options.saved.themeId ??
      DEFAULT_TERMINAL_THEME_ID,
    screenMode,
    ...(requestedTheme ? { themeOverride: "--theme" as const } : {}),
    ...(colorOverride ? { colorOverride } : {}),
    ...(motionOverride ? { motionOverride } : {}),
    ...(richTextOverride ? { richTextOverride } : {}),
    ...(screenOverride ? { screenOverride } : {}),
  };
}
