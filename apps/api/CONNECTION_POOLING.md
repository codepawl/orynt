# Connection Pooling Notes

## Current State
- Supabase client is initialized once at app startup (via `lifespan`) and reused.
- The `supabase-py` async client internally manages HTTP connections via `httpx`.
- For current traffic levels, this is sufficient.

## When to Add Pooling
If the API starts handling >100 concurrent requests or experiences connection timeouts:

1. **Enable Supabase PgBouncer** — already available in Supabase dashboard.
   - Use the "Transaction" pool mode connection string instead of direct.
   - Set `SUPABASE_DB_URL` to the pooler URL (port 6543 instead of 5432).

2. **Add Redis cache layer** — for hot endpoints:
   - Community post list (ranked) — cache for 60s
   - Unread notification count — cache for 10s
   - GitHub stats — already cached with TTLCache (1h)

3. **Consider edge caching** — Vercel ISR handles most frontend caching.
   Add `Cache-Control` headers to public API endpoints if needed.

## Monitoring
- Watch Supabase Dashboard > Database > Connections
- Koyeb metrics for response times
- If p95 latency >500ms, investigate pooling
