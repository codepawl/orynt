# TanStack + Turborepo Migration Summary

Last visited: 2026-06-09

## Scope
- Migrate `apps/web` from Next.js/OpenNext to TanStack Start + TanStack Router.
- Keep the current routes, marketing content, SEO metadata, styling, and static assets intact.
- Keep the repo on Bun workspaces with Turborepo orchestration.

## Completed Work
- Replaced Next.js app routing with TanStack route modules and a root router bootstrap.
- Ported the marketing pages, docs, product pages, and error/not-found handling.
- Replaced `next/link`, `next/image`, and Clerk Next-specific usage with framework-agnostic or TanStack-compatible equivalents.
- Kept the existing design tokens and global styling, and wired fonts through CSS instead of Next font helpers.
- Removed Next/OpenNext-only configuration and dependencies from the web workspace.
- Updated Turborepo outputs to match the new build artifacts.
- Updated environment variable names to Vite-style `VITE_*` entries.

## Validation
- `bun run typecheck` in `apps/web`
- `bun run test` in `apps/web`
- `bun run build` in `apps/web`

## Notes
- The web migration is structurally complete, but future work may still be needed for deeper TanStack Start integration details, server functions, or production deployment wiring.
