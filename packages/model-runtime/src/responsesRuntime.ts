import WebSocket from "ws";

import type {
  AgentRuntime,
  AgentRuntimeActivity,
  AgentGeneratedImage,
  AgentRuntimeSession,
  AgentRuntimeSessionConfig,
  AgentRuntimeTiming,
  AgentContextTokenBreakdown,
  AgentRuntimeTurnInput,
  AgentRuntimeTurnResult,
  AgentToolCall,
} from "./index.js";
import { verifiedImageDataUrl } from "./imageInputs.js";

type JsonRecord = Record<string, unknown>;

type WebSocketLike = {
  readyState: number;
  send(data: string): void;
  close(code?: number): void;
  terminate?: () => void;
  on(event: "open", listener: () => void): unknown;
  on(event: "message", listener: (data: unknown) => void): unknown;
  on(event: "error", listener: (error: Error) => void): unknown;
  on(event: "close", listener: () => void): unknown;
  removeAllListeners(): unknown;
};

export type ResponsesRuntimeOptions = {
  apiKey?: string;
  apiKeyEnv?: string;
  websocketUrl?: string;
  httpUrl?: string;
  fetchImpl?: typeof fetch;
  createWebSocket?: (url: string, headers: Record<string, string>) => WebSocketLike;
  now?: () => number;
};

type ResponseEnvelope = {
  id: string;
  output: JsonRecord[];
  outputText: string;
  usage?: JsonRecord;
};

type PendingResponse = {
  resolve: (response: ResponseEnvelope) => void;
  reject: (error: Error) => void;
  onDelta: (text: string) => void;
};

const WS_OPEN = 1;
const DEFAULT_WS_URL = "wss://api.openai.com/v1/responses";
const DEFAULT_HTTP_URL = "https://api.openai.com/v1/responses";
const MAX_ERROR_TEXT = 1_000;
const MAX_CANONICAL_CONTEXT_BYTES = 256 * 1024;

function record(value: unknown): JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export class ResponsesTurnError extends Error {
  readonly code?: string;
  readonly sideEffectsStarted: boolean;

  constructor(
    message: string,
    options: { code?: string; sideEffectsStarted?: boolean } = {},
  ) {
    super(message);
    this.name = "ResponsesTurnError";
    this.code = options.code;
    this.sideEffectsStarted = options.sideEffectsStarted === true;
  }

  get contextWindowExceeded(): boolean {
    return this.code === "context_length_exceeded" ||
      this.code === "ContextWindowExceeded";
  }
}

function responseError(value: unknown): ResponsesTurnError {
  const event = record(value);
  const error = record(event.error);
  const code = stringValue(error.code) || stringValue(error.type);
  const message = stringValue(error.message) || stringValue(event.message) || "Responses request failed";
  return new ResponsesTurnError(
    `${code ? `${code}: ` : ""}${message}`.slice(0, MAX_ERROR_TEXT),
    code ? { code } : {},
  );
}

function tokenInteger(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.trunc(value))
    : 0;
}

export function parseResponsesTokenUsage(
  value: unknown,
): AgentContextTokenBreakdown | undefined {
  const usage = record(value);
  if (Object.keys(usage).length === 0) return undefined;
  const inputTokens = tokenInteger(usage.input_tokens ?? usage.inputTokens);
  const outputTokens = tokenInteger(usage.output_tokens ?? usage.outputTokens);
  const inputDetails = record(
    usage.input_tokens_details ?? usage.inputTokensDetails,
  );
  const outputDetails = record(
    usage.output_tokens_details ?? usage.outputTokensDetails,
  );
  return {
    inputTokens,
    cachedInputTokens: tokenInteger(
      inputDetails.cached_tokens ??
        inputDetails.cachedTokens ??
        usage.cached_input_tokens ??
        usage.cachedInputTokens,
    ),
    outputTokens,
    reasoningOutputTokens: tokenInteger(
      outputDetails.reasoning_tokens ??
        outputDetails.reasoningTokens ??
        usage.reasoning_output_tokens ??
        usage.reasoningOutputTokens,
    ),
    totalTokens:
      tokenInteger(usage.total_tokens ?? usage.totalTokens) ||
      inputTokens + outputTokens,
  };
}

