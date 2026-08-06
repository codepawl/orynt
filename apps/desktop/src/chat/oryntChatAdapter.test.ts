import { describe, expect, it } from "bun:test";
import type { RunEvent } from "@codepawl/shared";

import {
  messageFromRunEvent,
  runStatusFromEvent,
  textFromAppendContent,
  toThreadMessage,
  upsertChatMessage,
} from "./oryntChatAdapter";

function event(
  type: RunEvent["type"],
  payload: Record<string, unknown> = {},
  overrides: Partial<RunEvent> = {},
): RunEvent {
  return {
    id: `event-${type}`,
    runId: "run-1",
    sequence: 1,
    type,
    timestamp: "2026-08-07T00:00:00.000Z",
    actor: { kind: "runtime", id: "test" },
    payload,
    redaction: { applied: false, redactedPaths: [] },
    artifacts: [],
    ...overrides,
  };
}

describe("Orynt chat event adapter", () => {
  it("coalesces assistant stream snapshots under a stable item id", () => {
    const first = messageFromRunEvent(
      event("codex_agent_message", {
        itemId: "assistant-1",
        message: "First",
        status: "updated",
      }),
    )!;
    const final = messageFromRunEvent(
      event("codex_agent_message", {
        itemId: "assistant-1",
        message: "First then second",
        status: "completed",
      }),
    )!;
    expect(upsertChatMessage([first], final)).toEqual([
      expect.objectContaining({
        id: "run-1-assistant-assistant-1",
        text: "First then second",
      }),
    ]);
  });

  it("maps tool requested, running, completed, and failed states", () => {
    for (const [status, expected] of [
      ["requested", "requested"],
      ["started", "running"],
      ["completed", "completed"],
      ["failed", "failed"],
    ] as const) {
      const message = messageFromRunEvent(
        event("codex_tool_activity", {
          itemId: "tool-1",
          toolName: "shell",
          status,
          detail: "Safe summary",
          durationMs: 25,
        }),
      );
      expect(message?.tool).toMatchObject({
        id: "tool-1",
        name: "shell",
        state: expected,
        summary: "Safe summary",
        elapsedMs: 25,
      });
    }
  });

  it("maps completion, cancellation, and runtime failures", () => {
    expect(runStatusFromEvent(event("run_finished"))).toBe("completed");
    expect(runStatusFromEvent(event("codex_execution_cancel_requested"))).toBe(
      "cancelled",
    );
    expect(runStatusFromEvent(event("codex_execution_failed"))).toBe("failed");
    expect(messageFromRunEvent(event("verification_failed"))?.role).toBe("error");
  });

  it("ignores malformed and unknown activity without throwing", () => {
    expect(
      messageFromRunEvent(event("codex_agent_message", { message: 42 })),
    ).toBe(null);
    expect(
      messageFromRunEvent(event("budget_checked", { unknown: true })),
    ).toBe(null);
  });

  it("redacts secret-like values and never exposes sensitive fields", () => {
    const message = messageFromRunEvent(
      event("codex_tool_activity", {
        itemId: "tool-1",
        toolName: "shell",
        status: "completed",
        detail: "Authorization: Bearer abc.def.ghi and sk-supersecret123",
        headers: { authorization: "Bearer raw" },
      }),
    );
    expect(message?.text).toContain("[REDACTED]");
    expect(JSON.stringify(message)).not.toContain("abc.def.ghi");
    expect(JSON.stringify(message)).not.toContain("sk-supersecret123");
    expect(JSON.stringify(message)).not.toContain("Bearer raw");
  });

  it("converts stable IDs for ExternalStoreRuntime", () => {
    const message = {
      id: "message-1",
      role: "assistant" as const,
      text: "Hello",
    };
    expect(toThreadMessage(message)).toMatchObject({
      id: "message-1",
      role: "assistant",
      content: [{ type: "text", text: "Hello" }],
    });
    expect(toThreadMessage(message).id).toBe(toThreadMessage(message).id);
  });

  it("extracts only text from assistant-ui append content", () => {
    expect(
      textFromAppendContent([
        { type: "text", text: "Hello " },
        { type: "image" },
        { type: "text", text: "world" },
      ]),
    ).toBe("Hello world");
  });
});
