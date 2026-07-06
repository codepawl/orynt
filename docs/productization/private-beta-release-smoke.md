# Orynt Desktop Private Beta Release Smoke

Run this checklist for each internal Linux beta archive created by `pnpm package:desktop:internal`.

## Package Checks

1. Build the package:

   ```bash
   pnpm package:desktop:internal
   ```

2. Confirm `dist/private-beta/orynt-desktop-0.1.0-linux-x64.tar.gz` and `dist/private-beta/SHA256SUMS` exist.
3. Extract the archive in a clean temporary directory.
4. Confirm `orynt-desktop`, `orynt-runner/scripts/desktop-repository-run.mjs`, `orynt-runner/scripts/register-extensionless-esm-loader.mjs`, `RELEASE_MANIFEST.json`, and this smoke checklist are present.

## Runtime Smoke

- App launch: run `./orynt-desktop` from the extracted directory and confirm the desktop shell opens.
- First-run onboarding: confirm the private-beta onboarding appears for fresh local app data and blocks running until dismissed.
- Provider readiness: choose Codex CLI, click Check Codex CLI, and choose a fetched model. Expected ready state requires `codex` on `PATH` plus an existing authenticated Codex CLI session. Missing CLI or missing auth should fail closed with a visible reason; if no session is detected, run `codex login` in a terminal, complete sign-in, then return and click Check Codex CLI again.
- Repository run: select a local directory, enter a repository task, and start a run only after provider readiness passes.
- Persistence reload: quit and relaunch the app, then confirm the completed run still appears in the local run list.
- Evidence viewer: open the persisted run evidence and confirm Artifact evidence entries load from the app data artifact tree. Memory store evidence should load from the app data memory root.
- Disabled surfaces: confirm browser, desktop, arbitrary files, terminal, cloud sync, hosted accounts, and managed billing surfaces remain disabled or marked unavailable.
- No live billing: confirm there is no Paddle checkout, subscription state, payment UI, hosted account login, or managed AI credit claim in the runtime.

## Local Paths

- Local app data: `$XDG_CONFIG_HOME/com.codepawl.orynt` or `~/.config/com.codepawl.orynt`.
- Artifact evidence: `artifacts/` under Local app data.
- Memory store: `memory/memory-store.json` under Local app data.
- Logs and diagnostics: persisted run events, redacted logs, verifier input/result, replay plan, and release manifest under Artifact evidence.

## Reset instructions

Quit the app, archive the app data directory if debugging evidence needs to be preserved, then delete `$XDG_CONFIG_HOME/com.codepawl.orynt` or `~/.config/com.codepawl.orynt`. Relaunching should show first-run onboarding again and an empty local run list.
