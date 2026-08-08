# Getting started

This guide shows how to run Orynt from source.

## What you need

- Bun 1.3.14 or newer
- Corepack
- A signed in Codex CLI

Orynt uses Codex for model access by default, and supports the Anthropic API and
OpenCode as opt-in providers. Orynt does not read or save your Codex passwords
or tokens, and it does not read or save an API key: it reads the value of an
environment variable you set and stores only that variable's name.

## Use a different provider

Each provider reads its own environment variable. Set the variable in your
shell, then run its setup command, which checks the credential and points the
model tiers at that provider.

To use Anthropic:

```bash
export ANTHROPIC_API_KEY="<your key>"
bun cli setup --provider anthropic
```

Anthropic also accepts a short-lived OAuth token in `ANTHROPIC_AUTH_TOKEN`
instead. That token comes from Anthropic's own CLI, which is
[`anthropic-cli`](https://github.com/anthropics/anthropic-cli) and is installed
as `ant`. It is not the Apache Ant build tool of the same name. Do not set both
variables: the API rejects a request carrying both.

To use OpenCode:

```bash
export OPENCODE_API_KEY="<your key>"
bun cli setup --provider opencode
```

Sign in and copy an OpenCode key at https://opencode.ai/auth. OpenCode is a
gateway serving many models under one plan, so Orynt reports no per-token cost
for it, the way it reports none for a Codex subscription. OpenCode also does not
report prompt-cache counts, so cache figures read as zero for that provider.

Add `--check` to any of these to verify the credential without changing your
configuration.

## Install

```bash
git clone https://github.com/codepawl/orynt.git
cd orynt
corepack enable
bun install --frozen-lockfile
```

Check your setup.

```bash
bun cli setup --check
bun cli doctor
```

Doctor checks the Node runtime, terminal, Git repository and worktree support,
local state, Codex installation and authentication, and every configured model
tier. Warnings include recovery guidance but do not fail the command. A required
failure exits with status 1.

Use a full human report or machine-readable output when troubleshooting.

```bash
bun cli doctor --verbose
bun cli doctor --json
```

Doctor does not make model calls unless you explicitly confirm the live probe.

```bash
bun cli doctor --live --confirm-live
```

Check the signed-in provider's current quota without making a model call.

```bash
bun cli usage
bun cli usage --verbose
bun cli usage --json
```

Inside an interactive session, `/usage` shows the same normalized quota view
and `/usage verbose` adds lifetime statistics. `/status` keeps the current
session and runtime overview, plus a freshly read compact usage summary.
`/cost` is different: it reports only the estimated cost of the last Orynt
repository run.

Codex is the first provider supported by this command. Orynt reads Codex's
account and rate-limit app-server APIs and does not parse the Codex terminal
screen. Human output shows every available quota meter and reset window. JSON
also includes daily usage buckets when Codex provides them.

Start Orynt in a project.

```bash
bun cli --repo /path/to/your/project
```

## Find help inside Orynt

Use interactive help without leaving the current session.

```text
/help
/help shortcuts
/help getting-started
```

`/help` and `/help commands` show every available slash command.
`/help shortcuts` shows the active composer bindings together with navigation,
clipboard, queue, cancellation, and pending-message keys.
`/help getting-started` explains how to ask questions, request changes, guide
active work, inspect results, and manage the session.

Run `orynt --help` outside the interactive session when you need launch flags
or external subcommands.

## Ask a question

Questions are read only.

```text
What does this project do?
Where is login handled?
Why is this test failing?
```

## Ask for a change

Be clear about the result you want.

```text
Fix the failing parser test. Do not change the public API.
```

Orynt may ask a question before it starts. It then shows the work that needs
approval. One writer makes the change in a separate worktree. A different step
checks the result.

After a repository run, Orynt shows the changed-file and line-count summary.
Use `/diff` for the bounded redacted patch, or `/diff <repository-path>` to
inspect one changed file. Failed or manual-review runs keep their patch
available with an explicit unverified warning.

## Use a browser

Browser access is optional. It is off during a normal start.

Check browser support.

```bash
bun cli browser doctor
```

Start a local browser session.

```bash
bun cli browser start \
  --headed \
  --url https://example.com \
  --allow-origin https://example.com
```

You can also attach a browser that already exposes a local CDP port.

```bash
bun cli browser attach \
  --browser-url http://127.0.0.1:9222 \
  --allow-origin https://example.com
```

Useful commands:

```bash
bun cli browser status
bun cli browser tabs
bun cli browser scope list
bun cli browser close
```

Browser changes need approval. Orynt cannot use a site unless its exact origin
is allowed.

## Make an image

Image generation only runs when you use the image command.

```bash
bun cli assets generate \
  --prompt "A simple black and white app icon" \
  --output assets/generated/icon.png
```

Orynt supports PNG, WebP, and JPEG files. It can make up to four files in one
run. It will not replace an existing file unless you pass `--replace` and
approve the change.

Every generated image is added to `assets/PROVENANCE.md`.

## Local data

Orynt keeps local settings and redacted session notes under:

```text
${XDG_STATE_HOME:-~/.local/state}/orynt
```

Removing the package does not remove this folder.

See [session lifecycle](session-lifecycle.md) for resume, Trash, restore,
retention, and cleanup behavior.

## Development checks

```bash
bun test:cli
bun build:cli
bun test:contracts
bun test:core
```

There is no root lint command.

For more detail, read [permissions](permissions.md),
[privacy and security](productization/privacy-security.md), and
[the test guide](tests.md).
