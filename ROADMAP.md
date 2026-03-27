# CodePawl Development Roadmap

**Last updated:** 2026-03-26
**Owner:** An (Founder)
**Repo branch:** staging

---

## Current State Summary

CodePawl is currently a content site + news aggregator built with Next.js 16 + FastAPI + Supabase + Bun monorepo. Core working features: MDX blog, automated AI/ML news pipeline (RSS collect, simhash dedup, keyword extraction, SEO), GitHub stats API with webhooks, admin dashboard (API key auth), feed generation, CI/CD.

What does NOT exist yet: user auth, community/forum, TeamClaw/Lognis/Yeastbook/OpenClaw (none in codebase), shared types between frontend and backend.

Goal: transform from content site into an AI/ML community platform where the news pipeline is the hook and the community forum is the retention layer.

---

## Phase 0: Technical Debt Cleanup

**Duration:** 3-4 days
**Branch:** `fix/tech-debt`
**Goal:** Clean foundation before adding features

### Tasks

- [x] **0.1** Remove unused packages from `apps/web/package.json`
  - Remove `geist` (not used in layout.tsx)
  - Check `postprocessing` vs `@react-three/postprocessing`, keep only what's needed
  - Check `react-wrap-balancer` usage, remove if unused
  - Run `bun install` to update lockfile

- [x] **0.2** Fix `packages/shared`
  - Add shared TypeScript types: `Article`, `Feed`, `Tag`, `ArticleStatus` (draft/review/published)
  - Add shared constants: status enums, API error codes, category list (14 AI/ML categories)
  - Export `BACKEND_API_URL` config getter (single source of truth)
  - Update `apps/web/app/admin/lib/types.ts` to import from `@codepawl/shared`
  - Update `apps/web/app/lib/news.ts` to import from `@codepawl/shared`
  - Remove duplicate type definitions

- [x] **0.3** Security quick fixes
  - Add basic rate limiting middleware to FastAPI (`slowapi` or custom)
  - Restrict CORS `allow_headers` to actual headers used
  - Move admin API key from localStorage to httpOnly cookie (set via login endpoint, check via middleware)
  - Add input sanitization on article slug in admin editor

