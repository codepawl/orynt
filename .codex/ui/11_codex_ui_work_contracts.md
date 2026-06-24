# Codex UI Work Contracts

Use these prompts with Codex. Keep them as UI-specific executable work contracts.

## Contract 1 — Review this UI pack

```text
/plan
Goal: Review the CodePawl UI product pack and produce a repo-specific UI implementation sequence.
Context: Inspect .codex/ui/00_README.md, 01_customer_first_product_decision.md, 02_ui_direction.md, 03_information_architecture.md, 04_mvp_routes.md, 05_screen_specs.md, 09_component_inventory.md, 10_technical_ui_contract.md, and mockups/index.html. Then inspect the repo structure, current frontend stack, package files, routing, styling system, and tests.
Constraints: Do not implement yet. Preserve commercial closed-source product direction, simple Discord + ChatGPT/Claude/Codex-style UI, browser-first MVP, Tauri-only shell, and full-system north star. Do not expose raw agent internals in the default UI.
Done when: Produce a concise implementation sequence, missing foundations, UI risks, and the first safe vertical slice.
```

## Contract 2 — Implement app shell

```text
Goal: Implement the CodePawl app shell with workspace rail, task sidebar, top bar, route container, and right inspector placeholder.
Context: Inspect .codex/ui/mockups/screens/02_cockpit_run.html, .codex/ui/03_information_architecture.md, .codex/ui/04_mvp_routes.md, .codex/ui/09_component_inventory.md, and current frontend app structure.
Constraints: Use typed mock data. Do not connect live automation. Keep UI simple and commercial. Preserve `/app/...` route names. Keep advanced surfaces visible as disabled/future, not removed.
Done when: The app renders `/app/run`, `/app/tasks`, `/app/permissions`, `/app/usage`, `/app/settings/billing`, and settings navigation with tests or screenshots proving layout works.
```

## Contract 3 — Implement run cockpit vertical slice

```text
Goal: Implement the Run cockpit screen with chat composer, agent step cards, approval card, browser preview placeholder, permission status, and budget meter.
Context: Inspect .codex/ui/mockups/screens/02_cockpit_run.html, .codex/ui/05_screen_specs.md, .codex/ui/06_permission_model.md, and .codex/ui/10_technical_ui_contract.md.
Constraints: Use mock AgentTask, AgentStep, PermissionPolicy, and UsageBudget data. No real agent actions. Approval buttons only update mock UI state.
Done when: A user can open `/app/run`, see a realistic active task, approve/deny a mock action, and see budget/permission state in the inspector.
```

## Contract 4 — Implement commercial trial/billing UI

```text
Goal: Implement the trial and billing UI for a closed-source commercial MVP.
Context: Inspect .codex/ui/07_trial_pricing_packaging.md and .codex/ui/mockups/screens/06_billing_trial.html.
Constraints: Do not integrate real payments. Clearly show offline-first local alpha state, BYOK notice, plan cards, and upgrade placeholders. Keep prices configurable constants, not scattered literals.
Done when: `/app/settings/billing` renders trial status, plan cards, included features, BYOK notice, and placeholder upgrade actions.
```

## Contract 5 — Implement permissions UI

```text
Goal: Implement the global and per-surface permission settings for the computer agent.
Context: Inspect .codex/ui/06_permission_model.md and .codex/ui/mockups/screens/05_permissions.html.
Constraints: Permission presets must be visible and understandable. Browser is enabled for MVP; Desktop, Files, and Terminal are visible but gated/future. Risky actions are listed explicitly.
Done when: `/app/permissions` lets the user switch Safe/Balanced/Manual in mock state and view/edit placeholder rules without real persistence.
```
