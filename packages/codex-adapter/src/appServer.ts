import { StringDecoder } from "node:string_decoder";

import type {
  AgentGeneratedImage,
  AgentImageInput,
  AgentFunctionTool,
  AgentToolCall,
  AgentToolResult,
} from "@codepawl/model-runtime";
import { verifiedImageDataUrl } from "@codepawl/model-runtime";
import type {
  ContextCapacityProfileV1,
  ContextTokenBreakdownV1,
} from "@codepawl/shared";

type BunPipeProcess = {
  stdin: {
    write(value: string): number;
    flush(): number | Promise<number>;
    end(): number | Promise<number>;
  };
  stdout: ReadableStream<Uint8Array>;
  stderr: ReadableStream<Uint8Array>;
  exited: Promise<number>;
  kill(signal: string): void;
};

declare const Bun: {
  spawn(
    argv: string[],
    options: {
      env: NodeJS.ProcessEnv;
      stdin: "pipe";
      stdout: "pipe";
      stderr: "pipe";
    },
  ): BunPipeProcess;
};

export type CodexAppServerActivity =
  | { kind: "delta"; text: string; threadId: string; turnId: string }
  | {
      kind: "tool";
      callId: string;
      toolKind: "command" | "mcp" | "web_search" | "file_change" | "other";
      name: string;
      detail: string;
      status: "requested" | "completed" | "failed";
    }
  | {
      kind: "context";
      context: NonNullable<CodexAppServerTurnResult["context"]>;
      threadId: string;
    }
  | { kind: "notification"; method: string; params: Record<string, unknown> };

export type CodexAppServerTurnRequest = {
  /** Stable Orynt session/role key. Reusing it reuses the same Codex thread. */
  sessionKey?: string;
  prompt: string;
  images?: AgentImageInput[];
  cwd: string;
  model: string;
  effort: string;
  outputSchema?: Record<string, unknown>;
  tools?: AgentFunctionTool[];
  executeTool?: (call: AgentToolCall) => Promise<AgentToolResult>;
  sandbox?: "read-only" | "workspace-write";
  timeoutMs?: number;
  signal?: AbortSignal;
  onTurnAccepted?: () => void;
  onActivity?: (activity: CodexAppServerActivity) => void;
};

export type CodexAppServerTurnResult = {
  threadId: string;
  turnId: string;
  threadReused: boolean;
  text: string;
  generatedImages: AgentGeneratedImage[];
  context?: {
    capacity: ContextCapacityProfileV1;
    current: ContextTokenBreakdownV1;
    cumulative: ContextTokenBreakdownV1;
    contextCompacted: boolean;
  };
  timing: {
    processStartedMs: number;
    initializedMs: number;
    threadStartedMs: number;
    turnAcceptedMs: number;
    firstDeltaMs?: number;
    completedMs: number;
  };
};

export type CodexAppServerRuntimeOptions = {
  executablePath?: string;
  args?: string[];
  env?: NodeJS.ProcessEnv;
};

const MAX_CACHED_SESSION_THREADS = 2;
const MAX_SESSION_THREAD_INPUT_BYTES = 256 * 1024;
const MAX_SESSION_THREAD_TURNS = 8;

function compactToolDetail(value: unknown, fallback: string): string {
  const text = Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string").join(" ")
    : typeof value === "string"
      ? value
      : "";
  return (text.trim().replace(/\s+/gu, " ") || fallback).slice(0, 240);
}

