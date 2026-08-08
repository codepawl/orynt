import { randomUUID } from "node:crypto";
import { StringDecoder } from "node:string_decoder";

import type {
  AgentRuntime,
  AgentRuntimeActivity,
  AgentRuntimeSession,
  AgentRuntimeSessionConfig,
  AgentRuntimeTurnInput,
  AgentRuntimeTurnResult,
} from "@codepawl/model-runtime";

import { claudeChildEnvironment } from "./childEnvironment.js";
import { OryntMcpBridge, type OryntMcpBridgeHandle } from "./mcpBridge.js";
import { ClaudeTurnError } from "./messagesRuntime.js";
import type { JsonRecord } from "./sse.js";
import { claudeEffort } from "./tools.js";
import { parseClaudeTokenUsage } from "./usage.js";

const MAX_STDERR = 8_000;

function record(value: unknown): JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

type PipeProcess = {
  stdin: { write(chunk: string): void; end(): void } | null;
  stdout: ReadableStream<Uint8Array> | null;
  stderr: ReadableStream<Uint8Array> | null;
  exited: Promise<number>;
  kill(signal?: NodeJS.Signals | number): void;
};

export type ClaudeCliSpawn = (
  command: string[],
  options: { env: NodeJS.ProcessEnv; cwd?: string },
) => PipeProcess;

export type ClaudeCliRuntimeOptions = {
  executablePath?: string;
  /** Working directory handed to the child. */
  cwd?: string;
  /**
   * Bare mode skips discovery of repository hooks, skills, plugins, MCP
   * servers, and CLAUDE.md. It also stops the CLI reading OAuth credentials or
   * the keychain, so it requires `ANTHROPIC_API_KEY` in the child environment.
   */
  bare?: boolean;
  spawn?: ClaudeCliSpawn;
  now?: () => number;
  env?: NodeJS.ProcessEnv;
  /** Injected for tests; defaults to a filesystem check of `<cwd>/.claude`. */
  repositoryConfigExists?: (path: string) => Promise<boolean>;
};

/**
 * Operators accept repository-supplied CLI configuration by setting this to
 * `1`. Without it the route refuses to start, because a repository hook would
 * execute on the host outside Orynt's approval boundary.
 */
export const ALLOW_REPOSITORY_CLAUDE_CONFIG_ENV =
  "ORYNT_CLAUDE_CLI_ALLOW_REPO_CONFIG";

type ResolvedCliOptions = Required<
  Pick<ClaudeCliRuntimeOptions, "executablePath" | "bare" | "spawn" | "now">
> & {
  cwd?: string;
  env: NodeJS.ProcessEnv;
  repositoryConfigExists: (path: string) => Promise<boolean>;
};

