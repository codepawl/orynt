# Openpawl v0.3.0

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

## Install

See [docs/OPENPAWL_INSTALL.md](docs/OPENPAWL_INSTALL.md) for the copy/paste setup, permissions, artifacts, reports, and security notes.
