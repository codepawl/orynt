Goal: Implement the canonical Run and append-only event spine for CodePawl.

Context:
- Inspect `.codex/plan/cldsa-lite/plans/IMPLEMENTATION_PLAN.md`.
- Inspect existing state management, Tauri commands/events, storage, UI run components, and test setup.
- Inspect `.codex/plan/cldsa-lite/plans/03_DATA_CONTRACTS.md`.
- Follow AGENTS.md and existing repository conventions.

Constraints:
- Do not integrate Codex or real automation in this slice.
- Run transitions must be explicit and validated.
- Events must be append-only, ordered, schema-validated, and redaction-aware.
- Keep provider and surface details out of the core contracts.
- Do not expose raw shell/filesystem access to the renderer.
- Avoid a large package migration unless already approved in the implementation plan.

Done when:
- Canonical types/schemas exist for Run, RunStatus, RunEvent, TaskState, RunBudget, ApprovalRequest, ActionProposal, ActionDecision, and VerificationResult.
- A deterministic state machine rejects invalid transitions.
- A mock runtime produces a complete run event sequence.
- The desktop UI can render the mock run and current status.
- Unit tests cover valid/invalid transitions and event validation.
- Lint, typecheck, tests, and build pass, or exact pre-existing blockers are documented.
- Provide `/diff` and a concise validation report.
