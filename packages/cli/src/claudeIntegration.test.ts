import { describe, expect, it } from "bun:test";

import { ContextController } from "@codepawl/agent-runtime";
import {
  ClaudeMessagesRuntime,
  ClaudeProviderUsageReader,
  ClaudeRateLimitRecorder,
} from "@codepawl/claude-adapter";
import type { AgentRuntimeActivity } from "@codepawl/model-runtime";

type JsonRecord = Record<string, unknown>;

/**
 * These exercise the wiring end to end — runtime → normalized usage →
 * ContextController, and runtime → rate-limit recorder → usage reader — rather
 * than each unit against its own assumptions. A unit test written from the
 * same mistaken premise as the code would pass while the product misbehaved.
 */
function sse(frames: JsonRecord[], headers: Record<string, string> = {}): Response {
  const body = frames
    .map((frame) => `data: ${JSON.stringify(frame)}\n\n`)
    .join("");
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/event-stream", ...headers },
  });
}

function turn(usage: JsonRecord): JsonRecord[] {
  return [
    {
      type: "message_start",
      message: {
        id: "msg_1",
        model: "claude-opus-5",
        usage: {
          input_tokens: usage.input_tokens,
          cache_read_input_tokens: usage.cache_read_input_tokens,
          cache_creation_input_tokens: usage.cache_creation_input_tokens,
        },
      },
    },
    {
      type: "content_block_start",
      index: 0,
      content_block: { type: "text", text: "" },
    },
    {
      type: "content_block_delta",
      index: 0,
      delta: { type: "text_delta", text: "ok" },
    },
    { type: "content_block_stop", index: 0 },
    {
      type: "message_delta",
      delta: { stop_reason: "end_turn" },
      usage: { output_tokens: usage.output_tokens },
    },
    { type: "message_stop" },
  ];
}

describe("claude turn feeds real context pressure", () => {
  it("computes pressure from the whole prompt, not the uncached remainder", async () => {
    // A long, well-cached conversation: 8_000 fresh prompt tokens on top of
    // 172_000 already cached, inside a 200_000-token effective window.
    const fetchImpl = (async () =>
      sse(
        turn({
          input_tokens: 8_000,
          cache_read_input_tokens: 170_000,
          cache_creation_input_tokens: 2_000,
          output_tokens: 1_000,
        }),
      )) as unknown as typeof fetch;
    const runtime = new ClaudeMessagesRuntime({
      apiKey: "k",
      fetchImpl,
      now: (() => {
        let value = 0;
        return () => (value += 1);
      })(),
    });
    const session = await runtime.startSession({
      sessionId: "s1",
      role: "coordinator",
      model: "claude-opus-5",
      effort: "high",
      instructions: "Be useful.",
      effectiveContextWindowTokens: 200_000,
    });
    const result = await session.runTurn({ text: "continue" });

    const controller = new ContextController({
      modelId: "claude-opus-5",
      capacity: {
        contextWindowTokens: 200_000,
        effectiveWindowTokens: 200_000,
      },
    });
    const snapshot = controller.recordUsage({
      current: result.normalizedUsage!,
      precision: "provider",
    });

    // Anthropic's raw `input_tokens` is 8_000. Reporting that would put this
    // session at ~4% and compaction would never fire.
    expect(snapshot.usage.current!.inputTokens).toBe(180_000);
    expect(controller.preflight("next turn").action).not.toBe("continue");
    expect(controller.preflight("next turn").projectedPercent).toBeGreaterThan(
      85,
    );
    await runtime.close();
  });

  it("stays under the warning threshold when the prompt really is small", async () => {
    const fetchImpl = (async () =>
      sse(
        turn({
          input_tokens: 500,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 0,
          output_tokens: 100,
        }),
      )) as unknown as typeof fetch;
    const runtime = new ClaudeMessagesRuntime({
      apiKey: "k",
      fetchImpl,
      now: () => 1,
    });
    const session = await runtime.startSession({
      sessionId: "s2",
      role: "coordinator",
      model: "claude-opus-5",
      effort: "high",
      instructions: "Be useful.",
      effectiveContextWindowTokens: 200_000,
    });
    const result = await session.runTurn({ text: "hi" });
    const controller = new ContextController({
      modelId: "claude-opus-5",
      capacity: {
        contextWindowTokens: 200_000,
        effectiveWindowTokens: 200_000,
      },
    });
    controller.recordUsage({
      current: result.normalizedUsage!,
      precision: "provider",
    });
    expect(controller.preflight("hi").action).toBe("continue");
    await runtime.close();
  });

  it("emits the context activity the composer renders", async () => {
    const activities: AgentRuntimeActivity[] = [];
    const fetchImpl = (async () =>
      sse(
        turn({
          input_tokens: 10,
          cache_read_input_tokens: 90,
          cache_creation_input_tokens: 0,
          output_tokens: 5,
        }),
      )) as unknown as typeof fetch;
    const runtime = new ClaudeMessagesRuntime({
      apiKey: "k",
      fetchImpl,
      now: () => 1,
    });
    const session = await runtime.startSession({
      sessionId: "s3",
      role: "coordinator",
      model: "claude-opus-5",
      effort: "high",
      instructions: "Be useful.",
      onActivity: (activity) => activities.push(activity),
    });
    await session.runTurn({ text: "hi" });
    const context = activities.find((activity) => activity.kind === "context");
    expect(context).toMatchObject({
      precision: "provider",
      current: { inputTokens: 100, cachedInputTokens: 90, totalTokens: 105 },
    });
    await runtime.close();
  });
});

