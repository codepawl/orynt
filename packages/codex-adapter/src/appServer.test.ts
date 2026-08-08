import { createHash } from "node:crypto";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "bun:test";

import {
  CodexAppServerRuntime,
  CodexAppServerTurnError,
  parseCodexThreadTokenUsage,
} from "./appServer";

let tempRoot = "";

afterEach(async () => {
  if (tempRoot) {
    await rm(tempRoot, { recursive: true, force: true });
  }
  tempRoot = "";
});

async function fixture(): Promise<string> {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), "orynt-app-server-test-"));
  const script = path.join(tempRoot, "fake-app-server.mjs");
  await writeFile(
    script,
    `#!/usr/bin/env bun
import readline from "node:readline";
const lines = readline.createInterface({ input: process.stdin });
const send = (value) => process.stdout.write(JSON.stringify(value) + "\\n");
let pendingToolTurn;
setInterval(() => {}, 1000);
lines.on("line", (line) => {
  const message = JSON.parse(line);
  if (message.method === "initialize") {
    send({ jsonrpc: "2.0", id: message.id, result: { codexHome: "/tmp", platformFamily: "unix", platformOs: "linux", userAgent: "fixture" } });
  } else if (message.method === "account/read") {
    send({ jsonrpc: "2.0", id: message.id, result: { account: { type: "chatgpt", email: "fixture@example.test", planType: "pro" }, requiresOpenaiAuth: true } });
  } else if (message.method === "account/rateLimits/read") {
    send({ jsonrpc: "2.0", id: message.id, result: { rateLimits: { limitId: "codex", primary: { usedPercent: 40 } }, rateLimitsByLimitId: null } });
  } else if (message.method === "account/usage/read") {
    send({ jsonrpc: "2.0", id: message.id, result: { summary: { lifetimeTokens: 123 }, dailyUsageBuckets: [] } });
  } else if (message.method === "thread/start") {
    send({ jsonrpc: "2.0", id: message.id, result: { thread: { id: "thread-" + message.id } } });
  } else if (message.method === "turn/start") {
    const threadId = message.params.threadId;
    const turnId = "turn-" + message.id;
    send({ jsonrpc: "2.0", id: message.id, result: { turn: { id: turnId } } });
    if (message.params.input?.[0]?.text === "generate-image") {
      send({ jsonrpc: "2.0", method: "item/completed", params: {
        threadId,
        turnId,
        item: { type: "imageGeneration", id: "image-1", status: "completed", result: "generated", revisedPrompt: "Revised", savedPath: "/tmp/output.png" }
      }});
    }
    if (message.params.input?.[0]?.text === "use-tool") {
      pendingToolTurn = { threadId, turnId };
      send({
        jsonrpc: "2.0",
        id: 900,
        method: "item/tool/call",
        params: {
          threadId,
          turnId,
          callId: "call-1",
          tool: "browser_tabs",
          arguments: { includeUrls: true }
        }
      });
      return;
    }
    if (message.params.input?.[0]?.text === "overflow") {
      send({ jsonrpc: "2.0", method: "turn/completed", params: {
        threadId,
        turn: {
          id: turnId,
          status: "failed",
          error: { message: "context full", codexErrorInfo: "ContextWindowExceeded" }
        }
      }});
      return;
    }
    send({ jsonrpc: "2.0", method: "item/agentMessage/delta", params: { threadId, turnId, itemId: "item-1", delta: '{"ok":' } });
    setTimeout(() => {
      send({ jsonrpc: "2.0", method: "item/agentMessage/delta", params: { threadId, turnId, itemId: "item-1", delta: "true}" } });
      send({ jsonrpc: "2.0", method: "thread/tokenUsage/updated", params: {
        threadId,
        turnId,
        tokenUsage: {
          total: { inputTokens: 20000, cachedInputTokens: 10000, outputTokens: 500, reasoningOutputTokens: 100, totalTokens: 20500 },
          last: { inputTokens: 12000, cachedInputTokens: 10000, outputTokens: 500, reasoningOutputTokens: 100, totalTokens: 12500 },
          modelContextWindow: 100000
        }
      }});
      send({ jsonrpc: "2.0", method: "turn/completed", params: { threadId, turn: { id: turnId, status: "completed" } } });
    }, 2);
  } else if (message.method === "thread/compact/start") {
    const threadId = message.params.threadId;
    const turnId = "compact-" + message.id;
    send({ jsonrpc: "2.0", id: message.id, result: {} });
    send({ jsonrpc: "2.0", method: "item/started", params: {
      threadId,
      turnId,
      item: { id: "compact-item", type: "contextCompaction" }
    }});
    send({ jsonrpc: "2.0", method: "item/completed", params: {
      threadId,
      turnId,
      item: { id: "compact-item", type: "contextCompaction" }
    }});
    send({ jsonrpc: "2.0", method: "turn/completed", params: {
      threadId,
      turn: { id: turnId, status: "completed" }
    }});
  } else if (message.method === "turn/interrupt") {
    send({ jsonrpc: "2.0", id: message.id, result: {} });
  } else if (message.method === "modelProvider/capabilities/read") {
    send({ jsonrpc: "2.0", id: message.id, result: { imageGeneration: true, namespaceTools: true, webSearch: false } });
  } else if (message.id === 900 && pendingToolTurn) {
    const { threadId, turnId } = pendingToolTurn;
    pendingToolTurn = undefined;
    send({ jsonrpc: "2.0", method: "item/agentMessage/delta", params: { threadId, turnId, itemId: "item-tool", delta: JSON.stringify(message.result) } });
    send({ jsonrpc: "2.0", method: "turn/completed", params: { threadId, turn: { id: turnId, status: "completed" } } });
  }
});
`,
  );
  await chmod(script, 0o755);
  return script;
}

