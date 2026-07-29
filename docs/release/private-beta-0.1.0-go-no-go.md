# Orynt Private Beta 0.1.0 Go/No-Go

Report date: 2026-07-05

## Verdict

GO for limited internal manual tester distribution.

This is not a production release. The artifact is an unsigned/manual Linux private beta for repository-only supervised Coding Apprentice testing. The release gate verified package integrity, release metadata, clean extraction, packaged sidecar repository execution, evidence artifact creation, provider/readiness gating coverage, disabled surfaces, and no live billing claims. The only release-smoke item not visually verified here is the rendered Tauri window/onboarding flow; the binary launch process stayed alive until timeout with no crash output, but an interactive tester must still confirm the window and first-run UI on a real desktop session before widening distribution.

## Artifact

- Path: `dist/private-beta/orynt-desktop-0.1.0-linux-x64.tar.gz`
- Checksum file: `dist/private-beta/SHA256SUMS`
- SHA256: `f11c4d482c47540096642971e6443246d7e3cde5b92b594e6c55068715a5c05a`
- Manifest: `dist/private-beta/orynt-desktop-0.1.0-linux-x64/RELEASE_MANIFEST.json`
- Manifest generated at: `2026-07-04T19:02:35.587Z`
- Distribution stance: unsigned internal Linux tarball, manual checksum verification.
- Updater stance: disabled; no updater artifacts, endpoint, or signing keys.

## Artifact Verification

| Check | Result | Evidence |
| --- | --- | --- |
| Tarball exists | verified | `dist/private-beta/orynt-desktop-0.1.0-linux-x64.tar.gz` exists after `pnpm package:desktop:internal`. |
| Checksum matches | verified | `sha256sum -c SHA256SUMS` passed from `dist/private-beta`. |
| Release manifest fields | verified | Manifest has product `Orynt Desktop`, version `0.1.0`, target `linux-x64`, binary `orynt-desktop`, runner root `orynt-runner`, unsigned distribution, disabled updater, repository-only scope, app data paths, and smoke checklist pointer. |
| Sidecar files included | verified | Archive contains `orynt-runner/scripts/desktop-repository-run.mjs`, `register-extensionless-esm-loader.mjs`, and compiled `@codepawl/*/dist/index.js` package outputs required by the runner. |
| Clean extraction | verified | Extracted to `/tmp/orynt-release-final.8UZ2S4/orynt-desktop-0.1.0-linux-x64`; binary, manifest, runner scripts, and smoke checklist were present. The self-referential readiness audit is intentionally not packaged. |
| Binary dynamic libraries | verified | `ldd` resolved GTK/WebKit/Tauri runtime dependencies on this Fedora host. |

## Validation Commands

| Command | Result | Notes |
| --- | --- | --- |
| `pnpm release:desktop:check` | pass | Release contract test passed. |
| `pnpm test:contracts` | pass | `@codepawl/shared`: 3 files, 28 tests. `@codepawl/ipc-contracts`: 1 file, 6 tests. |
| `pnpm --filter @codepawl/desktop test -- App.test.tsx` | pass | 1 file, 63 tests. Covers onboarding, repository path gating, provider setup/preflight UI, persisted run listing, evidence viewer states, disabled surfaces, and no live billing copy. |
| `pnpm build:desktop` | pass | Coding Apprentice package and desktop TypeScript/Vite build completed. |
| `pnpm test:tauri` | pass | 24 Rust/Tauri tests passed, including provider readiness gates, repository path validation, persistence, artifact containment, memory-store evidence access, symlink rejection, and packaged runner discovery. |
| `pnpm package:desktop:internal` | pass | Release binary built with `tauri build --no-bundle --ci`; tarball and `SHA256SUMS` regenerated. |
| `git diff --check` | pass | No whitespace errors after report/readiness updates. |
| Focused release secret-pattern scan | pass | No matches for secret-like API key, token, private-key, or `sk-...` patterns in release docs, packaged release docs, release manifest, or checksum file. |

## Release Smoke Checklist

