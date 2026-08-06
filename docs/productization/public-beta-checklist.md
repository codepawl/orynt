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

- [ ] Configure and review exact Light, Medium, and Heavy provider/model/effort
  bindings; confirm each referenced provider connection is ready.
- [ ] Verify bounded read-only work routes to Light, mutable work starts at
  Medium, and sensitive/destructive/recovery work routes to Heavy.
- [ ] Verify an unavailable exact tier binding blocks with
  `MODEL_TIER_UNAVAILABLE` and does not fall back.
- [ ] `bun release:check`
- [ ] Offline executable and Linux PTY scenarios in `bun test:e2e-cli` pass.
- [ ] `bun release:audit`
- [ ] `bun release:evidence:validate`
- [ ] Manual live prompt-understanding evidence passes every preregistered gate.
- [ ] Browser doctor/start/attach/scope/status/tabs/close smoke on a loopback endpoint.
- [ ] Browser read succeeds without mutation approval.
- [ ] Browser mutation is rejected non-interactively and requires explicit TTY
  confirmation interactively.
- [ ] Shadow candidate approve fails closed when any promotion gate fails.
- [ ] Full-history secret scan and legal review.
- [ ] Complete the [GitHub public-repository setup](../release/github-publication.md),
  including signed-out review after the visibility change.
- [ ] npm package and all four native archives contain notices/SBOM and pass
  packaged `--version`, `doctor`, and `browser doctor` smoke.

The Tauri app is checked separately with `bun check:desktop`; it does not
replace the CLI release gate.
