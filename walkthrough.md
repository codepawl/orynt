# Openpawl MVP — Implementation Walkthrough

> **Date:** 2026-06-08
> **Status:** ✅ Complete
> **Sprint:** MVP v0.1.0

---

## Summary

This walkthrough documents the implementation of the Openpawl MVP — a complete, locally-runnable and CI/CD-ready server-side coding-agent workflow for GitHub repositories. All work is in the `codepawl` monorepo under `packages/core` and `packages/cli`.

### 2026-06-08 Artifact Path Regression Fix

**Bug:** `bun run dev:cli -- run --repo . --task "add tests for shared helpers" --dry-run` was writing run artifacts under `packages/cli/.codepawl/runs/<run-id>/` because Bun workspace filtering starts the CLI with `process.cwd()` set to `packages/cli`.

**Fix:** The CLI now resolves `--repo` to an absolute path at the command boundary. When launched from a workspace package, relative repo paths resolve against the workspace root, so `--repo .` targets the repository root for `bun run dev:cli`. The resolved absolute repo path is passed into `@codepawl/core`, and core carries a resolved `outputDir` through the run state for artifact export.

**Override:** `codepawl run` now accepts `--out-dir <path>`. When provided, core writes artifacts directly to that resolved directory. Without `--out-dir`, artifacts are written to `<repo>/.codepawl/runs/<run-id>/`.

**Scope:** Only `packages/core`, `packages/cli`, and tests/docs were changed. `apps/web` and `apps/api` were not modified.

### 2026-06-08 Failure Behavior Hardening

**Goal:** Keep Openpawl MVP behavior predictable across startup errors, runtime failures, unsafe write attempts, and CLI utility edge cases without adding product features.

**Fixes:**
- CLI startup validation now rejects missing `--repo` values, nonexistent repos, non-directory repo paths, and empty/whitespace-only tasks before the run starts.
- Core startup validation now rejects workspace paths that exist but are not directories.
- Validation command failures now return `success: false`, set `error: "Validation command failed."`, and cause the CLI to exit non-zero while preserving exported artifacts.
- File selection now skips secret-like, binary-extension, non-file, and unreadable files with trace warnings instead of silently selecting unreadable content as empty text.
- Runtime failures after workflow start continue to export `trace.json`, `report.md`, `run.json`, `patch-plan.json`, and `selected-files.json` whenever the artifact directory can be written.

**Scope:** Only `packages/core`, `packages/cli`, tests, and this walkthrough were changed. `apps/web` and `apps/api` were not modified.

### 2026-06-08 GitHub Actions Hardening

**Goal:** Make the Openpawl workflow usable from `workflow_dispatch` and safe on `pull_request` without adding new agent intelligence or external integrations.

**Fixes:**
- `workflow_dispatch` now accepts `task`, `repo_path`, and `mode`.
- `mode` defaults to `dry-run`; pull requests always run dry-run regardless of manual input defaults.
- The workflow calls the current monorepo CLI script: `bun run dev:cli -- run ...`.
- The Openpawl step captures its exit code instead of hiding it with `|| true`, allowing artifact upload and PR comment attempts before a final failure gate.
- Generated files under `.codepawl/runs/<run-id>/` are uploaded with `actions/upload-artifact@v4`.
- Artifact names use `openpawl-artifacts-<run-id>`.
- PR comments are non-destructive: the workflow creates a new comment and does not delete previous comments.
- Forked pull requests skip the comment step; the comment step also uses `continue-on-error: true` so missing comment permissions do not fail the workflow by themselves.
- The workflow opts JavaScript actions into Node 24 with `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true` after a hosted run warned about Node 20 action deprecation.

**Scope:** `.github/workflows/openpawl.yml`, README documentation, and this walkthrough were changed. `apps/web` and `apps/api` were not modified.

---

## What Was Built

### 1. `@codepawl/core` — Agent Engine

**New files:**
- [`packages/core/src/safety.ts`](packages/core/src/safety.ts) — Safety guardrails: `SafetyViolationError`, `isDisallowedPath()`, `isSecretFile()`, `assertWriteSafe()`, scan limits
- [`packages/core/src/runner.ts`](packages/core/src/runner.ts) — Top-level `runAgent(options: RunOptions): Promise<RunResult>` entry point

