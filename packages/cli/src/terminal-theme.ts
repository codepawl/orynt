const ANSI = "\u001b[";
const RESET = `${ANSI}0m`;

export type TerminalRole =
  | "focus"
  | "success"
  | "attention"
  | "danger"
  | "muted";

export type TerminalTheme = {
  enabled: boolean;
  paint: (role: TerminalRole, value: string) => string;
  strong: (value: string) => string;
};

const ROLE_CODES: Record<TerminalRole, string> = {
  focus: "38;2;143;182;232",
  success: "38;2;120;201;155",
  attention: "38;2;212;169;79",
  danger: "38;2;223;114;114",
  muted: "2",
};

function decorate(enabled: boolean, code: string, value: string): string {
  if (!enabled || !value) return value;
  if (/[\u001b\u0080-\u009f]/u.test(value)) {
    throw new Error("Terminal theme values must not contain terminal controls");
  }
  return `${ANSI}${code}m${value}${RESET}`;
}

export function createTerminalTheme(enabled: boolean): TerminalTheme {
  return {
    enabled,
    paint: (role, value) => decorate(enabled, ROLE_CODES[role], value),
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
