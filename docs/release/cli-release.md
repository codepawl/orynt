# CLI public release

This runbook covers the CLI release. Tauri desktop packaging has a separate
matrix and does not weaken the CLI release gates.

## Required gates

```bash
bun run release:check
bun run release:audit
bun run release:evidence:validate
```

For one deterministic CLI and desktop readiness pass, run:

```bash
bun run gate:release:deterministic
```

After current source-bound live evidence exists, the final aggregate gate is:

```bash
bun run gate:release
```

The native packaging matrix also runs the Codex setup smoke test. It verifies
`orynt setup --help` and the stable missing-Codex JSON status with an empty
`PATH` on Linux, macOS, and Windows.

`release:check` starts with a child-process stdin round-trip preflight. A
`HOST_STDIO_UNAVAILABLE` result means the current host cannot exercise the real
Codex app-server transport; do not reinterpret it as a product failure or skip
the gate. Run the authoritative check on GitHub Actions instead.

The remaining `release:check` steps are deterministic. Refreshing live evidence
is consequential and requires authenticated Codex access, Chrome, provider
quota, and the exact command:

```bash
bun run release:evidence:live
```

The live runner packages the npm CLI, performs Light/Medium/Heavy model probes,
prompt-understanding qualification, clarification fail-closed, a read-only
interactive answer with clean PTY exit, one disposable semantic-plan-bound mutation, and twelve real Chrome
scenarios whose browser lifecycle crosses the packaged CLI. Evidence excludes
prompts and model responses, expires after seven days, and becomes stale after
a source change. The unified live suite has a 90-minute outer fail-safe because
its scenario-level budgets intentionally exceed the deterministic release
checks; diagnostic single-scenario output is not release eligible.

Before the security audit on Linux x64, install the pinned Gitleaks release:

```bash
bun run release:tools:install
```

The installer writes only to `dist/tools/` and refuses an archive whose
SHA-256 does not match the repository-pinned digest.

## Signing and protected environment

The GitHub `release` environment requires a reviewer and provides:

- `ORYNT_RELEASE_SIGNING_KEY`: Ed25519 private key secret.
- `ORYNT_RELEASE_PUBLIC_KEY`: matching public key used during packaging.
- `ORYNT_RELEASE_KEY_ID`: non-secret environment variable naming that key.
- `NPM_BOOTSTRAP_TOKEN`: one-time granular npm token for `0.1.0` only.

The private key never enters the repository or artifacts. Keep an encrypted
offline backup. Rotation adds a new `keyId` before it is used to sign a
manifest; old trusted public keys remain available while supported clients may
still receive updates signed by them.

## Release sequence

1. Confirm the candidate branch is merged into protected `main`, the version is
   `0.1.0`, all gates pass, and secret/license/history review is clean.
2. Obtain explicit approval before changing repository visibility. After the
   repository is public, enable rulesets and GitHub security controls described
   in [automation](../automation.md).
3. Create the reviewed `v0.1.0` tag only after separate publication approval.
4. The workflow builds npm plus Linux x64, Windows x64, macOS arm64, and macOS
   x64 artifacts from that tag, smokes them, creates SPDX/notices, signs the
   exact four-asset manifest, and creates a draft GitHub Release.
5. The protected job publishes npm with provenance, verifies a fresh registry
   install, then makes the prepared GitHub Release public.
6. Revoke `NPM_BOOTSTRAP_TOKEN`, remove it from GitHub, configure npm trusted
   publishing for the exact repository/workflow/environment, and remove the
   token path from the workflow before any later tag.

Published artifacts are immutable. If npm succeeds and GitHub publication
fails, repair and publish the existing draft; never rebuild the same version.
If a defect is found after publication, deprecate the npm version and release a
new patch rather than replacing assets.

## Installer and updater checks

The signed updater follows bounded HTTPS redirects, chooses the exact
platform/architecture asset, verifies manifest key id/signature and archive
size/SHA-256, stages and smokes the binary, then atomically switches the
launcher. `minimumCliVersion` may require a manual reinstall.
`orynt update --rollback` is available only to installer-managed native
releases.

## Codex setup acceptance

- Automated release jobs use controlled missing/ready fixtures and never use
  credentials.
- Before publishing a login-flow change, manually test browser login on Linux,
  macOS, and Windows with an isolated temporary `CODEX_HOME`.
- Test device-code login once from a headless environment where the account or
  workspace permits it. Record only platform, Codex/Orynt versions, result, and
  source digest—never account identifiers, codes, tokens, or auth files.
- Accept API-key and enterprise-token paths by verifying that Orynt prints the
  exact external command and never reads the corresponding environment
  variable.
