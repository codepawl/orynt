# Openpawl MVP — Implementation Walkthrough

## Openpawl Release Progression

### v0.1.0-alpha.1

- Bun monorepo foundation.
- `@codepawl/core` and `@codepawl/cli` scaffolding.
- Deterministic mock provider.
- Local dry-run execution.
- Artifact pipeline with six run artifacts (including write-mode results).
- `workflow_dispatch` dry-run.
- Pull request dry-run with report comment.
- Metadata-only patch plans.
- No production write mode.

### v0.1.0-alpha.2

- Experimental OpenAI-compatible provider path.
- DeepInfra/Nemotron smoke coverage.
- Provider diagnostics and failure category improvements.
- Structured-output retry handling.
- Safe trace metadata and bounded artifact behavior.
- Mock provider remained the default.

### v0.1.0-alpha.3

- DeepInfra `json_schema` strict provider path.
- Context compaction with budget controls and candidate/omitted tracking.
- Provider prompt size reduction and scope for token governance.
- Provider output grounding for scope and patch paths.
- Ungrounded proposals surfaced and rejected.
- Real-provider dry-run smoke success.
- Patch planning remains metadata-only.
- Dry-run provider scope proposals now fallback to context candidates instead of hard-failing.

## Maturity Plan

| Stage | Target | Completion criteria |
| --- | --- | --- |
| Alpha | `v0.1.0-alpha.x` | CLI + dry-run + trace + CI verified; real-provider support experimental; no trusted write mode |
| Beta | `v0.1.0-beta.x` | Safe write-mode v0, explicit test command required, no source overwrite outside allowed paths, PR workflow verified |
| RC | Release candidate | Multiple real repos tested, provider compatibility matrix published, failure behavior stable under structured-output retries |
| Stable 0.1.0 | `v0.1.0` | External package install path validated, security guardrails documented, CI green, publishing checks complete |

### Publishing guidance

- Use GitHub Releases for alpha distribution now.
- Avoid full npm release until packaging and install surfaces are complete.
- NPM alpha publish is acceptable after `codepawl` can be installed and executed from a packed tarball in a temporary repository.
- Stable npm publish should not happen until safe write mode is in place and at least three real repository dry-run validations are complete.

### Readiness checklist (recommended before any publish)

- `npm pack` dry-run for distributable package outputs.
- Install CLI in a fresh temporary repo and run `codepawl doctor`.
- Run `codepawl run --dry-run` with a repository task.
- Verify artifacts exist: `trace.json`, `run.json`, `report.md`, `patch-plan.json`, `selected-files.json`, `applied-files.json`.
- Verify no secrets or raw prompts in trace/report output by default.
- Verify GitHub Action docs and matrix docs describe current workflow and permissions.
- Verify package metadata/licensing and export surfaces are complete.

> **Date:** 2026-06-08
> **Status:** ✅ Complete
> **Sprint:** MVP v0.1.0

---

## Summary

This walkthrough documents the implementation of the Openpawl MVP — a complete, locally-runnable and CI/CD-ready server-side coding-agent workflow for GitHub repositories. All work is in the `codepawl` monorepo under `packages/core` and `packages/cli`.

### CLI Branding

- Symbol logo: `[>.-]`
- Compact status marker: `>.-`
- Source of truth: `packages/cli/src/branding.ts`
- Full logo rendering uses a colored terminal badge around `[>.-]` when color is enabled.
- CLI color can be disabled with `NO_COLOR=1` or `OPENPAWL_COLOR=0`; `OPENPAWL_COLOR=1` forces badge color for local smoke checks.

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
- Runtime failures after workflow start continue to export `trace.json`, `report.md`, `run.json`, `patch-plan.json`, `selected-files.json`, and `applied-files.json` whenever the artifact directory can be written.

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

### 2026-06-08 Structured-output Retry and Classification Hardening

**Goal:** Improve real-provider reliability when output is not strict JSON and strengthen auditability when retries are used.

