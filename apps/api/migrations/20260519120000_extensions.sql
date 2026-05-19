-- Enable extensions used across the MVP schema.
-- pgcrypto provides gen_random_uuid(); citext powers case-insensitive email match.
create extension if not exists pgcrypto;
create extension if not exists citext;
