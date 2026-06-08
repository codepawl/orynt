# Analysis: Core Agent Engine Design (Milestone 1)

This document presents the detailed design and implementation plan for the **Core Agent Engine** of the `@codepawl/core` package, satisfying the requirements of Milestone 1.

---

## 1. Existing Types & Monorepo Structure

Based on a read-only scan of the codebase, here is the current state of `@codepawl/core`:

### A. state/schema.ts
Defines the core interface schemas for LangGraph orchestration:
- `AgentMessage`: Chat messages history with role (`user` | `assistant` | `system` | `tool`), content, and timestamp.
- `AgentStep`: Logs for each node execution containing `nodeName`, `action`, `input`, `output`, `durationMs`, and `timestamp`.
- `AgentContext`: Context configurations including `sessionId`, `targetProduct`, `maxIterations`, and `temperature`.
- `AgentState`: The accumulated state passed across nodes.
- `AgentNode`: `(state: AgentState) => Promise<Partial<AgentState>>`
- `AgentEdgeRouter`: `(state: AgentState) => string | Promise<string>`

### B. ledger/trace.ts
Audits and traces agent executions using `TraceLedger`:
- `TraceEvent`: Structured log representation with types (`node_start`, `node_end`, `llm_call`, `tool_call`, `tool_response`, `system`).
- `TraceSummary`: Formatted output containing total duration, steps, LLM calls count, token usage, and events.
- `TraceLedger`: Manages and appends events, increments tokens, and formats reports.

### C. memory/index.ts
Encapsulates session state (short-term) and semantic memory (long-term):
- `MemoryDocument`: A record of a memory document containing content, metadata, and optional embeddings.
- `SemanticMemoryStore` / `SessionMemoryStore`: Interfaces for storage engines.
- `MemoryManager`: Orchestrates both stores.
- `LocalSessionMemoryStore` / `LocalSemanticMemoryStore`: Local in-memory implementations.

### D. agent/orchestration.ts
Defines the `StateGraph` which compiles and executes the state machine:
- Manages nodes, direct edges, conditional edges, and executes the active loop using `compileAndRun()`.

---

## 2. Contracts and Interface Designs

We will update and create the following contracts under `packages/core/src/state/schema.ts` (or relevant subfiles, exported via `packages/core/src/index.ts`).

### Updated `AgentState`
We extend the core `AgentState` to store results generated at each stage of the workflow:

```typescript
import { Product } from "@codepawl/shared";

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
```

### New Run Options & Results

```typescript
export interface RunOptions {
  readonly query: string;
  readonly workspaceDir: string;
  readonly dryRun: boolean;
  readonly maxIterations?: number;
  readonly temperature?: number;
  readonly targetProduct?: Product;
  readonly testCommand?: string;
  readonly mockFixturePath?: string; // Optional path for interactive mock LLM
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
```

### Node-Specific Results

```typescript
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
    readonly content: string; // The file content read from disk
  }>;
}

export interface PatchChunk {
  readonly type: "create" | "modify" | "delete";
  readonly path: string;
  readonly content?: string; // new content or replacement content
  readonly targetContent?: string; // exact content to search-and-replace (for modifications)
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
```

---

## 3. Workflow Node Designs

Each node takes the current `AgentState` and returns `Promise<Partial<AgentState>>`.

| Node Name | Inputs | Outputs | Behaviour |
|-----------|--------|---------|-----------|
| **`intake`** | `query`, `messages` | `nextNode = "repo_scan"`, updates messages | Parses target product and task details. Instantiates working context. |
| **`repo_scan`** | `context` | `repoScanResult` | Scans workspace directory, identifies file tree structures, and searches package configurations. |
| **`scope_analysis`** | `query`, `repoScanResult` | `scopeAnalysisResult` | Prompt LLM to analyze query in context of files, selecting modules to inspect/edit. |
| **`file_selection`** | `scopeAnalysisResult` | `fileSelectionResult` | Reads the content of the selected files from disk. |
| **`patch_plan`** | `query`, `fileSelectionResult` | `patchPlan` | Prompts LLM to write precise chunked patch plans (creations, edits, deletions). |
| **`optional_patch_apply`** | `patchPlan`, `context.dryRun` | Modifies disk, logs applied changes | If `dryRun` is false, writes changes to the filesystem. If true, outputs visual diffs. |
| **`validation`**| `context.testCommand` | `validationResult` | Spawns a process (e.g. typescript compile, pytest) and records stdout/stderr/exit codes. |
| **`trace_export`** | `TraceLedger` | Trace output to `.codepawl/runs/` | Formats and saves structured JSON trace and Markdown trace files. |
| **`report_export`** | `AgentState` | `reportResult`, `nextNode = null`, `isComplete = true` | Compiles the run outcomes and writes a summary `report.md` and `run.json`. |

### Workflow Diagram & Routing Logic
```
[intake] -> [repo_scan] -> [scope_analysis] -> [file_selection] -> [patch_plan] -> [optional_patch_apply] -> [validation]
                                                                         ^                                     |
                                                                         |------------ (fail & iter < max) ----|
                                                                                                               |
                                                                                                               v
                                                                                                        [trace_export]
                                                                                                               |
                                                                                                               v
                                                                                                        [report_export] -> [*]
```

