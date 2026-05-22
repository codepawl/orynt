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

## ADR-008: Cloudflare Workers Builds with `@opennextjs/cloudflare` for the web frontend

**Date**: 2026-05-22
**Status**: accepted

**Context**: The hosting target for `apps/web` was an open question deferred to phase 8 between Vercel and Koyeb. In the meantime, Cloudflare already owns DNS for the project and Workers Builds matured into a Git-integrated CI that ships a Worker + static assets in one step. The `@opennextjs/cloudflare` adapter is now Cloudflare's official path for Next.js App Router and supports ISR. Continuing to defer adds two unknowns on top of every web change (build target and rollback story); locking it now lets the deploy pipeline stabilize before traffic arrives.

**Decision**: Host `apps/web` on Cloudflare Workers Builds. Build with `opennextjs-cloudflare build` (which wraps `next build`) to produce `.open-next/worker.js` and `.open-next/assets/`. `wrangler.jsonc` lives at `apps/web/wrangler.jsonc` with `name: codepawl`, `compatibility_flags: ["nodejs_compat"]`, and an `ASSETS` binding pointing at `.open-next/assets`. Production branch `main` deploys via `wrangler deploy`; non-production branches use `wrangler versions upload` to get a preview URL. ISR cache is in-Worker until cold-deploy misses become visible, at which point a KV namespace is added in `open-next.config.ts` and `wrangler.jsonc`.

**Alternatives considered**:
- **Vercel**: best ISR ergonomics and per-page analytics, but a second vendor on top of Cloudflare DNS and a second dashboard for runtime env vars.
- **Koyeb (Next.js standalone)**: same vendor as the API, but Cloudflare's edge cannot cache Koyeb origin responses with the same fidelity as a Worker, and Koyeb scales-from-zero adds cold-start latency on marketing pages where TTFB matters most.
- **Cloudflare Pages classic with `@cloudflare/next-on-pages`**: the adapter is in maintenance mode and Cloudflare is migrating Next.js users to Workers + Static Assets.
- **`output: 'export'` (pure static)**: removes the runtime entirely but conflicts with the CLAUDE.md mandate that marketing pages use ISR.

**Consequences**: One vendor for DNS, edge cache, and asset hosting — one bill, one auth, fewer integration seams. Cloudflare's network footprint gives lower TTFB than either alternative for global traffic. The trade-off: Vercel-specific niceties (per-page analytics, one-click rollback UI, automatic source-map upload via the Sentry build plugin) are lost and must be replicated through wrangler and the Cloudflare dashboard. ISR cache rebuilds cold on every deploy until KV is wired in, which is acceptable for a marketing site with hourly revalidate windows. The `apps/web/vercel.json` file is deleted; `docs/OPS.md` Hosting and Deployment sections move to reflect Workers Builds.

---

## ADR-009: API hosted on Fly.io (replaces Koyeb)

**Date**: 2026-05-22
**Status**: accepted

**Context**: `docs/OPS.md` originally named Koyeb as the API host, chosen mostly because it appeared first in the comparison. Before any production traffic exists is the right moment to revisit. Koyeb's free tier is generous but its scale-to-zero behavior is coarse, regional choice is limited near our Supabase + WSL2 dev locale, and its build pipeline is a separate concept layered on top of Docker. Fly.io exposes the underlying Machines API directly, has a Singapore region (matching the user's WSL2 dev + the Supabase project tier we are about to provision), bills per machine-second so scale-to-zero is genuinely $0 when idle, and ships first-class custom certificates via `fly certs create` without a control-plane queue.

