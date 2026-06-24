# MVP Technical Scope

## MVP objective

Build a Tauri desktop app that proves CodePawl can run browser computer-agent tasks with a cleaner UI, safer permissions, lower token cost, and inspectable traces.

## In scope

### Tauri shell

- React UI from `.codex/ui`.
- Tauri command/event bridge.
- Capability-scoped frontend permissions.
- Sidecar lifecycle management.
- Settings and local storage.

### Browser agent runtime

- Node/TypeScript sidecar.
- Playwright browser session.
- Browser `SurfaceAdapter`.
- Semantic UI graph.
- Candidate action ranking.
- Strict JSON action protocol.
- Action compiler.
- Verifier.
- Trace persistence.
- Approval gate.
- Token budget guard.
- Basic skill save/replay.

### Commercial layer

- Closed-source product stance.
- Trial/billing UI placeholder only.
- BYOK provider setup.
- Local license cache interface.
- Offline-first alpha support; do not require account backend for local runtime validation.

## Out of scope for MVP

- Native desktop control.
- Terminal control.
- Filesystem writes.
- Cloud-hosted browser runs.
- Team accounts.
- Marketplace.
- Enterprise SSO.
- Payment automation.
- CAPTCHA/bot evasion.

## MVP demo

```text
Open a controlled browser, navigate to a local/staging web app, fill a form, stop before submit, show approval card, show cost/trace, save as replayable skill.
```
