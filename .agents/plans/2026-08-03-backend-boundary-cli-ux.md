# Backend boundary, then inline CLI UX

## Decisions

- Complete the public-beta backend for repository, opt-in browser, capability
  routing, and intelligence/improvement before changing CLI presentation.
- Make `@codepawl/agent-runtime` the application-session owner. CLI adapters
  dispatch typed commands, render typed events, and collect typed decisions.
- Preserve current commands, flags, JSONL, artifacts, persisted sessions, and
  the frozen desktop compatibility adapter.
- Keep the CLI inline and chat-first. Do not add a full-screen TUI or a new
  production dependency.

## Gates

1. Add revision-bound shared session commands, decisions, snapshots, and events.
2. Move planning, authorization, capability composition, and lifecycle state
   behind the runtime session and prove interactive/headless parity.
3. Pass package, contract, controlled fixture, CLI E2E, and deterministic
   release checks; live source-bound evidence remains consent-gated.
4. Only then simplify welcome/help/settings/activity/approval presentation and
   add narrow-terminal snapshot and PTY coverage.
