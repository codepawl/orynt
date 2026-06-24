# First Platform Decision — Tauri

## Decision

Use **Tauri v2 + React + TypeScript + Rust + Node/Playwright sidecar**.

Do not use Electron for the MVP app shell.

## What Tauri owns

```text
native app window
menu/tray/deep links later
frontend permission/capability boundary
Rust command handlers
sidecar supervision
local app settings
secure key storage wrapper
SQLite coordination or repository layer
license/account integration later
```

## What the Node sidecar owns

```text
Playwright browser lifecycle
BrowserSurfaceAdapter
semantic graph extraction from browser observations
action execution in the browser
optional model/provider calls if faster for MVP
runtime event stream back to Rust host
```

## Why sidecar is necessary

Playwright's strongest ecosystem is Node/TypeScript. CodePawl should not block MVP on a pure-Rust browser automation layer. Tauri supports bundling external binaries as sidecars, including binaries written in other languages, so this is a practical architecture.

## Package-size strategy

Tauri avoids bundling Chromium for the app UI. However, a computer-agent product still needs a controlled browser runtime.

Package strategy:

```text
App shell: Tauri webview, small/native
Runtime sidecar: packaged separately inside app bundle
Controlled browser: managed dependency, optionally downloaded/verified on first run or bundled in beta builds
```

This keeps the user-facing app shell lean while preserving reliable automation.

## First platform rollout

```text
Implementation platform: Tauri desktop
Internal alpha: macOS first if that is the builder's fastest environment
Commercial beta priority: Windows + macOS
Linux: dev preview only
```

The codebase must remain cross-platform from day one.

## Rejected options

### Electron

Rejected for MVP because CodePawl would ship a Chromium UI shell plus a controlled automation browser. That creates unnecessary bulk for a product whose brand should feel light and native.

### Web-only SaaS

Rejected because CodePawl needs local browser/computer control and local-first traces.

### Pure Rust browser automation

Rejected for MVP because it slows delivery and reduces access to mature Playwright APIs.

### VS Code extension

Rejected for MVP because it narrows CodePawl into coding workflows instead of full computer-agent control.
