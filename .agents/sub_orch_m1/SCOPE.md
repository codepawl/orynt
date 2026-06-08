# Scope: Milestone 1 - Core Agent Engine

## Objective
Implement the core agent execution engine in `@codepawl/core` matching the requirements of R1.

## Requirements to Implement
1. Bounded state-machine workflow nodes in `@codepawl/core`:
   - `intake`, `repo_scan`, `scope_analysis`, `file_selection`, `patch_plan`, `optional_patch_apply`, `validation`, `trace_export`, `report_export`.
2. Internal modules inside `@codepawl/core` for:
   - Trace (`TraceLedger`)
   - Memory (`MemoryManager` or similar)
3. Typed contracts/interfaces for:
   - `AgentState`, `RunOptions`, `RunResult`, `TraceEvent`, `TraceLedger`, `RepoScanResult`, `FileSelectionResult`, `PatchPlan`, `ValidationResult`, and `ReportResult`.
4. Provider abstraction for LLMs (`LlmProvider` contract) and an interactive/configurable mock provider that reads from a local config file or fixture to simulate specific completions, outputs, and token counts.

## Implementation Guidelines
- Follow strict typing: TypeScript `strict: true` and `noUncheckedIndexedAccess: true`. No `any`.
- Make sure to compile successfully.
- Verify unit tests for core state transitions.
