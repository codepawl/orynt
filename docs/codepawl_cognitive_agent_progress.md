# CodePawl Cognitive Agent Progress

Last updated: 2026-07-04

## Current Checkpoint

All six implementation phases are complete. Completion audit passed on 2026-07-04 with the validation commands listed below.

The repository already contains a Tauri-first local MVP for a supervised Coding Apprentice. The current implementation is strongest around repository-scoped work: run events, conservative policy checks, worktree sandbox planning, Codex contract/result import, deterministic verification, local episodic memory extraction, candidate rules, candidate skills, and dry-run skill replay. The one-shot roadmap expands that foundation into a general brain-inspired computer-use agent with a cognitive kernel, gateway, feedback loop, evaluation harness, and productization scaffolding.

## Repository Map

Primary apps:
- `apps/desktop`: Tauri v2 + React product shell, mock Tauri command bridge, run timeline, approvals, memory review, candidate skills, skill replay, and controlled Codex execution preview.
- `apps/marketing-site`: Vite React landing page and pricing/copy surface.

Primary packages:
- `packages/shared`: run spine, core policy, context workspace, Codex contracts, result import contracts, verifier contracts, memory contracts, skill contracts, mock state, and shared tests.
- `packages/coding-apprentice`: local orchestrator for the repository-scoped Coding Apprentice walkthrough.
- `packages/codex-adapter`: Codex contract writing, controlled execution planning, execution import, result redaction, and manual result importer.
- `packages/repository-sandbox`: git repository inspection and worktree sandbox planning/creation.
- `packages/verifier`: deterministic repository verification for commands, diffs, protected paths, and final verdicts.
- `packages/memory`: local JSON episodic and semantic memory store, memory extraction, redaction, candidate rule lifecycle, and feedback review lifecycle.
- `packages/skill-registry`: candidate skill creation, promotion lifecycle, non-executable dry-run replay planning, and later-run invocation fallback planning.
- `packages/eval-harness`: deterministic benchmark scenarios, safety/cost/memory metrics, and JSON/Markdown evaluation reports.
- `packages/ipc-contracts`: JSON-RPC, Tauri command inputs, approval inputs, run events, and error codes.

Docs and roadmap sources:
- `.codex/goal-one-shot /01_MASTER_TIMELINE.md`
- `.codex/goal-one-shot /02_RESEARCH_TO_PRODUCT_MAP.md`
- `.codex/goal-one-shot /03_ARCHITECTURE_SPEC.md`
- `.codex/goal-one-shot /04_VALIDATION_AND_METRICS.md`
- `.codex/goal-one-shot /06_RISKS_AND_GUARDRAILS.md`
- `.codex/goal-one-shot /codex/phase_*.prompt.md`
- `.codex/plan/cldsa-lite/`
- `docs/mvp/local-coding-apprentice-walkthrough.md`
- `docs/productization/paddle-product-copy.md`
- `docs/productization/privacy-security.md`
- `docs/productization/private-beta-checklist.md`

Database/backend status:
- No `db/`, `prisma/`, `supabase/`, `migrations/`, `server/`, or `apps/api` implementation is present in the current checkout.
- The roadmap's schema contract should therefore start with typed in-memory or file-backed repositories until a database boundary is introduced.

Auth/billing/session status:
- No production auth, subscription, Paddle, hosted billing, or multi-tenant backend code is present.
- Existing workspace/user boundaries are typed local identifiers in shared contracts and mock state.
- Product plan/quota config and launch copy are scaffolded without secrets or real Paddle integration.

## Discovered Validation Commands

Root scripts:
- `pnpm test`
- `pnpm build`
- `pnpm test:contracts`
- `pnpm test:desktop`
- `pnpm test:eval`
- `pnpm test:tauri`
- `pnpm walkthrough:smoke`
- `pnpm build:desktop`

