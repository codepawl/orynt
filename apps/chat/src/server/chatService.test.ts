import { describe, expect, it } from "bun:test";
import type {
  AgentRuntime,
  AgentRuntimeActivity,
  AgentRuntimeSession,
} from "@codepawl/model-runtime";
import { OryntChatService, redactSafeText } from "./chatService";

class FakeSession implements AgentRuntimeSession {
  cancelled = 0;
  closed = 0;
  activity?: (value: AgentRuntimeActivity) => void;
  async runTurn(input: Parameters<AgentRuntimeSession["runTurn"]>[0]) {
    this.activity = input.onActivity;
    input.onActivity?.({ kind: "text_delta", text: "Hello " });
    input.onActivity?.({
      kind: "tool",
      name: "repository_read",
      callId: "tool-1",
      status: "requested",
    });
    input.onActivity?.({
      kind: "tool",
      name: "repository_read",
      callId: "tool-1",
      status: "completed",
    });
    await new Promise((resolve) => setTimeout(resolve, 1));
    if (input.signal?.aborted)
      throw Object.assign(new Error("cancelled"), { name: "AbortError" });
    input.onActivity?.({ kind: "text_delta", text: "world" });
    return {
      provider: "openai_responses" as const,
      transport: "http" as const,
      responseId: "response-1",
      text: "Hello world",
      timing: {
        startedMs: 0,
        providerDispatchedMs: 0,
        completedMs: 1,
        toolDurationMs: 0,
      },
    };
  }
  cancel() {
    this.cancelled += 1;
  }
  async close() {
    this.closed += 1;
  }
}
class FakeRuntime implements AgentRuntime {
  session = new FakeSession();
  async startSession() {
    return this.session;
  }
  async close() {}
}
const wait = () => new Promise((resolve) => setTimeout(resolve, 8));

describe("OryntChatService", () => {
  it("streams ordered text and tool lifecycle through the real application-session boundary", async () => {
    const runtime = new FakeRuntime();
    const service = new OryntChatService(() => runtime);
    const { sessionId } = service.createSession();
    const events: unknown[] = [];
    service.subscribe(sessionId, (event) => events.push(event));
    await service.submit(sessionId, "hello");
    await wait();
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "run_started" }),
        expect.objectContaining({ type: "text_delta", text: "Hello" }),
        expect.objectContaining({
          type: "tool",
          tool: expect.objectContaining({ state: "completed" }),
        }),
        expect.objectContaining({ type: "completed" }),
      ]),
    );
    expect(service.history(sessionId).map((message) => message.role)).toEqual([
      "user",
      "assistant",
    ]);
  });
  it("cancels the underlying Orynt model once and ignores stale output", async () => {
    const runtime = new FakeRuntime();
    const service = new OryntChatService(() => runtime);
    const { sessionId } = service.createSession();
    const events: string[] = [];
    service.subscribe(sessionId, (event) => events.push(event.type));
    const runId = await service.submit(sessionId, "stop");
    service.cancel(sessionId, runId);
    service.cancel(sessionId, runId);
    runtime.session.activity?.({ kind: "text_delta", text: "stale" });
    await wait();
    expect(runtime.session.cancelled).toBe(1);
    expect(events.filter((type) => type === "cancelled")).toHaveLength(1);
    expect(JSON.stringify(service.history(sessionId))).not.toContain("stale");
  });
  it("cleans subscriptions and closes sessions", async () => {
    const service = new OryntChatService(() => new FakeRuntime());
    const { sessionId } = service.createSession();
    const off = service.subscribe(sessionId, () => undefined);
    expect(service.listenerCount(sessionId)).toBe(1);
    off();
    expect(service.listenerCount(sessionId)).toBe(0);
    await service.closeSession(sessionId);
    expect(() => service.history(sessionId)).toThrow();
  });
  it("redacts secrets and tolerates malformed summaries", () => {
    expect(
      redactSafeText("Bearer abc.def.ghi sk-supersecret123", "fallback"),
    ).toBe("[REDACTED] [REDACTED]");
    expect(redactSafeText({ headers: { authorization: "raw" } }, "safe")).toBe(
      "safe",
    );
  });
});
