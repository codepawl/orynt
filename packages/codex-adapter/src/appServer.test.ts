import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { CodexAppServerRuntime } from "./appServer";

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
    `#!/usr/bin/env node
import readline from "node:readline";
const lines = readline.createInterface({ input: process.stdin });
const send = (value) => process.stdout.write(JSON.stringify(value) + "\\n");
setInterval(() => {}, 1000);
lines.on("line", (line) => {
  const message = JSON.parse(line);
  if (message.method === "initialize") {
    send({ jsonrpc: "2.0", id: message.id, result: { codexHome: "/tmp", platformFamily: "unix", platformOs: "linux", userAgent: "fixture" } });
  } else if (message.method === "thread/start") {
    send({ jsonrpc: "2.0", id: message.id, result: { thread: { id: "thread-" + message.id } } });
  } else if (message.method === "turn/start") {
    const threadId = message.params.threadId;
    const turnId = "turn-" + message.id;
    send({ jsonrpc: "2.0", id: message.id, result: { turn: { id: turnId } } });
    send({ jsonrpc: "2.0", method: "item/agentMessage/delta", params: { threadId, turnId, itemId: "item-1", delta: '{"ok":' } });
    setTimeout(() => {
      send({ jsonrpc: "2.0", method: "item/agentMessage/delta", params: { threadId, turnId, itemId: "item-1", delta: "true}" } });
      send({ jsonrpc: "2.0", method: "turn/completed", params: { threadId, turn: { id: turnId, status: "completed" } } });
    }, 2);
  } else if (message.method === "turn/interrupt") {
    send({ jsonrpc: "2.0", id: message.id, result: {} });
  }
});
`,
  );
  await chmod(script, 0o755);
  return script;
}

describe("CodexAppServerRuntime", () => {
  it("reuses one process and one keyed thread while assembling agent-message deltas", async () => {
    const script = await fixture();
    const runtime = new CodexAppServerRuntime({
      executablePath: process.execPath,
      args: [script],
    });
    try {
      const deltas: string[] = [];
      const first = await runtime.runTurn({
        sessionKey: "session:coordinator",
        prompt: "first",
        cwd: tempRoot,
        model: "gpt-test",
        effort: "medium",
        outputSchema: { type: "object" },
        timeoutMs: 500,
        onActivity: (activity) => {
          if (activity.kind === "delta") deltas.push(activity.text);
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
      expect(first.timing.firstDeltaMs).toBeDefined();
      expect(deltas).toEqual(['{"ok":', "true}"]);
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
});
