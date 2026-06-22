# CodePawl Security and Privacy Plan

## Security principles

CodePawl turns every AI coding session into measurable engineering work. Because it may inspect diffs, logs, validation output, prompts, artifacts, and repository paths, the default security model must be conservative.

Principles:

* Local-first by default. Local CodePawl must remain useful without CloudPawl, auth, billing, hosted sync, or a cloud account.
* No source upload by default. Source content, diffs, logs, screenshots, prompts, and raw artifacts stay local unless explicitly selected for upload.
* No telemetry by default. Do not collect usage, crash, error, source, diff, log, or prompt data without explicit opt-in.
* Least privilege. Local capture, GitHub Action execution, cloud sync, and AI Analyze should request the minimum access needed.
* Evidence-bound AI. AI output is advisory and must cite evidence; it cannot silently change policy, run commands, upload artifacts, or apply code.
* Untrusted input model. Treat logs, diffs, prompts, PR text, commit messages, issue text, agent output, and AI output as untrusted.
* Redact before persistence, reporting, upload, and comments. v0.1 must include basic redaction before data leaves transient processing paths.

## Data classification

### Metadata

Examples:

* project name
* repository URL or provider identity
* branch name
* session timestamps
* agent name
* report ID
* artifact kind, hash, size, and local path

Handling:

* May be stored locally.
* May be eligible for metadata-only cloud sync after project/workspace opt-in.
* Must not include raw source, raw diff, raw logs, prompts, or secrets.

### Report summary

Examples:

* verdict
* risk count
* evidence status
* next action summary
* session summary

Handling:

* Stored locally by default.
* Eligible for metadata/report-summary sync after opt-in.
* Must be redacted before cloud sync, GitHub comments, or job summaries.

### Report JSON and Markdown

Examples:

* `report.json`
* `report.md`
* GitHub PR report Markdown

Handling:

* Stored locally by default.
* May contain sensitive paths, snippets, evidence text, or log excerpts.
* Must be redacted before upload, PR comment, job summary, or AI Analyze upload.
* Cloud upload requires explicit user/workspace configuration.

### Diff

Examples:

* `diff.patch`
* selected changed-file hunks

Handling:

* Sensitive artifact.
* Stored locally only when needed for report generation or user-requested artifacts.
* Never uploaded by default.
* Upload requires explicit opt-in and repo policy approval.

### Logs

Examples:

* `test.log`
* `typecheck.log`
* `build.log`
* `e2e.log`
* agent command output

Handling:

* Sensitive artifact.
* May contain secrets, tokens, private URLs, stack traces, or customer data.
* Must be redacted before persistence/report/upload where possible.
* Never uploaded by default.

### Screenshots

Examples:

* browser validation screenshots
* UI diff screenshots
* e2e proof images

Handling:

* Sensitive artifact.
* May contain customer data, internal UI, source snippets, or credentials.
* Stored locally only when selected or captured by allowed integrations.
* Never uploaded by default.

### Raw session events

Examples:

* `raw-events.jsonl`
* tool calls
* command events
* file-change events
* validation events

Handling:

* Sensitive local artifact.
* Store locally only under allowlisted project/session paths.
* Redact before persistence where possible.
* Never uploaded by default.

### Prompts and agent claims

Examples:

* user prompts
* agent summaries
* agent validation claims
* follow-up prompts

Handling:

* Sensitive and untrusted.
* May include secrets, source snippets, product plans, customer names, or private paths.
* Redact before persistence and report rendering where possible.
* Never treat claims as evidence unless supported by logs, commands, diff, policy, or session events.

### Source snippets

Examples:

* selected line snippets in reports
* source context sent for AI Analyze
* files attached to a future cloud artifact

Handling:

* Highest sensitivity short of secrets.
* Never uploaded by default.
* Upload requires explicit opt-in, repo policy approval, and owner/admin permission for cloud/source artifact upload.
* Prefer hashes, paths, and summaries when source content is not necessary.

### Secrets

Examples:

* API keys
* bearer tokens
* private keys
* cloud credentials
* GitHub tokens
* Stripe keys
* Clerk keys
* OpenAI keys
* Anthropic keys

Handling:

* Must not be persisted, reported, commented, uploaded, or sent to AI.
* v0.1 uses basic regex redaction before persistence/report/upload.
* Later versions may add Gitleaks or TruffleHog for deeper scanning.

### `.env` and credential files

Examples:

* `.env`
* `.env.local`
* `.env.production`
* SSH keys
* private key files
* `.aws/credentials`
* `.npmrc`
* `.pypirc`
* `.netrc`

Handling:

* Never read by default.
* `.env` may only be read through advanced explicit opt-in with a clear warning.
* Credential file upload is not allowed by default and should remain blocked unless a future advanced mode explicitly supports a safe, redacted diagnostic path.

## Default data handling

Can be stored locally by default:

* metadata
* report summaries
* report JSON/Markdown
* artifact indexes
* changed-file metadata
* validation metadata
* redacted evidence excerpts
* raw artifacts required for local reports, when captured from allowlisted paths

Never read by default:

* `.env` files
* SSH keys
* private keys
* credential stores
* cloud credential files
* token/config files such as `.npmrc`, `.pypirc`, and `.netrc`
* ignored secret-like paths

Never uploaded by default:

* source files
* source snippets
* diffs
* logs
* screenshots
* raw session events
* prompts
* agent outputs
* credential files
* secrets

Requires explicit opt-in:

* diff upload
* log upload
* screenshot upload
* prompt/agent-output upload
* raw report upload beyond metadata/report-summary sync
* AI Analyze upload of selected artifacts

Requires owner/admin permission plus repo policy approval:

* source artifact upload
* source snippet upload
* full-file upload
* enabling project policy that allows members to request or perform artifact upload
* changing workspace/project upload policy

Metadata-only cloud sync:

* CloudPawl sync defaults to metadata/report summaries only.
* Metadata sync is per-project opt-in.
* Metadata sync must not include raw source, raw diff, raw logs, screenshots, prompts, or secrets.

## Secret redaction plan

v0.1 uses basic regex redaction.

Redaction must happen before:

* local persistence where possible
* report JSON generation
* Markdown report generation
* terminal summaries
* GitHub comments
* GitHub job summaries
* report artifact upload
* CloudPawl metadata/report sync
* explicit artifact upload
* AI Analyze upload

v0.1 redaction should cover:

* bearer tokens
* common API keys
* env-like assignments such as `KEY=value`
* private key blocks
* cloud credentials
* GitHub tokens
* Stripe keys
* Clerk keys
* OpenAI keys
* Anthropic keys
* generic long high-entropy tokens where practical

Examples of values to redact:

```txt
Authorization: Bearer <token>
OPENAI_API_KEY=<token>
ANTHROPIC_API_KEY=<token>
GITHUB_TOKEN=<token>
STRIPE_SECRET_KEY=<token>
CLERK_SECRET_KEY=<token>
AWS_SECRET_ACCESS_KEY=<token>
-----BEGIN PRIVATE KEY-----
```

Replacement style:

```txt
[REDACTED:secret]
[REDACTED:token]
[REDACTED:private-key]
```

Redaction requirements:

* Preserve enough context for the report to remain useful.
* Do not expose the secret value or partial token unless explicitly safe.
* Record that redaction happened when useful for audit/debugging.
* Avoid claiming a report is secret-free; redaction is best effort in v0.1.

Later scanner integrations:

* Evaluate Gitleaks for secret scanning.
* Evaluate TruffleHog for deeper secret detection.
* Add scanner integration only after basic redaction and ignored-path rules work.

Redaction tests are required in v0.1.

## Ignored paths and protected files

Never read by default:

* `.env`
* `.env.*`
* SSH keys
* private keys
* credential stores
* `.aws/credentials`
* `.npmrc`
* `.pypirc`
* `.netrc`
* files matching common secret/key naming patterns

Common secret/key path patterns:

```txt
**/.env
**/.env.*
**/id_rsa
**/id_ed25519
**/*_rsa
**/*_ed25519
**/*.pem
**/*.key
**/.aws/credentials
**/.npmrc
**/.pypirc
**/.netrc
```

Git and project ignore behavior:

* Respect `.gitignore` where appropriate.
* Avoid reading ignored files unless explicitly needed and allowed.
* Support project-level ignore rules in future `codepawl.yml`.
* Project rules should support denylisted paths, secret-like files, and no-source-upload mode.