async function defaultRepositoryConfigExists(path: string): Promise<boolean> {
  try {
    const { stat } = await import("node:fs/promises");
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

function defaultSpawn(
  command: string[],
  options: { env: NodeJS.ProcessEnv; cwd?: string },
): PipeProcess {
  const bunSpawn = (
    globalThis as unknown as {
      Bun?: { spawn: (command: string[], options: unknown) => PipeProcess };
    }
  ).Bun?.spawn;
  if (!bunSpawn) throw new Error("ClaudeCliRuntime requires the Bun runtime");
  return bunSpawn(command, {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
    env: options.env,
    ...(options.cwd ? { cwd: options.cwd } : {}),
  });
}

class ClaudeCliSession implements AgentRuntimeSession {
  private child?: PipeProcess;
  private bridge?: OryntMcpBridgeHandle;
  private buffer = "";
  private stderrTail = "";
  private closed = false;
  private shuttingDown = false;
  private pendingTurn?: {
    resolve: (result: AgentRuntimeTurnResult) => void;
    reject: (error: Error) => void;
  };
  private providerSessionId?: string;
  private turnState?: {
    startedMs: number;
    providerDispatchedMs: number;
    firstDeltaMs?: number;
    text: string;
    bufferedText: string;
    usage: JsonRecord;
    onActivity?: (activity: AgentRuntimeActivity) => void;
  };

  constructor(
    private readonly config: AgentRuntimeSessionConfig,
    private readonly options: ResolvedCliOptions,
    private readonly onClose: () => void,
  ) {}

  async start(): Promise<void> {
    await this.assertRepositoryConfigAccepted();
    const tools = this.config.tools ?? [];
    if (tools.length > 0) {
      if (!this.config.executeTool) {
        throw new ClaudeTurnError(
          `Claude CLI session for ${this.config.role} declares tools but has no executor`,
          { code: "missing_tool_executor" },
        );
      }
      this.bridge = await new OryntMcpBridge({
        tools,
        executeTool: this.config.executeTool,
      }).start();
    }
    const argv = this.commandLine();
    this.child = this.options.spawn(argv, {
      env: claudeChildEnvironment(this.options.env, {
        includeApiCredential: this.options.bare,
      }),
      ...(this.options.cwd ? { cwd: this.options.cwd } : {}),
    });
    void this.readStdout();
    void this.readStderr();
    void this.watchExit();
  }

  /**
   * Without `--bare` the CLI discovers hooks, skills, plugins, MCP servers and
   * CLAUDE.md from the repository. Repository contents are untrusted, and a
   * repository hook runs on this host outside Orynt's gateway, so the route
   * refuses to start until an operator has accepted that explicitly.
   */
  private async assertRepositoryConfigAccepted(): Promise<void> {
    if (this.options.bare) return;
    const root = (this.options.cwd ?? process.cwd()).replace(/[/\\]+$/, "");
    const directory = `${root}/.claude`;
    if (!(await this.options.repositoryConfigExists(directory))) return;
    if (this.options.env[ALLOW_REPOSITORY_CLAUDE_CONFIG_ENV] === "1") return;
    throw new ClaudeTurnError(
      `${directory} would be loaded by the Claude CLI outside Orynt's approval boundary. ` +
        `Set ${ALLOW_REPOSITORY_CLAUDE_CONFIG_ENV}=1 to accept this repository's CLI configuration, or use bare mode.`,
      { code: "repository_claude_config_unconfirmed" },
    );
  }

  private commandLine(): string[] {
    const argv = [
      this.options.executablePath,
      "-p",
      "--output-format",
      "stream-json",
      "--input-format",
      "stream-json",
      "--verbose",
      "--include-partial-messages",
      "--session-id",
      randomUUID(),
      "--model",
      this.config.model,
      "--effort",
      claudeEffort(this.config.effort),
      // Claude Code's own Read/Edit/Bash never run: every action must cross
      // Orynt's gateway, so the tool surface is supplied over MCP instead.
      "--allowedTools",
      this.bridge ? "mcp__orynt" : "",
      "--permission-mode",
      "dontAsk",
    ];
    if (this.options.bare) argv.push("--bare");
    if (this.config.instructions) {
      argv.push("--append-system-prompt", this.config.instructions);
    }
    if (this.bridge) argv.push("--mcp-config", this.bridge.mcpConfig);
    if (this.config.outputSchema) {
      argv.push("--json-schema", JSON.stringify(this.config.outputSchema));
    }
    return argv;
  }

  async runTurn(input: AgentRuntimeTurnInput): Promise<AgentRuntimeTurnResult> {
    if (this.closed) throw new Error("Claude CLI session is closed");
    if (this.pendingTurn) {
      throw new Error("Claude CLI session already has an in-flight turn");
    }
    if (input.signal?.aborted) {
      throw Object.assign(new Error("Claude turn cancelled"), {
        name: "AbortError",
      });
    }
    const startedMs = this.options.now();
    this.turnState = {
      startedMs,
      providerDispatchedMs: startedMs,
      text: "",
      bufferedText: "",
      usage: {},
      ...(input.onActivity ? { onActivity: input.onActivity } : {}),
    };
    const message = {
      type: "user",
      message: {
        role: "user",
        content: [{ type: "text", text: input.text }],
      },
    };
    const result = new Promise<AgentRuntimeTurnResult>((resolve, reject) => {
      this.pendingTurn = { resolve, reject };
    });
    const abort = () => this.cancel();
    input.signal?.addEventListener("abort", abort, { once: true });
    try {
      this.child?.stdin?.write(`${JSON.stringify(message)}\n`);
      return await result;
    } finally {
      input.signal?.removeEventListener("abort", abort);
      this.pendingTurn = undefined;
      this.turnState = undefined;
    }
  }

  cancel(): void {
    // SIGTERM aborts the in-progress turn; the CLI exits with 143.
    this.child?.kill("SIGTERM");
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.shuttingDown = true;
    this.failPending(new Error("Claude CLI session closed"));
    try {
      this.child?.stdin?.end();
    } catch {
      // The child may already be gone.
    }
    this.child?.kill("SIGTERM");
    await this.bridge?.close();
    this.onClose();
  }

  private emit(activity: AgentRuntimeActivity): void {
    this.config.onActivity?.(activity);
    this.turnState?.onActivity?.(activity);
  }

  private async readStdout(): Promise<void> {
    const stream = this.child?.stdout;
    if (!stream) return;
    const decoder = new StringDecoder("utf8");
    const reader = stream.getReader();
    try {
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        this.ingest(decoder.write(Buffer.from(chunk.value)));
      }
      this.ingest(decoder.end());
    } catch {
      // A read failure is reported through the exit watcher.
    }
  }

  private async readStderr(): Promise<void> {
    const stream = this.child?.stderr;
    if (!stream) return;
    const decoder = new StringDecoder("utf8");
    const reader = stream.getReader();
    try {
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        this.stderrTail = `${this.stderrTail}${decoder.write(Buffer.from(chunk.value))}`
          .slice(-MAX_STDERR);
      }
    } catch {
      // Diagnostics only.
    }
  }

  private async watchExit(): Promise<void> {
    const code = await (this.child?.exited ?? Promise.resolve(0));
    if (this.shuttingDown) return;
    this.failPending(
      new ClaudeTurnError(
        `claude exited with code ${code}${this.stderrTail ? `: ${this.stderrTail.trim()}` : ""}`,
        { code: "claude_cli_exited" },
      ),
    );
  }

  private failPending(error: Error): void {
    const pending = this.pendingTurn;
    this.pendingTurn = undefined;
    pending?.reject(error);
  }

  private ingest(chunk: string): void {
    this.buffer += chunk;
    let newline = this.buffer.indexOf("\n");
    while (newline >= 0) {
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      if (line) this.handleEvent(line);
      newline = this.buffer.indexOf("\n");
    }
  }

  private handleEvent(line: string): void {
    let event: JsonRecord;
    try {
      event = record(JSON.parse(line) as unknown);
    } catch {
      return;
    }
    const type = stringValue(event.type);
    const subtype = stringValue(event.subtype);
    if (type === "system" && subtype === "init") {
      this.providerSessionId = stringValue(event.session_id);
      this.emit({ kind: "connection", status: "ready" });
      return;
    }
    if (type === "system" && subtype === "api_retry") {
      this.emit({ kind: "connection", status: "reconnecting" });
      return;
    }
    if (type === "stream_event") {
      const delta = record(record(event.event).delta);
      if (delta.type === "text_delta") {
        const text = stringValue(delta.text);
        if (text && this.turnState) {
          this.turnState.firstDeltaMs ??= this.options.now();
          this.turnState.text += text;
          this.emit({ kind: "text_delta", text });
        }
      }
      return;
    }
    if (type === "assistant" || type === "user") {
      this.handleToolBlocks(event, type);
      return;
    }
    if (type === "result") this.completeTurn(event);
  }

  private handleToolBlocks(event: JsonRecord, type: string): void {
    const content = record(event.message).content;
    if (!Array.isArray(content)) return;
    // `parent_tool_use_id` marks subagent activity; it is surfaced on the
    // descriptor so the composer does not show orphaned tool calls.
    const parent = stringValue(event.parent_tool_use_id);
    for (const value of content) {
      const block = record(value);
      if (type === "assistant" && block.type === "text" && this.turnState) {
        // Buffered assistant text is the fallback when partial-message deltas
        // are unavailable; the `result` envelope still wins when it carries a
        // final answer.
        this.turnState.bufferedText += stringValue(block.text);
      }
      if (type === "assistant" && block.type === "tool_use") {
        this.emit({
          kind: "tool",
          name: stringValue(block.name),
          callId: stringValue(block.id),
          status: "requested",
          descriptor: {
            action: "other",
            toolName: stringValue(block.name),
            detail: parent ? `subagent ${parent}` : "claude cli",
          },
        });
      }
      if (type === "user" && block.type === "tool_result") {
        this.emit({
          kind: "tool",
          name: stringValue(block.tool_use_id),
          callId: stringValue(block.tool_use_id),
          status: block.is_error === true ? "failed" : "completed",
        });
      }
    }
  }

  private completeTurn(event: JsonRecord): void {
    const pending = this.pendingTurn;
    const state = this.turnState;
    if (!pending || !state) return;
    this.pendingTurn = undefined;
    if (event.is_error === true || stringValue(event.subtype) === "error") {
      pending.reject(
        new ClaudeTurnError(
          stringValue(event.result) || "claude turn failed",
          { code: stringValue(event.subtype) || "claude_cli_error" },
        ),
      );
      return;
    }
    const text =
      stringValue(event.result) || state.text || state.bufferedText;
    const usage = record(event.usage);
    const normalizedUsage = parseClaudeTokenUsage(usage);
    if (normalizedUsage) {
      this.emit({
        kind: "context",
        current: normalizedUsage,
        precision: "provider",
      });
    }
    const responseId =
      stringValue(event.session_id) || this.providerSessionId || "claude-cli";
    this.emit({ kind: "response", responseId, status: "completed" });
    pending.resolve({
      provider: "claude_cli",
      transport: "stdio",
      responseId,
      text,
      usage,
      ...(normalizedUsage ? { normalizedUsage } : {}),
      timing: {
        startedMs: state.startedMs,
        providerDispatchedMs: state.providerDispatchedMs,
        ...(state.firstDeltaMs ? { firstDeltaMs: state.firstDeltaMs } : {}),
        completedMs: this.options.now(),
        toolDurationMs: 0,
      },
    });
  }
}

