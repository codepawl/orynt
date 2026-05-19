-- Append-only audit log for subscriber lifecycle events
-- (subscribed, confirmed, sent, opened, clicked, unsubscribed, bounced).

create table if not exists public.newsletter_events (
    id uuid primary key default gen_random_uuid(),
    subscriber_id uuid not null references public.newsletter_subscribers (id) on delete cascade,
    event_type text not null,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

create index if not exists newsletter_events_subscriber_created_idx
    on public.newsletter_events (subscriber_id, created_at desc);

alter table public.newsletter_events enable row level security;
