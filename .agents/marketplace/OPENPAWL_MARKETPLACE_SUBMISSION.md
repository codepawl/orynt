# Openpawl Marketplace Submission Pack

Status: ready for Marketplace submission preparation. Do not mark the listing live until a GitHub Marketplace listing URL exists and has been verified.

Last production verification: 2026-06-12

## Submission Identity

| Field | Value |
| --- | --- |
| Product title | `Openpawl` |
| Feature-card title | `Openpawl` |
| Feature-card subtitle | `Coding-agent coordination for GitHub Actions` |
| Publisher/owner | `CodePawl` |
| Repository | `https://github.com/codepawl/openpawl` |
| Candidate release | `v0.5.3` |
| Release URL | `https://github.com/codepawl/openpawl/releases/tag/v0.6.0` |
| Primary category | `Code quality` |
| Secondary category | `Testing` |
| Pricing plan | Free, self-managed GitHub Action. No CodePawl Cloud billing or hosted provisioning from the public website. |

## Marketplace Copy

Short description:

> Coordinate coding agents with reviewable plans, guarded changes, and traceable run evidence in GitHub Actions.

Full description:

> Openpawl is an open runtime for coding-agent coordination. The first supported surface is GitHub Actions. It helps coding agents plan, validate, hand off work, and leave evidence that humans and other agents can review.
>
> Openpawl is dry-run by default. Runs produce reviewable reports and schema-versioned artifacts such as `report.md`, `trace.json`, `run.json`, `patch-plan.json`, `selected-files.json`, and `applied-files.json`. Openpawl `v0.5.3+` also produces `openpawl-evidence-bundle.json` for browser-local CodePawl Cloud Evidence preview; CodePawl Cloud is not generally available and the public preview does not upload or store customer artifact contents. Write mode must be selected explicitly and remains constrained by Openpawl safety gates, bot branches, pull requests, and human review.
>
> The current public release is `codepawl/openpawl@v0.6.0`. The GitHub Marketplace listing is not live until GitHub provides and verifies a listing URL.

## Required URLs

Production website URLs verified with HTTP 200:

- Support: `https://codepawl.com/openpawl/support`
- Install: `https://codepawl.com/openpawl/install`
- Documentation: `https://codepawl.com/openpawl/docs`
- Status: `https://codepawl.com/status`
- Privacy policy: `https://codepawl.com/privacy`
- Terms: `https://codepawl.com/terms`
- Security: `https://codepawl.com/security`

GitHub URLs verified with HTTP 200:

- Repository: `https://github.com/codepawl/openpawl`
- Release: `https://github.com/codepawl/openpawl/releases/tag/v0.6.0`
- Action metadata: `https://github.com/codepawl/openpawl/blob/v0.5.3/action.yml`
- Release install guide: `https://github.com/codepawl/openpawl/blob/v0.6.0/docs/OPENPAWL_INSTALL.md`
- Marketplace readiness notes: `https://github.com/codepawl/openpawl/blob/v0.6.0/docs/MARKETPLACE.md`
- Docs tree: `https://github.com/codepawl/openpawl/tree/v0.5.3/docs`
- Issues/support: `https://github.com/codepawl/openpawl/issues`
- Security advisories: `https://github.com/codepawl/openpawl/security/advisories`

## Webhook Settings

Webhook URL:

`https://codepawl.com/api/github/marketplace`

Expected method behavior:

- `GET` returns `405` with `Allow: POST`.
- `POST` is the only accepted Marketplace webhook method.

Supported GitHub event:

- `marketplace_purchase`

Supported purchase actions:

- `purchased`
- `changed`
- `cancelled`
- `pending_change`
- `pending_change_cancelled`

Security behavior:

- Requires `Content-Type: application/json`.
- Requires `X-Hub-Signature-256`.
- Verifies HMAC-SHA256 with `GITHUB_MARKETPLACE_WEBHOOK_SECRET`.
- Ignores unsupported events/actions.
- Does not provision CodePawl Cloud, billing, hosted storage, team access, or any private service from public website webhook events.

## Security And Compliance Text

- Openpawl is self-managed in the user's GitHub repository through GitHub Actions.
- Dry-run is the default mode.
- Write mode must be selected explicitly and remains constrained by Openpawl safety gates.
- Approved writes use bot branches and pull requests for human review.
- Forked pull request comments and bot-authored recursive comments are skipped.
- Openpawl run artifacts are written in the target repository workflow workspace under `.codepawl/runs/<run-id>/`.
- Openpawl `v0.5.3+` produces `openpawl-evidence-bundle.json` as an artifact
  wrapper for local CodePawl Cloud Evidence preview.
- CodePawl Cloud is upcoming and waitlist-only. The public website does not offer Cloud billing, provisioning, memory, team RBAC, or production SLA claims.
- The Cloud Evidence Hub public preview is local/browser-only and does not
  upload or store customer artifact contents.
- Users should not submit secrets, private source code, credentials, or sensitive logs through public support forms or issues.

## Release Notes And Metadata Caveat

The pinned public release is `v0.6.0`. It is an Action patch release that adds
`openpawl-evidence-bundle.json` while preserving the self-managed GitHub
Actions surface and existing safety gates.

The Marketplace listing copy should use the approved coordination-runtime positioning above while keeping current capabilities concrete: GitHub Actions is the first supported surface, dry-run is default, write mode is guarded, and evidence artifacts are traceable.

## Screenshot Checklist

Prepare or capture these Marketplace screenshots before final submission:

- Openpawl landing page at `https://codepawl.com/openpawl`.
- GitHub Action workflow dispatch page or run page showing a pinned `codepawl/openpawl@v0.6.0` workflow.
- Successful Openpawl Action smoke/run evidence showing the run, report, and artifact upload.
- Evidence Summary in `report.md` showing run ID, mode, status, readiness, Actions URL, artifact paths, and trace/report paths.
- GitHub Actions artifact view containing `report.md`, `trace.json`, `run.json`, `patch-plan.json`, `selected-files.json`, `applied-files.json`, and `openpawl-evidence-bundle.json`.
- Safety/defaults screenshot or docs view showing dry-run default, explicit write mode, guarded changes, and human review gates.

Current prepared local website screenshot examples from final visual QA:

- `/tmp/codepawl-openpawl-desktop-final.png`
- `/tmp/codepawl-install-desktop-final.png`
- `/tmp/codepawl-status-desktop-final.png`

These local screenshots are QA artifacts, not committed product assets.

## Caveats Before Submission

- Do not claim Marketplace approval or publication until the listing URL exists.
- Do not claim CodePawl Cloud is available.
- Do not publish npm packages for this Action submission.
- Do not change Openpawl runtime behavior as part of Marketplace copy finalization.
- Keep Marketplace release references pinned to `v0.5.3` unless a new Action release process is explicitly started.
