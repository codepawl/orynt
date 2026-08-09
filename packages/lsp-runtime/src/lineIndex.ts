import type { PositionEncoding } from "./types.js";

function width(value: string, encoding: PositionEncoding): number {
  if (encoding === "utf-8") return Buffer.byteLength(value, "utf8");
  if (encoding === "utf-16") return value.length;
  return [...value].length;
}

export class LineIndex {
  private readonly lineStarts: number[] = [0];

  constructor(readonly content: string) {
    for (let index = 0; index < content.length; index += 1) {
      if (content.charCodeAt(index) === 10) this.lineStarts.push(index + 1);
    }
  }

  positionAt(
    byteOffset: number,
    encoding: PositionEncoding,
  ): { line: number; character: number } {
    if (
      !Number.isInteger(byteOffset) ||
      byteOffset < 0 ||
      byteOffset > Buffer.byteLength(this.content, "utf8")
    ) {
      throw new RangeError("byte offset is outside the document");
    }
    const prefix = Buffer.from(this.content, "utf8").subarray(0, byteOffset);
    const decoded = prefix.toString("utf8");
    if (Buffer.byteLength(decoded, "utf8") !== byteOffset) {
      throw new RangeError("byte offset is not on a UTF-8 boundary");
    }
    const utf16Offset = decoded.length;
    let line = 0;
    while (
      line + 1 < this.lineStarts.length &&
      this.lineStarts[line + 1]! <= utf16Offset
    ) {
      line += 1;
    }
    const lineText = this.content.slice(this.lineStarts[line]!, utf16Offset);
    return { line, character: width(lineText, encoding) };
  }

  byteOffsetAt(
    position: { line: number; character: number },
    encoding: PositionEncoding,
  ): number {
    if (
      !Number.isInteger(position.line) ||
      !Number.isInteger(position.character) ||
      position.line < 0 ||
      position.character < 0 ||
      position.line >= this.lineStarts.length
    ) {
      throw new RangeError("position is outside the document");
    }
    const start = this.lineStarts[position.line]!;
    const end =
      this.lineStarts[position.line + 1] ?? this.content.length;
    const rawLine = this.content.slice(start, end);
    const line = rawLine.endsWith("\n")
      ? rawLine.slice(0, rawLine.endsWith("\r\n") ? -2 : -1)
      : rawLine;
    let used = 0;
    let utf16Length = 0;
    for (const scalar of line) {
      if (used === position.character) break;
      const scalarWidth = width(scalar, encoding);
      if (used + scalarWidth > position.character) {
        throw new RangeError("position is not on an encoding boundary");
      }
      used += scalarWidth;
      utf16Length += scalar.length;
    }
    if (used !== position.character) {
      throw new RangeError("position is outside the line");
    }
    return Buffer.byteLength(
      this.content.slice(0, start + utf16Length),
      "utf8",
    );
  }
}
