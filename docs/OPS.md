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

Single environment branched from `staging` git branch. Auto-deploys via Koyeb (API) and Vercel or Koyeb (web).

URL: `staging.codepawl.com` (web), `api-staging.codepawl.com` (API).

Used for: pre-prod smoke tests, design review with stakeholders, dogfooding the newsletter and contact flow.

### Production

Branch: `main`. Auto-deploys on merge.

URL: `codepawl.com` and `www.codepawl.com` (web), `api.codepawl.com` (API).

## Hosting

- **Frontend (Next.js)**: Vercel or Koyeb. Decision deferred to phase 8 of the roadmap. Default to Vercel for ISR ergonomics unless cost or vendor concerns force otherwise.
- **Backend (FastAPI)**: Koyeb single service, Python runtime, scales from 0 to 2 instances based on load.
- **Database**: Supabase managed Postgres on the `Pro` tier from launch (better SLA than free; rollback to free if pre-revenue and traffic is tiny).
- **DNS**: Cloudflare. Proxy on for the web hostnames, DNS-only for the API hostname (avoids Cloudflare's interference with long-running requests).

## Secrets

Tool: GitHub Actions secrets for CI, Koyeb env vars for runtime, Vercel env vars for the web runtime. No 1Password or Doppler in MVP.

Naming: uppercase snake case, prefixed with surface when ambiguous (`SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`).

Rotation: quarterly for service role keys, ad hoc for everything else. Document rotation in `DECISIONS.md` if procedure changes.

Never commit `.env`, `.env.local`, or any file containing real keys. `.env.example` is committed and serves as the canonical list of required vars.

## Deployment

### Web (apps/web)

- **Trigger**: push to `main` (production), push to `staging` (staging)
- **Build command**: `bun --filter @codepawl/web build`
- **Output**: `.next/`
- **ISR**: handled by hosting platform (Vercel native; Koyeb via Next.js standalone output)

### API (apps/api)

- **Trigger**: push to `main` (production), push to `staging` (staging)
- **Build**: Koyeb builds from `apps/api/Dockerfile` (multi-stage, slim Python 3.12 base)
- **Start command**: `uv run uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- **Migrations**: pre-deploy hook runs `uv run supabase migration up` against the target Supabase project

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
- `.github/workflows/deploy-staging.yml` runs on push to `staging`: re-runs full CI, then triggers Koyeb and Vercel deploys
- `.github/workflows/deploy-prod.yml` runs on push to `main`: same as staging but against prod targets, with a manual approval gate

Concurrency: cancel in-progress runs on the same branch when a new commit lands.

## Observability

### Logs

- API: structured JSON logs via `structlog`, streamed to Koyeb log drain. 7-day retention on Koyeb free tier. Pipe to a long-term sink (Logflare, Better Stack, S3) when log volume justifies it.
- Web: Next.js server logs to Vercel or Koyeb. Client errors go to Sentry, not stdout.

### Metrics

- Koyeb dashboard for API request rate, latency p50/p95/p99, error rate, CPU, memory
- Vercel analytics for web (or Koyeb equivalent)
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

1. Go to Vercel dashboard, find the previous deployment for the production environment
2. Click "Promote to Production"
3. Confirm in PostHog that traffic is now hitting the previous build

**API**:

1. Go to Koyeb dashboard, deployments tab
2. Click "Redeploy" on the previous successful deployment
3. Watch `/health/ready` until green

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
koyeb service logs codepawl-api --since 1h

# Web logs (Vercel)
vercel logs codepawl --since 1h
```

### Common debugging

**Newsletter confirm link is 410 expired but the user just subscribed**: token TTL is 7 days but our default in code is 24h. Check the migration that set the default; consider widening to 7 days. Also check if Resend is delaying the email past TTL.

**Product stats page shows zeros**: cron job has not run yet, or the GitHub token is rate-limited. Trigger manual sync via `POST /admin/products/sync-stats` and check the response. If 403 from GitHub, rotate the token.

**Sentry shows TypeError client-side from `motion/react`**: usually means a component that uses motion is rendering on the server without a "use client" directive. Add the directive.

**Turnstile verification fails for all submissions**: check that `TURNSTILE_SECRET_KEY` matches the site key in `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (same widget pair). Dev uses the always-pass test pair, production uses real keys.
