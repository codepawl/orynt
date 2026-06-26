# Codex Technical Work Contracts — Tauri-first

Status: legacy browser-first technical work-contract set. Do not use this as
the current P0 implementation path. The current CLDSA-Lite / Coding Apprentice
contracts live in `.codex/plan/cldsa-lite/work-contracts/`. Keep this document
as future browser-operator capability context.

## 0. Repo review

```text
/plan
Goal: Review the current CodePawl repo and map it to the Tauri-first technical plan.
Context: Inspect README.md, package files, source directories, AGENTS.md if present, .codex/ui, and .codex/technical/00_README.md through 05_process_model_tauri_sidecar.md.
Constraints: Do not implement yet. Preserve closed-source commercial positioning, Tauri-first shell, browser-first MVP, and full-system SurfaceAdapter north star. Do not add Electron. Do not add terminal/filesystem/native desktop control in MVP.
Done when: Produce a repo-specific implementation sequence, list P0 blockers, identify reusable code, and choose the first safe work contract.
```

## 1. Bootstrap Tauri app shell

```text
Goal: Create the CodePawl Tauri desktop foundation.
Context: Inspect .codex/technical/02_first_platform_decision_tauri.md, 04_repo_architecture_tauri.md, 05_process_model_tauri_sidecar.md, and 06_tauri_shell_security_baseline.md.
Constraints: Use Tauri v2 + React + TypeScript. Do not use Electron. Keep frontend limited to Tauri commands/events and scoped capabilities. Do not implement live automation yet.
Done when: Tauri app launches, `/app/run` renders with mock data, basic command/event bridge streams mock run events, capability files exist, and lint/typecheck/cargo checks pass.
```

## 2. Implement UI shell from mockups

```text
Goal: Implement the simple commercial CodePawl UI shell.
Context: Inspect .codex/ui/mockups/screens/02_cockpit_run.html, .codex/ui/05_screen_specs.md, and .codex/technical/07_frontend_architecture.md.
Constraints: Keep UI simple: left rail, task sidebar, command/run timeline, right inspector. Use mock runtime data only.
Done when: `/app/run`, `/app/tasks`, `/app/permissions`, `/app/usage`, `/app/settings/billing`, and Settings routes render with mock data and responsive layout; checks pass.
```

## 3. Add Rust sidecar supervisor

```text
Goal: Add a Tauri Rust host supervisor for the runtime sidecar.
Context: Inspect .codex/technical/05_process_model_tauri_sidecar.md, 08_rust_host_core.md, 09_node_playwright_sidecar.md, and 10_sidecar_protocol.md.
Constraints: Use stdio JSON-RPC. Do not expose sidecar to renderer or network. Validate messages. Include health check and graceful shutdown.
Done when: Rust can spawn a mock sidecar, complete handshake, receive event, send health check, and kill/restart sidecar; tests or smoke script pass.
```

## 4. Build Node/TypeScript runtime sidecar skeleton

```text
Goal: Implement the runtime sidecar skeleton.
Context: Inspect .codex/technical/09_node_playwright_sidecar.md and 10_sidecar_protocol.md.
Constraints: Sidecar must speak newline-delimited JSON-RPC over stdio. It should not open a public port. Start with mock run events only.
Done when: Sidecar accepts hello, health.check, run.create, run.cancel, emits mock run events, and has unit tests for protocol parsing.
```

## 5. Implement BrowserSurfaceAdapter

```text
Goal: Implement browser-first SurfaceAdapter using Playwright inside the sidecar.
Context: Inspect .codex/technical/11_surface_adapter_contract.md and 12_browser_surface_adapter_mvp.md.
Constraints: Use local fixture pages in tests. Use ephemeral browser profile first. Screenshots are fallback only.
Done when: Sidecar launches browser, navigates to fixture, observes page, executes click/fill/select, closes cleanly, and integration tests pass.
```

## 6. Implement Semantic UI Graph

```text
Goal: Convert browser observations into compact semantic UI graphs.
Context: Inspect .codex/technical/14_semantic_ui_graph.md and 17_token_economy_runtime.md.
Constraints: Prefer DOM/accessibility data. Assign stable readable element IDs. Generate top-k candidate actions before model call.
Done when: Fixture pages produce deterministic graphs, candidate actions, and graph diffs; tests cover form, modal, dynamic reflow, and table fixtures.
```

## 7. Implement action compiler and verifier

```text
Goal: Execute structured actions safely and verify outcomes.
Context: Inspect .codex/technical/15_action_compiler_and_verifier.md and 24_permission_policy_engine.md.
Constraints: No coordinate-click default. Detect silent no-op. Risky actions must ask Rust host for approval state.
Done when: click/fill/select/wait actions work on fixtures, verifier catches failure, silent-click fixture fails correctly, and trace event is emitted.
```

## 8. Implement token economy runtime

```text
Goal: Make token/cost control part of the runtime.
Context: Inspect .codex/technical/17_token_economy_runtime.md and 18_context_packet_protocol.md.
Constraints: Full graph stays local. Model receives compact ContextPacket. Add budget policy and cost ledger.
Done when: ContextPacket includes top-k actions, budget meter updates in UI, budget threshold triggers stop/approval, and tests cover budget exceeded.
```

## 9. Implement model provider router

```text
Goal: Add provider-agnostic model routing with BYOK.
Context: Inspect .codex/technical/19_model_provider_router.md and 20_weak_model_support_runtime.md.
Constraints: Rust stores keys in OS keychain. Renderer never sees keys. Sidecar receives keys only through secure host request path. Output must be strict JSON.
Done when: Mock model tests pass, one real provider test call works, invalid JSON retry works, and UI displays model used per step.
```

## 10. Implement permissions and approvals

```text
Goal: Add approval gating for risky actions.
Context: Inspect .codex/technical/23_security_threat_model.md and 24_permission_policy_engine.md.
Constraints: Submit/download/upload/delete/payment-like actions must not execute silently. Persistent allows must be scoped.
Done when: Approval card appears, approve/deny changes run behavior, policy decision is stored, and tests cover required approvals.
```

## 11. Package internal alpha

```text
Goal: Package CodePawl Tauri internal alpha.
Context: Inspect .codex/technical/29_infra_ci_cd_release.md, 32_platform_specific_notes.md, and 38_p0_mvp_checklist.md.
Constraints: No Electron. No debug capabilities in production build. Sidecar must be included or managed predictably. Do not ship unredacted logs or secrets.
Done when: Tauri app builds, sidecar is packaged/launchable, fixture demo passes, and P0 checklist is complete.
```
