import { common, createLowlight } from "lowlight";

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
  color: boolean;
  preserveMarkers?: boolean;
};

const COLORS = {
  blue: "38;2;143;182;232",
  green: "38;2;120;201;155",
  amber: "38;2;212;169;79",
  mist: "38;2;198;196;191",
} as const;

function styled(value: string, codes: string[]): string {
  return value && codes.length > 0
    ? `${ANSI}${codes.join(";")}m${value}${RESET}`
    : value;
}

function colorCode(
  color: boolean,
  name: keyof typeof COLORS,
): string[] {
  return color ? [COLORS[name]] : [];
}

function marker(value: string, options: RichTextOptions): string {
  return options.preserveMarkers ? styled(value, ["2"]) : "";
}

function syntaxRole(classNames: string[]): {
  color?: keyof typeof COLORS;
  dim?: boolean;
} {
  const names = new Set(classNames.map((name) => name.replace(/^hljs-/u, "")));
  if (
    ["keyword", "type", "meta", "selector-tag", "tag", "doctag"].some(
      (name) => names.has(name),
    )
  ) {
    return { color: "blue" };
  }
  if (
    ["string", "attr", "attribute", "regexp", "template-tag"].some(
      (name) => names.has(name),
    )
  ) {
    return { color: "green" };
  }
  if (
    ["number", "literal", "built_in", "bullet", "symbol"].some(
      (name) => names.has(name),
    )
  ) {
    return { color: "amber" };
  }
  if (["comment", "quote"].some((name) => names.has(name))) {
    return { dim: true };
  }
  return { color: "mist" };
}

