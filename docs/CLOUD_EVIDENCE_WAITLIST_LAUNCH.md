# Cloud Evidence Waitlist Launch

CodePawl Cloud Evidence is upcoming and waitlist-only. The current Evidence Hub
preview is local/browser-only, and artifact contents are not uploaded, stored,
or processed by CodePawl.

## Required Configuration

Cloudflare Worker secrets for `apps/web`:

- `RESEND_API_KEY`
- `RESEND_FROM`
- `WAITLIST_NOTIFY_TO`
- Optional: `RESEND_AUDIENCE_ID`

Set secrets without committing values:

```bash
cd apps/web
bunx wrangler secret put RESEND_API_KEY
bunx wrangler secret put RESEND_FROM
bunx wrangler secret put WAITLIST_NOTIFY_TO
bunx wrangler secret put RESEND_AUDIENCE_ID
```

Verify secret names only:

```bash
cd apps/web
bunx wrangler secret list
```

## Production Smoke

Run after deploy:

```bash
curl -fsS https://codepawl.com/cloud >/dev/null
curl -fsS https://codepawl.com/cloud/waitlist >/dev/null
curl -fsS https://codepawl.com/cloud/evidence >/dev/null
curl -fsS https://codepawl.com/openpawl/install >/dev/null
curl -fsS https://codepawl.com/openpawl/docs >/dev/null
curl -fsS https://codepawl.com/openpawl/support >/dev/null
curl -fsS -X POST https://codepawl.com/api/cloud/waitlist \
  -H 'Content-Type: application/json' \
  --data '{"email":"waitlist-smoke@codepawl.com","roleUseCase":"Production smoke","workflowNeed":"review_openpawl_run_evidence","source":"manual","notes":"Smoke test only; no artifacts."}' >/dev/null
curl -fsS -D - -o /dev/null https://codepawl.com/api/github/marketplace
```

`GET /api/github/marketplace` must return `405` with `Allow: POST`.

## Launch Checklist

- `/cloud` explains Cloud is upcoming and points first to the waitlist.
- `/cloud/waitlist` captures email, role/use case, workflow need, source tag,
  and optional notes.
- Evidence Hub CTAs route to `/cloud/waitlist` or `/cloud/evidence`.
- Waitlist copy says the current preview is local/browser-only.
- Waitlist copy tells users not to submit artifacts, source code, prompts,
  traces, logs, credentials, or secrets.
- Resend sends user confirmation and internal notification in production.
- Email failures after capture are handled without exposing secrets.
- Marketplace support routes and webhook behavior remain unchanged.

## Announcement Drafts

### X

CodePawl Cloud Evidence waitlist is open.

Cloud is upcoming; today the Evidence Hub preview is local/browser-only and does
not upload or store artifacts.

Join if you want hosted review workflows for Openpawl run evidence:
https://codepawl.com/cloud/waitlist

### Threads

The CodePawl Cloud Evidence waitlist is open.

Cloud is upcoming. The current Evidence Hub preview stays local/browser-only:
artifact contents are not uploaded or stored by CodePawl.

We are looking for teams that want reviewable Openpawl run evidence, approval
workflow feedback, and traceable agent-change records.

Join here: https://codepawl.com/cloud/waitlist

### GitHub Announcement

CodePawl Cloud Evidence waitlist is open.

CodePawl Cloud is upcoming and waitlist-only. The current Evidence Hub preview
at `https://codepawl.com/cloud/evidence` remains local/browser-only and does not
upload or store artifact contents.

The waitlist collects email, role/use case, workflow need, source tag, and
optional notes so we can prioritize hosted evidence-review workflows for
Openpawl runs. Please do not submit artifacts, source code, prompts, traces,
logs, credentials, or secrets.

Join the waitlist: https://codepawl.com/cloud/waitlist

### Email

Subject: CodePawl Cloud Evidence waitlist is open

CodePawl Cloud Evidence waitlist is open for teams that want hosted review
workflows around Openpawl run evidence, approvals, and traceable agent-change
records.

Cloud is upcoming and not generally available yet. The current Evidence Hub
preview is local/browser-only, and artifact contents are not uploaded or stored
by CodePawl.

Join the waitlist:
https://codepawl.com/cloud/waitlist

Please do not send artifacts, source code, prompts, traces, logs, credentials,
or secrets in replies or waitlist notes.
