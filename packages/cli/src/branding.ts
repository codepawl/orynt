export const OPENPAWL_LOGO = "[>.-]";
export const OPENPAWL_COMPACT_LOGO = ">.-";
export const OPENPAWL_NAME = "Openpawl";
export const OPENPAWL_TAGLINE = "codepawl/core server-side coding-agent workflow";

export const OPENPAWL_LOGO_BADGE = ` ${OPENPAWL_LOGO} `;

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const LOGO_FOREGROUND = "\x1b[38;5;16m";
const LOGO_BACKGROUND = "\x1b[48;5;80m";
const COMPACT_FOREGROUND = "\x1b[38;5;80m";

export const OPENPAWL_LOGO_STYLE = `${BOLD}${LOGO_FOREGROUND}${LOGO_BACKGROUND}`;
export const OPENPAWL_COMPACT_STYLE = `${BOLD}${COMPACT_FOREGROUND}`;

function shouldUseColor(): boolean {
  if (process.env["OPENPAWL_COLOR"] === "1") return true;
  if (process.env["OPENPAWL_COLOR"] === "0") return false;
  if (process.env["NO_COLOR"]) return false;
  return process.stdout.isTTY === true && process.env["TERM"] !== "dumb";
}

function colorize(value: string, style: string): string {
  return shouldUseColor() ? `${style}${value}${RESET}` : value;
}

export function renderLogo(): string {
  return shouldUseColor() ? colorize(OPENPAWL_LOGO_BADGE, OPENPAWL_LOGO_STYLE) : OPENPAWL_LOGO;
}

export function renderCompactLogo(): string {
  return colorize(OPENPAWL_COMPACT_LOGO, OPENPAWL_COMPACT_STYLE);
}

export function renderBanner(): string {
  return `
  ${renderLogo()} ${OPENPAWL_NAME}
        ${OPENPAWL_TAGLINE}
`;
}
