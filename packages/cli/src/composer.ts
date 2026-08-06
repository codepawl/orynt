import { emitKeypressEvents, type Key } from "node:readline";

import type {
  AgentImageInput,
  ProviderUsageMeterV1,
  ProviderUsageSnapshotV1,
} from "@codepawl/model-runtime";
import type { ContextLifecycleSnapshotV1 } from "@codepawl/shared";
import {
  clipboardPreferences,
  DEFAULT_CLI_CLIPBOARD,
  normalizePastedText,
  type CliClipboardReader,
  type CliClipboardPreferences,
  type ClipboardReadMode,
  type SmartPastePath,
} from "./clipboard.js";
import {
  slashInputAssist,
  terminalSafeMultilineText,
  terminalSafeText,
  type SlashInputAssist,
  type SlashInputSuggestion,
} from "./ui.js";
import {
  type TerminalThemeId,
  type TerminalAppearance,
  type TerminalRole,
  type TerminalTheme,
} from "./terminal-theme.js";
import {
  createTerminalDesignSystem,
  type TerminalDesignSystem,
} from "./terminal-presentation.js";
import {
  IncrementalRichTextRenderer,
  renderRichText,
} from "./rich-text.js";
import {
  shortcutListLabel,
  shortcutMatches,
  shortcutPreferences,
  type CliShortcutPreferences,
} from "./shortcuts.js";
import {
  DEFAULT_CLI_STATUSLINE,
  statuslinePreferences,
  type CliContextFormat,
  type CliStatuslinePreferences,
} from "./statusline.js";
import {
  centerTerminalText,
  TerminalScreen,
  wrapTerminalText,
} from "./terminal-screen.js";

export const INTERRUPTED_INPUT = "\u0003";
export const NAVIGATE_BACK_INPUT = "__orynt_back__";
export const EDIT_PENDING_INPUT = "__orynt_edit_pending__";
export const CLEAR_PENDING_INPUT = "__orynt_clear_pending__";
export const COMPOSER_PROMPT = "You › ";
const COMPOSER_INPUT_PROMPT = "❯ ";
const COMPOSER_PLACEHOLDER = 'Try "explain this repo"';
export const AGENT_MESSAGE_MARKER = "›";
const EXIT_CONFIRMATION_SECONDS = 3;
const ACTIVITY_DELAY_MS = 120;
const ACTIVITY_FRAME_MS = 100;
const STATIC_ACTIVITY_TICK_MS = 1_000;
const ACTIVITY_FRAMES = [
  "♚",
  "♛",
  "♜",
  "♝",
  "♞",
  "♟",
  "♠",
  "♣",
  "♥",
  "♦",
] as const;

export type ComposerChoice = {
  value: string;
  label: string;
  description?: string;
  details?: readonly string[];
};

type ComposerInput = NodeJS.ReadableStream & {
  isRaw?: boolean;
  setRawMode?: (enabled: boolean) => void;
};

type ComposerOutput = NodeJS.WritableStream & {
  columns?: number;
  rows?: number;
};

export type LiveComposerPhase =
  | "preparing"
  | "coordinating"
  | "executing"
  | "stopping";

export type LiveComposerContext = {
  phase: LiveComposerPhase;
  pendingCount: number;
  paused: boolean;
  status?: ComposerStatusContext;
};

export type ComposerStatusContext = {
  mode: "next" | "active" | "phase";
  preset?: string;
  role?: string;
  modelId?: string;
  thinkingEffort?: string;
  phaseLabel?: string;
  context?: ContextLifecycleSnapshotV1;
  providerUsage?: ProviderUsageSnapshotV1;
  pendingCount?: number;
  pendingPaused?: boolean;
};

const CONTEXT_METER_CELLS = 5;

function compactTokenCount(value: number): string {
  const bounded = Math.max(0, Math.trunc(value));
  if (bounded < 1_000) return String(bounded);
  const units = [
    { value: 1_000_000_000, suffix: "b" },
    { value: 1_000_000, suffix: "m" },
    { value: 1_000, suffix: "k" },
  ] as const;
  const unit = units.find((candidate) => bounded >= candidate.value)!;
  const scaled = bounded / unit.value;
  const digits = scaled >= 10 || Number.isInteger(scaled) ? 0 : 1;
  return `${scaled.toFixed(digits).replace(/\.0$/u, "")}${unit.suffix}`;
}

function contextMeterPercent(
  context: ContextLifecycleSnapshotV1 | undefined,
): number | undefined {
  if (context?.usage.usedPercent !== undefined) {
    return Math.min(100, Math.max(0, context.usage.usedPercent));
  }
  const used = context?.usage.usedTokens;
  const window = context?.capacity.effectiveWindowTokens;
  if (used === undefined || !window || window <= 0) return undefined;
  return Math.min(100, Math.max(0, used / window * 100));
}

function contextGradientProgress(
  context: ContextLifecycleSnapshotV1,
  percent: number,
): number {
  const warn = Math.max(1, context.thresholds.warnPercent);
  const compact = Math.max(warn + 1, context.thresholds.compactPercent);
  const hard = Math.max(compact + 1, context.thresholds.hardPercent);
  if (percent <= warn) return percent / warn / 3;
  if (percent <= compact) {
    return 1 / 3 + (percent - warn) / (compact - warn) / 3;
  }
  if (percent <= hard) {
    return 2 / 3 + (percent - compact) / (hard - compact) / 3;
  }
  return 1;
}

export function contextMeterText(
  context: ContextLifecycleSnapshotV1 | undefined,
  format: CliContextFormat = "tokens",
  showBar = true,
): string {
  const percent = contextMeterPercent(context);
  if (percent === undefined) {
    return showBar ? "▱▱▱▱▱ unknown" : "unknown";
  }
  const filled = Math.min(
    CONTEXT_METER_CELLS,
    Math.max(0, Math.round(percent / (100 / CONTEXT_METER_CELLS))),
  );
  const bar = `${"▰".repeat(filled)}${"▱".repeat(CONTEXT_METER_CELLS - filled)}`;
  const percentage = `${percent.toFixed(0)}%`;
  const usedTokens = context?.usage.usedTokens;
  const windowTokens = context?.capacity.effectiveWindowTokens;
  if (
    format === "tokens" &&
    (usedTokens === undefined || !windowTokens || windowTokens <= 0)
  ) {
    return showBar ? `${bar} unknown` : "unknown";
  }
  const used = usedTokens === 0 ? "0k" : compactTokenCount(usedTokens ?? 0);
  const maximum = compactTokenCount(windowTokens ?? 0);
  const ratio = `${used}/${maximum}`;
  const value = format === "percent" ? percentage : ratio;
  return showBar ? `${bar} ${value}` : value;
}

export type ProviderQuotaVariant = "two-windows" | "one-window";

function primaryQuotaMeter(
  snapshot: ProviderUsageSnapshotV1,
): ProviderUsageMeterV1 | undefined {
  return snapshot.meters.find(({ primary }) => primary) ?? snapshot.meters[0];
}

export function providerQuotaText(
  snapshot: ProviderUsageSnapshotV1 | undefined,
  variant: ProviderQuotaVariant = "two-windows",
): string | undefined {
  if (!snapshot || snapshot.status === "unavailable") return undefined;
  const meter = primaryQuotaMeter(snapshot);
  if (!meter || meter.windows.length === 0) return undefined;
  const limit = variant === "two-windows" ? 2 : 1;
  const windows = meter.windows.slice(0, limit).map((window) =>
    `${terminalSafeText(window.label)} ${Math.round(window.remainingPercent)}% left`
  );
  return `${terminalSafeText(snapshot.provider.label)} · ${windows.join(" · ")}`;
}

export type ComposerDraftBlock = {
  id: number;
  start: number;
  end: number;
  label: string;
  kind: "pasted_text" | "path" | "image";
};

export type ComposerDraftImage = {
  id: number;
  image: AgentImageInput;
};

export type ComposerDraftSnapshot = {
  value: string;
  cursor: number;
  blocks: ComposerDraftBlock[];
  images: ComposerDraftImage[];
};

export type ComposerInitialValue = string | ComposerDraftSnapshot;

function cloneDraftSnapshot(
  draft: ComposerDraftSnapshot,
): ComposerDraftSnapshot {
  return {
    value: draft.value,
    cursor: Math.max(0, Math.min(draft.value.length, draft.cursor)),
    blocks: draft.blocks.map((block) => ({ ...block })),
    images: draft.images.map((attachment) => ({
      ...attachment,
      image: { ...attachment.image },
    })),
  };
}

function emptyDraftSnapshot(): ComposerDraftSnapshot {
  return {
    value: "",
    cursor: 0,
    blocks: [],
    images: [],
  };
}

function initialDraftSnapshot(
  value: ComposerInitialValue,
): ComposerDraftSnapshot {
  return typeof value === "string"
    ? {
        value,
        cursor: value.length,
        blocks: [],
        images: [],
      }
    : cloneDraftSnapshot(value);
}

export type LiveComposerSubmission =
  | {
      kind: "message";
      value: string;
      delivery: "contextual" | "next";
      images?: AgentImageInput[];
      draft?: ComposerDraftSnapshot;
    }
  | {
      kind: "stop";
      draft: string;
    }
  | {
      kind: "edit_pending";
    }
  | {
      kind: "clear_pending";
    };

export type LiveComposerSubmissionResult = {
  draft?: ComposerDraftSnapshot;
};

export type LiveComposerHandle = {
  setContext: (context: LiveComposerContext) => void;
  pauseForModal: () => () => void;
  close: () => ComposerInitialValue;
};

type ActiveRead = {
  mode: "ask" | "compose" | "select" | "live";
  prompt: string;
  originalPrompt: string;
  buffer: string;
  cursor: number;
  selectionAnchor?: number;
  preferredColumn?: number;
  paletteDismissed: boolean;
  selectedSuggestion: number;
  renderedLines: string[];
  renderedAreaRows: number;
  renderedCursorRow: number;
  renderedCursorColumn: number;
  renderedColumns: number;
  pendingRenderPrefix: string;
  historyIndex: number;
  historyDraft: string;
  undoStack: EditSnapshot[];
  redoStack: EditSnapshot[];
  compactBlocks: CompactInputBlock[];
  images: ComposerImageAttachment[];
  lastEditKind?: EditKind;
  lastEditAt: number;
  choices: ComposerChoice[];
  currentValue?: string;
  statusContext?: ComposerStatusContext;
  liveContext?: LiveComposerContext;
  onLiveSubmission?: (
    submission: LiveComposerSubmission,
  ) => LiveComposerSubmissionResult | void;
  resolve: (value: string) => void;
};

type EditKind = "insert" | "delete" | "command";

type EditSnapshot = Pick<
  ActiveRead,
  | "buffer"
  | "cursor"
  | "selectionAnchor"
  | "preferredColumn"
  | "paletteDismissed"
  | "selectedSuggestion"
  | "historyIndex"
  | "historyDraft"
  | "compactBlocks"
  | "images"
>;

type CompactInputBlock = ComposerDraftBlock;
type ComposerImageAttachment = ComposerDraftImage;

type ExitConfirmation = {
  activeRead: ActiveRead;
  deadline: number;
  displayedSeconds: number;
  timer?: NodeJS.Timeout;
};

type ActionConfirmation = {
  kind: "cancel" | "clear_pending";
  activeRead: ActiveRead;
  deadline: number;
  displayedSeconds: number;
  pendingCount: number;
  timer?: NodeJS.Timeout;
};

type ComposerNotice = {
  role: "success" | "danger";
  text: string;
  timer?: NodeJS.Timeout;
};

type MouseSelectionDrag = {
  row: number;
  column: number;
  direction?: -1 | 1;
  timer?: NodeJS.Timeout;
};

type RenderFrame = {
  lines: string[];
  cursorRow: number;
  cursorColumn: number;
};

type VisualDraftRow = {
  text: string;
  start: number;
  end: number;
  hardStart: boolean;
};

export type InlineActivityHandle = {
  update: (label: string) => void;
  settle: (label?: string) => void;
  fail: (label?: string) => void;
  stop: () => void;
};

export type InlineMessageStreamHandle = {
  update: (text: string) => void;
  finish: (finalText?: string) => void;
  abort: () => void;
};

type ActiveActivity = {
  id: number;
  label: string;
  layout: "inline" | "startup";
  startedAtMs: number;
  markerFrame: number;
  shimmerFrame: number;
  ready: boolean;
  visible: boolean;
  timer?: NodeJS.Timeout;
};

export function formatActivityElapsed(elapsedMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1_000));
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes === 0) return `${seconds}s`;
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);
  if (hours === 0) return `${minutes}m ${seconds}s`;
  return `${hours}h ${minutes}m ${seconds}s`;
}

type ActiveMessageStream = {
  id: number;
  prefix: string;
  displayedText: string;
  latestText: string;
  started: boolean;
  divergent: boolean;
  renderer: IncrementalRichTextRenderer;
};

export function agentMessagePrefix(label = "Agent"): string {
  return `${terminalSafeText(label)} ${AGENT_MESSAGE_MARKER}`;
}

export type TtyComposerOptions = {
  input: ComposerInput;
  output: ComposerOutput;
  color: boolean;
  motion?: boolean;
  richText?: boolean;
  themeId?: TerminalThemeId;
  shortcuts?: CliShortcutPreferences;
  statusline?: CliStatuslinePreferences;
  clipboardPreferences?: CliClipboardPreferences;
  viewportMode: "fullscreen" | "inline";
  clipboard?: CliClipboardReader;
  designSystem?: TerminalDesignSystem;
  onInterrupt: () => void;
};

function liveComposerHint(
  context: LiveComposerContext,
  width = 80,
): string {
  const pending = context.pendingCount > 0
    ? ` · ${context.pendingCount} pending${context.paused ? " (paused)" : ""}`
    : "";
  const queueKeys = context.pendingCount > 0
    ? " · Ctrl+↑ edit · Esc×2 clear"
    : "";
  if (context.phase === "preparing" || context.phase === "coordinating") {
    if (width < 56) return `Ctrl+C Stop${pending}`;
    if (width < 84) {
      return `Tab Next · Alt+Enter newline · Ctrl+C Stop${pending}`;
    }
    return `Enter Update · Tab Next · Ctrl+C Cancel${queueKeys}${pending}`;
  }
  if (context.phase === "stopping") {
    return `Stopping · /pending resume when ready${pending}`;
  }
  return width < 44
    ? `Ctrl+C Stop${pending}`
    : width < 84
      ? `Tab Next · Ctrl+C Cancel${pending}`
      : `Enter Send next · Tab Next · Ctrl+C Cancel${queueKeys}${pending}`;
}

const graphemeSegmenter = new Intl.Segmenter(undefined, {
  granularity: "grapheme",
});
const wordSegmenter = new Intl.Segmenter(undefined, {
  granularity: "word",
});

function graphemeCount(value: string): number {
  return [...graphemeSegmenter.segment(value)].length;
}

