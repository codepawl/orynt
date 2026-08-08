import { StringDecoder } from "node:string_decoder";

export type JsonRecord = Record<string, unknown>;

/**
 * Normalized view of the Anthropic Messages streaming protocol. The wire
 * carries `event:` lines alongside `data:` payloads, but the two always agree,
 * so only the payload is read.
 */
export type ClaudeStreamEvent =
  | { kind: "message_start"; id: string; model: string; usage: JsonRecord }
  | { kind: "block_start"; index: number; block: JsonRecord }
  | { kind: "text_delta"; index: number; text: string }
  | { kind: "thinking_delta"; index: number; text: string }
  | { kind: "signature_delta"; index: number; signature: string }
  | { kind: "input_json_delta"; index: number; partial: string }
  | { kind: "block_stop"; index: number }
  | {
      kind: "message_delta";
      stopReason: string;
      stopDetails?: JsonRecord;
      usage: JsonRecord;
    }
  | { kind: "message_stop" }
  | { kind: "error"; error: JsonRecord };

function record(value: unknown): JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function indexValue(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : 0;
}

function payloadToEvent(payload: JsonRecord): ClaudeStreamEvent | undefined {
  switch (payload.type) {
    case "message_start": {
      const message = record(payload.message);
      return {
        kind: "message_start",
        id: stringValue(message.id),
        model: stringValue(message.model),
        usage: record(message.usage),
      };
    }
    case "content_block_start":
      return {
        kind: "block_start",
        index: indexValue(payload.index),
        block: record(payload.content_block),
      };
    case "content_block_delta": {
      const index = indexValue(payload.index);
      const delta = record(payload.delta);
      switch (delta.type) {
        case "text_delta":
          return { kind: "text_delta", index, text: stringValue(delta.text) };
        case "thinking_delta":
          return {
            kind: "thinking_delta",
            index,
            text: stringValue(delta.thinking),
          };
        case "signature_delta":
          return {
            kind: "signature_delta",
            index,
            signature: stringValue(delta.signature),
          };
        case "input_json_delta":
          return {
            kind: "input_json_delta",
            index,
            partial: stringValue(delta.partial_json),
          };
        default:
          return undefined;
      }
    }
    case "content_block_stop":
      return { kind: "block_stop", index: indexValue(payload.index) };
    case "message_delta": {
      const delta = record(payload.delta);
      const stopDetails = record(delta.stop_details);
      return {
        kind: "message_delta",
        stopReason: stringValue(delta.stop_reason),
        ...(Object.keys(stopDetails).length > 0 ? { stopDetails } : {}),
        usage: record(payload.usage),
      };
    }
    case "message_stop":
      return { kind: "message_stop" };
    case "error":
      return { kind: "error", error: record(payload.error) };
    default:
      // `ping` and any future event type are ignored rather than rejected.
      return undefined;
  }
}

/**
 * Decodes one text chunk of the SSE body. `carry` holds the trailing partial
 * frame from the previous call and must be threaded back in.
 */
export function decodeClaudeSse(
  chunk: string,
  carry: string,
): { events: ClaudeStreamEvent[]; carry: string } {
  const buffer = `${carry}${chunk}`.replace(/\r\n/g, "\n");
  const frames = buffer.split("\n\n");
  const remainder = frames.pop() ?? "";
  const events: ClaudeStreamEvent[] = [];
  for (const frame of frames) {
    const data = frame
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n");
    if (!data || data === "[DONE]") continue;
    let payload: JsonRecord;
    try {
      payload = record(JSON.parse(data) as unknown);
    } catch {
      continue;
    }
    const event = payloadToEvent(payload);
    if (event) events.push(event);
  }
  return { events, carry: remainder };
}

/**
 * Byte-level wrapper around {@link decodeClaudeSse}. The `StringDecoder` keeps
 * multi-byte UTF-8 sequences intact when they straddle a chunk boundary.
 */
export class ClaudeSseDecoder {
  private readonly decoder = new StringDecoder("utf8");
  private carry = "";

  push(bytes: Uint8Array): ClaudeStreamEvent[] {
    return this.ingest(this.decoder.write(Buffer.from(bytes)));
  }

  flush(): ClaudeStreamEvent[] {
    const tail = this.decoder.end();
    // A body that ends without a blank line still holds one complete frame.
    const events = this.ingest(tail);
    const trailing = this.carry;
    this.carry = "";
    if (!trailing.trim()) return events;
    return [...events, ...decodeClaudeSse(`${trailing}\n\n`, "").events];
  }

  private ingest(chunk: string): ClaudeStreamEvent[] {
    const decoded = decodeClaudeSse(chunk, this.carry);
    this.carry = decoded.carry;
    return decoded.events;
  }
}
