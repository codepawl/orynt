# Contributing

Thanks for helping Orynt.

Small fixes, tests, and docs are welcome.

## Before you start

- Search open issues and pull requests.
- Open an issue before a large change.
- Keep one pull request focused on one result.
- Never post secrets, private code, cookies, or private logs.
- Report security problems through [private reporting](SECURITY.md).

Small docs and test fixes can go straight to a pull request.

## Set up the repo

```bash
git clone https://github.com/codepawl/orynt.git
cd orynt
corepack enable
bun install --frozen-lockfile
```

## Where code belongs

The CLI is the main product.

Shared behavior belongs in `packages/*`. Keep `packages/cli` small. It should
connect the terminal to shared code.

`apps/desktop` is kept for compatibility. Do not add new product features
there.

Do not make approval, file access, browser access, secret handling, or result
checks weaker.

Explain why a new package is needed before adding it.

## Run checks

Start with the check closest to your change.

```bash
bun test:cli
bun build:cli
bun test:contracts
bun test:core
bun test:capabilities
bun test:eval
```

Use `bun check:desktop` only when you change desktop compatibility code.

There is no root lint command.

## Open a pull request

Tell us:

- What changed
- Why it changed
- What you did not change
- Which commands you ran
- Whether permissions or outside access changed

Add a test when behavior changes.

Do not include release files, local state, secrets, or private user data.

All contributions use the same Apache 2.0 license as Orynt. There is no CLA or
DCO right now.
