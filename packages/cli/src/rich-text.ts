import { common, createLowlight } from "lowlight";
import { marked, type Token, type Tokens } from "marked";

import {
  terminalTextWidth,
} from "./terminal-presentation.js";
import { wrapTerminalText } from "./terminal-screen.js";
import type {
  TerminalRole,
  TerminalTheme,
} from "./terminal-theme.js";

const ANSI = "\u001b[";
const RESET = `${ANSI}0m`;
const MAX_CODE_BLOCK_LENGTH = 8_000;
const highlighter = createLowlight(common);

type AstNode = {
  type: string;
  value?: string;
  properties?: { className?: unknown };
  children?: AstNode[];
};

export type RichTextOptions = {
  enabled: boolean;
  theme: TerminalTheme;
  preserveMarkers?: boolean;
  width?: number;
  continuationIndent?: string;
};

function safeText(value: string): string {
  return value
    .replace(/\u001b/gu, "")
    .replace(/[\u0080-\u009f]/gu, "");
}

function isPathToken(value: string): boolean {
  if (/^https?:\/\//iu.test(value)) return false;
  const suffix = value.match(/[.,;!?]+$/u)?.[0] ?? "";
  const candidate = suffix ? value.slice(0, -suffix.length) : value;
  const withoutLocation = candidate.replace(/:\d+(?::\d+)?$/u, "");
  return (
    /^(?:\.{1,2}\/|\/)[^\s]+$/u.test(withoutLocation) ||
    /^(?:[\w@.-]+\/)+[\w@.+-]+$/u.test(withoutLocation)
  );
}

function renderPlainText(value: string, options: RichTextOptions): string {
  return safeText(value).split(/(\s+)/u).map((part) =>
    isPathToken(part)
      ? options.theme.enabled
        ? options.theme.paint("path", part)
        : styled(part, ["4"])
      : part
  ).join("");
}

function styled(value: string, codes: string[]): string {
  return value && codes.length > 0
    ? `${ANSI}${codes.join(";")}m${value}${RESET}`
    : value;
}

function syntaxRole(classNames: string[]): {
  role: TerminalRole;
} {
  const names = new Set(classNames.map((name) => name.replace(/^hljs-/u, "")));
  if (
    ["keyword", "type", "meta", "selector-tag", "tag", "doctag"].some(
      (name) => names.has(name),
    )
  ) {
    return { role: "codeKeyword" };
  }
  if (
    ["string", "attr", "attribute", "regexp", "template-tag"].some(
      (name) => names.has(name),
    )
  ) {
    return { role: "codeString" };
  }
  if (
    ["number", "literal", "built_in", "bullet", "symbol"].some(
      (name) => names.has(name),
    )
  ) {
    return { role: "codeNumber" };
  }
  if (["comment", "quote"].some((name) => names.has(name))) {
    return { role: "codeComment" };
  }
  return { role: "codePlain" };
}

function renderAst(
  node: AstNode,
  theme: TerminalTheme,
  inherited?: ReturnType<typeof syntaxRole>,
): string {
  if (node.type === "text") {
    return theme.paint(inherited?.role ?? "codePlain", safeText(node.value ?? ""));
  }
  let role = inherited;
  if (node.type === "element") {
    const className = node.properties?.className;
    const classes = Array.isArray(className)
      ? className.filter((item): item is string => typeof item === "string")
      : [];
    role = syntaxRole(classes);
  }
  return (node.children ?? [])
    .map((child) => renderAst(child, theme, role))
    .join("");
}

function highlightCode(
  source: string,
  language: string,
  theme: TerminalTheme,
): string {
  const bounded = safeText(source.slice(0, MAX_CODE_BLOCK_LENGTH));
  if (!theme.enabled) return bounded;
  try {
    const normalized = language.trim().toLowerCase();
    const tree = normalized
      ? highlighter.registered(normalized)
        ? highlighter.highlight(normalized, bounded)
        : undefined
      : highlighter.highlightAuto(bounded);
    if (!tree || (!normalized && (tree.data?.relevance ?? 0) < 3)) {
      return theme.paint("codePlain", bounded);
    }
    return renderAst(tree as AstNode, theme);
  } catch {
    return theme.paint("codePlain", bounded);
  }
}

function inlineTokens(
  tokens: readonly Token[] | undefined,
  options: RichTextOptions,
): string {
  return (tokens ?? []).map((token) => inlineToken(token, options)).join("");
}

function inlineToken(token: Token, options: RichTextOptions): string {
  switch (token.type) {
    case "text":
      return token.tokens
        ? inlineTokens(token.tokens, options)
        : renderPlainText(token.text, options);
    case "escape":
      return safeText(token.text);
    case "strong": {
      const content = inlineTokens(token.tokens, options);
      return options.preserveMarkers
        ? `${styled("**", ["2"])}${styled(content, ["1"])}${styled("**", ["2"])}`
        : styled(content, ["1"]);
    }
    case "em": {
      const content = inlineTokens(token.tokens, options);
      return options.preserveMarkers
        ? `${styled("*", ["2"])}${styled(content, ["3"])}${styled("*", ["2"])}`
        : styled(content, ["3"]);
    }
    case "del": {
      const content = inlineTokens(token.tokens, options);
      return options.preserveMarkers
        ? `${styled("~~", ["2"])}${styled(content, ["9"])}${styled("~~", ["2"])}`
        : styled(content, ["9"]);
    }
    case "codespan": {
      const content = options.theme.paint("inlineCode", safeText(token.text));
      return options.preserveMarkers
        ? `${styled("`", ["2"])}${content}${styled("`", ["2"])}`
        : content;
    }
    case "link": {
      const label = inlineTokens(token.tokens, options) || safeText(token.text);
      const href = safeText(token.href);
      return label === href ? href : `${label} (${href})`;
    }
    case "image": {
      const label = safeText(token.text).trim() || "image";
      return `Image: ${label} (${safeText(token.href)})`;
    }
    case "br":
      return "\n";
    case "html":
      return safeText(token.text);
    default:
      return "tokens" in token && Array.isArray(token.tokens)
        ? inlineTokens(token.tokens, options)
        : safeText("text" in token && typeof token.text === "string"
          ? token.text
          : token.raw);
  }
}

function alignCell(
  value: string,
  width: number,
  alignment: "center" | "left" | "right" | null,
): string {
  const padding = Math.max(0, width - terminalTextWidth(value));
  if (alignment === "right") return `${" ".repeat(padding)}${value}`;
  if (alignment === "center") {
    const left = Math.floor(padding / 2);
    return `${" ".repeat(left)}${value}${" ".repeat(padding - left)}`;
  }
  return `${value}${" ".repeat(padding)}`;
}

function columnWidths(
  table: Tokens.Table,
  availableWidth: number,
  options: RichTextOptions,
): number[] | undefined {
  const count = table.header.length;
  if (count === 0) return [];
  if (availableWidth < 44) return undefined;
  const contentRoom = availableWidth - (count * 3 + 1);
  const minimum = 3;
  if (contentRoom < count * minimum) return undefined;
  const desired = table.header.map((cell, index) =>
    Math.max(
      minimum,
      ...[cell, ...table.rows.map((row) => row[index])]
        .filter((item): item is Tokens.TableCell => Boolean(item))
        .map((item) =>
          Math.min(
            32,
            Math.max(
              ...inlineTokens(item.tokens, options)
                .split("\n")
                .map(terminalTextWidth),
            ),
          )
        ),
    )
  );
  const widths = desired.map(() => minimum);
  let remaining = contentRoom - count * minimum;
  while (remaining > 0 && widths.some((width, index) => width < desired[index]!)) {
    for (let index = 0; index < widths.length && remaining > 0; index += 1) {
      if (widths[index]! >= desired[index]!) continue;
      widths[index] = widths[index]! + 1;
      remaining -= 1;
    }
  }
  return widths;
}

function renderWideTable(
  table: Tokens.Table,
  widths: number[],
  options: RichTextOptions,
): string {
  const border = (
    left: string,
    joint: string,
    right: string,
  ) => `${left}${widths.map((width) => "─".repeat(width + 2)).join(joint)}${right}`;
  const renderRow = (
    cells: Tokens.TableCell[],
    header: boolean,
  ): string[] => {
    const wrapped = widths.map((width, index) => {
      const cell = cells[index];
      const rendered = cell ? inlineTokens(cell.tokens, options) : "";
      return wrapTerminalText(rendered, width);
    });
    const height = Math.max(1, ...wrapped.map((lines) => lines.length));
    return Array.from({ length: height }, (_, lineIndex) => {
      const values = widths.map((width, index) => {
        const cell = cells[index];
        const value = wrapped[index]?.[lineIndex] ?? "";
        const aligned = alignCell(value, width, cell?.align ?? null);
        return header ? styled(aligned, ["1"]) : aligned;
      });
      return `│ ${values.join(" │ ")} │`;
    });
  };
  return [
    border("┌", "┬", "┐"),
    ...renderRow(table.header, true),
    border("├", "┼", "┤"),
    ...table.rows.flatMap((row, index) => [
      ...renderRow(row, false),
      ...(index === table.rows.length - 1
        ? []
        : [border("├", "┼", "┤")]),
    ]),
    border("└", "┴", "┘"),
  ].join("\n");
}

function renderStackedTable(
  table: Tokens.Table,
  options: RichTextOptions,
): string {
  const headers = table.header.map((cell, index) =>
    inlineTokens(cell.tokens, options).trim() || `Column ${index + 1}`
  );
  if (table.rows.length === 0) {
    return headers.map((header) => options.theme.paint("heading", header)).join("\n");
  }
  return table.rows.map((row, rowIndex) => [
    options.theme.paint("heading", `Row ${rowIndex + 1}`),
    ...headers.map((header, columnIndex) =>
      `  ${options.theme.paint("label", header)}: ${
        inlineTokens(row[columnIndex]?.tokens, options)
      }`
    ),
  ].join("\n")).join("\n\n");
}

function renderTable(
  table: Tokens.Table,
  options: RichTextOptions,
): string {
  const width = Math.max(20, Math.floor(options.width ?? 88));
  const widths = columnWidths(table, width, options);
  return widths
    ? renderWideTable(table, widths, options)
    : renderStackedTable(table, options);
}

function indentBlock(value: string, prefix: string, continuation = prefix): string {
  return value.split("\n")
    .map((line, index) => `${index === 0 ? prefix : continuation}${line}`)
    .join("\n");
}

function renderList(
  token: Tokens.List,
  options: RichTextOptions,
  depth: number,
): string {
  const start = typeof token.start === "number" ? token.start : 1;
  return token.items.map((item, index) => {
    const marker = item.task
      ? item.checked ? "☑" : "☐"
      : token.ordered ? `${start + index}.` : "•";
    const body = renderBlocks(
      item.tokens.filter((child) => child.type !== "checkbox"),
      options,
      depth + 1,
    ).trim();
    const indent = "  ".repeat(depth);
    const prefix = `${indent}${marker} `;
    return indentBlock(
      body,
      prefix,
      `${indent}${" ".repeat(terminalTextWidth(marker) + 1)}`,
    );
  }).join("\n");
}

function renderBlock(
  token: Token,
  options: RichTextOptions,
  depth: number,
): string {
  switch (token.type) {
    case "space":
    case "def":
      return "";
    case "heading": {
      const content = inlineTokens(token.tokens, options);
      return options.theme.paint("heading", content);
    }
    case "paragraph":
      return inlineTokens(token.tokens, options);
    case "text":
      return token.tokens
        ? inlineTokens(token.tokens, options)
        : safeText(token.text);
    case "blockquote": {
      const content = renderBlocks(token.tokens ?? [], options, depth).trim();
      return content.split("\n")
        .map((line) =>
          `${options.theme.paint("muted", "│")} ${line}`
        )
        .join("\n");
    }
    case "list":
      return renderList(token as Tokens.List, options, depth);
    case "hr": {
      const width = Math.max(3, Math.min(72, Math.floor(options.width ?? 88)));
      return options.theme.paint("separator", "─".repeat(width));
    }
    case "code":
      return highlightCode(token.text, token.lang ?? "", options.theme);
    case "table":
      return renderTable(token as Tokens.Table, options);
    case "html":
      return safeText(token.text);
    default:
      return inlineToken(token, options);
  }
}

function renderBlocks(
  tokens: readonly Token[],
  options: RichTextOptions,
  depth = 0,
): string {
  const blocks = tokens
    .map((token) => renderBlock(token, options, depth))
    .filter((value) => value.length > 0);
  return blocks.join("\n\n");
}

export function renderRichText(
  value: string,
  options: RichTextOptions,
): string {
  const indentContinuation = (rendered: string) =>
    options.continuationIndent
      ? rendered.replace(/\n/gu, `\n${options.continuationIndent}`)
      : rendered;
  if (!options.enabled) return indentContinuation(value);
  try {
    return indentContinuation(
      renderBlocks(marked.lexer(value, {
        gfm: true,
        breaks: false,
      }), options),
    );
  } catch {
    return indentContinuation(safeText(value));
  }
}

export class IncrementalRichTextRenderer {
  private source = "";

  constructor(private options: RichTextOptions) {}

  setOptions(options: RichTextOptions): void {
    this.options = options;
  }

  update(nextSource: string): { output: string; divergent: boolean } {
    if (!nextSource.startsWith(this.source)) {
      this.source = nextSource;
      return { output: "", divergent: true };
    }
    this.source = nextSource;
    return { output: "", divergent: false };
  }

  finish(): string {
    return renderRichText(this.source, this.options);
  }
}
