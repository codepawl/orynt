# Human-like Budgeted Agent MVP Implementation Plan

> For Hermes: implement directly with TDD because the user asked to plan and upgrade in the same request.

Goal: Upgrade Orynt's existing cognitive kernel and desktop repository run path so test runs expose a human-like budgeted agent trace: need appraisal, compact state, affordance-aware options, tradeoff scoring, policy selection, budget/cost telemetry, and memory consolidation hooks.

Architecture: Extend the existing @codepawl/cognitive-kernel deterministic loop instead of creating a separate service. Keep raw evidence in existing artifacts and add compact structured state to the kernel result. Wire that trace into Coding Apprentice manifests so desktop beta runs are immediately testable.

Tech stack: TypeScript pnpm monorepo, Vitest, existing @codepawl/shared policy/budget types, @codepawl/cognitive-kernel, @codepawl/coding-apprentice, Tauri sidecar manifest.

## Current context

- Source research: /home/nxank4/Downloads/human_like_budgeted_agent_architecture.md
- Existing kernel already has observe/retrieve/plan/gate/execute/verify/recover/learn/summarize phases.
- Existing coding apprentice already writes artifact-manifest.json and has memory extraction, skill plans, gateway traces, ledger usage.
- Practical MVP should focus on coding/debugging agent domain, matching the research's recommended MVP scope.

## Step-by-step plan

### Task 1: Add budgeted state schemas and deterministic builders

Files:
- Modify: packages/cognitive-kernel/src/index.ts
- Test: packages/cognitive-kernel/src/index.test.ts

Add exported types:
- NeedState
- GoalState
- CompactWorkingState
- BudgetedOption
- BudgetedAffordance
- TradeoffScore
- BudgetedDecision
- BudgetedTrace
- TokenBudgetPolicy
- ModuleBudgetTrace
- MemoryRetrievalBudget
- OutcomeEvaluation
- MemoryConsolidationPlan

Behavior:
- Build need state from goal, constraints, max steps, and budget policy.
- Preserve hard constraints exactly.
- Build <=7 active chunks with <=15 words each.
- Retrieve only top memory items within typed token budgets.
- Generate 2-5 deterministic options for repository tasks.
- Filter options through available tools/actions.
- Score options using task success, quality, token cost, safety, and tool friction.
- Select HABIT / COMPACT_DELIBERATION / DEEP_DELIBERATION / RECOVERY.

### Task 2: Attach budgeted trace to kernel results

Files:
- Modify: packages/cognitive-kernel/src/index.ts
- Test: packages/cognitive-kernel/src/index.test.ts

Behavior:
- CognitiveKernelResult includes budgetedTrace.
- Trace includes module token/cost estimates and costPerSuccessfulTask.
- Existing tests still pass.
- New tests assert hard constraints are lossless and compact state does not include raw transcript.

### Task 3: Wire trace into Coding Apprentice and desktop manifest

Files:
- Modify: packages/coding-apprentice/src/index.ts
- Test: packages/coding-apprentice/src/index.test.ts

Behavior:
- CodingApprenticeDemoResult exposes the budgeted trace through cognitiveKernelResult.
- Desktop artifact-manifest.json includes budgetedAgent with needState, compactWorkingState, decision, cost, and memoryConsolidation.
- Contract context includes compact state and selected mode, not raw long history.

### Task 4: Enable test-friendly Orynt feature switches

Files:
- Modify: packages/coding-apprentice/src/index.ts
- Modify: scripts/desktop-repository-run.mjs if request passthrough is needed

Behavior:
- Default repository beta run enables memory extraction, skill planning, cognitive kernel trace, gateway trace, artifact evidence, and cost ledger.
- Keep dangerous controlled Codex execution off by default unless explicitly approved.

### Task 5: Verify

Commands:
- pnpm --filter @codepawl/cognitive-kernel test
- pnpm --filter @codepawl/coding-apprentice test -- index.test.ts
- pnpm test:contracts
- pnpm test:desktop
- pnpm test:tauri
- pnpm run build:desktop
- pnpm package:desktop:internal

## Risks and tradeoffs

- This is an MVP integration, not a full model-serving router. Deterministic estimates stand in for real provider token accounting until live model API integration is added.
- Hard constraints must stay exact; only active chunks and memory snippets are lossy/compact.
- Raw evidence remains in artifacts and can be retrieved by path, but it should not be placed into compact working state.
- High-risk or state-changing execution remains behind policy/approval.

## Acceptance criteria

- Kernel result has a budgeted trace with need, goal, compact state, options, affordances, tradeoffs, decision, outcome, and memory consolidation.
- Compact state has <=7 chunks and exact hard constraints.
- Desktop run manifest exposes enough budgeted-agent telemetry for manual testing.
- Existing Orynt tests/builds continue passing.