**Modified files:**
- [`packages/core/src/agent/nodes.ts`](packages/core/src/agent/nodes.ts) — Full rewrite with safety integration:
  - `createRepoScanNode()` now enforces file/byte caps and skips secret files
  - `createFileSelectionNode()` skips secret files, binary files, unreadable files, non-files, and byte-capped files
  - `createOptionalPatchApplyNode()` calls `assertWriteSafe()` before any write; throws `SafetyViolationError` on violation (aborts run)
  - `createTraceExportNode()` now writes `patch-plan.json` and `selected-files.json`
  - `createReportExportNode()` produces full GitHub-ready Markdown with all required sections
- [`packages/core/src/state/schema.ts`](packages/core/src/state/schema.ts) — Adds `outputDir` to agent context and optional `outDir` to run options for artifact path control
- [`packages/core/src/index.ts`](packages/core/src/index.ts) — Exports `runAgent`, `SafetyViolationError`, `assertWriteSafe`, all new types

**Test files:**
- [`packages/core/src/__tests__/safety.test.ts`](packages/core/src/__tests__/safety.test.ts) — 15 tests
- [`packages/core/src/__tests__/trace.test.ts`](packages/core/src/__tests__/trace.test.ts) — 7 tests
- [`packages/core/src/__tests__/nodes.test.ts`](packages/core/src/__tests__/nodes.test.ts) — 11 tests
- [`packages/core/src/__tests__/runner.test.ts`](packages/core/src/__tests__/runner.test.ts) — 11 tests
- [`packages/core/src/__tests__/fixtures/mock-llm.json`](packages/core/src/__tests__/fixtures/mock-llm.json) — Mock LLM fixture

---

### 2. `@codepawl/cli` — CLI Runner

**Modified files:**
- [`packages/cli/src/bin.ts`](packages/cli/src/bin.ts) — Full rewrite with 4 commands:
  - `codepawl run --repo <path> --task <string> [--dry-run | --write] [--out-dir <path>]`
  - `codepawl trace --input <trace.json> --format [markdown|json]`
  - `codepawl doctor`
  - `codepawl github-comment --report <report.md> [--token] [--repo] [--pr]`
  - Normalizes `--repo`, `--out-dir`, and `--mock-fixture` before calling `@codepawl/core`
  - Fails fast with clear errors for invalid startup inputs

**Test files:**
- [`packages/cli/src/__tests__/cli.test.ts`](packages/cli/src/__tests__/cli.test.ts) — 17 tests

---

### 3. CI/CD

**New files:**
- [`.github/workflows/openpawl.yml`](.github/workflows/openpawl.yml) — Reusable GitHub Actions workflow:
  - Triggers: `pull_request` and `workflow_dispatch`
  - Runs Openpawl CLI via `bun run dev:cli -- run`
  - Runs dry-run on PRs; `workflow_dispatch` supports `dry-run` and `write`
  - Uploads `.codepawl/runs/<run-id>/` as `openpawl-artifacts-<run-id>`
  - Posts `report.md` as a non-destructive PR comment for same-repository PRs when permissions are available
  - Runs unit tests (core + cli)

---

### 4. Documentation

- [`README.md`](README.md) — Updated with full Openpawl quick start and manual GitHub Actions dispatch instructions
- [`CLAUDE.md`](CLAUDE.md) — Updated commands section
- [`walkthrough.md`](walkthrough.md) — This file

---

## Verification Results

### `bun install`
```
50 packages installed [1380.00ms]
```
✅ **PASS**

### `bun run typecheck`
```
$ bun typecheck:shared && bun typecheck:core && bun typecheck:cli && bun typecheck:web
@codepawl/shared typecheck: Exited with code 0
@codepawl/core typecheck:   Exited with code 0
@codepawl/cli typecheck:    Exited with code 0
@codepawl/web typecheck:    Exited with code 0
```
✅ **PASS** — All 4 packages

### `bun run test`
```
$ bun --filter @codepawl/core test && bun --filter @codepawl/cli test
@codepawl/core test: Exited with code 0
@codepawl/cli test:  Exited with code 0
```
✅ **PASS**

### Direct Vitest Counts
```
packages/core:
  Test Files  4 passed (4)
  Tests       44 passed (44)

packages/cli:
  Test Files  1 passed (1)
  Tests       17 passed (17)
```
✅ **PASS** — 61/61 tests

