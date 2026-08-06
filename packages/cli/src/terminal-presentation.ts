import {
  createTerminalTheme,
  type TerminalAppearance,
  type TerminalRole,
  type TerminalTheme,
} from "./terminal-theme.js";

const TERMINAL_CONTROL = /[\u001b\u0080-\u009f]/u;
const TERMINAL_LAYOUT_ANSI = /\u001b\[[0-?]*[ -/]*[@-~]/gu;
const STRUCTURED_HEADING =
  /^(?:ORYNT|Settings|Intelligence|Operator plan|Working state|Evidence|Verification|Cost|Pending|Models|Orchestration profile|Diff|Provider usage|Orynt doctor|Sessions|Agent|Appearance|Shortcuts|Statusline|Activity)\b/u;
const INLINE_TOKEN =
  /(\/[a-z][a-z0-9-]*(?:\s+[a-z0-9_-]+)?|gpt-[a-z0-9.-]+|(?:\.{0,2}\/)?(?:packages|apps|docs|scripts|assets)\/[A-Za-z0-9._/@+-]+|(?:[A-Za-z0-9._-]+\/){2,}[A-Za-z0-9._/@+-]+|(?<![A-Za-z0-9_-])\d+(?:,\d{3})*(?:\.\d+)?(?:\s?(?:%|ms|s|m|h|d|KiB|MiB|GiB|tokens?|files?|artifacts?|messages?|images?|sessions?|turns?|stages?|results?|namespaces?|tools?|characters?))?(?![A-Za-z0-9_-])|\b(?:ready|verified|passed|pass|success|completed|enabled|active)\b|\b(?:pending|waiting|warning|approval|required|degraded|paused)\b|\b(?:failed|fail|error|blocked|cancelled|stopped|unavailable|denied)\b)/giu;
const activitySegmenter = new Intl.Segmenter(undefined, {
  granularity: "grapheme",
});
const layoutSegmenter = new Intl.Segmenter(undefined, {
  granularity: "grapheme",
});

function layoutCodePointWidth(character: string): number {
  const codePoint = character.codePointAt(0) ?? 0;
  if (
    codePoint === 0 ||
    codePoint < 0x20 ||
    (codePoint >= 0x7f && codePoint < 0xa0) ||
    /^\p{Mark}$/u.test(character) ||
    /^\p{Emoji_Modifier}$/u.test(character) ||
    codePoint === 0x200d ||
    (codePoint >= 0xfe00 && codePoint <= 0xfe0f)
  ) {
    return 0;
  }
  return (
      codePoint >= 0x1100 &&
      (
        codePoint <= 0x115f ||
        codePoint === 0x2329 ||
        codePoint === 0x232a ||
        (codePoint >= 0x2e80 && codePoint <= 0xa4cf) ||
        (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
        (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
        (codePoint >= 0xfe10 && codePoint <= 0xfe6f) ||
        (codePoint >= 0xff00 && codePoint <= 0xff60) ||
        (codePoint >= 0x1f300 && codePoint <= 0x1faff) ||
        (codePoint >= 0x20000 && codePoint <= 0x3fffd)
      )
    )
    ? 2
    : 1;
}

function layoutGraphemeWidth(value: string): number {
  if (/\p{Extended_Pictographic}/u.test(value)) return 2;
  if (/^\p{Regional_Indicator}{2}$/u.test(value)) return 2;
  return Array.from(value).reduce(
    (width, character) => width + layoutCodePointWidth(character),
    0,
  );
}

export function terminalTextWidth(value: string): number {
  let width = 0;
  const visible = value.replace(TERMINAL_LAYOUT_ANSI, "");
  for (const segment of layoutSegmenter.segment(visible)) {
    width += layoutGraphemeWidth(segment.segment);
  }
  return width;
}

function splitLayoutToken(value: string, width: number): string[] {
  const available = Math.max(1, width);
  const chunks: string[] = [];
  let current = "";
  let currentWidth = 0;
  for (const segment of layoutSegmenter.segment(value)) {
    const nextWidth = layoutGraphemeWidth(segment.segment);
    if (current && currentWidth + nextWidth > available) {
      chunks.push(current);
      current = "";
      currentWidth = 0;
    }
    current += segment.segment;
    currentWidth += nextWidth;
  }
  if (current || chunks.length === 0) chunks.push(current);
  return chunks;
}

export type TerminalWrapOptions = {
  firstIndent?: string;
  continuationIndent?: string;
};

function normalizedTerminalWidth(
  value: number | undefined,
  minimum = 1,
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value <= 0
  ) {
    return Math.max(minimum, 88);
  }
  return Math.max(minimum, Math.floor(value));
}

/**
 * Wraps plain, terminal-safe product text before semantic ANSI styling.
 */
export function wrapTerminalParagraph(
  value: string,
  width: number | undefined,
  options: TerminalWrapOptions = {},
): string[] {
  const targetWidth = normalizedTerminalWidth(width);
  const firstIndent = options.firstIndent ?? "";
  const continuationIndent = options.continuationIndent ?? firstIndent;
  const tokens = Array.from(
    value.trim().matchAll(/(\S+)(\s*)/gu),
    (match) => ({
      word: match[1] ?? "",
      trailing: match[2] ?? "",
    }),
  );
  if (tokens.length === 0) return [""];

  const lines: string[] = [];
  let indent = firstIndent;
  let available = Math.max(1, targetWidth - terminalTextWidth(indent));
  let current = "";
  let currentWidth = 0;
  let separator = "";

  const flush = (): void => {
    if (!current) return;
    lines.push(`${indent}${current}`);
    indent = continuationIndent;
    available = Math.max(1, targetWidth - terminalTextWidth(indent));
    current = "";
    currentWidth = 0;
  };

  for (const token of tokens) {
    const word = token.word;
    const wordWidth = terminalTextWidth(word);
    const separatorWidth = terminalTextWidth(separator);
    if (
      current &&
      currentWidth + separatorWidth + wordWidth <= available
    ) {
      current = `${current}${separator}${word}`;
      currentWidth += separatorWidth + wordWidth;
      separator = token.trailing || " ";
      continue;
    }
    if (current) flush();
    if (wordWidth <= available) {
      current = word;
      currentWidth = wordWidth;
      separator = token.trailing || " ";
      continue;
    }
    const chunks = splitLayoutToken(word, available);
    for (const [index, chunk] of chunks.entries()) {
      if (index === chunks.length - 1) {
        current = chunk;
        currentWidth = terminalTextWidth(chunk);
      } else {
        lines.push(`${indent}${chunk}`);
        indent = continuationIndent;
        available = Math.max(
          1,
          targetWidth - terminalTextWidth(indent),
        );
      }
    }
    separator = token.trailing || " ";
  }
  flush();
  return lines;
}

export type TerminalDetailRow = {
  label: string;
  value: string;
};

export function renderTerminalDetailRows(
  rows: readonly TerminalDetailRow[],
  options: { width: number | undefined; indent?: string },
): string[] {
  if (rows.length === 0) return [];
  const width = normalizedTerminalWidth(options.width, 20);
  const indent = options.indent ?? "  ";
  const labelWidth = Math.min(
    14,
    Math.max(...rows.map(({ label }) => terminalTextWidth(label))),
  );
  const wide = width >= 56;
  return rows.flatMap((row, index) => {
    const last = index === rows.length - 1;
    const prefix = `${indent}${last ? "└─" : "├─"} `;
    const stem = `${indent}${last ? "  " : "│ "} `;
    const label = row.label.trim();
    const value = row.value.trim();
    const valueRoom =
      width -
      terminalTextWidth(prefix) -
      labelWidth -
      2;
    if (
      wide &&
      terminalTextWidth(label) <= labelWidth &&
      valueRoom >= 24
    ) {
      const padding = " ".repeat(
        Math.max(0, labelWidth - terminalTextWidth(label)),
      );
      return wrapTerminalParagraph(value, width, {
        firstIndent: `${prefix}${label}${padding}  `,
        continuationIndent: `${stem}${" ".repeat(labelWidth + 2)}`,
      });
    }
    return [
      `${prefix}${label}`,
      ...wrapTerminalParagraph(value, width, {
        firstIndent: `${stem}  `,
        continuationIndent: `${stem}  `,
      }),
    ];
  });
}

export type TerminalSemanticSpan = {
  role: TerminalRole;
  text: string;
};

declare const TERMINAL_OUTPUT: unique symbol;
export type TerminalOutput = string & {
  readonly [TERMINAL_OUTPUT]: true;
};

export class TerminalDesignSystem {
  private currentTheme: TerminalTheme;

  constructor(appearance: Pick<TerminalAppearance, "color" | "themeId">) {
    this.currentTheme = createTerminalTheme(
      appearance.color,
      appearance.themeId,
    );
  }

  get theme(): TerminalTheme {
    return this.currentTheme;
  }

  update(appearance: Pick<TerminalAppearance, "color" | "themeId">): void {
    this.currentTheme = createTerminalTheme(
      appearance.color,
      appearance.themeId,
    );
  }

  span(role: TerminalRole, text: string): string {
    return this.currentTheme.paint(role, text);
  }

  line(...spans: TerminalSemanticSpan[]): string {
    return spans.map(({ role, text }) => this.span(role, text)).join("");
  }

  heading(text: string): string {
    return this.span("heading", text);
  }

  keyValue(label: string, value: string, valueRole: TerminalRole = "value"): string {
    return `${this.span("label", label)}  ${this.span(valueRole, value)}`;
  }

  notice(
    status: "info" | "pending" | "success" | "attention" | "danger",
    label: string,
    detail?: string,
  ): string {
    return detail
      ? `${this.span(status, label)} ${this.span("separator", "·")} ${this.renderInline(detail)}`
      : this.span(status, label);
  }

  activityLabel(
    label: string,
    shimmerFrame?: number,
    shimmerWidth = 3,
  ): string {
    if (!label) return "";
    if (
      !this.currentTheme.enabled ||
      shimmerFrame === undefined ||
      shimmerWidth <= 0
    ) {
      return this.span("agent", label);
    }
    const graphemes = Array.from(
      activitySegmenter.segment(label),
      ({ segment }) => segment,
    );
    const windowWidth = Math.min(shimmerWidth, graphemes.length);
    const maximumStart = Math.max(0, graphemes.length - windowWidth);
    const cycleLength = Math.max(1, maximumStart * 2);
    const phase = Math.abs(Math.floor(shimmerFrame)) % cycleLength;
    const start = phase <= maximumStart
      ? phase
      : cycleLength - phase;
    return [
      this.span("agent", graphemes.slice(0, start).join("")),
      this.span("focus", graphemes.slice(start, start + windowWidth).join("")),
      this.span("agent", graphemes.slice(start + windowWidth).join("")),
    ].join("");
  }

  /**
   * Styles only product-owned structure and known technical tokens. Arbitrary
   * prose remains terminal-default text, and already-rendered ANSI is never
   * parsed or nested.
   */
  renderProductText(value: string): TerminalOutput {
    if (!this.currentTheme.enabled || !value || TERMINAL_CONTROL.test(value)) {
      return value as TerminalOutput;
    }
    const lines = value.split("\n");
    const structuredTree = lines.some((line) => /^\s*[├└]─\s+/u.test(line));
    let firstContentLine = true;
    return lines.map((line) => {
      if (!line) return line;
      const tree = line.match(/^(\s*[├└]─\s*)(.*)$/u);
      if (tree) {
        return `${this.span("separator", tree[1] ?? "")}${this.renderStructuredLine(tree[2] ?? "", false)}`;
      }
      const rendered = this.renderStructuredLine(
        line,
        firstContentLine,
        structuredTree,
      );
      firstContentLine = false;
      return rendered;
    }).join("\n") as TerminalOutput;
  }

  private renderStructuredLine(
    line: string,
    firstContentLine: boolean,
    structuredTree = false,
  ): string {
    if (
      firstContentLine &&
      (structuredTree || STRUCTURED_HEADING.test(line))
    ) {
      const separator = line.indexOf(" · ");
      if (separator >= 0) {
        return `${this.heading(line.slice(0, separator))}${this.span("separator", " · ")}${this.renderInline(line.slice(separator + 3))}`;
      }
      const colon = line.indexOf(": ");
      if (colon >= 0) {
        return `${this.heading(line.slice(0, colon))}${this.span("separator", ": ")}${this.renderInline(line.slice(colon + 2))}`;
      }
      return this.heading(line);
    }
    const keyValue = line.match(/^(\s*)([A-Z][A-Za-z ]{1,24})(\s{2,})(.+)$/u);
    if (keyValue) {
      return `${keyValue[1] ?? ""}${this.span("label", keyValue[2] ?? "")}${this.span("separator", keyValue[3] ?? "")}${this.renderInline(keyValue[4] ?? "")}`;
    }
    return this.renderInline(line);
  }

  private renderInline(value: string): string {
    let output = "";
    let offset = 0;
    for (const match of value.matchAll(INLINE_TOKEN)) {
      const index = match.index ?? 0;
      const token = match[0];
      output += value.slice(offset, index);
      output += this.span(this.inlineRole(token), token);
      offset = index + token.length;
    }
    return output + value.slice(offset);
  }

  private inlineRole(token: string): TerminalRole {
    const normalized = token.toLowerCase();
    if (normalized.startsWith("/")) return "command";
    if (normalized.startsWith("gpt-")) return "model";
    if (/[\\/]/u.test(token)) return "path";
    if (/^\d/u.test(token)) {
      return /(?:ms|s|m|h|d)$/iu.test(token) ? "duration" : "count";
    }
    if (/^(?:ready|verified|passed|pass|success|completed|enabled|active)$/u.test(normalized)) {
      return "success";
    }
    if (/^(?:pending|waiting|warning|approval|required|degraded|paused)$/u.test(normalized)) {
      return "pending";
    }
    if (/^(?:failed|fail|error|blocked|cancelled|stopped|unavailable|denied)$/u.test(normalized)) {
      return "danger";
    }
    return "value";
  }
}

export function createTerminalDesignSystem(
  color: boolean,
  themeId?: TerminalAppearance["themeId"],
): TerminalDesignSystem {
  return new TerminalDesignSystem({ color, themeId });
}
