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
  readonly contextMaxFiles?: number;
  readonly contextMaxBytes?: number;
  readonly contextMaxChars?: number;
  readonly structuredOutputMode?: "json_schema" | "json_object";
}

export interface ContextPackBudget {
  readonly maxFiles: number;
  readonly maxBytes: number;
  readonly maxChars: number;
}

export interface ContextPackTestHints {
  readonly commands: ReadonlyArray<string>;
  readonly defaultFallback: string;
}

export interface ContextPackFileSummary {
  readonly path: string;
  readonly sizeBytes: number;
  readonly language: string;
  readonly reason: string;
  readonly excerpt: string;
  readonly isExcerptTruncated: boolean;
}

export interface ContextPackMetrics {
  readonly inputScannedFiles: number;
  readonly candidateFiles: number;
  readonly includedFiles: number;
  readonly omittedFiles: number;
  readonly scannedBytes: number;
  readonly includedBytes: number;
  readonly omittedBytes: number;
  readonly estimatedContextChars: number;
  readonly compactionReason: string;
}

export type ReadinessGateStatus =
  | "ready"
  | "needs_clarification"
  | "unsafe"
  | "unsupported";

export interface ReadinessGateResult {
  readonly status: ReadinessGateStatus;
  readonly reasons: ReadonlyArray<string>;
  readonly blockers: ReadonlyArray<string>;
  readonly warnings: ReadonlyArray<string>;
}

export interface ContextPack {
  readonly taskSummary: string;
  readonly repositoryRoot: string;
  readonly candidateFiles: ReadonlyArray<string>;
  readonly compactFileSummaries: ReadonlyArray<ContextPackFileSummary>;
  readonly packageHints: ReadonlyArray<{ readonly type: string; readonly path: string }>;
  readonly workspaceHints: ReadonlyArray<string>;
  readonly testCommandHints: ReadonlyArray<string>;
  readonly safetyExclusions: ReadonlyArray<string>;
  readonly omittedContextNotes: ReadonlyArray<string>;
  readonly budget: ContextPackBudget;
  readonly metrics: ContextPackMetrics;
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
  readonly contextPack?: ContextPack;
  readonly readinessGateResult?: ReadinessGateResult;
  readonly scopeAnalysisResult?: ScopeAnalysisResult;
  readonly fileSelectionResult?: FileSelectionResult;
  readonly patchPlan?: PatchPlan;
  readonly validationResult?: ValidationResult;
  readonly writeResult?: WriteResult;
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
  readonly contextMaxFiles?: number;
  readonly contextMaxBytes?: number;
  readonly contextMaxChars?: number;
  readonly structuredOutputMode?: "json_schema" | "json_object";
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
  readonly groundingNotes?: ReadonlyArray<string>;
  readonly groundingFallbackUsed?: boolean;
  readonly groundingFallbackFiles?: ReadonlyArray<string>;
  readonly rejectedProposedFilesToModify?: ReadonlyArray<{
    readonly file: string;
    readonly reason: string;
  }>;
  readonly rejectedProposedFilesToCreate?: ReadonlyArray<{
    readonly file: string;
    readonly reason: string;
  }>;
}

export interface WriteChunkFileResult {
  readonly file: string;
  readonly reason: string;
}

export interface WriteResult {
  readonly attempted: number;
  readonly created: ReadonlyArray<string>;
  readonly skipped: ReadonlyArray<WriteChunkFileResult>;
  readonly rejected: ReadonlyArray<WriteChunkFileResult>;
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
  readonly groundingNotes?: ReadonlyArray<string>;
  readonly rejectedChunks?: ReadonlyArray<{
    readonly index: number;
    readonly file: string;
    readonly reason: string;
  }>;
}

export interface ValidationResult {
  readonly success: boolean;
  readonly validationDecision: {
    readonly source: "explicit" | "inferred" | "placeholder" | "unavailable";
    readonly confidence: number;
    readonly reason: string;
    readonly command: string;
  };
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
  readonly filesCreated: ReadonlyArray<string>;
  readonly filesSkipped: ReadonlyArray<WriteChunkFileResult>;
  readonly filesRejected: ReadonlyArray<WriteChunkFileResult>;
  readonly patchApplied: boolean;
  readonly validationSuccess: boolean;
  readonly durationMs: number;
  readonly tokenUsage: {
    readonly input: number;
    readonly output: number;
    readonly total: number;
  };
  readonly validationDecision?: {
    readonly source: "explicit" | "inferred" | "placeholder" | "unavailable";
    readonly confidence: number;
    readonly reason: string;
    readonly command: string;
  };
  readonly readiness?: ReadinessGateResult;
}
