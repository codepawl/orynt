# Decisions log

ADR-style log of architectural decisions. Append new decisions; do not edit historical ones except to mark `superseded by ADR-NNN`.

---

## ADR-001: Next.js 16 App Router with React Server Components by default

**Date**: 2026-05-19
**Status**: accepted

**Context**: The site has heavy public marketing pages and a smaller logged-in app surface. Marketing pages benefit from minimal client JS and from ISR. The team is already on Next.js for the prior community-platform iteration.

**Decision**: Use Next.js 16 with the App Router. Default every component to a Server Component. Add `"use client"` only when state, refs, browser APIs, or event handlers are needed.

**Alternatives considered**:
- **Astro**: better static output story but limited React Server Components ergonomics and weaker ISR
- **Remix**: solid loader/action model but smaller ecosystem for our exact mix of MDX, ISR, and serverless
- **Pages Router (Next.js)**: simpler mental model but App Router is where the platform is investing and the route group pattern unlocks `(marketing)` vs `(app)`

**Consequences**: Shipping less client JS on landing pages, faster TTFB on ISR routes, and explicit client boundary discipline. Forces every contributor to think about server vs client. Some libraries (mainly ones that bundle browser-only code at the top level) need careful import handling.

---

## ADR-002: FastAPI on Koyeb as the single backend gateway

**Date**: 2026-05-19
**Status**: accepted

**Context**: The team's domain is AI/ML, so Python is the productive language for backend. We need a single HTTP gateway in front of Supabase: Next.js must not connect to Supabase directly because we want one place for auth, rate limiting, validation, and observability.

**Decision**: FastAPI as the single backend service. Hosted on Koyeb. Pydantic models are the source of truth for request and response shapes. APScheduler runs background jobs inside the same service.

**Alternatives considered**:
- **Node/Express or Hono**: aligns with the JS frontend but the team is faster in Python and the AI/ML libraries we will use later are Python-first
- **Supabase Edge Functions**: bypasses the gateway, but logic in Deno scattered across functions is harder to maintain and lacks a clean shared model layer
- **Separate worker process for cron**: introducing Celery or a Redis-backed worker is premature; APScheduler in-process is enough until traffic grows

**Consequences**: Single deployment, single observability surface. Adding background jobs is one APScheduler call. If we exceed a single Koyeb instance for the worker, we will need to move cron out (separate service or scheduled Koyeb job).

---

## ADR-003: Supabase Postgres for data, Auth, and Storage

**Date**: 2026-05-19
**Status**: accepted

**Context**: We need Postgres, an auth system, file storage, and (later) realtime. We want one vendor that gives all four to minimize integration glue and ops surface.

**Decision**: Supabase as the data layer. Use Postgres for transactional data. Use Supabase Auth for the future authenticated app surface, with JWTs verified by FastAPI. Use Supabase Storage for any user-uploaded files (none in MVP). Migration tool is the Supabase CLI (`supabase migration up`).

**Alternatives considered**:
- **Neon Postgres + Clerk Auth + S3**: each best-in-class but three vendors and three bills
- **Self-host Postgres on Koyeb**: cheaper at scale but adds ops burden we cannot afford as a solo founder
- **Firebase**: NoSQL data model would force a rewrite of our relational schema, and the vendor lock-in is worse than Supabase's

**Consequences**: One dashboard, one connection string, one auth provider. RLS gives a layered defense even though FastAPI is the primary auth boundary. If we outgrow Supabase, the Postgres data is portable (Auth is the harder lift to migrate).

---

## ADR-004: Single gateway rule — Next.js never connects to Supabase directly

**Date**: 2026-05-19
**Status**: accepted

**Context**: With Supabase, it is tempting to call the Supabase JS client from Server Components for "simple" reads. Doing that scatters auth checks, rate limit logic, and observability across two languages, and creates two places where the schema can drift from the code.

**Decision**: All data reads and writes from the web go through FastAPI's `/api/v1/*` endpoints. Next.js may use the Supabase JS client only for the Auth UI flows (sign in, sign out, magic link), and even then the server validates the resulting JWT via FastAPI before trusting it.

**Alternatives considered**:
- **Direct Supabase client in Server Components for reads**: faster path for simple reads, but creates a second observability surface and a second place to enforce rate limits
- **GraphQL gateway**: more flexibility, but premature given the API surface is small

