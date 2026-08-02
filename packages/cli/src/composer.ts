import { emitKeypressEvents, type Key } from "node:readline";

import {
  filterSlashCommands,
  terminalSafeMultilineText,
  terminalSafeText,
  type SlashCommandDefinition,
} from "./ui.js";
import {
  createTerminalTheme,
  type TerminalAppearance,
  type TerminalTheme,
} from "./terminal-theme.js";
import {
  IncrementalRichTextRenderer,
  renderRichText,
} from "./rich-text.js";

export const INTERRUPTED_INPUT = "\u0003";
export const COMPOSER_PROMPT = "You › ";
export const AGENT_MESSAGE_MARKER = "✦";
const EXIT_CONFIRMATION_SECONDS = 3;
const ACTIVITY_DELAY_MS = 120;
const ACTIVITY_FRAME_MS = 100;
const ACTIVITY_FRAMES = ["◜", "◝", "◞", "◟"] as const;

export type ComposerChoice = {
  value: string;
  label: string;
  description?: string;
};

type ComposerInput = NodeJS.ReadableStream & {
  isRaw?: boolean;
  setRawMode?: (enabled: boolean) => void;
};

type ComposerOutput = NodeJS.WritableStream & {
  columns?: number;
  rows?: number;
};

type ActiveRead = {
  mode: "ask" | "compose" | "select";
  prompt: string;
  originalPrompt: string;
  buffer: string;
  cursor: number;
  paletteDismissed: boolean;
  selectedSuggestion: number;
  renderedLines: string[];
  renderedAreaRows: number;
  renderedCursorColumn: number;
  renderedColumns: number;
  pendingRenderPrefix: string;
  historyIndex: number;
  historyDraft: string;
  choices: ComposerChoice[];
  currentValue?: string;
  resolve: (value: string) => void;
};

type ExitConfirmation = {
  activeRead: ActiveRead;
  deadline: number;
  displayedSeconds: number;
  timer?: NodeJS.Timeout;
};

type RenderFrame = {
  lines: string[];
  cursorColumn: number;
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
  frame: number;
  visible: boolean;
  timer?: NodeJS.Timeout;
};

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
  onInterrupt: () => void;
};

const graphemeSegmenter = new Intl.Segmenter(undefined, {
  granularity: "grapheme",
});

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

type ComposerLine = {
  text: string;
  labelStart: number;
  labelLength: number;
};

