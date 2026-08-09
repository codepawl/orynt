# CLI Public Release Checklist

Status: CLI-first local release checklist.

## Product scope

- [x] Repository-scoped supervised agent flow exists.
- [x] Policy blocks secrets, protected paths, dangerous commands, broad writes,
  and unapproved network behavior.
- [x] Browser runtime is opt-in through explicit local start/attach and origin scope.
- [x] Browser mutations require gateway approval and typed postconditions.
- [x] Capability routing exposes selected tools only.
- [x] Improvement candidates remain shadow-only until every declared gate and
  explicit operator approval pass.
- [x] History, hygiene, quarantine, digest validation, active pointers, and
  rollback are exposed through `orynt improve`.
- [x] Marketing and Account/Billing product surfaces are absent.
- [x] Desktop is excluded from default CI and remains an explicit compatibility
  check only.

## Operator boundary

- Explain that Orynt is supervised and local-first.
- Explain repository sandbox, verifier, evidence, and recovery behavior.
- Explain that browser tools do not exist in a turn until the operator starts
  or attaches a local browser session.
- Avoid promising autonomous completion, credential handling, background
  execution, or automatic self-modification.

## Release gates

Boxes record a verification that actually ran, with the evidence that produced
it. A gate whose evidence expires must be unticked when it does: the live
artifacts below carry a seven-day limit and are bound to the source digest.

Verified locally on 2026-08-09:

- [x] Configure and review exact Light, Medium, and Heavy provider/model/effort
  bindings; confirm each referenced provider connection is ready.
  `orynt doctor` reports healthy with 17 passing checks: Light
  `gpt-5.6-luna`/medium, Medium `gpt-5.6-terra`/medium, Heavy
  `gpt-5.6-sol`/high, all on `codex-cli`, with the provider authenticated.
- [x] Verify bounded read-only work routes to Light, mutable work starts at
  Medium, and sensitive/destructive/recovery work routes to Heavy.
  Deterministic coverage in `modelTierContracts.test.ts`, including that a
  negated safety clause does not elevate while positive risk still does.
- [x] Verify an unavailable exact tier binding blocks with
  `MODEL_TIER_UNAVAILABLE` and does not fall back.
  `resolveExactTierBinding` throws `ModelTierUnavailableError` for both a
  missing model and an unsupported effort.
- [x] `bun release:check` (all seventeen steps).
- [x] Offline executable and Linux PTY scenarios in `bun test:e2e-cli` pass
  (18/18).
- [x] `bun release:audit`: no dependency advisories, and a full-history secret
  scan over 504 commits and 79 MB found no leaks.

Blocked on provider quota until the Codex limit resets. Each needs live model
calls and cannot be produced offline:

- [ ] `bun release:evidence:validate` requires three live artifacts:
  `contextvm-live-v1.json`, `cli-live-e2e-v1.json`, and
  `prompt-understanding-live-v1.json`. Only the browser artifact exists today
  and it is stale.
- [ ] Manual live prompt-understanding evidence passes every preregistered gate.
- [ ] Browser doctor/start/attach/scope/status/tabs/close smoke on a loopback endpoint.
  `orynt browser doctor` passes and Chrome is detected, but the recorded
  evidence is bound to an older source digest and must be regenerated with
  `bun e2e:cli:live-browser`, which drives live Codex.
- [ ] Browser read succeeds without mutation approval.
- [ ] Browser mutation is rejected non-interactively and requires explicit TTY
  confirmation interactively.

Outstanding:

- [ ] Shadow candidate approve fails closed when any promotion gate fails.
- [ ] Legal review. The secret-scan half of this gate is covered by
  `bun release:audit` above; the review itself is a human step.
- [ ] Complete the [GitHub public-repository setup](../release/github-publication.md),
  including signed-out review after the visibility change.
- [ ] npm package and all four native archives contain notices/SBOM and pass
  packaged `--version`, `doctor`, and `browser doctor` smoke.
  `package:cli:native` builds only the host target, so the four-architecture
  matrix runs in the `CLI release` workflow rather than locally.

The Tauri app is checked separately with `bun check:desktop`; it does not
replace the CLI release gate.