function outputText(output: readonly JsonRecord[]): string {
  const chunks: string[] = [];
  for (const item of output) {
    if (item.type !== "message" || !Array.isArray(item.content)) continue;
    for (const content of item.content) {
      const part = record(content);
      if (part.type === "output_text" && typeof part.text === "string") chunks.push(part.text);
    }
  }
  return chunks.join("");
}

function functionCalls(output: readonly JsonRecord[]): AgentToolCall[] {
  return output.flatMap((item) => {
    if (item.type !== "function_call") return [];
    const name = stringValue(item.name);
    const callId = stringValue(item.call_id);
    if (!name || !callId) return [];
    let args: unknown = {};
    try {
      args = JSON.parse(stringValue(item.arguments) || "{}") as unknown;
    } catch {
      args = { _invalidJson: stringValue(item.arguments) };
    }
    return [{ callId, name, arguments: args }];
  });
}

function generatedImages(output: readonly JsonRecord[]): AgentGeneratedImage[] {
  return output.flatMap((item, index) => {
    if (item.type !== "image_generation_call") return [];
    return [{
      providerItemId: stringValue(item.id) || `image-${index + 1}`,
      revisedPrompt: stringValue(item.revised_prompt) || undefined,
      base64: stringValue(item.result) || undefined,
      status: item.status === "failed" ? "failed" as const : "completed" as const,
    }];
  });
}

function responseFormat(schema: Record<string, unknown> | undefined): JsonRecord | undefined {
  if (!schema) return undefined;
  return {
    format: {
      type: "json_schema",
      name: "orynt_agent_output",
      strict: true,
      schema,
    },
  };
}

class ResponsesSession implements AgentRuntimeSession {
  private socket?: WebSocketLike;
  private connectPromise?: Promise<void>;
  private pending?: PendingResponse;
  private previousResponseId?: string;
  private canonicalInput: JsonRecord[] = [];
  private canonicalInputBytes = 0;
  private turnsSinceReset = 0;
  private closed = false;
  private activeAbort?: AbortController;
  private connectionReadyMs?: number;
  private transport: "websocket" | "http" = "websocket";
  private closeNotified = false;

  constructor(
    private readonly config: AgentRuntimeSessionConfig,
    private readonly options: Required<Pick<ResponsesRuntimeOptions, "websocketUrl" | "httpUrl" | "fetchImpl" | "createWebSocket" | "now">> & { apiKey: string },
    private readonly onClose: () => void,
  ) {}

  async prewarm(): Promise<void> {
    try {
      await this.ensureConnected();
      const response = await this.sendWebSocketResponse({
        ...this.baseRequest(),
        generate: false,
        input: [],
      }, () => undefined);
      this.previousResponseId = response.id;
    } catch {
      this.transport = "http";
      this.dropSocket();
    }
  }

