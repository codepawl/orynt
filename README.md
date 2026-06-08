# CodePawl

CodePawl is a server-side coding-agent ecosystem designed for autonomous development orchestration. The repository houses **Openpawl**, the core agent engine, along with internal tracing and memory modules.

## Project Structure

This project is organized as a Bun-powered monorepo containing:
- **`apps/web`**: The public-facing website built on Next.js 16.
- **`apps/api`**: FastAPI gateway backend service.
- **`packages/core`** (`@codepawl/core`): The Openpawl agent engine — state machine workflow, trace ledger, safety guardrails, LLM provider abstraction, and memory modules.
- **`packages/cli`** (`@codepawl/cli`): The command-line interface for running Openpawl locally and in CI.
- **`packages/shared`** (`@codepawl/shared`): Shared TypeScript types and interfaces.

---

## [>.-] Openpawl CLI Quick Start

The CLI symbol logo is `[>.-]`, rendered as a colored terminal badge when color is enabled. The compact status marker is `>.-`. Symbols, badge styling, and ANSI color controls live in `packages/cli/src/branding.ts`; set `NO_COLOR=1` or `OPENPAWL_COLOR=0` to disable color, or `OPENPAWL_COLOR=1` to force it.

### 1. Install dependencies

```bash
bun install
```

### 2. Run a dry-run (no files modified)

```bash
bun run dev:cli -- run \
  --repo . \
  --task "review current repository changes" \
  --dry-run
```

Artifacts will appear in `.codepawl/runs/<run-id>/`:
- `trace.json`: full event timeline and token usage
- `report.md`: GitHub-ready Markdown report
- `run.json`: structured run result
- `patch-plan.json`: the generated patch plan
- `selected-files.json`: files selected for the task

Dry-runs use placeholder validation when `--test-cmd` is omitted, so smoke checks do not run unrelated repo-wide tests. Pass `--test-cmd "<command>"` to run real validation; a non-zero command still fails the run and preserves artifacts.

### 3. Run in write mode (applies patch)

```bash
bun run dev:cli -- run \
  --repo . \
  --task "fix failing unit test" \
  --write
```

> ⚠️ Write mode validates all target paths before applying any changes. Disallowed paths (lockfiles, env files, .git, migrations, build artifacts) will cause the run to abort with a `SafetyViolationError`.

### 4. Inspect the trace

```bash
bun run dev:cli -- trace \
  --input .codepawl/runs/<run-id>/trace.json \
  --format markdown
```

### 5. Check system readiness

```bash
bun run dev:cli -- doctor
```

### 6. Post report to GitHub PR

```bash
bun run dev:cli -- github-comment \
  --report .codepawl/runs/<run-id>/report.md \
  --token $GITHUB_TOKEN \
  --repo owner/repo \
  --pr 42
```

---

## How It Works

Openpawl runs a bounded **9-node state machine**:

```
intake → repo_scan → scope_analysis → file_selection → patch_plan
  → optional_patch_apply → validation → trace_export → report_export
```

- **Dry-run mode**: Scans the repo, analyses scope, generates a patch plan, validates, and exports all artifacts — **without modifying any files**.
- **Write mode**: Performs all of the above, then applies the patch (after safety validation), runs your test suite, and exports results.

### LLM Provider

The default provider is deterministic mock mode. It works offline, requires no API key, and remains the verified path for tests, CI, and release smoke.

Experimental OpenAI-compatible provider mode is available for local dry-runs:

```bash
export OPENPAWL_PROVIDER=openai-compatible
export OPENPAWL_MODEL=<model>
export OPENPAWL_API_KEY=<key>
export OPENPAWL_BASE_URL=<optional base url>
export OPENPAWL_MAX_TOKENS=<optional structured-output token cap>

bun run dev:cli -- run \
  --repo . \
  --task "add tests for shared helpers" \
  --dry-run
```

Provider connectivity smoke:

Use this to verify the OpenAI-compatible endpoint, key, model, and `response_format` transport before running the agent workflow.

```bash
curl -sS "${OPENPAWL_BASE_URL:-https://api.openai.com/v1}/chat/completions" \
  -H "Authorization: Bearer $OPENPAWL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "'"$OPENPAWL_MODEL"'",
    "messages": [
      { "role": "user", "content": "Return exactly this JSON object: {\"ok\":true}" }
    ],
    "response_format": { "type": "json_object" },
    "max_tokens": 64
  }'
```

