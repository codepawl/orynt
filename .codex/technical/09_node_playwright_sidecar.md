# Node/Playwright Sidecar

## Purpose

The sidecar is the automation runtime. It exists because Playwright and browser-agent tooling are strongest in Node/TypeScript.

## Responsibilities

```text
stdio JSON-RPC server
RunSession lifecycle
Playwright browser launch/context/page
BrowserSurfaceAdapter
semantic UI graph extraction
candidate action ranking
action compiler/verifier
ContextPacket builder
token/cost ledger
model provider adapter calls if configured
trace event generation
```

## Sidecar binary strategy

During development:

```text
pnpm --filter runtime-sidecar dev
```

For packaged app:

```text
bundle sidecar as an external binary through Tauri sidecar support
```

Options:

```text
nexe/pkg/node-sea style binary       -> self-contained Node sidecar
platform-specific node + JS bundle   -> easier, larger
Rust host downloads runtime bundle   -> later, more complex
```

Choose simplest reliable packaging first.

## Browser runtime strategy

```text
Development: use Playwright-installed browser cache
Internal alpha: use installed Chrome/Chromium channel or managed Playwright cache
Commercial beta: choose between bundled browser and first-run managed download
```

A controlled browser is product-essential. The goal is to avoid Electron UI bloat, not to avoid all browser automation dependencies.

## Sidecar failure modes

```text
sidecar_spawn_failed
protocol_version_mismatch
browser_missing
browser_launch_failed
run_crashed
sidecar_unresponsive
model_provider_failed
```

Rust host should surface these as clean UI errors.
