# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CodePawl — an open-source AI/ML community site (blog, portfolio, project showcase). Bun workspaces monorepo with Next.js 16 frontend, Python FastAPI backend, and shared packages. Founded 2026.

Live: https://codepawl.com/

## Monorepo Structure

- `apps/web/` — Next.js frontend (@codepawl/web): App Router, TypeScript, Tailwind CSS, Ant Design, MDX content
- `apps/api/` — Python FastAPI backend: GitHub stats proxy + webhooks, deployed on Koyeb
- `packages/shared/` — Shared types and utilities (@codepawl/shared)

## Commands

```bash
# Root (runs via Bun workspaces --filter)
bun install              # Install all workspace dependencies
bun run dev              # Dev server (web)
bun run build            # Production build (web)
bun run start            # Production server (web)
bun run dev:api          # Dev server (api, requires Python venv)
./dev.sh                 # Start both frontend + API

# Per-app (from app directory)
cd apps/web && bun run dev
cd apps/api && source .venv/bin/activate && uvicorn app.main:app --reload
```

Always use `bun` instead of `npm`/`yarn`/`pnpm`. Bun auto-loads `.env` files.

## Architecture

**Content system:** Blog posts are MDX files in `apps/web/content/`. Frontmatter fields: `title`, `publishedAt` (YYYY-MM-DD), `summary`, `tags` (comma-separated), `image` (optional URL or local path). Parsed by `apps/web/app/lib/posts.ts`.

**Styling layers:**
- Tailwind CSS (primary) with class-based dark mode
- Ant Design components themed via `apps/web/app/components/ui/AntdConfigProvider.tsx`
- Global CSS in `apps/web/app/global.css` (syntax highlighting, transitions, fonts)
- next-themes for dark/light mode persistence

**Animation & Icons:**
- `motion` (motion.dev) for all animations — `AnimatePresence`, `motion.div`, `layoutId` for nav indicator
- `react-bootstrap-icons` for all icons (replaced lucide-react)
- No `framer-motion` — use `import { motion } from "motion/react"`

**Navigation:**
- Plain Next.js `Link` components with `motion.div layoutId="nav-active"` for sliding underline
- No Ant Design Menu, no NavigationContext, no useTransition in nav
- `NavigationLoading.tsx` detects internal link clicks and shows a top loading bar via motion

**Component organization:**
- `apps/web/app/components/features/` — domain-specific (animated logo, dino game, homepage, social embeds)
- `apps/web/app/components/layout/` — nav, footer, inline logo
- `apps/web/app/components/ui/` — reusable UI (MDX renderer, theme switch, content card, code copy button, RepoCard)

**MDX rendering:** `apps/web/app/components/ui/mdx.tsx` provides custom components:
- Code blocks: `rehype-pretty-code` (shiki) with dual themes (`github-light` / `one-dark-pro`), file titles, line highlighting
- Math: KaTeX via `remark-math` + `rehype-katex`
- Custom: `RepoCard` (live GitHub stats), `StaticTweet`, `YouTube`, `Callout`, headings with auto-anchor links
- The `Figure`/`Figcaption` components handle rehype-pretty-code's output structure

**Projects page:** Hybrid ISR — fetches live GitHub stats from backend API (`GET /projects`) with 1-hour revalidation and 8s timeout, falls back to static data in `project-data.tsx`.

**Backend API:** FastAPI with:
- `GET /projects` — returns live GitHub stats for tracked repos
- `POST /webhook` — receives GitHub webhook events (push, star, release, issues)
- In-memory store updated by webhooks, cold-start populates from GitHub API

**Feed generation:** `apps/web/app/feed/[format]/route.ts` generates RSS/Atom/JSON feeds. Aliased via rewrites in `apps/web/next.config.js`.

**Site config:** `apps/web/app/config.ts` holds metadata (`foundedYear: 2026`), social links.

**Pages:**
- `/` — Homepage with animated logo and recent blog posts
- `/about` — Organization info + expandable team card with CV (click to expand)
- `/blog` + `/blog/[slug]` — Blog listing and MDX posts
- `/projects` — Project showcase with live GitHub stats
- `/privacy`, `/terms`, `/cookies` — Legal pages (linked from footer)
- 404 — Interactive dino runner game (Canvas 2D, Chrome T-Rex inspired physics)

## Branching Strategy

- `main` — production (deployed to Vercel)
- `staging` — integration testing
- `feat/*` — feature branches → merge to staging → then to main

## Deployment

- **Frontend:** Vercel with root directory set to `apps/web`. Uses Vercel Analytics and Speed Insights.
- **API:** Koyeb (Free tier) via Dockerfile at `apps/api/`. Env vars: `CODEPAWL_GITHUB_TOKEN`, `CODEPAWL_WEBHOOK_SECRET`, `CODEPAWL_TRACKED_REPOS`.
- **Environment:** `BACKEND_API_URL` (server-only) in Vercel for the Koyeb endpoint.

## Key Patterns

- Use `motion` for animations, not CSS transitions (except simple hover states)
- Use `react-bootstrap-icons` for icons, not lucide-react
- ISR with graceful fallback for any backend API calls (never show 500)
- `fetchProjectStats()` in `app/lib/projects.ts` is reusable for any component needing GitHub stats
- MDX components registered in `mdx.tsx` components mapping — add new ones there
