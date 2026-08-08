import { describe, expect, it } from "bun:test";

import type {
  AgentRuntimeActivity,
  AgentRuntimeSessionConfig,
} from "@codepawl/model-runtime";

import { ClaudeMessagesRuntime, ClaudeTurnError } from "./messagesRuntime";

type JsonRecord = Record<string, unknown>;

function sse(frames: JsonRecord[]): Response {
  const body = frames
    .map((frame) => `event: ${String(frame.type)}\ndata: ${JSON.stringify(frame)}\n\n`)
    .join("");
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

function textTurn(
  text: string,
  options: { id?: string; stopReason?: string; usage?: JsonRecord } = {},
): JsonRecord[] {
  return [
    {
      type: "message_start",
      message: {
        id: options.id ?? "msg_text",
        model: "claude-opus-5",
        usage: { input_tokens: 10, cache_read_input_tokens: 0 },
      },
    },
    { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
    {
      type: "content_block_delta",
      index: 0,
      delta: { type: "text_delta", text },
    },
    { type: "content_block_stop", index: 0 },
    {
      type: "message_delta",
      delta: { stop_reason: options.stopReason ?? "end_turn" },
      usage: options.usage ?? { output_tokens: 4 },
    },
    { type: "message_stop" },
  ];
}

function toolTurn(
  calls: { id: string; name: string; input: JsonRecord }[],
): JsonRecord[] {
  const frames: JsonRecord[] = [
    {
      type: "message_start",
      message: { id: "msg_tool", model: "claude-opus-5", usage: { input_tokens: 20 } },
    },
  ];
  calls.forEach((call, index) => {
    frames.push({
      type: "content_block_start",
      index,
      content_block: { type: "tool_use", id: call.id, name: call.name, input: {} },
    });
    frames.push({
      type: "content_block_delta",
      index,
      delta: {
        type: "input_json_delta",
        partial_json: JSON.stringify(call.input),
      },
    });
    frames.push({ type: "content_block_stop", index });
  });
  frames.push({
    type: "message_delta",
    delta: { stop_reason: "tool_use" },
    usage: { output_tokens: 8 },
  });
  frames.push({ type: "message_stop" });
  return frames;
}

type Capture = { requests: JsonRecord[]; headers: Record<string, string>[] };

function stubFetch(
  responses: (() => Response)[],
  capture: Capture = { requests: [], headers: [] },
): { fetchImpl: typeof fetch; capture: Capture } {
  let index = 0;
  const fetchImpl = (async (_url: string, init: RequestInit) => {
    capture.requests.push(JSON.parse(String(init.body)) as JsonRecord);
    capture.headers.push({ ...(init.headers as Record<string, string>) });
    const next = responses[Math.min(index, responses.length - 1)]!;
    index += 1;
    return next();
  }) as unknown as typeof fetch;
  return { fetchImpl, capture };
}

function ticker(): () => number {
  let value = 0;
  return () => (value += 1);
}

function sessionConfig(
  overrides: Partial<AgentRuntimeSessionConfig> = {},
): AgentRuntimeSessionConfig {
  return {
    sessionId: "s1",
    role: "coordinator",
    model: "claude-opus-5",
    effort: "high",
    instructions: "Be useful.",
    ...overrides,
  };
}

const readTool = {
  type: "function" as const,
  name: "read_file",
  description: "read a file",
  strict: true as const,
  parameters: {
    type: "object",
    properties: { path: { type: "string" } },
    required: ["path"],
    additionalProperties: false,
  },
};

describe("ClaudeMessagesRuntime credentials", () => {
  it("rejects a configuration that sets both credential variables", () => {
    const previousKey = process.env.ANTHROPIC_API_KEY;
    const previousToken = process.env.ANTHROPIC_AUTH_TOKEN;
    process.env.ANTHROPIC_API_KEY = "sk-ant-key";
    process.env.ANTHROPIC_AUTH_TOKEN = "oauth-token";
    try {
      expect(() => new ClaudeMessagesRuntime()).toThrow(
        "Set only one of ANTHROPIC_API_KEY or ANTHROPIC_AUTH_TOKEN",
      );
    } finally {
      if (previousKey === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = previousKey;
      if (previousToken === undefined) delete process.env.ANTHROPIC_AUTH_TOKEN;
      else process.env.ANTHROPIC_AUTH_TOKEN = previousToken;
    }
  });

  it("names the environment variable when no credential is present", () => {
    expect(
      () => new ClaudeMessagesRuntime({ apiKeyEnv: "ORYNT_ABSENT_KEY" }),
    ).toThrow("Anthropic API key is unavailable in ORYNT_ABSENT_KEY");
  });

  it("sends the API key as x-api-key", async () => {
    const { fetchImpl, capture } = stubFetch([() => sse(textTurn("ok"))]);
    const runtime = new ClaudeMessagesRuntime({
      apiKey: "sk-ant-test",
      fetchImpl,
      now: ticker(),
    });
    const session = await runtime.startSession(sessionConfig());
    await session.runTurn({ text: "hi" });
    expect(capture.headers[0]!["x-api-key"]).toBe("sk-ant-test");
    expect(capture.headers[0]).not.toHaveProperty("authorization");
    expect(capture.headers[0]!["anthropic-version"]).toBe("2023-06-01");
  });

  it("sends an OAuth token as a bearer with the oauth beta header", async () => {
    const previous = process.env.ORYNT_TEST_CLAUDE_TOKEN;
    process.env.ORYNT_TEST_CLAUDE_TOKEN = "oat-123";
    try {
      const { fetchImpl, capture } = stubFetch([() => sse(textTurn("ok"))]);
      const runtime = new ClaudeMessagesRuntime({
        apiKeyEnv: "ORYNT_TEST_CLAUDE_ABSENT",
        authTokenEnv: "ORYNT_TEST_CLAUDE_TOKEN",
        fetchImpl,
        now: ticker(),
      });
      const session = await runtime.startSession(sessionConfig());
      await session.runTurn({ text: "hi" });
      expect(capture.headers[0]!.authorization).toBe("Bearer oat-123");
      expect(capture.headers[0]!["anthropic-beta"]).toBe("oauth-2025-04-20");
      expect(capture.headers[0]).not.toHaveProperty("x-api-key");
    } finally {
      if (previous === undefined) delete process.env.ORYNT_TEST_CLAUDE_TOKEN;
      else process.env.ORYNT_TEST_CLAUDE_TOKEN = previous;
    }
  });
});

describe("ClaudeMessagesRuntime request shape", () => {
  it("omits every parameter the current models reject", async () => {
    const { fetchImpl, capture } = stubFetch([() => sse(textTurn("ok"))]);
    const runtime = new ClaudeMessagesRuntime({
      apiKey: "k",
      fetchImpl,
      now: ticker(),
    });
    const session = await runtime.startSession(
      sessionConfig({ tools: [readTool] }),
    );
    await session.runTurn({ text: "hi" });
    const body = capture.requests[0]!;
    expect(body).not.toHaveProperty("temperature");
    expect(body).not.toHaveProperty("top_p");
    expect(body).not.toHaveProperty("top_k");
    expect(JSON.stringify(body)).not.toContain("budget_tokens");
    expect(body.thinking).toEqual({ type: "adaptive", display: "summarized" });
    expect(body.output_config).toEqual({ effort: "high" });
    expect(body.max_tokens).toBe(16_000);
  });

  it("withholds effort and thinking on a model that rejects them", async () => {
    const { fetchImpl, capture } = stubFetch([() => sse(textTurn("ok"))]);
    const runtime = new ClaudeMessagesRuntime({
      apiKey: "k",
      fetchImpl,
      now: ticker(),
    });
    const session = await runtime.startSession(
      sessionConfig({ model: "claude-haiku-4-5" }),
    );
    await session.runTurn({ text: "hi" });
    expect(capture.requests[0]).not.toHaveProperty("thinking");
    expect(capture.requests[0]).not.toHaveProperty("output_config");
  });

  it("places cache breakpoints only when a prompt cache key is set", async () => {
    const { fetchImpl, capture } = stubFetch([
      () => sse(textTurn("a")),
      () => sse(textTurn("b")),
    ]);
    const runtime = new ClaudeMessagesRuntime({
      apiKey: "k",
      fetchImpl,
      now: ticker(),
    });
    const plain = await runtime.startSession(
      sessionConfig({ tools: [readTool] }),
    );
    await plain.runTurn({ text: "hi" });
    const cached = await runtime.startSession(
      sessionConfig({ tools: [readTool], promptCacheKey: "repo-42" }),
    );
    await cached.runTurn({ text: "hi" });

    const system = (body: JsonRecord) => (body.system as JsonRecord[])[0]!;
    expect(system(capture.requests[0]!)).not.toHaveProperty("cache_control");
    expect(system(capture.requests[1]!).cache_control).toEqual({
      type: "ephemeral",
    });
    // The key itself is never sent — Anthropic caches by prefix match.
    expect(JSON.stringify(capture.requests[1])).not.toContain("repo-42");
  });

  it("refuses image generation at session start", async () => {
    const { fetchImpl } = stubFetch([() => sse(textTurn("ok"))]);
    const runtime = new ClaudeMessagesRuntime({ apiKey: "k", fetchImpl });
    await expect(
      runtime.startSession(
        sessionConfig({ imageGeneration: { enabled: true, maxOutputs: 1 } }),
      ),
    ).rejects.toThrow("cannot generate images");
  });
});

describe("ClaudeMessagesRuntime turns", () => {
  it("streams text deltas and reports normalized usage", async () => {
    const activities: AgentRuntimeActivity[] = [];
    const { fetchImpl } = stubFetch([
      () =>
        sse(
          textTurn("hello", {
            usage: { output_tokens: 5, cache_read_input_tokens: 90 },
          }),
        ),
    ]);
    const runtime = new ClaudeMessagesRuntime({
      apiKey: "k",
      fetchImpl,
      now: ticker(),
    });
    const session = await runtime.startSession(
      sessionConfig({ onActivity: (activity) => activities.push(activity) }),
    );
    const result = await session.runTurn({ text: "hi" });

    expect(result.provider).toBe("anthropic_messages");
    expect(result.transport).toBe("http");
    expect(result.text).toBe("hello");
    expect(result.responseId).toBe("msg_text");
    expect(result.normalizedUsage).toEqual({
      inputTokens: 100,
      cachedInputTokens: 90,
      outputTokens: 5,
      reasoningOutputTokens: 0,
      totalTokens: 105,
    });
    expect(result.timing.firstDeltaMs).toBeGreaterThan(0);
    expect(result.timing.completedMs).toBeGreaterThan(
      result.timing.providerDispatchedMs,
    );
    expect(activities.map((activity) => activity.kind)).toEqual([
      "connection",
      "text_delta",
      "context",
      "response",
    ]);
  });

  it("runs the tool loop and returns every result in one user message", async () => {
    const { fetchImpl, capture } = stubFetch([
      () =>
        sse(
          toolTurn([
            { id: "toolu_1", name: "read_file", input: { path: "a.ts" } },
            { id: "toolu_2", name: "read_file", input: { path: "b.ts" } },
          ]),
        ),
      () => sse(textTurn("done")),
    ]);
    const runtime = new ClaudeMessagesRuntime({
      apiKey: "k",
      fetchImpl,
      now: ticker(),
    });
    const activities: AgentRuntimeActivity[] = [];
    const session = await runtime.startSession(
      sessionConfig({
        tools: [readTool],
        onActivity: (activity) => activities.push(activity),
        executeTool: async (call) => ({
          output: `contents of ${(call.arguments as JsonRecord).path}`,
        }),
      }),
    );
    const result = await session.runTurn({ text: "read both" });

    expect(result.text).toBe("done");
    const followUp = capture.requests[1]!.messages as JsonRecord[];
    const toolResults = followUp.filter(
      (message) =>
        message.role === "user" &&
        Array.isArray(message.content) &&
        (message.content as JsonRecord[]).some(
          (block) => block.type === "tool_result",
        ),
    );
    expect(toolResults).toHaveLength(1);
    expect(toolResults[0]!.content).toHaveLength(2);
    expect(
      activities.filter((activity) => activity.kind === "tool"),
    ).toHaveLength(4);
  });

  it("echoes assistant thinking blocks back unchanged", async () => {
    const thinkingTurn: JsonRecord[] = [
      {
        type: "message_start",
        message: { id: "msg_think", model: "claude-opus-5", usage: {} },
      },
      {
        type: "content_block_start",
        index: 0,
        content_block: { type: "thinking", thinking: "", signature: "" },
      },
      {
        type: "content_block_delta",
        index: 0,
        delta: { type: "thinking_delta", thinking: "weighing" },
      },
      {
        type: "content_block_delta",
        index: 0,
        delta: { type: "signature_delta", signature: "sig-1" },
      },
      { type: "content_block_stop", index: 0 },
      {
        type: "content_block_start",
        index: 1,
        content_block: { type: "tool_use", id: "toolu_1", name: "read_file", input: {} },
      },
      {
        type: "content_block_delta",
        index: 1,
        delta: { type: "input_json_delta", partial_json: '{"path":"a.ts"}' },
      },
      { type: "content_block_stop", index: 1 },
      {
        type: "message_delta",
        delta: { stop_reason: "tool_use" },
        usage: { output_tokens: 3 },
      },
      { type: "message_stop" },
    ];
    const { fetchImpl, capture } = stubFetch([
      () => sse(thinkingTurn),
      () => sse(textTurn("done")),
    ]);
    const runtime = new ClaudeMessagesRuntime({
      apiKey: "k",
      fetchImpl,
      now: ticker(),
    });
    const session = await runtime.startSession(
      sessionConfig({
        tools: [readTool],
        executeTool: async () => ({ output: "ok" }),
      }),
    );
    const result = await session.runTurn({ text: "go" });

    // Thinking text must survive on the echoed block but never reach `text`.
    expect(result.text).toBe("done");
    const assistant = (capture.requests[1]!.messages as JsonRecord[]).find(
      (message) => message.role === "assistant",
    )!;
    expect(assistant.content).toEqual([
      { type: "thinking", thinking: "weighing", signature: "sig-1" },
      {
        type: "tool_use",
        id: "toolu_1",
        name: "read_file",
        input: { path: "a.ts" },
      },
    ]);
  });

  it("turns an executor failure into a tool result instead of failing the turn", async () => {
    const { fetchImpl, capture } = stubFetch([
      () => sse(toolTurn([{ id: "toolu_1", name: "read_file", input: {} }])),
      () => sse(textTurn("recovered")),
    ]);
    const runtime = new ClaudeMessagesRuntime({
      apiKey: "k",
      fetchImpl,
      now: ticker(),
    });
    const session = await runtime.startSession(
      sessionConfig({
        tools: [readTool],
        executeTool: async () => {
          throw new Error("disk offline");
        },
      }),
    );
    const result = await session.runTurn({ text: "go" });
    expect(result.text).toBe("recovered");
    const toolResult = (
      (capture.requests[1]!.messages as JsonRecord[]).at(-1)!
        .content as JsonRecord[]
    )[0]!;
    expect(toolResult.is_error).toBe(true);
    expect(
      ((toolResult.content as JsonRecord[])[0]!.text as string),
    ).toContain("disk offline");
  });

  it("fails when tools are requested without an executor", async () => {
    const { fetchImpl } = stubFetch([
      () => sse(toolTurn([{ id: "toolu_1", name: "read_file", input: {} }])),
    ]);
    const runtime = new ClaudeMessagesRuntime({
      apiKey: "k",
      fetchImpl,
      now: ticker(),
    });
    const session = await runtime.startSession(
      sessionConfig({ tools: [readTool] }),
    );
    await expect(session.runTurn({ text: "go" })).rejects.toThrow(
      "coordinator has no tool executor",
    );
  });

  it("stops once the tool-call budget is exhausted", async () => {
    const { fetchImpl } = stubFetch([
      () => sse(toolTurn([{ id: "toolu_1", name: "read_file", input: {} }])),
    ]);
    const runtime = new ClaudeMessagesRuntime({
      apiKey: "k",
      fetchImpl,
      now: ticker(),
    });
    const session = await runtime.startSession(
      sessionConfig({
        tools: [readTool],
        maxToolCalls: 0,
        executeTool: async () => ({ output: "" }),
      }),
    );
    await expect(session.runTurn({ text: "go" })).rejects.toThrow(
      "exceeded its tool-call budget",
    );
  });
});

describe("ClaudeMessagesRuntime failure handling", () => {
  it("raises a typed error on a refusal that carries no content", async () => {
    const { fetchImpl } = stubFetch([
      () =>
        sse([
          {
            type: "message_start",
            message: { id: "msg_r", model: "claude-opus-5", usage: {} },
          },
          {
            type: "message_delta",
            delta: {
              stop_reason: "refusal",
              stop_details: { category: "cyber" },
            },
            usage: { output_tokens: 0 },
          },
          { type: "message_stop" },
        ]),
    ]);
    const runtime = new ClaudeMessagesRuntime({
      apiKey: "k",
      fetchImpl,
      now: ticker(),
    });
    const session = await runtime.startSession(sessionConfig());
    // HTTP 200 with an empty content array: reading content[0] would throw a
    // TypeError instead of surfacing the refusal.
    const error = (await session
      .runTurn({ text: "hi" })
      .catch((caught: unknown) => caught)) as ClaudeTurnError;
    expect(error).toBeInstanceOf(ClaudeTurnError);
    expect(error.code).toBe("refusal:cyber");
  });

  it("flags a context-window overflow", async () => {
    const { fetchImpl } = stubFetch([
      () =>
        sse(
          textTurn("partial", { stopReason: "model_context_window_exceeded" }),
        ),
    ]);
    const runtime = new ClaudeMessagesRuntime({
      apiKey: "k",
      fetchImpl,
      now: ticker(),
    });
    const session = await runtime.startSession(sessionConfig());
    const error = (await session
      .runTurn({ text: "hi" })
      .catch((caught: unknown) => caught)) as ClaudeTurnError;
    expect(error.contextWindowExceeded).toBe(true);
  });

  it("never returns a max_tokens truncation as a complete answer", async () => {
    const { fetchImpl } = stubFetch([
      () => sse(textTurn("half a th", { stopReason: "max_tokens" })),
    ]);
    const runtime = new ClaudeMessagesRuntime({
      apiKey: "k",
      fetchImpl,
      now: ticker(),
    });
    const session = await runtime.startSession(sessionConfig());
    const error = (await session
      .runTurn({ text: "hi" })
      .catch((caught: unknown) => caught)) as ClaudeTurnError;
    expect(error.code).toBe("max_tokens");
  });

  it("marks side effects once a tool has already run", async () => {
    const { fetchImpl } = stubFetch([
      () => sse(toolTurn([{ id: "toolu_1", name: "read_file", input: {} }])),
      () => sse(textTurn("x", { stopReason: "max_tokens" })),
    ]);
    const runtime = new ClaudeMessagesRuntime({
      apiKey: "k",
      fetchImpl,
      now: ticker(),
    });
    const session = await runtime.startSession(
      sessionConfig({
        tools: [readTool],
        executeTool: async () => ({ output: "wrote a file" }),
      }),
    );
    const error = (await session
      .runTurn({ text: "go" })
      .catch((caught: unknown) => caught)) as ClaudeTurnError;
    expect(error.sideEffectsStarted).toBe(true);
  });

  it("reads retry-after off a rate-limit response", async () => {
    const { fetchImpl } = stubFetch([
      () =>
        new Response(
          JSON.stringify({
            type: "error",
            error: { type: "rate_limit_error", message: "slow down" },
          }),
          { status: 429, headers: { "retry-after": "3" } },
        ),
    ]);
    const runtime = new ClaudeMessagesRuntime({
      apiKey: "k",
      fetchImpl,
      now: ticker(),
    });
    const session = await runtime.startSession(sessionConfig());
    const error = (await session
      .runTurn({ text: "hi" })
      .catch((caught: unknown) => caught)) as ClaudeTurnError;
    expect(error.status).toBe(429);
    expect(error.code).toBe("rate_limit_error");
    expect(error.retryAfterMs).toBe(3_000);
  });

  it("redacts credentials echoed back inside an error body", async () => {
    const { fetchImpl } = stubFetch([
      () =>
        new Response(
          JSON.stringify({
            type: "error",
            error: {
              type: "authentication_error",
              message: "invalid key sk-ant-api03-SECRETVALUE0123456789",
            },
          }),
          { status: 401 },
        ),
    ]);
    const runtime = new ClaudeMessagesRuntime({
      apiKey: "k",
      fetchImpl,
      now: ticker(),
    });
    const session = await runtime.startSession(sessionConfig());
    const error = (await session
      .runTurn({ text: "hi" })
      .catch((caught: unknown) => caught)) as ClaudeTurnError;
    expect(error.message).not.toContain("SECRETVALUE");
  });

  it("rejects a cancelled turn with an AbortError", async () => {
    const { fetchImpl } = stubFetch([() => sse(textTurn("ok"))]);
    const runtime = new ClaudeMessagesRuntime({
      apiKey: "k",
      fetchImpl,
      now: ticker(),
    });
    const session = await runtime.startSession(sessionConfig());
    const controller = new AbortController();
    controller.abort();
    const error = (await session
      .runTurn({ text: "hi", signal: controller.signal })
      .catch((caught: unknown) => caught)) as Error;
    expect(error.name).toBe("AbortError");
  });
});

describe("ClaudeMessagesRuntime context guard", () => {
  it("resets the canonical history once it outgrows the byte guard", async () => {
    const bulk = "x".repeat(300 * 1024);
    const { fetchImpl, capture } = stubFetch([
      () => sse(textTurn("one")),
      () => sse(textTurn("two")),
    ]);
    const runtime = new ClaudeMessagesRuntime({
      apiKey: "k",
      fetchImpl,
      now: ticker(),
    });
    const session = await runtime.startSession(sessionConfig());
    await session.runTurn({ text: bulk });
    await session.runTurn({ text: "second" });
    // The guard clears history before the second turn, so it carries only the
    // new user message rather than the 300KB one.
    expect(capture.requests[1]!.messages).toHaveLength(1);
  });

  it("keeps history when the caller supplies a real context window", async () => {
    const bulk = "x".repeat(300 * 1024);
    const { fetchImpl, capture } = stubFetch([
      () => sse(textTurn("one")),
      () => sse(textTurn("two")),
    ]);
    const runtime = new ClaudeMessagesRuntime({
      apiKey: "k",
      fetchImpl,
      now: ticker(),
    });
    const session = await runtime.startSession(
      sessionConfig({ effectiveContextWindowTokens: 900_000 }),
    );
    await session.runTurn({ text: bulk });
    await session.runTurn({ text: "second" });
    expect((capture.requests[1]!.messages as JsonRecord[]).length).toBe(3);
  });
});
