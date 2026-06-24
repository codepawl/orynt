# Repository Architecture — Tauri-first

## Recommended monorepo

```text
codepawl/
  apps/
    desktop/                         # Tauri app
      src/                            # React renderer
      src-tauri/                      # Rust host
        src/
          main.rs
          commands/
          sidecar/
          security/
          storage/
          license/
        capabilities/
        tauri.conf.json
    marketing-site/                   # later
  packages/
    ui/                               # shared React components/design tokens
    shared/                           # TypeScript shared types
    ipc-contracts/                    # TS + JSON schema for app/sidecar messages
    runtime-sidecar/                  # Node/TypeScript sidecar entrypoint
    runtime-core/                     # TS run engine, if kept in sidecar
    surface-core/                     # SurfaceAdapter interfaces
    surface-browser/                  # Playwright adapter
    semantic-graph/                   # browser graph builder/ranker
    action-compiler/                  # compile/validate actions
    verifier/                         # expected result checks
    token-economy/                    # context packets/budgets
    model-router/                     # provider adapters
    trace-store/                      # SQLite repos, TS or Rust depending choice
    skill-engine/                     # skill save/replay
    policy-engine/                    # permission/risk logic
    security-shared/                  # redaction/schema helpers
    evals/                            # fixtures and benchmarks
  .codex/
    plan/
    ui/
    technical/
    skills/
  pnpm-workspace.yaml
  package.json
  turbo.json
```

## Rust crate layout

```text
apps/desktop/src-tauri/src/
  main.rs
  app_state.rs
  commands/
    run.rs
    settings.rs
    approvals.rs
    license.rs
  sidecar/
    supervisor.rs
    protocol.rs
    health.rs
  storage/
    db.rs
    migrations.rs
  security/
    keychain.rs
    redaction.rs
    capabilities.rs
```

## Sidecar package layout

```text
packages/runtime-sidecar/src/
  main.ts
  server/stdioRpc.ts
  runtime/runEngine.ts
  browser/browserSurfaceAdapter.ts
  graph/graphBuilder.ts
  actions/actionCompiler.ts
  verifier/verifier.ts
  token/contextPacketBuilder.ts
  model/modelRouter.ts
  trace/traceWriter.ts
```

## Dependency direction

```text
React renderer -> Tauri commands only
Rust host -> sidecar protocol + storage + security
Node sidecar -> browser/runtime/model/graph packages
shared contracts -> imported by both frontend and sidecar
```

Do not let the renderer call the sidecar directly.
