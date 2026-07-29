# Orynt

Orynt is a closed-source control cockpit for inspectable, replayable computer agents from CodePawl.

The current repo is in Tauri-first MVP bootstrap. The marketing site already lives in `apps/marketing-site`; the product app starts in `apps/desktop`. The current P0 is CLDSA-Lite: a supervised Coding Apprentice that delegates repository tasks to Codex inside an isolated git worktree, verifies outcomes, records append-only evidence, controls cost, and proposes candidate memory from user corrections.

## Current Apps

- `apps/marketing-site`: Vite React landing page.
- `apps/desktop`: Tauri v2 + React product shell with typed mock cockpit data and mock command/event bridge.
- `packages/cli`: keyboard-first Orynt terminal interface for supervised repository runs.

## Shared Packages

- `packages/shared`: product UI/runtime types and mock MVP state.
- `packages/ipc-contracts`: JSON-RPC envelopes, runtime error codes, run-event contracts, and Tauri command input types.

## Architecture Direction

- React renderer talks only to Tauri commands/events.
- Rust/Tauri host owns app trust boundaries, payload validation, settings, keychain access, and sidecar supervision.
- Node/TypeScript sidecar will own the run orchestrator, Codex adapter, repository workspace adapter, event persistence, verification, model calls, memory extraction, and token/cost accounting.
- Browser automation remains a later capability pack behind the same permissioned surface-adapter architecture.
- Runs, append-only events, deterministic verification, permissions, bounded context, resource budgets, candidate memory, and Codex/provider integration are core primitives.

## Commands

```bash
pnpm install
pnpm cli
pnpm cli --repo /path/to/repository "inspect this codebase"
pnpm test:cli
pnpm --filter @codepawl/marketing-site test
pnpm --filter @codepawl/marketing-site build
pnpm test:contracts
pnpm test:desktop
pnpm test:tauri
pnpm release:desktop:check
pnpm walkthrough:smoke
ORYNT_RUN_REAL_CODEX=1 pnpm walkthrough:real-codex
pnpm build:desktop
pnpm package:desktop:internal
pnpm --filter @codepawl/desktop exec tauri dev
```

### Interactive CLI

```bash
# Interactive conversational repository agent
pnpm cli

# Start with a repository and an initial message
pnpm cli --repo /path/to/repository "inspect this codebase"

# Restore typed state from the latest session
pnpm cli --resume latest

# Diagnose Git, terminal, repository, and Codex login readiness
pnpm cli doctor

# One explicitly approved headless run with machine-readable events
pnpm cli run --approve-once --jsonl --repo /path/to/repository "run the contract tests"
```

For faster repeat launches during local development, use the root Makefile. It reuses current compiled output and runs the canonical CLI build only when runtime source, package configuration, or required output changed:

```bash
# Start the interactive TUI in the current terminal
make cli

# Forward an exact argv array without shell evaluation
ORYNT_CLI_ARGS_JSON='["--repo","/path/to/repository","inspect this codebase"]' make cli
ORYNT_CLI_ARGS_JSON='["doctor"]' make cli

# Force the complete canonical build without launching the TUI
make cli-rebuild
```

Run `pnpm install` before using the Make targets. The fast path requires GNU Make; `pnpm cli` remains the portable, always-rebuild fallback when Make is unavailable. `ORYNT_CLI_ARGS_JSON` must be a JSON array of strings so arguments containing spaces or shell metacharacters reach Orynt unchanged.

The first interactive TTY launch shows the supervised repository boundary. `${XDG_STATE_HOME:-~/.local/state}/orynt/preferences.json` stores that acknowledgement plus the working repository and orchestration profile; `/repo` and `/model` update those saved values. Those working defaults apply to later interactive and `orynt run` launches. Explicit `--repo`, `--profile`, repeatable `--role-model role=id`, and repeatable `--role-effort role=level` flags override one invocation without replacing the saved defaults. Version 1 model/effort settings are migrated once into an equivalent version 2 custom profile. Read-only conversation needs no approval. Small repository-local writes can be authorized automatically by deterministic policy; deletion, rename, dependency, migration, unknown, or broad work requires a per-action confirmation. Host, root, network, secret, and outside-repository capabilities remain unavailable in this repository-only build.

CLI options and subcommands go directly after `pnpm cli`. A literal `--` ends option parsing, so every following token is treated as an initial message and cannot grant `--approve-once`.
Conversational mode requires an interactive TTY; piped or other non-TTY work must use the explicit `run --approve-once` form.

