# CodePawl Desktop Private Beta Release Notes

Release channel: internal Linux beta

## Scope

This build is a Repository-only scope beta for the supervised Coding Apprentice path. It supports selecting a local git repository, running a gated repository task through the local Codex CLI provider path, persisting run evidence in the Tauri app data directory, and reopening evidence through the desktop artifact viewer.

Browser automation, general desktop control, arbitrary file control, terminal autonomy, hosted accounts, cloud sync, team accounts, managed AI credits, and live billing are not enabled.

## Distribution

Unsigned/manual distribution is the only supported release path for this beta. Build the internal artifact with:

```bash
pnpm package:desktop:internal
```

The command writes an unsigned Linux tarball and `SHA256SUMS` under `dist/private-beta/`. Share the archive and checksum through the trusted internal channel only.

## Signing And Updates

Updater disabled. The Tauri config keeps `bundle.createUpdaterArtifacts` set to `false`, and the beta tarball includes no update metadata, update endpoint, or signing keys.

Signing is not configured for this private beta. Treat the archive as an internal test artifact, not a production installer.

## Provider And Billing

Provider readiness depends on a locally installed and authenticated Codex CLI. CodePawl stores only a provider reference and preflight status in local app state; it does not store raw API keys in app data or artifacts.

No live billing is present. Paddle, hosted account, license enforcement, managed AI credit, and subscription flows remain out of beta runtime scope.

## Data Locations

On Linux, Tauri app data resolves under `$XDG_CONFIG_HOME/com.codepawl.desktop` or `~/.config/com.codepawl.desktop`.

Important local paths:

- Local app data: app settings, provider references, run index, and run snapshots.
- Artifact evidence: `artifacts/` under app data.
- Memory store: `memory/memory-store.json` under app data.
- Logs and diagnostics: run events, redacted logs, verifier input/result, replay plan, and release manifest in the artifact evidence tree.

Reset instructions: quit CodePawl, archive the app data directory if needed for debugging, then delete the app data directory before relaunching. This resets onboarding, provider references, run history, artifact evidence, memory, and settings for the beta profile.