  async runTurn(input: AgentRuntimeTurnInput): Promise<AgentRuntimeTurnResult> {
    if (this.closed) throw new Error("Responses session is closed");
    if (this.activeAbort) throw new Error("Responses session already has an in-flight turn");
    if (input.signal?.aborted) throw Object.assign(new Error("Responses turn cancelled"), { name: "AbortError" });
    if (
      !this.config.effectiveContextWindowTokens &&
      this.canonicalInputBytes >= MAX_CANONICAL_CONTEXT_BYTES
    ) {
      await this.resetContext();
    }
    const startedMs = this.options.now();
    const controller = new AbortController();
    this.activeAbort = controller;
    const abort = () => controller.abort();
    input.signal?.addEventListener("abort", abort, { once: true });
    const timeout = setTimeout(() => controller.abort(), Math.max(1, input.timeoutMs ?? 15 * 60_000));
    let firstDeltaMs: number | undefined;
    let toolDurationMs = 0;
    let toolCalls = 0;
    const imageContent = await Promise.all((input.images ?? []).map(async (image) => ({
      type: "input_image",
      image_url: await verifiedImageDataUrl(image),
      detail: image.detail,
    })));
    const userItem: JsonRecord = {
      type: "message",
      role: "user",
      content: [{ type: "input_text", text: input.text }, ...imageContent],
    };
    this.appendCanonicalInput([userItem]);
    let nextInput: JsonRecord[] = [userItem];
    let lastResponse: ResponseEnvelope | undefined;
    const onDelta = (text: string) => {
      firstDeltaMs ??= this.options.now();
      this.config.onActivity?.({ kind: "text_delta", text });
      input.onActivity?.({ kind: "text_delta", text });
    };
    try {
      while (true) {
        if (controller.signal.aborted) throw Object.assign(new Error("Responses turn cancelled"), { name: "AbortError" });
        const response = await this.createResponse(nextInput, onDelta, controller.signal);
        lastResponse = response;
        this.previousResponseId = response.id;
        this.appendCanonicalInput(response.output);
        const calls = functionCalls(response.output);
        if (calls.length === 0) break;
        if (!this.config.executeTool) throw new Error(`Model requested tools but ${this.config.role} has no tool executor`);
        if (toolCalls + calls.length > (this.config.maxToolCalls ?? 48)) {
          throw new Error("Responses agent exceeded its tool-call budget");
        }
        nextInput = [];
        for (const call of calls) {
          toolCalls += 1;
          const requested = { kind: "tool", name: call.name, callId: call.callId, status: "requested" } as const;
          this.config.onActivity?.(requested);
          input.onActivity?.(requested);
          const toolStarted = this.options.now();
          let output: string;
          let resultImages: import("./index.js").AgentInlineImage[] = [];
          try {
            const result = await this.config.executeTool(call);
            output = result.output;
            resultImages = result.images ?? [];
            const completed = {
              kind: "tool",
              name: call.name,
              callId: call.callId,
              status: result.isError ? "failed" : "completed",
            } as const;
            this.config.onActivity?.(completed);
            input.onActivity?.(completed);
          } catch (error) {
            output = JSON.stringify({ error: error instanceof Error ? error.message : String(error) });
            const failed = { kind: "tool", name: call.name, callId: call.callId, status: "failed" } as const;
            this.config.onActivity?.(failed);
            input.onActivity?.(failed);
          }
          toolDurationMs += this.options.now() - toolStarted;
          nextInput.push({ type: "function_call_output", call_id: call.callId, output });
          if (resultImages.length > 0) {
            nextInput.push({
              type: "message",
              role: "user",
              content: resultImages.map((image) => ({
                type: "input_image",
                image_url: image.dataUrl,
                detail: image.detail,
              })),
            });
          }
        }
        this.appendCanonicalInput(nextInput);
      }
      if (!lastResponse) throw new Error("Responses turn produced no response");
      const completed = { kind: "response", responseId: lastResponse.id, status: "completed" } as const;
      const normalizedUsage = parseResponsesTokenUsage(lastResponse.usage);
      if (normalizedUsage) {
        const contextActivity = {
          kind: "context",
          current: normalizedUsage,
          precision: "provider",
        } as const;
        this.config.onActivity?.(contextActivity);
        input.onActivity?.(contextActivity);
      }
      this.config.onActivity?.(completed);
      input.onActivity?.(completed);
      const completedMs = this.options.now();
      this.turnsSinceReset += 1;
      return {
        provider: "openai_responses",
        transport: this.transport,
        responseId: lastResponse.id,
        text: lastResponse.outputText,
        generatedImages: generatedImages(lastResponse.output).slice(
          0,
          this.config.imageGeneration?.maxOutputs ?? 0,
        ),
        usage: lastResponse.usage,
        normalizedUsage,
        timing: {
          startedMs,
          connectionReadyMs: this.connectionReadyMs,
          providerDispatchedMs: startedMs,
          firstDeltaMs,
          completedMs,
          toolDurationMs,
        },
      };
    } catch (error) {
      if (error instanceof ResponsesTurnError) {
        throw new ResponsesTurnError(error.message, {
          code: error.code,
          sideEffectsStarted: toolCalls > 0,
        });
      }
      throw error;
    } finally {
      clearTimeout(timeout);
      input.signal?.removeEventListener("abort", abort);
      this.activeAbort = undefined;
    }
  }

