# Codex Execution Work Contracts

Generated: 2026-06-24

Status: legacy browser-first work-contract set. Do not use this as the current
P0 implementation path. The current path is CLDSA-Lite / Coding Apprentice in
`.codex/plan/cldsa-lite/work-contracts/`. Keep this file as future
browser-operator capability material.

Use these prompts with Codex. Keep them as executable work contracts.

## Contract 1: Inspect and sequence

```text
/plan
Goal: Produce a repo-specific implementation sequence for the CodePawl MVP without changing code.
Context: First inspect .codex/plan/00_README.md, .codex/plan/02_vision_north_star.md, .codex/plan/03_master_plan.md, .codex/technical/00_README.md, .codex/technical/02_first_platform_decision_tauri.md, .codex/technical/04_repo_architecture_tauri.md, .codex/ui/00_README.md, and current repo files including AGENTS.md if present.
Constraints: Preserve Tauri-only shell, browser-first MVP, full-system SurfaceAdapter north star, local-first traces, token/cost control, and policy gates. Do not implement yet.
Done when: Return a concise phased build sequence, P0 blockers, proposed repo changes, and the first safe implementation contract.
```

## Contract 2: Tauri app foundation with mock run events

```text
Goal: Create the first CodePawl app foundation.
Context: Inspect .codex/technical/04_repo_architecture_tauri.md, .codex/technical/05_process_model_tauri_sidecar.md, .codex/technical/06_tauri_shell_security_baseline.md, .codex/ui/03_information_architecture.md, .codex/ui/04_mvp_routes.md, and .codex/ui/10_technical_ui_contract.md.
Constraints: Use Tauri v2 + React + TypeScript. Do not use Electron. Do not add cloud backend. Do not connect live browser automation. Renderer must call Tauri commands/events only.
Done when: Tauri app launches, `/app/run` renders mock cockpit UI, a Tauri command emits mock run events to the renderer, scoped capabilities exist, and documented lint/typecheck/build checks pass.
```

## Contract 3: Sidecar skeleton

```text
Goal: Add a supervised Node/TypeScript sidecar skeleton.
Context: Inspect .codex/technical/05_process_model_tauri_sidecar.md, .codex/technical/09_node_playwright_sidecar.md, and .codex/technical/10_sidecar_protocol.md.
Constraints: Sidecar speaks newline-delimited JSON-RPC over stdio. Rust host supervises lifecycle. No public port. Start with hello, health.check, run.create mock events, run.cancel, and shutdown.
Done when: Rust starts sidecar, handshake succeeds, health check works, mock run events stream sidecar -> Rust -> UI, and cancel/kill/restart behavior is covered.
```

## Contract 4: SurfaceAdapter contracts

```text
Goal: Implement shared SurfaceAdapter, ObservationGraph, CandidateAction, CompiledAction, ActionResult, VerificationResult, PolicyDecision, ContextPacket, and sidecar RPC schemas.
Context: Inspect .codex/technical/10_sidecar_protocol.md, .codex/technical/11_surface_adapter_contract.md, .codex/technical/18_context_packet_protocol.md, and .codex/plan/27_api_contracts_types.md.
Constraints: Generic surface contracts must not import Playwright or UI framework types. Protocol schemas live in packages/ipc-contracts. Surface interfaces live in packages/surface-core. Validate external inputs with Zod or generated schema validators.
Done when: Types compile, protocol validation tests pass, and packages can import contracts without circular dependencies.
```

## Contract 5: Browser adapter MVP

```text
/plan
Goal: Build the browser SurfaceAdapter MVP for Chromium control.
Context: Inspect .codex/technical/12_browser_surface_adapter_mvp.md, .codex/technical/14_semantic_ui_graph.md, .codex/technical/15_action_compiler_and_verifier.md, and current sidecar runtime.
Constraints: Use Playwright/CDP only inside browser adapter. Do not send full DOM/screenshots to models by default. Do not bypass CAPTCHA or site protections. Use isolated browser profile per workspace or ephemeral fixture profile.
Done when: Sidecar can launch browser, navigate to a local fixture URL, capture structured observations, list candidate actions, execute click/fill/scroll/wait, and write trace events to trace.db.
```

## Contract 6: Semantic UI Graph and token context

```text
Goal: Implement Semantic UI Graph generation and compact ContextPacket creation.
Context: Inspect .codex/technical/14_semantic_ui_graph.md, .codex/technical/17_token_economy_runtime.md, and .codex/technical/18_context_packet_protocol.md.
Constraints: Prefer accessibility/DOM semantics over screenshots. Filter hidden/inert/noisy nodes. Include stable element IDs, risk metadata, ranked candidate actions, and token estimates. Screenshots remain fallback only.
Done when: Local fixture pages produce deterministic graph snapshots and candidate/context packets with unit/golden tests.
```

## Contract 7: Agent loop, verifier, and approvals

```text
/plan
Goal: Implement a safe browser task loop with verifier and approval gates.
Context: Inspect .codex/technical/15_action_compiler_and_verifier.md, .codex/technical/16_agent_orchestration.md, .codex/technical/23_security_threat_model.md, and .codex/technical/24_permission_policy_engine.md.
Constraints: Model output must be strict JSON. Runtime validates targets and policy before execution. No free-form code/shell execution. Risky submit/send/export/download/delete/payment-like actions require Rust-host approval state.
Done when: A simple form-fill task completes against local fixtures, pauses before submit, records action ledger and verifier results, and malicious model output cannot bypass policy.
```

## Contract 8: BYOK model routing

```text
Goal: Add provider-agnostic model routing with BYOK.
Context: Inspect .codex/technical/19_model_provider_router.md, .codex/technical/20_weak_model_support_runtime.md, and .codex/technical/25_privacy_secrets_retention.md.
Constraints: Renderer never sees provider keys. Rust stores keys in OS keychain. Sidecar receives keys only through secure host request path. First provider is chosen during implementation planning if not already decided.
Done when: One real provider can be configured, model output is schema-validated, token/cost estimates appear in the run ledger, and redaction tests pass.
```

## Contract 9: Trace, replay, and skill MVP

```text
/plan
Goal: Implement trace inspection and first skill replay flow.
Context: Inspect .codex/technical/21_trace_store_data_model.md, .codex/technical/22_skill_recorder_replay_engine.md, and .codex/technical/28_storage_sqlite_migrations.md.
Constraints: Sidecar owns trace.db. Rust owns app.db. Trace is append-only. Replay must prefer deterministic actions and use model only for mismatch/recovery. Risk policy still applies during replay.
Done when: A successful form-fill run can be saved as a skill, replayed, and compared against the original run for token/model-call reduction.
```

## Contract 10: Evals and internal alpha package

```text
Goal: Add MVP evals, docs, and Tauri packaging readiness.
Context: Inspect .codex/technical/29_infra_ci_cd_release.md, .codex/technical/30_testing_evals_plan.md, .codex/technical/32_platform_specific_notes.md, .codex/technical/38_p0_mvp_checklist.md, and .codex/plan/44_launch_checklist.md.
Constraints: Do not add cloud services. Keep eval fixtures local. Do not include secrets in repo. No Electron. No debug capabilities in production build.
Done when: Local browser fixture evals run, README explains setup/privacy/limitations, Tauri build includes or manages sidecar predictably, and P0 checklist passes.
```
