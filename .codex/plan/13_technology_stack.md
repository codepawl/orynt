# Technology Stack

Generated: 2026-06-24

## Default stack

### UI

- React
- TypeScript
- Vite
- Tailwind CSS or CSS variables with component primitives
- Radix UI / Ariakit for accessible primitives
- Framer Motion only if needed for polish; do not block MVP on animation

### Desktop shell

Tauri v2 only.

Reasons:

- Good long-term fit for local system control.
- Rust backend can enforce stricter host/guest boundaries.
- Capability/permission model is useful for future OS integrations.
- Smaller binary profile than Electron-style app shells.
- Avoids Electron's runtime bloat and separate security hardening track.

Electron is not supported. Do not add Electron scaffold, packages, build scripts, or fallback documentation.

### Runtime

- Node.js worker for Playwright and model provider calls.
- Rust side for desktop shell/system/security-sensitive APIs.
- Use a narrow, validated IPC contract between Tauri and the Node.js runtime worker.

### Browser automation

- Playwright for browser actions.
- CDP for browser events, network logs, console logs, tracing, screenshots, and advanced Chrome control.

### Data

- SQLite local DB.
- Drizzle ORM or Kysely.
- Zod for runtime validation.
- File storage for screenshots/videos/artifacts.

### Models

- Provider adapter abstraction.
- OpenAI/Anthropic/Gemini adapters.
- Ollama/local adapter for weak/local mode.

### Testing

- Vitest for unit tests.
- Playwright Test for browser-runtime integration.
- Snapshot/diff tests for UI graph and context packets.

## Hard rules

- No provider-specific logic inside orchestrator.
- No Playwright types inside generic contracts.
- No unvalidated model JSON.
- No raw secret logging.
- No hidden remote telemetry.
- No Electron shell or Electron fallback.

## Decision records

Create `docs/adr/` entries for major choices:

- desktop shell choice
- trace DB schema
- model adapter API
- SurfaceAdapter contract
- permission policy model
- token budgeting strategy
