import { realpath } from "node:fs/promises";
import path from "node:path";
import { Readable, Writable } from "node:stream";
import { pathToFileURL } from "node:url";

import {
  CancellationTokenSource,
  createMessageConnection,
  StreamMessageReader,
  StreamMessageWriter,
  type MessageConnection,
} from "vscode-jsonrpc/node";
import type {
  Diagnostic,
  InitializeParams,
  InitializeResult,
  PublishDiagnosticsParams,
  ServerCapabilities,
} from "vscode-languageserver-protocol";
import {
  LspRuntimeError,
  type DocumentDiagnostics,
  type LspCapabilitySupport,
  type LspCommandSpec,
  type LspSessionSnapshot,
  type LspSessionState,
  type NormalizedLspCapabilities,
} from "./types.js";

const CLIENT_CAPABILITIES: InitializeParams["capabilities"] = {
  general: {
    positionEncodings: ["utf-8", "utf-16", "utf-32"],
  },
  workspace: {
    applyEdit: false,
    configuration: true,
    workspaceFolders: true,
    didChangeWatchedFiles: { dynamicRegistration: true },
    symbol: { dynamicRegistration: true },
    diagnostics: { refreshSupport: true },
  },
  textDocument: {
    synchronization: {
      dynamicRegistration: true,
      didSave: true,
      willSave: false,
      willSaveWaitUntil: false,
    },
    definition: { dynamicRegistration: true, linkSupport: true },
    references: { dynamicRegistration: true },
    documentSymbol: {
      dynamicRegistration: true,
      hierarchicalDocumentSymbolSupport: true,
    },
    hover: { dynamicRegistration: true, contentFormat: ["markdown", "plaintext"] },
    callHierarchy: { dynamicRegistration: true },
    typeHierarchy: { dynamicRegistration: true },
    rename: {
      dynamicRegistration: true,
      prepareSupport: true,
      honorsChangeAnnotations: false,
    },
    codeAction: {
      dynamicRegistration: true,
      isPreferredSupport: true,
      disabledSupport: true,
      dataSupport: true,
      resolveSupport: { properties: ["edit", "command"] },
    },
    diagnostic: {
      dynamicRegistration: true,
      relatedDocumentSupport: true,
    },
    publishDiagnostics: {
      relatedInformation: true,
      versionSupport: true,
    },
  },
};

function support(value: unknown): LspCapabilitySupport {
  return value === undefined || value === null || value === false
    ? "unsupported"
    : "native";
}

function normalizeCapabilities(
  capabilities: ServerCapabilities,
): NormalizedLspCapabilities {
  const codeAction = capabilities.codeActionProvider;
  const sync = capabilities.textDocumentSync;
  const syncKind =
    typeof sync === "number"
      ? sync
      : typeof sync === "object" && sync
        ? sync.change
        : undefined;
  return {
    definition: support(capabilities.definitionProvider),
    references: support(capabilities.referencesProvider),
    documentSymbols: support(capabilities.documentSymbolProvider),
    workspaceSymbols: support(capabilities.workspaceSymbolProvider),
    hover: support(capabilities.hoverProvider),
    callHierarchy: support(capabilities.callHierarchyProvider),
    typeHierarchy: support(capabilities.typeHierarchyProvider),
    prepareRename:
      typeof capabilities.renameProvider === "object" &&
        capabilities.renameProvider?.prepareProvider
        ? "native"
        : "unsupported",
    rename: support(capabilities.renameProvider),
    codeAction: support(codeAction),
    codeActionResolve:
      typeof codeAction === "object" && codeAction?.resolveProvider
        ? "native"
        : "unsupported",
    executeCommand: support(capabilities.executeCommandProvider),
    pushDiagnostics: "native",
    pullDiagnostics: support(capabilities.diagnosticProvider),
    documentSync:
      syncKind === 2 ? "incremental" : syncKind === 1 ? "full" : "none",
  };
}

