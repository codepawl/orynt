# Handoff Report - explorer_m1

## 1. Observation
We have inspected the following files and modules in the `@codepawl/core` codebase:
* **`packages/core/src/state/schema.ts`**:
  * Line 41: `export interface AgentState` defines the core LangGraph-style state tracking.
  * Line 63: `export type AgentNode = (state: AgentState) => Promise<Partial<AgentState>>;`
* **`packages/core/src/ledger/trace.ts`**:
  * Line 33: `export class TraceLedger` manages event tracing, duration tracking, and token usage logging.
* **`packages/core/src/memory/index.ts`**:
  * Line 34: `export class MemoryManager` aggregates `SessionMemoryStore` and `SemanticMemoryStore`.
* **`packages/core/src/agent/orchestration.ts`**:
  * Line 7: `export class StateGraph` registers and compiles nodes/edges.
* **`PROJECT.md`**:
  * Line 10: Specifies the data flow nodes: `intake`, `repo_scan`, `scope_analysis`, `file_selection`, `patch_plan`, `optional_patch_apply`, `validation`, `trace_export`, `report_export`.
  * Line 26: Defines the signature for `LlmProvider`.

## 2. Logic Chain
1. To support the 9-node pipeline described in `PROJECT.md`, `AgentState` must be updated to store intermediate outputs (`RepoScanResult`, `FileSelectionResult`, `PatchPlan`, `ValidationResult`, `ReportResult`) so each node can access context produced by upstream nodes.
2. The `MockLlmProvider` must read from a local JSON fixture to simulate completions, outputs, and token counts. A regex/substring matching strategy against messages (first query or last message) allows matching prompts deterministically.
3. Spawning the subprocesses for `validation` fits naturally into the node design, using Node/Bun execution helpers (`Bun.spawn` or `child_process`).
4. Compiling this into a unified `CoreAgentEngine` wrapper will simplify instantiation for the CLI (Milestone 3) and tests (Milestone 0).

## 3. Caveats
* File operations and command execution details in `optional_patch_apply` and `validation` nodes are sketched and will need to be safely wrappered in the implementation phase (Milestone 2 handles safety guardrails).
* Actual LLM provider integrations (e.g. OpenAI/Anthropic) are outside M1 scope and deferred to later milestones.
* All changes are read-only proposals per explorer guidelines.

## 4. Conclusion
We have completed the architecture, type contracts, and node behaviors design. Implementing these proposed structures will allow the core engine to execute the state machine, mock completions deterministically, trace actions in `TraceLedger`, and write output reports.

## 5. Verification Method
1. **Build and Typecheck**: Run `bun typecheck:core` to ensure types compile with `strict: true` and `noUncheckedIndexedAccess: true`.
2. **Unit Testing**: Run `bun test` or setup a vitest configuration under `packages/core` to verify the `MockLlmProvider` matches prompts and the engine successfully runs through the 9 compiled nodes.
