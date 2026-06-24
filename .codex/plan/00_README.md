# CodePawl Codex Plans

Generated: 2026-06-24

This directory is the planning source for CodePawl.

CodePawl is a cost-aware semantic control cockpit for computer agents. The north star is full-system control. The MVP starts with browser control because browser surfaces are the easiest place to build reliable observation, action, verification, token budgeting, trace replay, and user approvals.

Do not reduce CodePawl to a browser automation wrapper. Browser is Surface Adapter v1. The long-term product is a full computer-agent control plane.

## How Codex should read this pack

Read in this order:

1. `02_vision_north_star.md`
2. `03_master_plan.md`
3. `04_mvp_scope_feature_breakdown.md`
4. `11_technical_strategy.md`
5. `12_repo_structure.md`
6. `15_surface_adapter_architecture.md`
7. `18_semantic_ui_graph.md`
8. `21_token_economy_engine.md`
9. `23_weak_model_support_runtime.md`
10. `30_security_threat_model.md`
11. `41_codex_work_contracts.md`

## P0 product promise

A user can open CodePawl, launch a controlled browser, give a task, watch the agent operate through structured UI understanding, inspect every action, approve risky steps, see token/cost impact, and save successful flows as replayable skills.

## Non-negotiables

- Full-system north star, browser-first MVP.
- Semantic UI graph before screenshots.
- Cost and token control are core runtime features, not analytics afterthoughts.
- Weak/local model support is a design constraint.
- Every action is inspectable and replayable.
- Permission and approval layers are mandatory.
- Local-first storage by default.
- No autonomous payments, account creation spam, credential exfiltration, destructive file operations, or stealth automation.

## Source of truth

The current planning source of truth is this repository-local structure:

- `.codex/plan/` for product planning, setup, roadmap, requirements, and launch plans.
- `.codex/ui/` for UI/UX direction, routes, screen specs, wireframes, and mockups.
- `.codex/technical/` for implementation architecture, Tauri process model, contracts, and work sequences.
- `.codex/skills/` for CodePawl-specific Codex skills only.
