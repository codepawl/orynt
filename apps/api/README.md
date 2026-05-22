# codepawl-api

FastAPI gateway in front of Supabase. Single entry point for all data reads and writes per ADR-004.

## Local dev

```bash
cd apps/api
uv sync
uv run uvicorn app.main:app --reload --port 8000
```

## Quality gates

```bash
uv run mypy .
uv run ruff check .
uv run ruff format --check .
uv run pytest
```

## Database

Supabase migrations live in `apps/api/migrations/`. Apply with the Supabase CLI:

```bash
uv run supabase migration up
```

Seed the products table:

```bash
uv run python -m seed.products
```

## Deploy

Production target is Fly.io (`docs/DECISIONS.md` ADR-009). One-time setup:

```bash
cd apps/api
fly apps create codepawl-api
fly secrets set \
  SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
  TURNSTILE_SECRET_KEY=... \
  RESEND_API_KEY=... RESEND_FROM_EMAIL=hello@codepawl.com \
  SENTRY_DSN=... \
  GITHUB_TOKEN=... GITHUB_ORG=codepawl \
  ADMIN_API_KEY=$(openssl rand -hex 32) \
  SITE_URL=https://codepawl.com
fly deploy
```

Attach the custom domain (one-time):

```bash
fly certs create api.codepawl.com
# Add the printed A/AAAA records at Cloudflare DNS (proxy: DNS-only, gray cloud).
fly certs show api.codepawl.com   # wait for status: Issued
```

Subsequent deploys: `fly deploy` from `apps/api/`. Logs: `fly logs --app codepawl-api`.
