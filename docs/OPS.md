# Operations

## Environments

### Development

Local. Run web and API in separate terminals.

Required env vars (see `.env.example` for the full list):

- `NEXT_PUBLIC_API_BASE_URL=http://localhost:8000/api/v1`
- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` pointing at a local or shared dev Supabase project
- `SUPABASE_SERVICE_ROLE_KEY` for the API
- `RESEND_API_KEY` in test mode (sends to a single sink email)
- `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` for the always-pass dev keys provided by Cloudflare
- `GITHUB_TOKEN` with `public_repo` scope

OS: WSL2 Ubuntu. Node 20+, Bun 1.x, Python 3.12+, uv installed.

### Staging

Single environment branched from `staging` git branch. Auto-deploys via Fly.io (API) and Cloudflare Workers Builds (web).

URL: `staging.codepawl.com` (web), `api-staging.codepawl.com` (API).

Used for: pre-prod smoke tests, design review with stakeholders, dogfooding the newsletter and contact flow.

### Production

Branch: `main`. Auto-deploys on merge.

URL: `codepawl.com` and `www.codepawl.com` (web), `api.codepawl.com` (API).

## Hosting

- **Frontend (Next.js)**: Cloudflare Workers Builds via the `@opennextjs/cloudflare` adapter (see [ADR-008](DECISIONS.md)). Worker name `codepawl`, asset binding `ASSETS`. Production branch `main` runs `wrangler deploy`; other branches run `wrangler versions upload` for preview URLs.
- **Backend (FastAPI)**: Fly.io single app `codepawl-api`, primary region `sin`, shared-CPU 256 MB machine, `min_machines_running = 0` with auto-start on HTTP (see [ADR-009](DECISIONS.md)). Add a second region via `fly scale count 2 --region iad` if global p95 spikes.
- **Database**: Supabase managed Postgres on the `Pro` tier from launch (better SLA than free; rollback to free if pre-revenue and traffic is tiny).
- **DNS**: Cloudflare. Proxy on for the web hostnames, DNS-only for the API hostname (avoids Cloudflare's interference with long-running requests).

## Secrets

Tool: GitHub Actions secrets for CI, `fly secrets set` for the API runtime, Cloudflare Workers environment variables (and Workers Secrets for sensitive values) for the web runtime. No 1Password or Doppler in MVP.

Naming: uppercase snake case, prefixed with surface when ambiguous (`SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`).

Rotation: quarterly for service role keys, ad hoc for everything else. Document rotation in `DECISIONS.md` if procedure changes.

Never commit `.env`, `.env.local`, or any file containing real keys. `.env.example` is committed and serves as the canonical list of required vars.

## Deployment

### Web (apps/web)

- **Trigger**: push to `main` (production), push to any other branch (preview)
- **Build command**: `bun install && bun --filter @codepawl/web build:cf` (wraps `next build` and emits a Worker entry + assets)
- **Output**: `apps/web/.open-next/worker.js` + `apps/web/.open-next/assets/`
- **Production deploy**: `cd apps/web && npx wrangler deploy` (promotes to live)
- **Non-production deploy**: `cd apps/web && npx wrangler versions upload` (preview URL only, no traffic shift)
- **ISR**: in-Worker by default. Promote to a Workers KV namespace via `incrementalCache` in `open-next.config.ts` once cold-deploy cache misses become visible

### API (apps/api)

- **Trigger**: push to `main` (production), push to `staging` (staging)
- **Build**: `fly deploy` builds the multi-stage `apps/api/Dockerfile` remotely (uv-based, slim Python 3.12)
- **Config**: `apps/api/fly.toml` (app name, region, internal port `8080`, HTTP health check on `/health/ready`)
- **Start command**: container `CMD` runs `uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8080}`
- **Migrations**: pre-deploy hook runs `uv run supabase migration up` against the target Supabase project
- **First-time setup**: `cd apps/api && fly apps create codepawl-api` (one-time), then `fly secrets set SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... TURNSTILE_SECRET_KEY=... RESEND_API_KEY=... RESEND_FROM_EMAIL=hello@codepawl.com SENTRY_DSN=... GITHUB_TOKEN=... GITHUB_ORG=codepawl ADMIN_API_KEY=$(openssl rand -hex 32) SITE_URL=https://codepawl.com`, then `fly deploy`. Attach the custom domain via `fly certs create api.codepawl.com` and add the printed DNS records at Cloudflare (DNS-only, gray cloud)