function previousBoundary(value: string, index: number): number {
  let previous = 0;
  for (const segment of graphemeSegmenter.segment(value)) {
    if (segment.index >= index) break;
    previous = segment.index;
  }
  return previous;
}

function nextBoundary(value: string, index: number): number {
  for (const segment of graphemeSegmenter.segment(value)) {
    const end = segment.index + segment.segment.length;
    if (end > index) return end;
  }
  return value.length;
}

function previousWordBoundary(value: string, index: number): number {
  if (index <= 0) return 0;
  const segments = [...wordSegmenter.segment(value)];
  let cursor = index;
  while (cursor > 0) {
    const segment = [...segments]
      .reverse()
      .find((candidate) => candidate.index < cursor);
    if (!segment) return 0;
    const text = segment.segment;
    cursor = segment.index;
    if (!/^\s+$/u.test(text)) return cursor;
  }
  return 0;
}

function nextWordBoundary(value: string, index: number): number {
  if (index >= value.length) return value.length;
  const segments = [...wordSegmenter.segment(value)];
  let cursor = index;
  let consumedContent = false;
  for (const segment of segments) {
    const end = segment.index + segment.segment.length;
    if (end <= cursor) continue;
    const whitespace = /^\s+$/u.test(segment.segment);
    if (!whitespace) {
      consumedContent = true;
      cursor = end;
      continue;
    }
    cursor = end;
    if (consumedContent) return cursor;
  }
  return value.length;
}

function wrapDraft(value: string, width: number): VisualDraftRow[] {
  const available = Math.max(1, width);
  const rows: VisualDraftRow[] = [];
  let start = 0;
  let rowWidth = 0;
  let hardStart = false;
  for (const part of graphemeSegmenter.segment(value)) {
    const end = part.index + part.segment.length;
    if (part.segment === "\n") {
      rows.push({
        text: value.slice(start, part.index),
        start,
        end: part.index,
        hardStart,
      });
      start = end;
      rowWidth = 0;
      hardStart = true;
      continue;
    }
    const partWidth = graphemeWidth(part.segment);
    if (rowWidth > 0 && rowWidth + partWidth > available) {
      rows.push({
        text: value.slice(start, part.index),
        start,
        end: part.index,
        hardStart,
      });
      start = part.index;
      rowWidth = 0;
      hardStart = false;
    }
    rowWidth += partWidth;
  }
  rows.push({
    text: value.slice(start),
    start,
    end: value.length,
    hardStart,
  });
  return rows;
}

function offsetAtColumn(value: string, start: number, end: number, column: number): number {
  let width = 0;
  let offset = start;
  for (const part of graphemeSegmenter.segment(value.slice(start, end))) {
    const nextWidth = width + graphemeWidth(part.segment);
    if (nextWidth > column) break;
    width = nextWidth;
    offset = start + part.index + part.segment.length;
  }
  return offset;
}

