import { describe, expect, it } from "bun:test";

import type {
  AgentRuntimeActivity,
  AgentRuntimeSessionConfig,
} from "@codepawl/model-runtime";

import { ClaudeCliRuntime, type ClaudeCliSpawn } from "./cli";

type JsonRecord = Record<string, unknown>;

type FakeChild = {
  stdinWrites: string[];
  push: (chunk: string) => void;
  pushStderr: (chunk: string) => void;
  endStdout: () => void;
  exit: (code: number) => void;
  killed: (NodeJS.Signals | number | undefined)[];
};

function fakeSpawn(): {
  spawn: ClaudeCliSpawn;
  child: Promise<FakeChild>;
  argv: string[][];
  envs: NodeJS.ProcessEnv[];
} {
  const argv: string[][] = [];
  const envs: NodeJS.ProcessEnv[] = [];
  let resolveChild!: (child: FakeChild) => void;
  const child = new Promise<FakeChild>((resolve) => {
    resolveChild = resolve;
  });
  const spawn: ClaudeCliSpawn = (command, options) => {
    argv.push(command);
    envs.push(options.env);
    const stdinWrites: string[] = [];
    let pushOut!: (chunk: Uint8Array) => void;
    let closeOut!: () => void;
    let pushErr!: (chunk: Uint8Array) => void;
    const stdout = new ReadableStream<Uint8Array>({
      start(controller) {
        pushOut = (chunk) => controller.enqueue(chunk);
        closeOut = () => controller.close();
      },
    });
    const stderr = new ReadableStream<Uint8Array>({
      start(controller) {
        pushErr = (chunk) => controller.enqueue(chunk);
      },
    });
    let resolveExit!: (code: number) => void;
    const exited = new Promise<number>((resolve) => {
      resolveExit = resolve;
    });
    const killed: (NodeJS.Signals | number | undefined)[] = [];
    resolveChild({
      stdinWrites,
      push: (chunk) => pushOut(new TextEncoder().encode(chunk)),
      pushStderr: (chunk) => pushErr(new TextEncoder().encode(chunk)),
      endStdout: () => closeOut(),
      exit: (code) => resolveExit(code),
      killed,
    });
    return {
      stdin: {
        write: (chunk: string) => stdinWrites.push(chunk),
        end: () => undefined,
      },
      stdout,
      stderr,
      exited,
      kill: (signal) => killed.push(signal),
    };
  };
  return { spawn, child, argv, envs };
}

function line(value: JsonRecord): string {
  return `${JSON.stringify(value)}\n`;
}

