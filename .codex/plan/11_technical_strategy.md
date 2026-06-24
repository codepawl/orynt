# Technical Strategy

Generated: 2026-06-24

## Engineering north star

Build CodePawl as a modular runtime, not a single browser script.

The app should separate:

- user interface
- surface observation
- candidate action generation
- model context construction
- action selection
- action compilation
- execution
- verification
- trace storage
- token budgeting
- safety policy

## Core technical decisions

### Local-first desktop app

Use a desktop shell because CodePawl will eventually need system-level integrations. Browser-only web app architecture would block the long-term goal.

### Browser-first adapter

Implement browser adapter first using Playwright/CDP because it gives deterministic control and structured observation surfaces.

### TypeScript-first runtime

Use TypeScript for product velocity and shared types across UI/runtime. Use Rust only where desktop shell/security/OS integration demands it.

### SurfaceAdapter interface

All surfaces must implement the same contract:

- observe
- list candidate actions
- execute action
- verify expected result
- report permissions
- report cost/risk metadata

### ContextPacket interface

Never send raw state to the model by default. Build compact model packets with budgets and purpose-specific content.

### Trace as event log

Store everything as append-only events. Derive UI views and replay from the event log.

## Technology preference

Preferred MVP path:

```text
Desktop shell: Tauri v2 only
Frontend: React + TypeScript + Vite
Runtime: Node.js worker + Playwright behind validated Tauri IPC
Storage: SQLite
Validation: Zod
State: Zustand/Jotai + event store
Tests: Vitest + Playwright Test
Package manager: pnpm
CI: GitHub Actions
```

## Avoid

- Hardcoding everything into React components.
- Treating traces as plain logs instead of first-class data.
- Passing full DOM/screenshots into the model every step.
- Building full desktop control before browser loop is reliable.
- Letting model output free-form actions.
- Adding Electron as a fallback or convenience shell.
