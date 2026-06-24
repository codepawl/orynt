# Cloud Backend Scale Plan — 1000 Users

## Decision

Keep CodePawl local-first for runtime automation. Add cloud later as a control plane for account, license, billing, sync, release metadata, and optional encrypted trace backup.

Do not move browser automation to cloud by default. Controlled browser runs stay local unless a future paid cloud-run product is explicitly designed.

## Target scale

Initial cloud target:

```text
1000 registered users
100-300 monthly active users
20-100 daily active users
low request volume per user
mostly account/license/settings/sync APIs
no cloud-hosted browser automation in first cloud phase
```

This is small scale. Optimize for simplicity, privacy, and operational clarity, not distributed systems.

## Recommended architecture

```text
Tauri desktop app
  -> Cloud API
      -> Managed Postgres
      -> Object storage
      -> Payment provider webhook
      -> Email provider
      -> Observability sink
```

### Cloud API

Use one small API service:

- Option A: Cloudflare Workers + Hono/TypeScript.
- Option B: small container service on Fly.io/Render/Railway.

For 1000 users, prefer a serverless API if the backend remains mostly CRUD, license checks, signed URL generation, and webhooks.

Cloudflare Workers are viable for this size because Workers scale across Cloudflare's network, paid Workers have no general request limit, and HTTP-triggered Workers have no hard wall-clock duration as long as the client remains connected. Keep CPU-light work in the Worker and offload heavy jobs.

### Primary cloud DB

Use managed Postgres.

Do not use SQLite/D1 as the main commercial backend DB if team accounts, billing state, licenses, audit logs, and future sync are expected.

Good options:

- Neon Postgres for autoscaling Postgres.
- Supabase Postgres if built-in Auth/Storage/Admin tooling is valuable.
- Any managed Postgres is acceptable if backups, migrations, metrics, and connection pooling are supported.

Use Postgres tables for:

- users
- accounts
- memberships
- devices
- licenses
- subscriptions
- plan_limits
- sync_manifests
- audit_events
- release_channels

### Object storage

Use S3-compatible object storage for large cloud artifacts.

Appropriate providers:

- AWS S3
- Cloudflare R2
- Supabase Storage

Use object storage for:

- optional encrypted trace backups
- exported reports
- release artifacts
- crash bundles if user explicitly uploads them

Do not store raw screenshots, raw DOM, prompts, or browser recordings in Postgres.

## Sync model

Default cloud sync should be metadata-first:

```text
local app.db / trace.db
  -> sync manifest
  -> encrypted small records
  -> optional encrypted artifact upload
```

P1 cloud sync should include:

- workspace metadata
- license/account state
- user settings
- saved skills metadata
- optional encrypted skill payloads

Only add trace artifact sync after local retention, encryption, and delete semantics are reliable.

## Privacy rules

- Local traces remain local by default.
- Cloud upload is opt-in per workspace.
- Encrypt sensitive sync payloads before upload where feasible.
- Never upload provider API keys.
- Never upload raw browser session cookies.
- Provide "Delete cloud data" and "Delete local data" separately.
- Cloud logs must not include trace payloads, prompts, screenshots, cookies, or API keys.

## Disk protection relationship

Cloud is not a substitute for local retention.

Local app still needs:

- per-workspace disk quota
- screenshot/raw-observation retention
- artifact cleanup
- trace compaction
- optional cloud backup after compaction

Cloud backup can reduce user fear of deleting local traces, but it must not silently upload sensitive artifacts.

## 1000-user sizing

Start with:

```text
1 API service
1 managed Postgres instance/project
1 object storage bucket
1 background job/queue mechanism
1 payment provider
1 email provider
1 observability/logging sink
```

Expected bottlenecks:

- bad DB indexes
- webhook idempotency bugs
- unbounded audit/event tables
- accidentally uploading large traces
- noisy logs with sensitive payloads
- connection pooling if using serverless API with Postgres

Not expected bottlenecks at 1000 users:

- API compute
- global edge scale
- object storage capacity
- relational DB capacity, assuming reasonable indexes and retention

## Cloud tables

Minimum schema direction:

```sql
users(id, email, created_at, last_seen_at)
accounts(id, owner_user_id, plan, status, created_at)
memberships(account_id, user_id, role, created_at)
devices(id, account_id, user_id, device_fingerprint_hash, created_at, last_seen_at)
licenses(id, account_id, plan, status, valid_until, offline_grace_days, signed_payload, updated_at)
subscriptions(id, account_id, provider, provider_customer_id, provider_subscription_id, status, current_period_end)
plan_limits(plan, limits_json, updated_at)
sync_manifests(id, account_id, workspace_id_hash, version, manifest_json, updated_at)
artifact_objects(id, account_id, workspace_id_hash, kind, object_key, size_bytes, hash, created_at, expires_at)
audit_events(id, account_id, actor_user_id, action, target_type, target_id, metadata_json, created_at)
release_channels(channel, platform, version, artifact_url, signature, published_at)
```

## Rollout phases

### Cloud Phase 0 — no production backend

- Local alpha.
- Placeholder billing/trial UI.
- BYOK only.
- Manual releases.

### Cloud Phase 1 — account/license/billing

- User account.
- Device registration.
- License validation.
- Payment webhook.
- Offline license cache.
- Release metadata endpoint.

### Cloud Phase 2 — optional sync

- Workspace/settings sync.
- Saved skill sync.
- Encrypted payloads.
- Object storage for explicit exports/backups.

### Cloud Phase 3 — teams

- Team accounts.
- Memberships and roles.
- Shared skills.
- Team policy templates.
- Audit log.

### Cloud Phase 4 — cloud-run product, only if needed

- Cloud-hosted browser automation.
- Strong isolation.
- Per-run billing.
- Separate threat model.
- Separate abuse controls.

## External references

- Cloudflare Workers limits: https://developers.cloudflare.com/workers/platform/limits/
- Neon autoscaling: https://neon.com/docs/introduction/autoscaling
- Supabase Postgres overview: https://supabase.com/docs/guides/database/overview
- Amazon S3 overview: https://docs.aws.amazon.com/AmazonS3/latest/userguide/Welcome.html
