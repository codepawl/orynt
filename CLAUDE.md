# Project rules for Claude Code

Read this file first in every session.

## What this project is

Codepawl is the public website and product surface for an AI agent company. It hosts the open-source product catalog (OpenPawl, Featcat, HebbMem, TurboQuant, Cachepawl, KStudio), curated AI/ML research notes, documentation, and a path into KStudio (the closed product). The audience is AI/ML engineers building agents, ML practitioners, and researchers.

The site is the marketing and developer-relations layer. App-style features (community forum, paper reproductions, challenges) live behind `(app)` route group and reuse the same monorepo but a different layout shell.

## Tech stack (locked)

- Language: TypeScript (frontend), Python 3.12+ (backend)
- Package manager: `bun add` for JS/TS, `uv add` for Python (never npm/yarn/pnpm/pip)
- Frontend framework: Next.js 16 App Router with React Server Components by default
- Styling: Tailwind v4 (CSS-first `@theme` directive), plus design tokens in `:root` CSS variables
- UI library: pure Tailwind for `(marketing)` route group, Ant Design themed for `(app)` route group
- Animation: `motion` from `motion/react` (never `framer-motion`)
- Icons: `react-bootstrap-icons` (never `lucide-react`)
- Backend framework: FastAPI on Koyeb, single gateway to Supabase
- Database: Supabase Postgres with Auth, Realtime, Storage
- Migration tool: Supabase CLI migrations in `apps/api/migrations/`
- Auth: Supabase Auth with JWT, verified server-side in FastAPI middleware
- Transactional email: Resend with React Email templates
- Captcha: Cloudflare Turnstile (invisible)
- Analytics: PostHog (self-hosted on Koyeb or cloud free tier, decide in OPS.md)
- Error tracking: Sentry for both Next.js and FastAPI
- Rate limiting: `slowapi` on FastAPI, in-memory backend until distributed needed

## Monorepo layout

```
apps/
  web/          Next.js 16 frontend
  api/          FastAPI backend
packages/
  shared/       Shared TypeScript types and JSON schemas
```

Bun workspaces drives the JS side. Python lives in `apps/api/` with its own `pyproject.toml`.

## Commands

- Install JS deps: `bun install`
- Install Python deps: `cd apps/api && uv sync`
- Run web dev: `bun --filter @codepawl/web dev`
- Run API dev: `cd apps/api && uv run uvicorn main:app --reload`
- Typecheck web: `bun --filter @codepawl/web typecheck`
- Typecheck API: `cd apps/api && uv run mypy .`
- Lint web: `bun --filter @codepawl/web lint`
- Lint API: `cd apps/api && uv run ruff check .`
- Format API: `cd apps/api && uv run ruff format .`
- Test web: `bun --filter @codepawl/web test`
- Test API: `cd apps/api && uv run pytest`
- Build web: `bun --filter @codepawl/web build`
- Migrate DB: `cd apps/api && uv run supabase migration up`

## Conventions

- All identifiers, comments, docstrings: English only
- Strict typing: TypeScript `strict: true` and `noUncheckedIndexedAccess: true`. Python `mypy --strict`. No `any`, no `# type: ignore`, no escape hatches
- Formatter: Ruff for Python, Biome or Prettier for TS (one or the other, not both)
- Line length: Python 100, TypeScript 100
- Test framework: pytest for Python, vitest for TypeScript
- Naming: `kebab-case` for files and folders, `PascalCase` for React components, `camelCase` for functions and variables, `snake_case` for Python
- Server Components by default in Next.js. Add `"use client"` only when you need state, refs, browser APIs, or event handlers
- Tailwind classes use design tokens, not arbitrary values. `bg-ink-1` not `bg-[#0B0E13]`
- Dark mode is default. Light mode is opt-in via a class toggle on `<html>`

## Architectural rules (do not violate)

- Next.js never talks to Supabase directly. All DB reads and writes go through FastAPI
- FastAPI exposes a single `/api/v1/*` surface. No version sprawl until v1 ships a breaking change
- Marketing pages under `app/(marketing)/` must not import Ant Design. App pages under `app/(app)/` can
- All public marketing pages use ISR with `revalidate` set, never `dynamic = 'force-dynamic'`
- Background jobs run in FastAPI via APScheduler. Do not introduce Celery, Inngest, or a separate worker process until traffic justifies it
- Auth checks on protected endpoints use the FastAPI dependency `get_current_user`. Never read JWT manually in a route
- Migration files are append-only. Never edit a migration that has been merged

## Do not

- Do not rename existing public functions, classes, or React components when adding features. Add new names alongside, deprecate later
- Do not introduce a state management library (Zustand, Redux, Jotai). React state plus URL search params is enough for MVP
- Do not add a CSS-in-JS library. Tailwind plus design tokens covers everything
- Do not pull `framer-motion`. Only `motion/react` (the renamed package)
- Do not pull `lucide-react`. Only `react-bootstrap-icons`
- Do not add `any` to silence the typechecker. Fix the type
- Do not introduce a new dependency without writing an ADR via `add-decision`

## File map

- `docs/PRODUCT.md` what we are building and for whom
- `docs/SCOPE.md` what is in MVP and what is deferred
- `docs/GLOSSARY.md` domain terms
- `docs/ARCHITECTURE.md` system design, components, sequence diagrams
- `docs/DATA.md` data model and ERD
- `docs/API.md` FastAPI endpoint contract
- `docs/UI.md` design tokens, component inventory, screens
- `docs/TESTING.md` test strategy and definition of done
- `docs/OPS.md` deployment, secrets, observability, runbook
- `docs/ROADMAP.md` execution plan, read the current phase before starting work
- `docs/DECISIONS.md` ADR log

## Working with the roadmap

Each roadmap phase is a standalone task with explicit verification. Do not skip ahead. Do not combine phases. When finishing a phase, invoke the `phase-complete` skill which runs all verification commands listed in that phase block.
