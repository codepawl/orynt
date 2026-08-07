import { describe, expect, it } from "bun:test";
import { OryntChatStore } from "./chatStore";

function response(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}
describe("OryntChatStore", () => {
  it("sends once, maps stream events, and rejects old-session events", async () => {
    const calls: string[] = [];
    const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push(`${init?.method ?? "GET"} ${url}`);
      if (url === "/api/sessions") return response({ sessionId: "session-1" });
      if (url.endsWith("/turns")) return response({ runId: "run-1" }, 202);
      return new Response(new ReadableStream({ start() {} }));
    };
    const store = new OryntChatStore(fetcher as typeof fetch);
    await store.newChat();
    await store.send("hello");
    store.accept({
      type: "text_delta",
      sessionId: "session-1",
      runId: "run-1",
      text: "one",
    });
    store.accept({
      type: "text_delta",
      sessionId: "session-1",
      runId: "run-1",
      text: " two",
    });
    store.accept({
      type: "text_delta",
      sessionId: "old",
      runId: "run-1",
      text: " stale",
    });
    expect(calls.filter((call) => call.endsWith("/turns"))).toHaveLength(1);
    expect(store.getSnapshot().messages.at(-1)?.text).toBe("one two");
    store.dispose();
  });
  it("maps tools, malformed event input safely, and clears running after cancel", async () => {
    const fetcher = async (input: RequestInfo | URL) =>
      String(input) === "/api/sessions"
        ? response({ sessionId: "session-1" })
        : String(input).endsWith("/turns")
          ? response({ runId: "run-1" }, 202)
          : String(input).endsWith("/cancel")
            ? response({ ok: true })
            : new Response(new ReadableStream({ start() {} }));
    const store = new OryntChatStore(fetcher as typeof fetch);
    await store.newChat();
    await store.send("hello");
    store.accept({
      type: "tool",
      sessionId: "session-1",
      runId: "run-1",
      tool: {
        id: "t1",
        name: "read",
        state: "completed",
        summary: "read completed",
      },
    });
    expect(store.getSnapshot().messages.at(-1)?.tool?.state).toBe("completed");
    expect(() => store.accept({ type: "unknown" } as never)).not.toThrow();
    await store.cancel();
    expect(store.getSnapshot().running).toBe(false);
    store.dispose();
  });
});