Package/app scripts:
- `pnpm --filter @codepawl/shared test`
- `pnpm --filter @codepawl/shared build`
- `pnpm --filter @codepawl/ipc-contracts test`
- `pnpm --filter @codepawl/ipc-contracts build`
- `pnpm --filter @codepawl/codex-adapter test`
- `pnpm --filter @codepawl/codex-adapter build`
- `pnpm --filter @codepawl/repository-sandbox test`
- `pnpm --filter @codepawl/repository-sandbox build`
- `pnpm --filter @codepawl/verifier test`
- `pnpm --filter @codepawl/verifier build`
- `pnpm --filter @codepawl/memory test`
- `pnpm --filter @codepawl/memory build`
- `pnpm --filter @codepawl/skill-registry test`
- `pnpm --filter @codepawl/skill-registry build`
- `pnpm --filter @codepawl/coding-apprentice test`
- `pnpm --filter @codepawl/coding-apprentice build`
- `pnpm --filter @codepawl/cognitive-kernel test`
- `pnpm --filter @codepawl/cognitive-kernel build`
- `pnpm --filter @codepawl/eval-harness test`
- `pnpm --filter @codepawl/eval-harness build`
- `pnpm --filter @codepawl/desktop test`
- `pnpm --filter @codepawl/desktop build`
- `pnpm --filter @codepawl/marketing-site test`
- `pnpm --filter @codepawl/marketing-site build`

Other checks:
- `cargo test` from `apps/desktop/src-tauri`
- `pnpm exec playwright test` when browser dependencies are available
- `git diff --check`

Validation gaps:
- No root `lint` or `typecheck` script exists.
- No database migration validation command exists yet.
- Browser-backed Playwright can be blocked by host/sandbox browser prerequisites.

## Risk Map

High-risk surfaces:
- Permission gating for state-changing computer-use actions.
- Credential, payment, email/message, shell, filesystem, and production-system actions.
- Durable memory creation from user feedback or external content.
- Prompt injection from pages/documents and untrusted external content.
- Cost and usage accounting if real model or gateway adapters are added.
- Multi-user/workspace boundaries once persistence or backend services are introduced.

Current guardrails already present:
- Repository is the only executable P0 surface in shared contracts.
- Browser, desktop, files, and terminal surfaces are blocked in the current MVP contracts.
- Conservative policy blocks dangerous commands, network by default, secrets, protected paths, and broad filesystem writes.
- Codex execution is approval-gated and can be disabled.
- Memory and skill extraction redact common secret shapes.
- Candidate skills are dry-run only until manually promoted and still remain non-executable replay plans.

Open risks:
- Feedback-derived semantic memory is local JSON only and not yet surfaced in the desktop UI.
- Skill invocation planning is non-executable and local-only; no approved-skill UI has been added yet.
- Cost/usage ledger is mostly mock state and budget snapshots, not a canonical ledger with provider price configs.
- Eval harness scenarios are deterministic package tests, not browser-backed end-to-end workflows.
- Productization remains launch-draft only: no hosted accounts, Paddle webhooks, legal terms, or production billing are implemented.

## Phase Implementation Surfaces

Phase 1 - Foundation ledger and event log:
- Extend `packages/shared/src/runSpine.ts` with canonical agent run, event, artifact, permission, and usage ledger contracts.
- Add pricing and usage summary contracts under `packages/shared/src/`.
- Add local in-memory/file-backed ledger implementation in a new package or focused module.
- Integrate with `packages/coding-apprentice/src/index.ts` and desktop mock state after contracts are stable.

Phase 2 - Cognitive kernel:
- Add a new focused package, likely `packages/cognitive-kernel`.
- Reuse `packages/shared/src/contextWorkspace.ts`, `packages/shared/src/runSpine.ts`, `packages/shared/src/corePolicy.ts`, `packages/memory`, `packages/skill-registry`, and `packages/verifier`.
- Start with fake model and fake gateway adapters for deterministic tests.

