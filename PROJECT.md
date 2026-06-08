# Project: Openpawl MVP

## Architecture
Openpawl consists of:
1. `@codepawl/shared`: Common types and schemas.
2. `@codepawl/core`: The bounded state-machine workflow agent logic. It maintains the Trace, Memory, LLM Provider Abstraction, and Mocking layers.
3. `@codepawl/cli`: The command line interface that wraps `@codepawl/core` to expose executable actions like `run`, `trace`, `doctor`, and `github-comment`.

### Data Flow
- CLI Run: User starts `codepawl run` -> invokes `StateGraph.compileAndRun` -> state machine runs through node steps (`intake`, `repo_scan`, `scope_analysis`, `file_selection`, `patch_plan`, `optional_patch_apply`, `validation`, `trace_export`, `report_export`) -> state transitions are logged to `TraceLedger` -> outputs are saved under `.codepawl/runs/<run-id>/`.

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 0 | E2E Testing Track | Comprehensive E2E test suite + `TEST_READY.md` | None | PLANNED |
| 1 | M1: Core Agent Engine | Bounded state machine, trace/memory, LLM mock provider (R1) | None | PLANNED |
| 2 | M2: Guardrails & Artifacts | Safety guardrails (R3), artifacts export (R4), validation command execution | M1 | PLANNED |
| 3 | M3: CLI Runner | CLI binary, options, and commands: run, trace, doctor, github-comment (R2) | M2 | PLANNED |
| 4 | M4: Final Milestone | Pass 100% of E2E tests, CI/CD action sample, and docs updates (R5) | M0, M3 | PLANNED |

## Interface Contracts
### Core Agent State Machine
- `AgentState` needs to support the state machine flow.
- LLM Provider Interface:
  ```typescript
  export interface LlmProvider {
    generateCompletion(messages: AgentMessage[], options?: any): Promise<{ content: string; usage?: { inputTokens: number; outputTokens: number } }>;
  }
  ```

## Code Layout
- `packages/shared/src/`: Contains types shared by core, cli, and web.
- `packages/core/src/`: Agent, memory, state machine, providers, validation, and export modules.
- `packages/cli/src/`: CLI commands, terminal rendering, argument parsing.