  cancel(): void {
    this.activeAbort?.abort();
    this.pending?.reject(Object.assign(new Error("Responses turn cancelled"), { name: "AbortError" }));
    this.pending = undefined;
  }

  async resetContext(): Promise<void> {
    if (this.activeAbort || this.pending) {
      throw new Error("Cannot reset a Responses session during an in-flight turn");
    }
    this.previousResponseId = undefined;
    this.canonicalInput = [];
    this.canonicalInputBytes = 0;
    this.turnsSinceReset = 0;
    if (this.transport === "websocket") await this.prewarm();
  }

  private appendCanonicalInput(items: JsonRecord[]): void {
    this.canonicalInput.push(...items);
    for (const item of items) {
      this.canonicalInputBytes += Buffer.byteLength(JSON.stringify(item));
    }
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.cancel();
    this.dropSocket();
    this.previousResponseId = undefined;
    this.canonicalInput = [];
    this.canonicalInputBytes = 0;
    this.turnsSinceReset = 0;
    if (!this.closeNotified) {
      this.closeNotified = true;
      this.onClose();
    }
  }

  private baseRequest(): JsonRecord {
    return {
      type: "response.create",
      model: this.config.model,
      store: false,
      instructions: this.config.instructions,
      reasoning: { effort: this.config.effort },
      tools: [
        ...(this.config.tools ?? []),
        ...(this.config.imageGeneration?.enabled
          ? [{
              type: "image_generation",
              ...(this.config.imageGeneration.format
                ? { output_format: this.config.imageGeneration.format }
                : {}),
            }]
          : []),
      ],
      parallel_tool_calls: false,
      max_output_tokens: this.config.maxOutputTokens ?? 4_096,
      ...(this.config.promptCacheKey ? { prompt_cache_key: this.config.promptCacheKey } : {}),
      ...(this.config.outputSchema ? { text: responseFormat(this.config.outputSchema) } : {}),
    };
  }

  private async createResponse(
    input: JsonRecord[],
    onDelta: (text: string) => void,
    signal: AbortSignal,
  ): Promise<ResponseEnvelope> {
    if (this.transport === "websocket") {
      try {
        await this.ensureConnected();
        const request = {
          ...this.baseRequest(),
          input: this.previousResponseId ? input : this.canonicalInput,
          ...(this.previousResponseId ? { previous_response_id: this.previousResponseId } : {}),
        };
        return await this.sendWebSocketResponse(request, onDelta, signal);
      } catch (error) {
        if (signal.aborted) throw error;
        this.transport = "http";
        this.previousResponseId = undefined;
        this.dropSocket();
      }
    }
    return this.sendHttpResponse(onDelta, signal);
  }

  private async ensureConnected(): Promise<void> {
    if (this.socket?.readyState === WS_OPEN) return;
    this.connectPromise ??= new Promise<void>((resolve, reject) => {
      this.config.onActivity?.({ kind: this.connectionReadyMs ? "connection" : "connection", status: this.connectionReadyMs ? "reconnecting" : "connecting" });
      const socket = this.options.createWebSocket(this.options.websocketUrl, {
        Authorization: `Bearer ${this.options.apiKey}`,
      });
      this.socket = socket;
      socket.on("open", () => {
        this.connectionReadyMs = this.options.now();
        this.config.onActivity?.({ kind: "connection", status: "ready" });
        resolve();
      });
      socket.on("message", (data) => this.handleSocketMessage(data));
      socket.on("error", reject);
      socket.on("close", () => {
        const pending = this.pending;
        this.pending = undefined;
        pending?.reject(new Error("Responses WebSocket closed"));
        this.socket = undefined;
        this.connectPromise = undefined;
        // Response IDs are scoped to the closed WebSocket when store=false.
        // The next connection must replay the canonical local context.
        this.previousResponseId = undefined;
      });
    });
    try {
      await this.connectPromise;
    } finally {
      if (this.socket?.readyState !== WS_OPEN) this.connectPromise = undefined;
    }
  }