function itemToolActivity(
  item: Record<string, unknown>,
  status: "requested" | "completed",
): Extract<CodexAppServerActivity, { kind: "tool" }> | undefined {
  const type = typeof item.type === "string"
    ? item.type.replaceAll("_", "").toLowerCase()
    : "";
  const callId = typeof item.id === "string"
    ? item.id
    : typeof item.callId === "string"
      ? item.callId
      : "";
  const effectiveStatus = item.status === "failed" ? "failed" : status;
  if (type === "commandexecution") {
    return {
      kind: "tool",
      callId: callId || "app-server-command",
      toolKind: "command",
      name: "shell",
      detail: compactToolDetail(item.command, "shell command"),
      status: effectiveStatus,
    };
  }
  if (type === "mcptoolcall") {
    const server = compactToolDetail(item.server, "MCP");
    const tool = compactToolDetail(item.tool, "tool");
    return {
      kind: "tool",
      callId: callId || `app-server-mcp-${server}.${tool}`,
      toolKind: "mcp",
      name: `${server}.${tool}`.slice(0, 160),
      detail: `${server}.${tool}`.slice(0, 240),
      status: effectiveStatus,
    };
  }
  if (type === "websearch") {
    return {
      kind: "tool",
      callId: callId || "app-server-web-search",
      toolKind: "web_search",
      name: "web_search",
      detail: compactToolDetail(item.query, "web search"),
      status: effectiveStatus,
    };
  }
  if (type === "filechange") {
    const paths = Array.isArray(item.changes)
      ? item.changes.flatMap((change) => {
          const candidate = record(change);
          return typeof candidate.path === "string" ? [candidate.path] : [];
        }).slice(0, 3)
      : [];
    return {
      kind: "tool",
      callId: callId || "app-server-file-change",
      toolKind: "file_change",
      name: "file_change",
      detail: compactToolDetail(paths, "repository files"),
      status: effectiveStatus,
    };
  }
  return undefined;
}

type CachedSessionThread = {
  threadId: string;
  turnCount: number;
  inputBytes: number;
  lastUsedAt: number;
  context?: CodexAppServerTurnResult["context"];
};

export type CodexModelProviderCapabilities = {
  imageGeneration: boolean;
  namespaceTools: boolean;
  webSearch: boolean;
};

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
};

type TurnListener = {
  turnId?: string;
  agentMessageItemId?: string;
  text: string;
  generatedImages: AgentGeneratedImage[];
  context?: CodexAppServerTurnResult["context"];
  contextCompacted: boolean;
  toolCallsStarted: number;
  firstDeltaMs?: number;
  resolve: (value: {
    text: string;
    generatedImages: AgentGeneratedImage[];
    completedMs: number;
    context?: CodexAppServerTurnResult["context"];
  }) => void;
  reject: (error: Error) => void;
  onActivity?: CodexAppServerTurnRequest["onActivity"];
  executeTool?: CodexAppServerTurnRequest["executeTool"];
};

type CompactionListener = {
  started: boolean;
  resolve: () => void;
  reject: (error: Error) => void;
};

export class CodexAppServerTurnError extends Error {
  readonly code?: string;
  readonly sideEffectsStarted: boolean;
  readonly threadId?: string;

  constructor(
    message: string,
    options: {
      code?: string;
      sideEffectsStarted?: boolean;
      threadId?: string;
    } = {},
  ) {
    super(message);
    this.name = "CodexAppServerTurnError";
    this.code = options.code;
    this.sideEffectsStarted = options.sideEffectsStarted === true;
    this.threadId = options.threadId;
  }

  get contextWindowExceeded(): boolean {
    return this.code === "ContextWindowExceeded";
  }
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function boundedError(value: unknown): string {
  const candidate = record(value);
  const message =
    typeof candidate.message === "string"
      ? candidate.message
      : typeof value === "string"
        ? value
        : JSON.stringify(value);
  return message.replace(/\s+/gu, " ").slice(0, 1_000);
}

function integer(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.trunc(value))
    : 0;
}

function tokenBreakdown(value: unknown): ContextTokenBreakdownV1 {
  const input = record(value);
  const inputTokens = integer(input.inputTokens ?? input.input_tokens);
  const cachedInputTokens = integer(
    input.cachedInputTokens ?? input.cached_input_tokens,
  );
  const outputTokens = integer(input.outputTokens ?? input.output_tokens);
  const reasoningOutputTokens = integer(
    input.reasoningOutputTokens ?? input.reasoning_output_tokens,
  );
  return {
    inputTokens,
    cachedInputTokens,
    outputTokens,
    reasoningOutputTokens,
    totalTokens: integer(input.totalTokens ?? input.total_tokens) ||
      inputTokens + outputTokens,
  };
}

