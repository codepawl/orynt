# CodePawl Onboarding Documentation Plan

## Purpose

This plan defines the first user-facing documentation set for CodePawl: README, quickstart, fixture-backed example reports, privacy notes, troubleshooting, GitHub Action placeholder docs, and early landing copy.

The goal is to help a new developer understand CodePawl in 30 seconds and reach a useful local report in under 5 minutes, without requiring CloudPawl, GitHub, a hosted account, telemetry, or source upload.

Reference planning docs:

- `.codex/plan/master_plan.md`
- `.codex/plan/business_plan.md`
- `.codex/plan/design_plan.md`
- `.codex/plan/technical_plan.md`
- `.codex/plan/execution_plan.md`
- `.codex/plan/security_privacy_plan.md`
- `.codex/plan/github_integration_plan.md`
- `.codex/plan/launch_beta_plan.md`

## 1. Documentation Principles

- Get users to their first useful report quickly. The first successful experience should be: run CodePawl on a fixture, inspect a report, then run it on a real repo.
- Explain local-first behavior early. Users should know before running anything that CodePawl works locally, has no telemetry by default, and does not upload source by default.
- Avoid generic devtool README bloat. Do not lead with exhaustive architecture, long feature matrices, or abstract platform language.
- Prioritize sample report over abstract architecture. Show what CodePawl produces: verdict, evidence, risks, and next action.
- Separate human docs from agent planning docs. Public docs should link to `.codex/plan/` when useful, but should not expose internal planning structure as the main onboarding path.
- Keep product-led but technically precise. Copy should be short, concrete, and evidence-oriented.
- Do not claim unimplemented features are available. GitHub Action, Studio, cloud sync, AI Analyze upload, desktop, and GitHub App must be clearly marked planned unless implemented.

## 2. README Structure

The README should be the primary onboarding surface and should follow this order:

1. Tagline
   - `Turn every AI coding session into measurable engineering work.`

2. One-sentence product explanation
   - CodePawl is a local-first session intelligence tool for AI coding agents that analyzes what changed, verifies evidence, identifies risks, and recommends the next action.

3. Problem statement
   - AI coding sessions often leave behind scattered diffs, logs, claims, and summaries.
   - CodePawl turns that scattered output into a reviewable engineering report.

4. Quick demo
   - Lead with the fixture command.
   - Show the shape of the result, not a fake dashboard.
   - Keep this short enough that users can copy the first command immediately.

5. Quickstart
   - About 5 commands.
   - Fixture analysis first, real repo analysis second.

6. Example report
   - Include or link to a fixture-backed report.
   - Show verdict, evidence, risks, and next action.

7. Privacy and local-first note
   - Short, visible, and placed before any cloud, upload, sync, or GitHub language.

8. Current status
   - State what is currently available.
   - Clearly label planned surfaces and versions.

9. Roadmap links
   - Link to relevant planning files under `.codex/plan/`.
   - Prefer a compact list over duplicating the plans.

10. Contributing and development later
   - Keep this below first-use docs.
   - Do not let development setup bury the first report flow.

## 3. First CTA Flow

The README first CTA should lead with sample/fixture analysis, then real repo analysis.

Primary path:

1. Install or build CodePawl locally.
2. Run fixture analysis:

   ```bash
   codepawl analyze --fixture fixtures/sessions/basic
   ```

3. Inspect the generated report:

   ```bash
   codepawl report --last
   ```

4. Add or detect the current repo:

   ```bash
   codepawl projects add .
   ```

5. Run analysis on the current repo:

   ```bash
   codepawl analyze
   ```

6. Open the latest report again:

   ```bash
   codepawl report --last
   ```

README CTA wording should emphasize:

- Start with a known-good fixture so users see the product value immediately.
- Then run against a real repository when they are ready.
- No cloud account is required.
- No source upload happens by default.

## 4. Quickstart

The README quickstart should stay close to 5 commands. Use this command sequence unless implementation details require a small correction:

