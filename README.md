![Orynt](assets/brand/codepawl-orynt/orynt/orynt-banner.png)

# Orynt

**An agent that just works.**

Orynt reads your code, makes a plan, does the work, and checks the result.
You stay in control.

Orynt is a CodePawl product.

## What it can do

- Explain a codebase
- Make focused code changes
- Run tests and check its own work
- Use a browser when you turn browser access on

Orynt does not get full access to your machine. It asks before risky work.

## Try it

The first public package is not out yet. You can run Orynt from source.

```bash
git clone https://github.com/codepawl/orynt.git
cd orynt
corepack enable
bun install --frozen-lockfile
bun cli --repo /path/to/your/project
```

You need Bun 1.3.14 or newer and a signed in Codex CLI.

Then ask for something simple.

```text
Explain this project.
Fix the failing parser test.
Check if this repo is ready to go public.
```

## Safe by default

Normal chat is read only. Code changes run in a separate worktree. Orynt checks
the result before it says the work is done.

Browser access is off until you start or attach a local browser session. Orynt
can only use the sites you allow.

Never put secrets or private code in a public issue.

## Read more

- [Getting started](docs/getting-started.md)
- [How Orynt works](docs/architecture.md)
- [Permissions](docs/permissions.md)
- [Testing](docs/tests.md)
- [Security](SECURITY.md)
- [Contributing](CONTRIBUTING.md)

## Status

Orynt `0.1.x` is a public beta. Things may change while the project is young.
General desktop control and background work are not supported.

## License

Orynt uses the [Apache License 2.0](LICENSE).

See [third party notices](THIRD_PARTY_NOTICES.md) and
[asset sources](assets/PROVENANCE.md).
