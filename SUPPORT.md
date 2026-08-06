# Support

Orynt `0.1.x` is a public beta.

## Something broke

Run:

```bash
orynt doctor --verbose
```

For a structured report, run `orynt doctor --json`. Remove private paths and
other identifying details from either output before opening a bug report.

For quota or account-usage problems, run:

```bash
orynt usage
orynt usage --json
```

Usage output excludes account email, authentication tokens, credentials, and
opaque account identifiers. It can still contain plan, quota, credit balance,
reset times, and aggregate token history. Review those values before sharing a
JSON report publicly.

The report already includes:

- Your Orynt version
- Your operating system
- Your Node.js version
- Your Codex CLI version
- Repository, state, authentication, app-server, and configured model-tier
  readiness

Also include:

- The command that failed
- What you expected
- What happened

Do not post secrets, cookies, private code, browser screenshots, full model
replies, or your local state folder.

## You have an idea

Open a feature request.

Tell us what you are trying to do, what gets in the way, and what should need
approval.

A feature request is not a promise that the feature will ship.

## You found a security problem

Do not open a public issue. Follow [SECURITY.md](SECURITY.md).

## What support does not include

The public beta has no service promise. Orynt does not recover accounts or
credentials. Orynt does not promise that every task will finish.

`orynt doctor --live --confirm-live` makes real model calls. Use it only when
you need to test live model access.