Typing `/` opens a filtered command helper. Use Up/Down or Shift+Tab to move through suggestions. Tab completes the highlighted command without executing it; Enter submits an exact no-argument or optional command, while an incomplete prefix or required-argument command is completed first. Escape dismisses suggestions. The composer also supports normal arrow/Home/End editing, Ctrl+A/E/W/U/K/L shortcuts, and de-duplicated command history. Use a trailing `\` to continue a prompt on the next line. At the main prompt, the first `Ctrl+C` clears the draft and starts a three-second exit countdown; press `Ctrl+C` again before it expires to exit Orynt, or resume typing to stay. During approval or model selection, `Ctrl+C` cancels only that prompt; during a controlled run it requests run cancellation. `Ctrl+D` or `/exit` ends an idle session immediately.

Interactive color is intentionally minimal: blue marks keyboard focus, while yellow, green, and red identify attention, verified success, and failure. Slow operator-visible waits use one inline `◜ ◝ ◞ ◟` activity row; permanent output atomically clears and restores that row without entering a fullscreen terminal mode. `--no-color` and the standard `NO_COLOR` environment variable keep inline motion but remove color. Use `--plain` to disable both color and cursor-control animation.

Use `/model` to open the inline orchestration editor. Structured CLI summaries use a restrained `├─`/`└─` tree so roles, policy, limits, and budgets remain visibly related without decorative panels. `quality`, `balanced`, `economy`, and deterministic `auto` presets are available; fresh installs remain on the legacy single-model custom profile until the multi-model rollout gates have measured safety, success/cost, and p95 latency. The coordinator interprets the conversation, up to two optional helpers inspect in parallel without write access, the implementer owns the single writer lease, and the reviewer remains read-only. Use `/model show`, `/model profile <auto|quality|balanced|economy>`, `/model role <role> <model-id> [effort]`, or `/model effort <role> <level>` for direct control. Legacy `/model <id>`, `/effort`, `--model`, and `--effort` forms now show migration guidance instead of silently flattening the role topology.

Ordinary text is a message to the agent, not an implicit goal. The coordinator and read-only roles receive bounded repository snapshots and no shell, browser, plugin, or host-file tools. When a message asks for a change, the coordinator can propose one bounded action; deterministic Orynt policy approves and dispatches it before the implementer enters the isolated repository sandbox. If the first verifier result fails, a reviewer may propose one typed recovery task. The original approval covers that retry only when it retains the single writer, uses the same sandbox, stays inside the originally approved paths, and does not broaden authority; Orynt then verifies the resulting sandbox again. Policy/setup/provider failures and cancellation are never retried. The independent verifier remains final authority, and review cannot override its verdict. Use `/goal <text>` to set a persistent objective, `/goal` to show it, and `/goal --clear` to clear it. `/criteria` supplies acceptance criteria that accompany the active goal on subsequent turns. The workbench also exposes `/plan`, `/state`, `/evidence`, `/verify`, `/cost`, `/doctor`, and `/resume`.

Sessions persist a compact, redacted conversation summary and turn count—not raw transcripts—under `${XDG_STATE_HOME:-~/.local/state}/orynt/sessions`. Human-readable actions show the stable `Prepare → Run → Verify → Done` lifecycle, followed by the agent's exact redacted final report, verified changed paths, verifier outcome, and evidence location. The importer re-checks the real diff for protected paths, scope, destructive changes, and changed-file limits before verification. Detailed internal events remain in the run event-log artifact. Headless execution stays explicit: `--approve-once` grants exactly one repository-scoped run, failures return a non-zero exit code, and JSONL `schemaVersion: 1` continues to emit typed `event`, `result`, or `error` records.

On Linux/Fedora, `pnpm test:tauri` forces Cargo to use system `pkg-config` when `/usr/bin/pkg-config` is available. This avoids Homebrew `pkg-config` shadowing Fedora's native Tauri `.pc` files; the wrapper also clears `PKG_CONFIG_LIBDIR` and `PKG_CONFIG_SYSROOT_DIR` and adds `/usr/lib64/pkgconfig:/usr/share/pkgconfig` to `PKG_CONFIG_PATH`.

## Local MVP Walkthrough

The default local Coding Apprentice walkthrough uses a disposable fixture repository and a fake Codex binary, so it requires no model credentials and keeps controlled execution approval-gated. An opt-in real Codex walkthrough is also available for local authenticated CLI testing. See [`docs/mvp/local-coding-apprentice-walkthrough.md`](docs/mvp/local-coding-apprentice-walkthrough.md).

## Private Beta Packaging

`pnpm package:desktop:internal` creates an Unsigned internal Linux beta tarball under `dist/private-beta/` with the built Tauri binary, the compiled repository-runner sidecar, release notes, smoke checklist, and `SHA256SUMS`.

The private beta package is manually distributed only. Updater artifacts are disabled, signing is not configured, and live billing, hosted accounts, managed AI credits, browser automation, general desktop control, arbitrary file control, terminal autonomy, and cloud sync are out of runtime scope. See [`docs/productization/private-beta-release-notes.md`](docs/productization/private-beta-release-notes.md) and [`docs/productization/private-beta-release-smoke.md`](docs/productization/private-beta-release-smoke.md).

## MVP Sequence

1. Architecture reconciliation against `.codex/plan/cldsa-lite/`.
2. Run state machine and append-only event spine.
3. Safety policy, action gate, budgets, and isolated git worktree sandbox.
4. Codex adapter with event normalization, cancellation, and timeout handling.
5. Deterministic verifier for tests, lint, typecheck, build, diff, and protected paths.
6. Bounded context workspace and resource governor.
7. Episodic event store, candidate memory, and user review flow.
8. Post-run consolidation and lifecycle policy.
9. Adaptive control and lightweight transition prediction.
10. Browser operator and other future capability packs.
