import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { StringDecoder } from "node:string_decoder";

export type CodexAppServerActivity =
  | { kind: "delta"; text: string; threadId: string; turnId: string }
  | { kind: "notification"; method: string; params: Record<string, unknown> };

export type CodexAppServerTurnRequest = {
  /** Stable Orynt session/role key. Reusing it reuses the same Codex thread. */
  sessionKey?: string;
  prompt: string;
  cwd: string;
  model: string;
  effort: string;
  outputSchema?: Record<string, unknown>;
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

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
};

type TurnListener = {
  turnId?: string;
  text: string;
  firstDeltaMs?: number;
  resolve: (value: { text: string; completedMs: number }) => void;
  reject: (error: Error) => void;
  onActivity?: CodexAppServerTurnRequest["onActivity"];
};

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

export class CodexAppServerRuntime {
  private child?: ChildProcessWithoutNullStreams;
  private startPromise?: Promise<void>;
  private requestId = 0;
  private readonly pending = new Map<number, PendingRequest>();
  private readonly turns = new Map<string, TurnListener>();
  private readonly sessionThreads = new Map<string, string>();
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
    const child = spawn(
      this.options.executablePath ?? "codex",
      this.options.args ?? ["app-server", "--stdio"],
      {
        env: this.options.env ?? process.env,
        stdio: ["pipe", "pipe", "pipe"],
        detached: false,
      },
    );
    this.shuttingDown = false;
    this.child = child;
    const stdoutDecoder = new StringDecoder("utf8");
    const stderrDecoder = new StringDecoder("utf8");
    child.stdout.on("data", (chunk) => this.ingest(stdoutDecoder.write(chunk)));
    child.stderr.on("data", (chunk) => {
      this.stderr = `${this.stderr}${stderrDecoder.write(chunk)}`.slice(-8_000);
    });
    child.once("error", (error) => this.failAll(error));
    child.once("close", (code, signal) => {
      this.ingest(stdoutDecoder.end());
      this.stderr = `${this.stderr}${stderrDecoder.end()}`.slice(-8_000);
      if (!this.shuttingDown) {
        this.failAll(
          new Error(
            `Codex app-server exited with ${code ?? signal ?? "unknown"}: ${this.stderr.trim().slice(0, 1_000)}`,
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
    if (!listener) return;
    listener.onActivity?.({ kind: "notification", method: message.method, params });
    if (message.method === "item/agentMessage/delta" && typeof params.delta === "string") {
      const turnId = typeof params.turnId === "string" ? params.turnId : listener.turnId ?? "";
      listener.turnId ??= turnId;
      listener.firstDeltaMs ??= performance.now();
      listener.text += params.delta;
      listener.onActivity?.({ kind: "delta", text: params.delta, threadId, turnId });
    } else if (message.method === "turn/completed") {
      this.turns.delete(threadId);
      listener.resolve({ text: listener.text, completedMs: performance.now() });
    } else if (message.method === "error" && params.willRetry !== true) {
      this.turns.delete(threadId);
      listener.reject(new Error(boundedError(params.error)));
    }
  }

  private request(method: string, params: Record<string, unknown>): Promise<unknown> {
    const id = ++this.requestId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      try {
        this.write({ jsonrpc: "2.0", id, method, params });
      } catch (error) {
        this.pending.delete(id);
        reject(error);
      }
    });
  }

  private notify(method: string, params: Record<string, unknown>): void {
    this.write({ jsonrpc: "2.0", method, params });
  }

  private write(message: Record<string, unknown>): void {
    if (!this.child?.stdin.writable) throw new Error("Codex app-server is not writable");
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  async runTurn(request: CodexAppServerTurnRequest): Promise<CodexAppServerTurnResult> {
    if (request.signal?.aborted) {
      throw Object.assign(new Error("Codex app-server turn cancelled"), { name: "AbortError" });
    }
    await this.start();
    const existingThreadId = request.sessionKey
      ? this.sessionThreads.get(request.sessionKey)
      : undefined;
    let threadId = existingThreadId;
    if (!threadId) {
      const threadResponse = record(await this.request("thread/start", {
        model: request.model,
        cwd: request.cwd,
        approvalPolicy: "never",
        sandbox: request.sandbox ?? "read-only",
        ephemeral: true,
        dynamicTools: [],
        environments: [],
        runtimeWorkspaceRoots: [request.cwd],
        experimentalRawEvents: false,
      }));
      const thread = record(threadResponse.thread);
      if (typeof thread.id !== "string") throw new Error("Codex app-server thread/start returned no thread id");
      threadId = thread.id;
      if (request.sessionKey) this.sessionThreads.set(request.sessionKey, threadId);
    }
    if (this.turns.has(threadId)) {
      throw new Error(`Codex app-server session already has an in-flight turn: ${request.sessionKey ?? threadId}`);
    }
    const threadStartedMs = performance.now();
    let turnId: string | undefined;
    let timeout: NodeJS.Timeout | undefined;
    let abortHandler: (() => void) | undefined;
    let listener: TurnListener | undefined;
    const completion = new Promise<{ text: string; completedMs: number }>((resolve, reject) => {
      listener = { text: "", resolve, reject, onActivity: request.onActivity };
      this.turns.set(threadId, listener);
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
        input: [{ type: "text", text: request.prompt }],
        model: request.model,
        effort: request.effort,
        outputSchema: request.outputSchema,
        cwd: request.cwd,
      }));
      const turn = record(turnResponse.turn);
      if (typeof turn.id !== "string") throw new Error("Codex app-server turn/start returned no turn id");
      turnId = turn.id;
      if (listener) listener.turnId = turnId;
      const turnAcceptedMs = performance.now();
      request.onTurnAccepted?.();
      const completed = await completion;
      return {
        threadId,
        turnId,
        threadReused: existingThreadId !== undefined,
        text: completed.text,
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

  async shutdown(): Promise<void> {
    const child = this.child;
    if (!child) return;
    this.child = undefined;
    this.startPromise = undefined;
    this.initializedMs = 0;
    this.sessionThreads.clear();
    this.shuttingDown = true;
    const closed = new Promise<void>((resolve) => child.once("close", () => resolve()));
    child.stdin.end();
    child.kill("SIGTERM");
    const timer = setTimeout(() => child.kill("SIGKILL"), 2_000);
    await closed;
    clearTimeout(timer);
  }

  private failAll(error: Error): void {
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
    for (const listener of this.turns.values()) listener.reject(error);
    this.turns.clear();
    this.sessionThreads.clear();
  }
}