Agent structured smoke:

```bash
OPENPAWL_PROVIDER=openai-compatible \
OPENPAWL_MODEL=<model> \
OPENPAWL_BASE_URL=<base-url> \
OPENPAWL_API_KEY=<key> \
OPENPAWL_MAX_TOKENS=2000 \
bun run dev:cli -- run \
  --repo . \
  --task "add tests for the Openpawl trace ledger" \
  --dry-run
```

You can also pass `--provider openai-compatible --model <model>` on `codepawl run`. Missing `OPENPAWL_MODEL` or `OPENPAWL_API_KEY` fails fast with a clear error. Provider calls request JSON output, apply structured-output token caps with `OPENPAWL_MAX_TOKENS` plus optional `OPENPAWL_SCOPE_ANALYSIS_MAX_TOKENS` and `OPENPAWL_PATCH_PLAN_MAX_TOKENS`, extract common JSON object formats such as fenced JSON, and validate response schemas before using them. On malformed JSON or schema validation failure, Openpawl performs one compact structured-output retry that includes only the expected schema, previous error category/path, and task summary. Trace artifacts record provider name, model, request purpose, response-format request status, parse/validation status, schema validation path, finish reason, content length, a small redacted content preview on parse errors, and token usage when available; they do not record API keys or full prompts by default. Use `--include-prompt-metadata` to record only redacted prompt counts and sizes.

OpenAI-compatible transport does not guarantee schema adherence for every model. Some models may need the structured retry, lower temperature, or a different model with stronger JSON-mode behavior.

`patch_plan` is metadata-only in the current MVP. Its JSON contains only `rationale` and up to five chunks shaped as `{ "type": "...", "file": "...", "description": "..." }`; it does not include code diffs or replacement content.

To intentionally run full validation during a real-provider dry-run:

```bash
OPENPAWL_PROVIDER=openai-compatible \
OPENPAWL_MODEL=<model> \
OPENPAWL_BASE_URL=<base-url> \
OPENPAWL_API_KEY=<key> \
bun run dev:cli -- run \
  --repo . \
  --task "add tests for the Openpawl trace ledger" \
  --dry-run \
  --test-cmd "bun test"
```

Real provider integration is experimental in v0. It does not imply production autonomous coding, and it does not loosen dry-run defaults, write-mode opt-in, or path safety guardrails.

---

## CI/CD Integration

See [`.github/workflows/openpawl.yml`](.github/workflows/openpawl.yml) for a reusable GitHub Actions workflow that:
- Runs Openpawl on pull requests in dry-run mode
- Runs manually with `workflow_dispatch`
- Uploads all generated files under `.codepawl/runs/<run-id>/`
- Posts `report.md` as a non-destructive PR comment for same-repository pull requests when comment permissions are available

Manual run inputs:
- `task`: coding task for Openpawl, defaulting to `review changes and suggest improvements`
- `repo_path`: target repository path from the checkout root, defaulting to `.`
- `mode`: `dry-run` or `write`, defaulting to `dry-run`

To run it manually in GitHub:
1. Open the repository's **Actions** tab.
2. Select **Openpawl CI**.
3. Choose **Run workflow**.
4. Set `task`, `repo_path`, and `mode`.
5. Download the `openpawl-artifacts-<run-id>` artifact from the completed workflow run.

---

## Development Commands

```bash
# Install JS deps
bun install

# Typecheck all packages
bun run typecheck

# Run all tests (core + CLI)
bun run test

# Run core tests only
bun run test:core

# Run CLI tests only
bun run test:cli

# Run web app
bun dev

# Run API
bun dev:api

# Run Openpawl CLI (dev mode)
bun dev:cli
```

---

## Documentation

| File | Description |
|------|-------------|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design, state machine, contracts |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Execution plan and milestones |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Architecture Decision Records |
| [CLAUDE.md](CLAUDE.md) | Rules for AI coding agents working in this repo |
| [walkthrough.md](walkthrough.md) | MVP implementation summary and test results |

## License

TBD.
