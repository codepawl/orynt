-- One-off cleanup script for the prod Supabase DB.
-- Paste each STEP into the Supabase Dashboard SQL Editor as a separate run.
-- NOT a migration — community-platform schema removal is a one-time op.

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 1 — Reload PostgREST schema cache.
-- Fixes the /health/ready 404 ("Could not find the table 'public.products'").
-- The table actually exists; PostgREST just hadn't seen the migration yet.
-- Run this RIGHT NOW; instant effect on the API.
-- ════════════════════════════════════════════════════════════════════════════
notify pgrst, 'reload schema';


-- ════════════════════════════════════════════════════════════════════════════
-- STEP 2 — Preview what dropping the old community-platform tables removes.
-- READ-ONLY — does not modify the DB. Use this to spot anything you want to
-- keep before running STEP 3.
-- ════════════════════════════════════════════════════════════════════════════
select
  c.relname                                              as table_name,
  c.reltuples::bigint                                    as estimated_rows,
  pg_size_pretty(pg_total_relation_size(c.oid))          as size
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname in (
    'profiles',
    'blog_posts',
    'posts',
    'comments',
    'flags',
    'notifications',
    'papers',
    'reproductions',
    'votes',
    'wiki_pages'
  )
order by c.relname;


-- ════════════════════════════════════════════════════════════════════════════
-- STEP 3 — Drop the old community-platform tables.
-- CASCADE handles all the FK chains (votes → profiles, comments → posts etc.)
-- in one statement; order inside the DROP doesn't matter.
--
-- ⚠️  IRREVERSIBLE without a backup. If you want to keep `profiles` (for
-- Supabase Auth mirroring later), remove that one line below.
-- ════════════════════════════════════════════════════════════════════════════
drop table if exists
  public.votes,
  public.reproductions,
  public.wiki_pages,
  public.papers,
  public.notifications,
  public.comments,
  public.flags,
  public.blog_posts,
  public.posts,
  public.profiles      -- <- remove this line if you want to keep the user-profile table
cascade;


-- ════════════════════════════════════════════════════════════════════════════
-- STEP 4 — Final sanity check.
-- Should list only: contact_replies, contact_submissions, newsletter_events,
-- newsletter_subscribers, product_stats, products.
-- ════════════════════════════════════════════════════════════════════════════
select c.relname as remaining_table
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by c.relname;
