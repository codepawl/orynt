# Data

## ERD

```mermaid
erDiagram
  NEWSLETTER_SUBSCRIBERS ||--o{ NEWSLETTER_EVENTS : "produces"
  CONTACT_SUBMISSIONS ||--o| CONTACT_REPLIES : "may have"
  PRODUCTS ||--|| PRODUCT_STATS : "has one"

  NEWSLETTER_SUBSCRIBERS {
    uuid id PK
    text email UK
    text source
    text confirm_token UK
    timestamptz confirmed_at
    timestamptz unsubscribed_at
    timestamptz created_at
  }

  NEWSLETTER_EVENTS {
    uuid id PK
    uuid subscriber_id FK
    text event_type
    jsonb metadata
    timestamptz created_at
  }

  CONTACT_SUBMISSIONS {
    uuid id PK
    text name
    text email
    text subject
    text message
    text ip_hash
    text user_agent
    timestamptz created_at
  }

  CONTACT_REPLIES {
    uuid id PK
    uuid submission_id FK
    text replied_by
    text reply_summary
    timestamptz created_at
  }

  PRODUCTS {
    text id PK
    text name
    text slug UK
    text github_repo
    text tagline
    text status
    int display_order
  }

  PRODUCT_STATS {
    text product_id PK_FK
    int stars
    int forks
    int open_issues
    text last_release_tag
    timestamptz last_release_at
    timestamptz synced_at
  }
```

## Entities

### newsletter_subscribers

- **Purpose**: Authoritative list of newsletter signups. Double opt-in confirmed status gates whether the row receives future emails.
- **Fields**:
  - `id: uuid, primary key, default gen_random_uuid()`
  - `email: text, unique, not null, citext for case-insensitive matching`
  - `source: text, not null` enum-like text ('landing_footer', 'cta_section', 'product_page', 'blog')
  - `confirm_token: text, unique, not null` random 32-char URL-safe token
  - `confirmed_at: timestamptz, nullable` null until double opt-in completes
  - `unsubscribed_at: timestamptz, nullable`
  - `created_at: timestamptz, default now(), not null`
- **Indexes**:
  - `unique (email)` enforced by column constraint
  - `unique (confirm_token)` for confirm lookup
  - `index (confirmed_at) where confirmed_at is not null` for active-list queries
- **Relationships**: one-to-many with `newsletter_events`

### newsletter_events

- **Purpose**: Audit log of every subscriber lifecycle event (subscribed, confirmed, sent, opened, clicked, unsubscribed, bounced). Append-only.
- **Fields**:
  - `id: uuid, primary key`
  - `subscriber_id: uuid, foreign key newsletter_subscribers(id), on delete cascade`
  - `event_type: text, not null` ('subscribed', 'confirmed', 'sent', 'opened', 'clicked', 'unsubscribed', 'bounced')
  - `metadata: jsonb, not null, default '{}'` provider-specific fields (campaign id, message id, etc.)
  - `created_at: timestamptz, default now()`
- **Indexes**: `index (subscriber_id, created_at desc)` for per-subscriber timeline
- **Relationships**: many-to-one with `newsletter_subscribers`

### contact_submissions

- **Purpose**: Inbound messages from the `/contact` form. Forwarded to hello@codepawl.com via Resend on insert. Retained for context.
- **Fields**:
  - `id: uuid, primary key`
  - `name: text, not null, check length(name) between 1 and 100`
  - `email: text, not null, check email matches a basic regex`
  - `subject: text, nullable, check length(subject) <= 200`
  - `message: text, not null, check length(message) between 10 and 5000`
  - `ip_hash: text, nullable` SHA-256 of client IP, not the raw IP
  - `user_agent: text, nullable, check length(user_agent) <= 500`
  - `created_at: timestamptz, default now()`
- **Indexes**: `index (created_at desc)` for admin browsing
- **Relationships**: one-to-zero-or-one with `contact_replies`

### contact_replies

- **Purpose**: Track which contact submissions have been answered. Manual entries by admin.
- **Fields**:
  - `id: uuid, primary key`
  - `submission_id: uuid, foreign key contact_submissions(id), on delete cascade, unique`
  - `replied_by: text, not null` admin email or initials
  - `reply_summary: text, nullable`
  - `created_at: timestamptz, default now()`

### products

- **Purpose**: Catalog of the six open-source products. Source of truth for product pages and the hero cycler.
- **Fields**:
  - `id: text, primary key` lowercase slug, e.g., 'openpawl', 'featcat'
  - `name: text, not null` display name
  - `slug: text, unique, not null` URL slug (often same as id)
  - `github_repo: text, not null` `owner/repo` format, e.g. `codepawl/openpawl`
  - `tagline: text, not null`
  - `status: text, not null` ('stable', 'beta', 'alpha', 'pre-alpha', 'private')
  - `display_order: int, not null, default 0` for ordering on the hero cycler

Initial rows are seeded via `apps/api/seed/products.py`. Hero data (description, install command, version, language) lives in `apps/web/components/marketing/products.ts` as a TS const since it changes with design copy, not with DB state.

### product_stats

- **Purpose**: Cached GitHub stats, refreshed by the `sync_github_stats` job every 6 hours.
- **Fields**:
  - `product_id: text, primary key, foreign key products(id), on delete cascade`
  - `stars: int, not null, default 0`
  - `forks: int, not null, default 0`
  - `open_issues: int, not null, default 0`
  - `last_release_tag: text, nullable`
  - `last_release_at: timestamptz, nullable`
  - `synced_at: timestamptz, not null, default now()`

Read freshness: the API endpoint `GET /products/{slug}/stats` returns this row directly without re-fetching from GitHub. Staleness up to 6 hours is acceptable.

## Migrations

Migration tool: Supabase CLI.

Naming convention: `YYYYMMDDHHmmss_short_description.sql`. Example: `20260520120000_create_newsletter_subscribers.sql`.

Migration files live in `apps/api/migrations/` and are applied with:

```bash
cd apps/api && uv run supabase migration up
```

Migrations are append-only. Once merged to main, never edit. Use a new migration to alter previous state.

## Seed data

Seed scripts live in `apps/api/seed/`. Run with:

```bash
cd apps/api && uv run python -m seed.products
```

Initial seed inserts the six product rows. `product_stats` is populated by the first cron job run, not by seed.

## Row Level Security

Supabase RLS is enabled on all tables. Because FastAPI uses the service role key and bypasses RLS, the policies are deliberately strict (no public access). All reads and writes go through FastAPI, which applies its own auth.

RLS posture per table:

- `newsletter_subscribers`: deny all to anon and authenticated. Service role bypasses.
- `newsletter_events`: deny all to anon and authenticated.
- `contact_submissions`: deny all to anon and authenticated.
- `contact_replies`: deny all to anon and authenticated.
- `products`: select allowed to anon and authenticated (so a future client-side fetch could read product list). Insert/update/delete denied.
- `product_stats`: select allowed to anon and authenticated. Insert/update/delete denied.

If we later let Next.js read products directly from Supabase, the `select` policy on `products` and `product_stats` is already set.