### Commands Run
```bash
bun run typecheck:core
bun run typecheck:cli
bun run test:core
bun run test:cli
bun run typecheck
bun run test
bunx vitest run --reporter=dot  # packages/core
bunx vitest run --reporter=dot  # packages/cli
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/openpawl.yml')); print('yaml parse ok')"
```

### GitHub Actions Workflow Verification

Local workflow syntax validation:
```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/openpawl.yml')); print('yaml parse ok')"
```

Result:
```
yaml parse ok
```

No live GitHub Actions run was executed during this verification.

Manual workflow usage:
1. Open **Actions** in GitHub.
2. Select **Openpawl CI**.
3. Choose **Run workflow**.
4. Set:
   - `task`: coding task for Openpawl
   - `repo_path`: target path from checkout root, usually `.`
   - `mode`: `dry-run` or `write`
5. Download the `openpawl-artifacts-<run-id>` artifact after the run completes.

Pull request behavior:
- `pull_request` always runs Openpawl in dry-run mode.
- The workflow uploads generated artifacts when a run directory exists.
- Same-repository PRs attempt to post `report.md` as a PR comment.
- Forked PRs skip commenting to avoid permission failures.
- Comment posting is `continue-on-error`, so unavailable comment permissions do not fail the workflow by themselves.

### Real GitHub Actions Result

Latest inspected run:
- Workflow: `Openpawl CI`
- Run ID: `27114856365`
- Event: `workflow_dispatch`
- Branch: `main`
- Created: `2026-06-08T03:48:27Z`
- Conclusion: `success`
- Jobs: `Openpawl Agent Run` success, `Unit Tests (core + cli)` success

Hosted Openpawl configuration from logs:
```
Task: add tests for shared helpers
Repo path: .
Mode: dry-run
```

Hosted Openpawl command from logs:
```bash
bun run dev:cli -- run --repo . --task "add tests for shared helpers" --dry-run --test-cmd "echo skip"
```

Hosted Openpawl result:
```
Repo:    /home/runner/work/codepawl/codepawl
Run ID:  run_1780890531380_cbvky5
Status:  SUCCESS
Report: /home/runner/work/codepawl/codepawl/.codepawl/runs/run_1780890531380_cbvky5/report.md
Trace:  /home/runner/work/codepawl/codepawl/.codepawl/runs/run_1780890531380_cbvky5/trace.json
```

Artifact upload evidence:
```
Artifact name: openpawl-run-run_1780890531380_cbvky5
Files uploaded: 5
Artifact ID: 7471270052
Final size: 12278 bytes
```

Downloaded artifact contents:
```
patch-plan.json
report.md
run.json
selected-files.json
trace.json
```

CI-only follow-up from this run:
- The artifact name was redundant as `openpawl-run-run_<id>`, so the workflow now uses `openpawl-artifacts-<run-id>`.
- The hosted runner emitted a Node.js 20 action deprecation warning for JavaScript actions, so the workflow now sets `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true`.
- PR commenting was not verified by this run because it was a `workflow_dispatch` run, not a pull request run.

### Artifact Path Regression Verification

Command run from repository root:
```bash
bun run dev:cli -- run --repo . --task "add tests for shared helpers" --dry-run
```

Output confirmed the normalized repo root and root artifact paths:
```
Repo:    /home/annx9/Code/Personal/codepawl
Run ID:  run_1780889202298_qevayj
Report: /home/annx9/Code/Personal/codepawl/.codepawl/runs/run_1780889202298_qevayj/report.md
Trace:  /home/annx9/Code/Personal/codepawl/.codepawl/runs/run_1780889202298_qevayj/trace.json
```

Required artifact listing:
```bash
find .codepawl/runs -maxdepth 2 -type f | sort
```

Result:
```
.codepawl/runs/run_1780889202298_qevayj/patch-plan.json
.codepawl/runs/run_1780889202298_qevayj/report.md
.codepawl/runs/run_1780889202298_qevayj/run.json
.codepawl/runs/run_1780889202298_qevayj/selected-files.json
.codepawl/runs/run_1780889202298_qevayj/trace.json
```

Check against the previous bad location:
```
find: 'packages/cli/.codepawl/runs/run_1780889202298_qevayj': No such file or directory
```

