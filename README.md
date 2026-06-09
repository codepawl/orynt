# Openpawl v0.1.0-alpha.10

Openpawl is the server-side coding-agent workflow in the CodePawl monorepo.

## Trigger UX

Exact commands only:

- `/openpawl review`
- `/openpawl add tests`
- `@openpawl review`
- `@openpawl plan`
- `@openpawl add tests`
- `@openpawl fix failing tests`

Slash commands keep the existing behavior. Mention commands are dry-run only and are intended for maintainer-triggered issue/PR comments.

Write mode remains gated behind `workflow_dispatch` plus repo config / approval flow.

The GitHub Actions workflow invokes `@codepawl/cli` directly with `bun --filter @codepawl/cli dev -- ...` so trigger and run arguments bypass the root Turbo script.

## Install

See [docs/OPENPAWL_INSTALL.md](docs/OPENPAWL_INSTALL.md) for the copy/paste setup, permissions, artifacts, reports, and security notes.
