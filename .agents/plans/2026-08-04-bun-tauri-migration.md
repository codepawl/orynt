# Bun and Tauri migration

## Outcome

- Use Bun 1.3.14 as the workspace package manager, runtime, test runner, and build tool.
- Remove all tracked legacy package-manager references and workspace files,
  legacy test/DOM shims, the former desktop shell, and legacy single-executable
  packaging.
- Keep the CLI on the npm registry with a Bun shebang while also publishing Bun-compiled standalone binaries.
- Replace the Tauri compatibility shell with a thin Tauri v2 host over a Bun-compiled `DesktopRuntime` sidecar.

## Implementation

1. Move workspace metadata and scripts to Bun, generate `bun.lock`, and migrate tests to `bun:test` with Happy DOM for renderer tests.
2. Replace Node-specific CLI packaging, smoke checks, audit, and legal tooling with Bun equivalents.
3. Add versioned JSONL sidecar contracts and a single desktop command allowlist, then build a Bun sidecar around `DesktopRuntime`.
4. Add the minimal Tauri host, capabilities, target-triple sidecar packaging,
   and renderer invoke/event adapter; remove legacy desktop-shell files.
5. Update CI, Makefile, documentation, fixtures, and historical plans until
   tracked files contain no legacy pnpm, Electron, Vitest, or jsdom references.

## Validation

- `bun install --frozen-lockfile`
- `bun run test:contracts`
- `bun run test:cli`
- `bun run build:cli`
- `bun run check:desktop`
- full deterministic test/build and release-tooling gates
- packaged Bun CLI and standalone-binary smoke tests
- Tauri frontend, native host, sidecar protocol, failure, and shutdown checks
- live CLI/browser evidence only after deterministic gates and only when prerequisites are available

## Constraints

- Preserve unrelated dirty-worktree changes.
- Desktop behavior remains compatibility-only; business logic stays in TypeScript.
- Do not publish, sign, commit, or push.