✅ **PASS** — The run artifacts were written to `.codepawl/runs/<run-id>/` at the target repo root, and the reported paths match the written files.

### Failure Behavior Matrix

| Case | Expected behavior | Artifact behavior | Test coverage |
|------|-------------------|-------------------|---------------|
| Missing `--repo` value | CLI fails fast with `--repo requires a value` and non-zero exit | No run starts | CLI integration |
| Repo path missing | CLI fails fast with `Repository path does not exist` and non-zero exit | No run starts | CLI integration, core runner |
| Repo path is a file | CLI/core reject it as not a directory | No run starts | CLI integration, core runner |
| Empty task | CLI fails fast with a clear task error and non-zero exit | No run starts | CLI integration |
| Secret-like files | Scan/selection skip secret-looking files | Run continues | Core node tests |
| Ignored files/directories | Known ignored directories such as `.git`, `node_modules`, and `dist` are excluded from scan | Run continues | Core node tests |
| Binary files | File selection skips binary-extension files | Run continues | Core node tests |
| Unreadable files | File selection skips unreadable files and records a warning | Run continues | Core node tests |
| Validation command failure | Run returns failed status and CLI exits non-zero | All five artifacts remain written | Core runner, CLI integration |
| Write safety violation | Write mode aborts before touching files | All five artifacts are written best-effort | Core runner |
| `github-comment` without token | Prints report to stdout and exits zero | No artifact changes | CLI integration |
| `github-comment` without PR context | Prints report to stdout and exits zero | No artifact changes | CLI integration |
| `trace` missing input file | CLI fails with `Cannot read trace file` and non-zero exit | No artifact changes | CLI integration |
| `doctor` without GitHub token | Warns that token is optional/missing and exits zero if local tools are available | No artifact changes | CLI integration |

### CLI Smoke Test

```bash
bun packages/cli/src/bin.ts run \
  --repo /tmp/openpawl-smoke \
  --task "add tests for auth helpers" \
  --dry-run \
  --mock-fixture packages/core/src/__tests__/fixtures/mock-llm.json \
  --test-cmd "echo ok"
```

Output:
```
📊 Run complete
   Run ID:  run_1780888504026_z3afso
   Status:  ✅ SUCCESS
   Steps:   9
   Tokens:  400
```

Artifacts produced:
```
patch-plan.json  report.md  run.json  selected-files.json  trace.json
```
✅ **PASS** — All 5 required artifacts

### `codepawl doctor`
```
✅ Bun runtime — v1.3.14
✅ Git — git version 2.53.0
✅ LLM Provider — mock (default — no API key required)
✅ GitHub Token — ⚠️  not set (required for github-comment)
✅ All checks passed. Openpawl is ready to run.
```
✅ **PASS**

---

### RC Smoke Validation Fix

Issue found before re-tagging `v0.1.0-alpha.1`:
```bash
bun run dev:cli -- run --repo . --task "review current repository changes" --dry-run
```

The run produced all five artifacts but exited `1` because the validation node defaulted to `bun test` when no explicit `--test-cmd` was provided. That made deterministic review-only release smoke checks depend on unrelated local test state.

Fix:
- Review-only dry-runs without an explicit validation command now use safe placeholder validation.
- The placeholder is recorded as `echo placeholder validation skipped`.
- The generated report labels it as `Placeholder validation`.
- Explicit validation commands still run normally and still fail the run when they exit non-zero.
- Validation failures after a run starts still preserve all five artifacts.
- Review-only deterministic output no longer proposes `auth-helpers.test.ts`.

Acceptance verification:
```bash
rm -rf .codepawl packages/cli/.codepawl
bun run dev:cli -- run --repo . --task "review current repository changes" --dry-run
find .codepawl/runs -maxdepth 2 -type f | sort
```

Result:
```
.codepawl/runs/run_1780893153729_gksksf/patch-plan.json
.codepawl/runs/run_1780893153729_gksksf/report.md
.codepawl/runs/run_1780893153729_gksksf/run.json
.codepawl/runs/run_1780893153729_gksksf/selected-files.json
.codepawl/runs/run_1780893153729_gksksf/trace.json
```

Report verification:
```
**Placeholder validation:** `echo placeholder validation skipped`
```

✅ **PASS** — Review-only RC smoke now exits `0` and produces all five artifacts under the target repo root.