**Fixes:**
- Added explicit `non_json_output` parsing classification for plain-language provider responses.
- Kept `truncated_output` only for explicit truncation signals (for example, `finish_reason=length`/`content_filter` or clearly incomplete JSON starts).
- Mapped remaining invalid-but-JSON-like outputs to `malformed_json` unless truncation is strongly indicated.
- Added retry metadata fields in trace and response events (`retryAttempt`, `retryAttempted`, `retrySucceeded`).
- Added `provider_structured_retry_failed` trace events so failed retries remain clearly visible.
- Added `json_schema` transport support for OpenAI-compatible providers:
  - Openpai-compatible calls for `scope_analysis` and `patch_plan` now send `response_format: { type: "json_schema", json_schema: { name, strict: true, schema } }`.
  - `OPENPAWL_RESPONSE_FORMAT` / `--response-format` still allows fallback to `json_object`.
  - Scope schema now prefers `proposedModifications` and `proposedCreations` while retaining compatibility with legacy `proposedFilesToModify`/`proposedFilesToCreate` parsing for existing fixtures.

**Scope:** `packages/core/src/providers/json-output.ts`, `packages/core/src/agent/nodes.ts`, and provider/runner tests were updated. `apps/web` and `apps/api` were not modified.

### 2026-06-08 Repo-grounded proposal filtering

**Goal:** Reduce hallucinated or invented file targets in model output and preserve auditable failure visibility when outputs are not repo-grounded.

**Fixes:**
- Added grounding helpers for `scope_analysis` proposals and `patch_plan` chunks:
  - scope `proposedModifications` / `proposedCreations` must parse as repo-relative file paths
  - natural-language descriptions are rejected as non-path content
  - test-task scope proposals prefer existing relevant files from context candidates when direct matches are missing
  - patch chunks must be existing repo files or plausible new test files near affected modules
- Added clear rejections metadata:
  - `rejectedProposedFilesToModify`, `rejectedProposedFilesToCreate` on scope results
  - `rejectedChunks` on patch plans
  - `groundingNotes` and rejected counts on trace events
- If grounding rejections are too high, runs fail with `category=ungrounded_provider_output` instead of silently accepting model hallucinations.
- Report output now includes rejected/un-grounded scope proposals and patch chunks.

**Scope:** `packages/core/src/agent/nodes.ts`, `packages/core/src/state/schema.ts`, and runner tests were updated. `apps/web` and `apps/api` were not modified.

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
  - `codepawl run --repo <path> --task <string> [--dry-run | --write] [--out-dir <path>] [--test-cmd <command>]`
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
| Validation command failure | Run returns failed status and CLI exits non-zero | All six artifacts remain written | Core runner, CLI integration |
| Write safety violation | Write mode aborts before touching files | All six artifacts are written best-effort | Core runner |
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
applied-files.json
```
✅ **PASS** — All 6 required artifacts

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

The run produced all six artifacts while failing with exit `1` when validation was explicitly configured to fail.

Fix:
- Dry-runs without an explicit validation command now use safe placeholder validation.
- The placeholder is recorded as `echo placeholder validation skipped`.
- The generated report labels it as `Placeholder validation`.
- Explicit validation commands still run normally and still fail the run when they exit non-zero.
- Validation failures after a run starts still preserve all six artifacts.
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
.codepawl/runs/run_1780893153729_gksksf/applied-files.json
```

Report verification:
```
**Placeholder validation:** `echo placeholder validation skipped`
```

✅ **PASS** — Review-only RC smoke now exits `0` and produces all six artifacts under the target repo root.

Real-provider validation follow-up (DeepInfra/Nemotron):
- A real-provider dry-run using `OPENPAWL_PROVIDER=openai-compatible` and
  `OPENPAWL_MODEL=nvidia/NVIDIA-Nemotron-3-Super-120B-A12B` now verifies cleanly in Smoke.
