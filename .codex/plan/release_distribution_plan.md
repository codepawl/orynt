# CodePawl Release and Distribution Plan

## Distribution principles

CodePawl turns every AI coding session into measurable engineering work. Distribution should make that local value easy to reach, but packaging polish must not outrun the report engine.

Principles:

* Local-first distribution first. The initial install path should work without CloudPawl, auth, billing, desktop packaging, or a cloud account.
* Product value before packaging polish. Do not optimize multi-platform distribution before fixture and real-repo reports are useful.
* Simple dev install first. v0.1 can rely on Rust tooling and documented local commands.
* Cross-platform packaging later. Linux is the first practical target; full Linux/macOS/Windows packaging comes after the CLI/report engine proves value.
* CLI remains product core. npm, Homebrew, desktop, and installers should wrap or distribute the Rust binary, not replace it.
* Manual/dev release first. Automated public release infrastructure comes later.
* No cloud requirement for local CLI. Public binaries, wrappers, and desktop shells must preserve local-first behavior.

## Release stages

### Stage 0: dev/local install

Goal: make the CLI easy to build and run locally while the report engine is still evolving.

Includes:

* `cargo run -p codepawl-cli -- analyze --fixture fixtures/sessions/basic`
* `cargo install --path crates/codepawl-cli` after the CLI crate exists and local install behavior is verified
* documented prerequisites
* `just` recipes for local checks
* manual changelog/release notes

Does not include:

* public binary release automation
* npm wrapper
* Homebrew formula
* desktop installers
* signing
* SLSA/provenance

### Stage 1: first public binary release

Goal: publish downloadable binaries once local CLI/report value is proven.

Includes:

* GitHub Releases
* release assets
* Linux binary first
* macOS/Windows binaries later
* checksums from the first real public binary release
* manual changelog
* manual smoke checks

Tooling:

* Manual release first.
* `cargo-dist` planned later for binary packaging and release automation.

### Stage 2: npm wrapper

Goal: lower install friction for Node/devtool users after the binary shape stabilizes.

Includes:

* npm package wrapper later
* download or invoke a prebuilt Rust binary later
* support for use in GitHub Action/devtool contexts later

Constraints:

* Not in v0.1.
* Should not become product core.
* Should not reimplement the report engine in TypeScript.

### Stage 3: Homebrew tap

Goal: support common macOS/Linux developer install flows after stable binary releases exist.

Includes:

* Homebrew tap later
* formula updates after release assets and checksums are consistent
* documented install and upgrade commands later

Constraints:

* Not in v0.1.
* Do not add formula before public binary release shape stabilizes.

### Stage 4: Tauri desktop installers

Goal: package Studio and daemon as a desktop shell after local Studio is useful.

Includes:

* Tauri desktop installers later
* local daemon/Studio launch
* daemon health checks
* local status/tray behavior later
* Linux first, then macOS/Windows

Constraints:

* Desktop is packaging, not product core.
* Do not build desktop before local core and Studio are useful.
* Prefer waiting until GitHub Action or hook integration creates enough returning-user value.
* CLI must remain usable without desktop.

### Stage 5: signed/provenance-hardened releases

Goal: strengthen supply-chain trust after public distribution exists.

Includes later:

* release signing
* stronger provenance
* SLSA-aligned build metadata
* reproducibility improvements
* automated release workflows with no secrets exposed to untrusted code

Constraints:

* Not v0.1 work.
* Do not add signing/provenance complexity before public binary distribution is stable.

## v0.1 local install

v0.1 install path is developer/local first.

Required documented commands:

```bash
cargo run -p codepawl-cli -- analyze --fixture fixtures/sessions/basic
cargo run -p codepawl-cli -- report --last
```

After the CLI crate exists and local install behavior is verified, document:

```bash
cargo install --path crates/codepawl-cli
codepawl analyze --fixture fixtures/sessions/basic
```

Do not present a workspace-root `cargo install` as the default path unless the workspace root actually installs the CLI binary.

Recommended local validation commands:

```bash
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
cargo build --workspace
```

Prerequisites to document:

* Rust toolchain
* `cargo`
* `mise` for pinned tool versions once configured
* `just` for project recipes once configured
* Node/pnpm only when TypeScript surfaces exist

v0.1 constraints:

* No global installer requirement.
* No GitHub Releases requirement.
* No npm wrapper requirement.
* No Homebrew requirement.
* No desktop installer requirement.
* No release automation requirement.
* No CloudPawl requirement.

v0.1 is ready for local release only after:

* fixture report works
* real-repo analysis works
* JSON and Markdown reports are stable enough for local use
* local install docs exist
* release checklist exists

## GitHub Releases plan

GitHub Releases start after the CLI/report engine proves value.

First public binary release should include:

* changelog/release notes
* binary assets
* checksums
* supported platform notes
* basic install instructions
* known limitations

Platform order:

1. Linux first.
2. macOS later.
3. Windows later.

Release assets later:

* `codepawl-<version>-linux-<arch>.tar.gz`
* `codepawl-<version>-macos-<arch>.tar.gz`
* `codepawl-<version>-windows-<arch>.zip`
* checksum file

Release process:

* Manual first.
* `cargo-dist` later for binary packaging and release automation.
* Do not add `cargo-dist` config until release automation becomes valuable.

Checksums:

