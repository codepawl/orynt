# CodePawl

CodePawl is a closed-source control cockpit for inspectable, replayable computer agents.

The current repo is in Tauri-first MVP bootstrap. The marketing site already lives in `apps/marketing-site`; the product app starts in `apps/desktop`. The current P0 is CLDSA-Lite: a supervised Coding Apprentice that delegates repository tasks to Codex inside an isolated git worktree, verifies outcomes, records append-only evidence, controls cost, and proposes candidate memory from user corrections.

## Current Apps

- `apps/marketing-site`: Vite React landing page.
- `apps/desktop`: Tauri v2 + React product shell with typed mock cockpit data and mock command/event bridge.

## Shared Packages

- `packages/shared`: product UI/runtime types and mock MVP state.
- `packages/ipc-contracts`: JSON-RPC envelopes, runtime error codes, run-event contracts, and Tauri command input types.

## Architecture Direction

- React renderer talks only to Tauri commands/events.
- Rust/Tauri host owns app trust boundaries, payload validation, settings, keychain access, and sidecar supervision.
- Node/TypeScript sidecar will own the run orchestrator, Codex adapter, repository workspace adapter, event persistence, verification, model calls, memory extraction, and token/cost accounting.
- Browser automation remains a later capability pack behind the same permissioned surface-adapter architecture.
- Runs, append-only events, deterministic verification, permissions, bounded context, resource budgets, candidate memory, and Codex/provider integration are core primitives.

## Commands

```bash
pnpm install
pnpm --filter @codepawl/marketing-site test
pnpm --filter @codepawl/marketing-site build
pnpm test:contracts
pnpm test:desktop
pnpm build:desktop
pnpm --filter @codepawl/desktop exec tauri dev
```

## MVP Sequence

1. Architecture reconciliation against `.codex/plan/cldsa-lite/`.
2. Run state machine and append-only event spine.
3. Safety policy, action gate, budgets, and isolated git worktree sandbox.
4. Codex adapter with event normalization, cancellation, and timeout handling.
5. Deterministic verifier for tests, lint, typecheck, build, diff, and protected paths.
6. Bounded context workspace and resource governor.
7. Episodic event store, candidate memory, and user review flow.
8. Post-run consolidation and lifecycle policy.
9. Adaptive control and lightweight transition prediction.
10. Browser operator and other future capability packs.