Advanced `.env` opt-in:

* `.env` may only be read through advanced explicit opt-in.
* The UI/CLI must show a clear warning before enabling this future mode.
* `.env` content must still be redacted before persistence, report, AI Analyze, or upload.

## Local storage security

v0.1 local storage:

* SQLite local DB under `~/.codepawl`.
* Filesystem artifact store under `~/.codepawl/artifacts`.
* Raw large artifacts stay on the filesystem, not directly in SQLite by default.
* SQLite stores metadata, indexes, summaries, hashes, redaction state, and artifact paths.
* Use clear local paths so users can inspect and delete data.
* Use OS file permissions for local protection.
* Local encryption is not required in v0.1.

Recommended local layout:

```txt
~/.codepawl/
  config.toml
  codepawl.db
  artifacts/
  logs/
  cache/
```

File permission guidance:

* Create local data directories with user-only permissions where supported.
* Avoid world-readable local artifact files.
* Avoid storing tokens in plain config when a future keychain/secret-store path exists.

Future local security:

* OS keychain or secret-store integration for tokens.
* Optional local database/artifact encryption.
* Separate storage policy for shared machines.
* User-facing local data export/delete controls.

## Artifact retention

Retention model:

* Metadata and report summaries can be retained longer.
* Raw artifacts should have user-configurable retention.
* Local retention is separate from CloudPawl retention.
* Raw artifact cleanup should not delete minimal metadata needed for report history unless the user requests full deletion.

Recommended v0.1 defaults:

* Keep local metadata/report summaries until user deletes project/session history.
* Keep raw artifacts for a configurable window.
* Offer common cleanup windows such as 30 days and 90 days.
* Allow manual delete for local project/session artifacts.

Raw artifacts include:

* diffs
* logs
* screenshots
* raw session events
* prompts/agent outputs
* selected source snippets

Cloud retention:

* Handled separately from local retention.
* Metadata/report summaries can be retained longer than uploaded artifacts.
* Uploaded artifacts should support limited retention windows such as 30 or 90 days.
* Enterprise/custom retention comes later.

## AI Analyze safety

Input model:

* Treat diffs, logs, prompts, PR text, commit messages, issue text, agent claims, and source snippets as untrusted.
* Treat AI provider output as untrusted advisory text.
* Do not allow prompt content to change CodePawl security policy.

AI Analyze output:

* advisory only
* evidence-bound
* cannot automatically apply code changes
* cannot run commands
* cannot change project, upload, sync, billing, retention, or repo policy
* cannot upload artifacts
* cannot mark a risky/failed report as safe without evidence

Upload consent:

* AI Analyze may upload selected artifacts only after explicit user consent.
* Consent must show which artifact kinds will upload.
* Artifact upload must obey repo policy and workspace permission.
* Source artifact upload requires owner/admin permission.
* No hidden source upload.

AI key modes:

* User-provided API key mode is planned.
* CodePawl-managed API key/credit mode is planned.
* Local deterministic analysis remains useful without either mode.
* User-provided keys should later be stored through OS keychain/secret-store where possible.

Prompt-injection boundary:

* Prompts, logs, diffs, PR text, and agent output must not be trusted instructions for CodePawl itself.
* AI Analyze can recommend next actions, but the user must execute them explicitly.
* AI Analyze cannot override redaction, ignored paths, retention, upload policy, or GitHub permission rules.

## GitHub Action security

Defaults:

* GitHub Action should be read-only by default.
* Use minimal permissions.
* Work without a CloudPawl account or token.
* Keep source in the user's repository/CI environment.
* No source upload by default.

Untrusted PR rules:

* Treat fork PR code, PR title/body, commit messages, branch names, diffs, and comments as untrusted.
* Do not use privileged `pull_request_target` flow for untrusted code.
* Do not comment or write with an elevated token on fork PRs unless the workflow is explicitly safe.
* Prefer job summaries and uploaded artifacts over write actions when token safety is uncertain.
* Do not execute untrusted commands derived from PR text or AI output.

Permissions:

* Default to read-only repository content access.
* Do not request PR/comment write permissions in Action v0.
* Request `pull-requests: write` or `issues: write` later only when GitHub App sticky comments or PR commands exist and are safe.
* Request CloudPawl token only when optional metadata sync is configured.
* Do not require CloudPawl token for report generation, job summary, artifact upload, or local analysis.

Report safety:

* Redact report content before job summary.
* Redact report content before any later sticky PR comment.
* Redact report artifacts before upload.
* Any later sticky PR comment must not leak secrets.
* Do not include raw logs/diffs/source in comments by default.
* If a report links artifacts, ensure the linked artifact has passed redaction and policy checks.

Optional CloudPawl sync:

* Sync only metadata/report summary by default.
* Do not upload source, diffs, logs, screenshots, or raw artifacts from CI unless a future explicit artifact-upload input is added and repo policy allows it.
* Sync failure should not break local report usefulness unless explicitly configured.

## CloudPawl security constraints

CloudPawl is future SaaS infrastructure, not v0.1 implementation scope.

Default cloud model:

* metadata sync by default
* per-project opt-in
* no source upload by default
* explicit artifact upload only
* owner/admin permission for source upload
* repo policy enforcement
* workspace roles enforced

Artifact upload:

* Diff/log upload is explicit opt-in.
* Source snippet/file upload is explicit opt-in and owner/admin-only by default.
* Upload must record artifact kind, hash, size, retention window, redaction state, uploader, workspace, and permission decision.
* Repo policy must support no-source-upload mode.
* Viewer role can never upload artifacts.

Future enterprise/security constraints:

* SSO/SAML later
* audit logs later
* custom retention later
* self-host later
* no-source-upload mode must remain possible
* compliance export later
* RBAC and workspace policy later

Hosted/self-host boundary:

* Avoid hard-coding hosted-only assumptions into local core or GitHub Action.
* Keep Clerk/Stripe assumptions isolated to hosted CloudPawl.
* Preserve a future self-host path where auth, billing, storage, and retention may differ.

## Telemetry policy

v0.1:

* No telemetry by default.
* No product analytics by default.
* No crash/error telemetry by default.
* Never collect source, diff, logs, prompts, reports, artifacts, paths, or environment details without explicit consent.

Future telemetry:

* Anonymous crash/error telemetry may be opt-in later.
* Product analytics may be opt-in later.
* Telemetry must never collect source/diff/log/prompt/artifact content without explicit artifact-level consent.
* Telemetry opt-in must be separate from CloudPawl metadata sync and AI Analyze upload.

## Security test plan

v0.1 required checks:

* Redaction unit tests for common API keys, bearer tokens, env-like values, private key blocks, cloud credentials, GitHub tokens, Stripe keys, Clerk keys, OpenAI keys, and Anthropic keys.
* Ignored path tests for `.env`, `.env.*`, SSH/private keys, credential stores, `.aws/credentials`, `.npmrc`, `.pypirc`, `.netrc`, and secret-like paths.
* No artifact upload by default test.
* Report/comment redaction test.
* GitHub token permission checklist.
* Unsafe PR workflow checklist.

Checklist: GitHub token permissions:

* default workflow permissions are read-only
* Action v0 does not request comment/write permissions
* later comment or PR command permissions are requested only when that mode exists and is safe
* CloudPawl token is optional
* fork PRs do not receive unsafe write behavior
* no privileged token is exposed to untrusted PR code

Checklist: unsafe PR workflows:

* no privileged `pull_request_target` for untrusted code
* no command execution from PR text or AI output
* no raw secret-bearing logs in comments
* no source/diff/log upload by default
* report artifacts are redacted before upload

## Done-when criteria for v0.1 security

v0.1 security planning is ready when:

* Security/privacy plan exists.
* No telemetry by default is specified.
* No source upload by default is specified.
* Metadata-only cloud sync by default is specified.
* Upload boundaries are specified.
* `.env` and credential-file handling is specified.
* Basic redaction rules are specified.
* Later Gitleaks/TruffleHog scanner integration is documented as future work.
* Ignored paths are specified.
* Local storage security and retention are specified.
* GitHub Action safety rules for untrusted PRs are specified.
* AI Analyze untrusted-input and advisory-only boundaries are specified.
* v0.1 security tests are listed.