```bash
cargo run -p codepawl-cli -- analyze --fixture fixtures/sessions/basic
cargo run -p codepawl-cli -- report --last
cargo run -p codepawl-cli -- projects add .
cargo run -p codepawl-cli -- analyze
```

Use `cargo install --path crates/codepawl-cli` only after the CLI crate exists and local install behavior is verified.

Do not present a workspace-root `cargo install` as the default quickstart unless the workspace root actually installs the CLI binary.

Quickstart guidance:

- Keep command explanations to one short sentence each.
- Do not require Studio, GitHub, CloudPawl, a token, or account creation.
- Do not introduce advanced configuration before the first report.
- If `codepawl report --last` can open or print the latest report, describe the actual behavior precisely.
- If install is not yet stable, label commands as local development commands rather than published release install commands.

Future installed-CLI quickstart after crate/package shape is stable:

```bash
codepawl analyze --fixture fixtures/sessions/basic
codepawl report --last
codepawl projects add .
codepawl analyze
```

## 5. Example Reports

Example reports are required because the report is CodePawl's first value surface.

Initial examples:

- Verified report
  - Fixture-backed.
  - Shows changed files, validation evidence, no blocking risk, and a concrete next action.

- Needs-evidence report
  - Fixture-backed.
  - Shows missing validation evidence and the next command or proof needed.

- Risky or blocked report later
  - Fixture-backed when the related fixture exists.
  - Shows evidence-bound risks and a next action such as split, rerun, revert, or review a protected path.

Every example report must show:

- Verdict.
- What changed.
- Evidence found.
- Missing evidence or risks.
- Diagnosis.
- Next action.

Example report rules:

- Use reports generated from fixtures, not fake dashboard numbers.
- Do not invent agent performance metrics that are not produced by CodePawl.
- Do not use screenshots of unimplemented Studio dashboards as proof.
- Prefer stable Markdown and JSON artifacts that can become snapshot-backed examples later.

## 6. Privacy Documentation

Privacy must be visible before any upload, sync, cloud, GitHub, or AI Analyze language.

README short section must say:

- CodePawl is local-first.
- No telemetry by default.
- No source upload by default.
- CloudPawl sync is planned as optional metadata/report-summary sync only.
- Diff, log, prompt, screenshot, raw artifact, or source upload requires explicit consent and future policy support.

Dedicated future doc:

- Path: `docs/privacy.md`

`docs/privacy.md` should cover:

- Data classification.
- Artifact handling.
- Retention.
- AI Analyze upload policy.
- GitHub Action safety.
- Redaction expectations.
- What is never read by default, including `.env`, SSH keys, private keys, credential stores, and ignored secret-like paths.
- What is never uploaded by default, including source, diffs, logs, screenshots, raw session events, prompts, agent output, credential files, and secrets.

Privacy language should align with `.codex/plan/security_privacy_plan.md` and must not imply hidden telemetry, hidden sync, or hidden source upload.

## 7. Troubleshooting

Initial troubleshooting docs should focus on first-run and report-generation failures.

Topics to cover:

- Not inside a git repo
  - Explain that real repo analysis needs git context.
  - Point users to fixture analysis if they only want to see a sample report.

- No changed files or no diff found
  - Explain what CodePawl can and cannot infer without changes.
  - Tell users whether the report should still be generated with a low-signal verdict.

- Missing validation logs
  - Explain how missing tests, build logs, or command evidence affect the verdict.
  - Recommend the next validation command when available.

- Report cannot be written
  - Cover output directory existence, permissions, and path conflicts.

- SQLite permission issue
  - Cover local data directory permissions and how to inspect the configured data path.

- Fixture path not found
  - Confirm the expected fixture path: `fixtures/sessions/basic`.
  - Explain that commands should be run from the repository root during local development.

- Local config missing
  - Explain defaults.
  - Do not require config for the first report unless the implementation changes.

- Ignored or protected path confusion
  - Explain that ignored/protected path behavior follows local policy/config when present.
  - Keep source and secret paths protected by default.