export type LspSessionOptions = {
  workspacePath: string;
  adapterId: string;
  command: LspCommandSpec;
  requestTimeoutMs?: number;
  shutdownTimeoutMs?: number;
  maxConcurrentRequests?: number;
  maxQueuedRequests?: number;
  maxRestartsPerWindow?: number;
  restartWindowMs?: number;
  onStderr?: (line: string) => void;
};

type LspChildProcess = ReturnType<typeof Bun.spawn>;

/** JSON-RPC error code the LSP specification reserves for a stale result. */
const CONTENT_MODIFIED_CODE = -32801;

function isContentModified(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const code = (error as { code?: unknown }).code;
  return code === CONTENT_MODIFIED_CODE;
}

export class LspSession {
  private state: LspSessionState = "stopped";
  private epoch = 0;
  private child?: LspChildProcess;
  private connection?: MessageConnection;
  private capabilities: InitializeResult["capabilities"] = {};
  private positionEncoding: LspSessionSnapshot["positionEncoding"] = "utf-16";
  private crashCount = 0;
  private lastFailure?: LspSessionSnapshot["lastFailure"];
  private readonly diagnostics = new Map<string, DocumentDiagnostics>();
  private diagnosticGeneration = 0;
  private readonly restartHistory: number[] = [];
  private readonly requestWaiters: Array<() => void> = [];
  private inFlightRequests = 0;
  private queuedRequests = 0;
  private requestCount = 0;
  private latestSynchronizedRevision = 0;
  private restartPromise?: Promise<LspSessionSnapshot>;
  private replayHandler?: () => Promise<void>;
  private root = "";
  private closing = false;
  private readonly intentionalExitEpochs = new Set<number>();
  private skipRestartBudgetOnce = false;

  constructor(private readonly options: LspSessionOptions) {}

  setReplayHandler(handler: () => Promise<void>): void {
    this.replayHandler = handler;
  }

  markSynchronized(revision: number): void {
    this.latestSynchronizedRevision = Math.max(
      this.latestSynchronizedRevision,
      revision,
    );
  }

