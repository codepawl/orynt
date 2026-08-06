const ALT_SCREEN_ENTER = "\u001b[?1049h";
const ALT_SCREEN_LEAVE = "\u001b[?1049l";
const CURSOR_HIDE = "\u001b[?25l";
const CURSOR_SHOW = "\u001b[?25h";
const MOUSE_REPORTING_ENABLE = "\u001b[?1002h\u001b[?1006h";
const MOUSE_REPORTING_DISABLE = "\u001b[?1006l\u001b[?1002l";
const SYNC_BEGIN = "\u001b[?2026h";
const SYNC_END = "\u001b[?2026l";
const SGR = /\u001b\[[0-9;]*m/u;
const CSI_TOKEN = /(\u001b\[[0-?]*[ -/]*[@-~])/gu;
const FAST_ASCII = /^[\x20-\x7e]*$/u;
const MAX_HISTORY_BYTES = 4 * 1024 * 1024;
const MAX_HISTORY_ROWS = 50_000;
const OMITTED_HISTORY = "\u001b[2m… older display history omitted …\u001b[0m";

export type TerminalScreenOutput = NodeJS.WritableStream & {
  columns?: number;
  rows?: number;
};

export type TerminalScreenFrame = {
  transient?: string[];
  composer: string[];
  composerCursorRow: number;
  composerCursorColumn: number;
};

type HistoryEntry = {
  id: number;
  text: string;
  plainText: string;
  bytes: number;
  centeredVariants?: string[];
  decorateRow?: (rendered: string) => string;
  width?: number;
  rows?: HistoryRow[];
};

type HistoryRow = {
  rendered: string;
  plain: string;
  entryId?: number;
  start?: number;
  end?: number;
  decorate?: (rendered: string) => string;
};

type HistoryPoint = {
  entryId: number;
  offset: number;
};

type HistorySelection = {
  anchor: HistoryPoint;
  focus: HistoryPoint;
  snapshot: string;
};

function positiveInteger(value: number | undefined, fallback: number): number {
  const normalized = Math.floor(value ?? fallback);
  return normalized > 0 ? normalized : fallback;
}

const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

function graphemes(value: string): string[] {
  return [...segmenter.segment(value)].map(({ segment }) => segment);
}

function characterWidth(value: string): number {
  if (/^[\u0000-\u001f\u007f]$/u.test(value)) return 0;
  return /[\p{Extended_Pictographic}\p{Emoji_Presentation}]/u.test(value) ||
      /[\u1100-\u115f\u2329\u232a\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\uff01-\uff60\uffe0-\uffe6]/u.test(value)
    ? 2
    : 1;
}

function wrapAnsiLine(value: string, width: number): string[] {
  if (width <= 0) return [""];
  if (FAST_ASCII.test(value)) {
    if (!value) return [""];
    const rows: string[] = [];
    for (let offset = 0; offset < value.length; offset += width) {
      rows.push(value.slice(offset, offset + width));
    }
    return rows;
  }
  const tokens = value.split(CSI_TOKEN).filter(Boolean);
  const rows: string[] = [];
  let row = "";
  let columns = 0;
  let activeSgr = "";
  for (const token of tokens) {
    if (/^\u001b\[[0-?]*[ -/]*[@-~]$/u.test(token)) {
      row += token;
      if (SGR.test(token)) activeSgr = token === "\u001b[0m" ? "" : token;
      continue;
    }
    for (const character of graphemes(token)) {
      const nextWidth = characterWidth(character);
      if (columns > 0 && columns + nextWidth > width) {
        rows.push(`${row}${activeSgr ? "\u001b[0m" : ""}`);
        row = activeSgr;
        columns = 0;
      }
      row += character;
      columns += nextWidth;
    }
  }
  rows.push(`${row}${activeSgr ? "\u001b[0m" : ""}`);
  return rows;
}

export function wrapTerminalText(value: string, width: number): string[] {
  return value
    .replace(/\r/gu, "")
    .split("\n")
    .flatMap((line) => wrapAnsiLine(line, width));
}

function stripAnsi(value: string): string {
  return value
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/gu, "")
    .replace(/\r/gu, "");
}

function wrapPlainLine(
  value: string,
  width: number,
  baseOffset: number,
): Array<{ text: string; start: number; end: number }> {
  if (width <= 0 || value.length === 0) {
    return [{ text: "", start: baseOffset, end: baseOffset }];
  }
  if (FAST_ASCII.test(value)) {
    const rows: Array<{ text: string; start: number; end: number }> = [];
    for (let localOffset = 0; localOffset < value.length; localOffset += width) {
      const text = value.slice(localOffset, localOffset + width);
      const start = baseOffset + localOffset;
      rows.push({ text, start, end: start + text.length });
    }
    return rows;
  }
  const rows: Array<{ text: string; start: number; end: number }> = [];
  let text = "";
  let columns = 0;
  let start = baseOffset;
  let offset = baseOffset;
  for (const character of graphemes(value)) {
    const widthOfCharacter = characterWidth(character);
    if (columns > 0 && columns + widthOfCharacter > width) {
      rows.push({ text, start, end: offset });
      text = "";
      columns = 0;
      start = offset;
    }
    text += character;
    columns += widthOfCharacter;
    offset += character.length;
  }
  rows.push({ text, start, end: offset });
  return rows;
}

function wrapPlainText(
  value: string,
  width: number,
): Array<{ text: string; start: number; end: number }> {
  const rows: Array<{ text: string; start: number; end: number }> = [];
  const lines = value.split("\n");
  let offset = 0;
  for (const [index, line] of lines.entries()) {
    rows.push(...wrapPlainLine(line, width, offset));
    offset += line.length;
    if (index < lines.length - 1) offset += 1;
  }
  return rows;
}

function pointCompare(left: HistoryPoint, right: HistoryPoint): number {
  return left.entryId - right.entryId || left.offset - right.offset;
}

function pointRange(
  selection: HistorySelection,
): { start: HistoryPoint; end: HistoryPoint } {
  return pointCompare(selection.anchor, selection.focus) <= 0
    ? { start: selection.anchor, end: selection.focus }
    : { start: selection.focus, end: selection.anchor };
}

function offsetAtColumn(
  value: string,
  column: number,
  includeCell: boolean,
): number {
  const target = Math.max(0, column);
  let columns = 0;
  let offset = 0;
  for (const character of graphemes(value)) {
    const width = characterWidth(character);
    if (columns + width > target) {
      return includeCell ? offset + character.length : offset;
    }
    columns += width;
    offset += character.length;
  }
  return value.length;
}

function terminalLineWidth(value: string): number {
  return wrapAnsiLine(value, Number.MAX_SAFE_INTEGER).reduce(
    (width, row) => {
      const visible = row.replace(CSI_TOKEN, "");
      return Math.max(
        width,
        graphemes(visible).reduce(
          (lineWidth, grapheme) => lineWidth + characterWidth(grapheme),
          0,
        ),
      );
    },
    0,
  );
}

/**
 * Centers the first fitting ANSI-aware variant within the live terminal width.
 */
export function centerTerminalText(
  variants: readonly string[],
  width: number,
): string {
  if (variants.length === 0) return "";
  const targetWidth = Math.max(1, positiveInteger(width, 80) - 1);
  const linesByVariant = variants.map((variant) =>
    variant.replace(/\r/gu, "").split("\n")
  );
  const lineCount = Math.max(...linesByVariant.map((lines) => lines.length));
  const centeredLines: string[] = [];

  for (let index = 0; index < lineCount; index += 1) {
    const candidates = linesByVariant.map((lines) => lines[index] ?? "");
    const selected =
      candidates.find((candidate) => terminalLineWidth(candidate) <= targetWidth) ??
      candidates.at(-1) ??
      "";
    const fitted = terminalLineWidth(selected) <= targetWidth
      ? selected
      : wrapAnsiLine(selected, targetWidth)[0] ?? "";
    const leftPadding = " ".repeat(
      Math.max(0, Math.floor((targetWidth - terminalLineWidth(fitted)) / 2)),
    );
    centeredLines.push(`${leftPadding}${fitted}`);
  }

  return centeredLines.join("\n");
}

export class TerminalScreen {
  private readonly output: TerminalScreenOutput;
  private entered = false;
  private suspended = false;
  private forceRepaint = true;
  private scrollOffset = 0;
  private lastMaxScroll = 0;
  private history: HistoryEntry[] = [];
  private historyBytes = 0;
  private nextHistoryId = 1;
  private cacheWidth = 0;
  private cachedHistoryRows: HistoryRow[] = [];
  private lastVisibleHistoryRows: Array<HistoryRow | undefined> = [];
  private selection?: HistorySelection;
  private lastRows: string[] = [];
  private lastWidth = 0;
  private lastHeight = 0;
  private lastCursorRow = 0;
  private lastCursorColumn = 0;
  private lastTransientRowCount = 0;
  private lastComposerStartRow = 1;
  private lastComposerRowCount = 0;
  private wrapCount = 0;
  private fullRepaintCount = 0;
  private dirtyRowWriteCount = 0;

  constructor(output: TerminalScreenOutput) {
    this.output = output;
  }

  get active(): boolean {
    return this.entered && !this.suspended;
  }

  enter(): void {
    if (this.entered) return;
    this.entered = true;
    this.forceRepaint = true;
    this.output.write(
      `${ALT_SCREEN_ENTER}${MOUSE_REPORTING_ENABLE}${CURSOR_HIDE}\u001b[2J\u001b[H`,
    );
  }

  suspend(): void {
    if (!this.active) return;
    this.suspended = true;
    this.output.write(
      `${MOUSE_REPORTING_DISABLE}${CURSOR_SHOW}${ALT_SCREEN_LEAVE}`,
    );
  }

  resume(): void {
    if (!this.entered || !this.suspended) return;
    this.suspended = false;
    this.forceRepaint = true;
    this.output.write(
      `${ALT_SCREEN_ENTER}${MOUSE_REPORTING_ENABLE}${CURSOR_HIDE}\u001b[2J\u001b[H`,
    );
  }

  leave(): void {
    if (!this.entered) return;
    if (!this.suspended) {
      this.output.write(
        `${MOUSE_REPORTING_DISABLE}${CURSOR_SHOW}${ALT_SCREEN_LEAVE}`,
      );
    }
    this.entered = false;
    this.suspended = false;
    this.lastRows = [];
    this.lastComposerRowCount = 0;
  }

  appendHistory(
    value: string,
    options: {
      centeredVariants?: readonly string[];
      decorateRow?: (rendered: string) => string;
    } = {},
  ): void {
    if (!value) return;
    const normalized = value.replace(/\r(?!\n)/gu, "");
    const centeredVariants = options.centeredVariants?.map((variant) =>
      variant.replace(/\r(?!\n)/gu, "")
    );
    const centeredVariantBytes = centeredVariants?.reduce(
      (total, variant) => total + Buffer.byteLength(variant),
      0,
    ) ?? 0;
    let bytes = Buffer.byteLength(normalized);
    const retainCenteredVariants = Boolean(
      centeredVariants &&
        bytes + centeredVariantBytes <= MAX_HISTORY_BYTES,
    );
    let text = normalized;
    if (bytes > MAX_HISTORY_BYTES) {
      const buffer = Buffer.from(normalized);
      text = `${OMITTED_HISTORY}\n${buffer.subarray(buffer.length - MAX_HISTORY_BYTES + 128).toString("utf8").replace(/^\uFFFD/u, "")}`;
      bytes = Buffer.byteLength(text);
    }
    if (retainCenteredVariants) bytes += centeredVariantBytes;
    const entry: HistoryEntry = {
      id: this.nextHistoryId++,
      text,
      plainText: stripAnsi(text),
      bytes,
      ...(centeredVariants && retainCenteredVariants
        ? { centeredVariants }
        : {}),
      ...(options.decorateRow ? { decorateRow: options.decorateRow } : {}),
    };
    this.history.push(entry);
    this.historyBytes += bytes;
    let evicted = false;
    while (this.history.length > 1 && this.historyBytes > MAX_HISTORY_BYTES) {
      const removed = this.history.shift()!;
      this.historyBytes -= removed.bytes;
      evicted = true;
    }
    if (evicted) {
      this.cacheWidth = 0;
      this.cachedHistoryRows = [];
    } else if (this.cacheWidth > 0) {
      const rows = this.wrapEntry(entry, this.cacheWidth);
      this.cachedHistoryRows.push(...rows);
      if (this.scrollOffset > 0) this.scrollOffset += rows.length;
      this.trimRenderedRows();
    }
  }

  clearHistory(): void {
    this.history = [];
    this.historyBytes = 0;
    this.cachedHistoryRows = [];
    this.cacheWidth = 0;
    this.scrollOffset = 0;
    this.lastMaxScroll = 0;
    this.lastTransientRowCount = 0;
    this.lastVisibleHistoryRows = [];
    this.selection = undefined;
    this.forceRepaint = true;
  }

  scroll(delta: number): boolean {
    const next = Math.max(0, Math.min(this.lastMaxScroll, this.scrollOffset + delta));
    if (next === this.scrollOffset) return false;
    this.scrollOffset = next;
    return true;
  }

  scrollToTop(): boolean {
    if (this.scrollOffset === this.lastMaxScroll) return false;
    this.scrollOffset = this.lastMaxScroll;
    return true;
  }

  scrollToTail(): boolean {
    if (this.scrollOffset === 0) return false;
    this.scrollOffset = 0;
    return true;
  }

  isComposerRow(row: number): boolean {
    return (
      Number.isSafeInteger(row) &&
      this.lastComposerRowCount > 0 &&
      row >= this.lastComposerStartRow &&
      row < this.lastComposerStartRow + this.lastComposerRowCount
    );
  }

  beginSelection(row: number, column: number): boolean {
    const point = this.historyPoint(row, column, false);
    if (!point) return false;
    this.selection = {
      anchor: point,
      focus: point,
      snapshot: "",
    };
    this.forceRepaint = true;
    return true;
  }

  extendSelection(row: number, column: number): boolean {
    if (!this.selection) return false;
    const point = this.historyPoint(row, column, true);
    if (!point) return false;
    this.selection.focus = point;
    this.selection.snapshot = this.selectionTextFromPoints();
    this.forceRepaint = true;
    return true;
  }

  clearSelection(): boolean {
    if (!this.selection) return false;
    this.selection = undefined;
    this.forceRepaint = true;
    return true;
  }

  hasSelection(): boolean {
    return Boolean(this.selection?.snapshot);
  }

  selectedText(): string | undefined {
    return this.selection?.snapshot || undefined;
  }

  timelineBounds(): { firstRow: number; lastRow: number } | undefined {
    const first = this.lastVisibleHistoryRows.findIndex(Boolean);
    if (first < 0) return undefined;
    let last = this.lastVisibleHistoryRows.length - 1;
    while (last >= 0 && !this.lastVisibleHistoryRows[last]) last -= 1;
    return { firstRow: first + 1, lastRow: last + 1 };
  }

  private historyPoint(
    row: number,
    column: number,
    includeCell: boolean,
  ): HistoryPoint | undefined {
    if (!Number.isSafeInteger(row) || !Number.isSafeInteger(column)) {
      return undefined;
    }
    const historyRow = this.lastVisibleHistoryRows[row - 1];
    if (
      historyRow?.entryId === undefined ||
      historyRow.start === undefined
    ) {
      return undefined;
    }
    return {
      entryId: historyRow.entryId,
      offset:
        historyRow.start +
        offsetAtColumn(historyRow.plain, Math.max(0, column - 1), includeCell),
    };
  }

  private selectionTextFromPoints(): string {
    if (!this.selection) return "";
    const { start, end } = pointRange(this.selection);
    const chunks: string[] = [];
    for (const entry of this.history) {
      if (entry.id < start.entryId || entry.id > end.entryId) continue;
      const from = entry.id === start.entryId ? start.offset : 0;
      const to = entry.id === end.entryId ? end.offset : entry.plainText.length;
      if (to > from) chunks.push(entry.plainText.slice(from, to));
    }
    return chunks.join("");
  }

  private wrapEntry(entry: HistoryEntry, width: number): HistoryRow[] {
    if (entry.width === width && entry.rows) return entry.rows;
    entry.width = width;
    if (entry.centeredVariants) {
      entry.rows = centerTerminalText(entry.centeredVariants, width)
        .split("\n")
        .map((rendered) => ({
          rendered,
          plain: stripAnsi(rendered),
          ...(entry.decorateRow ? { decorate: entry.decorateRow } : {}),
        }));
    } else {
      const renderedRows = wrapTerminalText(entry.text, width);
      const plainRows = wrapPlainText(entry.plainText, width);
      entry.rows = renderedRows.map((rendered, index) => {
        const plain = plainRows[index] ?? {
          text: stripAnsi(rendered),
          start: entry.plainText.length,
          end: entry.plainText.length,
        };
        return {
          rendered,
          plain: plain.text,
          entryId: entry.id,
          start: plain.start,
          end: plain.end,
          ...(entry.decorateRow &&
              !(entry.plainText.endsWith("\n") &&
                plain.start === entry.plainText.length)
            ? { decorate: entry.decorateRow }
            : {}),
        };
      });
    }
    this.wrapCount += 1;
    return entry.rows;
  }

  private historyRows(width: number): HistoryRow[] {
    if (this.cacheWidth === width) return this.cachedHistoryRows;
    const previousLength = this.cachedHistoryRows.length;
    this.cacheWidth = width;
    this.cachedHistoryRows = this.history.flatMap((entry) =>
      this.wrapEntry(entry, width)
    );
    if (this.scrollOffset > 0 && previousLength > 0) {
      const anchoredFromTop = Math.max(0, previousLength - this.scrollOffset);
      const ratio = anchoredFromTop / previousLength;
      const nextFromTop = Math.round(this.cachedHistoryRows.length * ratio);
      this.scrollOffset = Math.max(0, this.cachedHistoryRows.length - nextFromTop);
    }
    this.trimRenderedRows();
    return this.cachedHistoryRows;
  }

  private trimRenderedRows(): void {
    if (this.cachedHistoryRows.length <= MAX_HISTORY_ROWS) return;
    const removed = this.cachedHistoryRows.length - MAX_HISTORY_ROWS + 1;
    this.cachedHistoryRows = [
      { rendered: OMITTED_HISTORY, plain: stripAnsi(OMITTED_HISTORY) },
      ...this.cachedHistoryRows.slice(removed),
    ];
    if (this.scrollOffset > 0) {
      this.scrollOffset = Math.max(0, this.scrollOffset - removed + 1);
    }
  }

  private renderHistoryRow(row: HistoryRow): string {
    let rendered = row.rendered;
    if (
      !this.selection ||
      row.entryId === undefined ||
      row.start === undefined ||
      row.end === undefined
    ) {
      return row.decorate ? row.decorate(rendered) : rendered;
    }
    const { start, end } = pointRange(this.selection);
    if (
      row.entryId < start.entryId ||
      row.entryId > end.entryId ||
      (row.entryId === start.entryId && row.end <= start.offset) ||
      (row.entryId === end.entryId && row.start >= end.offset)
    ) {
      return row.decorate ? row.decorate(rendered) : rendered;
    }
    const selectionStart =
      row.entryId === start.entryId
        ? Math.max(0, start.offset - row.start)
        : 0;
    const selectionEnd =
      row.entryId === end.entryId
        ? Math.min(row.plain.length, end.offset - row.start)
        : row.plain.length;
    if (selectionEnd <= selectionStart) {
      return row.decorate ? row.decorate(rendered) : rendered;
    }
    rendered = [
      row.plain.slice(0, selectionStart),
      "\u001b[7m",
      row.plain.slice(selectionStart, selectionEnd),
      "\u001b[0m",
      row.plain.slice(selectionEnd),
    ].join("");
    return row.decorate ? row.decorate(rendered) : rendered;
  }

  render(frame: TerminalScreenFrame): void {
    if (!this.active) return;
    const width = positiveInteger(this.output.columns, 80);
    const height = positiveInteger(this.output.rows, 24);
    const geometryChanged = width !== this.lastWidth || height !== this.lastHeight;
    const composerRows = frame.composer.slice(-height);
    const availableTimelineRows = Math.max(0, height - composerRows.length);
    const stableRows = this.historyRows(width);
    const transientRows = (frame.transient ?? []).flatMap((line) =>
      wrapTerminalText(line, width)
    );
    if (this.scrollOffset > 0 && !geometryChanged) {
      this.scrollOffset = Math.max(
        0,
        this.scrollOffset + transientRows.length - this.lastTransientRowCount,
      );
    }
    const timelineRows: HistoryRow[] = [
      ...stableRows,
      ...transientRows.map((rendered) => ({
        rendered,
        plain: stripAnsi(rendered),
      })),
    ];
    this.lastMaxScroll = Math.max(0, timelineRows.length - availableTimelineRows);
    this.scrollOffset = Math.min(this.scrollOffset, this.lastMaxScroll);
    const tailEnd = Math.max(0, timelineRows.length - this.scrollOffset);
    const tailStart = Math.max(0, tailEnd - availableTimelineRows);
    const visibleTimeline = timelineRows.slice(tailStart, tailEnd);
    if (this.scrollOffset > 0 && visibleTimeline.length > 0) {
      const newer = `${this.scrollOffset} newer line${this.scrollOffset === 1 ? "" : "s"} · Ctrl+End to follow`;
      visibleTimeline[0] = {
        rendered: `\u001b[2m${newer.slice(0, width)}\u001b[0m`,
        plain: newer.slice(0, width),
      };
    }
    while (visibleTimeline.length < availableTimelineRows) {
      visibleTimeline.unshift({ rendered: "", plain: "" });
    }
    this.lastVisibleHistoryRows = [
      ...visibleTimeline,
      ...composerRows.map(() => undefined),
    ].slice(-height);
    const rows = [
      ...visibleTimeline.map((row) => this.renderHistoryRow(row)),
      ...composerRows,
    ].slice(-height);
    const composerStart = Math.max(0, height - composerRows.length);
    this.lastComposerStartRow = composerStart + 1;
    this.lastComposerRowCount = composerRows.length;
    const cursorRow = Math.min(height, composerStart + frame.composerCursorRow + 1);
    const cursorColumn = Math.min(width, frame.composerCursorColumn + 1);
    const fullRepaint = this.forceRepaint || geometryChanged ||
      this.lastRows.length !== rows.length;

    if (fullRepaint) {
      const payload = rows.map((row) => `\u001b[2K${row}`).join("\r\n");
      this.output.write(
        `${SYNC_BEGIN}${CURSOR_HIDE}\u001b[H${payload}\u001b[J\u001b[${cursorRow};${cursorColumn}H${CURSOR_SHOW}${SYNC_END}`,
      );
      this.fullRepaintCount += 1;
    } else {
      const dirty: number[] = [];
      for (let index = 0; index < rows.length; index += 1) {
        if (rows[index] !== this.lastRows[index]) dirty.push(index);
      }
      if (dirty.length > 0) {
        const payload = dirty
          .map((index) => `\u001b[${index + 1};1H\u001b[2K${rows[index]}`)
          .join("");
        this.output.write(
          `${SYNC_BEGIN}${CURSOR_HIDE}${payload}\u001b[${cursorRow};${cursorColumn}H${CURSOR_SHOW}${SYNC_END}`,
        );
        this.dirtyRowWriteCount += dirty.length;
      } else if (
        cursorRow !== this.lastCursorRow ||
        cursorColumn !== this.lastCursorColumn
      ) {
        this.output.write(`\u001b[${cursorRow};${cursorColumn}H`);
      }
    }
    this.forceRepaint = false;
    this.lastRows = rows;
    this.lastWidth = width;
    this.lastHeight = height;
    this.lastCursorRow = cursorRow;
    this.lastCursorColumn = cursorColumn;
    this.lastTransientRowCount = transientRows.length;
  }

  debugState(): {
    scrollOffset: number;
    maxScroll: number;
    retainedRows: number;
    historyBytes: number;
    wrapCount: number;
    fullRepaintCount: number;
    dirtyRowWriteCount: number;
  } {
    return {
      scrollOffset: this.scrollOffset,
      maxScroll: this.lastMaxScroll,
      retainedRows: this.cachedHistoryRows.length,
      historyBytes: this.historyBytes,
      wrapCount: this.wrapCount,
      fullRepaintCount: this.fullRepaintCount,
      dirtyRowWriteCount: this.dirtyRowWriteCount,
    };
  }
}
