# TanStack Start Migration Plan

## Summary
Replace `apps/web`’s Next.js App Router implementation with TanStack Start and TanStack Router, keeping the current UI, SEO, auth, and content behavior intact. This is a framework migration only; the backend API, CLI, and shared packages stay in place.

## Key Changes
- Replace Next-specific routing/layout code with TanStack route files, router bootstrap, and server/client entry points.
- Port pages, metadata, and nested layouts to TanStack Router/Start conventions.
- Replace `next/link`, `next/image`, and any `next/*` imports with TanStack-compatible or framework-agnostic equivalents.
- Move data loading and server work to TanStack loaders and `createServerFn` where needed.
- Keep the current workspace package structure and app shell unless a route-level refactor forces a smaller component split.

## Tasks
- [ ] Inventory Next.js usage in `apps/web` and classify each file by route, layout, metadata, server-only logic, and client-only logic.
- [ ] Define the TanStack route tree and map every current Next route into the new file-based structure.
- [ ] Add TanStack Start config, router registration, and the required route generation/bootstrap files.
- [ ] Port shared UI components and page templates without changing visible behavior unless a Next-only primitive requires a replacement.
- [ ] Replace Next image/link and metadata primitives with TanStack or platform-native equivalents.
- [ ] Rework server-side data loading, auth checks, and request/response boundaries for TanStack Start.
- [ ] Remove Next.js-specific config and dependencies once the web app builds and tests successfully under TanStack.

## Test Plan
- Run the web app typecheck and build after each major porting step.
- Verify routing, nested layouts, metadata, forms, auth flows, and SSR/hydration behavior in the migrated app.
- Re-run the repo’s standard JS checks before merge: `bun run typecheck`, `bun run test`, and the web build path.

## Assumptions
- TanStack Start is the target replacement for `apps/web`, not a temporary wrapper around Next.js.
- The repo will keep Bun workspaces unless a separate decision changes package management.
- The migration should preserve current UX and public URLs unless a route mapping issue makes a deliberate change necessary.