- Observed run status: `SUCCESS`.
- Trace `llmCallsCount`: `2` (`scope_analysis`, `patch_plan`).
- `patch-plan.json` validated as valid metadata-only contract output.
- No structured-output retry was needed.
- `validationStatus` was `valid` for provider model responses.
- Observed token cost for this smoke stayed in the single-thousands range; with compact context the `context_pack_created` and `llm_call` prompt metrics should be lower than the prior broad-scan payload.
- Placeholder validation behavior still defaults on dry-run without `--test-cmd`, including real-provider runs.

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
  - `OPENPAWL_MAX_TOKENS=<optional structured-output token cap>`
  - `OPENPAWL_SCOPE_ANALYSIS_MAX_TOKENS=<optional scope_analysis override>`
  - `OPENPAWL_PATCH_PLAN_MAX_TOKENS=<optional patch_plan override>`
- CLI overrides:
  - `--provider mock|openai-compatible`
  - `--model <model>`
- `--include-prompt-metadata`

Behavior:
- `OPENPAWL_PROVIDER` defaults to `mock`.
- `openai-compatible` requires `OPENPAWL_MODEL` and `OPENPAWL_API_KEY`.
- Missing required provider config fails fast before a run starts.
- Real provider requests use chat completions with JSON response format and bounded structured-output token caps.
- Scope and patch-plan outputs are extracted from common model formats and then schema-validated with Zod before use.
- Supported response formats include clean JSON, whitespace around JSON, markdown fenced JSON, and extra text around one safely extractable JSON object.
- Invalid provider output produces a clear validation error and preserves artifacts when the run has started.
- Malformed JSON or schema validation failure triggers one compact structured-output retry with only the expected schema, previous error category/path, and task summary.
- Trace records provider name, model name, request purpose, response-format request status, parse status, validation status, schema validation path, finish reason, content length, redacted content preview on parse/schema errors, and token usage when available.
- Trace does not record API keys, secrets, or full prompt content by default.
- `--include-prompt-metadata` records only redacted prompt counts and character sizes.
- OpenAI-compatible transport does not guarantee schema adherence for every model. Some models may need the structured retry, lower temperature, or a different model with stronger JSON-mode behavior.
- Run reports intentionally keep emoji section headers and `---` separators to match existing CLI-style GitHub-ready markdown formatting.

Provider connectivity smoke:
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

Explicit full-validation variant:
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

### Context compaction and prompt-cost control

Real-provider smoke now sends compact context instead of raw scan dumps.

Behavior:
- Openpawl creates a `ContextPack` for each run from repo scan results.
- `ContextPack` contains task summary, repository root, selected candidate files, compact file summaries, package/workspace hints, test-command hints, safety exclusions, and compact metrics.
- Prompt payloads for `scope_analysis` and `patch_plan` now include `Scope Context Pack` / `Patch Context Pack` and pass `compactContextForPrompt` data.
- Budget caps are enforced:
  - `OPENPAWL_CONTEXT_MAX_FILES` (default `60`)
  - `OPENPAWL_CONTEXT_MAX_BYTES` (default `64_000`)
  - `OPENPAWL_CONTEXT_MAX_CHARS` (default `12_000`)
- CLI equivalents:
  - `--context-max-files`
  - `--context-max-bytes`
  - `--context-max-chars`
- `context_pack_created` trace event records compaction metadata:
  - scanned/candidate/included/omitted counts
  - estimated context bytes/chars
  - compaction reason
  - configured budget
- `llm_call` events record bounded `promptChars` per purpose (`scope_analysis`, `patch_plan`) and token usage when the provider returns it.
- Full prompts are still omitted from trace/report by default; only bounded prompt metrics are recorded.
- Safe response-shape metadata is now tracked as part of structured output diagnostics: `hasContent`, `hasReasoningContent`, `contentLength`, `reasoningContentLength`.

Observed real-provider failure before parse hardening:
- Provider call succeeded with `provider=openai-compatible`.
- Model: `nvidia/NVIDIA-Nemotron-3-Super-120B-A12B`.
- Trace recorded `llmCallsCount: 1`.
- Run failed in `scope_analysis` with `scope_analysis provider response was not valid JSON`.