Phase 3 - Computer-use gateway:
- Add gateway action contracts to `packages/shared` or a dedicated `packages/gateway`.
- Keep real browser/desktop/files/shell execution disabled until the permission gate and evidence model pass deterministic tests.
- Wire desktop approval/replay views through typed contracts only after core tests pass.

Phase 4 - Teach/adjust memory:
- Extend `packages/memory` beyond repository candidate rules into semantic preferences/facts with source, confidence, sensitivity, status, and deletion.
- Extend `packages/skill-registry` for approval/edit/reject and later-run invocation planning.
- Add UI affordances in `apps/desktop` only after core flows are tested.

Phase 5 - Evaluation and safety:
- Add deterministic scenario definitions and runner, likely `packages/eval-harness`.
- Reuse fake model/gateway/kernel, memory, permission policy, and usage ledger.
- Emit machine-readable and human-readable report artifacts.

Phase 6 - Productization:
- Add plan/quota/credit configs in shared code.
- Add desktop usage/quota display from local ledger summaries.
- Update marketing/docs for Paddle-safe copy, private beta checklist, BYOK vs managed AI, privacy, and permission/takeover behavior.

## Adjusted Phase Checklist

- [x] Phase 0: Read roadmap package and inspect current repo structure.
- [x] Phase 0: Discover validation commands.
- [x] Phase 0: Map implementation surfaces to current files/modules.
- [x] Phase 0: Create progress log.
- [x] Phase 0: Create ADR 0001.
- [x] Phase 1: Add canonical local run ledger, event log, permission events, model usage ledger, gateway usage ledger, run artifacts, pricing config, and monthly usage summary tests.
- [x] Phase 1: Wire the ledger into the supervised run orchestration path.
- [x] Phase 1: Surface canonical ledger usage in desktop-visible usage state.
- [x] Phase 2: Add deterministic cognitive kernel state machine with fake model/gateway and memory retrieval.
- [x] Phase 2: Integrate the cognitive kernel into the supervised Coding Apprentice run path.
- [x] Phase 3: Add auditable gateway action routing, permission tiers, approval flow contracts, and evidence artifacts.
- [x] Phase 3: Integrate gateway routing into the supervised Coding Apprentice kernel trace.
- [x] Phase 4: Add feedback capture, semantic memory, skill candidate approval/edit/reject/delete, and later-run invocation.
- [x] Phase 5: Add deterministic evaluation harness and safety/cost/memory reports.
- [x] Phase 6: Add product plan/quota config, usage display scaffold, Paddle-safe copy, privacy/security docs, and private beta checklist.

## Notes

- Treat `apps/desktop/src` as the active product UI source of truth.
- Preserve local/mock-safe defaults. Do not add secrets, paid service requirements, hidden background work, uncontrolled autonomy, credential capture, payment execution, financial transfers, destructive actions, or production-system changes.
- The next implementation checkpoint should run the completion audit across the roadmap acceptance gates and remaining validation commands.

## Checkpoint Log

### 2026-07-04 - Phase 0 Discovery

Added:
- `docs/codepawl_cognitive_agent_progress.md`
- `docs/adr/0001-brain-inspired-agent-architecture.md`

Validation:
- `git diff --check -- docs/codepawl_cognitive_agent_progress.md docs/adr/0001-brain-inspired-agent-architecture.md` passed.

### 2026-07-04 - Phase 1 Ledger Contracts

Added:
- `packages/shared/src/agentLedger.ts`
- `packages/shared/src/agentLedger.test.ts`

Implemented:
- Canonical local `AgentRun` metadata.
- Append-only `AgentEvent` records with stable per-run indexes.
- `PermissionEvent` records for safe/review/sensitive/blocked tiers and approval decisions.
- `RunArtifact` records for replay evidence.
- `ModelUsageLedgerEntry` and `GatewayUsageLedgerEntry` records.
- Versioned mock pricing catalog outside business logic.
- Cost calculation for two provider/model configs and gateway runtime usage.
- Monthly usage summary with internal cost hidden unless explicitly requested.

