# Openpawl v0.5.0

Openpawl is the server-side coding-agent workflow in the CodePawl monorepo.

## Features & Configuration

### Gitignore-aware Repository Scanning
Openpawl reads local `.gitignore` files to filter out unwanted files and folders automatically during repository scans.

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

The GitHub Actions workflow invokes `@codepawl/cli` directly with `bun --filter @codepawl/cli dev -- ...` so trigger and run arguments bypass the root Turbo script.

Current workflow command forms:

- `bun --filter @codepawl/cli dev -- openpawl-trigger ...`
- `bun --filter @codepawl/cli dev -- run ...`

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

These JSON artifacts are schema-backed in `@codepawl/core`. `report.md` intentionally remains a human-readable Markdown report for GitHub comments and does not carry machine-readable front matter.

`report.md` starts with a compact Evidence Summary derived from the JSON artifact evidence already produced by the run: run ID, mode, status, readiness, validation state, provider-call count, selected/planned/applied file counts, normalized presentation-only failure category, and artifact paths. Failure reports include a short Failure Summary before the detailed report sections. GitHub issue/PR comments also include Actions run context, the uploaded artifact name, and report/trace paths when available.

When run from GitHub Actions, the Evidence Summary includes the Actions run URL, uploaded artifact name, artifact directory, report path, and trace path so workflow-dispatch artifacts carry the same evidence context even when no issue or PR comment is posted.

## Install

See [docs/OPENPAWL_INSTALL.md](docs/OPENPAWL_INSTALL.md) for the copy/paste setup, permissions, artifacts, reports, and security notes.
