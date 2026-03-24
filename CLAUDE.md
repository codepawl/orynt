# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CoreSen — a personal blog and portfolio site for an AI engineer/data scientist. Bun workspaces monorepo with Next.js 16 frontend, Bun API backend, and shared packages.

Live: https://coresen.vercel.app/

## Monorepo Structure

- `apps/web/` — Next.js frontend (@codepawl/web): App Router, TypeScript, Tailwind CSS, Ant Design, MDX content
- `apps/api/` — Bun API backend (@codepawl/api): Bun.serve on port 3001
- `packages/shared/` — Shared types and utilities (@codepawl/shared)

## Commands

```bash
# Root (runs via Bun workspaces --filter)
bun install              # Install all workspace dependencies
bun run dev              # Dev server (web)
bun run build            # Production build (web)
bun run start            # Production server (web)
bun run dev:api          # Dev server (api)

# Per-app (from app directory)
cd apps/web && bun run dev
cd apps/api && bun run dev
```

Always use `bun` instead of `npm`/`yarn`/`pnpm`. Bun auto-loads `.env` files.

## Architecture

**Content system:** Blog posts are MDX files in `apps/web/content/`. Frontmatter fields: `title`, `publishedAt` (YYYY-MM-DD), `summary`, `tags` (comma-separated), `image` (optional). Parsed by `apps/web/app/lib/posts.ts`.

**Styling layers:**
- Tailwind CSS (primary) with class-based dark mode
- Ant Design components themed via `apps/web/app/components/ui/AntdConfigProvider.tsx`
- Global CSS in `apps/web/app/global.css` (syntax highlighting vars, transitions, fonts)
- next-themes for dark/light mode persistence

**Component organization:**
- `apps/web/app/components/features/` — domain-specific (3D blob, social embeds, homepage)
- `apps/web/app/components/layout/` — nav, footer
- `apps/web/app/components/ui/` — reusable UI (MDX renderer, theme switch, loading states)

**MDX rendering:** `apps/web/app/components/ui/mdx.tsx` provides custom components for code blocks (highlight.js + copy button), math (KaTeX), images (Next.js Image), headings (auto-anchor links), and embeds (Twitter, YouTube).

**Feed generation:** `apps/web/app/feed/[format]/route.ts` generates RSS/Atom/JSON feeds. Aliased via rewrites in `apps/web/next.config.js`.

**Site config:** `apps/web/app/config.ts` holds metadata and social links.

## Branching Strategy

- `main` — production (deployed to Vercel)
- `staging` — integration testing
- `feat/*` — feature branches → merge to staging → then to main

## Deployment

Vercel with root directory set to `apps/web`. Uses Vercel Analytics and Speed Insights.
