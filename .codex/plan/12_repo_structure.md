# Recommended Repo Structure

Generated: 2026-06-24

## Preferred monorepo structure

```text
codepawl/
  .codex/
    plan/
    ui/
    technical/
    skills/
  apps/
    desktop/
      src/                            # React renderer
      src-tauri/                      # required Tauri v2 Rust host
        src/
          commands/
          sidecar/
          security/
          storage/
          license/
        capabilities/
        tauri.conf.json
  packages/
    ui/                              # shared React components/design tokens
    shared/                          # TypeScript shared types
    ipc-contracts/                   # TS + JSON schema for app/sidecar protocol
    runtime-sidecar/                 # Node/TypeScript sidecar entrypoint
    runtime-core/                    # TS run engine if kept outside sidecar entrypoint
    surface-core/                    # SurfaceAdapter interfaces
    surface-browser/                 # Playwright adapter
    semantic-graph/                  # UI graph builder/ranker
    action-compiler/                 # compile/validate actions
    verifier/                        # expected result checks
    token-economy/                   # context packets/budgets
    model-router/                    # provider adapters and routing
    trace-store/                     # SQLite runtime trace repos
    skill-engine/                    # skill save/replay
    policy-engine/                   # permission/risk logic
    security-shared/                 # redaction/schema helpers
    evals/                           # fixtures and benchmarks
  scripts/
  docs/
  tests/
```

## Package responsibilities

### `packages/ipc-contracts`

JSON schemas and generated or mirrored TypeScript/Rust types for Tauri host, renderer, and sidecar messages.

### `packages/surface-core`

Interfaces for all surface adapters. No Playwright dependency.

### `packages/surface-browser`

Browser-specific implementation using Playwright/CDP.

### `packages/semantic-graph`

Normalizes DOM/accessibility/screenshot-derived observations into compact UI elements.

### `packages/token-economy`

Budgets, context packets, diffing, truncation, cost estimates, prompt cache alignment.

### `packages/runtime-core`

Planner/action loop/router. Uses contracts; does not know UI framework details.

### `packages/action-compiler`

Compiles structured actions to surface-specific operations.

### `packages/verifier`

Checks expected results after actions.

### `packages/trace-store`

Append-only event log, run metadata, screenshots, observations, action results.

### `packages/policy-engine`

Risk scoring and approval gates.

### `packages/model-router`

OpenAI/Anthropic/Gemini/Ollama/local adapter interface and routing policy.

### `packages/security-shared`

Redaction, secret handling, injection filtering, permission checks.

## Root files

```text
AGENTS.md
README.md
CONTRIBUTING.md
SECURITY.md
pnpm-workspace.yaml
package.json
tsconfig.base.json
eslint.config.js
vitest.config.ts
```

## Codex rule

When implementing, Codex should inspect existing repo structure first. If the repo already has conventions, adapt this structure rather than rewriting everything.
