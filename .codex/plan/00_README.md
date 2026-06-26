# CodePawl Codex Plans

Generated: 2026-06-24

This directory is the planning source for CodePawl.

CodePawl is a cost-aware semantic control cockpit for computer agents. The north star is full-system control. The current P0 starts with CLDSA-Lite: a supervised Coding Apprentice that delegates repository tasks to Codex inside an isolated worktree, verifies outcomes, records append-only evidence, controls cost, and proposes candidate memory from user corrections.

Do not reduce CodePawl to a coding-agent wrapper. Codex is an executor/provider behind a CodePawl adapter, not the system architecture. Browser automation remains a future capability pack behind the same permissioned SurfaceAdapter architecture.

## How Codex should read this pack

Read in this order:

1. `cldsa-lite/README.md`
2. `cldsa-lite/plans/00_CLDSA_LITE_MASTER_PLAN.md`
3. `cldsa-lite/plans/01_ARCHITECTURE_BOUNDARIES.md`
4. `cldsa-lite/plans/02_IMPLEMENTATION_ROADMAP.md`
5. `cldsa-lite/plans/03_DATA_CONTRACTS.md`
6. `cldsa-lite/plans/04_MVP_VERTICAL_SLICE_CODING_APPRENTICE.md`
7. `cldsa-lite/plans/05_EVALS_AND_MATURITY.md`
8. `cldsa-lite/work-contracts/00_NEXT_AFTER_REPO_AUDIT.md`

## P0 product promise

A user can open CodePawl, select a local repository, describe a small coding task, watch Codex work in an isolated worktree, inspect every event and diff, approve risky actions, see validation and token/cost evidence, and convert corrections into candidate memory or skills.

## Non-negotiables

- Full-system north star, Coding Apprentice P0.
- Run is the central execution primitive.
- RunEvent is append-only.
- Deterministic verification is required before success.
- Codex is an adapter/provider, not the product architecture.
- Stable and Candidate knowledge remain separate.
- Browser operator is a future capability pack.
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