  private sendWebSocketResponse(
    request: JsonRecord,
    onDelta: (text: string) => void,
    signal?: AbortSignal,
  ): Promise<ResponseEnvelope> {
    if (!this.socket || this.socket.readyState !== WS_OPEN) throw new Error("Responses WebSocket is not open");
    if (this.pending) throw new Error("Responses WebSocket supports one in-flight response");
    return new Promise<ResponseEnvelope>((resolve, reject) => {
      const abort = () => {
        this.pending = undefined;
        reject(Object.assign(new Error("Responses turn cancelled"), { name: "AbortError" }));
      };
      signal?.addEventListener("abort", abort, { once: true });
      this.pending = {
        onDelta,
        resolve: (response) => {
          signal?.removeEventListener("abort", abort);
          resolve(response);
        },
        reject: (error) => {
          signal?.removeEventListener("abort", abort);
          reject(error);
        },
      };
      this.socket!.send(JSON.stringify(request));
    });
  }

  private handleSocketMessage(data: unknown): void {
    const text = typeof data === "string"
      ? data
      : Buffer.isBuffer(data)
        ? data.toString("utf8")
        : String(data);
    let event: JsonRecord;
    try {
      event = record(JSON.parse(text) as unknown);
    } catch {
      this.pending?.reject(new Error("Responses WebSocket returned invalid JSON"));
      this.pending = undefined;
      return;
    }
    if (event.type === "response.output_text.delta" && typeof event.delta === "string") {
      this.pending?.onDelta(event.delta);
      return;
    }
    if (event.type === "error" || event.type === "response.failed") {
      const pending = this.pending;
      this.pending = undefined;
      pending?.reject(responseError(event));
      return;
    }
    if (event.type !== "response.completed") return;
    const response = record(event.response);
    const output = Array.isArray(response.output) ? response.output.map(record) : [];
    const pending = this.pending;
    this.pending = undefined;
    pending?.resolve({
      id: stringValue(response.id),
      output,
      outputText: stringValue(response.output_text) || outputText(output),
      usage: record(response.usage),
    });
  }

  private async sendHttpResponse(
    onDelta: (text: string) => void,
    signal: AbortSignal,
  ): Promise<ResponseEnvelope> {
    const request = {
      ...this.baseRequest(),
      type: undefined,
      input: this.canonicalInput,
    };
    delete request.type;
    const response = await this.options.fetchImpl(this.options.httpUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.options.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
      signal,
    });
    const body = record(await response.json());
    if (!response.ok) throw responseError(body);
    const output = Array.isArray(body.output) ? body.output.map(record) : [];
    const text = stringValue(body.output_text) || outputText(output);
    if (text) onDelta(text);
    return {
      id: stringValue(body.id),
      output,
      outputText: text,
      usage: record(body.usage),
    };
  }

  private dropSocket(): void {
    const socket = this.socket;
    this.socket = undefined;
    this.connectPromise = undefined;
    if (!socket) return;
    socket.removeAllListeners();
    socket.close(1000);
    socket.terminate?.();
  }
}

export class ResponsesAgentRuntime implements AgentRuntime {
  private readonly sessions = new Set<ResponsesSession>();
  private readonly options: ResponsesSession["options"];

  constructor(options: ResponsesRuntimeOptions = {}) {
    const envKey = options.apiKeyEnv ?? "OPENAI_API_KEY";
    const apiKey = options.apiKey ?? process.env[envKey];
    if (!apiKey) throw new Error(`OpenAI API key is unavailable in ${envKey}`);
    this.options = {
      apiKey,
      websocketUrl: options.websocketUrl ?? DEFAULT_WS_URL,
      httpUrl: options.httpUrl ?? DEFAULT_HTTP_URL,
      fetchImpl: options.fetchImpl ?? fetch,
      createWebSocket: options.createWebSocket ?? ((url, headers) => new WebSocket(url, { headers })),
      now: options.now ?? (() => performance.now()),
    };
  }

  async startSession(config: AgentRuntimeSessionConfig): Promise<AgentRuntimeSession> {
    let session!: ResponsesSession;
    session = new ResponsesSession(
      config,
      this.options,
      () => this.sessions.delete(session),
    );
    this.sessions.add(session);
    try {
      await session.prewarm();
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
