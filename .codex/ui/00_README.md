# CodePawl UI Product Pack v0.2

This pack defines the current simple commercial MVP product direction.

CodePawl is now framed as a closed-source desktop product with a free trial. The product UI should feel like a small agent command center: Discord-style navigation, ChatGPT/Claude-style conversation, and Codex-style task supervision. The current P0 is a supervised Coding Apprentice, but the shell must not visually or architecturally imply that CodePawl is only a coding app.

The current desktop implementation in `apps/desktop/src` is the UI source of
truth. When UI direction conflicts, follow the current desktop source,
`DESIGN.md`, `PRODUCT.md`, and the MVP walkthrough.

For current P0 implementation, prioritize repository selection, isolated
worktree status, run milestones, approval checkpoints, diff review, validation
evidence, cost/budget state, and candidate-memory review. Keep memory, skills,
rules, replay, policy, and provenance visible as compact supporting surfaces,
not as the visual center.

Use this pack as Codex reference material before implementing UI.

Recommended reading order:

1. `01_customer_first_product_decision.md`
2. `02_ui_direction.md`
3. `03_information_architecture.md`
4. `04_mvp_routes.md`
5. `05_screen_specs.md`
6. `06_permission_model.md`
7. `07_trial_pricing_packaging.md`
8. `09_component_inventory.md`
9. `10_technical_ui_contract.md`

Primary UI rule: advanced power exists, but default presentation is simple.
Cards are used sparingly, and the Run cockpit is the hero surface.
