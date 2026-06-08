import { AgentStep, AgentMessage } from "../state/schema";

export type TraceSeverity = "info" | "warning" | "error";

export interface TraceEvent {
  readonly id: string;
  readonly traceId: string;
  readonly parentId?: string;
  readonly type: "node_start" | "node_end" | "llm_call" | "tool_call" | "tool_response" | "system";
  readonly name: string;
  readonly severity: TraceSeverity;
  readonly timestamp: string;
  readonly payload: unknown;
}

export interface TraceSummary {
  readonly traceId: string;
  readonly totalDurationMs: number;
  readonly stepCount: number;
  readonly llmCallsCount: number;
  readonly tokenUsage: {
    readonly input: number;
    readonly output: number;
    readonly total: number;
  };
  readonly events: ReadonlyArray<TraceEvent>;
  readonly steps: ReadonlyArray<AgentStep>;
}

function redactTraceString(value: string): string {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
    .replace(/sk-[A-Za-z0-9_-]{12,}/g, "sk-[REDACTED]")
    .replace(/[A-Za-z0-9_-]{32,}/g, "[REDACTED_TOKEN]");
}

function summarizeMessage(message: AgentMessage): Record<string, unknown> {
  return {
    id: message.id,
    role: message.role,
    name: message.name,
    timestamp: message.timestamp,
    contentLength: message.content.length,
  };
}

function sanitizeTraceValue(value: unknown, key?: string): unknown {
  if (typeof value === "string") {
    if (key === "content") {
      return { omitted: "content", length: value.length };
    }
    return redactTraceString(value);
  }

  if (Array.isArray(value)) {
    if (key === "messages") {
      return value.map((item) => {
        if (
          typeof item === "object" &&
          item !== null &&
          "role" in item &&
          "content" in item &&
          typeof (item as { content?: unknown }).content === "string"
        ) {
          return summarizeMessage(item as AgentMessage);
        }
        return sanitizeTraceValue(item);
      });
    }
    return value.map((item) => sanitizeTraceValue(item));
  }

  if (typeof value === "object" && value !== null) {
    const sanitized: Record<string, unknown> = {};
    for (const [entryKey, entryValue] of Object.entries(value)) {
      sanitized[entryKey] = sanitizeTraceValue(entryValue, entryKey);
    }
    return sanitized;
  }

  return value;
}

/**
 * Ledger implementation to record, trace and audit agent runs.
 */
export class TraceLedger {
  private readonly traceId: string;
  private readonly events: TraceEvent[] = [];
  private readonly steps: AgentStep[] = [];
  private startTime: number = 0;
  private endTime: number = 0;
  private inputTokens: number = 0;
  private outputTokens: number = 0;

  constructor(traceId: string) {
    this.traceId = traceId;
  }

  public getTraceId(): string {
    return this.traceId;
  }

  public start(): void {
    this.startTime = Date.now();
    this.recordEvent("system", "trace_start", "info", { startTime: this.startTime });
  }

  public end(): void {
    this.endTime = Date.now();
    this.recordEvent("system", "trace_end", "info", { endTime: this.endTime });
  }

  public recordEvent(
    type: TraceEvent["type"],
    name: string,
    severity: TraceSeverity = "info",
    payload?: unknown,
    parentId?: string
  ): TraceEvent {
    const event: TraceEvent = {
      id: crypto.randomUUID(),
      traceId: this.traceId,
      parentId,
      type,
      name,
      severity,
      timestamp: new Date().toISOString(),
      payload: sanitizeTraceValue(payload ?? null),
    };
    this.events.push(event);
    return event;
  }

  public addStep(step: AgentStep): void {
    const sanitizedStep: AgentStep = {
      ...step,
      input: sanitizeTraceValue(step.input),
      output: sanitizeTraceValue(step.output),
    };
    this.steps.push(sanitizedStep);
    this.recordEvent("node_end", step.nodeName, "info", {
      action: step.action,
      durationMs: step.durationMs,
      output: sanitizedStep.output,
    });
  }

  public addTokenUsage(input: number, output: number): void {
    this.inputTokens += input;
    this.outputTokens += output;
  }

  public getSummary(): TraceSummary {
    const totalDurationMs = this.endTime > 0 
      ? this.endTime - this.startTime 
      : Date.now() - this.startTime;

    return {
      traceId: this.traceId,
      totalDurationMs,
      stepCount: this.steps.length,
      llmCallsCount: this.events.filter(e => e.type === "llm_call").length,
      tokenUsage: {
        input: this.inputTokens,
        output: this.outputTokens,
        total: this.inputTokens + this.outputTokens,
      },
      events: [...this.events],
      steps: [...this.steps],
    };
  }

  public formatLog(): string {
    const summary = this.getSummary();
    let log = `=== Trace Ledger ${summary.traceId} ===\n`;
    log += `Duration: ${summary.totalDurationMs}ms | Steps: ${summary.stepCount} | LLM Calls: ${summary.llmCallsCount}\n`;
    log += `Tokens: Input: ${summary.tokenUsage.input} / Output: ${summary.tokenUsage.output} (Total: ${summary.tokenUsage.total})\n`;
    log += `--------------------------------------\n`;
    for (const event of summary.events) {
      log += `[${event.timestamp}] [${event.type.toUpperCase()}] ${event.name} (${event.severity.toUpperCase()})\n`;
      if (event.payload) {
        log += `  Payload: ${JSON.stringify(event.payload)}\n`;
      }
    }
    return log;
  }
}
