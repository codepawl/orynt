import { redactSensitiveText } from "@codepawl/shared";
import type {
  AgentContextTokenBreakdown,
  AgentInlineImage,
  AgentRuntime,
  AgentRuntimeSession,
  AgentRuntimeSessionConfig,
  AgentRuntimeTurnInput,
  AgentRuntimeTurnResult,
  AgentToolCall,
} from "@codepawl/model-runtime";
import { verifiedImageDataUrl } from "@codepawl/model-runtime";

import { ClaudeSseDecoder, type JsonRecord } from "./sse.js";
import {
  claudeEffort,
  claudeImageBlock,
  claudeImageSource,
  claudeTools,
  defaultClaudeModelCapabilities,
  toolResultMessage,
  type ClaudeModelCapabilities,
  type ClaudeToolResultInput,
  type ClaudeToolWarning,
} from "./tools.js";
import { mergeClaudeUsage, parseClaudeTokenUsage } from "./usage.js";

const DEFAULT_BASE_URL = "https://api.anthropic.com";
const DEFAULT_ANTHROPIC_VERSION = "2023-06-01";
const OAUTH_BETA_HEADER = "oauth-2025-04-20";
const MAX_ERROR_TEXT = 1_000;
const MAX_CANONICAL_CONTEXT_BYTES = 256 * 1024;
/**
 * `max_tokens` caps thinking *and* visible text on Anthropic, and thinking is
 * on by default on the current Opus models, so the Responses runtime's 4096
 * would routinely truncate mid-answer.
 */
const DEFAULT_MAX_OUTPUT_TOKENS = 16_000;
const DEFAULT_MAX_TOOL_CALLS = 48;

function record(value: unknown): JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function safeText(value: string): string {
  return redactSensitiveText(value).value.slice(0, MAX_ERROR_TEXT);
}

export class ClaudeTurnError extends Error {
  readonly code?: string;
  readonly status?: number;
  readonly retryAfterMs?: number;
  readonly sideEffectsStarted: boolean;

  constructor(
    message: string,
    options: {
      code?: string;
      status?: number;
      retryAfterMs?: number;
      sideEffectsStarted?: boolean;
    } = {},
  ) {
    super(message);
    this.name = "ClaudeTurnError";
    this.code = options.code;
    this.status = options.status;
    this.retryAfterMs = options.retryAfterMs;
    this.sideEffectsStarted = options.sideEffectsStarted === true;
  }

  get contextWindowExceeded(): boolean {
    return this.code === "model_context_window_exceeded";
  }
}

function cancelled(): Error {
  return Object.assign(new Error("Claude turn cancelled"), {
    name: "AbortError",
  });
}

function retryAfterMs(headers: Headers | undefined): number | undefined {
  const raw = headers?.get("retry-after");
  if (!raw) return undefined;
  const seconds = Number.parseFloat(raw);
  return Number.isFinite(seconds) && seconds >= 0
    ? Math.round(seconds * 1_000)
    : undefined;
}

function apiError(
  status: number,
  body: unknown,
  headers?: Headers,
): ClaudeTurnError {
  const envelope = record(body);
  const error = record(envelope.error);
  const code = stringValue(error.type) || `http_${status}`;
  const message =
    stringValue(error.message) || `Anthropic request failed with ${status}`;
  return new ClaudeTurnError(safeText(`${code}: ${message}`), {
    code,
    status,
    retryAfterMs: retryAfterMs(headers),
  });
}

type ClaudeAssistantTurn = {
  id: string;
  model: string;
  /** Verbatim assistant content, echoed back on the next request unmodified. */
  content: JsonRecord[];
  text: string;
  toolCalls: AgentToolCall[];
  stopReason: string;
  stopDetails?: JsonRecord;
  usage: JsonRecord;
};

type ResolvedOptions = {
  baseUrl: string;
  anthropicVersion: string;
  fetchImpl: typeof fetch;
  now: () => number;
  auth: { header: "x-api-key" | "authorization"; value: string };
  capabilities?: ClaudeModelCapabilities;
  onResponseHeaders?: (headers: Headers) => void;
};

