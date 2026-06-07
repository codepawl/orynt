import { Product } from "@codepawl/shared";

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
}

/**
 * Defines a LangGraph node signature.
 */
export type AgentNode = (state: AgentState) => Promise<Partial<AgentState>>;

/**
 * Defines a LangGraph conditional edge routing function.
 */
export type AgentEdgeRouter = (state: AgentState) => string | Promise<string>;