Validation:
- RED: `pnpm --filter @codepawl/shared test -- agentLedger.test.ts` failed because `./agentLedger` did not exist.
- GREEN: `pnpm --filter @codepawl/shared test -- agentLedger.test.ts` passed.

### 2026-07-04 - Phase 1 Orchestrator Ledger Wiring

Updated:
- `packages/coding-apprentice/src/index.ts`
- `packages/coding-apprentice/src/index.test.ts`

Implemented:
- The local supervised Coding Apprentice run now initializes the canonical agent ledger using the same run id.
- Controlled Codex execution approval is recorded as a permission event.
- Controlled repository execution is recorded as gateway usage using configurable local repository pricing.
- Run artifacts are mirrored into canonical replay artifacts.
- Returned run results include normal user usage summary and admin usage summary, with internal cost hidden from normal user summary.

Validation:
- RED: `pnpm --filter @codepawl/coding-apprentice test -- index.test.ts` failed because `result.ledgerRun` did not exist.
- GREEN: `pnpm --filter @codepawl/coding-apprentice test -- index.test.ts` passed.

### 2026-07-04 - Phase 1 Desktop Usage Surface

Updated:
- `packages/shared/src/index.ts`
- `apps/desktop/src/App.tsx`
- `apps/desktop/src/App.test.tsx`

Implemented:
- Desktop mock state now carries the canonical `MonthlyUsageSummary`.
- Settings dashboard renders a compact Usage ledger metric with credits, run count, gateway action count, and artifact count.
- The display uses the existing dashboard metric component and does not add new CSS or color tokens.

Validation:
- RED: `pnpm --filter @codepawl/desktop test -- App.test.tsx` failed because `Usage ledger` was not rendered.
- GREEN: `pnpm --filter @codepawl/desktop test -- App.test.tsx` passed.

### 2026-07-04 - Phase 2 Deterministic Cognitive Kernel

Added:
- `packages/cognitive-kernel/package.json`
- `packages/cognitive-kernel/tsconfig.json`
- `packages/cognitive-kernel/vitest.config.ts`
- `packages/cognitive-kernel/src/index.ts`
- `packages/cognitive-kernel/src/index.test.ts`

Implemented:
- Deterministic observe -> retrieve -> plan -> gate -> execute -> verify -> learn -> summarize loop.
- Static memory retrieval for semantic/episodic/procedural hits.
- Planner interface with recovery hook.
- Gateway interface with fake deterministic execution results.
- Policy gating through the existing conservative policy engine.
- Approval pause, blocked action stop, uncertainty ask, mismatch recovery, and loop budget termination.

Validation:
- RED: `pnpm --filter @codepawl/cognitive-kernel test` failed because `./index` did not exist.
- GREEN: `pnpm --filter @codepawl/cognitive-kernel test` passed.
- `pnpm --filter @codepawl/cognitive-kernel build` passed.

### 2026-07-04 - Phase 2 Coding Apprentice Kernel Integration

Updated:
- `packages/coding-apprentice/package.json`
- `packages/coding-apprentice/src/index.ts`
- `packages/coding-apprentice/src/index.test.ts`

Implemented:
- The supervised Coding Apprentice result now includes `cognitiveKernelResult`.
- The kernel trace retrieves memory episodes created during the run.
- The kernel gates a read-only repository review action through the existing conservative policy.
- The gateway result is simulated from verifier evidence, so no additional autonomous execution is introduced.
- The kernel verifies against the deterministic verifier result and records phases through summarize.

Validation:
- RED: `pnpm --filter @codepawl/coding-apprentice test -- index.test.ts` failed because `result.cognitiveKernelResult` did not exist.
- GREEN: `pnpm --filter @codepawl/coding-apprentice test -- index.test.ts` passed.

### 2026-07-04 - Phase 3 Auditable Gateway Core