export type ClaudeMessagesRuntimeOptions = {
  /** Test-only injection. Never persisted and never read from configuration. */
  apiKey?: string;
  /** Name of the environment variable holding the API key. */
  apiKeyEnv?: string;
  /** Name of the environment variable holding a short-lived OAuth token. */
  authTokenEnv?: string;
  baseUrl?: string;
  anthropicVersion?: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
  /** Overrides the static capability table once a live catalog is available. */
  capabilities?: ClaudeModelCapabilities;
  /**
   * Receives the headers of every response, successful or not. Rate-limit
   * headers are the only usage signal an API key exposes.
   */
  onResponseHeaders?: (headers: Headers) => void;
};

class ClaudeMessagesSession implements AgentRuntimeSession {
  private readonly messages: JsonRecord[] = [];
  private messageBytes = 0;
  private turnsSinceReset = 0;
  private closed = false;
  private activeAbort?: AbortController;
  private closeNotified = false;
  private readonly capabilities: ClaudeModelCapabilities;

  constructor(
    private readonly config: AgentRuntimeSessionConfig,
    private readonly options: ResolvedOptions,
    private readonly onClose: () => void,
  ) {
    this.capabilities =
      options.capabilities ?? defaultClaudeModelCapabilities(config.model);
  }

  async runTurn(input: AgentRuntimeTurnInput): Promise<AgentRuntimeTurnResult> {
    if (this.closed) throw new Error("Claude session is closed");
    if (this.activeAbort) {
      throw new Error("Claude session already has an in-flight turn");
    }
    if (input.signal?.aborted) throw cancelled();
    if (
      !this.config.effectiveContextWindowTokens &&
      this.messageBytes >= MAX_CANONICAL_CONTEXT_BYTES
    ) {
      await this.resetContext();
    }

    const startedMs = this.options.now();
    const controller = new AbortController();
    this.activeAbort = controller;
    const abort = () => controller.abort();
    input.signal?.addEventListener("abort", abort, { once: true });
    const timeout = setTimeout(
      () => controller.abort(),
      Math.max(1, input.timeoutMs ?? 15 * 60_000),
    );

    let firstDeltaMs: number | undefined;
    let toolDurationMs = 0;
    let toolCalls = 0;

    const imageContent = await Promise.all(
      (input.images ?? []).map(async (image) => ({
        type: "image",
        source: claudeImageSource(await verifiedImageDataUrl(image)),
      })),
    );
    this.appendMessage({
      role: "user",
      content: [{ type: "text", text: input.text }, ...imageContent],
    });

    const onDelta = (text: string) => {
      firstDeltaMs ??= this.options.now();
      this.config.onActivity?.({ kind: "text_delta", text });
      input.onActivity?.({ kind: "text_delta", text });
    };

    let turn: ClaudeAssistantTurn | undefined;
    let usage: JsonRecord = {};
    const providerDispatchedMs = this.options.now();
    try {
      while (true) {
        if (controller.signal.aborted) throw cancelled();
        turn = await this.createMessage(onDelta, controller.signal);
        usage = mergeClaudeUsage(usage, turn.usage);
        // Echo the assistant content verbatim, including thinking blocks and
        // their signatures. Anthropic rejects modified thinking blocks.
        this.appendMessage({ role: "assistant", content: turn.content });
        this.assertUsableStopReason(turn);
        if (turn.stopReason !== "tool_use") break;
        if (turn.toolCalls.length === 0) break;
        if (!this.config.executeTool) {
          throw new Error(
            `Model requested tools but ${this.config.role} has no tool executor`,
          );
        }
        if (
          toolCalls + turn.toolCalls.length >
          (this.config.maxToolCalls ?? DEFAULT_MAX_TOOL_CALLS)
        ) {
          throw new Error("Claude agent exceeded its tool-call budget");
        }
        const results: ClaudeToolResultInput[] = [];
        for (const call of turn.toolCalls) {
          toolCalls += 1;
          const toolStarted = this.options.now();
          results.push(await this.runTool(call, input, toolStarted));
          toolDurationMs += this.options.now() - toolStarted;
        }
        // Every result from this assistant turn goes back in one user message.
        this.appendMessage(toolResultMessage(results));
      }

      if (!turn) throw new Error("Claude turn produced no response");
      const normalizedUsage = parseClaudeTokenUsage(usage);
      if (normalizedUsage) {
        const contextActivity = {
          kind: "context",
          current: normalizedUsage,
          precision: "provider",
        } as const;
        this.config.onActivity?.(contextActivity);
        input.onActivity?.(contextActivity);
      }
      const completed = {
        kind: "response",
        responseId: turn.id,
        status: "completed",
      } as const;
      this.config.onActivity?.(completed);
      input.onActivity?.(completed);
      this.turnsSinceReset += 1;
      return {
        provider: "anthropic_messages",
        transport: "http",
        responseId: turn.id,
        text: turn.text,
        usage,
        normalizedUsage,
        timing: {
          startedMs,
          providerDispatchedMs,
          firstDeltaMs,
          completedMs: this.options.now(),
          toolDurationMs,
        },
      };
    } catch (error) {
      if (error instanceof ClaudeTurnError) {
        throw new ClaudeTurnError(error.message, {
          code: error.code,
          status: error.status,
          retryAfterMs: error.retryAfterMs,
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
  }

  async resetContext(): Promise<void> {
    if (this.activeAbort) {
      throw new Error("Cannot reset a Claude session during an in-flight turn");
    }
    this.messages.length = 0;
    this.messageBytes = 0;
    this.turnsSinceReset = 0;
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.cancel();
    this.messages.length = 0;
    this.messageBytes = 0;
    this.turnsSinceReset = 0;
    if (!this.closeNotified) {
      this.closeNotified = true;
      this.onClose();
    }
  }

  private async runTool(
    call: AgentToolCall,
    input: AgentRuntimeTurnInput,
    toolStarted: number,
  ): Promise<ClaudeToolResultInput> {
    const descriptor = this.config.describeTool?.(call);
    const requested = {
      kind: "tool",
      name: call.name,
      callId: call.callId,
      status: "requested",
      ...(descriptor ? { descriptor } : {}),
    } as const;
    this.config.onActivity?.(requested);
    input.onActivity?.(requested);
    try {
      const result = await this.config.executeTool!(call);
      const completed = {
        kind: "tool",
        name: call.name,
        callId: call.callId,
        status: result.isError ? "failed" : "completed",
        durationMs: this.options.now() - toolStarted,
        ...(descriptor ? { descriptor } : {}),
      } as const;
      this.config.onActivity?.(completed);
      input.onActivity?.(completed);
      return {
        callId: call.callId,
        output: result.output,
        isError: result.isError,
        images: result.images as readonly AgentInlineImage[] | undefined,
      };
    } catch (error) {
      const failed = {
        kind: "tool",
        name: call.name,
        callId: call.callId,
        status: "failed",
        durationMs: this.options.now() - toolStarted,
        ...(descriptor ? { descriptor } : {}),
      } as const;
      this.config.onActivity?.(failed);
      input.onActivity?.(failed);
      return {
        callId: call.callId,
        output: JSON.stringify({
          error: error instanceof Error ? error.message : String(error),
        }),
        isError: true,
      };
    }
  }

  private assertUsableStopReason(turn: ClaudeAssistantTurn): void {
    switch (turn.stopReason) {
      case "":
      case "end_turn":
      case "tool_use":
      case "stop_sequence":
        return;
      case "refusal": {
        const category = stringValue(turn.stopDetails?.category) || "unknown";
        throw new ClaudeTurnError(
          `Anthropic declined this request (${category})`,
          { code: `refusal:${category}` },
        );
      }
      case "max_tokens":
        throw new ClaudeTurnError(
          "Claude turn hit max_tokens before completing its answer",
          { code: "max_tokens" },
        );
      case "model_context_window_exceeded":
        throw new ClaudeTurnError("Claude turn exceeded the context window", {
          code: "model_context_window_exceeded",
        });
      default:
        throw new ClaudeTurnError(
          `Claude turn stopped unexpectedly (${turn.stopReason})`,
          { code: turn.stopReason },
        );
    }
  }

  private appendMessage(message: JsonRecord): void {
    this.messages.push(message);
    this.messageBytes += Buffer.byteLength(JSON.stringify(message));
  }

  private onToolWarning(warning: ClaudeToolWarning): void {
    const activity = {
      kind: "tool",
      name: warning.toolName,
      callId: `schema:${warning.toolName}`,
      status: "failed",
      descriptor: {
        action: "inspect",
        toolName: warning.toolName,
        detail:
          warning.reason === "schema_not_strict"
            ? "sent without strict validation: schema is missing additionalProperties:false or required"
            : "sent without strict validation: model does not support structured outputs",
      },
    } as const;
    this.config.onActivity?.(activity);
  }

  private baseRequest(): JsonRecord {
    const outputConfig: JsonRecord = {};
    if (this.capabilities.effort) {
      outputConfig.effort = claudeEffort(this.config.effort);
    }
    if (this.config.outputSchema && this.capabilities.structuredOutputs) {
      outputConfig.format = {
        type: "json_schema",
        schema: this.config.outputSchema,
      };
    }
    const tools = claudeTools(this.config.tools, {
      structuredOutputs: this.capabilities.structuredOutputs,
      onWarning: (warning) => this.onToolWarning(warning),
    });
    // A cache breakpoint is only useful when the caller signalled that this
    // prefix repeats. Anthropic caches by prefix match, so the key itself is
    // never sent — it only decides whether breakpoints are placed at all.
    const cacheable = Boolean(this.config.promptCacheKey);
    if (cacheable && tools.length > 0) {
      tools[tools.length - 1] = {
        ...tools[tools.length - 1]!,
        cache_control: { type: "ephemeral" },
      };
    }
    return {
      model: this.config.model,
      max_tokens: this.config.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
      system: [
        {
          type: "text",
          text: this.config.instructions,
          ...(cacheable ? { cache_control: { type: "ephemeral" } } : {}),
        },
      ],
      ...(tools.length > 0
        ? {
            tools,
            tool_choice: { type: "auto", disable_parallel_tool_use: true },
          }
        : {}),
      ...(this.capabilities.adaptiveThinking
        ? { thinking: { type: "adaptive", display: "summarized" } }
        : {}),
      ...(Object.keys(outputConfig).length > 0
        ? { output_config: outputConfig }
        : {}),
      stream: true,
    };
  }

  private async createMessage(
    onDelta: (text: string) => void,
    signal: AbortSignal,
  ): Promise<ClaudeAssistantTurn> {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      "anthropic-version": this.options.anthropicVersion,
      accept: "text/event-stream",
    };
    if (this.options.auth.header === "x-api-key") {
      headers["x-api-key"] = this.options.auth.value;
    } else {
      headers.authorization = `Bearer ${this.options.auth.value}`;
      headers["anthropic-beta"] = OAUTH_BETA_HEADER;
    }
    const response = await this.options.fetchImpl(
      `${this.options.baseUrl}/v1/messages`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          ...this.baseRequest(),
          messages: this.messages,
        }),
        signal,
      },
    );
    this.options.onResponseHeaders?.(response.headers);
    if (!response.ok) {
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        body = {};
      }
      throw apiError(response.status, body, response.headers);
    }
    return this.readStream(response, onDelta, signal);
  }

  private async readStream(
    response: Response,
    onDelta: (text: string) => void,
    signal: AbortSignal,
  ): Promise<ClaudeAssistantTurn> {
    const body = response.body;
    if (!body) throw new ClaudeTurnError("Anthropic returned an empty stream");
    const decoder = new ClaudeSseDecoder();
    const reader = body.getReader();
    const turn: ClaudeAssistantTurn = {
      id: "",
      model: "",
      content: [],
      text: "",
      toolCalls: [],
      stopReason: "",
      usage: {},
    };
    const jsonParts = new Map<number, string[]>();
    let done = false;

    const apply = (events: ReturnType<ClaudeSseDecoder["push"]>) => {
      for (const event of events) {
        switch (event.kind) {
          case "message_start":
            turn.id = event.id;
            turn.model = event.model;
            turn.usage = mergeClaudeUsage(turn.usage, event.usage);
            break;
          case "block_start":
            turn.content[event.index] = { ...event.block };
            if (event.block.type === "tool_use") jsonParts.set(event.index, []);
            break;
          case "text_delta": {
            const block = turn.content[event.index];
            if (block) block.text = stringValue(block.text) + event.text;
            turn.text += event.text;
            onDelta(event.text);
            break;
          }
          case "thinking_delta": {
            // Kept on the echoed block for replay, never surfaced as output
            // text: appending it would corrupt schema-constrained turns.
            const block = turn.content[event.index];
            if (block) block.thinking = stringValue(block.thinking) + event.text;
            break;
          }
          case "signature_delta": {
            const block = turn.content[event.index];
            if (block) {
              block.signature = stringValue(block.signature) + event.signature;
            }
            break;
          }
          case "input_json_delta":
            jsonParts.get(event.index)?.push(event.partial);
            break;
          case "block_stop": {
            const parts = jsonParts.get(event.index);
            const block = turn.content[event.index];
            if (parts && block) {
              const raw = parts.join("");
              let parsed: unknown;
              try {
                parsed = raw ? (JSON.parse(raw) as unknown) : {};
              } catch {
                parsed = { _invalidJson: raw };
              }
              block.input = parsed;
              turn.toolCalls.push({
                callId: stringValue(block.id),
                name: stringValue(block.name),
                arguments: parsed,
              });
            }
            break;
          }
          case "message_delta":
            turn.stopReason = event.stopReason;
            if (event.stopDetails) turn.stopDetails = event.stopDetails;
            turn.usage = mergeClaudeUsage(turn.usage, event.usage);
            break;
          case "message_stop":
            done = true;
            break;
          case "error":
            throw apiError(response.status, { error: event.error });
        }
      }
    };

    try {
      while (!done) {
        if (signal.aborted) throw cancelled();
        const chunk = await reader.read();
        if (chunk.done) break;
        apply(decoder.push(chunk.value));
      }
      apply(decoder.flush());
    } finally {
      await reader.cancel().catch(() => undefined);
    }
    turn.content = turn.content.filter(
      (block): block is JsonRecord => block !== undefined,
    );
    return turn;
  }
}