* Include checksums from the first real public binary release.
* Checksums should be published with release assets.
* Users should be able to verify downloaded binaries manually.

## npm wrapper plan

The npm wrapper is planned, not v0.1 work.

Purpose:

* lower install friction for Node/devtool users
* simplify use from JavaScript-heavy environments
* support future GitHub Action or CI wrapper workflows

Expected behavior later:

* download a matching prebuilt Rust binary, or
* invoke an already installed `codepawl` binary, or
* provide a thin wrapper around the Rust CLI

Constraints:

* The npm package must not become the product core.
* Do not reimplement local analysis in TypeScript.
* Do not require CloudPawl.
* Do not publish before the Rust binary shape stabilizes.
* Plan after GitHub Action or after public binary release shape is stable.

## Homebrew plan

Homebrew is planned, not v0.1 work.

Purpose:

* support familiar developer install and update flow
* improve macOS/Linux adoption after stable binary releases exist

Expected behavior later:

```bash
brew install codepawl
brew upgrade codepawl
```

Constraints:

* Create a Homebrew tap only after GitHub Releases assets/checksums are consistent.
* Formula updates should follow stable public releases.
* Do not add a formula during v0.1 local/dev release work.

## Tauri desktop plan

Tauri desktop distribution comes after local Studio is useful.

Desktop responsibilities later:

* start/stop local daemon
* open Studio
* show daemon health
* manage local status
* manage integrations in UI
* provide desktop install/update experience later

Timing:

* after v0.2 Studio has useful local project/session/report views
* preferably after GitHub Action or hooks create enough user value
* after CLI/report engine remains useful without desktop

Constraints:

* Desktop shell is packaging, not product core.
* Desktop must not become required for CLI use.
* Desktop must keep data in the local-first model.
* No CloudPawl requirement.
* Package Linux first, then macOS/Windows later.

## Versioning and changelog

Versioning:

* Use SemVer.
* v0.x is fast iteration.
* Breaking changes are allowed before v1.0 if documented.
* Public report schema changes must be called out clearly.
* CLI command changes must be called out clearly.

Changelog:

* Manual changelog first.
* Keep release notes concise and user-facing.
* Mention report quality changes, fixture coverage changes, CLI behavior changes, and security/privacy changes.
* CodePawl-generated release report can come later after report generation is useful.

Suggested changelog sections:

* Added
* Changed
* Fixed
* Security
* Known limitations

## Supply-chain hardening

v0.1:

* no release workflow secrets required
* no signing requirement
* no SLSA/provenance requirement
* no automated public release pipeline

First public binary release:

* publish checksums
* document verification steps
* keep release artifacts auditable
* avoid embedding secrets or local paths in binaries/artifacts

Later hardening:

* binary signing
* provenance metadata
* SLSA-aligned release process
* reproducible build improvements
* automated release workflows
* stricter dependency/audit checks

Release workflow security:

* no secrets in release workflows exposed to untrusted code
* no privileged release jobs triggered by untrusted PRs
* release artifacts should be reproducible enough to audit later
* release notes should not include secrets, private paths, or raw logs

## Release validation gates

### v0.1 local release gate

Required:

```bash
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
cargo build --workspace
cargo install --path crates/codepawl-cli
codepawl analyze --fixture fixtures/sessions/basic
```

Also required:

* fixture report tests pass
* real-repo analysis works when implemented
* basic local install docs exist
* release checklist exists
* no cloud requirement

Checksums are not required for v0.1 dev/local install.

### Public binary release gate

Required:

* v0.1 local release gate passes
* platform binary builds complete
* binary smoke test runs
* checksums generated
* changelog/release notes written
* install instructions written
* no secrets or private paths in release artifacts

### GitHub Action release gate

Required after GitHub Action exists:

```bash
pnpm --filter github-action lint
pnpm --filter github-action typecheck
pnpm --filter github-action test
pnpm --filter github-action build
```

Also required:

* Action works without CloudPawl account or token.
* No source upload by default.
* PR report is redacted before comment/summary/artifact upload.
* Token permission checklist passes.

### Desktop release gate

Required after desktop exists:

* Studio is useful locally.
* Daemon can be started or detected.
* Tauri app opens Studio.
* App detects daemon health.
* CLI remains usable without desktop.
* Local data remains under the local-first storage model.
* Linux package works first.

## Update mechanism

Initial:

* manual build
* manual download after public binaries exist
* `cargo run -p codepawl-cli -- ...` for local development
* `cargo install --path crates/codepawl-cli` after the CLI crate exists

Later:

* `codepawl upgrade`
* npm wrapper latest-version install
* Homebrew updates
* desktop updater after Tauri packaging exists

Constraints:

* No updater is required in v0.1.
* Upgrade mechanism must not require CloudPawl for local CLI.
* Upgrade checks must not introduce telemetry by default.

## Done-when criteria

This plan is complete when:

* release/distribution plan exists
* stages are clear
* local install first is explicit
* broad distribution later is explicit
* v0.1 local install path is clear
* v0.1 release gate is defined
* future GitHub Releases are planned
* future npm wrapper is planned
* future Homebrew tap is planned
* future Tauri desktop installers are planned
* checksums are required for the first public binary release
* signing and SLSA/provenance are documented as future hardening
* no release automation is implemented by this plan
