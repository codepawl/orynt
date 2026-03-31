# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## First Thing Every Session

**Read `ROADMAP.md` before doing any work.** Check which phase is current, which tasks are checked off, and what's next. Do not start work without confirming current state.

If a task is blocked, document the blocker in ROADMAP.md and move to the next unblocked task. Do not create features not listed in the roadmap without explicit approval.

## Project Overview

CodePawl is an open-source AI/ML community platform with a blog and discussion forum.

**Live:** https://codepawl.com
**Founded:** 2026
**Founder:** An
**Stack:** Bun monorepo, Next.js 16 (App Router), FastAPI, Supabase (PostgreSQL + Auth), Tailwind + Ant Design

## Monorepo Structure

```
codepawl/
├── apps/
│   ├── web/          # Next.js 16 frontend (@codepawl/web)
│   └── api/          # Python FastAPI backend (Koyeb)
├── packages/
│   └── shared/       # @codepawl/shared (shared types, constants, config)
├── ROADMAP.md        # Development roadmap (source of truth for all work)
├── CLAUDE.md         # This file
├── dev.sh            # Start both frontend + API
└── package.json      # Bun workspaces root
```

## Commands

```bash
# Root (Bun workspaces)
bun install                # Install all workspace dependencies
bun run dev                # Dev server (web only)
bun run build              # Production build (web)
bun run dev:api            # Dev server (api, requires Python venv)
./dev.sh                   # Start both frontend + API

# Frontend (apps/web)
cd apps/web
bun run dev
bun run lint               # ESLint
bun run typecheck          # TypeScript check (tsc --noEmit)

# Backend (apps/api)
cd apps/api
source .venv/bin/activate
uvicorn app.main:app --reload
ruff check .               # Linting
pytest                     # Tests
```

Always use `bun`, never `npm`/`yarn`/`pnpm`. Bun auto-loads `.env` files.

## Work Cycle

Every task follows this cycle. Do not skip steps.

```
1. build   — implement the change
2. test    — lint + typecheck + pytest + manual verification
3. commit  — descriptive message: "type(phase): task - description"
4. update  — check off task in ROADMAP.md
```

Commit message format:
- Phase 0: `fix(phase0): 0.1 - remove unused packages`
- Phase 1: `feat(phase1): 1.1 - set up supabase auth`
- Phase 2: `feat(phase2): 2.3 - community API routes`

## Branching Strategy

- `main` — production (auto-deploys to Vercel)
- `staging` — integration testing
- Feature/fix branches created from staging: `fix/*`, `feat/*`

Flow: feature branch > PR to staging > staging > PR to main

## Architecture

### Frontend (apps/web)

- **Framework:** Next.js 16, App Router, React 19, TypeScript 5.5
- **Styling:** Tailwind CSS (primary) + Ant Design 6 (themed via `AntdConfigProvider.tsx`) + `global.css`
- **Dark mode:** next-themes, class-based
- **Animation:** `motion` (motion.dev). Import as `import { motion } from "motion/react"`. Never use `framer-motion`.
- **Icons:** `react-bootstrap-icons`. Never use lucide-react.
- **3D:** Three.js + @react-three/fiber (homepage blob only, may be removed for performance)

**Component locations:**
- `app/components/features/` — domain-specific (animated logo, dino game, homepage, social embeds)
- `app/components/layout/` — nav, footer, inline logo
- `app/components/ui/` — reusable (MDX renderer, theme switch, content card, RepoCard)

**Content systems:**
- Blog: MDX files in `apps/web/content/`. Frontmatter: `title`, `publishedAt`, `summary`, `tags`, `image`. Parsed by `app/lib/posts.ts`.
- Projects: Hybrid ISR, live GitHub stats with 1h revalidation, falls back to static data in `project-data.tsx`.

**MDX rendering** (`app/components/ui/mdx.tsx`):
- Code blocks: `rehype-pretty-code` (shiki), dual themes (`github-light` / `one-dark-pro`)
- Math: KaTeX via `remark-math` + `rehype-katex`
- Custom components: `RepoCard`, `StaticTweet`, `YouTube`, `Callout`, auto-anchor headings

**Navigation:** Plain Next.js `Link` + `motion.div layoutId="nav-active"` for sliding underline. `NavigationLoading.tsx` shows a top loading bar on internal navigation.