function config(
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

describe("ClaudeCliRuntime command line", () => {
  it("disables Claude Code's own tools and keeps the gateway boundary", async () => {
    const { spawn, argv } = fakeSpawn();
    const runtime = new ClaudeCliRuntime({ spawn, now: () => 1, env: {} });
    await runtime.startSession(config());
    const command = argv[0]!;
    expect(command[0]).toBe("claude");
    expect(command).toContain("-p");
    expect(command).toContain("stream-json");
    expect(command).toContain("--input-format");
    // No tools declared, so nothing is granted at all.
    expect(command[command.indexOf("--allowedTools") + 1]).toBe("");
    expect(command[command.indexOf("--permission-mode") + 1]).toBe("dontAsk");
    expect(command[command.indexOf("--effort") + 1]).toBe("high");
  });

  it("grants only the Orynt MCP namespace when tools are supplied", async () => {
    const { spawn, argv } = fakeSpawn();
    const runtime = new ClaudeCliRuntime({ spawn, now: () => 1, env: {} });
    await runtime.startSession(
      config({
        tools: [
          {
            type: "function",
            name: "read_file",
            description: "read",
            strict: true,
            parameters: {
              type: "object",
              properties: {},
              required: [],
              additionalProperties: false,
            },
          },
        ],
        executeTool: async () => ({ output: "ok" }),
      }),
    );
    const command = argv[0]!;
    expect(command[command.indexOf("--allowedTools") + 1]).toBe("mcp__orynt");
    const mcpConfig = JSON.parse(
      command[command.indexOf("--mcp-config") + 1]!,
    ) as { mcpServers: Record<string, { type: string }> };
    expect(mcpConfig.mcpServers.orynt!.type).toBe("http");
    await runtime.close();
  });

  it("refuses to start when tools are declared without an executor", async () => {
    const { spawn } = fakeSpawn();
    const runtime = new ClaudeCliRuntime({ spawn, now: () => 1, env: {} });
    await expect(
      runtime.startSession(
        config({
          tools: [
            {
              type: "function",
              name: "read_file",
              description: "read",
              strict: true,
              parameters: {},
            },
          ],
        }),
      ),
    ).rejects.toThrow("declares tools but has no executor");
  });

  it("withholds the API credential outside bare mode", async () => {
    const { spawn, envs } = fakeSpawn();
    const source = { PATH: "/usr/bin", ANTHROPIC_API_KEY: "sk-ant-secret" };
    const plain = new ClaudeCliRuntime({ spawn, now: () => 1, env: source });
    await plain.startSession(config());
    expect(envs[0]).not.toHaveProperty("ANTHROPIC_API_KEY");

    const bare = new ClaudeCliRuntime({
      spawn,
      now: () => 1,
      env: source,
      bare: true,
    });
    await bare.startSession(config());
    expect(envs[1]!.ANTHROPIC_API_KEY).toBe("sk-ant-secret");
  });
});

describe("ClaudeCliRuntime repository config gate", () => {
  it("refuses to start when the worktree ships a .claude directory", async () => {
    const { spawn, argv } = fakeSpawn();
    const runtime = new ClaudeCliRuntime({
      spawn,
      now: () => 1,
      env: {},
      cwd: "/repo",
      repositoryConfigExists: async (path) => path === "/repo/.claude",
    });
    // A repository hook would run on this host outside Orynt's gateway.
    await expect(runtime.startSession(config())).rejects.toThrow(
      "outside Orynt's approval boundary",
    );
    expect(argv).toHaveLength(0);
  });

  it("starts once an operator accepts the repository configuration", async () => {
    const { spawn, argv } = fakeSpawn();
    const runtime = new ClaudeCliRuntime({
      spawn,
      now: () => 1,
      env: { ORYNT_CLAUDE_CLI_ALLOW_REPO_CONFIG: "1" },
      cwd: "/repo",
      repositoryConfigExists: async () => true,
    });
    await runtime.startSession(config());
    expect(argv).toHaveLength(1);
    await runtime.close();
  });

  it("skips the gate in bare mode, which never reads repository config", async () => {
    const { spawn, argv } = fakeSpawn();
    const runtime = new ClaudeCliRuntime({
      spawn,
      now: () => 1,
      env: {},
      bare: true,
      cwd: "/repo",
      repositoryConfigExists: async () => true,
    });
    await runtime.startSession(config());
    expect(argv[0]).toContain("--bare");
    await runtime.close();
  });
});

describe("ClaudeCliRuntime stream handling", () => {
  it("maps init, deltas and the result envelope onto activities", async () => {
    const { spawn, child } = fakeSpawn();
    let tick = 0;
    const activities: AgentRuntimeActivity[] = [];
    const runtime = new ClaudeCliRuntime({
      spawn,
      now: () => (tick += 1),
      env: {},
    });
    const session = await runtime.startSession(
      config({ onActivity: (activity) => activities.push(activity) }),
    );
    const handle = await child;
    const turn = session.runTurn({ text: "hello" });
    handle.push(
      line({ type: "system", subtype: "init", session_id: "sesn_1" }) +
        line({
          type: "stream_event",
          event: { delta: { type: "text_delta", text: "hi " } },
        }),
    );
    // A frame split across chunk boundaries must still reassemble.
    const tail = line({
      type: "result",
      subtype: "success",
      session_id: "sesn_1",
      result: "hi there",
      usage: {
        input_tokens: 10,
        cache_read_input_tokens: 40,
        output_tokens: 5,
      },
    });
    handle.push(tail.slice(0, 20));
    handle.push(tail.slice(20));
    const result = await turn;

    expect(result.provider).toBe("claude_cli");
    expect(result.transport).toBe("stdio");
    expect(result.responseId).toBe("sesn_1");
    expect(result.text).toBe("hi there");
    expect(result.normalizedUsage).toEqual({
      inputTokens: 50,
      cachedInputTokens: 40,
      outputTokens: 5,
      reasoningOutputTokens: 0,
      totalTokens: 55,
    });
    expect(activities.map((activity) => activity.kind)).toEqual([
      "connection",
      "text_delta",
      "context",
      "response",
    ]);
    await runtime.close();
  });

  it("writes the prompt as one stream-json user message", async () => {
    const { spawn, child } = fakeSpawn();
    const runtime = new ClaudeCliRuntime({ spawn, now: () => 1, env: {} });
    const session = await runtime.startSession(config());
    const handle = await child;
    const turn = session.runTurn({ text: "explain this" });
    handle.push(line({ type: "result", subtype: "success", result: "done" }));
    await turn;
    expect(JSON.parse(handle.stdinWrites[0]!)).toEqual({
      type: "user",
      message: { role: "user", content: [{ type: "text", text: "explain this" }] },
    });
    await runtime.close();
  });

  it("surfaces subagent tool calls instead of dropping them", async () => {
    const { spawn, child } = fakeSpawn();
    const activities: AgentRuntimeActivity[] = [];
    const runtime = new ClaudeCliRuntime({ spawn, now: () => 1, env: {} });
    const session = await runtime.startSession(
      config({ onActivity: (activity) => activities.push(activity) }),
    );
    const handle = await child;
    const turn = session.runTurn({ text: "go" });
    handle.push(
      line({
        type: "assistant",
        parent_tool_use_id: "toolu_parent",
        message: {
          content: [{ type: "tool_use", id: "toolu_1", name: "mcp__orynt__read_file" }],
        },
      }) +
        line({
          type: "user",
          message: {
            content: [{ type: "tool_result", tool_use_id: "toolu_1" }],
          },
        }) +
        line({ type: "result", subtype: "success", result: "ok" }),
    );
    await turn;
    const tools = activities.filter((activity) => activity.kind === "tool");
    expect(tools).toHaveLength(2);
    expect(tools[0]).toMatchObject({
      status: "requested",
      descriptor: { detail: "subagent toolu_parent" },
    });
    expect(tools[1]).toMatchObject({ status: "completed" });
    await runtime.close();
  });

  it("reports an api_retry as a reconnecting connection", async () => {
    const { spawn, child } = fakeSpawn();
    const activities: AgentRuntimeActivity[] = [];
    const runtime = new ClaudeCliRuntime({ spawn, now: () => 1, env: {} });
    const session = await runtime.startSession(
      config({ onActivity: (activity) => activities.push(activity) }),
    );
    const handle = await child;
    const turn = session.runTurn({ text: "go" });
    handle.push(
      line({ type: "system", subtype: "api_retry", attempt: 1 }) +
        line({ type: "result", subtype: "success", result: "ok" }),
    );
    await turn;
    expect(
      activities.some(
        (activity) =>
          activity.kind === "connection" && activity.status === "reconnecting",
      ),
    ).toBe(true);
    await runtime.close();
  });

  it("rejects the turn when the result envelope reports an error", async () => {
    const { spawn, child } = fakeSpawn();
    const runtime = new ClaudeCliRuntime({ spawn, now: () => 1, env: {} });
    const session = await runtime.startSession(config());
    const handle = await child;
    const turn = session.runTurn({ text: "go" });
    handle.push(
      line({
        type: "result",
        subtype: "error_during_execution",
        is_error: true,
        result: "the run failed",
      }),
    );
    await expect(turn).rejects.toThrow("the run failed");
    await runtime.close();
  });

  it("fails the pending turn with the stderr tail when claude exits", async () => {
    const { spawn, child } = fakeSpawn();
    const runtime = new ClaudeCliRuntime({ spawn, now: () => 1, env: {} });
    const session = await runtime.startSession(config());
    const handle = await child;
    const turn = session.runTurn({ text: "go" });
    handle.pushStderr("claude: not authenticated\n");
    await new Promise((resolve) => setTimeout(resolve, 5));
    handle.exit(1);
    await expect(turn).rejects.toThrow("not authenticated");
    await runtime.close();
  });

  it("sends SIGTERM on cancel", async () => {
    const { spawn, child } = fakeSpawn();
    const runtime = new ClaudeCliRuntime({ spawn, now: () => 1, env: {} });
    const session = await runtime.startSession(config());
    const handle = await child;
    session.cancel();
    expect(handle.killed).toContain("SIGTERM");
    await runtime.close();
  });

  it("refuses one in-flight turn per session", async () => {
    const { spawn, child } = fakeSpawn();
    const runtime = new ClaudeCliRuntime({ spawn, now: () => 1, env: {} });
    const session = await runtime.startSession(config());
    const handle = await child;
    const first = session.runTurn({ text: "one" });
    await expect(session.runTurn({ text: "two" })).rejects.toThrow(
      "already has an in-flight turn",
    );
    handle.push(line({ type: "result", subtype: "success", result: "ok" }));
    await first;
    await runtime.close();
  });
});

describe("ClaudeCliRuntime against real-world event shapes", () => {
  // Frames trimmed from an actual `claude -p --output-format stream-json` run.
  // The live stream interleaves hook events, thinking-token counters, a
  // thinking block, and a rate-limit event around the parts Orynt reads.
  const REAL_FRAMES: JsonRecord[] = [
    {
      type: "system",
      subtype: "hook_started",
      hook_name: "SessionStart:startup",
      session_id: "16330c42",
    },
    {
      type: "system",
      subtype: "hook_response",
      hook_name: "SessionStart:startup",
      exit_code: 0,
      outcome: "success",
    },
    {
      type: "system",
      subtype: "init",
      session_id: "16330c42",
      model: "claude-haiku-4-5",
      apiKeySource: "none",
      capabilities: ["interrupt_receipt_v1"],
    },
    { type: "system", subtype: "thinking_tokens", estimated_tokens: 39 },
    {
      type: "assistant",
      parent_tool_use_id: null,
      message: {
        model: "claude-haiku-4-5-20251001",
        content: [
          { type: "thinking", thinking: "brief", signature: "Er4D" },
        ],
      },
    },
    {
      type: "assistant",
      parent_tool_use_id: null,
      message: { content: [{ type: "text", text: "PONG" }] },
    },
    {
      type: "rate_limit_event",
      rate_limit_info: { status: "allowed", rateLimitType: "five_hour" },
    },
    {
      type: "result",
      subtype: "success",
      is_error: false,
      session_id: "16330c42",
      result: "PONG",
      total_cost_usd: 0.0241544,
      usage: {
        input_tokens: 10,
        cache_creation_input_tokens: 11030,
        cache_read_input_tokens: 17794,
        output_tokens: 61,
      },
    },
  ];

  it("reads the answer and usage out of a live-shaped stream", async () => {
    const { spawn, child } = fakeSpawn();
    const activities: AgentRuntimeActivity[] = [];
    const runtime = new ClaudeCliRuntime({ spawn, now: () => 1, env: {} });
    const session = await runtime.startSession(
      config({ onActivity: (activity) => activities.push(activity) }),
    );
    const handle = await child;
    const turn = session.runTurn({ text: "Reply with exactly: PONG" });
    handle.push(REAL_FRAMES.map(line).join(""));
    const result = await turn;

    expect(result.text).toBe("PONG");
    expect(result.responseId).toBe("16330c42");
    // 10 uncached + 17_794 cache reads + 11_030 cache writes.
    expect(result.normalizedUsage).toEqual({
      inputTokens: 28_834,
      cachedInputTokens: 17_794,
      outputTokens: 61,
      reasoningOutputTokens: 0,
      totalTokens: 28_895,
    });
    // Hook, thinking-token and rate-limit frames must not become activities.
    expect(activities.map((activity) => activity.kind)).toEqual([
      "connection",
      "context",
      "response",
    ]);
    await runtime.close();
  });

  it("falls back to buffered assistant text when the result carries none", async () => {
    const { spawn, child } = fakeSpawn();
    const runtime = new ClaudeCliRuntime({ spawn, now: () => 1, env: {} });
    const session = await runtime.startSession(config());
    const handle = await child;
    const turn = session.runTurn({ text: "go" });
    handle.push(
      line({
        type: "assistant",
        message: { content: [{ type: "text", text: "buffered answer" }] },
      }) + line({ type: "result", subtype: "success", session_id: "s" }),
    );
    expect((await turn).text).toBe("buffered answer");
    await runtime.close();
  });
});