  async start(): Promise<LspSessionSnapshot> {
    if (this.state === "ready" || this.state === "warming") {
      return this.snapshot();
    }
    if (this.state !== "stopped" && this.state !== "degraded") {
      throw new LspRuntimeError(
        "SERVER_WARMING",
        `Language server is ${this.state}.`,
        true,
      );
    }
    this.root = await realpath(this.options.workspacePath);
    if (this.epoch > 0) {
      if (this.skipRestartBudgetOnce) this.skipRestartBudgetOnce = false;
      else this.consumeRestartBudget();
      const attempt = this.recentRestarts().length;
      const delay = [100, 500, 2_000][Math.min(2, Math.max(0, attempt - 1))]!;
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, delay);
        timer.unref();
      });
    }
    this.state = this.epoch > 0 ? "restarting" : "starting";
    this.epoch += 1;
    const processEpoch = this.epoch;
    this.closing = false;
    let child: LspChildProcess;
    try {
      child = Bun.spawn(
        [this.options.command.command, ...this.options.command.args],
        {
        cwd: this.options.command.cwd,
        env: this.options.command.env,
          stdin: "pipe",
          stdout: "pipe",
          stderr: "pipe",
        },
      );
    } catch (error) {
      this.fail("SERVER_START_FAILED", error, true);
      throw new LspRuntimeError(
        "SERVER_START_FAILED",
        "Could not start the language server.",
        true,
      );
    }
    this.child = child;
    if (!child.stdin || !child.stdout) {
      this.fail("SERVER_START_FAILED", new Error("stdio unavailable"), true);
      throw new LspRuntimeError(
        "SERVER_START_FAILED",
        "Language server stdio is unavailable.",
        true,
      );
    }
    const childStdin = child.stdin as Bun.FileSink;
    const stdout = Readable.fromWeb(child.stdout as never);
    const stderr = child.stderr
      ? Readable.fromWeb(child.stderr as never)
      : undefined;
    const stdin = new Writable({
      write(chunk, _encoding, callback) {
        try {
          childStdin.write(chunk);
          childStdin.flush();
          callback();
        } catch (error) {
          callback(error as Error);
        }
      },
      final(callback) {
        try {
          childStdin.end();
          callback();
        } catch (error) {
          callback(error as Error);
        }
      },
    });
    stderr?.setEncoding("utf8");
    stderr?.on("data", (chunk: string) => {
      for (const line of chunk.split(/\r?\n/u).filter(Boolean).slice(-20)) {
        this.options.onStderr?.(line.slice(0, 2_000));
      }
    });
    void child.exited.then((code) => {
      if (this.intentionalExitEpochs.delete(processEpoch)) return;
      if (!this.closing && processEpoch === this.epoch) {
        this.crashCount += 1;
        this.fail(
          "SERVER_CRASHED",
          new Error(`Language server exited (${code}).`),
          true,
        );
      }
    });

    const connection = createMessageConnection(
      new StreamMessageReader(stdout),
      new StreamMessageWriter(stdin),
    );
    this.connection = connection;
    this.installInboundHandlers(connection);
    connection.listen();
    this.state = "initializing";
    const rootUri = pathToFileURL(this.root).href;
    let result: InitializeResult;
    try {
      result = await this.request<InitializeResult>(
        "initialize",
        {
          processId: process.pid,
          clientInfo: { name: "orynt", version: "0.1.0" },
          rootUri,
          rootPath: this.root,
          workspaceFolders: [
            { uri: rootUri, name: path.basename(this.root) || "workspace" },
          ],
          capabilities: CLIENT_CAPABILITIES,
          ...(this.options.command.initializationOptions === undefined
            ? {}
            : {
                initializationOptions:
                  this.options.command.initializationOptions,
              }),
          trace: "off",
        } satisfies InitializeParams,
        this.options.requestTimeoutMs ?? 15_000,
      );
      this.capabilities = result.capabilities;
      const advertised = result.capabilities.positionEncoding;
      this.positionEncoding =
        advertised === "utf-8" || advertised === "utf-32"
          ? advertised
          : "utf-16";
      await connection.sendNotification("initialized", {});
      this.state = "warming";
      if (this.epoch > 1) await this.replayHandler?.();
      this.state = "ready";
      return this.snapshot();
    } catch (error) {
      this.fail("SERVER_START_FAILED", error, true);
      await this.close().catch(() => undefined);
      throw error;
    }
  }

  snapshot(): LspSessionSnapshot {
    return {
      state: this.state,
      epoch: this.epoch,
      ...(this.child?.pid ? { processId: this.child.pid } : {}),
      workspacePath: this.root || this.options.workspacePath,
      adapterId: this.options.adapterId,
      serverFingerprint: this.options.command.fingerprint,
      positionEncoding: this.positionEncoding,
      capabilities: structuredClone(this.capabilities),
      normalizedCapabilities: normalizeCapabilities(this.capabilities),
      readinessEvidence: [
        this.state === "ready"
          ? "initialize completed and the document replay barrier passed"
          : `session state is ${this.state}`,
      ],
      crashCount: this.crashCount,
      restartBudgetRemaining: Math.max(
        0,
        (this.options.maxRestartsPerWindow ?? 3) -
          this.recentRestarts().length,
      ),
      inFlightRequests: this.inFlightRequests,
      queuedRequests: this.queuedRequests,
      requestCount: this.requestCount,
      latestSynchronizedRevision: this.latestSynchronizedRevision,
      ...(this.lastFailure
        ? { lastFailure: structuredClone(this.lastFailure) }
        : {}),
    };
  }

  async request<TResult>(
    method: string,
    params: unknown,
    timeoutMs = this.options.requestTimeoutMs ?? 10_000,
    signal?: AbortSignal,
  ): Promise<TResult> {
    if (this.state === "degraded") await this.restart();
    const connection = this.connection;
    if (!connection || !["initializing", "warming", "ready"].includes(this.state)) {
      throw new LspRuntimeError(
        "SERVER_CRASHED",
        "Language server is not available.",
        true,
        { state: this.state },
      );
    }
    if (signal?.aborted) {
      throw new LspRuntimeError(
        "REQUEST_CANCELLED",
        "Language-server request was cancelled.",
        true,
      );
    }
    const cancellation = new CancellationTokenSource();
    const abort = () => cancellation.cancel();
    signal?.addEventListener("abort", abort, { once: true });
    let timer: NodeJS.Timeout | undefined;
    await this.acquireRequestSlot(signal);
    try {
      this.requestCount += 1;
      return await Promise.race([
        connection.sendRequest(method, params, cancellation.token) as Promise<TResult>,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => {
            cancellation.cancel();
            reject(
              new LspRuntimeError(
                "REQUEST_TIMEOUT",
                `Language-server request timed out: ${method}`,
                true,
                { timeoutMs },
              ),
            );
          }, timeoutMs);
          timer.unref();
        }),
      ]);
    } catch (error) {
      if (signal?.aborted) {
        throw new LspRuntimeError(
          "REQUEST_CANCELLED",
          "Language-server request was cancelled.",
          true,
        );
      }
      // `ContentModified` (-32801) means the document changed while the server
      // was answering. The protocol defines it as a retry signal, not a
      // failure, so it is surfaced as a retryable runtime error instead of
      // leaking a raw JSON-RPC error that callers cannot classify.
      if (isContentModified(error)) {
        throw new LspRuntimeError(
          "SERVER_WARMING",
          "Language server discarded the result because the document changed.",
          true,
        );
      }
      throw error;
    } finally {
      if (timer) clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      cancellation.dispose();
      this.releaseRequestSlot();
    }
  }

  async notify(method: string, params: unknown): Promise<void> {
    if (!this.connection) {
      throw new LspRuntimeError(
        "SERVER_CRASHED",
        "Language server is not available.",
        true,
      );
    }
    await this.connection.sendNotification(method, params);
  }

  diagnosticsFor(uri?: string): DocumentDiagnostics[] {
    return [...this.diagnostics.values()]
      .filter((item) => !uri || item.uri === uri)
      .map((item) => structuredClone(item));
  }

  diagnosticState(uri: string): { generation: number; publishedAt: number } {
    const current = this.diagnostics.get(uri);
    return {
      generation: current?.generation ?? 0,
      publishedAt: current?.publishedAt ?? 0,
    };
  }

  async restart(): Promise<LspSessionSnapshot> {
    if (this.closing) {
      throw new LspRuntimeError(
        "SERVER_CRASHED",
        "Language server is shutting down.",
        false,
      );
    }
    if (this.restartPromise) return await this.restartPromise;
    this.restartPromise = (async () => {
      const connection = this.connection;
      const child = this.child;
      this.connection = undefined;
      this.child = undefined;
      // Force start() through the restart path. Leaving the session as ready
      // would make start() return the stale snapshot while the old process is
      // already being torn down.
      this.state = "degraded";
      connection?.dispose();
      if (child?.exitCode === null) {
        this.intentionalExitEpochs.add(this.epoch);
        child.kill("SIGTERM");
      }
      this.skipRestartBudgetOnce = true;
      return await this.start();
    })();
    try {
      return await this.restartPromise;
    } finally {
      this.restartPromise = undefined;
    }
  }

  async close(): Promise<void> {
    if (this.state === "stopped") return;
    this.closing = true;
    const connection = this.connection;
    const child = this.child;
    this.connection = undefined;
    this.child = undefined;
    try {
      if (connection && child?.exitCode === null) {
        const timeoutMs = this.options.shutdownTimeoutMs ?? 2_000;
        await Promise.race([
          (async () => {
            await connection.sendRequest("shutdown");
            await connection.sendNotification("exit");
          })(),
          new Promise<void>((resolve) => {
            const timer = setTimeout(resolve, timeoutMs);
            timer.unref();
          }),
        ]);
      }
    } finally {
      connection?.dispose();
      if (child?.exitCode === null) {
        child.kill("SIGTERM");
      }
      this.state = "stopped";
      this.diagnostics.clear();
    }
  }

  private installInboundHandlers(connection: MessageConnection): void {
    connection.onRequest("workspace/configuration", (params: unknown) => {
      const items =
        typeof params === "object" &&
        params !== null &&
        Array.isArray((params as { items?: unknown }).items)
          ? (params as { items: unknown[] }).items
          : [];
      return items.map(() => this.options.command.workspaceConfiguration ?? null);
    });
    connection.onRequest("workspace/workspaceFolders", () => [
      {
        uri: pathToFileURL(this.root || this.options.workspacePath).href,
        name: path.basename(this.root || this.options.workspacePath),
      },
    ]);
    connection.onRequest("workspace/diagnostic/refresh", () => null);
    connection.onRequest("client/registerCapability", () => null);
    connection.onRequest("client/unregisterCapability", () => null);
    connection.onRequest("window/workDoneProgress/create", () => null);
    connection.onRequest("workspace/applyEdit", () => ({
      applied: false,
      failureReason:
        "Orynt denies unsolicited language-server edits in read-only mode.",
    }));
    connection.onNotification(
      "textDocument/publishDiagnostics",
      (params: PublishDiagnosticsParams) => {
        this.diagnosticGeneration += 1;
        this.diagnostics.set(params.uri, {
          uri: params.uri,
          ...(params.version === undefined ? {} : { version: params.version }),
          diagnostics: structuredClone(params.diagnostics as Diagnostic[]),
          epoch: this.epoch,
          generation: this.diagnosticGeneration,
          publishedAt: Date.now(),
        });
      },
    );
  }

  private fail(
    code: "SERVER_START_FAILED" | "SERVER_CRASHED",
    error: unknown,
    retryable: boolean,
  ): void {
    this.state = "degraded";
    this.lastFailure = {
      code,
      message: error instanceof Error ? error.message : String(error),
      retryable,
    };
    this.connection?.dispose();
    this.connection = undefined;
  }

  private recentRestarts(now = Date.now()): number[] {
    const windowMs = this.options.restartWindowMs ?? 60_000;
    while (
      this.restartHistory.length > 0 &&
      now - this.restartHistory[0]! > windowMs
    ) {
      this.restartHistory.shift();
    }
    return this.restartHistory;
  }

  private consumeRestartBudget(): void {
    const history = this.recentRestarts();
    const limit = this.options.maxRestartsPerWindow ?? 3;
    if (history.length >= limit) {
      this.state = "degraded";
      this.lastFailure = {
        code: "SERVER_RESTART_LIMIT",
        message: "Language-server restart budget was exhausted.",
        retryable: true,
      };
      throw new LspRuntimeError(
        "SERVER_RESTART_LIMIT",
        "Language-server restart budget was exhausted.",
        true,
        { retryAfterMs: this.options.restartWindowMs ?? 60_000 },
      );
    }
    history.push(Date.now());
  }

  private async acquireRequestSlot(signal?: AbortSignal): Promise<void> {
    const maximum = this.options.maxConcurrentRequests ?? 8;
    if (this.inFlightRequests < maximum) {
      this.inFlightRequests += 1;
      return;
    }
    if (this.queuedRequests >= (this.options.maxQueuedRequests ?? 64)) {
      throw new LspRuntimeError(
        "INTERNAL_PROTOCOL_ERROR",
        "Language-server request queue is full.",
        true,
      );
    }
    this.queuedRequests += 1;
    await new Promise<void>((resolve, reject) => {
      const resume = () => {
        signal?.removeEventListener("abort", abort);
        resolve();
      };
      const abort = () => {
        const index = this.requestWaiters.indexOf(resume);
        if (index >= 0) this.requestWaiters.splice(index, 1);
        this.queuedRequests -= 1;
        reject(
          new LspRuntimeError(
            "REQUEST_CANCELLED",
            "Queued language-server request was cancelled.",
            true,
          ),
        );
      };
      signal?.addEventListener("abort", abort, { once: true });
      this.requestWaiters.push(resume);
    });
    this.queuedRequests -= 1;
    this.inFlightRequests += 1;
  }

  private releaseRequestSlot(): void {
    this.inFlightRequests = Math.max(0, this.inFlightRequests - 1);
    this.requestWaiters.shift()?.();
  }
}