export function parseCodexThreadTokenUsage(
  value: unknown,
  modelId: string,
): CodexAppServerTurnResult["context"] | undefined {
  const params = record(value);
  const usage = record(params.tokenUsage ?? params.token_usage);
  const currentRaw = usage.last ?? usage.lastTokenUsage ?? usage.last_token_usage;
  const cumulativeRaw =
    usage.total ?? usage.totalTokenUsage ?? usage.total_token_usage;
  if (!currentRaw || !cumulativeRaw) return undefined;
  const modelContextWindow = integer(
    usage.modelContextWindow ?? usage.model_context_window,
  );
  return {
    capacity: {
      schemaVersion: 1,
      modelId,
      ...(modelContextWindow > 0
        ? {
            effectiveWindowTokens: modelContextWindow,
            source: "provider_event" as const,
          }
        : { source: "unknown" as const }),
    },
    current: tokenBreakdown(currentRaw),
    cumulative: tokenBreakdown(cumulativeRaw),
    contextCompacted: false,
  };
}

function codexErrorInfo(value: unknown): string | undefined {
  const error = record(value);
  const info = error.codexErrorInfo ?? error.codex_error_info;
  if (typeof info === "string") return info;
  const candidate = record(info);
  return typeof candidate.type === "string"
    ? candidate.type
    : typeof candidate.kind === "string"
      ? candidate.kind
      : undefined;
}

export class CodexAppServerRuntime {
  private child?: BunPipeProcess;
  private startPromise?: Promise<void>;
  private requestId = 0;
  private readonly pending = new Map<number, PendingRequest>();
  private readonly turns = new Map<string, TurnListener>();
  private readonly compactions = new Map<string, CompactionListener>();
  private readonly sessionThreads = new Map<string, CachedSessionThread>();
  private buffer = "";
  private stderr = "";
  private processStartedMs = 0;
  private initializedMs = 0;
  private shuttingDown = false;

  constructor(private readonly options: CodexAppServerRuntimeOptions = {}) {}

  async start(): Promise<void> {
    if (this.child && this.initializedMs > 0) return;
    this.startPromise ??= this.startProcess();
    return this.startPromise;
  }

