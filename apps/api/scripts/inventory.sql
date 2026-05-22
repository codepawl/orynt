-- Public-schema inventory for the prod Supabase project.
-- One-off diagnostic; paste into Supabase Dashboard → SQL Editor.
-- NOT a migration — does not live under apps/api/migrations/.

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Tables: name, estimated row count, disk footprint, column count, comment.
-- ────────────────────────────────────────────────────────────────────────────
select
  c.relname                                                          as table_name,
  c.reltuples::bigint                                                as estimated_rows,
  pg_size_pretty(pg_total_relation_size(c.oid))                      as total_size,
  (select count(*)
     from information_schema.columns
    where table_schema = 'public' and table_name = c.relname)        as columns,
  obj_description(c.oid, 'pg_class')                                 as comment
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind in ('r', 'p')   -- ordinary + partitioned tables only
order by c.reltuples desc, c.relname;


-- ────────────────────────────────────────────────────────────────────────────
-- 2. Views, functions, sequences in public — anything left over from the
--    previous community-platform iteration that the new monorepo won't touch.
-- ────────────────────────────────────────────────────────────────────────────
select 'view'     as kind, table_name as name
  from information_schema.views     where table_schema = 'public'
union all
select 'function' as kind, routine_name
  from information_schema.routines  where routine_schema = 'public'
union all
select 'sequence' as kind, sequence_name
  from information_schema.sequences where sequence_schema = 'public'
order by kind, name;


-- ────────────────────────────────────────────────────────────────────────────
-- 3. (Optional) Foreign-key edges between public tables — helps decide drop
--    order without violating constraints. Skip if 1+2 are enough.
-- ────────────────────────────────────────────────────────────────────────────
select
  tc.table_name      as child_table,
  kcu.column_name    as child_column,
  ccu.table_name     as parent_table,
  ccu.column_name    as parent_column,
  tc.constraint_name as fk_name
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu
  on tc.constraint_name = kcu.constraint_name
 and tc.table_schema    = kcu.table_schema
join information_schema.constraint_column_usage ccu
  on ccu.constraint_name = tc.constraint_name
 and ccu.table_schema    = tc.table_schema
where tc.constraint_type = 'FOREIGN KEY'
  and tc.table_schema    = 'public'
order by child_table, child_column;
