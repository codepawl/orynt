export * from "./repositoryTools.js";
export * from "./responsesRuntime.js";

export type AgentRuntimeProvider =
  | "openai_responses"
  | "codex_app_server"
  | "legacy_codex_exec";

export type AgentRuntimeTransport = "websocket" | "http" | "app_server";

export type AgentRuntimeActivity =
  | { kind: "connection"; status: "connecting" | "ready" | "reconnecting" }
  | { kind: "text_delta"; text: string }
  | { kind: "tool"; name: string; callId: string; status: "requested" | "completed" | "failed" }
  | { kind: "response"; responseId: string; status: "completed" };

export type AgentRuntimeTiming = {
  startedMs: number;
  connectionReadyMs?: number;
  providerDispatchedMs: number;
  firstDeltaMs?: number;
  completedMs: number;
  toolDurationMs: number;
};

export type AgentFunctionTool = {
  type: "function";
  name: string;
  description: string;
  strict: true;
  parameters: Record<string, unknown>;
};

export type AgentToolCall = {
  callId: string;
  name: string;
  arguments: unknown;
};

export type AgentToolResult = {
  output: string;
  isError?: boolean;
};

export type AgentRuntimeSessionConfig = {
  sessionId: string;
  role: "coordinator" | "helper" | "reviewer" | "implementer";
  model: string;
  effort: "minimal" | "none" | "low" | "medium" | "high" | "xhigh";
  instructions: string;
  tools?: AgentFunctionTool[];
  outputSchema?: Record<string, unknown>;
  maxOutputTokens?: number;
  maxToolCalls?: number;
  promptCacheKey?: string;
  onActivity?: (activity: AgentRuntimeActivity) => void;
  executeTool?: (call: AgentToolCall) => Promise<AgentToolResult>;
};

export type AgentRuntimeTurnInput = {
  text: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  onActivity?: (activity: AgentRuntimeActivity) => void;
};

export type AgentRuntimeTurnResult = {
  provider: AgentRuntimeProvider;
  transport: AgentRuntimeTransport;
  responseId: string;
  text: string;
  usage?: Record<string, unknown>;
  timing: AgentRuntimeTiming;
};

export interface AgentRuntimeSession {
  runTurn(input: AgentRuntimeTurnInput): Promise<AgentRuntimeTurnResult>;
  resetContext?(): Promise<void>;
  cancel(): void;
  close(): Promise<void>;
}

export interface AgentRuntime {
  startSession(config: AgentRuntimeSessionConfig): Promise<AgentRuntimeSession>;
  close(): Promise<void>;
}
