# Complete Codex Login Onboarding for Orynt CLI

## Summary

- Add a CLI-owned Codex setup flow that detects installation, compatibility,
  and authentication before interactive work begins.
- Support existing sessions, browser OAuth, device authentication, API keys,
  and enterprise access tokens across local terminals and headless
  environments.
- Keep credentials entirely owned by Codex; Orynt never reads, stores, logs, or
  transmits secret values.
- Keep the frozen desktop adapter unchanged.

## Implementation

- Return typed readiness codes for missing, outdated, incompatible,
  unauthenticated, failed, and ready Codex installations.
- Add automatic interactive repair, `orynt setup`, read-only
  `orynt setup --check [--json]`, and interactive `/setup`.
- Run browser and device login with exact shell-free Codex argv while Orynt
  yields terminal ownership. Show API-key and enterprise-token commands for
  execution outside Orynt so secret values never enter the Orynt process.
- Show official platform installation guidance without running remote
  installers. Offer `codex update` only after explicit confirmation.
- Re-probe after every action and persist no authentication state.

## Interfaces and Failure Behavior

- Add stable `CODEX_*` readiness codes and remediation metadata to provider
  status.
- Emit a versioned `codex_setup_status` JSON object from
  `orynt setup --check --json`.
- Preserve initial prompts after successful setup. Cancelled or unresolved
  setup sends no prompt and exits nonzero.
- Headless work never prompts and returns the same stable readiness code.

## Validation

- Cover every readiness classification, authentication choice, exact child
  argv, update decision, retry/cancel path, terminal restoration, and
  cross-platform guidance.
- Add packaged Linux, macOS, and Windows setup smoke coverage.
- Run `bun run test:cli`, `bun run build:cli`, and current-platform native packaging.

## Boundaries

- Do not modify the frozen desktop adapter, copy Codex auth caches, inspect
  credential files, read secret environment variables, add dependencies, or
  bypass Codex/workspace authentication policy.
- Device authentication remains availability-dependent because Codex documents
  it as beta and workspace-controlled.
