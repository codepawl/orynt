-- Inbound /contact form submissions. Persisted for admin retention and audit;
-- a copy is forwarded to hello@codepawl.com via Resend by the API on insert.

create table if not exists public.contact_submissions (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    email text not null,
    subject text,
    message text not null,
    ip_hash text,
    user_agent text,
    created_at timestamptz not null default now(),
    constraint contact_submissions_name_length check (char_length(name) between 1 and 100),
    constraint contact_submissions_email_shape check (
        email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
    ),
    constraint contact_submissions_subject_length check (
        subject is null or char_length(subject) <= 200
    ),
    constraint contact_submissions_message_length check (
        char_length(message) between 10 and 5000
    ),
    constraint contact_submissions_user_agent_length check (
        user_agent is null or char_length(user_agent) <= 500
    )
);

create index if not exists contact_submissions_created_at_idx
    on public.contact_submissions (created_at desc);

alter table public.contact_submissions enable row level security;