function codePointWidth(value: string): number {
  if (/^\p{Mark}$/u.test(value)) return 0;
  if (/^\p{Emoji_Modifier}$/u.test(value)) return 0;
  const codePoint = value.codePointAt(0) ?? 0;
  if (
    codePoint === 0x200d ||
    (codePoint >= 0xfe00 && codePoint <= 0xfe0f) ||
    (codePoint >= 0xe0100 && codePoint <= 0xe01ef)
  ) {
    return 0;
  }
  if (
    codePoint >= 0x1100 &&
    (codePoint <= 0x115f ||
      codePoint === 0x2329 ||
      codePoint === 0x232a ||
      (codePoint >= 0x2e80 && codePoint <= 0xa4cf) ||
      (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
      (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
      (codePoint >= 0xfe10 && codePoint <= 0xfe6f) ||
      (codePoint >= 0xff00 && codePoint <= 0xff60) ||
      (codePoint >= 0x1f300 && codePoint <= 0x1faff) ||
      (codePoint >= 0x20000 && codePoint <= 0x3fffd))
  ) {
    return 2;
  }
  return codePoint < 0x20 || (codePoint >= 0x7f && codePoint < 0xa0) ? 0 : 1;
}

function graphemeWidth(value: string): number {
  if (/\p{Extended_Pictographic}/u.test(value)) return 2;
  if (/^\p{Regional_Indicator}{2}$/u.test(value)) return 2;
  return Array.from(value).reduce(
    (width, character) => width + codePointWidth(character),
    0,
  );
}

export function displayWidth(value: string): number {
  let width = 0;
  for (const segment of graphemeSegmenter.segment(value)) {
    width += graphemeWidth(segment.segment);
  }
  return width;
}

export function truncate(value: string, width: number): string {
  if (width <= 0) return "";
  if (displayWidth(value) <= width) return value;
  let result = "";
  let resultWidth = 0;
  for (const segment of graphemeSegmenter.segment(value)) {
    const segmentWidth = graphemeWidth(segment.segment);
    if (resultWidth + segmentWidth + 1 > width) break;
    result += segment.segment;
    resultWidth += segmentWidth;
  }
  return `${result}…`;
}

function viewport(value: string, cursor: number, width: number): { text: string; cursorColumn: number } {
  const available = Math.max(1, width);
  let start = 0;
  while (start < cursor && displayWidth(value.slice(start, cursor)) > available - 1) {
    start = nextBoundary(value, start);
  }
  const leading = start > 0 ? "…" : "";
  let end = cursor;
  while (end < value.length) {
    const next = nextBoundary(value, end);
    if (displayWidth(`${leading}${value.slice(start, next)}`) > available - 1) break;
    end = next;
  }
  let text = `${leading}${value.slice(start, end)}`;
  if (end < value.length) {
    while (text && displayWidth(`${text}…`) > available) {
      end = previousBoundary(value, end);
      text = `${leading}${value.slice(start, end)}`;
    }
    text += "…";
  }
  return {
    text,
    cursorColumn: displayWidth(`${leading}${value.slice(start, cursor)}`),
  };
}

const UNSAFE_INPUT_CHARACTER = /[\u0000-\u001f\u007f-\u009f]/u;
const BIDI_INPUT_CHARACTER = /^\p{Bidi_Control}$/u;

function visibleInput(value: string): string {
  return Array.from(value, (character) =>
    UNSAFE_INPUT_CHARACTER.test(character) || BIDI_INPUT_CHARACTER.test(character)
      ? terminalSafeText(character)
      : character
  ).join("");
}

function visibleDraftInput(value: string): string {
  return value
    .split("\n")
    .map((line) => visibleInput(line))
    .join("\n");
}

type ComposerLine = {
  text: string;
  labelStart: number;
  labelLength: number;
  descriptionStart?: number;
  descriptionLength?: number;
};

function suggestionLine(
  suggestion: SlashInputSuggestion,
  selected: boolean,
  width: number,
): ComposerLine {
  const marker = selected ? "›" : " ";
  const detail = width >= 64
    ? `${suggestion.label.padEnd(22)} ${suggestion.description}`
    : suggestion.label;
  return {
    text: truncate(`  ${marker} ${detail}`, width),
    labelStart: 4,
    labelLength: suggestion.label.length,
    ...(width >= 64
      ? {
          descriptionStart:
            4 + Math.max(22, suggestion.label.length) + 1,
          descriptionLength: suggestion.description.length,
        }
      : {}),
  };
}

function choiceLine(
  choice: ComposerChoice,
  selected: boolean,
  current: boolean,
  width: number,
): ComposerLine {
  const marker = selected ? "›" : " ";
  const currentMarker = current ? "●" : " ";
  const label = terminalSafeText(choice.label);
  const description = choice.description
    ? terminalSafeText(choice.description)
    : "";
  const detail = width >= 64 && description
    ? `${label.padEnd(22)} ${description}`
    : label;
  return {
    text: truncate(`  ${marker} ${currentMarker} ${detail}`, width),
    labelStart: 6,
    labelLength: label.length,
    ...(width >= 64 && description
      ? {
          descriptionStart: 6 + Math.max(22, label.length) + 1,
          descriptionLength: description.length,
        }
      : {}),
  };
}

function paintComposerLine(
  theme: TerminalTheme,
  line: ComposerLine,
  selected: boolean,
): string {
  const markerIndex = line.text.indexOf("›");
  const labelEnd = Math.min(
    line.text.length,
    line.labelStart + line.labelLength,
  );
  const label =
    line.labelStart < labelEnd
      ? theme.paint(
          selected ? "focus" : "label",
          line.text.slice(line.labelStart, labelEnd),
        )
      : "";
  const descriptionStart = Math.max(
    labelEnd,
    Math.min(line.text.length, line.descriptionStart ?? line.text.length),
  );
  const descriptionEnd = Math.min(
    line.text.length,
    descriptionStart + (line.descriptionLength ?? 0),
  );
  const prefix = line.text.slice(0, line.labelStart);
  const paintedPrefix =
    selected && markerIndex >= 0
      ? `${prefix.slice(0, markerIndex)}${theme.paint("focus", "›")}${prefix.slice(markerIndex + 1)}`
      : prefix;
  return [
    paintedPrefix,
    label,
    line.text.slice(labelEnd, descriptionStart),
    descriptionStart < descriptionEnd
      ? theme.paint(
          "muted",
          line.text.slice(descriptionStart, descriptionEnd),
        )
      : "",
    line.text.slice(descriptionEnd),
  ].join("");
}

function paintPromptMarker(theme: TerminalTheme, line: string): string {
  const promptPrefix = COMPOSER_PROMPT.trimEnd();
  const promptIndex = line.indexOf(promptPrefix);
  if (promptIndex < 0) return line;
  return `${line.slice(0, promptIndex)}${theme.paint("user", promptPrefix)}${line.slice(promptIndex + promptPrefix.length)}`;
}

function paintToken(
  theme: TerminalTheme,
  role: TerminalRole,
  line: string,
  token: string,
): string {
  const index = line.indexOf(token);
  if (index < 0) return line;
  return `${line.slice(0, index)}${theme.paint(role, token)}${line.slice(index + token.length)}`;
}

function verticalMove(rows: number): string {
  if (rows === 0) return "";
  return `\u001b[${Math.abs(rows)}${rows > 0 ? "B" : "A"}`;
}

function cursorPosition(column: number): string {
  return `\r${column > 0 ? `\u001b[${column}C` : ""}`;
}

function terminalColumns(output: ComposerOutput): number {
  const columns = Math.floor(output.columns ?? 80);
  return columns > 0 ? columns : 80;
}

function terminalRows(output: ComposerOutput): number {
  const rows = Math.floor(output.rows ?? 24);
  return rows > 0 ? rows : 24;
}

function shouldCompactPrompt(prompt: string, columns: number): boolean {
  return displayWidth(prompt) + 1 > Math.max(1, columns - 1);
}

export class TtyComposer {
  private readonly input: ComposerInput;
  private readonly output: ComposerOutput;
  private readonly screen?: TerminalScreen;
  private readonly designSystem: TerminalDesignSystem;
  private motion: boolean;
  private richText: boolean;
  private shortcuts: CliShortcutPreferences;
  private statusline: CliStatuslinePreferences;
  private clipboardPreferences: CliClipboardPreferences;
  private providerUsage?: ProviderUsageSnapshotV1;
  private readonly clipboard?: CliClipboardReader;
  private readonly onInterrupt: () => void;
  private readonly wasRaw: boolean;
  private active?: ActiveRead;
  private exitConfirmation?: ExitConfirmation;
  private activity?: ActiveActivity;
  private activitySequence = 0;
  private messageStream?: ActiveMessageStream;
  private messageStreamSequence = 0;
  private history: string[] = [];
  private closed = false;
  private suspended = false;
  private resizePending = false;
  private shellSummary = "";
  private pendingPaste?: string;
  private pendingMouseInput?: string;
  private pasteSequence = 0;
  private lastSubmittedImages: AgentImageInput[] = [];
  private lastSubmittedDraft?: ComposerDraftSnapshot;
  private actionConfirmation?: ActionConfirmation;
  private notice?: ComposerNotice;
  private mouseSelectionDrag?: MouseSelectionDrag;

  constructor(options: TtyComposerOptions) {
    this.input = options.input;
    this.output = options.output;
    this.screen = options.viewportMode === "fullscreen"
      ? new TerminalScreen(options.output)
      : undefined;
    this.designSystem =
      options.designSystem ??
      createTerminalDesignSystem(options.color, options.themeId);
    this.motion = options.motion ?? true;
    this.richText = options.richText ?? true;
    this.shortcuts = shortcutPreferences(options.shortcuts);
    this.statusline = statuslinePreferences(
      options.statusline ?? DEFAULT_CLI_STATUSLINE,
    );
    this.clipboardPreferences = clipboardPreferences(
      options.clipboardPreferences ?? DEFAULT_CLI_CLIPBOARD,
    );
    this.onInterrupt = options.onInterrupt;
    this.clipboard = options.clipboard;
    this.wasRaw = Boolean(this.input.isRaw);
    emitKeypressEvents(this.input);
    this.input.on("keypress", this.handleKeypress);
    this.output.on("resize", this.handleResize);
    this.input.setRawMode?.(true);
    this.input.resume();
    this.screen?.enter();
  }

  compose = (
    prompt: string,
    initialValue: ComposerInitialValue = "",
    statusContext?: ComposerStatusContext,
  ): Promise<string> =>
    this.read(prompt, "compose", { statusContext }, initialValue);

  ask = (prompt: string): Promise<string> => this.read(prompt, "ask");

  select = (
    prompt: string,
    choices: ComposerChoice[],
    currentValue?: string,
  ): Promise<string> => this.read(prompt, "select", { choices, currentValue });

  remember = (value: string): void => {
    if (!value.trim()) return;
    this.history = [value, ...this.history.filter((entry) => entry !== value)].slice(0, 100);
  };

  takeSubmittedImages = (): AgentImageInput[] => {
    const images = this.lastSubmittedImages;
    this.lastSubmittedImages = [];
    return images;
  };

  takeSubmittedDraft = (): ComposerDraftSnapshot | undefined => {
    const draft = this.lastSubmittedDraft;
    this.lastSubmittedDraft = undefined;
    return draft ? cloneDraftSnapshot(draft) : undefined;
  };

  beginLiveInput = (
    context: LiveComposerContext,
    onSubmission: (
      submission: LiveComposerSubmission,
    ) => LiveComposerSubmissionResult | void,
    initialValue: ComposerInitialValue = "",
  ): LiveComposerHandle => {
    if (this.closed) {
      return {
        setContext: () => undefined,
        pauseForModal: () => () => undefined,
        close: () => initialDraftSnapshot(initialValue),
      };
    }
    if (this.active) {
      throw new Error("Orynt terminal input is already active");
    }
    this.output.write("\u001b[?2004h");
    this.active = this.createActiveRead(
      COMPOSER_PROMPT,
      "live",
      {},
      initialValue,
      () => undefined,
    );
    this.active.liveContext = { ...context };
    this.active.onLiveSubmission = onSubmission;
    this.render();
    const active = this.active;
    let paused = false;
    return {
      setContext: (nextContext) => {
        if (this.active !== active && !paused) return;
        active.liveContext = { ...nextContext };
        if (!paused) this.render();
      },
      pauseForModal: () => {
        if (this.active !== active || paused) {
          return () => undefined;
        }
        this.disarmActionConfirmation();
        this.clearRender();
        this.active = undefined;
        paused = true;
        let restored = false;
        return () => {
          if (restored) return;
          restored = true;
          if (this.closed || !paused) return;
          if (this.active) {
            throw new Error(
              "Orynt terminal input cannot restore while another prompt is active",
            );
          }
          paused = false;
          this.active = active;
          this.render();
        };
      },
      close: () => {
        if (this.active !== active && !paused) return emptyDraftSnapshot();
        const draft = this.draftSnapshot(active);
        if (!paused) {
          this.clearRender();
          this.active = undefined;
        }
        paused = false;
        this.disarmActionConfirmation();
        return draft;
      },
    };
  };

  suspend(): () => void {
    if (this.closed) {
      throw new Error("Orynt terminal input is closed");
    }
    if (this.active) {
      throw new Error("Orynt terminal input cannot be suspended while a prompt is active");
    }
    if (this.suspended) {
      throw new Error("Orynt terminal input is already suspended");
    }
    this.finishMessageStream();
    this.stopActivity();
    this.disarmExitConfirmation();
    this.disarmActionConfirmation();
    this.stopMouseSelectionDrag();
    this.pendingMouseInput = undefined;
    this.output.write("\u001b[?2004l");
    this.input.off("keypress", this.handleKeypress);
    this.output.off("resize", this.handleResize);
    this.input.setRawMode?.(false);
    this.input.pause();
    this.screen?.suspend();
    this.suspended = true;
    let restored = false;
    return () => {
      if (restored) return;
      restored = true;
      if (this.closed || !this.suspended) return;
      this.suspended = false;
      this.output.write("\u001b[?2004h");
      this.input.on("keypress", this.handleKeypress);
      this.output.on("resize", this.handleResize);
      this.input.setRawMode?.(true);
      this.input.resume();
      this.screen?.resume();
      this.renderFullscreen();
    };
  }

  setPresentation = (appearance: TerminalAppearance): void => {
    this.designSystem.update(appearance);
    this.richText = appearance.richText;
    this.messageStream?.renderer.setOptions({
      enabled: this.richText,
      theme: this.designSystem.theme,
    });
    if (this.motion !== appearance.motion) {
      this.motion = appearance.motion;
      const activity = this.activity;
      if (activity?.timer) {
        clearTimeout(activity.timer);
        activity.timer = undefined;
      }
      if (activity) {
        if (activity.ready || activity.visible) this.paintActivity(activity);
        activity.timer = setTimeout(
          () => this.tickActivity(activity),
          activity.ready
            ? this.motion
              ? ACTIVITY_FRAME_MS
              : STATIC_ACTIVITY_TICK_MS
            : ACTIVITY_DELAY_MS,
        );
        activity.timer.unref?.();
      }
    }
    if (this.active) {
      this.render();
    }
  };

  setShortcuts = (shortcuts: CliShortcutPreferences): void => {
    this.shortcuts = shortcutPreferences(shortcuts);
    if (this.active) this.render();
  };

  setStatusline = (statusline: CliStatuslinePreferences): void => {
    this.statusline = statuslinePreferences(statusline);
    if (this.active) this.render();
  };

  setProviderUsage = (
    providerUsage: ProviderUsageSnapshotV1 | undefined,
  ): void => {
    this.providerUsage = providerUsage
      ? structuredClone(providerUsage)
      : undefined;
    if (this.active) this.render();
  };

  setClipboardPreferences = (
    preferences: CliClipboardPreferences,
  ): void => {
    this.clipboardPreferences = clipboardPreferences(preferences);
  };

  notify = (
    text: string,
    role: ComposerNotice["role"] = "success",
  ): void => {
    if (this.notice?.timer) clearTimeout(this.notice.timer);
    const notice: ComposerNotice = { text, role };
    this.notice = notice;
    if (this.active) this.scheduleNoticeExpiry(notice);
    if (this.active) this.render();
  };

  private scheduleNoticeExpiry(notice: ComposerNotice): void {
    if (notice.timer) return;
    notice.timer = setTimeout(() => {
      if (this.notice !== notice) return;
      this.notice = undefined;
      if (this.active) this.render();
    }, 2_000);
    notice.timer.unref?.();
  }

  private appendTimeline(
    value: string,
    centeredVariants?: readonly string[],
    decorateRow?: (rendered: string) => string,
  ): void {
    if (!value) return;
    this.screen?.appendHistory(value, {
      ...(centeredVariants ? { centeredVariants } : {}),
      ...(decorateRow ? { decorateRow } : {}),
    });
    const plainLines = value
      .replace(/\u001b\[[0-?]*[ -/]*[@-~]/gu, "")
      .replace(/\r/gu, "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const summary = [...plainLines].reverse().find((line) =>
      /^(?:Session ended\.|Fatal:|Startup (?:cancelled|interrupted)\.)/u.test(line)
    );
    if (summary) this.shellSummary = summary;
  }

  private isChatSubmission(active: ActiveRead): boolean {
    return (
      (active.mode === "compose" || active.mode === "live") &&
      active.originalPrompt === COMPOSER_PROMPT
    );
  }

  private writeSubmittedUserMessage(
    active: ActiveRead,
    renderedContent: string,
  ): void {
    const prompt = this.designSystem.theme.paint(
      "user",
      active.prompt.trimEnd(),
    );
    const message = `${prompt} ${renderedContent}`;
    const decorateRow = (rendered: string) =>
      this.designSystem.theme.paintRenderedRow("userMessage", rendered);
    if (this.screen) {
      this.appendTimeline(`${message}\n`, undefined, decorateRow);
      return;
    }
    if (!this.designSystem.theme.enabled) {
      this.output.write(`${message}\n`);
      return;
    }
    this.output.write(
      `${wrapTerminalText(message, terminalColumns(this.output))
        .map(decorateRow)
        .join("\n")}\n`,
    );
  }

  clearViewport = (): void => {
    if (!this.screen) {
      this.output.write("\u001bc");
      return;
    }
    this.screen.clearHistory();
    this.screen.scrollToTail();
    this.renderFullscreen();
  };

  private renderFullscreen(): void {
    if (!this.screen?.active) return;
    const active = this.active;
    const frame = active ? this.createFrame(active) : {
      lines: [],
      cursorRow: 0,
      cursorColumn: 0,
    };
    const transient: string[] = [];
    const stream = this.messageStream;
    if (stream?.latestText) {
      transient.push(
        `${this.designSystem.theme.paint("agent", stream.prefix)} ${renderRichText(stream.latestText, {
          enabled: this.richText,
          theme: this.designSystem.theme,
          width: Math.max(20, terminalColumns(this.output) - displayWidth(stream.prefix) - 1),
          continuationIndent: " ".repeat(displayWidth(stream.prefix) + 1),
        })}`,
      );
    }
    const activity = this.activity;
    if (
      activity?.ready &&
      !stream?.latestText &&
      active?.mode !== "live"
    ) {
      transient.push(
        activity.layout === "inline"
          ? this.inlineActivityLine(activity, Math.max(0, terminalColumns(this.output) - 1))
          : `  ${this.designSystem.theme.paint(
              "focus",
              this.activityMarker(activity),
            )} ${activity.label}`,
      );
    }
    this.screen.render({
      transient,
      composer: frame.lines,
      composerCursorRow: frame.cursorRow,
      composerCursorColumn: frame.cursorColumn,
    });
    if (active) {
      active.renderedLines = [...frame.lines];
      active.renderedAreaRows = frame.lines.length;
      active.renderedCursorRow = frame.cursorRow;
      active.renderedCursorColumn = frame.cursorColumn;
      active.renderedColumns = terminalColumns(this.output);
      active.pendingRenderPrefix = "";
    }
  }

  private writeOutput(
    value: string,
    centeredVariants?: readonly string[],
  ): void {
    this.finishMessageStream();
    const normalizedVariants = centeredVariants?.map((variant) =>
      variant.endsWith("\n") ? variant : `${variant}\n`
    );
    const normalized = normalizedVariants
      ? centerTerminalText(normalizedVariants, terminalColumns(this.output))
      : value.endsWith("\n")
        ? value
        : `${value}\n`;
    if (this.screen) {
      this.appendTimeline(
        normalizedVariants?.[0] ?? normalized,
        normalizedVariants,
      );
      this.renderFullscreen();
      return;
    }
    const activity = this.activity;
    const live = this.active?.mode === "live";
    if (live) this.clearRender();
    if (!activity?.visible) {
      this.output.write(normalized);
      if (live) this.render();
      return;
    }
    activity.visible = false;
    this.output.write(
      `${this.clearActivityFrame(activity)}${normalized}${this.activityFrame(activity)}`,
    );
    activity.visible = true;
    if (live) this.render();
  }

  write = (value: string): void => {
    this.writeOutput(value);
  };

  writeCentered = (variants: readonly string[]): void => {
    if (variants.length === 0) return;
    this.writeOutput(variants[0] ?? "", variants);
  };

  beginActivity = (label: string): InlineActivityHandle =>
    this.startActivity(label, "inline");

  beginStartupActivity = (label: string): InlineActivityHandle =>
    this.startActivity(label, "startup");

  private startActivity(
    label: string,
    layout: ActiveActivity["layout"],
  ): InlineActivityHandle {
    this.finishMessageStream();
    this.stopActivity();
    const activity: ActiveActivity = {
      id: ++this.activitySequence,
      label: terminalSafeText(label),
      layout,
      startedAtMs: Date.now(),
      markerFrame: 0,
      shimmerFrame: 0,
      ready: false,
      visible: false,
    };
    this.activity = activity;
    activity.timer = setTimeout(
      () => this.tickActivity(activity),
      ACTIVITY_DELAY_MS,
    );
    activity.timer.unref?.();
    const finish = (
      marker: "✓" | "✕" | undefined,
      nextLabel?: string,
    ): void => {
      if (this.activity?.id !== activity.id) return;
      const finalLabel = terminalSafeText(nextLabel ?? activity.label);
      if (activity.timer) clearTimeout(activity.timer);
      this.activity = undefined;
      const renderedMarker = marker
        ? this.designSystem.theme.paint(
            marker === "✓" ? "success" : "danger",
            marker,
          )
        : undefined;
      if (this.screen) {
        if (renderedMarker) {
          this.appendTimeline(`  ${renderedMarker} ${finalLabel}\n`);
        }
        this.renderFullscreen();
        return;
      }
      const clear = activity.visible ? this.clearActivityFrame(activity) : "";
      const live = this.active?.mode === "live";
      if (live) this.clearRender();
      this.output.write(
        renderedMarker
          ? `${clear}  ${renderedMarker} ${finalLabel}\n`
          : clear,
      );
      if (live) this.render();
    };
    return {
      update: (nextLabel) => {
        if (this.activity?.id !== activity.id) return;
        activity.label = terminalSafeText(nextLabel);
        activity.shimmerFrame = 0;
        if (
          activity.visible ||
          (activity.ready && this.active?.mode === "live")
        ) {
          this.paintActivity(activity);
        }
      },
      settle: (nextLabel) => finish("✓", nextLabel),
      fail: (nextLabel) => finish("✕", nextLabel),
      stop: () => finish(undefined),
    };
  }

  beginMessageStream = (label = "Agent"): InlineMessageStreamHandle => {
    this.stopActivity();
    this.finishMessageStream();
    const stream: ActiveMessageStream = {
      id: ++this.messageStreamSequence,
      prefix: agentMessagePrefix(label),
      displayedText: "",
      latestText: "",
      started: false,
      divergent: false,
      renderer: new IncrementalRichTextRenderer({
        enabled: this.richText,
        theme: this.designSystem.theme,
        width: Math.max(20, terminalColumns(this.output) - displayWidth(agentMessagePrefix(label)) - 1),
        continuationIndent: " ".repeat(displayWidth(agentMessagePrefix(label)) + 1),
      }),
    };
    this.messageStream = stream;
    const update = (value: string) => {
      if (this.messageStream?.id !== stream.id) return;
      const next = terminalSafeMultilineText(value);
      stream.latestText = next;
      if (this.screen) {
        this.renderFullscreen();
        return;
      }
      if (this.active?.mode === "live") {
        return;
      }
      if (!stream.started && next) {
        this.output.write(
          `\n${this.designSystem.theme.paint("agent", stream.prefix)} `,
        );
        stream.started = true;
      }
      if (!stream.divergent) {
        const rendered = stream.renderer.update(next);
        if (rendered.divergent) {
          stream.divergent = true;
          return;
        }
        if (rendered.output) this.output.write(rendered.output);
        stream.displayedText = next;
      }
    };
    return {
      update,
      finish: (finalText) => {
        if (finalText !== undefined) update(finalText);
        this.finishMessageStream(stream.id);
      },
      abort: () => this.finishMessageStream(stream.id),
    };
  };

  private finishMessageStream(id?: number): void {
    const stream = this.messageStream;
    if (!stream || (id !== undefined && stream.id !== id)) return;
    this.messageStream = undefined;
    if (this.screen) {
      if (stream.latestText) {
        this.appendTimeline(
          `${this.designSystem.theme.paint("agent", stream.prefix)} ${renderRichText(stream.latestText, {
            enabled: this.richText,
            theme: this.designSystem.theme,
            width: Math.max(20, terminalColumns(this.output) - displayWidth(stream.prefix) - 1),
            continuationIndent: " ".repeat(displayWidth(stream.prefix) + 1),
          })}\n`,
        );
      }
      this.renderFullscreen();
      return;
    }
    const live = this.active?.mode === "live";
    if (live) {
      this.clearRender();
      if (stream.latestText) {
        this.output.write(
          `\n${this.designSystem.theme.paint("agent", stream.prefix)} ${renderRichText(stream.latestText, {
            enabled: this.richText,
            theme: this.designSystem.theme,
            width: Math.max(20, terminalColumns(this.output) - displayWidth(stream.prefix) - 1),
            continuationIndent: " ".repeat(displayWidth(stream.prefix) + 1),
          })}${stream.latestText.endsWith("\n") ? "" : "\n"}`,
        );
      }
      this.render();
      return;
    }
    if (!stream.divergent && stream.latestText === stream.displayedText) {
      const tail = stream.renderer.finish();
      if (tail) this.output.write(tail);
    } else if (stream.latestText) {
      if (stream.started && !stream.displayedText.endsWith("\n")) {
        this.output.write("\n");
      }
      this.output.write(
        `\n${this.designSystem.theme.paint("agent", stream.prefix)} updated · ${renderRichText(stream.latestText, {
          enabled: this.richText,
          theme: this.designSystem.theme,
          width: Math.max(20, terminalColumns(this.output) - displayWidth(stream.prefix) - 11),
          continuationIndent: " ".repeat(displayWidth(stream.prefix) + 11),
        })}`,
      );
      stream.started = true;
      stream.displayedText = stream.latestText;
    }
    if (stream.started && !stream.displayedText.endsWith("\n")) {
      this.output.write("\n");
    }
  }

  private activityFrame(activity: ActiveActivity): string {
    const contentWidth = Math.max(0, terminalColumns(this.output) - 1);
    if (activity.layout === "inline") {
      return `\r\u001b[2K${this.inlineActivityLine(activity, contentWidth)}`;
    }
    const frame = this.activityMarker(activity);
    const value = truncate(`  ${frame} ${activity.label}`, contentWidth);
    const decorated =
      value.length >= 3
        ? `${value.slice(0, 2)}${this.designSystem.theme.paint("focus", frame)}${value.slice(3)}`
        : value;
    const title = truncate("ORYNT › starting", contentWidth);
    return `\r\u001b[2K${this.designSystem.theme.strong(title)}\n\r\u001b[2K${decorated}`;
  }

  private activityMarker(activity: ActiveActivity): string {
    return this.motion
      ? ACTIVITY_FRAMES[
          activity.markerFrame % ACTIVITY_FRAMES.length
        ]
      : ACTIVITY_FRAMES[0];
  }

  private inlineActivityLine(
    activity: ActiveActivity,
    contentWidth: number,
  ): string {
    const marker = this.activityMarker(activity);
    const duration = formatActivityElapsed(Date.now() - activity.startedAtMs);
    const prefix = `  ${marker} `;
    const suffix = ` · ${duration}`;
    const labelWidth =
      contentWidth - displayWidth(prefix) - displayWidth(suffix);
    if (labelWidth <= 0) {
      const durationWidth = contentWidth - displayWidth(prefix);
      if (durationWidth <= 0) return truncate(`  ${marker}`, contentWidth);
      return `  ${this.designSystem.theme.paint("focus", marker)} ${
        this.designSystem.theme.paint(
          "duration",
          truncate(duration, durationWidth),
        )
      }`;
    }
    const label = truncate(activity.label, labelWidth);
    return [
      "  ",
      this.designSystem.theme.paint("focus", marker),
      " ",
      this.designSystem.activityLabel(
        label,
        this.motion ? activity.shimmerFrame : undefined,
      ),
      this.designSystem.theme.paint("separator", " · "),
      this.designSystem.theme.paint("duration", duration),
    ].join("");
  }

  private clearActivityFrame(activity: ActiveActivity): string {
    return activity.layout === "startup"
      ? "\r\u001b[2K\u001b[1A\r\u001b[2K"
      : "\r\u001b[2K";
  }

  private paintActivity(activity: ActiveActivity): void {
    if (this.activity?.id !== activity.id) return;
    if (this.screen) {
      activity.visible = true;
      this.renderFullscreen();
      return;
    }
    if (this.active?.mode === "live") {
      activity.visible = false;
      this.render();
      return;
    }
    this.output.write(
      `${activity.visible ? this.clearActivityFrame(activity) : ""}${this.activityFrame(activity)}`,
    );
    activity.visible = true;
  }

  private tickActivity(activity: ActiveActivity): void {
    if (
      this.closed ||
      this.activity?.id !== activity.id
    ) {
      return;
    }
    activity.ready = true;
    this.paintActivity(activity);
    if (this.motion) {
      activity.markerFrame =
        (activity.markerFrame + 1) % ACTIVITY_FRAMES.length;
      activity.shimmerFrame += 1;
    } else if (activity.layout === "startup") {
      return;
    }
    activity.timer = setTimeout(
      () => this.tickActivity(activity),
      this.motion ? ACTIVITY_FRAME_MS : STATIC_ACTIVITY_TICK_MS,
    );
    activity.timer.unref?.();
  }

  private stopActivity(): void {
    const activity = this.activity;
    if (!activity) return;
    if (activity.timer) clearTimeout(activity.timer);
    if (activity.visible && !this.screen) {
      this.output.write(this.clearActivityFrame(activity));
    }
    this.activity = undefined;
    if (this.screen) {
      this.renderFullscreen();
    } else if (this.active?.mode === "live") {
      this.render();
    }
  }

  private read(
    prompt: string,
    mode: ActiveRead["mode"],
    selection: {
      choices?: ComposerChoice[];
      currentValue?: string;
      statusContext?: ComposerStatusContext;
    } = {},
    initialValue: ComposerInitialValue = "",
  ): Promise<string> {
    if (this.closed) return Promise.resolve(mode === "compose" ? "/exit" : "");
    if (this.active) return Promise.reject(new Error("Orynt terminal input is already active"));
    this.output.write("\u001b[?2004h");
    const leadingNewlines = prompt.match(/^\n+/)?.[0] ?? "";
    if (leadingNewlines) {
      if (this.screen) this.appendTimeline(leadingNewlines);
      else this.output.write(leadingNewlines);
    }
    const originalPrompt = prompt.slice(leadingNewlines.length);
    const compact =
      mode === "ask" &&
      shouldCompactPrompt(originalPrompt, terminalColumns(this.output));
    if (compact) {
      if (this.screen) this.appendTimeline(`${originalPrompt.trimEnd()}\n`);
      else this.output.write(`${originalPrompt.trimEnd()}\n`);
    }
    const choices = selection.choices ?? [];
    const currentChoice = choices.findIndex(
      (choice) => choice.value === selection.currentValue,
    );
    return new Promise((resolve) => {
      this.active = this.createActiveRead(
        compact ? "› " : originalPrompt,
        mode,
        selection,
        initialValue,
        resolve,
        originalPrompt,
        currentChoice,
      );
      this.render();
    });
  }

  private createActiveRead(
    prompt: string,
    mode: ActiveRead["mode"],
    selection: {
      choices?: ComposerChoice[];
      currentValue?: string;
      statusContext?: ComposerStatusContext;
    },
    initialValue: ComposerInitialValue,
    resolve: (value: string) => void,
    originalPrompt = prompt,
    currentChoice = -1,
  ): ActiveRead {
    const choices = selection.choices ?? [];
    const initialDraft = initialDraftSnapshot(initialValue);
    this.pasteSequence = Math.max(
      this.pasteSequence,
      ...initialDraft.blocks.map((block) => block.id),
      ...initialDraft.images.map((image) => image.id),
    );
    return {
      mode,
      prompt,
      originalPrompt,
      buffer: initialDraft.value,
      cursor: initialDraft.cursor,
      paletteDismissed: false,
      selectedSuggestion: currentChoice >= 0 ? currentChoice : 0,
      renderedLines: [],
      renderedAreaRows: 0,
      renderedCursorRow: 0,
      renderedCursorColumn: 0,
      renderedColumns: 0,
      pendingRenderPrefix: "",
      historyIndex: -1,
      historyDraft: "",
      undoStack: [],
      redoStack: [],
      compactBlocks: initialDraft.blocks,
      images: initialDraft.images,
      lastEditAt: 0,
      choices,
      ...(selection.currentValue
        ? { currentValue: selection.currentValue }
        : {}),
      ...(selection.statusContext
        ? { statusContext: { ...selection.statusContext } }
        : {}),
      resolve,
    };
  }

  private assist(active = this.active): SlashInputAssist {
    if (
      !active ||
      (active.mode !== "compose" && active.mode !== "live") ||
      active.paletteDismissed
    ) {
      return { suggestions: [], canSubmit: false };
    }
    return slashInputAssist(active.buffer, active.cursor);
  }

  private suggestions(active = this.active): SlashInputSuggestion[] {
    return this.assist(active).suggestions;
  }

  private filteredChoices(active = this.active): ComposerChoice[] {
    if (!active || active.mode !== "select") return [];
    const query = active.buffer.trim().toLocaleLowerCase();
    if (!query) return active.choices;
    return active.choices.filter((choice) =>
      [choice.label, choice.value, choice.description ?? ""]
        .some((value) => value.toLocaleLowerCase().includes(query))
    );
  }

  private clearRender(): void {
    const active = this.active;
    if (!active || active.renderedAreaRows === 0) return;
    if (this.screen) {
      active.renderedLines = [];
      active.renderedAreaRows = 0;
      active.renderedCursorRow = 0;
      active.renderedCursorColumn = 0;
      active.renderedColumns = 0;
      active.pendingRenderPrefix = "";
      return;
    }
    let sequence = `\r${verticalMove(-active.renderedCursorRow)}`;
    for (let index = 0; index < active.renderedAreaRows; index += 1) {
      if (index > 0) sequence += "\u001b[1B\r";
      sequence += "\u001b[2K";
    }
    sequence += verticalMove(-(active.renderedAreaRows - 1));
    sequence += "\r";
    this.output.write(sequence);
    active.renderedLines = [];
    active.renderedAreaRows = 0;
    active.renderedCursorRow = 0;
    active.renderedCursorColumn = 0;
    active.renderedColumns = 0;
    active.pendingRenderPrefix = "";
  }

  private displayedDraft(active: ActiveRead): {
    text: string;
    cursor: number;
    selection?: { start: number; end: number };
  } {
    const selection = this.selectionRange(active);
    if (active.compactBlocks.length === 0) {
      const text = visibleDraftInput(active.buffer);
      return {
        text,
        cursor: visibleDraftInput(active.buffer.slice(0, active.cursor)).length,
        ...(selection
          ? {
              selection: {
                start: visibleDraftInput(active.buffer.slice(0, selection.start)).length,
                end: visibleDraftInput(active.buffer.slice(0, selection.end)).length,
              },
            }
          : {}),
      };
    }
    let text = "";
    let sourceOffset = 0;
    let displayCursor = 0;
    const displayOffset = (source: number): number => {
      let result = 0;
      let offset = 0;
      for (const block of [...active.compactBlocks].sort(
        (left, right) => left.start - right.start,
      )) {
        if (source <= block.start) {
          return result + visibleDraftInput(active.buffer.slice(offset, source)).length;
        }
        result += visibleDraftInput(active.buffer.slice(offset, block.start)).length;
        const label = visibleInput(block.label);
        if (source <= block.end) return result + label.length;
        result += label.length;
        offset = block.end;
      }
      return result + visibleDraftInput(active.buffer.slice(offset, source)).length;
    };
    for (const block of [...active.compactBlocks].sort((left, right) => left.start - right.start)) {
      const prefix = active.buffer.slice(sourceOffset, block.start);
      if (active.cursor >= sourceOffset && active.cursor <= block.start) {
        displayCursor = text.length +
          visibleDraftInput(active.buffer.slice(sourceOffset, active.cursor)).length;
      }
      text += visibleDraftInput(prefix);
      const label = visibleInput(block.label);
      if (active.cursor > block.start && active.cursor < block.end) {
        displayCursor = text.length + label.length;
      } else if (active.cursor === block.end) {
        displayCursor = text.length + label.length;
      }
      text += label;
      sourceOffset = block.end;
    }
    if (active.cursor >= sourceOffset) {
      displayCursor = text.length +
        visibleDraftInput(active.buffer.slice(sourceOffset, active.cursor)).length;
    }
    text += visibleDraftInput(active.buffer.slice(sourceOffset));
    return {
      text,
      cursor: displayCursor,
      ...(selection
        ? {
            selection: {
              start: displayOffset(selection.start),
              end: displayOffset(selection.end),
            },
          }
        : {}),
    };
  }

  private createFrame(active: ActiveRead): RenderFrame {
    const columns = terminalColumns(this.output);
    const contentWidth = Math.max(0, columns - 1);
    const suggestions = active.mode === "select"
      ? this.filteredChoices(active)
      : this.suggestions(active);
    const terminalHeight = terminalRows(this.output);
    const liveActivity =
      active.mode === "live" && this.activity?.ready
        ? this.activity
        : undefined;
    const framedMode = active.mode === "compose" || active.mode === "live";
    const showFrame =
      framedMode && terminalHeight >= (liveActivity ? 5 : 4);
    const showLiveActivity = Boolean(liveActivity) && terminalHeight >= 2;
    const prompt = truncate(
      showFrame ? COMPOSER_INPUT_PROMPT : active.prompt,
      contentWidth,
    );
    const promptWidth = displayWidth(prompt);
    const displayedDraft = this.displayedDraft(active);
    const displayBuffer = displayedDraft.text;
    const displayCursor = displayedDraft.cursor;
    const inputWidth = Math.max(0, contentWidth - promptWidth);
    const renderDraftText = (
      value: string,
      rowStart: number,
      rowEnd: number,
    ): string => {
      const selected = displayedDraft.selection;
      if (!selected || selected.end <= rowStart || selected.start >= rowEnd) {
        return !active.buffer.startsWith("/")
          ? renderRichText(value, {
              enabled: this.richText,
              theme: this.designSystem.theme,
              preserveMarkers: true,
              width: inputWidth,
            })
          : value;
      }
      const start = Math.max(0, selected.start - rowStart);
      const end = Math.min(value.length, selected.end - rowStart);
      return [
        value.slice(0, start),
        this.designSystem.theme.paint("selection", value.slice(start, end)),
        value.slice(end),
      ].join("");
    };
    const visualRows =
      showFrame && inputWidth > 0
        ? wrapDraft(displayBuffer, inputWidth)
        : [];
    let visualCursorRow = 0;
    for (const [index, row] of visualRows.entries()) {
      if (row.start <= displayCursor) visualCursorRow = index;
    }
    const maxInputRows = Math.max(
      1,
      Math.min(
        8,
        Math.floor(
          (terminalHeight - (showLiveActivity ? 1 : 0) - 3) / 2,
        ),
      ),
    );
    const inputWindowStart = Math.max(
      0,
      Math.min(
        visualCursorRow - maxInputRows + 1,
        visualRows.length - maxInputRows,
      ),
    );
    const visibleDraftRows = visualRows.slice(
      inputWindowStart,
      inputWindowStart + maxInputRows,
    );
    const input = !showFrame && inputWidth > 0
      ? viewport(displayBuffer, displayCursor, inputWidth)
      : { text: "", cursorColumn: 0 };
    const renderedInput = !showFrame
      ? renderDraftText(input.text, 0, input.text.length)
      : "";
    const paintedPromptRows = showFrame
      ? visibleDraftRows.map((row, index) => {
          const absoluteIndex = inputWindowStart + index;
          const marker = absoluteIndex === 0
            ? COMPOSER_INPUT_PROMPT.trimEnd()
            : row.hardStart
              ? "│"
              : " ";
          const content =
            active.buffer.length === 0 && absoluteIndex === 0
              ? this.designSystem.theme.paint("muted", COMPOSER_PLACEHOLDER)
              : renderDraftText(row.text, row.start, row.end);
          return `${this.designSystem.theme.paint("user", marker)} ${content}`;
        })
      : [paintPromptMarker(this.designSystem.theme, `${prompt}${renderedInput}`)];
    const separator = this.designSystem.theme.paint("muted", "─".repeat(contentWidth));
    const lines = showFrame
      ? [separator, ...paintedPromptRows]
      : paintedPromptRows;
    const showFooter =
      Boolean(this.notice) ||
      (showFrame &&
        (
          active.mode === "live" ||
          this.statusline.enabled
        )) ||
      (terminalHeight >= 3 &&
        (
          active.mode === "select" ||
          suggestions.length > 0 ||
          active.mode === "live" ||
          (active.mode === "compose" && active.buffer.length > 0)
        ));
    const availableRows = Math.max(
      0,
        terminalHeight -
        1 -
        (showFrame ? 3 : 0) -
        (showFrame ? Math.max(0, paintedPromptRows.length - 1) : 0) -
        (showLiveActivity ? 1 : 0) -
        (!showFrame && showFooter ? 1 : 0),
    );
    const selectedChoice =
      active.mode === "select"
        ? (suggestions[active.selectedSuggestion] as ComposerChoice | undefined)
        : undefined;
    const detailLimit =
      terminalHeight >= 8
        ? Math.min(
            4,
            selectedChoice?.details?.length ?? 0,
            Math.max(0, availableRows - 1),
          )
        : 0;
    const rowLimit = Math.min(
      8,
      Math.max(0, availableRows - detailLimit),
    );
    const firstVisible = Math.min(
      Math.max(0, active.selectedSuggestion - rowLimit + 1),
      Math.max(0, suggestions.length - rowLimit),
    );
    const visible = suggestions.slice(firstVisible, firstVisible + rowLimit);
    for (const [index, definition] of visible.entries()) {
      const selected = firstVisible + index === active.selectedSuggestion;
      const line = active.mode === "select"
        ? choiceLine(
            definition as ComposerChoice,
            selected,
            (definition as ComposerChoice).value === active.currentValue,
            contentWidth,
          )
        : suggestionLine(
            definition as SlashInputSuggestion,
            selected,
            contentWidth,
          );
      const paintedLine = paintComposerLine(this.designSystem.theme, line, selected);
      lines.push(paintedLine);
    }
    if (active.mode === "select" && visible.length === 0 && rowLimit > 0) {
      lines.push(truncate("  No matching options", contentWidth));
    }
    for (const detail of selectedChoice?.details?.slice(0, detailLimit) ?? []) {
      lines.push(
        this.designSystem.theme.paint(
          "muted",
          truncate(`  │ ${terminalSafeText(detail)}`, contentWidth),
        ),
      );
    }
    if (showLiveActivity && liveActivity) {
      lines.unshift(this.liveActivityLine(liveActivity, contentWidth));
    }
    if (showFrame) {
      lines.push(separator);
    }
    if (showFooter) {
      const supportsUsefulFiltering =
        active.mode === "select" &&
        (active.buffer.trim().length > 0 || active.choices.length > rowLimit);
      const hint = active.mode === "select"
        ? `  ↑↓ select · Enter confirm · ←/Esc back${
            supportsUsefulFiltering ? " · Type to filter" : ""
          }`
        : active.mode === "live" && active.liveContext
          ? this.liveComposerFooter(active.liveContext, contentWidth)
          : suggestions.length > 0
          ? `  ↑↓ select · Tab complete · ${shortcutListLabel(this.shortcuts.clear)} clear`
          : showFrame
            ? this.statuslineFooter(
                active.statusContext,
                contentWidth,
                (active.statusContext?.pendingCount ?? 0) > 0
                  ? `Ctrl+↑ edit · Esc×2 clear · ${active.statusContext?.pendingCount} pending${active.statusContext?.pendingPaused ? " (paused)" : ""}`
                  : active.buffer.length > 0
                    ? "Enter send · Alt+Enter newline"
                    : undefined,
              )
            : `  ${shortcutListLabel(this.shortcuts.clear)} clear · ${shortcutListLabel(this.shortcuts.undo)} undo · ${shortcutListLabel(this.shortcuts.redo)} redo`;
      const boundedHint = truncate(hint, contentWidth);
      const footerContext = active.mode === "live"
        ? active.liveContext?.status
        : showFrame
          ? active.statusContext
          : undefined;
      const notice = this.notice;
      if (notice) this.scheduleNoticeExpiry(notice);
      lines.push(
        notice
          ? this.designSystem.theme.paint(
              notice.role,
              truncate(
                `  ${notice.role === "success" ? "✓" : "✕"} ${notice.text}`,
                contentWidth,
              ),
            )
          : footerContext && this.statusline.enabled
            ? this.paintStatusline(boundedHint, footerContext)
            : this.designSystem.theme.paint("muted", boundedHint),
      );
    }
    const exitConfirmation =
      this.exitConfirmation?.activeRead === active
        ? this.exitConfirmation
        : undefined;
    if (exitConfirmation) {
      const message =
        `  Press Ctrl+C again to exit Orynt · ${exitConfirmation.displayedSeconds}s`;
      const decorated = paintToken(
        this.designSystem.theme,
        "attention",
        truncate(message, contentWidth),
        "Ctrl+C",
      );
      if (terminalRows(this.output) > 1) {
        lines.push(decorated);
      } else {
        lines[0] = paintToken(
          this.designSystem.theme,
          "attention",
          truncate(message.trimStart(), contentWidth),
          "Ctrl+C",
        );
      }
    }
    const actionConfirmation =
      this.actionConfirmation?.activeRead === active
        ? this.actionConfirmation
        : undefined;
    if (actionConfirmation) {
      const message = actionConfirmation.kind === "cancel"
        ? `  Warning · Press Ctrl+C again to cancel · pending messages will pause · ${actionConfirmation.displayedSeconds}s`
        : `  Warning · Press Esc again to dismiss all ${actionConfirmation.pendingCount} pending message${actionConfirmation.pendingCount === 1 ? "" : "s"} · ${actionConfirmation.displayedSeconds}s`;
      let decorated = paintToken(
        this.designSystem.theme,
        "attention",
        truncate(message, contentWidth),
        "Warning",
      );
      decorated = paintToken(
        this.designSystem.theme,
        "attention",
        decorated,
        actionConfirmation.kind === "cancel" ? "Ctrl+C" : "Esc",
      );
      if (actionConfirmation.kind === "cancel") {
        decorated = paintToken(
          this.designSystem.theme,
          "danger",
          decorated,
          "cancel",
        );
      }
      if (terminalRows(this.output) > 1) {
        lines.push(decorated);
      } else {
        lines[0] = decorated.trimStart();
      }
    }
    return {
      lines,
      cursorRow:
        (showLiveActivity ? 1 : 0) +
        (showFrame ? 1 + visualCursorRow - inputWindowStart : 0),
      cursorColumn: showFrame
        ? displayWidth(COMPOSER_INPUT_PROMPT) +
          displayWidth(
            displayBuffer.slice(
              visualRows[visualCursorRow]?.start ?? 0,
              displayCursor,
            ),
          )
        : promptWidth + input.cursorColumn,
    };
  }

  private statuslineFooter(
    context: ComposerStatusContext | undefined,
    contentWidth: number,
    mandatoryTail?: string,
  ): string {
    const fields = { ...this.statusline };
    let showContextBar = true;
    let quotaVariant: ProviderQuotaVariant = "two-windows";
    const render = (): string => {
      const leftSegments: string[] = [];
      const rightSegments: string[] = [];
      if (fields.profile && context?.preset) {
        leftSegments.push(terminalSafeText(context.preset));
      }
      if (fields.role && context) {
        const role =
          context.mode === "next"
            ? "next"
            : context.mode === "phase"
              ? context.phaseLabel
              : context.role;
        if (role) leftSegments.push(terminalSafeText(role));
      }
      const model = fields.model && context?.modelId
        ? terminalSafeText(context.modelId)
        : "";
      const effort = fields.effort && context?.thinkingEffort
        ? terminalSafeText(context.thinkingEffort)
        : "";
      if (fields.context) {
        rightSegments.push(
          contextMeterText(
            context?.context,
            this.statusline.contextFormat,
            showContextBar,
          ),
        );
      }
      const quota = fields.quota
        ? providerQuotaText(
            context?.providerUsage ?? this.providerUsage,
            quotaVariant,
          )
        : undefined;
      if (quota) rightSegments.push(quota);
      if (model && effort) {
        rightSegments.push(`${model}/${effort}`);
      } else if (model) {
        rightSegments.push(model);
      } else if (effort) {
        rightSegments.push(`effort ${effort}`);
      }
      if (fields.shortcuts) {
        leftSegments.push(
          `${shortcutListLabel(this.shortcuts.clear)} clear`,
          `${shortcutListLabel(this.shortcuts.undo)} undo`,
          `${shortcutListLabel(this.shortcuts.redo)} redo`,
        );
      }
      if (mandatoryTail) leftSegments.push(mandatoryTail);

      const left = leftSegments.length > 0
        ? `  ⏵ ${leftSegments.join(" · ")}`
        : "";
      const right = rightSegments.join(" · ");
      if (!right) return left;
      if (!left) {
        return `${" ".repeat(
          Math.max(0, contentWidth - displayWidth(right)),
        )}${right}`;
      }
      const gap = Math.max(
        2,
        contentWidth - displayWidth(left) - displayWidth(right),
      );
      return `${left}${" ".repeat(gap)}${right}`;
    };
    let value = render();
    const reductions = [
      () => {
        fields.shortcuts = false;
      },
      () => {
        showContextBar = false;
      },
      () => {
        quotaVariant = "one-window";
      },
      () => {
        fields.quota = false;
      },
      () => {
        fields.profile = false;
      },
      () => {
        fields.effort = false;
      },
      () => {
        fields.role = false;
      },
      () => {
        fields.context = false;
      },
      () => {
        fields.model = false;
      },
    ];
    for (const reduce of reductions) {
      if (displayWidth(value) <= contentWidth) break;
      reduce();
      value = render();
    }
    return truncate(
      value || (mandatoryTail ? `  ⏵ ${mandatoryTail}` : ""),
      contentWidth,
    );
  }

  private paintStatusline(
    value: string,
    context: ComposerStatusContext,
  ): string {
    const percent = contextMeterPercent(context.context);
    if (!context.context) {
      return this.designSystem.span("muted", value);
    }
    const meter = value.match(
      /(?:[▰▱]{5} )?(?:[0-9.]+[kmb]?\/[0-9.]+[kmb]?|\d{1,3}%)/u,
    );
    if (!meter || meter.index === undefined) {
      return this.designSystem.span("muted", value);
    }
    const progress = contextGradientProgress(context.context, percent ?? 0);
    const before = value.slice(0, meter.index);
    const plainMeter = meter[0];
    const after = value.slice(meter.index + plainMeter.length);
    const bar = plainMeter.match(/[▰▱]{5}/u)?.[0];
    const renderedBar = bar
      ? Array.from(bar, (cell) => {
          return cell === "▰"
            ? this.designSystem.theme.paintContextUsage(progress, cell)
            : this.designSystem.span("separator", cell);
        }).join("")
      : undefined;
    const renderedMeter = bar
      ? [
          this.designSystem.span("muted", plainMeter.slice(0, plainMeter.indexOf(bar))),
          renderedBar,
          this.designSystem.theme.paintContextUsage(
            progress,
            plainMeter.slice(plainMeter.indexOf(bar) + bar.length),
          ),
        ].join("")
      : this.designSystem.theme.paintContextUsage(progress, plainMeter);
    return [
      this.designSystem.span("muted", before),
      renderedMeter,
      this.designSystem.span("muted", after),
    ].join("");
  }

  private liveComposerFooter(
    context: LiveComposerContext,
    contentWidth: number,
  ): string {
    const hint = liveComposerHint(context, contentWidth);
    if (!this.statusline.enabled) {
      return truncate(`  ⏵ ${hint}`, contentWidth);
    }
    return this.statuslineFooter(context.status, contentWidth, hint);
  }

  private liveActivityLine(
    activity: ActiveActivity,
    contentWidth: number,
  ): string {
    return this.inlineActivityLine(activity, contentWidth);
  }

  private paintFrame(active: ActiveRead, frame: RenderFrame): void {
    if (this.screen) {
      this.renderFullscreen();
      return;
    }
    const previousLines = active.renderedLines;
    const columns = terminalColumns(this.output);
    const forceRepaint = active.renderedColumns !== columns;
    const rowCount = Math.max(previousLines.length, frame.lines.length);
    const knownRows = Math.max(1, active.renderedAreaRows);
    let sequence = active.pendingRenderPrefix;
    let terminalRow = active.renderedCursorRow;

    const moveToRow = (targetRow: number) => {
      if (targetRow < knownRows) {
        sequence += verticalMove(targetRow - terminalRow);
        terminalRow = targetRow;
        return;
      }
      if (terminalRow < knownRows - 1) {
        sequence += verticalMove(knownRows - 1 - terminalRow);
        terminalRow = knownRows - 1;
      }
      while (terminalRow < targetRow) {
        sequence += "\r\n";
        terminalRow += 1;
      }
    };

    for (let index = 0; index < rowCount; index += 1) {
      const nextLine = frame.lines[index] ?? "";
      if (!forceRepaint && previousLines[index] === nextLine) continue;
      moveToRow(index);
      sequence += `\r\u001b[2K${nextLine}`;
    }

    if (
      sequence ||
      active.renderedCursorRow !== frame.cursorRow ||
      active.renderedCursorColumn !== frame.cursorColumn
    ) {
      sequence += verticalMove(frame.cursorRow - terminalRow);
      sequence += cursorPosition(frame.cursorColumn);
      this.output.write(sequence);
    }

    active.renderedLines = [...frame.lines];
    active.renderedAreaRows = Math.max(
      active.renderedAreaRows,
      frame.lines.length,
    );
    active.renderedCursorRow = frame.cursorRow;
    active.renderedCursorColumn = frame.cursorColumn;
    active.renderedColumns = columns;
    active.pendingRenderPrefix = "";
  }

  private render(): void {
    const active = this.active;
    if (!active) return;
    if (this.screen) {
      this.renderFullscreen();
      return;
    }
    this.paintFrame(active, this.createFrame(active));
  }

  private finish(value: string, options: { echo?: boolean } = {}): void {
    const active = this.active;
    if (!active) return;
    this.disarmExitConfirmation();
    this.disarmActionConfirmation();
    this.stopMouseSelectionDrag();
    if (this.notice?.timer) clearTimeout(this.notice.timer);
    this.notice = undefined;
    this.pendingMouseInput = undefined;
    this.clearRender();
    if (options.echo !== false) {
      const input = this.displayedDraft(active).text;
      const rendered =
        active.mode === "compose" && !active.buffer.startsWith("/")
          ? renderRichText(input, {
              enabled: this.richText,
              theme: this.designSystem.theme,
              preserveMarkers: true,
              width: Math.max(
                20,
                terminalColumns(this.output) - displayWidth(active.prompt) - 1,
              ),
              continuationIndent: " ".repeat(displayWidth(active.prompt)),
            })
          : input;
      if (this.isChatSubmission(active)) {
        this.writeSubmittedUserMessage(active, rendered);
      } else if (this.screen) {
        this.appendTimeline(`${active.prompt}${rendered}\n`);
      } else {
        this.output.write(`${active.prompt}${rendered}\n`);
      }
    }
    this.lastSubmittedImages = active.images.map((attachment) => ({
      ...attachment.image,
    }));
    this.lastSubmittedDraft = this.draftSnapshot(active);
    this.active = undefined;
    if (this.screen) this.renderFullscreen();
    active.resolve(value);
  }

  private disarmExitConfirmation(): void {
    const confirmation = this.exitConfirmation;
    if (!confirmation) return;
    if (confirmation.timer) clearTimeout(confirmation.timer);
    this.exitConfirmation = undefined;
  }

  private scheduleExitConfirmationTick(confirmation: ExitConfirmation): void {
    if (
      this.closed ||
      this.exitConfirmation !== confirmation ||
      this.active !== confirmation.activeRead
    ) {
      return;
    }
    const remainingMs = confirmation.deadline - Date.now();
    if (remainingMs <= 0) {
      this.exitConfirmation = undefined;
      this.render();
      return;
    }
    const remainingSeconds = Math.ceil(remainingMs / 1_000);
    if (remainingSeconds !== confirmation.displayedSeconds) {
      confirmation.displayedSeconds = remainingSeconds;
      this.render();
    }
    const untilNextBoundary =
      remainingMs - (remainingSeconds - 1) * 1_000;
    confirmation.timer = setTimeout(
      () => this.scheduleExitConfirmationTick(confirmation),
      Math.max(1, untilNextBoundary),
    );
    confirmation.timer.unref?.();
  }

  private armExitConfirmation(active: ActiveRead): void {
    this.disarmExitConfirmation();
    const confirmation: ExitConfirmation = {
      activeRead: active,
      deadline: Date.now() + EXIT_CONFIRMATION_SECONDS * 1_000,
      displayedSeconds: EXIT_CONFIRMATION_SECONDS,
    };
    this.exitConfirmation = confirmation;
    this.render();
    this.scheduleExitConfirmationTick(confirmation);
  }

  private exitIsArmed(active: ActiveRead): boolean {
    const confirmation = this.exitConfirmation;
    if (!confirmation || confirmation.activeRead !== active) return false;
    if (Date.now() < confirmation.deadline) return true;
    this.disarmExitConfirmation();
    return false;
  }

  private disarmActionConfirmation(): void {
    const confirmation = this.actionConfirmation;
    if (!confirmation) return;
    if (confirmation.timer) clearTimeout(confirmation.timer);
    this.actionConfirmation = undefined;
  }

  private scheduleActionConfirmationTick(
    confirmation: ActionConfirmation,
  ): void {
    if (
      this.closed ||
      this.actionConfirmation !== confirmation ||
      this.active !== confirmation.activeRead
    ) {
      return;
    }
    const remainingMs = confirmation.deadline - Date.now();
    if (remainingMs <= 0) {
      this.actionConfirmation = undefined;
      this.render();
      return;
    }
    const remainingSeconds = Math.ceil(remainingMs / 1_000);
    if (remainingSeconds !== confirmation.displayedSeconds) {
      confirmation.displayedSeconds = remainingSeconds;
      this.render();
    }
    const untilNextBoundary =
      remainingMs - (remainingSeconds - 1) * 1_000;
    confirmation.timer = setTimeout(
      () => this.scheduleActionConfirmationTick(confirmation),
      Math.max(1, untilNextBoundary),
    );
    confirmation.timer.unref?.();
  }

  private armActionConfirmation(
    active: ActiveRead,
    kind: ActionConfirmation["kind"],
    pendingCount: number,
  ): void {
    this.disarmExitConfirmation();
    this.disarmActionConfirmation();
    const confirmation: ActionConfirmation = {
      kind,
      activeRead: active,
      deadline: Date.now() + EXIT_CONFIRMATION_SECONDS * 1_000,
      displayedSeconds: EXIT_CONFIRMATION_SECONDS,
      pendingCount,
    };
    this.actionConfirmation = confirmation;
    this.render();
    this.scheduleActionConfirmationTick(confirmation);
  }

  private actionIsArmed(
    active: ActiveRead,
    kind: ActionConfirmation["kind"],
  ): boolean {
    const confirmation = this.actionConfirmation;
    if (
      !confirmation ||
      confirmation.activeRead !== active ||
      confirmation.kind !== kind
    ) {
      return false;
    }
    if (Date.now() < confirmation.deadline) return true;
    this.disarmActionConfirmation();
    return false;
  }

  private completeSuggestion(): void {
    const active = this.active;
    if (!active) return;
    const assist = this.assist(active);
    const suggestions = assist.suggestions;
    const selected = suggestions[active.selectedSuggestion];
    if (!selected) return;
    this.recordEdit(active, "command", true);
    const before = active.buffer.slice(0, selected.replaceStart);
    const after = active.buffer.slice(selected.replaceEnd);
    const separator =
      selected.appendSpace && !/^\s/u.test(after)
        ? " "
        : "";
    active.buffer = `${before}${selected.completion}${separator}${after}`;
    active.cursor =
      before.length + selected.completion.length + separator.length;
    active.paletteDismissed = !selected.continueAssist;
    active.selectedSuggestion = 0;
    this.render();
  }

  private moveHistory(direction: 1 | -1): void {
    const active = this.active;
    if (
      !active ||
      (active.mode !== "compose" && active.mode !== "live") ||
      this.history.length === 0
    ) {
      return;
    }
    const canMove =
      direction === 1
        ? active.historyIndex < this.history.length - 1
        : active.historyIndex >= 0;
    if (!canMove) return;
    this.recordEdit(active, "command", true);
    if (direction === 1) {
      if (active.historyIndex === -1) active.historyDraft = active.buffer;
      active.historyIndex = Math.min(this.history.length - 1, active.historyIndex + 1);
      active.buffer = this.history[active.historyIndex] ?? active.buffer;
    } else if (active.historyIndex > 0) {
      active.historyIndex -= 1;
      active.buffer = this.history[active.historyIndex] ?? active.buffer;
    } else if (active.historyIndex === 0) {
      active.historyIndex = -1;
      active.buffer = active.historyDraft;
    }
    active.cursor = active.buffer.length;
    active.selectionAnchor = undefined;
    active.preferredColumn = undefined;
    active.paletteDismissed = true;
    this.render();
  }

  private resetPalette(): void {
    const active = this.active;
    if (!active) return;
    active.paletteDismissed = false;
    active.selectedSuggestion = 0;
    active.historyIndex = -1;
  }

  private selectionRange(
    active: ActiveRead,
  ): { start: number; end: number } | undefined {
    const anchor = active.selectionAnchor;
    if (anchor === undefined || anchor === active.cursor) return undefined;
    return {
      start: Math.min(anchor, active.cursor),
      end: Math.max(anchor, active.cursor),
    };
  }

  private moveCursor(
    active: ActiveRead,
    target: number,
    extend = false,
  ): void {
    const bounded = Math.max(0, Math.min(active.buffer.length, target));
    if (extend) {
      active.selectionAnchor ??= active.cursor;
    } else {
      active.selectionAnchor = undefined;
    }
    active.cursor = bounded;
    active.lastEditKind = undefined;
    active.preferredColumn = undefined;
    this.render();
  }

  private atomicBoundary(
    active: ActiveRead,
    target: number,
    direction: "left" | "right",
  ): number {
    const block = active.compactBlocks.find(
      (candidate) => target > candidate.start && target < candidate.end,
    );
    if (!block) return target;
    return direction === "left" ? block.start : block.end;
  }

  private collapseOrMove(
    active: ActiveRead,
    direction: "left" | "right",
    target: () => number,
  ): void {
    const selection = this.selectionRange(active);
    this.moveCursor(
      active,
      selection
        ? direction === "left"
          ? selection.start
          : selection.end
        : target(),
    );
  }

  private draftVisualRows(active: ActiveRead): VisualDraftRow[] {
    return wrapDraft(
      active.buffer,
      Math.max(
        1,
        terminalColumns(this.output) - displayWidth(COMPOSER_INPUT_PROMPT),
      ),
    );
  }

  private visualCursorRow(
    active: ActiveRead,
    rows = this.draftVisualRows(active),
  ): number {
    let result = 0;
    for (const [index, row] of rows.entries()) {
      if (row.start <= active.cursor) result = index;
    }
    return result;
  }

  private moveVertically(
    active: ActiveRead,
    direction: -1 | 1,
    extend: boolean,
  ): boolean {
    const rows = this.draftVisualRows(active);
    const rowIndex = this.visualCursorRow(active, rows);
    const targetRow = rows[rowIndex + direction];
    const currentRow = rows[rowIndex];
    if (!targetRow || !currentRow) return false;
    const column =
      active.preferredColumn ??
      displayWidth(active.buffer.slice(currentRow.start, active.cursor));
    if (extend) active.selectionAnchor ??= active.cursor;
    else active.selectionAnchor = undefined;
    active.cursor = offsetAtColumn(
      active.buffer,
      targetRow.start,
      targetRow.end,
      column,
    );
    active.cursor = this.atomicBoundary(
      active,
      active.cursor,
      direction < 0 ? "left" : "right",
    );
    active.preferredColumn = column;
    active.lastEditKind = undefined;
    this.render();
    return true;
  }

  private editSnapshot(active: ActiveRead): EditSnapshot {
    return {
      buffer: active.buffer,
      cursor: active.cursor,
      selectionAnchor: active.selectionAnchor,
      preferredColumn: active.preferredColumn,
      paletteDismissed: active.paletteDismissed,
      selectedSuggestion: active.selectedSuggestion,
      historyIndex: active.historyIndex,
      historyDraft: active.historyDraft,
      compactBlocks: active.compactBlocks.map((block) => ({ ...block })),
      images: active.images.map((attachment) => ({
        ...attachment,
        image: { ...attachment.image },
      })),
    };
  }

  private draftSnapshot(active: ActiveRead): ComposerDraftSnapshot {
    return {
      value: active.buffer,
      cursor: active.cursor,
      blocks: active.compactBlocks.map((block) => ({ ...block })),
      images: active.images.map((attachment) => ({
        ...attachment,
        image: { ...attachment.image },
      })),
    };
  }

  private restoreDraftSnapshot(
    active: ActiveRead,
    snapshot: ComposerDraftSnapshot,
  ): void {
    const draft = cloneDraftSnapshot(snapshot);
    active.buffer = draft.value;
    active.cursor = draft.cursor;
    active.selectionAnchor = undefined;
    active.preferredColumn = undefined;
    active.paletteDismissed = false;
    active.selectedSuggestion = 0;
    active.historyIndex = -1;
    active.historyDraft = "";
    active.undoStack = [];
    active.redoStack = [];
    active.compactBlocks = draft.blocks;
    active.images = draft.images;
    active.lastEditKind = undefined;
    this.pasteSequence = Math.max(
      this.pasteSequence,
      ...draft.blocks.map((block) => block.id),
      ...draft.images.map((image) => image.id),
    );
    this.render();
  }

  private pushEditSnapshot(
    stack: EditSnapshot[],
    snapshot: EditSnapshot,
  ): void {
    stack.push(snapshot);
    while (
      stack.length > 100 ||
      stack.reduce((total, entry) => total + entry.buffer.length * 2, 0) >
        1_000_000
    ) {
      stack.shift();
    }
  }

  private recordEdit(
    active: ActiveRead,
    kind: EditKind,
    force = false,
  ): void {
    const now = Date.now();
    const grouped =
      !force &&
      active.lastEditKind === kind &&
      now - active.lastEditAt <= 750;
    if (!grouped) {
      this.pushEditSnapshot(active.undoStack, this.editSnapshot(active));
    }
    active.redoStack = [];
    active.lastEditKind = kind;
    active.lastEditAt = now;
  }

  private restoreEdit(active: ActiveRead, snapshot: EditSnapshot): void {
    Object.assign(active, snapshot);
    active.lastEditKind = undefined;
    active.lastEditAt = 0;
    this.render();
  }

  private undo(active: ActiveRead): void {
    const snapshot = active.undoStack.pop();
    if (!snapshot) return;
    this.pushEditSnapshot(active.redoStack, this.editSnapshot(active));
    this.restoreEdit(active, snapshot);
  }

  private redo(active: ActiveRead): void {
    const snapshot = active.redoStack.pop();
    if (!snapshot) return;
    this.pushEditSnapshot(active.undoStack, this.editSnapshot(active));
    this.restoreEdit(active, snapshot);
  }

  private clearDraft(active: ActiveRead): void {
    if (!active.buffer) return;
    this.recordEdit(active, "command", true);
    active.buffer = "";
    active.cursor = 0;
    active.selectionAnchor = undefined;
    active.preferredColumn = undefined;
    active.paletteDismissed = false;
    active.selectedSuggestion = 0;
    active.historyIndex = -1;
    active.historyDraft = "";
    active.compactBlocks = [];
    active.images = [];
    this.disarmExitConfirmation();
    this.disarmActionConfirmation();
    this.render();
  }

  private shiftBlocks(
    active: ActiveRead,
    from: number,
    delta: number,
  ): void {
    if (delta === 0) return;
    for (const block of active.compactBlocks) {
      if (block.start >= from) {
        block.start += delta;
        block.end += delta;
      }
    }
  }

  private insertDraftText(
    active: ActiveRead,
    value: string,
    compact?: { kind: CompactInputBlock["kind"]; label: string },
  ): boolean {
    if (!value) return false;
    if (compact && active.compactBlocks.length >= 8) {
      this.write("Paste not added · a draft supports at most 8 compact items.");
      return false;
    }
    const nextBytes = Buffer.byteLength(active.buffer) + Buffer.byteLength(value);
    if (nextBytes > 64 * 1024) {
      this.write("Paste not added · the draft exceeds 64 KiB.");
      return false;
    }
    const selection = this.selectionRange(active);
    const start = selection?.start ?? active.cursor;
    const end = selection?.end ?? active.cursor;
    this.recordEdit(active, "insert", Boolean(compact) || Boolean(selection));
    const removedIds = new Set(
      active.compactBlocks
        .filter((block) => block.start < end && block.end > start)
        .map((block) => block.id),
    );
    const delta = value.length - (end - start);
    active.compactBlocks = active.compactBlocks
      .filter((block) => !removedIds.has(block.id))
      .map((block) =>
        block.start >= end
          ? { ...block, start: block.start + delta, end: block.end + delta }
          : block
      );
    active.images = active.images.filter(
      (attachment) => !removedIds.has(attachment.id),
    );
    active.buffer =
      `${active.buffer.slice(0, start)}${value}${active.buffer.slice(end)}`;
    active.cursor = start + value.length;
    active.selectionAnchor = undefined;
    active.preferredColumn = undefined;
    if (compact) {
      active.compactBlocks.push({
        id: ++this.pasteSequence,
        start,
        end: start + value.length,
        label: compact.label,
        kind: compact.kind,
      });
      active.compactBlocks.sort((left, right) => left.start - right.start);
    }
    this.resetPalette();
    this.render();
    return true;
  }

  private addImageAttachment(
    active: ActiveRead,
    value: Extract<SmartPastePath, { kind: "image" }>,
  ): boolean {
    if (active.images.length >= 4) {
      this.write("Image not added · a draft supports at most 4 images.");
      return false;
    }
    const number = active.images.length + 1;
    const text = `Attached image ${number}: ${value.label}`;
    const inserted = this.insertDraftText(active, text, {
      kind: "image",
      label: `[Image #${number} · ${value.label} · ${value.width}×${value.height}]`,
    });
    if (!inserted) return false;
    active.images.push({
      id: this.pasteSequence,
      image: { ...value.image },
    });
    return true;
  }

  private async applyPaste(active: ActiveRead, raw: string): Promise<void> {
    if (this.active !== active) return;
    const value = normalizePastedText(raw);
    if (!value) return;
    const paths = await this.clipboard?.resolveDroppedPaths(value).catch(() => undefined);
    if (this.active !== active) return;
    if (paths?.length) {
      let attached = 0;
      for (const [index, item] of paths.entries()) {
        if (index > 0) this.insertDraftText(active, " ");
        if (item.kind === "image") {
          if (this.addImageAttachment(active, item)) attached += 1;
        } else {
          if (this.insertDraftText(active, item.path, {
            kind: "path",
            label: `[Path #${index + 1} · ${item.label}${item.directory ? "/" : ""}]`,
          })) attached += 1;
        }
      }
      if (attached > 0) {
        this.notify(`Attached · ${attached} item${attached === 1 ? "" : "s"}`);
      }
      return;
    }
    const lineCount = value.split("\n").length;
    if (Buffer.byteLength(value) > 2 * 1024 || lineCount > 12) {
      const inserted = this.insertDraftText(active, value, {
        kind: "pasted_text",
        label:
          `[Pasted text #${active.compactBlocks.filter((block) => block.kind === "pasted_text").length + 1} · ${lineCount} lines · ${Buffer.byteLength(value)} B]`,
      });
      if (inserted) {
        this.notify(
          `Pasted · ${lineCount} lines · ${Buffer.byteLength(value)} B`,
        );
      }
      return;
    }
    if (this.insertDraftText(active, value)) {
      this.notify(`Pasted · ${graphemeCount(value)} characters`);
    }
  }

  private async applyClipboard(
    active: ActiveRead,
    mode: ClipboardReadMode,
  ): Promise<void> {
    if (!this.clipboard) {
      this.write("Clipboard paste is unavailable in this host.");
      return;
    }
    try {
      const payload = await this.clipboard.read(mode);
      if (this.active !== active) return;
      if (payload.kind === "text") {
        await this.applyPaste(active, payload.text);
      } else {
        if (this.addImageAttachment(active, payload)) {
          this.notify(`Attached · ${payload.label}`);
        }
      }
    } catch (error) {
      if (this.active !== active) return;
      this.write(
        `Clipboard paste failed: ${terminalSafeText(
          error instanceof Error ? error.message : String(error),
        )}`,
      );
    }
  }

  private async copySelection(
    active: ActiveRead,
    cut: boolean,
  ): Promise<void> {
    const selection = this.selectionRange(active);
    const chatSelection = !selection && !cut
      ? this.screen?.selectedText()
      : undefined;
    if (!selection && !chatSelection) return;
    if (!this.clipboard) {
      this.write("Clipboard copy unavailable.");
      return;
    }
    const value = selection
      ? active.buffer.slice(selection.start, selection.end)
      : chatSelection!;
    try {
      await this.clipboard.writeText(value);
      this.notify(
        `${cut ? "Cut" : "Copied"} · ${graphemeCount(value)} characters`,
      );
      if (!cut || this.active !== active) return;
      const current = this.selectionRange(active);
      if (
        !current ||
        !selection ||
        current.start !== selection.start ||
        current.end !== selection.end ||
        active.buffer.slice(current.start, current.end) !== value
      ) {
        return;
      }
      this.removeDraftRange(active, current.start, current.end);
    } catch (error) {
      this.write(
        `Copy failed · ${terminalSafeText(
          error instanceof Error ? error.message : String(error),
        )}`,
      );
    }
  }

  private async copyChatSelection(): Promise<void> {
    const value = this.screen?.selectedText();
    if (!value) return;
    if (!this.clipboard) {
      this.write("Clipboard copy unavailable.");
      return;
    }
    try {
      await this.clipboard.writeText(value);
      this.notify(
        `Copied selection · ${graphemeCount(value)} characters`,
      );
    } catch (error) {
      this.write(
        `Copy failed · ${terminalSafeText(
          error instanceof Error ? error.message : String(error),
        )}`,
      );
    }
  }

  private blockEndingAt(active: ActiveRead, offset: number): CompactInputBlock | undefined {
    return active.compactBlocks.find((block) => block.end === offset);
  }

  private blockStartingAt(active: ActiveRead, offset: number): CompactInputBlock | undefined {
    return active.compactBlocks.find((block) => block.start === offset);
  }

  private removeBlock(active: ActiveRead, block: CompactInputBlock): void {
    this.recordEdit(active, "delete", true);
    const length = block.end - block.start;
    active.buffer =
      `${active.buffer.slice(0, block.start)}${active.buffer.slice(block.end)}`;
    active.compactBlocks = active.compactBlocks
      .filter((candidate) => candidate.id !== block.id)
      .map((candidate) =>
        candidate.start >= block.end
          ? {
              ...candidate,
              start: candidate.start - length,
              end: candidate.end - length,
            }
          : candidate
      );
    if (block.kind === "image") {
      active.images = active.images.filter((attachment) => attachment.id !== block.id);
    }
    active.cursor = block.start;
    active.selectionAnchor = undefined;
    active.preferredColumn = undefined;
    this.resetPalette();
    this.render();
  }

  private removeDraftRange(active: ActiveRead, start: number, end: number): void {
    if (end <= start) return;
    this.recordEdit(active, "command", true);
    const removedIds = new Set(
      active.compactBlocks
        .filter((block) => block.start < end && block.end > start)
        .map((block) => block.id),
    );
    active.buffer = `${active.buffer.slice(0, start)}${active.buffer.slice(end)}`;
    const delta = end - start;
    active.compactBlocks = active.compactBlocks
      .filter((block) => !removedIds.has(block.id))
      .map((block) =>
        block.start >= end
          ? { ...block, start: block.start - delta, end: block.end - delta }
          : block
      );
    active.images = active.images.filter((attachment) => !removedIds.has(attachment.id));
    active.cursor = start;
    active.selectionAnchor = undefined;
    active.preferredColumn = undefined;
    this.resetPalette();
    this.render();
  }

  private handleKeypress = (value: string, key: Key): void => {
    if (this.consumeMouseKeypress(value, key)) return;
    const keyValue = value ?? "";
    if (key.name === "paste-start") {
      this.pendingPaste = "";
      return;
    }
    if (this.pendingPaste !== undefined) {
      if (key.name === "paste-end") {
        const pasted = this.pendingPaste;
        this.pendingPaste = undefined;
        const active = this.active;
        if (active) void this.applyPaste(active, pasted);
        return;
      }
      this.pendingPaste += key.sequence ?? keyValue;
      if (Buffer.byteLength(this.pendingPaste) > 64 * 1024) {
        this.pendingPaste = undefined;
        this.write("Paste not added · clipboard text exceeds 64 KiB.");
      }
      return;
    }
    const page = Math.max(1, terminalRows(this.output) - 4);
    if (this.screen && key.name === "pageup") {
      if (this.screen.scroll(page)) this.renderFullscreen();
      return;
    }
    if (this.screen && key.name === "pagedown") {
      if (this.screen.scroll(-page)) this.renderFullscreen();
      return;
    }
    if (this.screen && key.ctrl && key.name === "home") {
      if (this.screen.scrollToTop()) this.renderFullscreen();
      return;
    }
    if (this.screen && key.ctrl && key.name === "end") {
      if (this.screen.scrollToTail()) this.renderFullscreen();
      return;
    }
    const active = this.active;
    if (!active) {
      if (key.ctrl && key.name === "c") this.onInterrupt();
      return;
    }
    const pendingCount =
      active.liveContext?.pendingCount ??
      active.statusContext?.pendingCount ??
      0;
    const composerEditing =
      active.mode === "compose" || active.mode === "live";
    const altEditingShortcutIsReserved =
      key.meta &&
      (
        shortcutMatches(this.shortcuts, "clear", key) ||
        shortcutMatches(this.shortcuts, "undo", key) ||
        shortcutMatches(this.shortcuts, "redo", key)
      );
    const hasSelection = Boolean(
      this.selectionRange(active) || this.screen?.hasSelection(),
    );
    const copyShortcut =
      (composerEditing || Boolean(this.screen?.hasSelection())) &&
      (
        (key.ctrl && key.name === "c" && (key.shift || hasSelection)) ||
        (
          key.meta &&
          key.name === "c" &&
          !altEditingShortcutIsReserved
        )
      );
    const pasteShortcut =
      composerEditing &&
      (
        (key.ctrl && key.shift && key.name === "v") ||
        (
          key.meta &&
          key.name === "v" &&
          !altEditingShortcutIsReserved
        )
      );
    if (copyShortcut) {
      this.disarmActionConfirmation();
      void this.copySelection(active, false);
      return;
    }
    if (pasteShortcut) {
      this.disarmActionConfirmation();
      void this.applyClipboard(active, "text");
      return;
    }
    if (composerEditing && key.ctrl && key.name === "x") {
      this.disarmActionConfirmation();
      void this.copySelection(active, true);
      return;
    }

    if (active.mode === "live" && key.ctrl && key.name === "c") {
      if (!this.actionIsArmed(active, "cancel")) {
        this.armActionConfirmation(active, "cancel", pendingCount);
        return;
      }
      this.disarmActionConfirmation();
      active.onLiveSubmission?.({ kind: "stop", draft: active.buffer });
      return;
    }

    const matchingActionConfirmation =
      this.actionConfirmation?.activeRead === active &&
      (
        (this.actionConfirmation.kind === "cancel" &&
          key.ctrl &&
          key.name === "c") ||
        (this.actionConfirmation.kind === "clear_pending" &&
          key.name === "escape")
      );
    if (this.actionConfirmation && !matchingActionConfirmation) {
      this.disarmActionConfirmation();
    }

    if (
      key.meta &&
      (key.name === "return" || key.name === "enter") &&
      active.mode !== "select"
    ) {
      this.insertDraftText(active, "\n");
      return;
    }

    if (active.mode === "compose" || active.mode === "live") {
      if (
        this.selectionRange(active) &&
        shortcutMatches(this.shortcuts, "clear", key)
      ) {
        active.selectionAnchor = undefined;
        this.render();
        return;
      }
      if (
        !this.selectionRange(active) &&
        key.name === "escape" &&
        this.screen?.clearSelection()
      ) {
        this.renderFullscreen();
        return;
      }
      if (
        active.buffer.length > 0 &&
        shortcutMatches(this.shortcuts, "clear", key)
      ) {
        this.clearDraft(active);
        return;
      }
      if (shortcutMatches(this.shortcuts, "undo", key)) {
        this.disarmExitConfirmation();
        this.undo(active);
        return;
      }
      if (shortcutMatches(this.shortcuts, "redo", key)) {
        this.disarmExitConfirmation();
        this.redo(active);
        return;
      }
    }

    if (key.ctrl && key.name === "c") {
      if (active.mode === "ask" || active.mode === "select") {
        this.clearRender();
        this.active = undefined;
        active.resolve(INTERRUPTED_INPUT);
      } else {
        if (this.exitIsArmed(active)) {
          this.finish("/exit", { echo: false });
          return;
        }
        this.armExitConfirmation(active);
      }
      return;
    }

    const dismissedExitConfirmation =
      this.exitConfirmation?.activeRead === active;
    if (dismissedExitConfirmation) this.disarmExitConfirmation();

    if (key.ctrl && key.name === "d" && active.buffer.length === 0) {
      this.finish(active.mode === "compose" ? "/exit" : "", { echo: false });
      if (!this.screen) this.output.write("\n");
      return;
    }

    if (
      key.ctrl &&
      key.name === "up" &&
      (active.mode === "compose" || active.mode === "live") &&
      active.buffer.trim().length === 0 &&
      active.images.length === 0 &&
      pendingCount > 0
    ) {
      this.disarmActionConfirmation();
      if (active.mode === "live") {
        const result = active.onLiveSubmission?.({ kind: "edit_pending" });
        if (result?.draft) this.restoreDraftSnapshot(active, result.draft);
      } else {
        this.finish(EDIT_PENDING_INPUT, { echo: false });
      }
      return;
    }

    if (key.ctrl && key.name === "a") {
      if (active.buffer.length > 0) {
        active.selectionAnchor = 0;
        active.cursor = active.buffer.length;
        active.lastEditKind = undefined;
        active.preferredColumn = undefined;
        this.render();
      }
      return;
    }
    if (key.ctrl && key.name === "e") {
      this.moveCursor(active, active.buffer.length);
      return;
    }
    if (key.ctrl && key.name === "u") {
      this.removeDraftRange(active, 0, active.cursor);
      return;
    }
    if (key.ctrl && key.name === "k") {
      this.removeDraftRange(active, active.cursor, active.buffer.length);
      return;
    }
    if (key.ctrl && key.name === "w") {
      const selection = this.selectionRange(active);
      const start = selection?.start ??
        this.atomicBoundary(
          active,
          previousWordBoundary(active.buffer, active.cursor),
          "left",
        );
      const end = selection?.end ?? active.cursor;
      if (start !== end) {
        this.removeDraftRange(active, start, end);
        return;
      }
      this.render();
      return;
    }
    if (key.ctrl && key.name === "l") {
      if (this.screen) {
        this.screen.clearHistory();
      } else {
        this.output.write("\u001bc");
      }
      active.renderedLines = [];
      active.renderedAreaRows = 0;
      active.renderedCursorColumn = 0;
      active.renderedColumns = 0;
      active.pendingRenderPrefix = "";
      this.render();
      return;
    }
    if (key.meta && key.name === "b") {
      this.collapseOrMove(
        active,
        "left",
        () =>
          this.atomicBoundary(
            active,
            previousWordBoundary(active.buffer, active.cursor),
            "left",
          ),
      );
      return;
    }
    if (key.meta && key.name === "f") {
      this.collapseOrMove(
        active,
        "right",
        () =>
          this.atomicBoundary(
            active,
            nextWordBoundary(active.buffer, active.cursor),
            "right",
          ),
      );
      return;
    }

    const assist = this.assist(active);
    const suggestions = assist.suggestions;
    if (active.mode === "select") {
      const choices = this.filteredChoices(active);
      if (key.name === "escape" || key.name === "left") {
        this.finish(NAVIGATE_BACK_INPUT, { echo: false });
        return;
      }
      if (key.name === "return" || key.name === "enter") {
        const selected = choices[active.selectedSuggestion];
        if (selected) this.finish(selected.value, { echo: false });
        return;
      }
      if (key.name === "up") {
        if (choices.length > 0) {
          active.selectedSuggestion =
            (active.selectedSuggestion - 1 + choices.length) % choices.length;
          this.render();
        }
        return;
      }
      if (key.name === "down" || (key.name === "tab" && !key.shift)) {
        if (choices.length > 0) {
          active.selectedSuggestion =
            (active.selectedSuggestion + 1) % choices.length;
          this.render();
        }
        return;
      }
      if (key.name === "tab" && key.shift) {
        if (choices.length > 0) {
          active.selectedSuggestion =
            (active.selectedSuggestion - 1 + choices.length) % choices.length;
          this.render();
        }
        return;
      }
    }
    if (
      key.name === "escape" &&
      (active.mode === "compose" || active.mode === "live") &&
      active.buffer.length === 0 &&
      active.images.length === 0 &&
      pendingCount > 0
    ) {
      if (!this.actionIsArmed(active, "clear_pending")) {
        this.armActionConfirmation(
          active,
          "clear_pending",
          pendingCount,
        );
        return;
      }
      this.disarmActionConfirmation();
      if (active.mode === "live") {
        active.onLiveSubmission?.({ kind: "clear_pending" });
        this.render();
      } else {
        this.finish(CLEAR_PENDING_INPUT, { echo: false });
      }
      return;
    }
    if (key.name === "escape") {
      active.paletteDismissed = true;
      this.render();
      return;
    }
    if (key.name === "tab" && suggestions.length > 0) {
      if (key.shift) {
        active.selectedSuggestion =
          (active.selectedSuggestion - 1 + suggestions.length) % suggestions.length;
        this.render();
      } else {
        this.completeSuggestion();
      }
      return;
    }
    if (
      key.name === "tab" &&
      !key.shift &&
      active.mode === "live" &&
      active.buffer.trim().length > 0
    ) {
      this.submitLive(active, "next");
      return;
    }
    if (key.name === "tab") return;
    if (key.name === "return" || key.name === "enter") {
      const pasteCommand = active.buffer.trim().match(
        /^\/paste(?:\s+(auto|text|image))?$/u,
      );
      if (pasteCommand) {
        const mode = (pasteCommand[1] ?? "auto") as ClipboardReadMode;
        this.clearDraft(active);
        void this.applyClipboard(active, mode);
        return;
      }
    }
    if ((key.name === "return" || key.name === "enter") && suggestions.length > 0) {
      if (assist.canSubmit) {
        this.finish(active.buffer);
        return;
      }
      this.completeSuggestion();
      return;
    }
    if (key.name === "return" || key.name === "enter") {
      if (active.mode === "live") {
        this.submitLive(active, "contextual");
        return;
      }
      this.finish(active.buffer);
      return;
    }
    if (key.name === "up") {
      if (suggestions.length > 0) {
        active.selectedSuggestion =
          (active.selectedSuggestion - 1 + suggestions.length) % suggestions.length;
        this.render();
      } else if (!this.moveVertically(active, -1, Boolean(key.shift))) {
        this.moveHistory(1);
      }
      return;
    }
    if (key.name === "down") {
      if (suggestions.length > 0) {
        active.selectedSuggestion = (active.selectedSuggestion + 1) % suggestions.length;
        this.render();
      } else if (!this.moveVertically(active, 1, Boolean(key.shift))) {
        this.moveHistory(-1);
      }
      return;
    }
    if (key.name === "left") {
      if (key.shift) {
        this.moveCursor(
          active,
          key.ctrl || key.meta
            ? this.atomicBoundary(
                active,
                previousWordBoundary(active.buffer, active.cursor),
                "left",
              )
            : this.blockEndingAt(active, active.cursor)?.start ??
              previousBoundary(active.buffer, active.cursor),
          true,
        );
      } else {
        this.collapseOrMove(
          active,
          "left",
          () =>
            key.ctrl || key.meta
              ? this.atomicBoundary(
                  active,
                  previousWordBoundary(active.buffer, active.cursor),
                  "left",
                )
              : this.blockEndingAt(active, active.cursor)?.start ??
                previousBoundary(active.buffer, active.cursor),
        );
      }
      return;
    }
    if (key.name === "right") {
      if (key.shift) {
        this.moveCursor(
          active,
          key.ctrl || key.meta
            ? this.atomicBoundary(
                active,
                nextWordBoundary(active.buffer, active.cursor),
                "right",
              )
            : this.blockStartingAt(active, active.cursor)?.end ??
              nextBoundary(active.buffer, active.cursor),
          true,
        );
      } else {
        this.collapseOrMove(
          active,
          "right",
          () =>
            key.ctrl || key.meta
              ? this.atomicBoundary(
                  active,
                  nextWordBoundary(active.buffer, active.cursor),
                  "right",
                )
              : this.blockStartingAt(active, active.cursor)?.end ??
                nextBoundary(active.buffer, active.cursor),
        );
      }
      return;
    }
    if (key.name === "home") {
      const rows = this.draftVisualRows(active);
      const row = rows[this.visualCursorRow(active, rows)];
      this.moveCursor(active, row?.start ?? 0, Boolean(key.shift));
      return;
    }
    if (key.name === "end") {
      const rows = this.draftVisualRows(active);
      const row = rows[this.visualCursorRow(active, rows)];
      this.moveCursor(
        active,
        row?.end ?? active.buffer.length,
        Boolean(key.shift),
      );
      return;
    }
    if (key.name === "backspace") {
      const selection = this.selectionRange(active);
      if (selection) {
        this.removeDraftRange(active, selection.start, selection.end);
        return;
      }
      if (key.ctrl || key.meta) {
        this.removeDraftRange(
          active,
          this.atomicBoundary(
            active,
            previousWordBoundary(active.buffer, active.cursor),
            "left",
          ),
          active.cursor,
        );
        return;
      }
      const block = this.blockEndingAt(active, active.cursor);
      if (block) {
        this.removeBlock(active, block);
        return;
      }
      const start = previousBoundary(active.buffer, active.cursor);
      if (start !== active.cursor) this.recordEdit(active, "delete");
      this.shiftBlocks(active, active.cursor, start - active.cursor);
      active.buffer = `${active.buffer.slice(0, start)}${active.buffer.slice(active.cursor)}`;
      active.cursor = start;
      this.resetPalette();
      this.render();
      return;
    }
    if (key.name === "delete") {
      const selection = this.selectionRange(active);
      if (selection) {
        this.removeDraftRange(active, selection.start, selection.end);
        return;
      }
      if (key.ctrl || key.meta) {
        this.removeDraftRange(
          active,
          active.cursor,
          this.atomicBoundary(
            active,
            nextWordBoundary(active.buffer, active.cursor),
            "right",
          ),
        );
        return;
      }
      const block = this.blockStartingAt(active, active.cursor);
      if (block) {
        this.removeBlock(active, block);
        return;
      }
      const end = nextBoundary(active.buffer, active.cursor);
      if (end !== active.cursor) this.recordEdit(active, "delete");
      this.shiftBlocks(active, end, active.cursor - end);
      active.buffer = `${active.buffer.slice(0, active.cursor)}${active.buffer.slice(end)}`;
      this.resetPalette();
      this.render();
      return;
    }

    if (value && !key.ctrl && !key.meta) {
      this.insertDraftText(active, value);
      return;
    }
    if (dismissedExitConfirmation) this.render();
  };

  private consumeMouseKeypress(value: string, key: Key): boolean {
    if (!this.screen) return false;
    const fragment = key.sequence ?? value ?? "";
    if (
      this.pendingMouseInput === undefined &&
      !fragment.startsWith("\u001b[<")
    ) {
      return false;
    }
    const sequence = `${this.pendingMouseInput ?? ""}${fragment}`;
    if (
      sequence.length > 64 ||
      !/^\u001b\[<[0-9;]*[Mm]?$/u.test(sequence)
    ) {
      this.pendingMouseInput = undefined;
      return true;
    }
    if (!/[Mm]$/u.test(sequence)) {
      this.pendingMouseInput = sequence;
      return true;
    }
    this.pendingMouseInput = undefined;
    const match = sequence.match(
      /^\u001b\[<(\d+);(\d+);(\d+)([Mm])$/u,
    );
    if (!match) return true;
    const button = Number(match[1]);
    const column = Number(match[2]);
    const row = Number(match[3]);
    const event = match[4];
    if (
      !Number.isSafeInteger(button) ||
      !Number.isSafeInteger(column) ||
      !Number.isSafeInteger(row)
    ) {
      return true;
    }
    if ((button & 64) !== 0) {
      const direction = (button & 1) === 0 ? 1 : -1;
      if (this.screen.isComposerRow(row)) {
        const active = this.active;
        if (active?.mode === "compose" || active?.mode === "live") {
          this.moveHistory(direction);
        }
        return true;
      }
      if (this.screen.scroll(direction * 3)) this.renderFullscreen();
      return true;
    }

    if (event === "m") {
      const drag = this.mouseSelectionDrag;
      if (drag) {
        const targetRow = this.mouseSelectionRow(row);
        this.screen.extendSelection(targetRow, column);
        this.stopMouseSelectionDrag();
        this.renderFullscreen();
        if (this.clipboardPreferences.copyOnSelect) {
          void this.copyChatSelection();
        }
      }
      return true;
    }

    const isMotion = (button & 32) !== 0;
    const isLeftButton = (button & 3) === 0;
    if (!isMotion && isLeftButton && !this.screen.isComposerRow(row)) {
      this.stopMouseSelectionDrag();
      if (this.screen.beginSelection(row, column)) {
        this.mouseSelectionDrag = { row, column };
        this.renderFullscreen();
      }
      return true;
    }
    if (isMotion && isLeftButton && this.mouseSelectionDrag) {
      this.mouseSelectionDrag.row = row;
      this.mouseSelectionDrag.column = column;
      const targetRow = this.mouseSelectionRow(row);
      this.screen.extendSelection(targetRow, column);
      this.updateMouseSelectionScroll(row);
      this.renderFullscreen();
    }
    return true;
  }

  private mouseSelectionRow(row: number): number {
    const bounds = this.screen?.timelineBounds();
    if (!bounds) return row;
    return Math.max(bounds.firstRow, Math.min(bounds.lastRow, row));
  }

  private updateMouseSelectionScroll(row: number): void {
    const drag = this.mouseSelectionDrag;
    const bounds = this.screen?.timelineBounds();
    if (!drag || !bounds) return;
    const direction: -1 | 1 | undefined =
      row <= bounds.firstRow
        ? 1
        : row >= bounds.lastRow
          ? -1
          : undefined;
    if (drag.direction === direction) return;
    if (drag.timer) clearInterval(drag.timer);
    drag.timer = undefined;
    drag.direction = direction;
    if (direction === undefined) return;
    drag.timer = setInterval(() => {
      if (
        this.mouseSelectionDrag !== drag ||
        !this.screen?.scroll(direction)
      ) {
        if (drag.timer) clearInterval(drag.timer);
        drag.timer = undefined;
        return;
      }
      this.renderFullscreen();
      this.screen.extendSelection(
        this.mouseSelectionRow(drag.row),
        drag.column,
      );
      this.renderFullscreen();
    }, 80);
    drag.timer.unref?.();
  }

  private stopMouseSelectionDrag(): void {
    const drag = this.mouseSelectionDrag;
    if (drag?.timer) clearInterval(drag.timer);
    this.mouseSelectionDrag = undefined;
  }

  private submitLive(
    active: ActiveRead,
    delivery: "contextual" | "next",
  ): void {
    if (this.active !== active) return;
    const submitted = active.buffer.trim();
    if (!submitted && active.images.length === 0) return;
    const draft = this.draftSnapshot(active);
    this.remember(submitted);
    this.clearRender();
    const compactSubmitted = this.displayedDraft(active).text.trim();
    const rendered = !submitted.startsWith("/")
      ? renderRichText(compactSubmitted, {
          enabled: this.richText,
          theme: this.designSystem.theme,
          preserveMarkers: true,
          width: Math.max(20, terminalColumns(this.output) - displayWidth(active.prompt) - 1),
          continuationIndent: " ".repeat(displayWidth(active.prompt)),
        })
      : compactSubmitted;
    this.writeSubmittedUserMessage(active, rendered);
    active.buffer = "";
    active.cursor = 0;
    active.paletteDismissed = false;
    active.selectedSuggestion = 0;
    active.historyIndex = -1;
    active.historyDraft = "";
    active.undoStack = [];
    active.redoStack = [];
    const images = active.images.map((attachment) => ({ ...attachment.image }));
    active.compactBlocks = [];
    active.images = [];
    active.lastEditKind = undefined;
    active.renderedLines = [];
    active.renderedAreaRows = 0;
    active.renderedCursorColumn = 0;
    active.renderedColumns = 0;
    this.render();
    active.onLiveSubmission?.({
      kind: "message",
      value: submitted,
      delivery,
      ...(images.length > 0 ? { images } : {}),
      draft,
    });
  }

  private handleResize = (): void => {
    if (this.resizePending) return;
    this.resizePending = true;
    queueMicrotask(() => {
      this.resizePending = false;
      if (this.closed || this.suspended) return;
      this.commitResize();
    });
  };

  private commitResize(): void {
    const active = this.active;
    if (!active) {
      if (this.screen) {
        this.renderFullscreen();
        return;
      }
      if (this.activity?.visible) this.paintActivity(this.activity);
      return;
    }
    if (this.screen) {
      active.renderedLines = [];
      active.renderedAreaRows = 0;
      active.renderedCursorRow = 0;
      active.renderedCursorColumn = 0;
      active.renderedColumns = 0;
      active.pendingRenderPrefix = "";
      this.renderFullscreen();
      return;
    }
    const compactAsk =
      active.mode === "ask" &&
      active.prompt === active.originalPrompt &&
      shouldCompactPrompt(active.originalPrompt, terminalColumns(this.output));
    active.pendingRenderPrefix = "\r\u001b[0J\r\n";
    if (compactAsk) {
      active.pendingRenderPrefix += `${active.originalPrompt.trimEnd()}\n`;
      active.prompt = "› ";
    }
    active.renderedLines = [];
    active.renderedAreaRows = 0;
    active.renderedCursorColumn = 0;
    active.renderedColumns = 0;
    this.render();
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.resizePending = false;
    this.finishMessageStream();
    this.stopActivity();
    this.disarmExitConfirmation();
    this.disarmActionConfirmation();
    this.pendingMouseInput = undefined;
    const active = this.active;
    if (active) {
      this.clearRender();
      if (!this.screen) this.output.write("\n");
      this.active = undefined;
      active.resolve(active.mode === "compose" ? "/exit" : "");
    }
    this.input.off("keypress", this.handleKeypress);
    this.output.off("resize", this.handleResize);
    this.output.write("\u001b[?2004l");
    if (this.suspended) {
      this.input.setRawMode?.(this.wasRaw);
      this.suspended = false;
    } else if (!this.wasRaw) {
      this.input.setRawMode?.(false);
    }
    this.input.pause();
    if (this.screen) {
      this.screen.leave();
      if (this.shellSummary) this.output.write(`${this.shellSummary}\n`);
    }
  }
}
