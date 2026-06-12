# CodePawl

CodePawl makes coding agents work together. It is infrastructure for
coordinated agent work - plans, evidence, guardrails, memory, replay, and cloud
workflows.

Openpawl is an open runtime for coding-agent coordination. It turns agent tasks
into plans, validations, guarded changes, and traceable run evidence. The first
supported surface is GitHub Actions.

Openpawl source now lives in the public Action repository at
`https://github.com/codepawl/openpawl`. Private duplicate packages in this repo
are frozen compatibility copies; runtime changes belong in
`codepawl/openpawl` and should be consumed here through public Action releases.

## Features & Configuration

### Gitignore-aware Repository Scanning
Openpawl helps coding agents plan, review, validate, hand off work, and leave
evidence that humans and other agents can trust. It reads local `.gitignore`
files to filter out unwanted files and folders automatically during repository
scans.

### Validation Retry-loop
If validation checks fail, Openpawl can optionally clean up temporary file state and attempt a planning retry. Enable this behavior with:
- `--validation-max-retries <N>` CLI argument
- `"validation": { "maxRetries": <N> }` configuration in `openpawl.config.json`

## Trigger UX

Exact commands only:

- `/openpawl review`
- `/openpawl plan`
- `/openpawl add tests`
- `/openpawl fix failing tests`
- `/openpawl apply`
- `@openpawl review`
- `@openpawl plan`
- `@openpawl add tests`
- `@openpawl fix failing tests`

Slash review/test commands keep the existing dry-run behavior. Mention commands are dry-run only and are intended for maintainer-triggered issue/PR comments.

Write mode remains gated behind `workflow_dispatch` plus repo config, or maintainer approval through `/openpawl apply` or the `openpawl-approved` label. Approved writes create a bot branch and PR instead of mutating an existing PR branch.

The GitHub Actions workflow checks out `codepawl/openpawl@v0.5.3` into
`.openpawl-src` and invokes that public release's `@codepawl/cli` directly so
trigger and run arguments bypass the private root Turbo script.

Current workflow command forms:

- `bun --cwd .openpawl-src --filter @codepawl/cli dev -- openpawl-trigger ...`
- `bun --cwd .openpawl-src --filter @codepawl/cli dev -- run ...`

Patch quality harness:

- `bun --filter @codepawl/cli dev -- eval patch-quality`

## Artifact Contract

Openpawl writes machine-readable JSON artifacts with `schemaVersion: "1"`:

- `run.json`
- `trace.json`
- `patch-plan.json`
- `selected-files.json`
- `applied-files.json`
- patch-quality `metrics.json`
- `openpawl-evidence-bundle.json` in Openpawl `v0.5.3+` GitHub Action runs

These JSON artifacts are schema-backed in the public `codepawl/openpawl`
runtime. `report.md` intentionally remains a human-readable Markdown report for
GitHub comments and does not carry machine-readable front matter.

`openpawl-evidence-bundle.json` wraps the schema v1 artifact set for local
browser preview at `https://codepawl.com/cloud/evidence`. CodePawl Cloud
Evidence Hub remains local-preview/demo only; artifact contents are not uploaded
or stored by CodePawl during that browser preview.

`report.md` starts with a compact Evidence Summary derived from the JSON artifact evidence already produced by the run: run ID, mode, status, readiness, validation state, provider-call count, selected/planned/applied file counts, normalized presentation-only failure category, and artifact paths. Failure reports include a short Failure Summary before the detailed report sections. GitHub issue/PR comments also include Actions run context, the uploaded artifact name, and report/trace paths when available.

When run from GitHub Actions, the Evidence Summary includes the Actions run URL, uploaded artifact name, artifact directory, report path, and trace path so workflow-dispatch artifacts carry the same evidence context even when no issue or PR comment is posted.

## Install

See [docs/OPENPAWL_INSTALL.md](docs/OPENPAWL_INSTALL.md) for the pinned
`codepawl/openpawl@v0.5.3` install path, permissions, artifacts, reports, and
security notes.

## Marketplace Status

Openpawl is a GitHub Marketplace Action candidate in `codepawl/openpawl`.
This website keeps Marketplace-critical support, install, docs, status,
security, privacy, and terms URLs stable for submission. The public Action
release `v0.5.3` is verified; do not treat the GitHub Marketplace listing as
live until its listing URL has been verified.
