# Implementation Sequence — Tauri-first

Status: legacy browser-first sequence. Do not use this as the current P0
implementation path. The current CLDSA-Lite / Coding Apprentice sequence lives
in `.codex/plan/cldsa-lite/plans/02_IMPLEMENTATION_ROADMAP.md` and
`.codex/plan/cldsa-lite/work-contracts/`. Keep this document as future
browser-operator capability context.

## Phase 0 — Tauri foundation

Done when:

- Tauri app launches.
- React UI renders.
- Tauri commands/events work.
- Capability files exist.
- Security baseline checks pass.

## Phase 1 — UI shell and mock sidecar events

Done when:

- Run cockpit from `.codex/ui` renders with mock data.
- `/app/run`, `/app/tasks`, `/app/permissions`, `/app/usage`, and `/app/settings/billing` routes exist.
- Tauri command/event bridge can stream mock run events into the UI.
- No live browser automation is connected yet.

## Phase 2 — Sidecar skeleton

Done when:

- Rust spawns sidecar.
- Handshake succeeds.
- Health check works.
- Events stream from sidecar to Rust to UI.
- Sidecar can be killed/restarted.
- No public sidecar port exists.

## Phase 3 — Runtime skeleton

Done when:

- `run.create` creates a mock run.
- Steps stream to UI.
- Cancel works.
- Trace stub persists.

## Phase 4 — BrowserSurfaceAdapter

Done when:

- Sidecar launches Playwright browser.
- Navigates to local fixture.
- Observes page.
- Executes click/fill/select.

## Phase 5 — Semantic graph and actions

Done when:

- ObservationGraph works.
- Candidate actions generated.
- Action compiler and verifier pass fixture tests.

## Phase 6 — Token economy and model router

Done when:

- ContextPacket builder works.
- Mock model chooses action.
- One real provider can be configured through keychain.
- Budget meter updates.

## Phase 7 — Permissions/approvals

Done when:

- Risky browser actions request approval.
- UI approval card controls runtime.
- Policy decisions persist to trace.

## Phase 8 — Skills/replay

Done when:

- Successful run saves as skill.
- Skill replay uses low/no model calls.
- Divergence triggers recovery.

## Phase 9 — Internal alpha package

Done when:

- Tauri build packages app.
- Sidecar is included or managed.
- Fixture demo completes.
- P0 checklist passes.
