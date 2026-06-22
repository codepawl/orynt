# CodePawl GitHub Integration Plan

## GitHub integration principles

CodePawl turns every AI coding session into measurable engineering work. GitHub integration should put that session intelligence where engineers already review changes, without turning CodePawl into a generic AI PR reviewer.

Principles:

* GitHub-native surface. Action v0 reports should appear in job summaries and artifacts; PR comments come later with the GitHub App/team workflow.
* Session intelligence, not generic review. Focus on verdict, validation evidence, missing evidence, drift signals, risks, next actions, and follow-up prompts.
* Action first, App later. GitHub Action v0 ships before the GitHub App.
* Safe by default. GitHub integration must inherit the security rules in `.codex/plan/security_privacy_plan.md`.
* CloudPawl optional. GitHub Action must work without a CloudPawl account or token.
* No source upload by default. Source, raw diffs, raw logs, prompts, and raw artifacts stay in CI unless explicitly allowed by a future policy.
* Factual report tone. GitHub output should read like an engineering report, not a friendly assistant or marketing surface.

## GitHub Action v0

Goal: generate PR-ready CodePawl reports in CI without requiring CloudPawl, GitHub App, auth, billing, or hosted sync.

Primary behavior:

```txt
GitHub workflow
-> checkout repo
-> run validation steps chosen by the repository workflow
-> run CodePawl analysis
-> write GitHub job summary
-> upload redacted report artifacts
-> optionally fail the check according to verdict
-> optionally sync metadata to CloudPawl when a token is provided
```

Triggers to support:

* `pull_request` for normal PR analysis.
* `workflow_dispatch` for manual reruns.
* `push` may be supported for branch/report artifacts without PR write behavior.

Example input contract:

```yaml
with:
  config: codepawl.yml
  fail-on: blocked
  sync-token: ${{ secrets.CODEPAWL_TOKEN }}
```

Inputs:

* `config`: path to CodePawl config. Default: `codepawl.yml`.
* `fail-on`: verdict threshold. Default: `blocked`.
* `sync-token`: optional CloudPawl token. Default: unset.

Fail-on behavior:

* Verdict severity order is `verified` < `needs_evidence` < `risky` < `failed` < `blocked`.
* `fail-on: blocked` fails only `blocked`.
* `fail-on: failed` fails `failed` and `blocked`.
* `fail-on: risky` fails `risky`, `failed`, and `blocked`.
* `fail-on: needs_evidence` fails every non-verified report.
* `verified` is a verdict, not a useful fail threshold.

Outputs:

* `verdict`: final CodePawl verdict.
* `report-json`: path to `codepawl-report.json`.
* `report-markdown`: path to `codepawl-report.md`.
* `summary-written`: whether `$GITHUB_STEP_SUMMARY` was written.
* `metadata-synced`: whether optional CloudPawl metadata sync succeeded.

Optional CloudPawl sync:

* `sync-token` is never required for local/CI report generation.
* When provided, it syncs metadata/report summaries only: verdict, summary, evidence status, risk count, timestamps, repository identity, branch, PR number, and artifact hashes/links.
* It must not upload raw source, raw diffs, raw logs, screenshots, prompts, raw session events, or secrets.
* Sync failure must not make the local CI report unusable.

## PR command model later

PR commands are planned for the later GitHub App/team workflow layer, not Action v0.

Event model:

* Use `issue_comment` or GitHub App webhook handling when the App exists.
* Only handle comments where `github.event.issue.pull_request` exists.
* Ignore normal issues.
* Parse commands from the comment body using fixed allowlisted strings.
* Never interpret PR text, comments, prompts, or AI output as shell commands.

Initial command allowlist:

```txt
@codepawl analyze
@codepawl full analyze
@codepawl verify evidence
@codepawl next prompt
@codepawl help
```

Initial command behavior:

* `@codepawl analyze`: run normal configured analysis.
* `@codepawl full analyze`: run the most complete safe analysis available in CI.
* `@codepawl verify evidence`: re-check evidence and missing validation signals.
* `@codepawl next prompt`: render the recommended follow-up prompt from the report.
* `@codepawl help`: show supported commands and safety limits.

Later commands:

```txt
@codepawl explain drift
@codepawl save memory
@codepawl pause
@codepawl resume
@codepawl ignore
```

Safety checks:

* Commands run only for PR comments.
* Fork PRs are read-only/safe by default.
* Do not expose secrets or CloudPawl tokens to unsafe fork PR contexts.
* Do not use privileged `pull_request_target` for untrusted code.
* Do not comment or write with an elevated token on fork PRs unless a future workflow is explicitly proven safe.
* Prefer job summaries and artifacts over write actions when token safety is uncertain.

## Sticky PR comment design later

Sticky comments are useful but belong to the later GitHub App/team workflow layer. Action v0 should produce job summaries and redacted artifacts without writing PR comments.

Defaults:

* No sticky PR comment in Action v0.
* A later GitHub App may create one PR comment when permissions and fork policy allow it.
* Comment behavior is disabled/safe for unsafe fork PRs.

