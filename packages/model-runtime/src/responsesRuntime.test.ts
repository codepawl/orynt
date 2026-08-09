import { EventEmitter } from "node:events";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "bun:test";

import {
  parseResponsesTokenUsage,
  ResponsesAgentRuntime,
  ResponsesTurnError,
} from "./responsesRuntime.js";

describe("Responses context telemetry", () => {
  it("normalizes provider usage for context tracking", () => {
    expect(parseResponsesTokenUsage({
      input_tokens: 12_000,
      input_tokens_details: { cached_tokens: 10_000 },
      output_tokens: 500,
      output_tokens_details: { reasoning_tokens: 120 },
      total_tokens: 12_500,
    })).toEqual({
      inputTokens: 12_000,
      cachedInputTokens: 10_000,
      outputTokens: 500,
      reasoningOutputTokens: 120,
      totalTokens: 12_500,
    });
    expect(parseResponsesTokenUsage({})).toBeUndefined();
  });

  it("classifies context-window errors structurally", () => {
    const error = new ResponsesTurnError("full", {
      code: "context_length_exceeded",
    });
    expect(error.contextWindowExceeded).toBe(true);
  });
});

class FakeSocket extends EventEmitter {
  readyState = 0;
  sent: Record<string, unknown>[] = [];

  constructor(private readonly responder: (message: Record<string, unknown>, socket: FakeSocket) => void) {
    super();
    queueMicrotask(() => {
      this.readyState = 1;
      this.emit("open");
    });
  }

  send(data: string): void {
    const message = JSON.parse(data) as Record<string, unknown>;
    this.sent.push(message);
    queueMicrotask(() => this.responder(message, this));
  }

  respond(value: unknown): void {
    this.emit("message", Buffer.from(JSON.stringify(value)));
  }

  close(): void {
    this.readyState = 3;
    this.emit("close");
  }

  terminate(): void {
    this.readyState = 3;
  }
}