function suggestionLine(
  definition: SlashCommandDefinition,
  selected: boolean,
  width: number,
): ComposerLine {
  const marker = selected ? "›" : " ";
  const detail = width >= 64
    ? `${definition.usage.padEnd(22)} ${definition.description}`
    : definition.usage;
  return {
    text: truncate(`  ${marker} ${detail}`, width),
    labelStart: 4,
    labelLength: definition.usage.length,
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
  const value = terminalSafeText(choice.value);
  const description = choice.description
    ? terminalSafeText(choice.description)
    : "";
  const detail = width >= 80
    ? `${label.padEnd(22)} ${value.padEnd(24)} ${description}`
    : width >= 52
      ? `${label.padEnd(22)} ${value}`
      : value;
  return {
    text: truncate(`  ${marker} ${currentMarker} ${detail}`, width),
    labelStart: 6,
    labelLength: (width >= 52 ? label : value).length,
  };
}

function paintSelection(theme: TerminalTheme, line: ComposerLine): string {
  const markerIndex = line.text.indexOf("›");
  const labelEnd = Math.min(
    line.text.length,
    line.labelStart + line.labelLength,
  );
  const label =
    line.labelStart < labelEnd
      ? theme.paint("focus", line.text.slice(line.labelStart, labelEnd))
      : "";
  if (markerIndex < 0) {
    return `${line.text.slice(0, line.labelStart)}${label}${line.text.slice(labelEnd)}`;
  }
  return [
    line.text.slice(0, markerIndex),
    theme.paint("focus", "›"),
    line.text.slice(markerIndex + 1, line.labelStart),
    label,
    line.text.slice(labelEnd),
  ].join("");
}

function paintPromptMarker(theme: TerminalTheme, line: string): string {
  const promptPrefix = COMPOSER_PROMPT.trimEnd();
  const promptIndex = line.indexOf(promptPrefix);
  if (promptIndex < 0) return line;
  return `${line.slice(0, promptIndex)}${theme.paint("focus", promptPrefix)}${line.slice(promptIndex + promptPrefix.length)}`;
}

function paintToken(
  theme: TerminalTheme,
  role: "attention",
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
  private theme: TerminalTheme;
  private motion: boolean;
  private richText: boolean;
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

  constructor(options: TtyComposerOptions) {
    this.input = options.input;
    this.output = options.output;
    this.theme = createTerminalTheme(options.color);
    this.motion = options.motion ?? true;
    this.richText = options.richText ?? true;
    this.onInterrupt = options.onInterrupt;
    this.wasRaw = Boolean(this.input.isRaw);
    emitKeypressEvents(this.input);
    this.input.on("keypress", this.handleKeypress);
    this.output.on("resize", this.handleResize);
    this.input.setRawMode?.(true);
    this.input.resume();
  }

  compose = (prompt: string): Promise<string> => this.read(prompt, "compose");

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

  setPresentation = (appearance: TerminalAppearance): void => {
    this.theme = createTerminalTheme(appearance.color);
    this.richText = appearance.richText;
    this.messageStream?.renderer.setOptions({
      enabled: this.richText,
      color: appearance.color,
    });
    if (this.motion !== appearance.motion) {
      this.motion = appearance.motion;
      const activity = this.activity;
      if (activity?.timer) {
        clearTimeout(activity.timer);
        activity.timer = undefined;
      }
      if (!this.motion && activity?.visible) {
        this.output.write("\r\u001b[2K");
        activity.visible = false;
      } else if (this.motion && activity && !activity.visible) {
        activity.timer = setTimeout(
          () => this.tickActivity(activity),
          ACTIVITY_DELAY_MS,
        );
        activity.timer.unref?.();
      }
    }
    if (this.active) {
      this.paintFrame(this.active, this.createFrame(this.active));
    }
  };

  write = (value: string): void => {
    this.finishMessageStream();
    const normalized = value.endsWith("\n") ? value : `${value}\n`;
    const activity = this.activity;
    if (!activity?.visible) {
      this.output.write(normalized);
      return;
    }
    activity.visible = false;
    this.output.write(
      `\r\u001b[2K${normalized}${this.activityFrame(activity)}`,
    );
    activity.visible = true;
  };

  beginActivity = (label: string): InlineActivityHandle => {
    this.finishMessageStream();
    this.stopActivity();
    const activity: ActiveActivity = {
      id: ++this.activitySequence,
      label: terminalSafeText(label),
      frame: 0,
      visible: false,
    };
    this.activity = activity;
    if (this.motion) {
      activity.timer = setTimeout(
        () => this.tickActivity(activity),
        ACTIVITY_DELAY_MS,
      );
      activity.timer.unref?.();
    }
    const finish = (
      marker: "◇" | "✕" | undefined,
      nextLabel?: string,
    ): void => {
      if (this.activity?.id !== activity.id) return;
      const finalLabel = terminalSafeText(nextLabel ?? activity.label);
      if (activity.timer) clearTimeout(activity.timer);
      this.activity = undefined;
      const clear = activity.visible ? "\r\u001b[2K" : "";
      this.output.write(
        marker ? `${clear}  ${marker} ${finalLabel}\n` : clear,
      );
    };
    return {
      update: (nextLabel) => {
        if (this.activity?.id !== activity.id) return;
        activity.label = terminalSafeText(nextLabel);
        if (activity.visible) this.paintActivity(activity);
      },
      settle: (nextLabel) => finish("◇", nextLabel),
      fail: (nextLabel) => finish("✕", nextLabel),
      stop: () => finish(undefined),
    };
  };

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
        color: this.theme.enabled,
      }),
    };
    this.messageStream = stream;
    const update = (value: string) => {
      if (this.messageStream?.id !== stream.id) return;
      const next = terminalSafeMultilineText(value);
      stream.latestText = next;
      if (!stream.started && next) {
        this.output.write(
          `\n${this.theme.paint("agent", stream.prefix)} `,
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
    if (!stream.divergent && stream.latestText === stream.displayedText) {
      const tail = stream.renderer.finish();
      if (tail) this.output.write(tail);
    } else if (stream.latestText) {
      if (stream.started && !stream.displayedText.endsWith("\n")) {
        this.output.write("\n");
      }
      this.output.write(
        `\n${this.theme.paint("agent", stream.prefix)} updated · ${renderRichText(stream.latestText, {
          enabled: this.richText,
          color: this.theme.enabled,
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
    const frame = ACTIVITY_FRAMES[activity.frame % ACTIVITY_FRAMES.length];
    const value = truncate(`  ${frame} ${activity.label}`, contentWidth);
    const decorated =
      value.length >= 3
        ? `${value.slice(0, 2)}${this.theme.paint("focus", frame)}${value.slice(3)}`
        : value;
    return `\r\u001b[2K${decorated}`;
  }

  private paintActivity(activity: ActiveActivity): void {
    if (this.activity?.id !== activity.id || !this.motion) return;
    this.output.write(this.activityFrame(activity));
    activity.visible = true;
  }

  private tickActivity(activity: ActiveActivity): void {
    if (
      this.closed ||
      this.activity?.id !== activity.id ||
      !this.motion
    ) {
      return;
    }
    this.paintActivity(activity);
    activity.frame = (activity.frame + 1) % ACTIVITY_FRAMES.length;
    activity.timer = setTimeout(
      () => this.tickActivity(activity),
      ACTIVITY_FRAME_MS,
    );
    activity.timer.unref?.();
  }

  private stopActivity(): void {
    const activity = this.activity;
    if (!activity) return;
    if (activity.timer) clearTimeout(activity.timer);
    if (activity.visible) this.output.write("\r\u001b[2K");
    this.activity = undefined;
  }

  private read(
    prompt: string,
    mode: ActiveRead["mode"],
    selection: {
      choices?: ComposerChoice[];
      currentValue?: string;
    } = {},
  ): Promise<string> {
    if (this.closed) return Promise.resolve(mode === "compose" ? "/exit" : "");
    if (this.active) return Promise.reject(new Error("Orynt terminal input is already active"));
    const leadingNewlines = prompt.match(/^\n+/)?.[0] ?? "";
    if (leadingNewlines) this.output.write(leadingNewlines);
    const originalPrompt = prompt.slice(leadingNewlines.length);
    const compact =
      mode === "ask" &&
      shouldCompactPrompt(originalPrompt, terminalColumns(this.output));
    if (compact) this.output.write(`${originalPrompt.trimEnd()}\n`);
    const choices = selection.choices ?? [];
    const currentChoice = choices.findIndex(
      (choice) => choice.value === selection.currentValue,
    );
    return new Promise((resolve) => {
      this.active = {
        mode,
        prompt: compact ? "› " : originalPrompt,
        originalPrompt,
        buffer: "",
        cursor: 0,
        paletteDismissed: false,
        selectedSuggestion: currentChoice >= 0 ? currentChoice : 0,
        renderedLines: [],
        renderedAreaRows: 0,
        renderedCursorColumn: 0,
        renderedColumns: 0,
        pendingRenderPrefix: "",
        historyIndex: -1,
        historyDraft: "",
        choices,
        ...(selection.currentValue
          ? { currentValue: selection.currentValue }
          : {}),
        resolve,
      };
      this.render();
    });
  }

  private suggestions(active = this.active): SlashCommandDefinition[] {
    if (!active || active.mode !== "compose" || active.paletteDismissed) return [];
    return filterSlashCommands(active.buffer);
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
    let sequence = "\r";
    for (let index = 0; index < active.renderedAreaRows; index += 1) {
      if (index > 0) sequence += "\u001b[1B\r";
      sequence += "\u001b[2K";
    }
    sequence += verticalMove(-(active.renderedAreaRows - 1));
    sequence += "\r";
    this.output.write(sequence);
    active.renderedLines = [];
    active.renderedAreaRows = 0;
    active.renderedCursorColumn = 0;
    active.renderedColumns = 0;
    active.pendingRenderPrefix = "";
  }

  private createFrame(active: ActiveRead): RenderFrame {
    const columns = terminalColumns(this.output);
    const contentWidth = Math.max(0, columns - 1);
    const prompt = truncate(active.prompt, contentWidth);
    const promptWidth = displayWidth(prompt);
    const displayBuffer = visibleInput(active.buffer);
    const displayCursor = visibleInput(active.buffer.slice(0, active.cursor)).length;
    const inputWidth = Math.max(0, contentWidth - promptWidth);
    const input = inputWidth > 0
      ? viewport(displayBuffer, displayCursor, inputWidth)
      : { text: "", cursorColumn: 0 };
    const renderedInput =
      active.mode === "compose" && !active.buffer.startsWith("/")
        ? renderRichText(input.text, {
            enabled: this.richText,
            color: this.theme.enabled,
            preserveMarkers: true,
          })
        : input.text;
    const lines = [
      paintPromptMarker(this.theme, `${prompt}${renderedInput}`),
    ];
    const suggestions = active.mode === "select"
      ? this.filteredChoices(active)
      : this.suggestions(active);
    const rowLimit = Math.min(8, Math.max(0, terminalRows(this.output) - 1));
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
            definition as SlashCommandDefinition,
            selected,
            contentWidth,
          );
      lines.push(selected ? paintSelection(this.theme, line) : line.text);
    }
    if (active.mode === "select" && visible.length === 0 && rowLimit > 0) {
      lines.push(truncate("  No matching models", contentWidth));
    }
    const exitConfirmation =
      this.exitConfirmation?.activeRead === active
        ? this.exitConfirmation
        : undefined;
    if (exitConfirmation) {
      const message =
        `  Press Ctrl+C again to exit Orynt · ${exitConfirmation.displayedSeconds}s`;
      const decorated = paintToken(
        this.theme,
        "attention",
        truncate(message, contentWidth),
        "Ctrl+C",
      );
      if (terminalRows(this.output) > 1) {
        lines.push(decorated);
      } else {
        lines[0] = paintToken(
          this.theme,
          "attention",
          truncate(message.trimStart(), contentWidth),
          "Ctrl+C",
        );
      }
    }
    return {
      lines,
      cursorColumn: promptWidth + input.cursorColumn,
    };
  }

  private paintFrame(active: ActiveRead, frame: RenderFrame): void {
    const previousLines = active.renderedLines;
    const columns = terminalColumns(this.output);
    const forceRepaint = active.renderedColumns !== columns;
    const rowCount = Math.max(previousLines.length, frame.lines.length);
    const knownRows = Math.max(1, active.renderedAreaRows);
    let sequence = active.pendingRenderPrefix;
    let terminalRow = 0;

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

    if (sequence || active.renderedCursorColumn !== frame.cursorColumn) {
      sequence += verticalMove(-terminalRow);
      sequence += cursorPosition(frame.cursorColumn);
      this.output.write(sequence);
    }

    active.renderedLines = [...frame.lines];
    active.renderedAreaRows = Math.max(
      active.renderedAreaRows,
      frame.lines.length,
    );
    active.renderedCursorColumn = frame.cursorColumn;
    active.renderedColumns = columns;
    active.pendingRenderPrefix = "";
  }

  private render(): void {
    const active = this.active;
    if (!active) return;
    this.paintFrame(active, this.createFrame(active));
  }

  private finish(value: string, options: { echo?: boolean } = {}): void {
    const active = this.active;
    if (!active) return;
    this.disarmExitConfirmation();
    this.clearRender();
    if (options.echo !== false) {
      const input = visibleInput(active.buffer);
      const rendered =
        active.mode === "compose" && !active.buffer.startsWith("/")
          ? renderRichText(input, {
              enabled: this.richText,
              color: this.theme.enabled,
              preserveMarkers: true,
            })
          : input;
      this.output.write(`${active.prompt}${rendered}\n`);
    }
    this.active = undefined;
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

  private completeSuggestion(): void {
    const active = this.active;
    if (!active) return;
    const suggestions = this.suggestions(active);
    const selected = suggestions[active.selectedSuggestion];
    if (!selected) return;
    const leading = active.buffer.match(/^\s*/)?.[0] ?? "";
    active.buffer = `${leading}${selected.command}${selected.argument === "none" ? "" : " "}`;
    active.cursor = active.buffer.length;
    active.paletteDismissed = true;
    active.selectedSuggestion = 0;
    this.render();
  }

  private exactSuggestion(
    active: ActiveRead,
    suggestions: SlashCommandDefinition[],
  ): SlashCommandDefinition | undefined {
    const value = active.buffer.trim().toLocaleLowerCase();
    const selected = suggestions[active.selectedSuggestion];
    if (
      selected &&
      (selected.command === value || selected.aliases.includes(value as `/${string}`))
    ) {
      return selected;
    }
    return undefined;
  }

  private moveHistory(direction: 1 | -1): void {
    const active = this.active;
    if (!active || active.mode !== "compose" || this.history.length === 0) return;
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

  private handleKeypress = (value: string, key: Key): void => {
    const active = this.active;
    if (!active) {
      if (key.ctrl && key.name === "c") this.onInterrupt();
      return;
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
        this.clearRender();
        active.buffer = "";
        active.cursor = 0;
        active.paletteDismissed = false;
        active.selectedSuggestion = 0;
        active.historyIndex = -1;
        active.historyDraft = "";
        this.armExitConfirmation(active);
      }
      return;
    }

    const dismissedExitConfirmation =
      this.exitConfirmation?.activeRead === active;
    if (dismissedExitConfirmation) this.disarmExitConfirmation();

    if (key.ctrl && key.name === "d" && active.buffer.length === 0) {
      this.finish(active.mode === "compose" ? "/exit" : "", { echo: false });
      this.output.write("\n");
      return;
    }

    if (key.ctrl && key.name === "a") {
      active.cursor = 0;
      this.render();
      return;
    }
    if (key.ctrl && key.name === "e") {
      active.cursor = active.buffer.length;
      this.render();
      return;
    }
    if (key.ctrl && key.name === "u") {
      active.buffer = active.buffer.slice(active.cursor);
      active.cursor = 0;
      this.resetPalette();
      this.render();
      return;
    }
    if (key.ctrl && key.name === "k") {
      active.buffer = active.buffer.slice(0, active.cursor);
      this.resetPalette();
      this.render();
      return;
    }
    if (key.ctrl && key.name === "w") {
      const before = active.buffer.slice(0, active.cursor);
      const start = before.search(/\S+\s*$/);
      if (start >= 0) {
        active.buffer = `${active.buffer.slice(0, start)}${active.buffer.slice(active.cursor)}`;
        active.cursor = start;
        this.resetPalette();
      }
      this.render();
      return;
    }
    if (key.ctrl && key.name === "l") {
      this.output.write("\u001bc");
      active.renderedLines = [];
      active.renderedAreaRows = 0;
      active.renderedCursorColumn = 0;
      active.renderedColumns = 0;
      active.pendingRenderPrefix = "";
      this.render();
      return;
    }

    const suggestions = this.suggestions(active);
    if (active.mode === "select") {
      const choices = this.filteredChoices(active);
      if (key.name === "escape") {
        this.finish("", { echo: false });
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
    if ((key.name === "return" || key.name === "enter") && suggestions.length > 0) {
      const exact = this.exactSuggestion(active, suggestions);
      if (exact && exact.argument !== "required") {
        this.finish(active.buffer);
        return;
      }
      this.completeSuggestion();
      return;
    }
    if (key.name === "return" || key.name === "enter") {
      this.finish(active.buffer);
      return;
    }
    if (key.name === "up") {
      if (suggestions.length > 0) {
        active.selectedSuggestion =
          (active.selectedSuggestion - 1 + suggestions.length) % suggestions.length;
        this.render();
      } else {
        this.moveHistory(1);
      }
      return;
    }
    if (key.name === "down") {
      if (suggestions.length > 0) {
        active.selectedSuggestion = (active.selectedSuggestion + 1) % suggestions.length;
        this.render();
      } else {
        this.moveHistory(-1);
      }
      return;
    }
    if (key.name === "left") {
      active.cursor = previousBoundary(active.buffer, active.cursor);
      this.render();
      return;
    }
    if (key.name === "right") {
      active.cursor = nextBoundary(active.buffer, active.cursor);
      this.render();
      return;
    }
    if (key.name === "home") {
      active.cursor = 0;
      this.render();
      return;
    }
    if (key.name === "end") {
      active.cursor = active.buffer.length;
      this.render();
      return;
    }
    if (key.name === "backspace") {
      const start = previousBoundary(active.buffer, active.cursor);
      active.buffer = `${active.buffer.slice(0, start)}${active.buffer.slice(active.cursor)}`;
      active.cursor = start;
      this.resetPalette();
      this.render();
      return;
    }
    if (key.name === "delete") {
      const end = nextBoundary(active.buffer, active.cursor);
      active.buffer = `${active.buffer.slice(0, active.cursor)}${active.buffer.slice(end)}`;
      this.resetPalette();
      this.render();
      return;
    }

    if (value && !key.ctrl && !key.meta) {
      active.buffer = `${active.buffer.slice(0, active.cursor)}${value}${active.buffer.slice(active.cursor)}`;
      active.cursor += value.length;
      this.resetPalette();
      this.render();
      return;
    }
    if (dismissedExitConfirmation) this.render();
  };

  private handleResize = (): void => {
    const active = this.active;
    if (!active) {
      if (this.activity?.visible) this.paintActivity(this.activity);
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
  };

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.finishMessageStream();
    this.stopActivity();
    this.disarmExitConfirmation();
    const active = this.active;
    if (active) {
      this.clearRender();
      this.output.write("\n");
      this.active = undefined;
      active.resolve(active.mode === "compose" ? "/exit" : "");
    }
    this.input.off("keypress", this.handleKeypress);
    this.output.off("resize", this.handleResize);
    if (!this.wasRaw) this.input.setRawMode?.(false);
    this.input.pause();
  }
}
