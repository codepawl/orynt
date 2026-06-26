# CodePawl Technical Plan — Tauri-first

This folder replaces the earlier Electron-first technical plan.

CodePawl is a closed-source commercial desktop product: a cost-aware semantic control cockpit for computer agents. P0 starts with CLDSA-Lite, a supervised Coding Apprentice that delegates repository tasks to Codex inside isolated worktrees. The architecture must still keep a full-system capability-pack and `SurfaceAdapter` north star.

## New default technical decision

```text
First product platform: Desktop app
First implementation shell: Tauri v2 + React + TypeScript
Native host: Rust, using Tauri commands/events/capabilities
Runtime sidecar: Node.js/TypeScript orchestrator with Codex and repository adapters
Sidecar transport: local stdio JSON-RPC first, localhost only if needed later
First storage: local SQLite
First cloud dependency: none for local alpha; account/license/billing later
First cloud scale target: about 1000 registered users
First automation surface: isolated repository workspace for Coding Apprentice
Future surfaces: browser, desktop, filesystem, terminal via separate adapters and stronger permissions
```

## Why this change

Electron is too heavy for CodePawl's product feel. CodePawl should feel like a clean native utility, not a bundled browser app with another controlled browser inside it.

Tauri keeps the UI shell lighter and gives a better permission/capability model. The P0 runtime uses a Tauri app shell plus a Node sidecar for run orchestration, Codex adapter integration, repository sandboxing, verification, event persistence, and memory extraction. Playwright/browser automation is deferred to the browser-operator capability pack.

## Read order

1. `../plan/cldsa-lite/README.md`
2. `../plan/cldsa-lite/plans/00_CLDSA_LITE_MASTER_PLAN.md`
3. `../plan/cldsa-lite/plans/01_ARCHITECTURE_BOUNDARIES.md`
4. `../plan/cldsa-lite/plans/02_IMPLEMENTATION_ROADMAP.md`
5. `../plan/cldsa-lite/plans/03_DATA_CONTRACTS.md`
6. `../plan/cldsa-lite/plans/04_MVP_VERTICAL_SLICE_CODING_APPRENTICE.md`
7. `cldsa-lite/00_CLDSA_RESEARCH_SYNTHESIS.md`
8. `05_process_model_tauri_sidecar.md`
9. `06_tauri_shell_security_baseline.md`
10. `10_sidecar_protocol.md`
11. `17_token_economy_runtime.md`
12. `23_security_threat_model.md`
13. `39_cloud_backend_scale_1000_users.md`

## Current path contract

Use `.codex/technical/` as the implementation architecture source, `.codex/ui/` as the UI/UX source, and `.codex/plan/` as the product planning source.