describe("ResponsesAgentRuntime", () => {
  it("sends verified image inputs with explicit detail and captures generated images", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "orynt-responses-image-"));
    const imagePath = path.join(root, "crop.png");
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB", "base64");
    await writeFile(imagePath, png);
    let socket: FakeSocket | undefined;
    try {
      const runtime = new ResponsesAgentRuntime({
        apiKey: "test-key",
        createWebSocket: () => {
          socket = new FakeSocket((message, target) => {
            if (message.generate === false) {
              target.respond({ type: "response.completed", response: { id: "warm", output: [] } });
              return;
            }
            target.respond({
              type: "response.completed",
              response: {
                id: "image-response",
                output: [{
                  type: "image_generation_call",
                  id: "image-1",
                  status: "completed",
                  revised_prompt: "A concise icon",
                  result: "generated-base64",
                }],
              },
            });
          });
          return socket;
        },
      });
      const session = await runtime.startSession({
        sessionId: "images",
        role: "implementer",
        model: "gpt-test",
        effort: "medium",
        instructions: "Inspect and generate only as explicitly requested.",
        imageGeneration: { enabled: true, maxOutputs: 1 },
      });
      expect(runtime.activeSessionCount()).toBe(1);
      const result = await session.runTurn({
        text: "Use this crop",
        images: [{
          kind: "local_file",
          path: imagePath,
          mimeType: "image/png",
          sha256: createHash("sha256").update(png).digest("hex"),
          byteLength: png.length,
          detail: "original",
          source: "browser_crop",
        }],
      });
      const request = socket?.sent[1] as Record<string, unknown>;
      expect(request.tools).toContainEqual({ type: "image_generation" });
      expect(request.input).toEqual([expect.objectContaining({
        content: [
          { type: "input_text", text: "Use this crop" },
          expect.objectContaining({
            type: "input_image",
            detail: "original",
            image_url: expect.stringMatching(/^data:image\/png;base64,/u),
          }),
        ],
      })]);
      expect(result.generatedImages).toEqual([expect.objectContaining({
        providerItemId: "image-1",
        revisedPrompt: "A concise icon",
        status: "completed",
      })]);
      await session.close();
      expect(runtime.activeSessionCount()).toBe(0);
      await runtime.close();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("prewarms, chains tool output, and returns structured text", async () => {
    let socket: FakeSocket | undefined;
    const runtime = new ResponsesAgentRuntime({
      apiKey: "test-key",
      createWebSocket: (_url, headers) => {
        expect(headers.Authorization).toBe("Bearer test-key");
        socket = new FakeSocket((message, target) => {
          if (message.generate === false) {
            target.respond({
              type: "response.completed",
              response: { id: "resp-warm", output: [], usage: {} },
            });
            return;
          }
          if (message.previous_response_id === "resp-warm") {
            target.respond({
              type: "response.completed",
              response: {
                id: "resp-tool",
                output: [{
                  type: "function_call",
                  call_id: "call-1",
                  name: "repo_status",
                  arguments: "{}",
                }],
                usage: {},
              },
            });
            return;
          }
          target.respond({ type: "response.output_text.delta", delta: "{\"ok\":" });
          target.respond({
            type: "response.completed",
            response: {
              id: "resp-final",
              output: [{
                type: "message",
                content: [{ type: "output_text", text: "{\"ok\":true}" }],
              }],
              usage: { output_tokens: 2 },
            },
          });
        });
        return socket;
      },
    });
    const activities: Array<{
      kind: string;
      descriptor?: { action: string; toolName: string; detail: string };
    }> = [];
    const session = await runtime.startSession({
      sessionId: "session-1",
      role: "helper",
      model: "gpt-test",
      effort: "medium",
      instructions: "Inspect.",
      tools: [{
        type: "function",
        name: "repo_status",
        description: "status",
        strict: true,
        parameters: { type: "object", additionalProperties: false, required: [], properties: {} },
      }],
      outputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["ok"],
        properties: { ok: { type: "boolean" } },
      },
      executeTool: async () => ({
        output: "{\"clean\":true}",
        images: [{
          dataUrl: "data:image/png;base64,cG5n",
          detail: "original",
          source: "browser_crop",
        }],
      }),
      describeTool: (call) => ({
        action: "inspect",
        toolName: call.name,
        detail: "git status --short",
      }),
      onActivity: (activity) => activities.push(activity),
    });
    const result = await session.runTurn({ text: "Check status" });
    expect(result.transport).toBe("websocket");
    expect(result.text).toBe("{\"ok\":true}");
    expect(socket?.sent).toHaveLength(3);
    expect(socket?.sent[2]).toMatchObject({
      previous_response_id: "resp-tool",
      input: [
        { type: "function_call_output", call_id: "call-1" },
        {
          type: "message",
          role: "user",
          content: [{
            type: "input_image",
            image_url: "data:image/png;base64,cG5n",
            detail: "original",
          }],
        },
      ],
    });
    expect(activities.map(({ kind }) => kind)).toContain("tool");
    expect(activities.map(({ kind }) => kind)).toContain("context");
    expect(
      activities.filter(({ kind }) => kind === "tool"),
    ).toEqual([
      {
        kind: "tool",
        name: "repo_status",
        callId: "call-1",
        status: "requested",
        descriptor: {
          action: "inspect",
          toolName: "repo_status",
          detail: "git status --short",
        },
      },
      {
        kind: "tool",
        name: "repo_status",
        callId: "call-1",
        status: "completed",
        durationMs: expect.any(Number),
        descriptor: {
          action: "inspect",
          toolName: "repo_status",
          detail: "git status --short",
        },
      },
    ]);
    await runtime.close();
  });

  it("falls back to HTTP with the same API key when WebSocket setup fails", async () => {
    const fetchCalls: Array<{ url: string; authorization: string }> = [];
    const runtime = new ResponsesAgentRuntime({
      apiKey: "same-key",
      createWebSocket: () => {
        const emitter = new EventEmitter() as FakeSocket;
        emitter.readyState = 0;
        emitter.send = () => undefined;
        emitter.close = () => undefined;
        emitter.terminate = () => undefined;
        queueMicrotask(() => emitter.emit("error", new Error("offline")));
        return emitter;
      },
      fetchImpl: (async (url, init) => {
        fetchCalls.push({
          url: String(url),
          authorization: String((init?.headers as Record<string, string>).Authorization),
        });
        return new Response(JSON.stringify({
          id: "resp-http",
          output: [{
            type: "message",
            content: [{ type: "output_text", text: "fallback" }],
          }],
          usage: {},
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }) as typeof fetch,
    });
    const session = await runtime.startSession({
      sessionId: "session-http",
      role: "coordinator",
      model: "gpt-test",
      effort: "medium",
      instructions: "Answer.",
    });
    const result = await session.runTurn({ text: "hello" });
    expect(result.transport).toBe("http");
    expect(result.text).toBe("fallback");
    expect(fetchCalls).toEqual([{
      url: "https://api.openai.com/v1/responses",
      authorization: "Bearer same-key",
    }]);
    await runtime.close();
  });
});
