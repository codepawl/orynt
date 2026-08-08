import { describe, expect, it } from "bun:test";

import { ClaudeSseDecoder, decodeClaudeSse } from "./sse";

function frame(payload: unknown): string {
  return `event: ignored\ndata: ${JSON.stringify(payload)}\n\n`;
}

describe("claude sse decoding", () => {
  it("decodes a complete frame in one chunk", () => {
    const { events, carry } = decodeClaudeSse(
      frame({
        type: "content_block_delta",
        index: 0,
        delta: { type: "text_delta", text: "hello" },
      }),
      "",
    );
    expect(carry).toBe("");
    expect(events).toEqual([{ kind: "text_delta", index: 0, text: "hello" }]);
  });

  it("reassembles a frame split across three chunks", () => {
    const whole = frame({
      type: "content_block_delta",
      index: 2,
      delta: { type: "text_delta", text: "split" },
    });
    const cuts = [12, 30];
    const parts = [
      whole.slice(0, cuts[0]),
      whole.slice(cuts[0], cuts[1]),
      whole.slice(cuts[1]),
    ];
    let carry = "";
    const collected = parts.flatMap((part) => {
      const decoded = decodeClaudeSse(part, carry);
      carry = decoded.carry;
      return decoded.events;
    });
    expect(collected).toEqual([{ kind: "text_delta", index: 2, text: "split" }]);
  });

  it("keeps multi-byte characters intact across a byte-level split", () => {
    const bytes = Buffer.from(
      frame({
        type: "content_block_delta",
        index: 0,
        delta: { type: "text_delta", text: "cà phê 🇻🇳" },
      }),
      "utf8",
    );
    const decoder = new ClaudeSseDecoder();
    const events = [
      ...decoder.push(bytes.subarray(0, 45)),
      ...decoder.push(bytes.subarray(45, 52)),
      ...decoder.push(bytes.subarray(52)),
      ...decoder.flush(),
    ];
    expect(events).toEqual([
      { kind: "text_delta", index: 0, text: "cà phê 🇻🇳" },
    ]);
  });

  it("collects tool input json across many partial deltas", () => {
    const fragments = ['{"pa', 'th":', ' "sr', 'c/a.ts', '"}'];
    const stream = fragments
      .map((partial) =>
        frame({
          type: "content_block_delta",
          index: 1,
          delta: { type: "input_json_delta", partial_json: partial },
        }),
      )
      .join("");
    const { events } = decodeClaudeSse(stream, "");
    expect(events.map((event) => event.kind)).toEqual(
      Array<string>(5).fill("input_json_delta"),
    );
    expect(
      events
        .map((event) =>
          event.kind === "input_json_delta" ? event.partial : "",
        )
        .join(""),
    ).toBe('{"path": "src/a.ts"}');
  });

  it("captures thinking and signature deltas separately from text", () => {
    const { events } = decodeClaudeSse(
      frame({
        type: "content_block_delta",
        index: 0,
        delta: { type: "thinking_delta", thinking: "weighing" },
      }) +
        frame({
          type: "content_block_delta",
          index: 0,
          delta: { type: "signature_delta", signature: "sig-abc" },
        }),
      "",
    );
    expect(events).toEqual([
      { kind: "thinking_delta", index: 0, text: "weighing" },
      { kind: "signature_delta", index: 0, signature: "sig-abc" },
    ]);
  });

  it("reads stop reason, stop details and usage from message_delta", () => {
    const { events } = decodeClaudeSse(
      frame({
        type: "message_delta",
        delta: { stop_reason: "refusal", stop_details: { category: "cyber" } },
        usage: { output_tokens: 12 },
      }),
      "",
    );
    expect(events).toEqual([
      {
        kind: "message_delta",
        stopReason: "refusal",
        stopDetails: { category: "cyber" },
        usage: { output_tokens: 12 },
      },
    ]);
  });

  it("ignores unknown event types without disturbing the carry", () => {
    const { events, carry } = decodeClaudeSse(
      `${frame({ type: "ping" })}data: {"type":"message_st`,
      "",
    );
    expect(events).toEqual([]);
    expect(carry).toBe('data: {"type":"message_st');
  });

  it("skips a frame whose payload is not valid json", () => {
    const { events } = decodeClaudeSse(
      `data: {not json}\n\n${frame({ type: "message_stop" })}`,
      "",
    );
    expect(events).toEqual([{ kind: "message_stop" }]);
  });

  it("emits a trailing frame that never got its blank line", () => {
    const decoder = new ClaudeSseDecoder();
    const partial = Buffer.from(
      `data: ${JSON.stringify({ type: "message_stop" })}\n`,
      "utf8",
    );
    expect(decoder.push(partial)).toEqual([]);
    expect(decoder.flush()).toEqual([{ kind: "message_stop" }]);
  });
});
