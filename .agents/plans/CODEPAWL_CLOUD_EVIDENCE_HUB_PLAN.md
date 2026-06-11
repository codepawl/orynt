# CodePawl Cloud Evidence Hub Plan

Status: first technical plan. CodePawl Cloud is upcoming and waitlist-only; this plan does not make Cloud generally available.

## Objective

Create the first hosted evidence surface around Openpawl runs: a Cloud Evidence Hub where users can upload or link Openpawl run artifacts, inspect a run summary, review artifact contents, and join/contact the waitlist for future team workflows.

## MVP Scope

- Upload or link Openpawl run artifacts produced by `codepawl/openpawl@v0.5.1`.
- Evidence page for a single run.
- Run summary extracted from `run.json` and `report.md` Evidence Summary.
- Artifact viewer for `report.md`, `trace.json`, `run.json`, `patch-plan.json`, `selected-files.json`, and `applied-files.json`.
- Waitlist/contact path for users who want hosted evidence workflows.
- Public product copy that keeps Cloud upcoming/waitlist-only.

## Non-Goals

- No billing.
- No full SaaS workspace.
- No automatic source-code storage.
- No team RBAC yet.
- No background agent execution.
- No multi-agent autonomy claims.
- No Marketplace purchase provisioning.
- No production SLA claims.

## Product Principles

- Evidence first: preserve run provenance, validation state, artifacts, and review context.
- User-controlled data: users choose what artifacts to upload or link.
- No code ingestion by default: artifact upload should reject obvious source tree uploads and avoid storing full repositories.
- Reviewable by humans: pages must make run status, readiness, validation, and artifacts easy to audit.
- Compatible with Openpawl self-managed runs: Cloud augments Openpawl; it does not replace the GitHub Action.

## Proposed Routes

Public/waitlist:

- `/cloud` or `/evidence` if added later: Cloud Evidence Hub overview, explicitly upcoming/waitlist-only.
- `/contact`: existing waitlist/contact fallback.

Authenticated or signed upload flow, once implemented:

- `/evidence/new`: upload/link Openpawl artifact bundle.
- `/evidence/:runId`: run evidence page.
- `/evidence/:runId/artifacts`: artifact index.
- `/evidence/:runId/artifacts/:artifactName`: artifact viewer.

API routes, once implemented:

- `POST /api/evidence/runs`: create a run record from uploaded metadata or linked artifacts.
- `GET /api/evidence/runs/:runId`: fetch normalized run summary.
- `GET /api/evidence/runs/:runId/artifacts`: list stored artifact metadata.
- `GET /api/evidence/runs/:runId/artifacts/:artifactName`: retrieve sanitized artifact content.

Route names may change to match existing app conventions before implementation.

## Data Model

`evidence_runs`:

- `id`
- `public_id`
- `source`: `upload` or `linked_github_actions`
- `openpawl_version`
- `schema_version`
- `run_id`
- `mode`
- `status`
- `readiness`
- `validation_state`
- `provider_call_count`
- `selected_file_count`
- `planned_file_count`
- `applied_file_count`
- `github_actions_url`
- `artifact_name`
- `artifact_root`
- `report_path`
- `trace_path`
- `created_at`
- `updated_at`
- `submitted_email_hash` or waitlist/contact reference if needed

`evidence_artifacts`:

- `id`
- `run_id`
- `name`
- `kind`: `report`, `trace`, `run`, `patch_plan`, `selected_files`, `applied_files`, `other`
- `schema_version`
- `content_type`
- `size_bytes`
- `sha256`
- `storage_key` or `external_url`
- `created_at`

`evidence_upload_events`:

- `id`
- `run_id`
- `source_ip_hash`
- `user_agent_hash`
- `status`
- `reason`
- `created_at`

## Artifact Intake

Accepted files:

- `report.md`
- `trace.json`
- `run.json`
- `patch-plan.json`
- `selected-files.json`
- `applied-files.json`

Validation:

- Enforce size limits per file and total upload.
- Require `run.json` or `report.md` with enough metadata to identify a run.
- Parse JSON with schema validation where available.
- Treat Markdown as display content, not executable content.
- Reject archives containing source trees, `.git`, secrets files, or unrelated repository content.
- Preserve original artifact hashes for traceability.

## Architecture

Frontend:

- Reuse the existing rounded-industrial web design system.
- Evidence summary page uses cards and code/artifact blocks, not a generic SaaS dashboard.
- Artifact viewer supports Markdown rendering for `report.md` and syntax-highlighted JSON for known artifacts.

Backend:

- Start with the existing web/API boundary conventions.
- Evidence run creation validates artifacts before persistence.
- Storage layer should support replacing local/dev storage with object storage later.
- Keep Marketplace webhook separate from Evidence Hub intake.

Storage:

- Store only submitted artifacts and normalized metadata.
- Do not store full repositories or automatic code snapshots.
- Compute and store SHA-256 for each artifact.

Observability:

- Log upload validation result, artifact counts, and rejection reasons without storing secrets or artifact contents in logs.
- Add run-level audit events before adding team/workspace concepts.

## Security And Privacy Constraints

- No automatic code storage.
- No secret collection. Reject common secret filenames and warn users not to upload credentials.
- Sanitize Markdown and JSON views.
- Do not execute uploaded artifacts.
- Do not trust artifact paths from uploads; normalize and display as data.
- Rate-limit upload endpoints.
- Use signed upload/session tokens before accepting private artifacts.
- Keep public share links out of MVP unless explicit access rules are designed.
- Marketplace purchase webhooks must not provision Cloud access in MVP.

## Validation Plan

Local:

- Unit tests for artifact parser and schema normalization.
- Unit tests for rejected uploads: oversized files, unknown archives, missing run metadata, secret-like filenames.
- Component tests for evidence summary and artifact viewer.

Route smoke:

- Evidence overview/waitlist route returns 200 if introduced.
- Upload route rejects invalid methods and invalid content.
- Existing Marketplace-critical routes remain 200.
- `/api/github/marketplace` GET remains 405 with `Allow: POST`.

Manual QA:

- Upload/link a known Openpawl `v0.5.1` run artifact set.
- Verify summary values match `report.md`, `run.json`, and `trace.json`.
- Verify artifact viewer handles long JSON and Markdown without clipping.
- Verify Cloud copy remains upcoming/waitlist-only.

## Checkpoints

1. **Evidence schema and parser spike**
   - Define normalized TypeScript types.
   - Parse a local Openpawl artifact directory.
   - Produce a normalized run summary.

2. **Static Evidence Hub prototype**
   - Add non-public prototype route or internal fixture rendering.
   - Render run summary, artifact list, and viewer from fixture data.
   - No upload or persistence yet.

3. **Artifact intake API design**
   - Define upload/link request shape.
   - Add validation and rejection cases.
   - Decide storage abstraction.

4. **Waitlist-safe public surface**
   - Add Cloud Evidence Hub overview only if product copy is approved.
   - Keep `/contact` as the waitlist path.
   - Do not imply Cloud availability.

5. **MVP implementation review**
   - Security/privacy review.
   - Route smoke.
   - Marketplace webhook regression check.
   - Visual QA against rounded-industrial system.

## Open Questions

- Should MVP accept direct file uploads first, GitHub artifact links first, or both?
- What maximum upload size is acceptable for public waitlist users?
- Should evidence pages be private by default with expiring access links?
- Which existing backend service should own persistence for the first MVP?
- Should Evidence Hub require sign-in before any artifact intake?
