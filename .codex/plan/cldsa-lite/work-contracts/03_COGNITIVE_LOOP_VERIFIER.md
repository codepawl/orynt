/plan

Goal: Implement the CLDSA-Lite live cognitive loop with bounded TaskState, ContextWorkspace, ActionGate, deterministic verification, and resource budgets.

Context:
- Inspect the Run/event spine, Codex adapter, sandbox, and current UI.
- Inspect `.codex/plan/cldsa-lite/plans/00_CLDSA_LITE_MASTER_PLAN.md`, `03_DATA_CONTRACTS.md`, and `04_MVP_VERTICAL_SLICE_CODING_APPRENTICE.md`.
- Inspect fixture repositories and available project validation commands.

Constraints:
- Do not replay the full transcript on every turn.
- Keep active goal, subgoal, constraints, selected evidence, and recent verifier outcomes bounded.
- Every action must include intent and expected result.
- Provider/tool success cannot mark a task successful.
- Deterministic validators are the source of truth for hard outcomes.
- The runtime must stop on budget breach, retry storm, policy violation, or unrecoverable verifier failure.
- Do not add learned world models; use explicit expected transitions and heuristics.

Done when:
- One small coding task runs through Observe → Plan → Gate → Act → Verify → Record.
- The UI shows active subgoal, expected result, actual result, verifier status, budget, and approval state.
- The verifier runs selected tests/lint/typecheck/build and attaches evidence.
- Silent no-op and unexpected diff cases are detected.
- Context packet size is measured and full transcript dependence is removed.
- Fixture evals and all repository validation commands pass.
