# Trace Store Data Model

## Storage location

Use local SQLite with one writer per database file to avoid write contention.

MVP ownership:

- Rust/Tauri host owns `app.db` for app settings, license cache, workspace metadata, and secret references.
- Node sidecar owns `trace.db` for runtime traces, observations, actions, model calls, and skills.
- Artifacts live in local blob directories managed by retention policy.

## Tables

```sql
CREATE TABLE runs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  task TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  permission_mode TEXT NOT NULL,
  budget_policy_json TEXT NOT NULL,
  surface_kind TEXT NOT NULL
);

CREATE TABLE steps (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  step_index INTEGER NOT NULL,
  status TEXT NOT NULL,
  summary TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE observations (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  step_id TEXT,
  kind TEXT NOT NULL,
  hash TEXT NOT NULL,
  storage_uri TEXT,
  metadata_json TEXT NOT NULL
);

CREATE TABLE actions (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  step_id TEXT NOT NULL,
  action_kind TEXT NOT NULL,
  target_node_id TEXT,
  compiled_json TEXT NOT NULL,
  result_json TEXT,
  risk_level TEXT NOT NULL
);

CREATE TABLE model_calls (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  step_id TEXT,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER,
  output_tokens INTEGER,
  estimated_usd REAL,
  latency_ms INTEGER,
  output_json TEXT
);

CREATE TABLE skills (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  skill_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

## Retention defaults

```text
run summaries: keep until deleted
full observations: 30 days
screenshots: 7 days
full prompts: disabled unless debug mode
```
