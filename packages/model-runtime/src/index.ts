export * from "./repositoryTools.js";
export * from "./responsesRuntime.js";
export * from "./imageInputs.js";
export * from "./providerUsage.js";

export type AgentRuntimeProvider =
  | "openai_responses"
  | "codex_app_server"
  | "legacy_codex_exec"
  | "anthropic_messages"
  | "claude_cli";

export type AgentRuntimeTransport =
  | "websocket"
  | "http"
  | "app_server"
  | "stdio";

export type AgentToolAction =
  | "read"
  | "list"
  | "search"
  | "run"
  | "edit"
  | "diff"
  | "web"
  | "mcp"
  | "inspect"
  | "other";

export type AgentToolActivityDescriptor = {
  action: AgentToolAction;
  toolName: string;
  detail: string;
};

export type AgentRuntimeActivity =
  | { kind: "connection"; status: "connecting" | "ready" | "reconnecting" }
  | { kind: "text_delta"; text: string }
  | {
      kind: "tool";
      name: string;
      callId: string;
      status: "requested" | "completed" | "failed";
      descriptor?: AgentToolActivityDescriptor;
      durationMs?: number;
    }
  | {
      kind: "context";
      current: AgentContextTokenBreakdown;
      precision: "provider";
    }
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
  images?: AgentInlineImage[];
};

export type AgentImageDetail = "low" | "high" | "original";

export type AgentInlineImage = {
  dataUrl: string;
  detail: AgentImageDetail;
  source: "browser_crop";
};

export type AgentImageInput = {
  kind: "local_file";
  path: string;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  sha256: string;
  byteLength: number;
  detail: AgentImageDetail;
  source: "browser_crop" | "repository_asset" | "user_attachment";
};

export type AgentGeneratedImage = {
  providerItemId: string;
  revisedPrompt?: string;
  savedPath?: string;
  base64?: string;
  status: "completed" | "failed";
};

export type AgentRuntimeSessionConfig = {
  sessionId: string;
  role: "coordinator" | "helper" | "reviewer" | "implementer";
  model: string;
  effort: "minimal" | "none" | "low" | "medium" | "high" | "xhigh";
  instructions: string;
  tools?: AgentFunctionTool[];
  imageGeneration?: {
    enabled: true;
    maxOutputs: 1 | 2 | 3 | 4;
    format?: "png" | "webp" | "jpeg";
  };
  outputSchema?: Record<string, unknown>;
  maxOutputTokens?: number;
  maxToolCalls?: number;
  promptCacheKey?: string;
  effectiveContextWindowTokens?: number;
  onActivity?: (activity: AgentRuntimeActivity) => void;
  executeTool?: (call: AgentToolCall) => Promise<AgentToolResult>;
  describeTool?: (
    call: AgentToolCall,
  ) => AgentToolActivityDescriptor | undefined;
};

export type AgentRuntimeTurnInput = {
  text: string;
  images?: AgentImageInput[];
  signal?: AbortSignal;
  timeoutMs?: number;
  onActivity?: (activity: AgentRuntimeActivity) => void;
};

export type AgentRuntimeTurnResult = {
  provider: AgentRuntimeProvider;
  transport: AgentRuntimeTransport;
  responseId: string;
  text: string;
  generatedImages?: AgentGeneratedImage[];
  usage?: Record<string, unknown>;
  normalizedUsage?: AgentContextTokenBreakdown;
  timing: AgentRuntimeTiming;
};

export type AgentContextTokenBreakdown = {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
  totalTokens: number;
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

export interface AgentToolExecutor {
  tools(): AgentFunctionTool[];
  execute(call: AgentToolCall): Promise<AgentToolResult>;
  describe?(call: AgentToolCall): AgentToolActivityDescriptor | undefined;
}

export class CompositeAgentToolExecutor implements AgentToolExecutor {
  private readonly toolsByName = new Map<
    string,
    { tool: AgentFunctionTool; executor: AgentToolExecutor }
  >();

  constructor(executors: AgentToolExecutor[]) {
    for (const executor of executors) {
      for (const tool of executor.tools()) {
        if (this.toolsByName.has(tool.name)) {
          throw new Error(`duplicate agent tool: ${tool.name}`);
        }
        this.toolsByName.set(tool.name, { tool, executor });
      }
    }
  }

  tools(): AgentFunctionTool[] {
    return [...this.toolsByName.values()].map(({ tool }) => tool);
  }

  async execute(call: AgentToolCall): Promise<AgentToolResult> {
    const binding = this.toolsByName.get(call.name);
    if (!binding) {
      return {
        output: JSON.stringify({ error: `unknown tool: ${call.name}` }),
        isError: true,
      };
    }
    return binding.executor.execute(call);
  }

  describe(call: AgentToolCall): AgentToolActivityDescriptor | undefined {
    return this.toolsByName.get(call.name)?.executor.describe?.(call);
  }
}
