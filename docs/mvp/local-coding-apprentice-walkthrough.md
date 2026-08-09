# Local CLI Agent Walkthrough

This walkthrough proves the repository-agent lifecycle with a disposable Git
repository, isolated worktree, controlled Codex fixture, deterministic
verification, evidence, candidate memory, and manual skill promotion.

## Controlled smoke

```bash
bun install
bun test
bun build
bun walkthrough:smoke
```

The smoke script creates all fixture state under `/tmp`, uses a fake Codex
executable, explicitly approves the bounded fixture action, and prints the run,
sandbox, artifact, verifier, memory, skill, and replay identifiers. It requires
no provider credentials or network access.

To retain the disposable fixture for inspection:

```bash
ORYNT_KEEP_WALKTHROUGH=1 bun walkthrough:smoke
```

Inspect the emitted artifact manifest, event log, verifier input/result,
redacted logs, memory candidates, and replay plan. A passing controlled smoke
proves the local harness and gates, not live provider behavior.

## Interactive CLI

```bash
bun cli --repo /path/to/disposable/repository
```

Read-only conversation needs no approval. A requested repository mutation is
planned, policy checked, executed by one writer inside the isolated worktree,
and verified before Orynt reports success. Use `/state`, `/plan`, `/verify`,
`/evidence`, and `/cost` to inspect the lifecycle.

## Optional browser session

Browser capability is never auto-started:

```bash
bun cli browser doctor
bun cli browser start --headed --url https://example.com
# or:
bun cli browser attach --browser-url http://127.0.0.1:9222 \
  --allow-origin https://example.com
```

With a configured session, browser observation tools can be selected for a
normal agent turn. Typed page mutations still require explicit terminal
approval. Close the session with `bun cli browser close`.

## Optional live Codex

Use only a disposable repository and explicitly opt into local authenticated
Codex, network, and model budget:

```bash
ORYNT_RUN_REAL_CODEX=1 bun walkthrough:real-codex
```

Never place API keys, passwords, OTPs, private keys, cookies, or other secrets
in fixture content or walkthrough notes. Live output is separate evidence and
must not replace deterministic verification.

The Tauri app is outside this CLI walkthrough. Its validation command is
`bun check:desktop`.