  private async startProcess(): Promise<void> {
    this.processStartedMs = performance.now();
    const child = Bun.spawn(
      [this.options.executablePath ?? "codex", ...(this.options.args ?? ["app-server", "--stdio"])],
      {
        env: this.options.env ?? process.env,
        stdin: "pipe",
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    this.shuttingDown = false;
    this.child = child;
    const stdoutDecoder = new StringDecoder("utf8");
    const stderrDecoder = new StringDecoder("utf8");
    void this.readStream(child.stdout, (chunk) => this.ingest(stdoutDecoder.write(chunk)));
    void this.readStream(child.stderr, (chunk) => {
      this.stderr = `${this.stderr}${stderrDecoder.write(chunk)}`.slice(-8_000);
    });
    void child.exited.then((code) => {
      this.ingest(stdoutDecoder.end());
      this.stderr = `${this.stderr}${stderrDecoder.end()}`.slice(-8_000);
      if (!this.shuttingDown) {
        this.failAll(
          new Error(
            `Codex app-server exited with ${code}: ${this.stderr.trim().slice(0, 1_000)}`,
          ),
        );
      }
      this.child = undefined;
      this.startPromise = undefined;
      this.initializedMs = 0;
    });
    await this.request("initialize", {
      clientInfo: { name: "orynt", title: "Orynt", version: "0.1.0" },
      capabilities: { experimentalApi: true },
    });
    this.notify("initialized", {});
    this.initializedMs = performance.now();
  }

  private async readStream(
    stream: ReadableStream<Uint8Array>,
    onChunk: (chunk: Uint8Array) => void,
  ): Promise<void> {
    const reader = stream.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) return;
        onChunk(value);
      }
    } catch (error) {
      if (!this.shuttingDown) this.failAll(error instanceof Error ? error : new Error(String(error)));
    } finally {
      reader.releaseLock();
    }
  }

  private ingest(chunk: string): void {
    this.buffer += chunk;
    const lines = this.buffer.split(/\r?\n/u);
    this.buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        this.handleMessage(JSON.parse(line) as unknown);
      } catch (error) {
        this.failAll(new Error(`Invalid app-server JSONL: ${boundedError(error)}`));
      }
    }
  }

  private handleMessage(input: unknown): void {
    const message = record(input);
    if (
      message.method === "item/tool/call" &&
      (typeof message.id === "number" || typeof message.id === "string")
    ) {
      void this.handleDynamicToolCall(message.id, record(message.params));
      return;
    }
    if (typeof message.id === "number") {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error !== undefined) pending.reject(new Error(boundedError(message.error)));
      else pending.resolve(message.result);
      return;
    }
    if (typeof message.method !== "string") return;
    const params = record(message.params);
    const threadId = typeof params.threadId === "string" ? params.threadId : undefined;
    if (!threadId) return;
    const listener = this.turns.get(threadId);
    const compaction = this.compactions.get(threadId);
    if (!listener && !compaction) return;
    listener?.onActivity?.({ kind: "notification", method: message.method, params });
    if (
      listener &&
      (message.method === "item/started" || message.method === "item/completed")
    ) {
      const toolActivity = itemToolActivity(
        record(params.item),
        message.method === "item/started" ? "requested" : "completed",
      );
      if (toolActivity) listener.onActivity?.(toolActivity);
    }
    if (message.method === "thread/tokenUsage/updated" && listener) {
      const parsed = parseCodexThreadTokenUsage(
        params,
        listener.context?.capacity.modelId ?? "unknown",
      );
      if (parsed) {
        parsed.contextCompacted = listener.contextCompacted;
        listener.context = parsed;
        listener.onActivity?.({
          kind: "context",
          context: structuredClone(parsed),
          threadId,
        });
      }
    }
    if (message.method === "item/agentMessage/delta" && typeof params.delta === "string") {
      if (!listener) return;
      const turnId = typeof params.turnId === "string" ? params.turnId : listener.turnId ?? "";
      listener.turnId ??= turnId;
      const itemId = typeof params.itemId === "string" ? params.itemId : undefined;
      if (
        itemId &&
        listener.agentMessageItemId &&
        itemId !== listener.agentMessageItemId
      ) {
        listener.text = "";
      }
      if (itemId) listener.agentMessageItemId = itemId;
      listener.firstDeltaMs ??= performance.now();
      listener.text += params.delta;
      listener.onActivity?.({ kind: "delta", text: params.delta, threadId, turnId });
    } else if (message.method === "item/completed") {
      const item = record(params.item);
      if (item.type === "contextCompaction") {
        if (listener) {
          listener.contextCompacted = true;
          if (listener.context) listener.context.contextCompacted = true;
        }
        if (compaction) compaction.started = true;
      }
      if (!listener) return;
      if (item.type === "imageGeneration") {
        const status = item.status === "failed" ? "failed" : "completed";
        listener.generatedImages.push({
          providerItemId: typeof item.id === "string" ? item.id : `image-${listener.generatedImages.length + 1}`,
          revisedPrompt: typeof item.revisedPrompt === "string" ? item.revisedPrompt : undefined,
          savedPath: typeof item.savedPath === "string" ? item.savedPath : undefined,
          base64: typeof item.result === "string" ? item.result : undefined,
          status,
        });
      }
    } else if (message.method === "turn/completed") {
      if (compaction) {
        this.compactions.delete(threadId);
        compaction.resolve();
        if (!listener) return;
      }
      if (!listener) return;
      const turn = record(params.turn);
      if (turn.status === "failed") {
        this.turns.delete(threadId);
        const error = record(turn.error);
        listener.reject(
          new CodexAppServerTurnError(boundedError(error), {
            code: codexErrorInfo(error),
            sideEffectsStarted: listener.toolCallsStarted > 0,
            threadId,
          }),
        );
        return;
      }
      this.turns.delete(threadId);
      listener.resolve({
        text: listener.text,
        generatedImages: listener.generatedImages,
        completedMs: performance.now(),
        context: listener.context
          ? {
              ...listener.context,
              contextCompacted: listener.contextCompacted,
            }
          : undefined,
      });
    } else if (message.method === "error" && params.willRetry !== true) {
      if (!listener) {
        if (compaction) {
          this.compactions.delete(threadId);
          compaction.reject(
            new CodexAppServerTurnError(boundedError(params.error), {
              code: codexErrorInfo(params.error),
            }),
          );
        }
        return;
      }
      this.turns.delete(threadId);
      listener.reject(
        new CodexAppServerTurnError(boundedError(params.error), {
          code: codexErrorInfo(params.error),
          sideEffectsStarted: listener.toolCallsStarted > 0,
          threadId,
        }),
      );
    }
  }

  private async handleDynamicToolCall(
    id: number | string,
    params: Record<string, unknown>,
  ): Promise<void> {
    const threadId =
      typeof params.threadId === "string" ? params.threadId : undefined;
    const listener = threadId ? this.turns.get(threadId) : undefined;
    const tool = typeof params.tool === "string" ? params.tool : "";
    const callId =
      typeof params.callId === "string"
        ? params.callId
        : `app-server-tool-${String(id)}`;
    listener?.onActivity?.({
      kind: "tool",
      callId,
      toolKind: "other",
      name: tool || "dynamic_tool",
      detail: tool || "dynamic tool",
      status: "requested",
    });
    if (listener) listener.toolCallsStarted += 1;
    if (!listener?.executeTool || !tool) {
      this.respond(id, {
        contentItems: [
          {
            type: "inputText",
            text: JSON.stringify({
              error: "No Orynt executor is available for this dynamic tool.",
            }),
          },
        ],
        success: false,
      });
      listener?.onActivity?.({
        kind: "tool",
        callId,
        toolKind: "other",
        name: tool || "dynamic_tool",
        detail: tool || "dynamic tool",
        status: "failed",
      });
      return;
    }
    try {
      const result = await listener.executeTool({
        callId,
        name: tool,
        arguments: params.arguments,
      });
      this.respond(id, {
        contentItems: [
          { type: "inputText", text: result.output },
          ...(result.images ?? []).map((image) => ({
            type: "inputImage",
            imageUrl: image.dataUrl,
          })),
        ],
        success: result.isError !== true,
      });
      listener.onActivity?.({
        kind: "tool",
        callId,
        toolKind: "other",
        name: tool,
        detail: tool,
        status: result.isError === true ? "failed" : "completed",
      });
    } catch (error) {
      this.respond(id, {
        contentItems: [
          {
            type: "inputText",
            text: JSON.stringify({ error: boundedError(error) }),
          },
        ],
        success: false,
      });
      listener.onActivity?.({
        kind: "tool",
        callId,
        toolKind: "other",
        name: tool,
        detail: tool,
        status: "failed",
      });
    }
  }

  private request(
    method: string,
    params: Record<string, unknown> | null,
    timeoutMs?: number,
  ): Promise<unknown> {
    const id = ++this.requestId;
    return new Promise((resolve, reject) => {
      const timeout = timeoutMs === undefined
        ? undefined
        : setTimeout(() => {
            if (!this.pending.delete(id)) return;
            reject(new Error(`Codex app-server ${method} timed out`));
          }, Math.max(1, timeoutMs));
      timeout?.unref();
      this.pending.set(id, {
        resolve: (value) => {
          if (timeout) clearTimeout(timeout);
          resolve(value);
        },
        reject: (error) => {
          if (timeout) clearTimeout(timeout);
          reject(error);
        },
      });
      try {
        this.write({ jsonrpc: "2.0", id, method, params });
      } catch (error) {
        if (timeout) clearTimeout(timeout);
        this.pending.delete(id);
        reject(error);
      }
    });
  }

  private notify(method: string, params: Record<string, unknown>): void {
    this.write({ jsonrpc: "2.0", method, params });
  }

  private respond(id: number | string, result: unknown): void {
    this.write({ jsonrpc: "2.0", id, result });
  }

  private write(message: Record<string, unknown>): void {
    if (!this.child) throw new Error("Codex app-server is not writable");
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
    this.child.stdin.flush();
  }

  async runTurn(request: CodexAppServerTurnRequest): Promise<CodexAppServerTurnResult> {
    if (request.signal?.aborted) {
      throw Object.assign(new Error("Codex app-server turn cancelled"), { name: "AbortError" });
    }
    await this.start();
    await Promise.all((request.images ?? []).map((image) => verifiedImageDataUrl(image)));
    const dynamicTools = (request.tools ?? []).map((tool) => ({
      type: "function" as const,
      name: tool.name,
      description: tool.description,
      inputSchema: tool.parameters,
      deferLoading: false,
    }));
    const sessionKey = request.sessionKey
      ? `${request.sessionKey}\u0000${JSON.stringify(dynamicTools)}`
      : undefined;
    const cachedThread = sessionKey
      ? this.sessionThreads.get(sessionKey)
      : undefined;
    const requestBytes = Buffer.byteLength(request.prompt, "utf8");
    const reusableThread =
      cachedThread &&
      cachedThread.turnCount < MAX_SESSION_THREAD_TURNS &&
      cachedThread.inputBytes + requestBytes <= MAX_SESSION_THREAD_INPUT_BYTES
        ? cachedThread
        : undefined;
    if (sessionKey && cachedThread && !reusableThread) {
      this.sessionThreads.delete(sessionKey);
    }
    const existingThreadId = reusableThread?.threadId;
    let threadId = existingThreadId;
    if (!threadId) {
      const threadResponse = record(await this.request("thread/start", {
        model: request.model,
        cwd: request.cwd,
        approvalPolicy: "never",
        sandbox: request.sandbox ?? "read-only",
        ephemeral: true,
        dynamicTools,
        environments: [],
        runtimeWorkspaceRoots: [request.cwd],
        experimentalRawEvents: false,
      }));
      const thread = record(threadResponse.thread);
      if (typeof thread.id !== "string") throw new Error("Codex app-server thread/start returned no thread id");
      threadId = thread.id;
      if (sessionKey) {
        while (this.sessionThreads.size >= MAX_CACHED_SESSION_THREADS) {
          const oldest = [...this.sessionThreads.entries()].sort(
            (left, right) => left[1].lastUsedAt - right[1].lastUsedAt,
          )[0];
          if (!oldest) break;
          this.sessionThreads.delete(oldest[0]);
        }
        this.sessionThreads.set(sessionKey, {
          threadId,
          turnCount: 0,
          inputBytes: 0,
          lastUsedAt: Date.now(),
        });
      }
    }
    if (this.turns.has(threadId)) {
      throw new Error(`Codex app-server session already has an in-flight turn: ${request.sessionKey ?? threadId}`);
    }
    const threadStartedMs = performance.now();
    let turnId: string | undefined;
    let timeout: NodeJS.Timeout | undefined;
    let abortHandler: (() => void) | undefined;
    let listener: TurnListener | undefined;
    const completion = new Promise<{
      text: string;
      generatedImages: AgentGeneratedImage[];
      completedMs: number;
      context?: CodexAppServerTurnResult["context"];
    }>((resolve, reject) => {
      listener = {
        text: "",
        generatedImages: [],
        context: reusableThread?.context
          ? structuredClone(reusableThread.context)
          : undefined,
        contextCompacted: false,
        toolCallsStarted: 0,
        resolve,
        reject,
        onActivity: request.onActivity,
        executeTool: request.executeTool,
      };
      this.turns.set(threadId, listener as TurnListener);
    });
    try {
      const interrupted = (reason: Error) => {
        const active = this.turns.get(threadId);
        if (!active) return;
        this.turns.delete(threadId);
        if (turnId) void this.request("turn/interrupt", { threadId, turnId }).catch(() => undefined);
        active.reject(reason);
      };
      timeout = setTimeout(
        () => interrupted(new Error("Codex app-server turn timed out")),
        Math.max(1, request.timeoutMs ?? 5 * 60_000),
      );
      abortHandler = () => interrupted(
        Object.assign(new Error("Codex app-server turn cancelled"), { name: "AbortError" }),
      );
      request.signal?.addEventListener("abort", abortHandler, { once: true });
      const turnResponse = record(await this.request("turn/start", {
        threadId,
        input: [
          { type: "text", text: request.prompt },
          ...(request.images ?? []).map((image) => ({
            type: "localImage",
            path: image.path,
            detail: image.detail,
          })),
        ],
        model: request.model,
        effort: request.effort,
        outputSchema: request.outputSchema,
        cwd: request.cwd,
      }));
      const turn = record(turnResponse.turn);
      if (typeof turn.id !== "string") throw new Error("Codex app-server turn/start returned no turn id");
      turnId = turn.id;
      if (listener) listener.turnId = turnId;
      if (listener?.context) {
        listener.context.capacity.modelId = request.model;
      }
      const turnAcceptedMs = performance.now();
      request.onTurnAccepted?.();
      const completed = await completion;
      if (sessionKey) {
        const cached = this.sessionThreads.get(sessionKey);
        if (cached?.threadId === threadId) {
          cached.turnCount += 1;
          cached.inputBytes += requestBytes;
          cached.lastUsedAt = Date.now();
          cached.context = completed.context
            ? structuredClone(completed.context)
            : cached.context;
        }
      }
      return {
        threadId,
        turnId,
        threadReused: existingThreadId !== undefined,
        text: completed.text,
        generatedImages: completed.generatedImages,
        ...(completed.context ? { context: completed.context } : {}),
        timing: {
          processStartedMs: this.processStartedMs,
          initializedMs: this.initializedMs,
          threadStartedMs,
          turnAcceptedMs,
          firstDeltaMs: listener?.firstDeltaMs,
          completedMs: completed.completedMs,
        },
      };
    } finally {
      if (timeout) clearTimeout(timeout);
      if (abortHandler) request.signal?.removeEventListener("abort", abortHandler);
      this.turns.delete(threadId);
    }
  }

  async compactThread(
    threadId: string,
    timeoutMs = 60_000,
  ): Promise<void> {
    await this.start();
    if (this.turns.has(threadId) || this.compactions.has(threadId)) {
      throw new Error("Cannot compact a Codex thread during an active turn");
    }
    let timer: NodeJS.Timeout | undefined;
    const completion = new Promise<void>((resolve, reject) => {
      timer = setTimeout(() => {
        this.compactions.delete(threadId);
        reject(new Error("Codex app-server context compaction timed out"));
      }, Math.max(1, timeoutMs));
      timer.unref();
      this.compactions.set(threadId, {
        started: false,
        resolve,
        reject,
      });
    });
    try {
      await this.request("thread/compact/start", { threadId }, timeoutMs);
      await completion;
      for (const cached of this.sessionThreads.values()) {
        if (cached.threadId !== threadId) continue;
        cached.inputBytes = 0;
        if (cached.context) cached.context.contextCompacted = true;
      }
    } finally {
      if (timer) clearTimeout(timer);
      this.compactions.delete(threadId);
    }
  }

  dropThread(threadId: string): void {
    if (this.turns.has(threadId) || this.compactions.has(threadId)) {
      throw new Error("Cannot rotate a Codex thread during an active turn");
    }
    for (const [key, cached] of this.sessionThreads.entries()) {
      if (cached.threadId === threadId) this.sessionThreads.delete(key);
    }
  }

  async readModelProviderCapabilities(): Promise<CodexModelProviderCapabilities> {
    await this.start();
    const result = record(await this.request("modelProvider/capabilities/read", {}));
    return {
      imageGeneration: result.imageGeneration === true,
      namespaceTools: result.namespaceTools === true,
      webSearch: result.webSearch === true,
    };
  }

  async readAccount(timeoutMs?: number): Promise<unknown> {
    await this.start();
    return this.request("account/read", { refreshToken: false }, timeoutMs);
  }

  async readAccountRateLimits(timeoutMs?: number): Promise<unknown> {
    await this.start();
    return this.request("account/rateLimits/read", null, timeoutMs);
  }

  async readAccountTokenUsage(timeoutMs?: number): Promise<unknown> {
    await this.start();
    return this.request("account/usage/read", null, timeoutMs);
  }

  async shutdown(): Promise<void> {
    const child = this.child;
    if (!child) return;
    this.child = undefined;
    this.startPromise = undefined;
    this.initializedMs = 0;
    this.sessionThreads.clear();
    this.shuttingDown = true;
    child.stdin.end();
    child.kill("SIGTERM");
    const timer = setTimeout(() => child.kill("SIGKILL"), 2_000);
    await child.exited;
    clearTimeout(timer);
  }

  private failAll(error: Error): void {
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
    for (const listener of this.turns.values()) listener.reject(error);
    this.turns.clear();
    for (const listener of this.compactions.values()) listener.reject(error);
    this.compactions.clear();
    this.sessionThreads.clear();
  }
}