function renderAst(
  node: AstNode,
  color: boolean,
  inherited?: ReturnType<typeof syntaxRole>,
): string {
  if (node.type === "text") {
    const codes = [
      ...(inherited?.dim ? ["2"] : []),
      ...(inherited?.color ? colorCode(color, inherited.color) : []),
    ];
    return styled(node.value ?? "", codes);
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
    .map((child) => renderAst(child, color, role))
    .join("");
}

function highlightCode(
  source: string,
  language: string,
  color: boolean,
): string {
  if (!color) return source;
  try {
    const normalized = language.trim().toLowerCase();
    const tree = normalized
      ? highlighter.registered(normalized)
        ? highlighter.highlight(normalized, source)
        : undefined
      : highlighter.highlightAuto(source);
    if (!tree || (!normalized && (tree.data?.relevance ?? 0) < 3)) {
      return styled(source, colorCode(color, "mist"));
    }
    return renderAst(tree as AstNode, color);
  } catch {
    return styled(source, colorCode(color, "mist"));
  }
}

function isPathToken(value: string): boolean {
  if (/^https?:\/\//iu.test(value)) return false;
  const withoutLocation = value.replace(/:\d+(?::\d+)?$/u, "");
  return (
    /^(?:\.{1,2}\/|\/)[^\s]+$/u.test(withoutLocation) ||
    /^(?:[\w@.-]+\/)+[\w@.+-]+$/u.test(withoutLocation)
  );
}

function renderPath(value: string, options: RichTextOptions): string {
  return styled(value, [
    "4",
    ...colorCode(options.color, "blue"),
  ]);
}

function nextPlainBoundary(value: string): number {
  const candidates = [
    value.indexOf("\\"),
    value.indexOf("`"),
    value.indexOf("*"),
  ].filter((index) => index >= 0);
  const path = value.search(/(?:^|\s)(?:\.{1,2}\/|\/|[\w@.-]+\/)/u);
  if (path >= 0) candidates.push(path === 0 ? 0 : path + 1);
  return candidates.length > 0 ? Math.min(...candidates) : value.length;
}

function renderSegment(
  value: string,
  options: RichTextOptions,
  final: boolean,
  atLineStart: boolean,
): { rendered: string; consumed: number; wait?: boolean; lineStart: boolean } {
  if (!value) {
    return { rendered: "", consumed: 0, lineStart: atLineStart };
  }

  if (
    atLineStart &&
    !final &&
    (value === "`" || value === "``")
  ) {
    return { rendered: "", consumed: 0, wait: true, lineStart: atLineStart };
  }

  if (atLineStart && value.startsWith("```")) {
    const headerEnd = value.indexOf("\n");
    if (headerEnd < 0 && !final) {
      return { rendered: "", consumed: 0, wait: true, lineStart: atLineStart };
    }
    const language = headerEnd >= 0 ? value.slice(3, headerEnd).trim() : "";
    const bodyStart = headerEnd >= 0 ? headerEnd + 1 : value.length;
    const close = value.indexOf("\n```", bodyStart);
    if (close < 0 && !final && value.length <= MAX_CODE_BLOCK_LENGTH) {
      return { rendered: "", consumed: 0, wait: true, lineStart: atLineStart };
    }
    if (close < 0) {
      const raw = value.slice(bodyStart, MAX_CODE_BLOCK_LENGTH);
      const prefix = marker(value.slice(0, bodyStart), options);
      return {
        rendered:
          prefix +
          highlightCode(raw, language, options.color) +
          value.slice(bodyStart + raw.length),
        consumed: value.length,
        lineStart: value.endsWith("\n"),
      };
    }
    const closingEnd = close + 4;
    const source = value.slice(bodyStart, close);
    return {
      rendered:
        marker(value.slice(0, bodyStart), options) +
        highlightCode(source, language, options.color) +
        marker(value.slice(close, closingEnd), options),
      consumed: closingEnd,
      lineStart: false,
    };
  }

  if (/^\\[*`\\]/u.test(value)) {
    if (value.length === 1 && !final) {
      return { rendered: "", consumed: 0, wait: true, lineStart: atLineStart };
    }
    return {
      rendered: value.slice(1, 2) || "\\",
      consumed: Math.min(2, value.length),
      lineStart: false,
    };
  }

  const delimiters = value.startsWith("**")
    ? { open: "**", close: "**", codes: ["1"] }
    : value.startsWith("*")
      ? { open: "*", close: "*", codes: ["3"] }
      : value.startsWith("`")
        ? {
            open: "`",
            close: "`",
            codes: colorCode(options.color, "mist"),
          }
        : undefined;
  if (delimiters) {
    const end = value.indexOf(delimiters.close, delimiters.open.length);
    if (end < 0 && !final) {
      return { rendered: "", consumed: 0, wait: true, lineStart: atLineStart };
    }
    if (end >= 0) {
      const content = value.slice(delimiters.open.length, end);
      return {
        rendered:
          marker(delimiters.open, options) +
          styled(content, delimiters.codes) +
          marker(delimiters.close, options),
        consumed: end + delimiters.close.length,
        lineStart: content.endsWith("\n"),
      };
    }
  }

  const tokenEnd = value.search(/\s/u);
  const candidateEnd = tokenEnd < 0 ? value.length : tokenEnd;
  const candidate = value.slice(0, candidateEnd);
  if (
    !final &&
    tokenEnd < 0 &&
    candidate.includes("/") &&
    !/^https?:\/\//iu.test(candidate)
  ) {
    return { rendered: "", consumed: 0, wait: true, lineStart: atLineStart };
  }
  if (isPathToken(candidate)) {
    if (tokenEnd < 0 && !final) {
      return { rendered: "", consumed: 0, wait: true, lineStart: atLineStart };
    }
    return {
      rendered: renderPath(candidate, options),
      consumed: candidateEnd,
      lineStart: false,
    };
  }

  const boundary = nextPlainBoundary(value);
  if (!final && boundary === value.length) {
    const lastWhitespace = Math.max(
      value.lastIndexOf(" "),
      value.lastIndexOf("\n"),
      value.lastIndexOf("\t"),
    );
    if (lastWhitespace < 0) {
      return { rendered: "", consumed: 0, wait: true, lineStart: atLineStart };
    }
    const plain = value.slice(0, lastWhitespace + 1);
    return {
      rendered: plain,
      consumed: plain.length,
      lineStart: plain.endsWith("\n"),
    };
  }
  const consumed = boundary > 0 ? boundary : 1;
  const plain = value.slice(0, consumed);
  return {
    rendered: plain,
    consumed,
    lineStart: plain.endsWith("\n"),
  };
}

function renderAvailable(
  value: string,
  options: RichTextOptions,
  final: boolean,
  initialLineStart = true,
): { output: string; pending: string; lineStart: boolean } {
  if (!options.enabled) {
    return { output: value, pending: "", lineStart: value.endsWith("\n") };
  }
  let remaining = value;
  let output = "";
  let lineStart = initialLineStart;
  while (remaining) {
    const result = renderSegment(remaining, options, final, lineStart);
    if (result.wait) break;
    if (result.consumed <= 0) break;
    output += result.rendered;
    remaining = remaining.slice(result.consumed);
    lineStart = result.lineStart;
  }
  return { output, pending: remaining, lineStart };
}

export function renderRichText(
  value: string,
  options: RichTextOptions,
): string {
  const result = renderAvailable(value, options, true);
  return result.output + result.pending;
}

export class IncrementalRichTextRenderer {
  private source = "";
  private pending = "";
  private lineStart = true;

  constructor(private options: RichTextOptions) {}

  setOptions(options: RichTextOptions): void {
    this.options = options;
  }

  update(nextSource: string): { output: string; divergent: boolean } {
    if (!nextSource.startsWith(this.source)) {
      this.source = nextSource;
      this.pending = "";
      this.lineStart = true;
      return { output: "", divergent: true };
    }
    const delta = nextSource.slice(this.source.length);
    this.source = nextSource;
    const result = renderAvailable(
      `${this.pending}${delta}`,
      this.options,
      false,
      this.lineStart,
    );
    this.pending = result.pending;
    this.lineStart = result.lineStart;
    return { output: result.output, divergent: false };
  }

  finish(): string {
    const result = renderAvailable(
      this.pending,
      this.options,
      true,
      this.lineStart,
    );
    this.pending = "";
    this.lineStart = result.lineStart;
    return result.output + result.pending;
  }
}
