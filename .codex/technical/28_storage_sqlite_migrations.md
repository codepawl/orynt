# SQLite and Migrations

## Choices

For Rust-owned app settings/license DB:

```text
sqlx or rusqlite
```

For sidecar-owned runtime trace DB:

```text
better-sqlite3, Drizzle, or Kysely
```

Pick one owner per database file to avoid contention.

This is the MVP decision, not an open question.

## Files

```text
app.db       # settings/license/app state, Rust-owned
trace.db     # runs/steps/actions/model calls, sidecar-owned
blobs/       # screenshots/observations, retention-managed
profiles/    # browser profiles
```

## Migration rules

- numbered migrations
- backup before destructive change
- no secrets in DB
- startup schema check
