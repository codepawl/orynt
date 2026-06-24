# Process Model — Tauri + Sidecar

## Process diagram

```text
Tauri WebView Renderer
  React UI only
  no direct filesystem/secrets/sidecar access
  invokes Tauri commands

Tauri Rust Host
  app lifecycle
  command validation
  capability enforcement
  sidecar supervisor
  secure storage/keychain
  event relay to frontend
  license/billing hooks later

Node Runtime Sidecar
  Playwright browser lifecycle
  agent run loop
  semantic UI graph
  action execution
  verifier
  token/cost ledger
  model provider calls if configured

Controlled Browser
  isolated Playwright browser/context
  ephemeral or persistent profile
```

## Command flow

```text
User clicks Run
-> React invokes Tauri command create_run
-> Rust validates payload and permission mode
-> Rust sends JSON-RPC run.create to sidecar
-> Sidecar starts RunSession
-> Sidecar emits run/step events to Rust
-> Rust emits sanitized events to React
```

## Why Rust host should supervise sidecar

The sidecar is powerful because it controls browser automation and may call models. Rust host should:

- spawn it
- monitor health
- restart/kill it
- pass scoped config
- avoid exposing it directly to renderer
- enforce app-level approval decisions

## Sidecar transport

Use **stdio JSON-RPC** first.

Reasons:

- no open local port
- easier to bind lifetime to app process
- simpler security story
- works cross-platform

Only use localhost HTTP/WebSocket if streaming requirements become too painful.

## Sidecar auth

At launch, Rust generates a random session token and passes it to sidecar through environment or initial stdin handshake. Every message includes session ID. Sidecar rejects messages without valid session context.
