# Openpawl MVP — Implementation Walkthrough

> **Date:** 2026-06-08
> **Status:** ✅ Complete
> **Sprint:** MVP v0.1.0

---

## Summary

This walkthrough documents the implementation of the Openpawl MVP — a complete, locally-runnable and CI/CD-ready server-side coding-agent workflow for GitHub repositories. All work is in the `codepawl` monorepo under `packages/core` and `packages/cli`.

---

## What Was Built

### 1. `@codepawl/core` — Agent Engine

**New files:**
- [`packages/core/src/safety.ts`](packages/core/src/safety.ts) — Safety guardrails: `SafetyViolationError`, `isDisallowedPath()`, `isSecretFile()`, `assertWriteSafe()`, scan limits
- [`packages/core/src/runner.ts`](packages/core/src/runner.ts) — Top-level `runAgent(options: RunOptions): Promise<RunResult>` entry point

**Modified files:**
- [`packages/core/src/agent/nodes.ts`](packages/core/src/agent/nodes.ts) — Full rewrite with safety integration:
  - `createRepoScanNode()` now enforces file/byte caps and skips secret files
  - `createFileSelectionNode()` skips secret files and byte-capped files
  - `createOptionalPatchApplyNode()` calls `assertWriteSafe()` before any write; throws `SafetyViolationError` on violation (aborts run)
  - `createTraceExportNode()` now writes `patch-plan.json` and `selected-files.json`
  - `createReportExportNode()` produces full GitHub-ready Markdown with all required sections
- [`packages/core/src/index.ts`](packages/core/src/index.ts) — Exports `runAgent`, `SafetyViolationError`, `assertWriteSafe`, all new types

**Test files:**
- [`packages/core/src/__tests__/safety.test.ts`](packages/core/src/__tests__/safety.test.ts) — 15 tests
- [`packages/core/src/__tests__/trace.test.ts`](packages/core/src/__tests__/trace.test.ts) — 7 tests
- [`packages/core/src/__tests__/nodes.test.ts`](packages/core/src/__tests__/nodes.test.ts) — 7 tests
- [`packages/core/src/__tests__/runner.test.ts`](packages/core/src/__tests__/runner.test.ts) — 8 tests
- [`packages/core/src/__tests__/fixtures/mock-llm.json`](packages/core/src/__tests__/fixtures/mock-llm.json) — Mock LLM fixture

---

### 2. `@codepawl/cli` — CLI Runner

**Modified files:**
- [`packages/cli/src/bin.ts`](packages/cli/src/bin.ts) — Full rewrite with 4 commands:
  - `codepawl run --repo <path> --task <string> [--dry-run | --write]`
  - `codepawl trace --input <trace.json> --format [markdown|json]`
  - `codepawl doctor`
  - `codepawl github-comment --report <report.md> [--token] [--repo] [--pr]`

**Test files:**
- [`packages/cli/src/__tests__/cli.test.ts`](packages/cli/src/__tests__/cli.test.ts) — 6 tests

---

### 3. CI/CD

**New files:**
- [`.github/workflows/openpawl.yml`](.github/workflows/openpawl.yml) — Reusable GitHub Actions workflow:
  - Triggers: `pull_request` and `workflow_dispatch`
  - Runs Openpawl CLI (dry-run on PRs, configurable on dispatch)
  - Uploads `.codepawl/runs/` as artifact
  - Posts `report.md` as PR comment (when GITHUB_TOKEN available)
  - Runs unit tests (core + cli)

---

### 4. Documentation

- [`README.md`](README.md) — Updated with full Openpawl quick start
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
@codepawl/shared typecheck: Done in 288 ms
@codepawl/core typecheck:   Done in 715 ms
@codepawl/cli typecheck:    Done in 711 ms
@codepawl/web typecheck:    Done in 3.40 s
```
✅ **PASS** — All 4 packages

### `bun run test`
```
@codepawl/core:
  ✓ safety.test.ts    (15 tests)
  ✓ trace.test.ts     (7 tests)
  ✓ nodes.test.ts     (7 tests)
  ✓ runner.test.ts    (8 tests)
  Test Files 4 passed | Tests 37 passed

@codepawl/cli:
  ✓ cli.test.ts       (6 tests)
  Test Files 1 passed | Tests 6 passed
```
✅ **PASS** — 43/43 tests

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

1. **No real LLM integration** — The MVP ships only with a mock LLM provider. Real provider support (OpenAI, Anthropic, etc.) requires adding adapters gated by `CODEPAWL_LLM_PROVIDER`.
2. **No `.gitignore` parsing** — The scan uses a hardcoded exclusion list. A proper `.gitignore` parser would improve accuracy.
3. **No retry loop** — The state machine runs once (no re-plan loop if validation fails).
4. **No interactive write confirmation** — Write mode applies all approved patches atomically; there is no interactive per-chunk confirmation in this MVP.
5. **Validation is fire-and-forget** — The run exports artifacts even if tests fail, but doesn't attempt to auto-fix the failure.
6. **GitHub comment requires API token** — Without a token, the `github-comment` command prints the report to stdout.

---

## Next Milestones After MVP

| Priority | Milestone |
|----------|-----------|
| P0 | Real LLM provider integration (OpenAI / Anthropic gated by env var) |
| P0 | `.gitignore` parsing via `ignore` npm package |
| P1 | Retry loop (re-run scope analysis if validation fails) |
| P1 | `codepawl init` command to generate project `.codepawl/config.json` |
| P2 | Interactive write mode with per-chunk confirmation |
| P2 | Diff-format preview in report (before/after unified diff) |
| P2 | Multi-repo workspace support |
| P3 | Web dashboard integration for run history (KStudio integration) |
| P3 | `codepawl watch` mode for file-change-triggered runs |