describe("CodexAppServerRuntime", () => {
  it("normalizes app-server token usage without confusing cumulative usage for context occupancy", () => {
    const parsed = parseCodexThreadTokenUsage({
      tokenUsage: {
        total: {
          inputTokens: 200_000,
          cachedInputTokens: 150_000,
          outputTokens: 5_000,
          totalTokens: 205_000,
        },
        last: {
          inputTokens: 40_000,
          cachedInputTokens: 30_000,
          outputTokens: 1_000,
          totalTokens: 41_000,
        },
        modelContextWindow: 100_000,
      },
    }, "gpt-test");
    expect(parsed).toMatchObject({
      capacity: {
        modelId: "gpt-test",
        effectiveWindowTokens: 100_000,
        source: "provider_event",
      },
      current: { totalTokens: 41_000 },
      cumulative: { totalTokens: 205_000 },
    });
    expect(parsed?.capacity.contextWindowTokens).toBeUndefined();
  });

  it("keeps usage when app-server omits its effective window", () => {
    expect(parseCodexThreadTokenUsage({
      tokenUsage: {
        total: { inputTokens: 20_000, totalTokens: 20_000 },
        last: { inputTokens: 12_500, totalTokens: 12_500 },
        modelContextWindow: null,
      },
    }, "gpt-test")).toMatchObject({
      capacity: {
        modelId: "gpt-test",
        source: "unknown",
      },
      current: { totalTokens: 12_500 },
      cumulative: { totalTokens: 20_000 },
    });
  });

  it("passes verified local images, captures image-generation items, and reads capabilities", async () => {
    const script = await fixture();
    const imagePath = path.join(tempRoot, "crop.png");
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB", "base64");
    await writeFile(imagePath, png);
    const runtime = new CodexAppServerRuntime({
      executablePath: process.execPath,
      args: [script],
    });
    try {
      expect(await runtime.readModelProviderCapabilities()).toEqual({
        imageGeneration: true,
        namespaceTools: true,
        webSearch: false,
      });
      await expect(runtime.readAccount(500)).resolves.toMatchObject({
        account: { type: "chatgpt", planType: "pro" },
      });
      await expect(runtime.readAccountRateLimits(500)).resolves.toMatchObject({
        rateLimits: { limitId: "codex" },
      });
      await expect(runtime.readAccountTokenUsage(500)).resolves.toMatchObject({
        summary: { lifetimeTokens: 123 },
      });
      const result = await runtime.runTurn({
        prompt: "generate-image",
        images: [{
          kind: "local_file",
          path: imagePath,
          mimeType: "image/png",
          sha256: createHash("sha256").update(png).digest("hex"),
          byteLength: png.length,
          detail: "low",
          source: "browser_crop",
        }],
        cwd: tempRoot,
        model: "gpt-test",
        effort: "medium",
      });
      expect(result.generatedImages).toEqual([{
        providerItemId: "image-1",
        revisedPrompt: "Revised",
        savedPath: "/tmp/output.png",
        base64: "generated",
        status: "completed",
      }]);
    } finally {
      await runtime.shutdown();
    }
  });

  it("reuses one process and one keyed thread while assembling agent-message deltas", async () => {
    const script = await fixture();
    const runtime = new CodexAppServerRuntime({
      executablePath: process.execPath,
      args: [script],
    });
    try {
      const deltas: string[] = [];
      const deltaItemIds: string[] = [];
      const contextUpdates: number[] = [];
      const first = await runtime.runTurn({
        sessionKey: "session:coordinator",
        prompt: "first",
        cwd: tempRoot,
        model: "gpt-test",
        effort: "medium",
        outputSchema: { type: "object" },
        timeoutMs: 500,
        onActivity: (activity) => {
          if (activity.kind === "delta") {
            deltas.push(activity.text);
            deltaItemIds.push(activity.itemId);
          }
          if (activity.kind === "context") {
            contextUpdates.push(activity.context.current.totalTokens);
          }
        },
      });
      const second = await runtime.runTurn({
        sessionKey: "session:coordinator",
        prompt: "second",
        cwd: tempRoot,
        model: "gpt-test",
        effort: "medium",
        timeoutMs: 500,
      });
      expect(first.text).toBe('{"ok":true}');
      expect(second.text).toBe('{"ok":true}');
      expect(first.threadId).toBe(second.threadId);
      expect(first.threadReused).toBe(false);
      expect(second.threadReused).toBe(true);
      expect(contextUpdates).toEqual([12_500]);
      expect(first.timing.firstDeltaMs).toBeDefined();
      expect(deltas).toEqual(['{"ok":', "true}"]);
      expect(deltaItemIds).toEqual(["item-1", "item-1"]);
      expect(second.context).toMatchObject({
        capacity: {
          modelId: "gpt-test",
          effectiveWindowTokens: 100_000,
        },
        current: { totalTokens: 12_500 },
        cumulative: { totalTokens: 20_500 },
      });
      await expect(runtime.compactThread(second.threadId, 500)).resolves.toBeUndefined();
    } finally {
      await runtime.shutdown();
    }
  });

  it("preserves the structured context overflow code", async () => {
    const script = await fixture();
    const runtime = new CodexAppServerRuntime({
      executablePath: process.execPath,
      args: [script],
    });
    try {
      await expect(runtime.runTurn({
        prompt: "overflow",
        cwd: tempRoot,
        model: "gpt-test",
        effort: "medium",
      })).rejects.toMatchObject({
        name: "CodexAppServerTurnError",
        code: "ContextWindowExceeded",
        contextWindowExceeded: true,
      } satisfies Partial<CodexAppServerTurnError>);
    } finally {
      await runtime.shutdown();
    }
  });

  it("fails an already-aborted turn before starting a process", async () => {
    const controller = new AbortController();
    controller.abort();
    const runtime = new CodexAppServerRuntime({ executablePath: "/missing/codex" });
    await expect(runtime.runTurn({
      prompt: "cancel",
      cwd: "/tmp",
      model: "gpt-test",
      effort: "medium",
      signal: controller.signal,
    })).rejects.toMatchObject({ name: "AbortError" });
  });

  it("bounds cached session threads and evicts the least recently used key", async () => {
    const script = await fixture();
    const runtime = new CodexAppServerRuntime({
      executablePath: process.execPath,
      args: [script],
    });
    const request = (sessionKey: string) => runtime.runTurn({
      sessionKey,
      prompt: "bounded-cache",
      cwd: tempRoot,
      model: "gpt-test",
      effort: "medium",
    });
    try {
      const first = await request("session-1");
      await request("session-2");
      await request("session-3");
      const firstAgain = await request("session-1");
      expect(firstAgain.threadId).not.toBe(first.threadId);
      expect(firstAgain.threadReused).toBe(false);
    } finally {
      await runtime.shutdown();
    }
  });

  it("rotates cached threads at the turn and input-byte caps even with provider capacity", async () => {
    const script = await fixture();
    const runtime = new CodexAppServerRuntime({
      executablePath: process.execPath,
      args: [script],
    });
    const request = (sessionKey: string, prompt: string) => runtime.runTurn({
      sessionKey,
      prompt,
      cwd: tempRoot,
      model: "gpt-test",
      effort: "medium",
    });
    try {
      const first = await request("turn-cap", "first");
      let current = first;
      for (let index = 0; index < 7; index += 1) {
        current = await request("turn-cap", `turn-${index}`);
        expect(current.threadId).toBe(first.threadId);
      }
      const rotatedByTurns = await request("turn-cap", "ninth");
      expect(rotatedByTurns.threadId).not.toBe(first.threadId);
      expect(rotatedByTurns.threadReused).toBe(false);

      const largePrompt = "x".repeat(140_000);
      const largeFirst = await request("byte-cap", largePrompt);
      const rotatedByBytes = await request("byte-cap", largePrompt);
      expect(rotatedByBytes.threadId).not.toBe(largeFirst.threadId);
      expect(rotatedByBytes.threadReused).toBe(false);
    } finally {
      await runtime.shutdown();
    }
  });

  it("executes an advertised dynamic tool and returns its result to app-server", async () => {
    const script = await fixture();
    let now = 100;
    const runtime = new CodexAppServerRuntime({
      executablePath: process.execPath,
      args: [script],
      now: () => now,
    });
    const calls: unknown[] = [];
    const activities: unknown[] = [];
    try {
      const result = await runtime.runTurn({
        sessionKey: "session:tools",
        prompt: "use-tool",
        cwd: tempRoot,
        model: "gpt-test",
        effort: "medium",
        tools: [{
          type: "function",
          name: "browser_tabs",
          description: "List attached browser tabs.",
          strict: true,
          parameters: {
            type: "object",
            additionalProperties: false,
            properties: { includeUrls: { type: "boolean" } },
          },
        }],
        executeTool: async (call) => {
          calls.push(call);
          now = 450;
          return {
            output: JSON.stringify({ tabs: ["tab-1"] }),
            images: [{
              dataUrl: "data:image/png;base64,cG5n",
              detail: "original",
              source: "browser_crop",
            }],
          };
        },
        describeTool: () => ({
          action: "inspect",
          toolName: "browser_tabs",
          detail: "attached browser tabs",
        }),
        onActivity: (activity) => activities.push(activity),
        timeoutMs: 500,
      });
      expect(calls).toEqual([{
        callId: "call-1",
        name: "browser_tabs",
        arguments: { includeUrls: true },
      }]);
      expect(JSON.parse(result.text)).toMatchObject({
        contentItems: [
          { text: '{"tabs":["tab-1"]}' },
          { type: "inputImage", imageUrl: "data:image/png;base64,cG5n" },
        ],
        success: true,
      });
      expect(activities).toContainEqual({
        kind: "tool",
        callId: "call-1",
        toolKind: "other",
        name: "browser_tabs",
        detail: "attached browser tabs",
        status: "requested",
        descriptor: {
          action: "inspect",
          toolName: "browser_tabs",
          detail: "attached browser tabs",
        },
      });
      expect(activities).toContainEqual({
        kind: "tool",
        callId: "call-1",
        toolKind: "other",
        name: "browser_tabs",
        detail: "attached browser tabs",
        status: "completed",
        durationMs: 350,
        descriptor: {
          action: "inspect",
          toolName: "browser_tabs",
          detail: "attached browser tabs",
        },
      });
    } finally {
      await runtime.shutdown();
    }
  });
});
