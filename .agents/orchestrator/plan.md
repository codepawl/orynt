# Orchestrator Execution Plan - Openpawl MVP

## Strategy
We will execute the Project Pattern with a dual-track strategy:
1. **E2E Testing Track (Milestone 0)**: We will spawn the E2E Testing Orchestrator. It will design test infra and build opaque-box test suites (Tiers 1-4) in parallel. It will publish `TEST_READY.md`.
2. **Implementation Track (Milestones 1-4)**: We will execute the implementation milestones sequentially.
   - **M1**: `@codepawl/core` engine with state machine steps and mock provider.
   - **M2**: Safety guardrails, gitignore, boundary checks, artifact exporting, and validator.
   - **M3**: CLI commands wrapper.
   - **M4**: Integration & Verification against E2E tests, CI/CD sample action, docs updates, and adversarial coverage hardening (Tier 5).

## Verification Strategy
- Each milestone has its own verification steps.
- We will spawn sub-orchestrators for milestones, and they will execute the Explorer -> Worker -> Reviewer -> Challenger -> Auditor cycle.
- Top-level verification: all E2E tests pass, build, typecheck, tests pass.