Hardening fix:
- JSON parsing now handles fenced JSON and single balanced JSON objects embedded in surrounding text.
- Provider-specific fields such as `reasoning_content` are ignored and are not treated as output content.
- OpenAI-compatible output extraction reads only `choices[0].message.content`; when that field is empty and `reasoning_content` is present, categorization is `provider_reasoning_without_content`.
- If JSON cannot be extracted, the error includes provider, model, purpose, parse category, schema validation path when available, finish reason, content length, and a capped redacted content preview.
- If provider output is likely truncated, such as `finish_reason=length` or unbalanced JSON ending mid-object, the parse category is `truncated_output`.
- If `finish_reason=stop` still returns invalid JSON, the parse category remains `malformed_json`.
- If JSON parses but fails schema validation, the run fails clearly without coercing the content into a valid shape.
- A one-time structured retry is recorded as `provider_structured_retry`.
- Real-provider failures from DeepInfra/Nemotron-style outputs that include reasoning-only payloads are now separated from generic non-JSON output with `provider_reasoning_without_content`.

Patch-plan contract hardening:
- `patch_plan` is metadata-only in the current MVP: `rationale` plus up to five `{ type, file, description }` chunks.
- The patch-plan prompt is intentionally short and does not ask for code chunks, diffs, `content`, or `targetContent`.
- Too many chunks fail schema validation instead of being silently accepted.
- Final Zod validation remains strict.
- A narrow audited repair layer accepts only safe aliases:
  - `path` string -> `file`
  - `summary`, `reason`, or `details` string -> `description`
- Repairs are recorded in trace as `provider_schema_repaired`.
- Missing or non-string descriptions still fail with schema errors including `chunks[0].description`.

Verification added:
- Provider config resolution defaults to mock.
- Missing `OPENPAWL_API_KEY` for `openai-compatible` fails clearly.
- OpenAI-compatible client tests use mocked `fetch` only.
- Provider JSON parser tests cover clean JSON, whitespace, fenced JSON, extra text with one extractable object, invalid JSON, and invalid schema.
- Patch-plan schema tests cover valid chunks, missing `description`, non-string `description`, safe alias repair, and trace repair auditing.
- Dry-run validation tests cover placeholder validation without `--test-cmd` and explicit `bun test` failure preserving artifacts.
- Invalid provider-shaped output is covered with a local mock fixture and still writes all six artifacts.
- Existing deterministic mock behavior remains covered.

Known limitations:
- Real provider mode is experimental for v0.
- GitHub Actions do not use a real provider by default.
- No production autonomous coding claim is made.
- Path safety, dry-run default, and explicit `--write` behavior now include safe create-only test-file write constraints.

---

## Dry-Run Mode

In `--dry-run` mode:
- All 9 state machine nodes run
- No files are modified (write operations in `optional_patch_apply` are skipped)
- All 6 artifacts are written to `.codepawl/runs/<run-id>/`
- `patch-plan.json` shows what *would* have been applied

## Write Mode

In `--write` mode:
- `assertWriteSafe()` validates every target path **before** any file is touched
- Disallowed paths abort the entire run with `SafetyViolationError` or are rejected before applying.
- Protected paths include: `.env*`, lockfiles, `.git/`, migrations, `node_modules`, build artifacts, files outside the repo root
- Only new test-file creation chunks are applied; non-test or non-create chunks are rejected.
- If no safe create chunks are available (including empty patch plans), write mode fails immediately.
- No validation runs after a no-op write failure; report and trace artifacts are still exported with failed status.
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

## Context Compaction Limitations

1. No AST-aware semantic memory yet.
2. No production write orchestration beyond write-mode v0 is implemented in this milestone.
3. No `.gitignore` parsing (hardcoded ignore list remains).
4. No retry loop for failed validation; single-pass planning/validation only.

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