| Smoke item | Result | Evidence |
| --- | --- | --- |
| App launch | not rerun after Orynt packaging rename | Visual packaged app launch and onboarding confirmation remain manual because this environment has no interactive display capture. |
| First-run onboarding | verified by automated UI test; visual manual check required | `pnpm --filter @codepawl/desktop test -- App.test.tsx` covers first-run private beta onboarding text, dismissal persistence, and run blocking before onboarding. |
| Provider readiness gate | verified by UI and Tauri tests | Desktop tests cover provider setup/preflight UI and start-run blocking; Tauri tests cover failed/ready Codex CLI preflight states and missing/untested provider blocking. |
| Repository path validation | verified by UI and Tauri tests | Desktop tests cover selected repository path submission and missing path messaging; Tauri tests reject missing, invalid, and filesystem-root repository paths. |
| Repository run | verified through packaged sidecar | Final clean-extraction sidecar smoke ran `orynt-runner/scripts/desktop-repository-run.mjs` with `node --import orynt-runner/scripts/register-extensionless-esm-loader.mjs` against a disposable git repository and returned `status: pass`, `eventCount: 30`. |
| Persistence reload | verified by automated UI and Tauri tests | Desktop tests reopen persisted runs after restart; Tauri tests save/list/open durable run snapshots. |
| Evidence viewer | verified by automated UI, Tauri tests, and packaged sidecar artifacts | Sidecar smoke produced contract, event log, verifier input/result, redacted log, memory store, and replay plan; Tauri tests cover safe evidence listing/reading. |
| Disabled surfaces | verified by automated UI tests and docs scan | Browser, desktop, arbitrary files, terminal, cloud, and billing are labeled unavailable/blocked in private beta UI/docs. |
| No live billing | verified by automated UI tests and docs scan | Runtime copy states no managed AI credits or live billing; docs state no Paddle checkout, subscription state, hosted account, or managed AI credit runtime. |

## Skipped Or Manual Checks

- Visual Tauri window/onboarding confirmation: skipped locally because there is no interactive display capture. First tester must confirm the window opens, onboarding is visible, and the first-run flow matches `docs/productization/private-beta-release-smoke.md`.
- Real Codex smoke: skipped by design. It requires local Codex authentication, network/model budget, and explicit operator opt-in. Use `ORYNT_RUN_REAL_CODEX=1 pnpm walkthrough:real-codex` only as a manual operator check.
- Signed installer/updater checks: not applicable. This beta is unsigned/manual and updater artifacts are disabled.
- Hosted account, cloud sync, billing, browser automation, team account, arbitrary desktop/files/terminal checks: not applicable; these are intentionally out of beta runtime scope.

## Known Limitations

- Unsigned manual Linux tarball only; no AppImage installer artifact is distributed by this release gate.
- No updater, signing, rollback channel, hosted account, cloud sync, team account, live Paddle billing, or managed AI credit runtime.
- Provider setup is Codex CLI readiness only; raw secrets are not stored by Orynt app data, and OS keychain-backed BYOK storage is not implemented.
- Desktop memory/skill management outside persisted repository-run evidence still includes mock-backed surfaces.
- The final GUI smoke must be completed by the first manual tester on a real desktop session before sharing beyond the initial internal test group.

## Tester Instructions

1. Receive `orynt-desktop-0.1.0-linux-x64.tar.gz` and `SHA256SUMS` through the trusted internal channel.
2. Verify checksum from the directory containing both files:

   ```bash
   sha256sum -c SHA256SUMS
   ```

3. Extract and run:

   ```bash
   tar -xzf orynt-desktop-0.1.0-linux-x64.tar.gz
   cd orynt-desktop-0.1.0-linux-x64
   ./orynt-desktop
   ```

4. Complete `docs/private-beta-release-smoke.md` from the extracted archive.
5. Keep `orynt-runner/` next to `orynt-desktop`; repository runs depend on that sidecar bundle.
6. Use a disposable or intentionally selected local directory for beta testing.
7. Do not expect browser automation, general desktop control, arbitrary file control, terminal autonomy, hosted accounts, cloud sync, live billing, or managed AI credits.

## Rollback And Reset

- To stop using this beta, quit Orynt and delete the extracted `orynt-desktop-0.1.0-linux-x64/` directory.
- Local app data on Linux is under `$XDG_CONFIG_HOME/com.codepawl.orynt` or `~/.config/com.codepawl.orynt`.
- To reset local beta state, quit Orynt, optionally archive the app data directory for debugging, then delete that app data directory.
- Reset removes onboarding dismissal, provider references, run history, artifact evidence, memory, and settings for this beta profile.
