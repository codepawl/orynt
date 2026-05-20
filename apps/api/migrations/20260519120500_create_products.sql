-- Catalog of the six open-source products. Source of truth for product pages
-- and the hero cycler.

create table if not exists public.products (
    id text primary key,
    name text not null,
    slug text not null unique,
    github_repo text not null,
    tagline text not null,
    status text not null check (
        status in ('stable', 'beta', 'alpha', 'pre-alpha', 'private')
    ),
    display_order integer not null default 0
);

alter table public.products enable row level security;

-- Per DATA.md: anon and authenticated may select; writes go through the
-- FastAPI service role.
drop policy if exists "products_select_anon" on public.products;
create policy "products_select_anon"
    on public.products
    for select
    to anon, authenticated
    using (true);
