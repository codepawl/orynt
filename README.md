# CodePawl

CodePawl is a closed-source control cockpit for inspectable, replayable computer agents.

The current repo is in Tauri-first MVP bootstrap. The marketing site already lives in `apps/marketing-site`; the product app starts in `apps/desktop` and keeps browser automation as the only executable MVP surface.

## Current Apps

- `apps/marketing-site`: Vite React landing page.
- `apps/desktop`: Tauri v2 + React product shell with typed mock cockpit data and mock command/event bridge.

## Shared Packages

- `packages/shared`: product UI/runtime types and mock MVP state.
- `packages/ipc-contracts`: JSON-RPC envelopes, runtime error codes, run-event contracts, and Tauri command input types.

## Architecture Direction

- React renderer talks only to Tauri commands/events.
- Rust/Tauri host owns app trust boundaries, payload validation, settings, keychain access, and sidecar supervision.
- Node/Playwright sidecar will own browser automation, semantic UI graph extraction, action execution, model calls, trace writing, and skill replay.
- Browser is the only enabled MVP surface. Desktop, files, and terminal remain future surfaces and are blocked in the MVP shell.
- Token economy, semantic UI graph, trace/replay, permissions, memory, and Codex/provider integration are core primitives.

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

1. Product shell and shared contracts.
2. Mock Tauri command/event bridge.
3. Rust sidecar supervisor.
4. Node stdio JSON-RPC sidecar.
5. BrowserSurfaceAdapter on local fixtures.
6. Semantic UI graph and candidate actions.
7. Action compiler, verifier, policy, and approvals.
8. Token economy and model router.
9. Trace store, memory, and skill replay.
10. Internal alpha package.
