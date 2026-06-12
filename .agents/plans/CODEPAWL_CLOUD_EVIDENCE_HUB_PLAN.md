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

CP-002 defines the intake contract only. There is still no public upload route,
no persistence for customer artifacts, and no production Cloud provisioning.
`/cloud/evidence` remains a read-only static demo until a later approved
checkpoint explicitly enables intake.

CP-003 adds browser-local artifact preview only. Users may paste or select a
single local JSON bundle shaped as the six accepted artifact filenames below,
and validation runs entirely in the browser with the web-side helper. Artifact
contents are not uploaded, transmitted to CodePawl servers, or stored by
CodePawl.

CP-004 adds browser-local preview support for Openpawl
`openpawl-evidence-bundle.json` files produced by Openpawl commit `7c82d4f`.
The bundle wrapper is validated locally before rendering and no server-side
upload, artifact storage, Openpawl runtime change, Marketplace webhook change,
or production Cloud provisioning is introduced.

Accepted local preview shapes:

- Preferred CP-004 shape: an Openpawl `openpawl-evidence-bundle.json` object
  with `bundleVersion`, `generatedAt`, `runId`, `artifactSchemaVersion`,
  `source: "openpawl"`, and an `artifacts` object containing the six accepted
  files below.
- Legacy CP-003 shape: a synthetic/local JSON object with the six accepted
  artifact filenames as top-level keys. This remains supported for static demo
  fixtures and tests only.

Accepted files:

- `run.json`
- `trace.json`
- `patch-plan.json`
- `selected-files.json`
- `applied-files.json`
- `report.md`

Bundle metadata requirements:

- `bundleVersion` must be `"1"`.
- `generatedAt` must be present as a string.
- `runId` must be present as a string and match nested `artifacts["run.json"].runId`.
- `artifactSchemaVersion` must be `"1"` and match every nested JSON artifact
  `schemaVersion`.
- `source` must be `"openpawl"`.
- `artifacts` must be an object containing the six accepted artifact names for
  rendering.

Required artifact set:

- A complete intake candidate must include exactly the six accepted artifact
  names above. Missing required artifacts are rejected.
- Extra files are not part of the Cloud Evidence Hub contract and must be
  rejected or ignored before persistence is considered.
- Archives, source trees, `.git` directories, dependency folders, environment
  files, credential files, screenshots, logs outside the accepted artifact set,
  and unrelated repository content are rejected.
- Artifact paths supplied by clients are treated as untrusted labels. Intake
  normalizes by accepted artifact name only.

schemaVersion requirements:

- `run.json`, `trace.json`, `patch-plan.json`, `selected-files.json`, and
  `applied-files.json` must be valid JSON objects with `schemaVersion: "1"`.
- `schemaVersion` is required on every JSON artifact. Missing, numeric,
  unsupported, or mixed schema versions are rejected.
- `runId` must be present in `run.json`; all JSON artifacts with a `runId` must
  match `run.json`.
- `trace.json` must keep `traceId` and `runId` consistent with the Openpawl v1
  run artifact schema.
- `report.md` is Markdown display content and does not carry `schemaVersion`,
  but it must correspond to the same run metadata shown by `run.json`.

Size limits for future upload design:

- Total accepted artifact set: 10 MiB maximum.
- `run.json`: 256 KiB maximum.
- `trace.json`: 5 MiB maximum.
- `patch-plan.json`: 1 MiB maximum.
- `selected-files.json`: 1 MiB maximum.
- `applied-files.json`: 1 MiB maximum.
- `report.md`: 512 KiB maximum.
- These are design limits for a future upload/link flow. CP-002 only validates
  static demo objects locally in the web app.

Redaction expectations:

- Users must redact secrets, credentials, tokens, private keys, personal data,
  proprietary source snippets, customer prompts, and sensitive model responses
  before any future submission.
- `selected-files.json` may contain file paths and selected content in
  self-managed Openpawl artifacts, but the hosted intake must warn users not to
  submit private source content unless a later privacy/security review approves
  that workflow.
- Markdown and JSON are displayed as data only. They must not be executed, and
  rendered Markdown must be sanitized.
- Intake logs must record validation status, file names, sizes, hashes, and
  rejection codes only; they must not log artifact bodies.

Rejection reasons:

- `missing_required_artifact`: one or more accepted artifacts is absent.
- `missing_bundle_metadata`: Openpawl bundle metadata such as `bundleVersion`,
  `generatedAt`, `runId`, `artifactSchemaVersion`, or `source` is absent or not
  usable.
- `wrong_bundle_version`: Openpawl bundleVersion is not `"1"`.
- `unknown_artifact`: a file outside the six accepted names was submitted.
- `unsupported_archive_or_tree`: the submission is an archive/source tree rather
  than the flat accepted artifact set.
