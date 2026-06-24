# Cloud Deployment Roadmap

Generated: 2026-06-24

## Principle

CodePawl starts local-first. Cloud exists to support commercial operation, user trust, backup/sync, and team workflows. Cloud must not become required for local browser automation until the local runtime is proven.

## Product boundary

### Local-first MVP

- Runs browser automation locally.
- Stores traces locally.
- Uses BYOK model providers.
- Shows trial/billing placeholders.
- Does not require account login.

### Future cloud control plane

- Account identity.
- License and plan validation.
- Billing portal integration.
- Release metadata and update channels.
- Optional encrypted sync.
- Team membership and policy packs.

### Future cloud-run product

Cloud-hosted browser automation is a separate product track, not part of the first cloud backend.

## 1000-user target

The first cloud plan should comfortably support:

- 1000 registered users.
- 100-300 monthly active users.
- 20-100 daily active users.
- Mostly low-volume account, license, billing, sync, and release API traffic.

This does not require a complex microservice architecture.

## Recommended stack shape

Default:

```text
API: Cloudflare Workers or small container API
DB: managed Postgres
Blob storage: S3-compatible object storage
Queue/background jobs: provider-native queue or simple scheduled worker
Payments: Stripe or equivalent
Email: transactional email provider
Observability: hosted logs/errors/metrics
```

Do not use cloud Postgres for raw traces or screenshots. Store only metadata, manifests, encrypted small payloads, and object pointers.

## Deployment phases

### Phase 0 — local alpha

- No production backend.
- Manual release artifacts.
- Local license placeholder.
- BYOK only.

### Phase 1 — commercial backend

- Auth/account.
- Device registration.
- License validation.
- Billing webhook.
- Offline license cache.
- Release channel metadata.

### Phase 2 — sync and backup

- Settings sync.
- Saved skill sync.
- Optional encrypted trace export.
- Explicit user-controlled cloud backup.

### Phase 3 — team features

- Team accounts.
- Shared skills.
- Team policy templates.
- Audit events.
- Admin billing.

### Phase 4 — cloud automation, optional

- Cloud browser runs.
- Abuse prevention.
- Isolation/sandboxing.
- Per-run quotas and billing.
- Separate security review.

## Non-negotiables

- Local runs continue to work without cloud.
- Cloud upload is opt-in for sensitive traces.
- Raw screenshots, prompts, DOM, cookies, and browser recordings are never uploaded silently.
- Cloud delete and local delete are explicit and independently available.
- Billing/account outages must not destroy local user data.