describe("claude usage becomes observable after a turn", () => {
  it("moves from unavailable to degraded once headers are observed", async () => {
    const recorder = new ClaudeRateLimitRecorder();
    const reader = new ClaudeProviderUsageReader({ recorder });

    const before = await reader.readUsage();
    expect(before.status).toBe("unavailable");
    expect(before.meters).toEqual([]);

    const fetchImpl = (async () =>
      sse(
        turn({
          input_tokens: 10,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 0,
          output_tokens: 5,
        }),
        {
          "anthropic-ratelimit-requests-limit": "1000",
          "anthropic-ratelimit-requests-remaining": "600",
          "anthropic-ratelimit-input-tokens-limit": "80000",
          "anthropic-ratelimit-input-tokens-remaining": "20000",
          "anthropic-ratelimit-input-tokens-reset": "2026-08-08T12:00:00Z",
        },
      )) as unknown as typeof fetch;
    const runtime = new ClaudeMessagesRuntime({
      apiKey: "k",
      fetchImpl,
      now: () => 1,
      onResponseHeaders: (headers) => recorder.record(headers),
    });
    const session = await runtime.startSession({
      sessionId: "s4",
      role: "coordinator",
      model: "claude-opus-5",
      effort: "high",
      instructions: "Be useful.",
    });
    await session.runTurn({ text: "hi" });

    const after = await reader.readUsage();
    expect(after.status).toBe("degraded");
    expect(after.meters.map((meter) => meter.id)).toEqual([
      "input-tokens",
      "requests",
    ]);
    expect(after.meters[0]!.windows[0]).toMatchObject({
      usedPercent: 75,
      remainingPercent: 25,
      resetsAt: "2026-08-08T12:00:00Z",
    });
    // The reader must still refuse to invent an account or credit balance.
    expect(after.account).toBeNull();
    await runtime.close();
  });

  it("records rate-limit headers even when the request failed", async () => {
    const recorder = new ClaudeRateLimitRecorder();
    const fetchImpl = (async () =>
      new Response(
        JSON.stringify({
          type: "error",
          error: { type: "rate_limit_error", message: "slow down" },
        }),
        {
          status: 429,
          headers: {
            "retry-after": "5",
            "anthropic-ratelimit-requests-limit": "100",
            "anthropic-ratelimit-requests-remaining": "0",
          },
        },
      )) as unknown as typeof fetch;
    const runtime = new ClaudeMessagesRuntime({
      apiKey: "k",
      fetchImpl,
      now: () => 1,
      onResponseHeaders: (headers) => recorder.record(headers),
    });
    const session = await runtime.startSession({
      sessionId: "s5",
      role: "coordinator",
      model: "claude-opus-5",
      effort: "high",
      instructions: "Be useful.",
    });
    await session.runTurn({ text: "hi" }).catch(() => undefined);

    const snapshot = await new ClaudeProviderUsageReader({
      recorder,
    }).readUsage();
    // A 429 is exactly when usage matters most, so it must not be dropped.
    expect(snapshot.status).toBe("degraded");
    expect(snapshot.meters[0]!.windows[0]!.remainingPercent).toBe(0);
    await runtime.close();
  });
});