- `oversized_artifact`: one file exceeds its per-file limit.
- `oversized_artifact_set`: combined artifacts exceed the total limit.
- `invalid_json`: a JSON artifact cannot be parsed as a JSON object.
- `wrong_schema_version`: JSON artifact schemaVersion is missing or not `"1"`.
- `run_id_mismatch`: artifact run identifiers do not match `run.json`.
- `unsafe_payload_text`: artifact text appears to contain secrets, credentials,
  private keys, or other unsafe-looking sensitive data.
- `unredacted_source_or_prompt`: artifact text appears to include source code,
  prompts, traces, or model output that has not been approved for hosted intake.
- `unsupported_openpawl_version`: artifacts do not match the supported Openpawl
  artifact contract for the enabled Cloud checkpoint.
- `malformed_report`: `report.md` is empty, too large, or cannot be safely
  displayed as Markdown.

Retention policy for future uploads:

- Before intake is enabled, publish the retention period in product copy and
  legal pages.
- Default future retention target: retain accepted artifacts and normalized
  metadata for 30 days for waitlist/private-preview evidence review, then delete
  unless a user explicitly requests earlier deletion or a later paid plan
  defines a different policy.
- Rejected artifact bodies should not be persisted. Validation events may keep
  hashed identifiers, sizes, file names, and rejection codes for abuse
  prevention and auditability.
- Do not retain full repositories, automatic source snapshots, billing data,
  organization RBAC state, or team dashboards as part of this checkpoint.

Validation:

- Enforce size limits per file and total upload.
- Require the complete six-file artifact set with `run.json` metadata to
  identify a run.
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

Browser smoke:

- Keep HTTP route smoke as the fastest default validation layer.
- Use Playwright as a focused browser UI smoke layer for deploy/pre-release
  checks, not as a required blocker for every small local task.
- Local preview smoke: `bun run test:e2e`.
- Production smoke: `PLAYWRIGHT_BASE_URL=https://codepawl.com bun run test:e2e`.
- Chromium is the only default Playwright project. On `ubuntu26.04-x64`,
  `bunx playwright install chromium` may fail because Playwright does not
  support managed Chromium for that platform; use the documented system Chrome
  channel fallback when `/usr/bin/google-chrome` or
  `/usr/bin/google-chrome-stable` is available.

Manual QA:

- Upload/link a known Openpawl `v0.5.1` run artifact set.
- Verify summary values match `report.md`, `run.json`, and `trace.json`.
- Verify artifact viewer handles long JSON and Markdown without clipping.
- Verify Cloud copy remains upcoming/waitlist-only.

## Checkpoints

0. **CP-001 read-only evidence viewer skeleton**
   - Added `/cloud/evidence` as a static, read-only Cloud Evidence Hub demo route.
   - Added a web-side `EvidenceRunViewModel` with run ID, status, readiness, validation, mode, `schemaVersion`, artifact list, and demo report/trace paths.
   - Rendered a rounded-industrial Evidence Summary page from static Openpawl `v0.5.1` artifact fixture data.
   - Added explicit safety copy: "CodePawl Cloud Evidence Hub is upcoming. This demo shows the intended artifact review experience."
   - Added copy guardrails that the demo does not upload, store, or process real repository code, prompts, traces, artifacts, billing data, or customer workspaces.
   - Linked the pricing Cloud waitlist card to the read-only evidence demo without changing the waitlist/contact path.
   - Added component tests for route copy safety and static artifact rendering.

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

3a. **CP-003 client-side artifact preview**
   - Added browser-only preview to `/cloud/evidence`; no server-side upload,
     endpoint, or storage was introduced.
   - Preview accepts pasted or selected local JSON bundles with top-level keys
     for `run.json`, `trace.json`, `patch-plan.json`, `selected-files.json`,
     `applied-files.json`, and `report.md`.
   - Reuses the web-side artifact validation helper for schemaVersion, required
     artifacts, local size limits, run ID consistency, artifact shape, and
     unsafe-looking payload text.
   - Renders the same Evidence Summary and artifact panels for valid local
     artifacts.
   - Shows explicit rejection/blocking reasons for invalid local bundles.
   - Added copy and legal clarifications: "Local preview only. Artifact contents
     are not uploaded or stored."

3b. **CP-004 Openpawl evidence bundle preview**
   - Added support for Openpawl `openpawl-evidence-bundle.json` local preview
     shape with `bundleVersion`, `generatedAt`, `runId`,
     `artifactSchemaVersion`, `source: "openpawl"`, and nested artifacts.
   - Kept the CP-003 top-level six-artifact fixture shape for synthetic demo
     and regression tests.
   - Validates bundle metadata, nested artifact schemaVersion values, run ID
     consistency, missing nested artifacts, and unsafe-looking payload text
     before rendering.
   - Updated `/cloud/evidence` copy to tell users to download
     `openpawl-evidence-bundle.json` from Openpawl runs and preview it locally
     in the browser.
   - No server upload/storage, Openpawl runtime changes, Marketplace webhook
     changes, or production Cloud provisioning were added.

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
