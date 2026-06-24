# P0 MVP Checklist — Tauri-first

## Product/UI

- [ ] Tauri app launches.
- [ ] Run cockpit UI exists.
- [ ] Task sidebar exists.
- [ ] Permission panel exists.
- [ ] Budget meter exists.
- [ ] Trial/billing placeholder exists.

## Tauri/Rust

- [ ] Commands/events work.
- [ ] Capabilities are scoped.
- [ ] Sidecar supervisor works.
- [ ] Keychain wrapper exists.
- [ ] Settings storage exists.

## Sidecar/runtime

- [ ] Sidecar handshake works.
- [ ] BrowserSurfaceAdapter works on fixtures.
- [ ] Semantic UI graph works.
- [ ] Candidate actions work.
- [ ] Action compiler/verifier works.
- [ ] Token budget works.
- [ ] Mock model works.
- [ ] One real provider works.
- [ ] Trace store works.
- [ ] Skill replay basic works.

## Security

- [ ] Renderer has no direct sidecar access.
- [ ] No public sidecar port.
- [ ] No arbitrary shell.
- [ ] No filesystem writes.
- [ ] Submit/download approval required.
- [ ] Secrets redacted.
- [ ] Debug capability disabled in production.

## Validation

- [ ] pnpm checks pass.
- [ ] cargo checks pass.
- [ ] sidecar protocol tests pass.
- [ ] Playwright fixture tests pass.
- [ ] Tauri package smoke test passes.