### Order of operations

1. Apply migrations against staging Supabase
2. Deploy API to staging
3. Deploy web to staging
4. Smoke test (Playwright in CI, plus a one-page manual check)
5. Repeat steps 1-4 against production

Never deploy web before API if the change includes a new endpoint the web depends on.

## CI

Provider: GitHub Actions.

Workflows:

- `.github/workflows/ci.yml` runs on every PR: lint, typecheck, unit tests, integration tests, e2e
- `.github/workflows/deploy-staging.yml` runs on push to `staging`: re-runs full CI, then `flyctl deploy --remote-only --config apps/api/fly.toml`. Web is deployed directly by Cloudflare Workers Builds off the same push.
- `.github/workflows/deploy-prod.yml` runs on push to `main`: same as staging but against prod targets, with a manual approval gate. Web production deploy is also driven by Cloudflare Workers Builds on `main`.

Concurrency: cancel in-progress runs on the same branch when a new commit lands.

## Observability

### Logs

- API: structured JSON logs via `structlog`, viewable via `fly logs --app codepawl-api` (tail) or the Fly dashboard. Pipe to a long-term sink (Logflare, Better Stack, S3) when log volume justifies it.
- Web: Worker logs streamed via `wrangler tail codepawl` or viewed in the Cloudflare dashboard under Workers → codepawl → Logs. Client errors go to Sentry, not stdout.

### Metrics

- Fly.io dashboard (and `fly status`, `fly metrics`) for API request rate, latency p50/p95/p99, error rate, CPU, memory
- Cloudflare Workers Analytics for web (requests, errors, p50/p95/p99 latency, CPU time)
- Supabase dashboard for DB connection pool, query stats, slow queries
- PostHog for product analytics (page views, newsletter conversion event)

### Error tracking

- **Sentry** for both web and API. Free tier covers 5k errors/month, sufficient for MVP traffic
- Source maps uploaded on every deploy via `@sentry/nextjs` build plugin (web) and `sentry-cli` (API)
- Alert rule: any new error type in production pages me on Discord

### Uptime

- Cloudflare health check on `/health/ready` every minute. Alert on Discord webhook if two consecutive failures
- Not paying for Pingdom or BetterUptime in MVP

## Runbook

### Rollback

**Web**:

1. Find the previous version: `cd apps/web && npx wrangler versions list`
2. Roll back: `npx wrangler rollback --version-id <previous-version-id>` (or use the Cloudflare dashboard → Workers → codepawl → Deployments → Rollback)
3. Confirm in PostHog that traffic is now hitting the previous build

**API**:

1. `fly releases --app codepawl-api` to find the previous release version
2. `fly releases rollback --app codepawl-api <version>` (or use the Fly dashboard → codepawl-api → Releases → Rollback)
3. Watch `/health/ready` until green: `curl -fsS https://api.codepawl.com/health/ready`

**Database migration rollback**:

If a migration broke something and the data damage is contained, write a reverse migration:

```bash
cd apps/api
uv run supabase migration new revert_xxx
# write the inverse SQL
uv run supabase migration up
```

Never delete migration files. Never edit a merged migration.

### Check production logs

```bash
# API logs
fly logs --app codepawl-api

# Web logs (Cloudflare Workers)
cd apps/web && npx wrangler tail codepawl --format pretty
```

### Common debugging

**Newsletter confirm link is 410 expired but the user just subscribed**: token TTL is 7 days but our default in code is 24h. Check the migration that set the default; consider widening to 7 days. Also check if Resend is delaying the email past TTL.

**Product stats page shows zeros**: cron job has not run yet, or the GitHub token is rate-limited. Trigger manual sync via `POST /admin/products/sync-stats` and check the response. If 403 from GitHub, rotate the token.

**Sentry shows TypeError client-side from `motion/react`**: usually means a component that uses motion is rendering on the server without a "use client" directive. Add the directive.

**Turnstile verification fails for all submissions**: check that `TURNSTILE_SECRET_KEY` matches the site key in `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (same widget pair). Dev uses the always-pass test pair, production uses real keys.