---

### Experimental OpenAI-Compatible Provider Integration

Status:
- Mock provider remains the default for tests, CI, GitHub Actions, and release smoke.
- Optional real-provider mode is available with `OPENPAWL_PROVIDER=openai-compatible`.
- Supported env vars:
  - `OPENPAWL_PROVIDER=mock | openai-compatible`
  - `OPENPAWL_MODEL=<model>`
  - `OPENPAWL_API_KEY=<key>`
  - `OPENPAWL_BASE_URL=<optional base url>`
- CLI overrides:
  - `--provider mock|openai-compatible`
  - `--model <model>`
  - `--include-prompt-metadata`

Behavior:
- `OPENPAWL_PROVIDER` defaults to `mock`.
- `openai-compatible` requires `OPENPAWL_MODEL` and `OPENPAWL_API_KEY`.
- Missing required provider config fails fast before a run starts.
- Real provider requests use chat completions with JSON response format.
- Scope and patch-plan outputs are schema-validated before use.
- Invalid provider output produces a clear validation error and preserves artifacts when the run has started.
- Trace records provider name, model name, request purpose, response validation status, and token usage when available.
- Trace does not record API keys, secrets, or full prompt content by default.
- `--include-prompt-metadata` records only redacted prompt counts and character sizes.

Verification added:
- Provider config resolution defaults to mock.
- Missing `OPENPAWL_API_KEY` for `openai-compatible` fails clearly.
- OpenAI-compatible client tests use mocked `fetch` only.
- Invalid provider-shaped output is covered with a local mock fixture and still writes all five artifacts.
- Existing deterministic mock behavior remains covered.

Known limitations:
- Real provider mode is experimental for v0.
- GitHub Actions do not use a real provider by default.
- No production autonomous coding claim is made.
- Path safety, dry-run default, and explicit `--write` behavior remain unchanged.

---

## Dry-Run Mode

In `--dry-run` mode:
- All 9 state machine nodes run
- No files are modified (write operations in `optional_patch_apply` are skipped)
- All 5 artifacts are written to `.codepawl/runs/<run-id>/`
- `patch-plan.json` shows what *would* have been applied

## Write Mode

In `--write` mode:
- `assertWriteSafe()` validates every target path **before** any file is touched
- Disallowed paths abort the entire run with `SafetyViolationError`
- Protected paths include: `.env*`, lockfiles, `.git/`, migrations, `node_modules`, build artifacts, files outside the repo root
- Files are created/modified/deleted one chunk at a time after safety validation
- Validation command runs after patching; trace and report are exported regardless of validation outcome

---

## Current Limitations

1. **Real provider mode is experimental** — The verified path remains deterministic mock mode. OpenAI-compatible mode is available only when configured with `OPENPAWL_*` env vars.
2. **No `.gitignore` parsing** — The scan uses a hardcoded exclusion list. A proper `.gitignore` parser would improve accuracy.
3. **No retry loop** — The state machine runs once (no re-plan loop if validation fails).
4. **No interactive write confirmation** — Write mode applies all approved patches atomically; there is no interactive per-chunk confirmation in this MVP.
5. **Validation is fire-and-forget** — The run exits failed and exports artifacts when tests fail, but doesn't attempt to auto-fix the failure.
6. **Binary detection is conservative** — File selection skips known binary extensions; it does not inspect every file's bytes for binary content.
7. **Ignore handling is hardcoded** — Known generated and dependency directories are skipped, but repo-specific `.gitignore` rules are not parsed yet.
8. **GitHub posting requires API token and PR context** — Without them, `github-comment` prints the report to stdout instead of posting.

---

## Next Milestones After MVP

| Priority | Milestone |
|----------|-----------|
| P0 | Harden experimental real-provider mode with broader provider adapters and fixtures |
| P0 | `.gitignore` parsing via `ignore` npm package |
| P1 | Retry loop (re-run scope analysis if validation fails) |
| P1 | `codepawl init` command to generate project `.codepawl/config.json` |
| P2 | Interactive write mode with per-chunk confirmation |
| P2 | Diff-format preview in report (before/after unified diff) |
| P2 | Multi-repo workspace support |
| P3 | Web dashboard integration for run history (KStudio integration) |
| P3 | `codepawl watch` mode for file-change-triggered runs |
