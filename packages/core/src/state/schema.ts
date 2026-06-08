import { Product } from "@codepawl/shared";

import type { TraceSummary } from "../ledger/trace";

/**
 * Represents a chat message payload within the agent state.
 */
export interface AgentMessage {
  readonly id: string;
  readonly role: "user" | "assistant" | "system" | "tool";
  readonly content: string;
  readonly name?: string;
  readonly timestamp: string;
}

/**
 * Represents an execution step within the agent.
 */
export interface AgentStep {
  readonly id: string;
  readonly nodeName: string;
  readonly action: string;
  readonly input: unknown;
  readonly output: unknown;
  readonly durationMs: number;
  readonly timestamp: string;
}

/**
 * Represents metadata about the execution context.
 */
export interface AgentContext {
  readonly userId?: string;
  readonly sessionId: string;
  readonly targetProduct?: Product;
  readonly maxIterations: number;
  readonly temperature: number;
  readonly workspaceDir: string;
  readonly outputDir: string;
  readonly dryRun: boolean;
  readonly testCommand?: string;
  readonly mockFixturePath?: string;
  readonly providerName?: string;
  readonly modelName?: string;
  readonly includePromptMetadata?: boolean;
  readonly scopeAnalysisMaxTokens?: number;
  readonly patchPlanMaxTokens?: number;
}

/**
 * The core state schema for LangGraph agent orchestration.
 */
export interface AgentState {
  // Input query and messages history
  readonly query: string;
  readonly messages: ReadonlyArray<AgentMessage>;
  
  // Execution logs
  readonly steps: ReadonlyArray<AgentStep>;
  
  // Context configuration
  readonly context: AgentContext;
  
  // Router variables
  readonly nextNode: string | null;
  readonly isComplete: boolean;
  
  // Error state if any execution failed
  readonly error: string | null;

  // Milestone 1 Node Results
  readonly repoScanResult?: RepoScanResult;
  readonly scopeAnalysisResult?: ScopeAnalysisResult;
  readonly fileSelectionResult?: FileSelectionResult;
  readonly patchPlan?: PatchPlan;
  readonly validationResult?: ValidationResult;
  readonly reportResult?: ReportResult;
}

/**
 * Defines a LangGraph node signature.
 */
export type AgentNode = (state: AgentState) => Promise<Partial<AgentState>>;

/**
 * Defines a LangGraph conditional edge routing function.
 */
export type AgentEdgeRouter = (state: AgentState) => string | Promise<string>;

export interface RunOptions {
  readonly query: string;
  readonly workspaceDir: string;
  readonly outDir?: string;
  readonly dryRun: boolean;
  readonly maxIterations?: number;
  readonly temperature?: number;
  readonly targetProduct?: Product;
  readonly testCommand?: string;
  readonly mockFixturePath?: string;
  readonly provider?: string;
  readonly model?: string;
  readonly apiKey?: string;
  readonly baseUrl?: string;
  readonly includePromptMetadata?: boolean;
  readonly maxTokens?: number;
  readonly scopeAnalysisMaxTokens?: number;
  readonly patchPlanMaxTokens?: number;
}

export interface RunResult {
  readonly runId: string;
  readonly success: boolean;
  readonly error: string | null;
  readonly state: AgentState;
  readonly traceSummary: TraceSummary;
  readonly reportPath?: string;
  readonly tracePath?: string;
}

export interface RepoScanResult {
  readonly rootDir: string;
  readonly files: ReadonlyArray<{
    readonly path: string;
    readonly sizeBytes: number;
    readonly isDir: boolean;
  }>;
  readonly detectedLanguages: ReadonlyArray<string>;
  readonly packageConfigs: ReadonlyArray<{
    readonly type: "npm" | "pip" | "cargo" | "other";
    readonly path: string;
  }>;
}

export interface ScopeAnalysisResult {
  readonly rationale: string;
  readonly affectedModules: ReadonlyArray<string>;
  readonly proposedFilesToModify: ReadonlyArray<string>;
  readonly proposedFilesToCreate: ReadonlyArray<string>;
}

export interface FileSelectionResult {
  readonly selectedFiles: ReadonlyArray<{
    readonly path: string;
    readonly reason: string;
    readonly content: string;
  }>;
}

export interface PatchChunk {
  readonly type: "create" | "modify" | "delete";
  readonly file: string;
  readonly description: string;
}

export interface PatchPlan {
  readonly chunks: ReadonlyArray<PatchChunk>;
  readonly rationale: string;
}

export interface ValidationResult {
  readonly success: boolean;
  readonly commandsRun: ReadonlyArray<{
    readonly command: string;
    readonly stdout: string;
    readonly stderr: string;
    readonly exitCode: number;
    readonly durationMs: number;
  }>;
  readonly errors: ReadonlyArray<string>;
}

export interface ReportResult {
  readonly summary: string;
  readonly filesModified: ReadonlyArray<string>;
  readonly patchApplied: boolean;
  readonly validationSuccess: boolean;
  readonly durationMs: number;
  readonly tokenUsage: {
    readonly input: number;
    readonly output: number;
    readonly total: number;
  };
}
