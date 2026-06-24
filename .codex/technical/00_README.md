# CodePawl Technical Plan — Tauri-first

This folder replaces the earlier Electron-first technical plan.

CodePawl is a closed-source commercial desktop product: a cost-aware semantic control cockpit for computer agents. MVP starts with browser control, but the architecture must keep a full-system `SurfaceAdapter` north star.

## New default technical decision

```text
First product platform: Desktop app
First implementation shell: Tauri v2 + React + TypeScript
Native host: Rust, using Tauri commands/events/capabilities
Browser automation runtime: Node.js/TypeScript sidecar using Playwright
Sidecar transport: local stdio JSON-RPC first, localhost only if needed later
First storage: local SQLite
First cloud dependency: none for local alpha; account/license/billing later
First cloud scale target: about 1000 registered users
First automation surface: controlled browser
Future surfaces: desktop, filesystem, terminal via separate adapters and stronger permissions
```

## Why this change

Electron is too heavy for CodePawl's product feel. CodePawl should feel like a clean native utility, not a bundled browser app with another controlled browser inside it.

Tauri keeps the UI shell lighter and gives a better permission/capability model. Playwright/browser automation still needs a dedicated runtime; therefore the MVP uses a Tauri app shell plus a Node sidecar for the browser agent runtime.

## Read order

1. `01_technical_north_star.md`
2. `02_first_platform_decision_tauri.md`
3. `03_mvp_technical_scope.md`
4. `04_repo_architecture_tauri.md`
5. `05_process_model_tauri_sidecar.md`
6. `06_tauri_shell_security_baseline.md`
7. `09_node_playwright_sidecar.md`
8. `10_sidecar_protocol.md`
9. `11_surface_adapter_contract.md`
10. `17_token_economy_runtime.md`
11. `23_security_threat_model.md`
12. `33_implementation_sequence.md`
13. `35_codex_work_contracts.md`
14. `39_cloud_backend_scale_1000_users.md`

## Current path contract

Use `.codex/technical/` as the implementation architecture source, `.codex/ui/` as the UI/UX source, and `.codex/plan/` as the product planning source.
