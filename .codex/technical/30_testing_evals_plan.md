# Testing and Evals Plan

## Test layers

```text
Rust unit tests: commands, sidecar supervisor, settings, keychain wrappers
TS unit tests: graph builder, action compiler, budgeter, model parser
Protocol tests: Rust <-> sidecar JSON-RPC
Integration tests: Playwright fixture pages
E2E tests: Tauri app mock run
```

## Fixture pages

```text
login
form
modal
table
dynamic-reflow
overlay-block
silent-click
download
canvas-fallback
```

## Eval metrics

```text
task success rate
steps per task
model calls per task
tokens per success
screenshot count
approval correctness
silent failure detection
replay success rate
```
