-- Newsletter subscribers. Double opt-in per ADR-007 — confirmed_at gates whether
-- the row receives future emails.

create table if not exists public.newsletter_subscribers (
    id uuid primary key default gen_random_uuid(),
    email citext not null unique,
    source text not null,
    confirm_token text not null unique,
    confirmed_at timestamptz,
    unsubscribed_at timestamptz,
    created_at timestamptz not null default now()
);

create index if not exists newsletter_subscribers_confirmed_at_idx
    on public.newsletter_subscribers (confirmed_at)
    where confirmed_at is not null;

alter table public.newsletter_subscribers enable row level security;

-- Per DATA.md: anon and authenticated cannot read or write. The FastAPI gateway
-- uses the service role key, which bypasses RLS.
drop policy if exists "deny_all_anon" on public.newsletter_subscribers;
drop policy if exists "deny_all_authenticated" on public.newsletter_subscribers;
