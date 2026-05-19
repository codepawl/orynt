-- Tracks which contact submissions have been replied to. Manual admin entry.

create table if not exists public.contact_replies (
    id uuid primary key default gen_random_uuid(),
    submission_id uuid not null unique references public.contact_submissions (id) on delete cascade,
    replied_by text not null,
    reply_summary text,
    created_at timestamptz not null default now()
);

alter table public.contact_replies enable row level security;
