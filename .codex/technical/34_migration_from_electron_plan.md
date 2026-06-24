# Migration from Electron-first Plan

## Remove old files

If older plan files exist, update them in place to match `.codex/technical`, `.codex/ui`, and `.codex/plan`. Do not restore older Electron-first folders.

## Main changes

```text
Electron shell -> Tauri shell
Electron main process -> Rust host
Preload/IPC bridge -> Tauri commands/events
Node runtime inside Electron -> Node sidecar supervised by Rust
Electron security settings -> Tauri capabilities/permissions
```

## What stays the same

```text
browser-first MVP
full-system SurfaceAdapter north star
semantic UI graph
token economy runtime
weak-model support
trace/replay
permission approvals
commercial closed-source product
```

## Codex warning

Codex must not reintroduce Electron unless the repo already has a working Electron foundation and the user explicitly approves it.
