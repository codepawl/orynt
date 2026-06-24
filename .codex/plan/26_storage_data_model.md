# Storage and Data Model

Generated: 2026-06-24

## Storage principle

Local-first by default. Cloud sync is future optional.

## Storage components

- SQLite for structured metadata.
- Local artifact directory for screenshots/videos/raw observations.
- Secret store / OS keychain for provider keys.
- Rust-owned `app.db` for settings, license cache, app metadata, and non-secret key references.
- Sidecar-owned `trace.db` for runtime traces, observations, actions, and model calls.

## Core tables

Use one owner per database file to avoid write contention.

### `app.db` — Rust/Tauri host owned

```sql
workspaces(id, name, created_at, updated_at)
settings(key, value_json, updated_at)
license_cache(account_id, plan, valid_until, offline_grace_until, features_json, signature, updated_at)
provider_key_refs(id, provider, keychain_ref, created_at, updated_at)
```

### `trace.db` — Node sidecar owned

```sql
runs(id, workspace_id, task, status, started_at, ended_at, total_tokens, total_cost_estimate, permission_mode, surface_kind)
trace_events(id, run_id, step, type, payload_json, created_at)
observations(id, run_id, step, summary_json, raw_ref, screenshot_ref, token_estimate)
actions(id, run_id, step, action_json, status, risk, approval_id, created_at)
approvals(id, run_id, action_id, status, reason, created_at, resolved_at)
skills(id, workspace_id, name, version, skill_json, created_at, updated_at)
model_calls(id, run_id, step, provider, model, input_tokens, output_tokens, cost_estimate, latency_ms)
artifacts(id, run_id, kind, path, hash, size_bytes, created_at)
```

## Artifact paths

```text
~/.codepawl/
  db/codepawl.sqlite
  artifacts/
    runs/<run-id>/
      screenshots/
      observations/
      network/
      exports/
  logs/
```

## Data retention

Default retention:

- run summaries: keep until deleted
- full observations: 30 days by default
- screenshots: 7 days by default
- raw prompts: disabled unless debug mode
- model call metadata: keep, but never store raw provider secrets

## Redaction

Redact before storage when possible:

- password fields
- tokens/api keys
- credit card-like values
- email content if privacy mode enabled

## Done when

The app can show run history, open a trace, and delete a run with all artifacts.
