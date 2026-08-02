import { EventEmitter } from "node:events";

import { describe, expect, it } from "vitest";

import { ResponsesAgentRuntime } from "./responsesRuntime.js";

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
    const activities: string[] = [];
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
      executeTool: async () => ({ output: "{\"clean\":true}" }),
      onActivity: (activity) => activities.push(activity.kind),
    });
    const result = await session.runTurn({ text: "Check status" });
    expect(result.transport).toBe("websocket");
    expect(result.text).toBe("{\"ok\":true}");
    expect(socket?.sent).toHaveLength(3);
    expect(socket?.sent[2]).toMatchObject({
      previous_response_id: "resp-tool",
      input: [{ type: "function_call_output", call_id: "call-1" }],
    });
    expect(activities).toContain("tool");
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