**Consequences**: Every new data dependency requires a FastAPI endpoint, which forces explicit contract definition in `docs/API.md`. Slightly more friction for simple reads, but the architectural clarity is worth it. If a marketing page needs data that has no endpoint, the answer is to add the endpoint, not to bypass the rule.

---

## ADR-005: Two route groups — `(marketing)` without Ant Design, `(app)` with Ant Design

**Date**: 2026-05-19
**Status**: accepted

**Context**: The prior codebase uses Ant Design throughout. The new design system is a sharp-cornered, dark-canvas system with custom typography that fights Ant Design's defaults. Marketing pages are also the heaviest on bundle size and SEO sensitivity, where shipping Ant Design's CSS and JS for components we do not use is wasteful.

**Decision**: Two Next.js App Router route groups. `(marketing)` uses pure Tailwind v4 plus design tokens, no Ant Design imports. `(app)` wraps `AntdConfigProvider` and is allowed to use Ant Design components freely. Each group has its own layout.

**Alternatives considered**:
- **Ant Design everywhere with heavy theme override**: writes hundreds of lines of theme override to fight the defaults, and still ships the full library
- **shadcn/ui everywhere**: would replace Ant Design but requires rewriting the app surface, out of MVP scope
- **Marketing as a separate Next.js project**: clean separation but doubles the deploy and tooling surface

**Consequences**: Marketing pages stay lean. App pages reuse Ant Design's accessible primitives without theme fights. Devs must respect the boundary; the `add-component` skill enforces it. If we later remove Ant Design entirely, the `(marketing)` group migration cost is zero.

---

## ADR-006: Sharp corners enforced at the design token layer

**Date**: 2026-05-19
**Status**: accepted

**Context**: The brand identity is sharp corners. Default Tailwind utilities (`rounded-md`, `rounded-lg`, etc.) and most component libraries assume rounded corners. Leaving this to convention will result in drift the moment a contributor copy-pastes a utility.

**Decision**: In the Tailwind v4 `@theme` block, set all `--radius-*` tokens to `0` except `--radius-full` (which keeps pill behavior). Tailwind utilities `rounded`, `rounded-sm`, `rounded-md`, `rounded-lg`, `rounded-xl`, `rounded-2xl`, `rounded-3xl` all resolve to `0` in this project.

**Alternatives considered**:
- **Lint rule against radius utilities**: works but is reactive instead of preventive
- **Convention only, enforce in code review**: leaks regularly

**Consequences**: A contributor cannot accidentally introduce rounded corners. Pills explicitly use `rounded-full`. If we ever want soft corners on a specific section, we declare a custom radius and apply it explicitly.

---

## ADR-007: Double opt-in newsletter with 7-day token TTL

**Date**: 2026-05-19
**Status**: accepted

**Context**: Newsletter signup is the primary conversion event. Deliverability and list quality matter. Single opt-in invites spam, bots, and bounce-rate damage to sending reputation. We also need to handle late confirmations (someone subscribes, then confirms a few days later).

**Decision**: Double opt-in. On `POST /newsletter/subscribe`, insert a row with `confirmed_at = null` and a 32-char random `confirm_token`. Send the confirmation email via Resend. The token is valid for 7 days. Only `confirmed_at IS NOT NULL` subscribers receive future newsletters.

**Alternatives considered**:
- **Single opt-in**: faster conversion, worse list quality and worse sender reputation
- **24-hour TTL**: too short, users frequently confirm next-day
- **30-day TTL**: too long, abandoned tokens accumulate

**Consequences**: Lower raw signup count, higher confirmed quality, better deliverability. Adds a clear "check your inbox" state to the UI. If conversion from pending to confirmed lags below 40%, we revisit the email template, the subject line, and the confirm page UX, but not the double opt-in policy itself.

---

## Open questions

- **Hosting target for the web frontend (Vercel vs Koyeb)**. Default: Vercel for ISR ergonomics. Revisit when: cost or compliance forces consolidation, or when Vercel limits force a move.
- **PostHog cloud vs self-hosted**. Default: cloud free tier. Revisit when: traffic exceeds the free tier, at which point self-host on Koyeb in the same network as the API.
- **Whether `(app)` route group survives the rebuild or is dropped from MVP**. Default: keep the directory, do not build features. Revisit when: community or admin features are explicitly in scope per `SCOPE.md`.
