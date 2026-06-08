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

## 🐾 Openpawl CLI — Quick Start

### 1. Install dependencies

```bash
bun install
```

### 2. Run a dry-run (no files modified)

```bash
bun packages/cli/src/bin.ts run \
  --repo . \
  --task "add tests for auth helpers" \
  --dry-run \
  --mock-fixture packages/core/src/__tests__/fixtures/mock-llm.json \
  --test-cmd "echo skip"
```

Artifacts will appear in `.codepawl/runs/<run-id>/`:
- `trace.json` — full event timeline and token usage
- `report.md` — GitHub-ready Markdown report
- `run.json` — structured run result
- `patch-plan.json` — the generated patch plan
- `selected-files.json` — files selected for the task

### 3. Run in write mode (applies patch)

```bash
bun packages/cli/src/bin.ts run \
  --repo . \
  --task "fix failing unit test" \
  --write \
  --mock-fixture packages/core/src/__tests__/fixtures/mock-llm.json
```

> ⚠️ Write mode validates all target paths before applying any changes. Disallowed paths (lockfiles, env files, .git, migrations, build artifacts) will cause the run to abort with a `SafetyViolationError`.

### 4. Inspect the trace

```bash
bun packages/cli/src/bin.ts trace \
  --input .codepawl/runs/<run-id>/trace.json \
  --format markdown
```

### 5. Check system readiness

```bash
bun packages/cli/src/bin.ts doctor
```

### 6. Post report to GitHub PR

```bash
bun packages/cli/src/bin.ts github-comment \
  --report .codepawl/runs/<run-id>/report.md \
  --token $GITHUB_TOKEN \
  --repo owner/repo \
  --pr 42
```

---

## 🤖 How It Works

Openpawl runs a bounded **9-node state machine**:

```
intake → repo_scan → scope_analysis → file_selection → patch_plan
  → optional_patch_apply → validation → trace_export → report_export
```

- **Dry-run mode**: Scans the repo, analyses scope, generates a patch plan, validates, and exports all artifacts — **without modifying any files**.
- **Write mode**: Performs all of the above, then applies the patch (after safety validation), runs your test suite, and exports results.

### LLM Provider

The default provider is a **mock LLM** that reads rules from a JSON fixture file. This means Openpawl works completely offline and without API keys. To use a real LLM, set `CODEPAWL_LLM_PROVIDER` and the relevant API key environment variables (real providers are a future extension).

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
