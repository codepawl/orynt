# CLI run experience revamp

Status: implemented

## Objective

Make supervised CLI runs understandable without weakening repository boundaries:

- distinguish the one-time safety acknowledgement from per-run authorization;
- ask exactly once for each interactive goal;
- replace internal event churn with a stable `Prepare -> Run -> Verify -> Done` lifecycle;
- show the redacted final agent response once, followed by exact changed paths,
  verification, and evidence;
- keep JSONL and headless approval contracts compatible.

## Decisions

- The startup acknowledgement remains onboarding only and never authorizes work.
- Each interactive goal receives one compact, repository-scoped approval prompt.
- Internal planning, approval, import, and memory events remain in evidence rather
  than being streamed as progress rows.
- Human success requires a passing verifier with no policy failure or manual-review
  requirement.
- Orynt-managed verifier content executes from trusted process input, never from
  the model-writable worktree path.

## Implementation areas

- `packages/cli`: startup and run approval copy, slash helper, monotonic progress,
  final report rendering, terminal-safe output, tests.
- `packages/codex-adapter`: cancellation, process-group cleanup, exact NUL-delimited
  Git paths, tests.
- `packages/coding-apprentice`: managed verifier integrity gates and adversarial
  delayed-tampering tests.
- `packages/verifier`: trusted command input and exact diff-scope paths.
- Root Makefile, CLI launcher, package scripts, and README documentation.

## Validation

- `bun run test:cli`
- `bun run build:cli`
- `bun run --filter @codepawl/verifier test`
- `bun run --filter @codepawl/coding-apprentice test`
- `bun run --filter @codepawl/codex-adapter test`
- `ORYNT_CLI_ARGS_JSON='["doctor"]' make cli`
- `git diff --check`