- **Validation Router**: If `validationResult.success` is `false` and execution iteration count is under `maxIterations`, the state machine routes back to `patch_plan` (or `scope_analysis`) to perform self-correction, adding compiler/test outputs to `messages`. Otherwise, it proceeds to `trace_export`.

---

## 4. LLM Provider & Mocking System

### A. LlmProvider Interface
Defined in `packages/core/src/providers/llm.ts`:

```typescript
export interface LlmCompletionOptions {
  readonly temperature?: number;
  readonly maxTokens?: number;
  readonly responseFormat?: { type: "json_object" | "text" };
  readonly systemPrompt?: string;
}

export interface LlmCompletionResult {
  readonly content: string;
  readonly usage?: {
    readonly inputTokens: number;
    readonly outputTokens: number;
  };
}

export interface LlmProvider {
  generateCompletion(
    messages: ReadonlyArray<AgentMessage>,
    options?: LlmCompletionOptions
  ): Promise<LlmCompletionResult>;
}
```

### B. MockLlmProvider Implementation
To allow deterministic, offline E2E tests, the `MockLlmProvider` reads completions from a local JSON/YAML file:

```typescript
import * as fs from "fs/promises";
import { AgentMessage } from "../state/schema";
import { LlmProvider, LlmCompletionOptions, LlmCompletionResult } from "./llm";

export interface MockCompletionRule {
  readonly matchQuery?: string;
  readonly matchLastMessage?: string;
  readonly response: {
    readonly content: string;
    readonly usage?: {
      readonly inputTokens: number;
      readonly outputTokens: number;
    };
  };
}

export class MockLlmProvider implements LlmProvider {
  private readonly fixturePath: string;
  private rules: ReadonlyArray<MockCompletionRule> = [];
  private isLoaded: boolean = false;

  constructor(fixturePath: string) {
    this.fixturePath = fixturePath;
  }

  private async loadRules(): Promise<void> {
    if (this.isLoaded) return;
    try {
      const data = await fs.readFile(this.fixturePath, "utf-8");
      this.rules = JSON.parse(data) as ReadonlyArray<MockCompletionRule>;
      this.isLoaded = true;
    } catch (err: any) {
      throw new Error(`Failed to load LLM Mock Fixture from ${this.fixturePath}: ${err.message}`);
    }
  }

  public async generateCompletion(
    messages: ReadonlyArray<AgentMessage>,
    options?: LlmCompletionOptions
  ): Promise<LlmCompletionResult> {
    await this.loadRules();

    const lastMessage = messages[messages.length - 1]?.content ?? "";
    const firstMessage = messages.find(m => m.role === "user")?.content ?? "";

    // Find first matching rule
    for (const rule of this.rules) {
      if (rule.matchQuery && new RegExp(rule.matchQuery).test(firstMessage)) {
        return rule.response;
      }
      if (rule.matchLastMessage && new RegExp(rule.matchLastMessage).test(lastMessage)) {
        return rule.response;
      }
    }

    throw new Error(
      `MockLlmProvider: No mock completion rule matched the prompt history.\n` +
      `Last Message: "${lastMessage}"\n` +
      `First Message: "${firstMessage}"`
    );
  }
}
```

---

## 5. Implementation Plan

We will modify or create the following files in `packages/core/`:

### 1. `packages/core/src/state/schema.ts`
- Update `AgentState` properties.
- Add types for: `RepoScanResult`, `ScopeAnalysisResult`, `FileSelectionResult`, `PatchChunk`, `PatchPlan`, `ValidationResult`, `ReportResult`, `RunOptions`, `RunResult`.

### 2. `packages/core/src/providers/llm.ts`
- Create file.
- Export `LlmProvider` and `MockLlmProvider`.

### 3. `packages/core/src/agent/nodes.ts`
- Create file.
- Implement the 9 workflow nodes: `intakeNode`, `repoScanNode`, `scopeAnalysisNode`, `fileSelectionNode`, `patchPlanNode`, `optionalPatchApplyNode`, `validationNode`, `traceExportNode`, `reportExportNode`.
- Use Node-to-FS calls using Bun APIs (`Bun.file`, `fs.readdir`, etc.).

### 4. `packages/core/src/agent/engine.ts`
- Create file.
- Create `CoreAgentEngine` wrapper class:
  ```typescript
  export class CoreAgentEngine {
    private readonly graph: StateGraph;
    private readonly llm: LlmProvider;
    private readonly memory: MemoryManager;

    constructor(llm: LlmProvider, memory: MemoryManager) {
      this.llm = llm;
      this.memory = memory;
      this.graph = new StateGraph();
      this.compileGraph();
    }

    private compileGraph(): void {
      // Registers nodes, edges, conditional validation edges
    }

    public async run(options: RunOptions): Promise<RunResult> {
      // Initializes trace ledger, compiles run state, executes StateGraph, and returns run outcome
    }
  }
  ```

### 5. `packages/core/src/index.ts`
- Export the newly created types, interfaces, nodes, `LlmProvider`, `MockLlmProvider`, and `CoreAgentEngine`.