export class ClaudeMessagesRuntime implements AgentRuntime {
  private readonly sessions = new Set<ClaudeMessagesSession>();
  private readonly options: ResolvedOptions;

  constructor(options: ClaudeMessagesRuntimeOptions = {}) {
    const apiKeyEnv = options.apiKeyEnv ?? "ANTHROPIC_API_KEY";
    const authTokenEnv = options.authTokenEnv ?? "ANTHROPIC_AUTH_TOKEN";
    const apiKey = options.apiKey ?? process.env[apiKeyEnv];
    const authToken = options.apiKey ? undefined : process.env[authTokenEnv];
    // The API rejects a request that carries both credentials. Failing here
    // turns an opaque 401 into an actionable configuration error.
    if (apiKey && authToken) {
      throw new Error(
        `Set only one of ${apiKeyEnv} or ${authTokenEnv}; the Anthropic API rejects requests carrying both`,
      );
    }
    if (!apiKey && !authToken) {
      throw new Error(`Anthropic API key is unavailable in ${apiKeyEnv}`);
    }
    this.options = {
      // `ANTHROPIC_BASE_URL` is Anthropic's own override, used for gateways
      // and proxies. Honouring it keeps this route consistent with the CLI
      // route, whose child environment already allows the variable through.
      baseUrl: (
        options.baseUrl ??
        process.env.ANTHROPIC_BASE_URL ??
        DEFAULT_BASE_URL
      ).replace(/\/+$/, ""),
      anthropicVersion: options.anthropicVersion ?? DEFAULT_ANTHROPIC_VERSION,
      fetchImpl: options.fetchImpl ?? fetch,
      now: options.now ?? (() => performance.now()),
      auth: apiKey
        ? { header: "x-api-key", value: apiKey }
        : { header: "authorization", value: authToken! },
      ...(options.capabilities ? { capabilities: options.capabilities } : {}),
      ...(options.onResponseHeaders
        ? { onResponseHeaders: options.onResponseHeaders }
        : {}),
    };
  }

  async startSession(
    config: AgentRuntimeSessionConfig,
  ): Promise<AgentRuntimeSession> {
    if (config.imageGeneration?.enabled) {
      throw new ClaudeTurnError(
        "The Anthropic Messages API cannot generate images",
        { code: "image_generation_unsupported" },
      );
    }
    let session!: ClaudeMessagesSession;
    session = new ClaudeMessagesSession(config, this.options, () =>
      this.sessions.delete(session),
    );
    this.sessions.add(session);
    const ready = { kind: "connection", status: "ready" } as const;
    config.onActivity?.(ready);
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

export type { AgentContextTokenBreakdown };
export { claudeImageBlock };
