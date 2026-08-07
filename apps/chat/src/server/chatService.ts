import { randomUUID } from "node:crypto";
import {
  createAgentApplicationSession,
  type AgentApplicationSession,
} from "@codepawl/agent-runtime";
import {
  ResponsesAgentRuntime,
  type AgentRuntime,
  type AgentRuntimeActivity,
  type AgentRuntimeSession,
} from "@codepawl/model-runtime";
import type { ChatEvent, SafeToolActivity, StoredMessage } from "../protocol";

type Subscriber = (event: ChatEvent) => void;
type RecordState = {
  id: string;
  app: AgentApplicationSession<string>;
  runtime: AgentRuntime;
  model?: AgentRuntimeSession;
  listeners: Set<Subscriber>;
  history: StoredMessage[];
  activeRunId?: string;
  retired: Set<string>;
  closed: boolean;
};
const SECRET = /(?:sk-[a-z0-9_-]{8,}|bearer\s+[a-z0-9._~+/-]+=*)/giu;
export function redactSafeText(value: unknown, fallback: string): string {
  if (typeof value !== "string" || !value.trim()) return fallback;
  return value.trim().replace(SECRET, "[REDACTED]").slice(0, 2000);
}
function safeTool(
  activity: Extract<AgentRuntimeActivity, { kind: "tool" }>,
): SafeToolActivity {
  const name = redactSafeText(activity.name, "Orynt tool");
  return {
    id: activity.callId,
    name,
    state: activity.status,
    summary: `${name} ${activity.status}`,
  };
}

export class OryntChatService {
  private readonly sessions = new Map<string, RecordState>();
  constructor(
    private readonly runtimeFactory: () => AgentRuntime = () =>
      new ResponsesAgentRuntime({ apiKeyEnv: "ORYNT_CHAT_MODEL_API_KEY" }),
  ) {}

  createSession(): { sessionId: string; history: StoredMessage[] } {
    const sessionId = `chat-${randomUUID()}`;
    const runtime = this.runtimeFactory();
    let record!: RecordState;
    const app = createAgentApplicationSession<string>({
      sessionId,
      driver: {
        dispatch: async ({ command, signal }) => {
          if (command.type !== "submit_message")
            return { status: "failed", summary: "Unsupported chat command." };
          record.model ??= await runtime.startSession({
            sessionId,
            role: "helper",
            model: process.env.ORYNT_CHAT_MODEL ?? "gpt-5.1",
            effort: "medium",
            instructions:
              "You are Orynt. Help clearly and concisely. Never expose hidden reasoning, credentials, environment variables, or provider payloads.",
            tools: [
              {
                type: "function",
                name: "orynt_runtime_status",
                description:
                  "Check whether the local Orynt chat runtime is ready.",
                strict: true,
                parameters: {
                  type: "object",
                  additionalProperties: false,
                  required: [],
                  properties: {},
                },
              },
            ],
            executeTool: async (call) =>
              call.name === "orynt_runtime_status"
                ? { output: JSON.stringify({ status: "ready" }) }
                : {
                    output: JSON.stringify({ error: "Unknown tool" }),
                    isError: true,
                  },
            maxToolCalls: 32,
          });
          const runId = record.activeRunId!;
          try {
            const result = await record.model.runTurn({
              text: command.message,
              signal,
              onActivity: (activity) => this.activity(record, runId, activity),
            });
            if (record.retired.has(runId))
              return { status: "cancelled", summary: "Turn cancelled." };
            const text = redactSafeText(
              result.text,
              "Orynt completed without a text response.",
            );
            record.history.push({
              id: `${runId}-assistant`,
              role: "assistant",
              text,
            });
            return {
              status: "completed",
              summary: "Turn completed.",
              value: text,
            };
          } catch (error) {
            const cancelled =
              signal.aborted ||
              (error instanceof Error && error.name === "AbortError");
            return {
              status: cancelled ? "cancelled" : "failed",
              summary: cancelled
                ? "Turn cancelled."
                : redactSafeText(
                    error instanceof Error ? error.message : error,
                    "Orynt turn failed.",
                  ),
            };
          }
        },
        close: async () => {
          await record.model?.close();
          await runtime.close();
        },
      },
    });
    record = {
      id: sessionId,
      app,
      runtime,
      listeners: new Set(),
      history: [],
      retired: new Set(),
      closed: false,
    };
    app.subscribe((event) => {
      const runId = record.activeRunId;
      if (!runId || record.retired.has(runId)) return;
      if (event.type === "turn_completed")
        this.emit(record, { type: "completed", sessionId, runId });
      else if (event.type === "turn_cancelled")
        this.emit(record, { type: "cancelled", sessionId, runId });
      else if (event.type === "turn_failed")
        this.emit(record, {
          type: "failed",
          sessionId,
          runId,
          message: redactSafeText(event.summary, "Orynt turn failed."),
        });
    });
    this.sessions.set(sessionId, record);
    return { sessionId, history: [] };
  }
  subscribe(sessionId: string, listener: Subscriber): () => void {
    const record = this.require(sessionId);
    record.listeners.add(listener);
    return () => record.listeners.delete(listener);
  }
  async submit(sessionId: string, text: string): Promise<string> {
    const record = this.require(sessionId);
    if (record.activeRunId) throw new Error("A turn is already running.");
    const runId = `run-${randomUUID()}`;
    record.activeRunId = runId;
    record.history.push({ id: `${runId}-user`, role: "user", text });
    this.emit(record, { type: "run_started", sessionId, runId });
    void record.app
      .dispatch({
        schemaVersion: 1,
        sessionId,
        expectedRevision: record.app.snapshot().revision,
        type: "submit_message",
        message: text,
        acceptanceCriteria: [],
        selectedSkillIds: [],
      })
      .finally(() => {
        if (record.activeRunId === runId) record.activeRunId = undefined;
      });
    return runId;
  }
  cancel(sessionId: string, runId: string): void {
    const record = this.require(sessionId);
    if (record.activeRunId !== runId || record.retired.has(runId)) return;
    record.retired.add(runId);
    record.app.cancelActive();
    record.model?.cancel();
    record.activeRunId = undefined;
    this.emit(record, { type: "cancelled", sessionId, runId });
  }
  async closeSession(sessionId: string): Promise<void> {
    const record = this.sessions.get(sessionId);
    if (!record) return;
    if (record.activeRunId) this.cancel(sessionId, record.activeRunId);
    record.closed = true;
    record.listeners.clear();
    this.sessions.delete(sessionId);
    await record.app.close();
  }
  history(sessionId: string): StoredMessage[] {
    return structuredClone(this.require(sessionId).history);
  }
  listenerCount(sessionId: string): number {
    return this.require(sessionId).listeners.size;
  }
  private activity(
    record: RecordState,
    runId: string,
    activity: AgentRuntimeActivity,
  ): void {
    if (record.retired.has(runId) || record.activeRunId !== runId) return;
    if (activity.kind === "text_delta")
      this.emit(record, {
        type: "text_delta",
        sessionId: record.id,
        runId,
        text: redactSafeText(activity.text, ""),
      });
    else if (activity.kind === "tool")
      this.emit(record, {
        type: "tool",
        sessionId: record.id,
        runId,
        tool: safeTool(activity),
      });
  }
  private emit(record: RecordState, event: ChatEvent): void {
    if (!record.closed)
      for (const listener of record.listeners) listener(structuredClone(event));
  }
  private require(id: string): RecordState {
    const record = this.sessions.get(id);
    if (!record || record.closed)
      throw new Error("Chat session was not found.");
    return record;
  }
}