Added:
- `packages/gateway/package.json`
- `packages/gateway/tsconfig.json`
- `packages/gateway/vitest.config.ts`
- `packages/gateway/src/index.ts`
- `packages/gateway/src/index.test.ts`

Implemented:
- Core-layer gateway action routing through the existing conservative policy engine.
- Safe, review, sensitive, and blocked permission tiers.
- Approval provider contract and static approval fixture.
- Evidence store contract and in-memory replay evidence store.
- Safe auto-execution for read-only in-scope actions.
- Approval-required and rejected review action handling.
- Takeover-required handling for credentials, payments, external sends, and secret access.
- Blocked handling for destructive commands and prompt-injection attempts.
- Gateway failure trace evidence without fabricating success.

Validation:
- RED: `pnpm --filter @codepawl/gateway test` failed because `./index` did not exist.
- GREEN: `pnpm --filter @codepawl/gateway test` passed.
- `pnpm --filter @codepawl/gateway build` passed.

### 2026-07-04 - Phase 3 Coding Apprentice Gateway Integration

Updated:
- `packages/coding-apprentice/package.json`
- `packages/coding-apprentice/src/index.ts`
- `packages/coding-apprentice/src/index.test.ts`

Implemented:
- The Coding Apprentice cognitive kernel trace now uses `AuditableGateway.routeAction`.
- The run result returns `cognitiveGatewayResult` with permission tier, permission decision, status, and evidence.
- The integrated gateway action remains read-only and simulated from verifier evidence, preserving the local/mock-safe execution boundary.
- The integrated trace proves memory retrieval, permission gating, replay evidence, verification, and usage/ledger data can coexist in one supervised run result.

Validation:
- RED: `pnpm --filter @codepawl/coding-apprentice test -- index.test.ts` failed because `result.cognitiveGatewayResult` did not exist.
- GREEN: `pnpm --filter @codepawl/coding-apprentice test -- index.test.ts` passed.

### 2026-07-04 - Phase 4 Feedback Memory and Skill Invocation

Updated:
- `packages/shared/src/memoryContracts.ts`
- `packages/shared/src/skillContracts.ts`
- `packages/memory/src/index.ts`
- `packages/memory/src/index.test.ts`
- `packages/skill-registry/src/index.ts`
- `packages/skill-registry/src/index.test.ts`
- `packages/coding-apprentice/package.json`
- `packages/coding-apprentice/src/index.ts`
- `packages/coding-apprentice/src/index.test.ts`

Implemented:
- User feedback can be captured as semantic memory with source provenance, confidence, sensitivity, review status, redaction, approval, edit, rejection/deletion-compatible status transitions, and audit decisions.
- Deleted semantic memory is excluded from normal queries while remaining available through explicit audit queries.
- Skill registry can plan later-run invocation for active skills without making them executable.
- Candidate, rejected, archived, superseded, or missing skills fall back to manual planning with explicit fallback reasons.
- Coding Apprentice run results now include candidate feedback memory from `userNotes` and a non-executable skill invocation/fallback plan.

Validation:
- RED: `pnpm --filter @codepawl/memory test -- index.test.ts` failed because `store.writeSemanticMemory` did not exist.
- GREEN: `pnpm --filter @codepawl/memory test -- index.test.ts` passed.
- RED: `pnpm --filter @codepawl/skill-registry test -- index.test.ts` failed because `registry.planSkillInvocation` did not exist.
- GREEN: `pnpm --filter @codepawl/skill-registry test -- index.test.ts` passed.
- RED: `pnpm --filter @codepawl/coding-apprentice test -- index.test.ts` first failed on stale/missing skill-registry dependency wiring.
- GREEN: `pnpm --filter @codepawl/coding-apprentice test -- index.test.ts` passed.

### 2026-07-04 - Phase 5 Deterministic Evaluation Harness

