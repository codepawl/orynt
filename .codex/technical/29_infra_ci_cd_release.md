# Infrastructure, CI/CD, and Release

## CI jobs

```text
pnpm lint
pnpm typecheck
pnpm test
cargo fmt --check
cargo clippy
cargo test
pnpm tauri build or tauri build smoke
sidecar build smoke
integration tests on fixtures
```

## Release channels

```text
internal
alpha
beta
stable
```

## Packaging

Tauri bundle must include or fetch:

- frontend assets
- Rust app
- sidecar binary
- browser runtime strategy

## Signing

Before public beta:

- macOS code signing/notarization
- Windows signing certificate
- Linux dev preview packaging only

## Auto-update

Add later with signed updates only.