Marker:

```md
<!-- codepawl-report -->
```

Update behavior:

* Search for an existing bot-authored comment containing the marker.
* Update the existing CodePawl comment when found.
* Create a new comment only when no marker exists and GitHub App comment mode is enabled.
* Do not post duplicate CodePawl comments.
* Do not spam line-by-line comments.

Comment structure:

```md
<!-- codepawl-report -->

## CodePawl Session Report

**Verdict:** Needs evidence
**Reason:** UI changes detected without e2e or screenshot evidence.

### What changed
- changed files summary
- expected vs suspicious scope summary

### Evidence
- validation checks found
- missing evidence
- evidence references

### Risks
- evidence-bound risks only

### Next action
- concrete command, review decision, or follow-up prompt
```

Redaction requirements:

* Redact before rendering comments.
* Do not include raw source, raw diffs, raw logs, prompts, raw session events, or secrets by default.
* If a report links artifacts, linked artifacts must be redacted and policy-allowed.

## Report artifacts

GitHub Action v0 artifacts:

* `codepawl-report.md`
* `codepawl-report.json`
* redacted logs summary

Artifact rules:

* Artifacts must be redacted before upload.
* Markdown and JSON reports should remain stable enough for humans and automation.
* Raw diff, raw logs, raw screenshots, raw session events, prompts, and source files are not uploaded by default.
* Future raw artifact upload requires explicit opt-in, repo policy approval, and the upload boundaries from `.codex/plan/security_privacy_plan.md`.

## Permissions and security

Minimum default permission:

```yaml
permissions:
  contents: read
```

Optional permissions:

* `pull-requests: write` or `issues: write` later only when sticky comment or PR command behavior exists and is safe.
* `actions: read` later only if CodePawl needs to read workflow runs or artifacts.

Fork PR policy:

* Treat fork PR code, PR title/body, commit messages, branch names, diffs, and comments as untrusted.
* Analyze in read-only mode by default.
* Do not expose write tokens, CloudPawl tokens, or other secrets to unsafe fork PR execution.
* Do not use privileged `pull_request_target` for untrusted code.
* Do not upload source, raw diff, raw logs, or raw artifacts by default.
* Prefer job summary and redacted artifacts over comments when write safety is uncertain.

Security alignment:

* Follow `.codex/plan/security_privacy_plan.md` for redaction, ignored paths, untrusted input, AI safety, and upload boundaries.
* Redact before job summary, future sticky comment, report artifacts, optional metadata sync, or any future artifact upload.
* GitHub report output must not leak secrets.
* CloudPawl token is optional and metadata-only.
* GitHub Action must remain useful when no CloudPawl token is configured.

## GitHub App later

The GitHub App is a later CloudPawl/team workflow layer. It must not block GitHub Action v0 or local-first CodePawl.

Build order:

1. Sticky comment.
2. Rich Check Runs.
3. PR commands.
4. Workspace/org installation mapping.

GitHub App capabilities later:

* Install flow for personal accounts, organizations, and selected repositories.
* Explicit installation mapping to personal workspace or team/org workspace.
* Sticky PR report comments.
* Rich Check Runs with verdict, evidence, risks, missing validation, and next actions.
* PR command handling.
* Sticky PR report comments.
* CloudPawl metadata/report-summary sync.
* Team/org dashboard integration.

Constraints:

* GitHub App must respect GitHub permissions, workspace roles, repo policy, artifact-upload policy, entitlements, and retention policy.
* CloudPawl must not assume a GitHub organization equals a CloudPawl workspace; mapping is explicit.
* GitHub App should not clone or upload source to CloudPawl by default.
* Source artifact upload, if supported later, requires owner/admin permission plus repo policy approval.

## GitHub report tone and content

Tone:

* factual
* concise
* evidence-first
* engineering report style
* not friendly assistant
* not marketing

Required report content:

* verdict
* reason
* changed files summary
* validation evidence
* missing evidence
* risks
* drift signals when detected
* next actions
* follow-up prompt
* evidence references

Content rules:

* Every important claim cites evidence.
* Risks must cite evidence references.
* Missing evidence should be explicit and actionable.
* Next actions should be concrete commands, review decisions, rerun guidance, or follow-up prompts.
* Do not include generic style review unless it is tied to session evidence or repo policy.

## Done-when criteria

GitHub Action v0 plan is complete when:

* Job summary, report artifacts, fail-on behavior, and optional CloudPawl sync are specified.
* Action works without a CloudPawl account or token.
* CloudPawl token behavior is metadata-only.
* `fail-on` maps to CodePawl verdicts.
* Fork PR safety behavior is clear.
* Report artifacts exclude raw diff/log/source by default.
* Required permissions are minimal.
* GitHub App with sticky comments, Check Runs, and PR commands is clearly later.
* Report tone is factual, concise, and evidence-first.
* No workflow files, Action code, GitHub App code, secrets, migrations, production config, or cloud implementation are added.
