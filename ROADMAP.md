# CodePawl Development Roadmap

**Last updated:** 2026-03-31
**Owner:** An (Founder)
**Repo branch:** staging

---

## Current State Summary

CodePawl is an AI/ML community platform with a blog and community forum, built with Next.js 16 + FastAPI + Supabase + Bun monorepo. Core working features: MDX blog, community posts/comments/voting, GitHub auth, admin dashboard (blog + community management), feed generation, CI/CD.

What does NOT exist yet: search, community seeding.

> ⚠️ **Supabase Dashboard TODO:** Update email templates to use token_hash URLs for PKCE flow.
> All templates (signup, invite, magiclink, recovery, email_change) must use:
> `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=TYPE&next={{ .RedirectTo }}`
> Also add `/auth/confirm` and `/reset-password` to Redirect URLs in Auth settings.

---

## Phase 0: Technical Debt Cleanup ✅

**Branch:** `fix/tech-debt`

- [x] **0.1** Remove unused packages
- [x] **0.2** Fix `packages/shared`
- [x] **0.3** Security quick fixes
- [x] **0.4** Validate and commit

---

## Phase 1: User Auth + Data Model ✅

**Branch:** `feat/user-auth`

- [x] **1.1** Set up Supabase Auth (GitHub OAuth)
- [x] **1.2** Database schema (profiles, RLS)
- [x] **1.3** Auth UI (login, callback, navbar, profile page)
- [x] **1.4** Update admin auth (role-based)
- [x] **1.5** Shared auth types in `@codepawl/shared`

---

## Phase 2: Community MVP ✅

**Branch:** `feat/community`

- [x] **2.1** Database schema (posts, comments, votes)
- [x] **2.2** Ranking algorithm (HN-style)
- [x] **2.3** API routes (posts, comments, voting)
- [x] **2.4** Frontend pages (/community, /community/submit, /community/post/[id])
- [x] **2.5** Comment threading
- [x] **2.6** Basic moderation (/admin/moderation)

---

## Phase 3: Blog → Community Integration ✅

**Branch:** `fix/content-flow`

- [x] **3.1** Auto-share published blog posts to community (type=link, /blog/[slug])
- [x] **3.2** Admin full CRUD (blog, community pages)
- [x] **3.3** Remove news/RSS pipeline entirely (see fix/remove-news-pipeline)

---

## Phase 4: Engagement + Polish

**Branch:** feature branches as needed
**Goal:** Retention features, scaling prep

### Tasks (prioritize based on user feedback)

- [x] **4.1** Notifications
  - Supabase Realtime subscription for comment replies
  - Notification bell in navbar with unread count

- [x] **4.2** Karma system
  - Upvotes on your posts/comments increase your karma
  - Display karma on profile

- [ ] **4.3** Search
  - Add Meilisearch or Typesense for posts + blog
  - Search bar in navbar
  - `/search?q=` results page

- [x] **4.4** Frontend testing
  - Playwright for critical path E2E (login > post > comment > vote)
  - Add to CI pipeline

- [x] **4.5** Performance
  - Audit Three.js bundle size, lazy load or remove 3D blob

- [ ] **4.6** Community seeding strategy
  - Invite 20-30 devs from Vietnamese AI/ML community
  - Post 3-5 quality items daily from team for first month

---

## Product Status Reference

| Product | Status | Action |
|---------|--------|--------|
| CodePawl Web | Active, this repo | Continue building |
| Blog | Working | Keep posting content |
| Community Forum | Working | Polish and grow |
| Loclean | External repo, listed as project | Keep as project card |
| TeamClaw | Does not exist | Do NOT list as product until MVP exists |
| Lognis | Does not exist | Do NOT list as product until MVP exists |
| Yeastbook | Does not exist | Do NOT list as product until MVP exists |
| OpenClaw | Does not exist | Do NOT list as product until MVP exists |

---

## Rules for Claude Code

1. **Always read this file before starting work.** Check which phase is current, what's done, what's next.
2. **Follow the cycle** for each phase: build > test > push. Do not skip testing.
3. **Branch naming:** use descriptive names (`fix/`, `feat/`).
4. **Commit often.** Each sub-task should be at least one commit.
5. **Do not create features not listed here** without explicit approval.
6. **Update this file** when completing tasks (check the boxes).
7. **If blocked**, document the blocker inline and move to the next unblocked task.
8. **Preserve existing functionality.** Every change must not break blog, community, projects, or admin.
9. **Use `@codepawl/shared`** for any types or constants shared between frontend and backend.
10. **Merge before moving on.** Before starting any new branch, check for unmerged feature/fix branches. Verify each passes lint + typecheck + pytest. If clean, create PR and squash merge to staging.