**Decision**: Host `apps/api` on Fly.io. App name `codepawl-api`, primary region `sin`, one shared-CPU 256 MB machine with `min_machines_running = 0` and auto-start on HTTP. Health check hits `/health/ready` (which now performs a real Supabase round-trip per ADR-004's gateway contract). Production domain `api.codepawl.com` is attached via `fly certs create` with a Cloudflare DNS-only record (no orange-cloud proxy) per the existing OPS.md rule, so long-running requests bypass Cloudflare's edge timeout. Secrets are managed via `fly secrets set`, never committed to `fly.toml`.

**Alternatives considered**:
- **Stay on Koyeb**: zero migration cost but loses the regional fit and the per-second billing; control plane is also more opinionated about build steps, harder to script.
- **Railway**: similar DX to Fly, but pricing is per-resource rather than per-machine-second and the region list is smaller; no clear edge on cost or latency.
- **Render**: cleaner free tier UI but no scale-to-zero on web services; pays for an always-on instance even with zero traffic.
- **Self-host on a VPS**: cheapest long-term but adds OS patching, TLS renewal, and reverse-proxy config — not justified for a Python service with no exotic runtime needs.

**Consequences**: One Dockerfile, one `fly.toml`, one `fly deploy` step from `apps/api`. Scale-to-zero means the first request after idle pays a cold-start (~1–2 s for a slim Python image with no jit); acceptable for marketing-tier traffic, revisit if `/health/ready` p95 from Cloudflare's uptime check spikes. Regional scope is single-region at launch — if global p95 latency on the API becomes user-visible, add a second region via `fly scale count 2 --region iad`. `docs/OPS.md` Hosting + Deployment + Runbook sections move from Koyeb to Fly commands. The Koyeb mention in older ADR commentary is left as historical context; this ADR is the active source of truth.

---

## ADR-010: Replace `next-themes` with `@wrksz/themes` for theme management

**Date**: 2026-05-22
**Status**: accepted

**Context**: `next-themes@0.4.6` renders its FOUC-prevention `<script>` from inside a client component, which trips a React 19 console warning ("Encountered a script tag while rendering React component") on every render of `ThemeProvider` in Next.js 16.2. The script still executes from the initial SSR'd HTML so dark mode works, but the warning re-fires on client transitions and buries real errors in DevTools. Upstream `next-themes` has not shipped since 2025-03-11 and the proposed fix ([pacocoursey/next-themes#386](https://github.com/pacocoursey/next-themes/pull/386)) has sat open without maintainer activity. We need theming to stay viable for the eventual light/dark toggle (CSS for `html.light` already lives in `apps/web/styles/design-tokens.css`).

**Decision**: Replace `next-themes` with `@wrksz/themes` (pinned to `^0.9.3`), imported from the drop-in `@wrksz/themes/next` entrypoint. The new library uses `useServerInsertedHTML` to inject the pre-hydration theme script outside the React component tree, which is the proper root-cause fix. The migration touches one import line in `apps/web/components/theme-provider.tsx`; the wrapper component, its props (`attribute="class"`, `defaultTheme="dark"`, `enableSystem={false}`, `disableTransitionOnChange`), and `app/layout.tsx` are unchanged.

**Alternatives considered**:
- **Stay on `next-themes` and patch via `bun patch`**: zero new dep but requires maintaining a fork-patch against an unmaintained library with no upstream to merge back into; higher long-term carrying cost than a one-line vendor swap.
- **Drop theming entirely and hardcode `className="dark"` on `<html>`**: smallest diff, but discards the path to a real light-mode toggle that the design tokens already support.
- **Suppress the specific `console.error` message in the provider**: hides the symptom rather than fixing the root cause, and risks masking unrelated React errors emitted by the same channel.
- **Roll a custom `useServerInsertedHTML`-based provider**: ~50 lines of code we would own and test ourselves; not worth it when a maintained drop-in exists.

**Consequences**: The React 19 script warning goes away across all marketing pages and client transitions, leaving DevTools clean for real issues. `@wrksz/themes` carries abandonment risk — it is single-maintainer, published 2026-05-21, lower adoption than `next-themes` — but the risk is contained: only `apps/web/components/theme-provider.tsx` imports it, no consumer code calls `useTheme` yet, and reverting to `next-themes` (or any future replacement) stays a one-file change. Bundle impact is neutral (both libraries are ~3–4 kB minified and `@wrksz/themes` has zero runtime deps). The CLAUDE.md line about "Light mode is opt-in via `next-themes` class toggle" is reworded to drop the library name so the doc no longer mis-names the implementation.

---

## Open questions

- **PostHog cloud vs self-hosted**. Default: cloud free tier. Revisit when: traffic exceeds the free tier, at which point self-host on Koyeb in the same network as the API.
- **Whether `(app)` route group survives the rebuild or is dropped from MVP**. Default: keep the directory, do not build features. Revisit when: community or admin features are explicitly in scope per `SCOPE.md`.