**Feed generation:** `app/feed/[format]/route.ts` generates RSS/Atom/JSON. Aliased via rewrites in `next.config.js`.

**Site config:** `app/config.ts` (metadata, social links, `foundedYear: 2026`)

### Backend (apps/api)

- **Framework:** FastAPI 0.115, async, Python 3.12
- **DB:** Supabase (PostgreSQL) via PostgREST client. No ORM.
- **Cache:** TTLCache (in-memory, 1h) for GitHub stats

**API routes:**
- `GET /projects` — live GitHub stats
- `GET /stats/{owner}/{repo}` — single repo stats
- `POST /webhook` — GitHub webhook handler
- `GET /health` — health check
- `GET/POST/PUT/DELETE /api/blog/*` — blog management
- `GET/POST/PUT/DELETE /api/community/*` — community posts, comments, votes

### Shared Package (packages/shared)

Contains:
- TypeScript types shared between frontend and backend (`Profile`, `BlogPost`, etc.)
- Status enums and constants
- API URL config getter

### Database (Supabase)

Current tables: `profiles`, `blog_posts`, `posts`, `comments`, `votes`, `flags`, `notifications`

All tables use Row Level Security (RLS).

## Key Patterns and Rules

### Do
- Use `motion` for animations, not CSS transitions (except simple hover states)
- Use `react-bootstrap-icons` for icons
- ISR with graceful fallback for any backend API calls (never show 500 to users)
- Use `@codepawl/shared` for any types/constants shared between frontend and backend
- Add new MDX components in `mdx.tsx` components mapping
- Commit after each sub-task, not at the end of a phase
- Run lint + typecheck + pytest before every commit

### Do Not
- Do not introduce new UI libraries (stick with Tailwind + Ant Design)
- Do not use `framer-motion`, use `motion/react`
- Do not use `lucide-react`, use `react-bootstrap-icons`
- Do not use `npm`/`yarn`/`pnpm`
- Do not connect frontend directly to Supabase DB (go through FastAPI)
- Do not skip testing in the work cycle
- Do not work on features outside the current roadmap phase
- Do not list products that don't have code (TeamClaw, Lognis, Yeastbook, OpenClaw are NOT products yet)
- **Merge before moving on.** Before starting any new branch, check for unmerged feature/fix branches (`git branch --list "fix/*" "feat/*"`). Verify each passes lint + typecheck + pytest. If clean, create PR and squash merge to staging. If broken, report and stop. Always start new work from latest staging.

### Backend Constraints
- Supabase credentials may not be configured in all environments. Always handle gracefully with 503 fallback.
- Python deps pinned in `requirements.txt`

### Frontend Constraints
- Next.js 16 canary, be aware of potential breaking changes
- `next-mdx-remote` v6 breaks in Turbopack dev mode (production build works fine)
- Public pages (/, /blog, /projects, /about) must never require auth

## Deployment

- **Frontend:** Vercel, root directory `apps/web`. Uses Vercel Analytics + Speed Insights.
- **Backend:** Koyeb (free tier), Docker at `apps/api/`.
- **Env vars (backend):** `CODEPAWL_GITHUB_TOKEN`, `CODEPAWL_WEBHOOK_SECRET`, `CODEPAWL_TRACKED_REPOS`, `CODEPAWL_SUPABASE_URL`, `CODEPAWL_SUPABASE_SECRET_KEY`, `CODEPAWL_SUPABASE_JWT_SECRET`
- **Env vars (frontend):** `BACKEND_API_URL` (server-only, points to Koyeb endpoint)

## Pages

| Route | Description |
|-------|-------------|
| `/` | Homepage, animated logo, recent blog posts |
| `/about` | Org info + expandable team card |
| `/blog`, `/blog/[slug]` | Blog listing + MDX posts |
| `/projects` | Project showcase, live GitHub stats |
| `/community` | Post listing (ranked/new) |
| `/community/submit` | Submit post form |
| `/community/post/[id]` | Post detail + comments |
| `/login` | GitHub OAuth login |
| `/auth/callback` | OAuth callback handler |
| `/profile/[username]` | User profile |
| `/admin` | Admin dashboard (auth required) |
| `/admin/blog` | Blog post management |
| `/admin/community` | Community post/comment management |
| `/admin/moderation` | Flagged content review |
| `/privacy`, `/terms`, `/cookies` | Legal pages |
| 404 | Interactive dino runner game |