export class ClaudeCliRuntime implements AgentRuntime {
  private readonly sessions = new Set<ClaudeCliSession>();
  private readonly options: ResolvedCliOptions;

  constructor(options: ClaudeCliRuntimeOptions = {}) {
    this.options = {
      executablePath: options.executablePath ?? "claude",
      bare: options.bare === true,
      spawn: options.spawn ?? defaultSpawn,
      now: options.now ?? (() => performance.now()),
      env: options.env ?? process.env,
      repositoryConfigExists:
        options.repositoryConfigExists ?? defaultRepositoryConfigExists,
      ...(options.cwd ? { cwd: options.cwd } : {}),
    };
  }

  async startSession(
    config: AgentRuntimeSessionConfig,
  ): Promise<AgentRuntimeSession> {
    if (config.imageGeneration?.enabled) {
      throw new ClaudeTurnError(
        "The Claude CLI route cannot generate images",
        { code: "image_generation_unsupported" },
      );
    }
    let session!: ClaudeCliSession;
    session = new ClaudeCliSession(config, this.options, () =>
      this.sessions.delete(session),
    );
    this.sessions.add(session);
    try {
      await session.start();
    } catch (error) {
      await session.close();
      throw error;
    }
    return session;
  }

  activeSessionCount(): number {
    return this.sessions.size;
  }

  async close(): Promise<void> {
    await Promise.all([...this.sessions].map((session) => session.close()));
    this.sessions.clear();
  }
}
