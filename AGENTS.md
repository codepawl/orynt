# Orynt Agent Guide

Orynt is an implemented pnpm workspace: a Tauri v2 + React desktop private beta and a Vite + React marketing application backed by workspace packages. The desktop product provides supervised, repository-only work; the marketing site communicates that product without implying a broader executable or hosted surface.

## Repository Map

- `apps/desktop`: active desktop product; `apps/desktop/src` owns the product UI and `apps/desktop/src-tauri` is the native boundary.
- `apps/marketing-site`: marketing application; `apps/marketing-site/src` owns the marketing UI.
- `packages/shared` and `packages/ipc-contracts`: shared types, utilities, and IPC contracts.
- `packages/*`: orchestration and runtime packages, including the cognitive kernel, gateway, memory, verifier, repository sandbox, adapters, skill registry, and evaluation harness.
- `docs`: product, release, and technical guidance.
- `scripts`: operational tooling and repository checks.
- `assets`: shared fonts, illustrations, and visual assets.

## Working Rules

- Keep runtime code in `apps/*` and `packages/*`, product and release guidance in `docs/*`, operational tooling in `scripts/*`, and shared visual assets in `assets/*`.
- Inspect the relevant app and its existing owned implementation before changing behavior or UI.
- For user-facing UI, MUST read and follow `DESIGN.md`, the UI contract for `apps/marketing-site/src` and `apps/desktop/src`, unless an explicit product requirement conflicts.
- Reuse or extend owned code before creating a parallel implementation.
- Use an already-installed external dependency only when repository search proves no suitable owned layer exists.

## Verification

- Run the touched workspace's own scripts first: `pnpm --filter @codepawl/desktop test`, `pnpm --filter @codepawl/desktop build`, `pnpm --filter @codepawl/marketing-site test`, or `pnpm --filter @codepawl/marketing-site build` as applicable.
- Run `pnpm test:contracts` when shared or IPC contracts change, and `pnpm test:tauri` when the Tauri boundary changes.
- There is no root lint script. Agents MUST NOT claim lint passed unless a future manifest adds one.
