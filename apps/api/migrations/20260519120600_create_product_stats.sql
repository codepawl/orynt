-- Cached GitHub stats per product. Refreshed by the sync_github_stats
-- APScheduler job every 6 hours. Read directly by GET /products/{slug}/stats
-- without re-fetching GitHub.

create table if not exists public.product_stats (
    product_id text primary key references public.products (id) on delete cascade,
    stars integer not null default 0,
    forks integer not null default 0,
    open_issues integer not null default 0,
    last_release_tag text,
    last_release_at timestamptz,
    synced_at timestamptz not null default now()
);

alter table public.product_stats enable row level security;

drop policy if exists "product_stats_select_anon" on public.product_stats;
create policy "product_stats_select_anon"
    on public.product_stats
    for select
    to anon, authenticated
    using (true);
