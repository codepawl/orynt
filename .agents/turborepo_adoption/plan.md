# Turborepo Adoption Plan

## Summary
Add Turborepo to the existing Bun workspace so repository tasks can run with cache-aware orchestration. This is a build and task-running improvement, not a package-manager migration.

## Key Changes
- Add root Turborepo configuration and package scripts for workspace orchestration.
- Define task pipelines for `dev`, `build`, `typecheck`, `test`, and any repo-specific checks that benefit from caching.
- Keep existing package manifests and Bun workspace layout intact.
- Make the Turborepo layer compatible with the eventual TanStack web migration so the migration can use the same task graph.

## Tasks
- [ ] Decide the minimum Turbo version and root config shape that fits the current workspace without changing package-manager behavior.
- [ ] Add `turbo.json` with explicit task dependencies and cache outputs for the repo’s current scripts.
- [ ] Update the root `package.json` scripts to call Turbo for the common monorepo workflows.
- [ ] Verify that package-local scripts still work directly and that Turbo does not change functional behavior.
- [ ] Document the new workflow in the repo docs so contributors know when to use Turbo versus direct Bun commands.

## Test Plan
- Run the existing root checks through the new workflow and directly through Bun to confirm parity.
- Verify that cached tasks are correct and do not hide failures or stale outputs.
- Re-run `bun run typecheck`, `bun run test`, and any new Turbo-backed equivalents after the config lands.

## Assumptions
- Turborepo is being added for task orchestration and caching, not to replace Bun workspaces.
- The repo should preserve existing package names and script entry points.
- The TanStack migration will reuse the Turbo task graph rather than creating a separate build system.