- [x] **0.4** Validate and commit
  - Run `bun run lint` + `bun run typecheck` in apps/web
  - Run `ruff check` + `pytest` in apps/api
  - Ensure CI passes
  - PR to staging, squash merge
  <!-- Pre-existing issues found during Phase 0 validation (not introduced by this phase):
       - eslint: 13 no-explicit-any errors + 3 no-unused-vars warnings in admin/feeds, admin/page, DinoGame, feed/route
       - ruff: 4 unused-import errors in webhook.py, supabase_client.py, test_github_service.py, test_rate_limit.py
       - pytest: 1 failure in test_config.py::test_default_values (monkeypatch doesn't clear .env file loaded by pydantic-settings)
       These should be addressed in a separate cleanup PR. -->

### Cycle
```
build: fix each task item
test:  lint + typecheck + pytest + manual check admin dashboard still works
push:  PR to staging with checklist of what changed
```

### Done when
- Zero unused packages flagged
- `@codepawl/shared` imported in both admin and news lib
- Rate limiting active on public endpoints
- Admin auth uses httpOnly cookie
- CI green

---

## Phase 1: User Auth + Data Model

**Duration:** 3-4 days
**Branch:** `feat/user-auth`
**Depends on:** Phase 0 complete
**Goal:** Users can sign up, log in, have profiles

### Tasks

- [x] **1.1** Set up Supabase Auth
  - Enable GitHub OAuth provider in Supabase dashboard
  - Install `@supabase/ssr` in apps/web
  - Create Supabase client utilities (browser client + server client)
  - Add auth middleware in Next.js (protect /admin, /community routes)

- [x] **1.2** Database schema (Supabase SQL migrations)
  ```sql
  -- User profiles (extends Supabase auth.users)
  create table profiles (
    id uuid references auth.users primary key,
    username text unique not null,
    display_name text,
    bio text,
    avatar_url text,
    karma integer default 0,
    created_at timestamptz default now()
  );

  -- Auto-create profile on signup
  create function handle_new_user()
  returns trigger as $$
  begin
    insert into profiles (id, username, display_name, avatar_url)
    values (
      new.id,
      new.raw_user_meta_data->>'user_name',
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'avatar_url'
    );
    return new;
  end;
  $$ language plpgsql security definer;

  create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function handle_new_user();

  -- RLS policies
  alter table profiles enable row level security;
  create policy "Public profiles are viewable by everyone"
    on profiles for select using (true);
  create policy "Users can update own profile"
    on profiles for update using (auth.uid() = id);
  ```

- [x] **1.3** Auth UI
  - Login page at `/login` with "Sign in with GitHub" button
  - Auth callback handler at `/auth/callback`
  - User dropdown in navbar (avatar, username, logout)
  - Profile page at `/profile/[username]`
  - Protected route wrapper component

- [x] **1.4** Update admin auth
  - Admin role check: add `role` column to profiles (default 'user', can be 'admin')
  - `/admin` routes check both session AND role='admin'
  - Keep API key auth for backend automation endpoints (backward compat)

- [x] **1.5** Add shared auth types to `@codepawl/shared`
  - `User`, `Profile` types
  - Role enum

### Cycle
```
build: implement each task, commit after each sub-task
test:  manual test full auth flow (signup > login > profile > logout)
       verify admin dashboard still works with new auth
       verify existing news/blog pages unaffected (no auth required)
       run lint + typecheck
push:  PR to staging, include test screenshots/recording
```

### Done when
- GitHub OAuth login works end to end
- Profile auto-created on first login
- Navbar shows user state (logged in/out)
- Admin routes protected by role
- No regression on public pages

---

## Phase 2: Community MVP

**Duration:** 1 week
**Branch:** `feat/community`
**Depends on:** Phase 1 complete
**Goal:** Users can post, comment, vote. Basic forum functional.

### Tasks

- [x] **2.1** Database schema
  ```sql
  create table posts (
    id uuid default gen_random_uuid() primary key,
    author_id uuid references profiles(id) not null,
    type text check (type in ('link', 'text', 'show')) not null,
    title text not null,
    url text,                    -- for link posts
    content text,                -- for text/show posts
    score integer default 0,
    comment_count integer default 0,
    is_auto boolean default false,  -- true if posted by news pipeline
    source_article_id uuid references articles(id),  -- link to news article if auto
    created_at timestamptz default now(),
    updated_at timestamptz default now()
  );

  create table comments (
    id uuid default gen_random_uuid() primary key,
    post_id uuid references posts(id) on delete cascade not null,
    parent_id uuid references comments(id),  -- null = top-level
    author_id uuid references profiles(id) not null,
    content text not null,
    score integer default 0,
    created_at timestamptz default now()
  );

  create table votes (
    user_id uuid references profiles(id) not null,
    target_id uuid not null,
    target_type text check (target_type in ('post', 'comment')) not null,
    value integer check (value in (1, -1)) not null,
    created_at timestamptz default now(),
    primary key (user_id, target_id, target_type)
  );

  -- Indexes
  create index posts_score_created on posts (score desc, created_at desc);
  create index comments_post_id on comments (post_id, created_at);
  create index votes_target on votes (target_id, target_type);

  -- RLS
  alter table posts enable row level security;
  alter table comments enable row level security;
  alter table votes enable row level security;
  -- Public read, authenticated write policies for each
  ```

- [x] **2.2** Ranking algorithm
  - Implement HN-style ranking: `score = (upvotes - 1) / pow(age_hours + 2, 1.8)`
  - Recalculate via Supabase database function or edge function on a timer
  - Alternatively: compute on read with a materialized view refreshed every 60s
  - Start simple, optimize later

- [x] **2.3** API routes (FastAPI)
  - `GET /api/community/posts` (paginated, sorted by rank or new)
  - `GET /api/community/posts/{id}` (post detail + comments tree)
  - `POST /api/community/posts` (auth required)
  - `POST /api/community/posts/{id}/comments` (auth required)
  - `POST /api/community/vote` (auth required, body: target_id, target_type, value)
  - Auth: verify Supabase JWT from Authorization header

- [x] **2.4** Frontend pages
  - `/community` - post list (ranked/new tabs), submit button
  - `/community/submit` - post form (title, url or content, type selector)
  - `/community/post/[id]` - post detail + threaded comments
  - `/community/post/[id]` - vote buttons (upvote arrow, score display)
  - Comment form (inline, with reply button on each comment)
  - User link on posts/comments goes to `/profile/[username]`

- [x] **2.5** Comment threading
  - Fetch flat comment list, build tree client-side (simple for MVP)
  - Max nesting depth: 5 levels visually, then flatten
  - Collapse/expand for deep threads

- [x] **2.6** Basic moderation
  - Flag button on posts/comments (store in `flags` table)
  - Admin view: `/admin/moderation` - list flagged content
  - Admin actions: remove post/comment, warn user

### Cycle
```
build: schema > API routes > frontend pages > moderation (sequential)
test:  after schema - verify tables and RLS in Supabase dashboard
       after API - test each endpoint with curl/httpie
       after frontend - manual test full flow:
         submit link post > view on list > upvote > comment > reply > flag
         submit text post > verify rendering
         check post appears sorted correctly
       after moderation - test flag > admin review > remove
       run lint + typecheck + pytest
push:  PR to staging per sub-task or grouped logically
```

### Done when
- Full post/comment/vote cycle works
- Posts sorted by rank on /community
- Threaded comments render correctly
- Flagging and admin moderation functional
- Mobile responsive
- No auth regression

---

## Phase 3: News Pipeline Integration

**Duration:** 2-3 days
**Branch:** `feat/news-integration`
**Depends on:** Phase 2 complete
**Goal:** Auto-generated news feeds into community, creating content loop

### Tasks

- [x] **3.1** Auto-post pipeline
  - After news article status changes to "published", create a community post automatically
  - Post type: 'link', title from article title, url from article source_url
  - Author: system account (create a "CodePawl Bot" profile)
  - Set `is_auto = true`, `source_article_id = article.id`
  - Avoid duplicates: check source_article_id before inserting

- [x] **3.2** "Show CodePawl" post type
  - Add 'show' to post type enum
  - `/community/submit` has "Show CodePawl" option
  - Show posts get special styling/badge on community list
  - Separate tab/filter: `/community?type=show`

- [x] **3.3** Cross-linking
  - On `/news/[slug]` page, add "Discuss on Community" link if community post exists
  - On `/community/post/[id]` for auto posts, add "Original article" link
  - Blog posts: add "Discuss this post" link at bottom

- [x] **3.4** Tag bridge
  - Reuse the 14 AI/ML category tags from news pipeline for community posts
  - Users can select tags when submitting
  - Filter posts by tag on community page

### Cycle
```
build: auto-post > show type > cross-links > tags
test:  trigger news collection, verify auto-post appears in community
       submit a Show post, verify badge and filter
       check cross-links navigate correctly both directions
       lint + typecheck + pytest
push:  single PR to staging
```

### Done when
- New published articles auto-appear in community
- Show CodePawl posts work with distinct styling
- Cross-links between news, blog, and community are functional
- Tag filtering works

---

## Phase 4: Engagement + Polish

**Duration:** ongoing
**Branch:** feature branches as needed
**Depends on:** Phase 3 complete
**Goal:** Retention features, scaling prep

### Tasks (prioritize based on user feedback)

- [x] **4.1** Notifications
  - Supabase Realtime subscription for comment replies
  - Notification bell in navbar with unread count
  - Notification preferences in profile settings

- [x] **4.2** Karma system
  - Upvotes on your posts/comments increase your karma
  - Karma thresholds: downvote at 50+, flag at 100+
  - Display karma on profile

- [ ] **4.3** Search
  - Add Meilisearch or Typesense for posts + articles + blog
  - Search bar in navbar
  - `/search?q=` results page

- [ ] **4.4** Frontend testing
  - Set up Vitest for component tests
  - Playwright for critical path E2E (login > post > comment > vote)
  - Add to CI pipeline

- [ ] **4.5** Performance
  - Audit Three.js bundle size, lazy load or remove 3D blob
  - Add connection pooling for Supabase if needed
  - Redis cache layer in front of hot endpoints if traffic warrants

- [ ] **4.6** Community seeding strategy
  - Invite 20-30 devs from Vietnamese AI/ML community
  - Post 3-5 quality items daily from team for first month
  - Cross-post best discussions to HN/Reddit/dev.to

---

## Product Status Reference

| Product | Status | Action |
|---------|--------|--------|
| CodePawl Web | Active, this repo | Continue building |
| News Pipeline | Working | Integrate with community (Phase 3) |
| Blog | Working | Keep posting content |
| Community Forum | Not started | Build in Phase 2 |
| Loclean | External repo, listed as project | Keep as project card |
| TeamClaw | Does not exist | Do NOT list as product until MVP exists |
| Lognis | Does not exist | Do NOT list as product until MVP exists |
| Yeastbook | Does not exist | Do NOT list as product until MVP exists |
| OpenClaw | Does not exist | Do NOT list as product until MVP exists |

---

## Rules for Claude Code

1. **Always read this file before starting work.** Check which phase is current, what's done, what's next.
2. **One phase at a time.** Do not jump ahead or mix phase work.
3. **Follow the cycle** for each phase: build > test > push. Do not skip testing.
4. **Branch naming:** use the branch name specified in each phase.
5. **Commit often.** Each sub-task (e.g., 0.1, 0.2) should be at least one commit.
6. **Do not create features not listed here** without explicit approval.
7. **Update this file** when completing tasks (check the boxes) and when phase is done.
8. **If blocked**, document the blocker inline and move to the next unblocked task.
9. **Preserve existing functionality.** Every change must not break blog, news, projects, admin, or feeds.
10. **Use `@codepawl/shared`** for any types or constants shared between frontend and backend.