Troubleshooting should stay practical: symptom, likely cause, command to try, and what the resulting report should show.

## 8. GitHub Action Docs Placeholder

GitHub Action documentation should exist as a clearly marked v0.3 placeholder before implementation.

Placeholder requirements:

- Mark the section as `Coming in v0.3` or `Planned for v0.3`.
- Explain intended use:
  - Run CodePawl in CI.
  - Generate a PR-ready report.
  - Write a job summary.
  - Upload redacted report artifacts.
  - Work without a CloudPawl account or token.
  - Fail according to a configured verdict threshold.

- State safety defaults:
  - No source upload by default.
  - No raw diffs, logs, prompts, screenshots, or raw artifacts uploaded by default.
  - CloudPawl token is optional and metadata/report-summary only when supported.
  - Fork PRs require conservative read-only handling.

- A future workflow skeleton may be shown only if clearly labeled planned. It must not be presented as working setup before implementation.

Do not include live install instructions, Marketplace links, required tokens, or copy that implies the GitHub Action is already available unless the implementation exists.

Sticky PR comments and PR commands belong to the later GitHub App/team workflow docs unless the roadmap is explicitly changed.

## 9. Landing Copy

Landing copy should be short, product-led, and privacy-aware.

Headline:

```txt
Turn every AI coding session into measurable engineering work.
```

Subheadline:

```txt
CodePawl analyzes what your coding agents changed, verifies the evidence,
diagnoses drift or failure, and tells you what to do next.
```

Three value bullets:

- See what changed, what evidence exists, and what validation is missing.
- Diagnose drift, risky paths, failed checks, and unsupported agent claims.
- Generate a local report with verdict, risks, and the next action.

Privacy promise:

```txt
Local-first by default. No telemetry and no source upload unless you explicitly opt in.
```

Primary CTA:

```txt
Run a sample analysis
```

CTA target:

```bash
codepawl analyze --fixture fixtures/sessions/basic
```

Secondary CTA:

```txt
Analyze this repo locally
```

CTA target:

```bash
codepawl analyze
```

Landing copy should not lead with CloudPawl, Studio, GitHub App, or team analytics until those surfaces exist.

## 10. Docs Quality Checklist

Before publishing or updating onboarding docs, verify:

- A user can understand what CodePawl does in 30 seconds.
- A user can run fixture analysis in under 5 minutes.
- A user can see a useful report without cloud.
- The privacy promise is visible before any upload, sync, cloud, or GitHub language.
- The README does not overpromise GitHub, cloud, desktop, Studio, AI Analyze upload, or team features.
- Example reports are fixture-backed.
- Reports show verdict, evidence, risks, and next action.
- GitHub Action docs are clearly marked planned for v0.3 until implemented.
- Docs link to relevant planning files under `.codex/plan/`.
- Human docs do not duplicate internal planning docs.
- The README first CTA uses fixture analysis before real repo analysis.

## 11. Future Docs

Plan these docs after the initial README and example report path are useful:

- `docs/privacy.md`
  - Local-first model, data classification, upload policy, retention, redaction, AI Analyze, GitHub Action safety.

- `docs/configuration.md`
  - `codepawl.yml`, local data paths, protected paths, ignored paths, validation command hints, report output settings.

- `docs/github-action.md`
  - v0.3 setup after implementation, inputs, outputs, permissions, fork PR safety, artifact handling, and fail-on behavior.

- `docs/reports.md`
  - Report fields, verdicts, evidence references, risks, next actions, Markdown/JSON outputs, example reports.

- `docs/session-intelligence.md`
  - How CodePawl interprets sessions, agent claims, validation evidence, drift, risks, and memory candidates.

- `docs/development.md`
  - Local development setup, test commands, fixtures, snapshots, release checks, contribution workflow.

- `docs/troubleshooting.md`
  - Expanded symptom-based troubleshooting for CLI, fixtures, reports, SQLite, configuration, git state, and future GitHub Action behavior.