Added:
- `packages/eval-harness/package.json`
- `packages/eval-harness/tsconfig.json`
- `packages/eval-harness/vitest.config.ts`
- `packages/eval-harness/src/index.ts`
- `packages/eval-harness/src/index.test.ts`

Updated:
- `package.json`

Implemented:
- Deterministic eval suite covering safe read-only tasks, low-risk state changes, sensitive actions, blocked actions, prompt injection, memory regression, and cost regression.
- Scenario runner routes every action through the conservative policy engine and records deterministic model/gateway cost through the canonical local agent ledger.
- Metrics include success rate, permission coverage, blocked execution count, intervention count, retry rate, loop rate, p50/p90 cost, evidence coverage, memory source coverage, and skill approval before use.
- Reports are emitted as machine-readable JSON and human-readable Markdown.

Validation:
- RED: `pnpm --filter @codepawl/eval-harness test` first failed because the package implementation did not exist.
- RED: `pnpm --filter @codepawl/eval-harness test` then failed because the model/provider fixture was missing from the canonical pricing catalog.
- GREEN: `pnpm --filter @codepawl/eval-harness test` passed.

### 2026-07-04 - Phase 6 Productization Scaffold

Added:
- `packages/shared/src/productPlans.ts`
- `packages/shared/src/productPlans.test.ts`
- `docs/productization/paddle-product-copy.md`
- `docs/productization/privacy-security.md`
- `docs/productization/private-beta-checklist.md`

Updated:
- `packages/shared/src/index.ts`
- `apps/desktop/src/App.tsx`
- `apps/desktop/src/App.test.tsx`

Implemented:
- Shared product plan configs for Core BYOK, Managed AI, and Pro/Gateway.
- Monthly managed AI credit reset semantics independent of billing cadence.
- Plan quota summary with remaining credits, runs, and gateway actions.
- Desktop dashboard now shows the active plan quota from shared mock state.
- Paddle product copy is documented without live Paddle secrets, product IDs, or webhook assumptions.
- Privacy/security draft documents permission gates, takeover behavior, data handling, and beta caveats.
- Private beta checklist documents onboarding copy, Paddle review prep, and release gates.

Validation:
- RED: `pnpm --filter @codepawl/shared test -- productPlans.test.ts` failed because `./productPlans` did not exist.
- GREEN: `pnpm --filter @codepawl/shared test -- productPlans.test.ts` passed.
- RED: `pnpm --filter @codepawl/desktop test -- App.test.tsx` failed because `Plan quota` was not rendered.
- GREEN: `pnpm --filter @codepawl/desktop test -- App.test.tsx` passed.

### 2026-07-04 - Completion Audit

Validation:
- `pnpm test:contracts` passed.
- `pnpm test:eval` passed.
- `pnpm --filter @codepawl/coding-apprentice test -- index.test.ts` passed.
- `pnpm --filter @codepawl/desktop test -- App.test.tsx` passed.
- `pnpm walkthrough:smoke` passed.
- `pnpm build:desktop` passed.
- `pnpm --filter @codepawl/eval-harness build` passed.
- `git diff --check` passed.
- Secret-pattern scan over `docs/productization` and `packages/shared/src/productPlans.ts` found no matches.
- Rendered QA passed with Playwright against `http://127.0.0.1:1420/`: app loaded, Settings -> Dashboard rendered `Plan quota`, `Managed AI`, and `2,500 credits / month resets monthly`, with no console warnings/errors. Screenshot saved outside the repo at `/tmp/codepawl-dashboard-quota.png`.

Known limits:
- Browser-backed full end-to-end workflows are not implemented; evals are deterministic local package tests.
- Production auth, hosted accounts, Paddle IDs/webhooks, legal terms, and live billing remain intentionally out of scope.
- Existing unrelated design-hook findings in `apps/desktop/src/styles.css`, `apps/desktop/src/App.test.tsx`, and `.impeccable/design.json` predated this final audit and were not changed as part of the scoped roadmap work.
