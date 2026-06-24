# Database Migrations and Schema Plan

Generated: 2026-06-24

## Goal

Keep local state durable, inspectable, and migratable.

## Database choice

SQLite for MVP.

## Migration requirements

- Version every schema change.
- Migration files committed to repo.
- Migrations run on app startup with backup on failure.
- Do not destroy user traces without explicit migration notes.

## Suggested tables

```sql
CREATE TABLE workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE runs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  task TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  total_input_tokens INTEGER DEFAULT 0,
  total_output_tokens INTEGER DEFAULT 0,
  total_cost_estimate REAL DEFAULT 0
);

CREATE TABLE trace_events (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id),
  step INTEGER NOT NULL,
  type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_trace_events_run_step ON trace_events(run_id, step);
```

## Data versioning

All JSON payloads should include `schemaVersion`.

## Backup strategy

Before destructive migrations:

- copy DB to `backups/codepawl-<timestamp>.sqlite`
- keep last 5 backups

## Done when

A clean install creates DB, app restart preserves state, and tests can migrate from previous schema fixtures.
