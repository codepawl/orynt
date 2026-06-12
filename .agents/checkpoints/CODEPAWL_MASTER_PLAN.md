# CodePawl Master Plan Dashboard

Last updated: 2026-06-11 (UTC)

## Current Release Status

- **Product:** Openpawl (`codepawl`)
- **Current baseline:** `v0.5.1` (released)
- **Safety posture:** Dry-run default; write mode is gated by approval + safe test-file create policy.
- **Canonical references (no duplicate logs):**
  - [CHANGELOG.md](../../CHANGELOG.md)
  - [README.md](../../README.md)
  - [walkthrough.md](../../walkthrough.md)
  - [docs/ROADMAP.md](../../docs/ROADMAP.md)
  - [docs/PRODUCT.md](../../docs/PRODUCT.md)

## Completed Milestones

- `alpha.8` GitHub trigger UX done.  
  Evidence: `walkthrough.md` trigger hardening and smoke chronology.
- `alpha.9` external installability done.  
  Evidence: install docs and reusable workflow references in `docs/ROADMAP.md`, `README.md`.
- `alpha.10` `@openpawl` mention UX done.  
  Evidence: `docs/ROADMAP.md`, `README.md`.
- `beta.1` approval apply + patch quality eval done.  
  Evidence: `CHANGELOG.md`, `README.md`.
- `v0.1.0-beta.1` tag published with write mode + apply guardrails + deterministic patch-quality harness.  
- `v0.2.0` pre-release closeout reached `TAG_READY`; live GitHub smoke completed in run `27273286439` as documented in `CP-007`.
  Evidence: `CHANGELOG.md`.
- `Live apply smoke` for write path proved:
  - write + validation + branch push + org-policy fallback behavior verified.
  - prior issue-specific failures and recoveries documented in historical notes with run IDs.

## Active Milestone

### `v0.2 Reliability Layer` (tracking starts 2026-06-10)

Goal: improve reliability/trust while preserving current write safety gates (no policy relaxation).

- Priority order is **risk-ordered**.
- For every implementation checkpoint, append to **Checkpoint History** and include pass/fail evidence.
- Keep implementation in this milestone constrained to eval/report/test surfaces; runtime write/apply behavior remains unchanged.

| Risk | Task | Scope | Status | Notes |
|---|---|---|---|---|
| 1 (lowest) | Master-plan governance and tracking | `.agents/checkpoints/CODEPAWL_MASTER_PLAN.md` | **Completed** | Single source of progress updated at each checkpoint. |
| 2 | Expand patch-quality fixtures (24 -> 50, then 100 max) | `packages/cli/src/patch-quality-eval.ts` / `packages/cli/src/__tests__/patch-quality-eval.test.ts` | **Completed** | v0.2 baseline implemented with 50 fixtures grouped by policy pattern. |
| 3 | Add reliability metrics coverage: useful report rate, safe patch rate, validation pass rate, no-safe-chunk rate, irrelevant file touch rate, fallback/manual PR rate | Eval outputs + report schema | **Completed** | v0.2 metrics added to harness and tests; backward-compatible aliases maintained. |
| 4 | Failure-mode report clarity | Eval report and validation summaries | **Completed** | Add machine-readable failure taxonomy and per-fixture reasons (50-fixture pass remains intact). |
| 5 (highest) | Safe-chunk generation reliability for common tasks | Patch planning fixture generation inputs | **Completed** | Improve common-task deterministic chunk quality without weakening existing write gates. |

## Next Milestones

1. `v0.2.1` — Metrics baseline: 50-fixture harness + reliability dashboard fields.
2. `v0.2.2` — Expand to 75–100 fixtures once false-positive/negative rate is stable.
3. `v0.2.3` — Reliability-oriented report reformat + failure taxonomy.
4. `v0.2.4` — Safe chunk generation hardening for frequent task intents. ✅
5. `v0.2.5` — Add regression follow-up for any residual false-positive intent paths.
6. `v0.3` (planned) — Optional retry loop + `.gitignore`-aware repository scanning.

## Decision Log

- Use a single master tracker file in `.agents/` to avoid fragmented status notes.
- Keep all long historical records in `CHANGELOG.md`, `walkthrough.md`, and `docs/ROADMAP.md`.
- Preserve safety gates as non-negotiable constraints:
  - apply only safe chunks
  - safe create-only write policy in beta
  - explicit/grounded validation precedence
- Treat 50 fixtures as the minimum v0.2 baseline and only grow to 100 with stable metrics.
- Do not define reliability progress as complete without checkpointed artifact evidence.

## Validation Log

### Planned Validation (tracking stage)

- Static checks used in this milestone:
  - `bun run typecheck`
  - `bun run test` (or filtered package equivalent)
  - targeted eval run: `bun --filter @codepawl/cli dev -- eval patch-quality --limit 50`
- Required smoke checks for each checkpoint:
  - live apply write smoke on a real run (branch push + validation + org-policy fallback behavior)
  - mention and slash-trigger smoke (issue/PR/comment paths) parity check after any trigger-related docs/process changes
- Required evidence captured per checkpoint:
  - updated master-plan checkpoint entry
  - pass/fail commands + summaries
  - artifact locations (`.codepawl/.../metrics.json`, `.codepawl/.../report.md`)
- Validation log status (CP-005 checkpointed):
  - `bun run typecheck` ✅
  - `cd packages/cli && bun test src/__tests__/patch-quality-eval.test.ts` ✅
  - `cd packages/core && bun test src/__tests__/runner.test.ts` ✅
  - `bun --filter @codepawl/cli dev -- eval patch-quality --out-dir /tmp/codepawl-cp005-eval --limit 50` ✅

## Live Smoke Evidence

- `27225431860` (beta.1): write-run passed validation + branch push; PR creation blocked by org policy; compare/manual fallback path used.
- `27198840237` / `27198935621` and earlier trigger run IDs: apply/mention flow corrections and trigger resolver behavior documented under walkthrough run history.
- `27208458149`, `27208687623`, `27208690487`, `27208692054`: mention/trigger smoke evidence for prior UX and dry-run paths.
- All historical evidence links remain in `CHANGELOG.md` and `walkthrough.md`; do not duplicate full logs here.

## Open Risks

- Expanding fixtures beyond current volume may uncover weak deterministic behavior in edge fixtures that need fixture balancing.
- New metrics can look high while useful behavior is low (metric gaming), so failure taxonomy must remain explicit.
- Org-policy fallback/manual PR rate is environment-dependent; baseline should track trend, not single-run perfection.
- Safe chunk improvements for common intents can regress rare, conservative safety expectations if not gated.

## Backlog

- Add trend dashboard notes for metric deltas between checkpoints.
- Add fixtures for common repository-specific task patterns (monorepo roots, test-framework inference, doc+implementation conflict cases).
- Add migration note and post-v0.2 review: when runtime changes are approved, split work into PR-sized chunks with rollback note.
- Capture run-level decision summaries to speed root-cause review when metrics fail.

## Checkpoint History

### Checkpoint Protocol

- Every checkpoint should append an entry with:
  1) `ID`, `date`, `owner`
  2) changed scope/files
  3) validation commands + results
  4) smoke IDs / artifacts
  5) decision and next checkpoint

### Entries

- `CP-000` (2026-06-10): Baseline state documented; `.agents/checkpoints/CODEPAWL_MASTER_PLAN.md` created.
- `CP-001` (planned): Finalize checkpoint protocol usage; confirm tracker is active dashboard.
- `CP-002` (2026-06-10, completed): Fixture expansion to 50 and expanded expected-metric assertions.
  - Scope: `packages/cli/src/patch-quality-eval.ts`, `packages/cli/src/__tests__/patch-quality-eval.test.ts`
  - Commands:
    - `bun run typecheck` ✅
    - `cd packages/cli && bun test src/__tests__/patch-quality-eval.test.ts` ✅
    - `bun --filter @codepawl/cli dev -- eval patch-quality --out-dir /tmp/codepawl-cp002-eval --limit 50` ✅
  - Results:
    - Live run id: `eval_1781085927943_xo10sd`
    - Fixture count = 50
    - Category coverage = safe-write(20), dry-run(10), unsafe(6), rejected(6), validation-fail(4), grounding-edge(4)
    - v0.2 run result: Passed 50 / 50, Failed 0
    - Artifacts:
      - Metrics: `/tmp/codepawl-cp002-eval/metrics.json`
      - Report: `/tmp/codepawl-cp002-eval/report.md`
  - Decision: CP-002 complete; advance to CP-003 for reliability metrics extension and failure taxonomy.
- `CP-003` (2026-06-10, completed): Add v0.2 reliability metrics to patch-quality eval outputs + assertions.
  - Scope: `packages/cli/src/patch-quality-eval.ts`, `packages/cli/src/__tests__/patch-quality-eval.test.ts`, `.agents/checkpoints/CODEPAWL_MASTER_PLAN.md`
  - Commands:
    - `bun run typecheck`
    - `cd packages/cli && bun test src/__tests__/patch-quality-eval.test.ts`
    - `bun --filter @codepawl/cli dev -- eval patch-quality --out-dir /tmp/codepawl-cp003-eval --limit 50`
  - Results:
    - Run ID: `eval_1781086418947_a96i7w`
    - 50 fixtures executed with 50 passed, 0 failed
    - v0.2 metrics emitted and asserted:
      - `useful_report_rate: 1.00`
      - `safe_patch_rate: 0.48`
      - `validation_pass_rate: 0.60`
      - `no_safe_chunk_rate: 0.08`
      - `irrelevant_file_touch_rate: 0`
      - `fallback_manual_pr_rate: null (not_applicable_for_patch_quality_fixtures)`
    - Artifacts:
      - Metrics: `/tmp/codepawl-cp003-eval/metrics.json`
      - Report: `/tmp/codepawl-cp003-eval/report.md`
  - Failures:
    - None for the 50-fixture v0.2 eval run.
  - Decision: CP-003 complete; advance to `CP-004` for report failure-mode clarity and clearer per-fixture reason formatting.
- `CP-004` (2026-06-10, completed): Add machine-readable failure taxonomy and per-fixture diagnosis details to patch-quality eval report artifacts.
  - Scope: `packages/cli/src/patch-quality-eval.ts`, `packages/cli/src/__tests__/patch-quality-eval.test.ts`, `.agents/checkpoints/CODEPAWL_MASTER_PLAN.md`
  - Commands:
    - `bun run typecheck` ✅
    - `cd packages/cli && bun test src/__tests__/patch-quality-eval.test.ts` ✅
    - `bun --filter @codepawl/cli dev -- eval patch-quality --out-dir /tmp/codepawl-cp004-eval --limit 50` ✅
  - Results:
    - Command exit status: pass
    - Fixture count = 50
    - All fixtures passed (passCount 50 / 50, failCount 0)
    - Failure taxonomy:
      - `safe_patch_missing` = 0
      - `unsafe_patch_allowed` = 0
      - `validation_expected_but_missing` = 0
      - `validation_unexpected` = 0
      - `irrelevant_file_touch` = 0
      - `report_not_useful` = 0
      - `no_safe_chunk_mismatch` = 0
      - `category_expectation_mismatch` = 0
    - Artifacts:
      - Metrics: `/tmp/codepawl-cp004-eval/metrics.json`
      - Report: `/tmp/codepawl-cp004-eval/report.md`
  - Decision: CP-004 complete; advance to `CP-005` (safe-chunk generation reliability for common tasks).
- `CP-005` (2026-06-10, completed): Add common add-tests intent coverage for safe-chunk generation.
  - Scope:
    - `packages/core/src/__tests__/fixtures/mock-llm.json`
    - `packages/core/src/__tests__/runner.test.ts`
    - `packages/cli/src/patch-quality-eval.ts`
    - `packages/cli/src/__tests__/patch-quality-eval.test.ts`
    - `.agents/checkpoints/CODEPAWL_MASTER_PLAN.md`
  - Commands:
    - `bun run typecheck` ✅
    - `cd packages/core && bun test src/__tests__/runner.test.ts` ✅
    - `cd packages/cli && bun test src/__tests__/patch-quality-eval.test.ts` ✅
    - `bun --filter @codepawl/cli dev -- eval patch-quality --out-dir /tmp/codepawl-cp005-eval --limit 50` ✅
  - Results:
    - Run ID: `eval_1781088435509_gpp7rt`
    - Fixtures executed = 50
    - Passed = 50
    - Failed = 0
    - Safe-chunk/common intent path coverage:
      - `parser.test.ts`
      - `parser-regression.test.ts`
      - `cli.spec.ts`
      - `generated.spec.ts`
      - `runtime.unit.test.ts`
      - `__tests__/generic.generated.test.ts` and `safe-write-06` variants
    - Common intent safe-write fixtures:
      - `safe-write-01` through `safe-write-06`
      - Fully passed with `acceptedPatch=true`, `validationPass=true`, zero failure categories
    - Failure taxonomy remained fully clean (`0` for all buckets).
  - Artifacts:
    - Metrics: `/tmp/codepawl-cp005-eval/metrics.json`
    - Report: `/tmp/codepawl-cp005-eval/report.md`
  - Decision: CP-005 complete; continue to broader false-positive triage and readiness for v0.2.1.

- `CP-006` (2026-06-10, completed): v0.2 reliability layer closeout and go/no-go decision.
  - owner: codex
  - Scope:
    - `packages/core/src/__tests__/runner.test.ts`
    - `packages/cli/src/patch-quality-eval.ts`
    - `packages/cli/src/__tests__/patch-quality-eval.test.ts`
    - `CHANGELOG.md`
    - `docs/ROADMAP.md`
    - `.agents/checkpoints/CODEPAWL_MASTER_PLAN.md`
  - Commands + results:
    - `bun run typecheck` ✅
    - `bun run test` ✅
    - `bun --filter @codepawl/cli dev -- eval patch-quality --out-dir /tmp/codepawl-cp006-eval --limit 50` ✅
  - Artifacts:
    - `/tmp/codepawl-cp006-eval/metrics.json`
    - `/tmp/codepawl-cp006-eval/report.md`
  - Run result summary:
    - Run ID: `eval_1781089196697_hap92j`
    - Cases: 50
    - Passed: 50
    - Failed: 0
    - CP-005 artifacts re-checked at:
      - `/tmp/codepawl-cp005-eval/metrics.json`
      - `/tmp/codepawl-cp005-eval/report.md`
  - Result: CP-005 baseline remains non-regressive in 2026-06-10 verification (core runner + patch-quality harness test paths pass).
  - Decision: **GO** for CP-006 closeout.

- `CP-007` (2026-06-10, blocked): v0.2.0 pre-release live smoke and release-readiness closeout.
  - owner: codex
  - Scope:
    - `CHANGELOG.md`
    - `docs/ROADMAP.md`
    - `.agents/checkpoints/CODEPAWL_MASTER_PLAN.md`
    - no source/test edits
  - Commands + results:
    - `bun run typecheck` ✅
    - `bun run test` ✅
    - `bun --filter @codepawl/cli dev -- eval patch-quality --out-dir /tmp/codepawl-cp007-eval --limit 50` ✅
    - `bun --filter @codepawl/cli dev -- run --repo . --task "add unit tests for shared helpers" --write --test-command "echo smoke-ok" --mock-fixture packages/core/src/__tests__/fixtures/mock-llm.json --out-dir /tmp/codepawl-cp007-write-smoke` ✅
    - `gh workflow run openpawl.yml --ref HEAD` ❌
    - `gh auth status` ❌
  - Artifacts:
    - `/tmp/codepawl-cp007-eval/metrics.json`
    - `/tmp/codepawl-cp007-eval/report.md`
    - `/tmp/codepawl-cp007-write-smoke/applied-files.json`
    - `/tmp/codepawl-cp007-write-smoke/patch-plan.json`
    - `/tmp/codepawl-cp007-write-smoke/report.md`
    - `/tmp/codepawl-cp007-write-smoke/run.json`
    - `/tmp/codepawl-cp007-write-smoke/selected-files.json`
    - `/tmp/codepawl-cp007-write-smoke/trace.json`
  - Run result summary:
    - Patch-quality eval ID: `eval_1781089789811_pw198o` (`50/50`, `0` failed)
    - Write smoke ID: `run_1781089801963_u5vppi`
  - Live smoke blockers:
    - `gh workflow run openpawl.yml --ref HEAD`
      - output: `error connecting to api.github.com`
      - date context: 2026-06-10
    - `gh auth status`
      - output:
        - `The token in /home/nxank4/.config/gh/hosts.yml is invalid.`
  - CP-005 core runner behavior confirmation:
    - rechecked via CP-005 evidence at:
      - `/tmp/codepawl-cp005-eval/metrics.json`
      - `/tmp/codepawl-cp005-eval/report.md`
    - confirmed non-regressive against CP-006 validation surfaces in current branch.
  - Decision: **BLOCKED_WITH_REASON** for CP-007 pre-release closeout.
    - Blocker: real GitHub API connectivity/auth prevents executing live dry-run/mention smoke in this environment.

- `CP-007` (2026-06-10, re-run): CP-007 pre-release closeout completed with live GitHub smoke after auth restore.
  - Owner: codex
  - Commands + outputs (re-run):
    - `gh auth status` ✅ now logged in with token on `gh`.
    - `gh workflow run openpawl.yml --ref main` ✅
      - URL/run: `https://github.com/codepawl/codepawl/actions/runs/27273286439`
      - conclusion: `success`
      - JSON summary: status `completed`, conclusion `success`
    - `gh run view 27273286439 --json name,status,conclusion,headBranch,url` ✅
      - name: `Openpawl CI`
      - status: `completed`
      - conclusion: `success`
      - headBranch: `main`
    - `gh run view 27273286439 --json jobs` ✅
      - `Openpawl Agent Run` job: `success`
      - `Unit Tests (core + cli)` job: `success`
    - `gh workflow run openpawl-run.yml --ref main` ❌
      - reason: `HTTP 422: Workflow does not have 'workflow_dispatch' trigger`
  - Artifacts/evidence:
    - Run URL: `https://github.com/codepawl/codepawl/actions/runs/27273286439`
    - Local CP-007 artifacts already in:
      - `/tmp/codepawl-cp007-eval/metrics.json`
      - `/tmp/codepawl-cp007-eval/report.md`
      - `/tmp/codepawl-cp007-write-smoke/applied-files.json`
      - `/tmp/codepawl-cp007-write-smoke/patch-plan.json`
      - `/tmp/codepawl-cp007-write-smoke/report.md`
      - `/tmp/codepawl-cp007-write-smoke/run.json`
      - `/tmp/codepawl-cp007-write-smoke/selected-files.json`
      - `/tmp/codepawl-cp007-write-smoke/trace.json`
  - Decision: **TAG_READY** for CP-007.
    - Condition met: required local verification + `bun run typecheck`/`bun run test` and successful live GitHub workflow run `27273286439`.
    - Remaining note: `openpawl-run.yml` remains non-dispatchable by `gh workflow run`; mention-trigger smoke remains environment/workflow-driven and was not executed via CLI dispatch path.

- `CP-008` (2026-06-11, completed): Post-release external install smoke verification for v0.2.0.
  - Owner: Antigravity
  - Scope:
    - `docs/samples/openpawl.workflow.yml`
    - `.github/workflows/openpawl-run.yml`
    - `docs/OPENPAWL_INSTALL.md`
    - `packages/cli/src/__tests__/workflow-invocation.test.ts`
  - Commands + Validation Results (Temporary Clone):
    - Clean clone check out `v0.2.0`: `git checkout v0.2.0` ✅
    - Dependency install: `bun install` ✅
    - Typecheck: `bun run typecheck` ✅
    - Unit tests: `bun run test` ✅
    - Patch-quality eval smoke: `bun --filter @codepawl/cli dev -- eval patch-quality --out-dir /home/annx9/Code/Personal/temp-clone-cp008/eval-out --limit 50` ✅
      - Run ID: `eval_1781142845699_7v5ely` (Passed: 50, Failed: 0)
    - CLI dry-run smoke: `bun --filter @codepawl/cli dev -- run --repo /home/annx9/Code/Personal/temp-clone-cp008/smoke-target --task "add tests for auth helpers" --dry-run --mock-fixture packages/core/src/__tests__/fixtures/mock-llm.json --test-cmd "echo ok"` ✅
      - Run ID: `run_1781142892375_iytud5` (Status: SUCCESS, Readiness: ready)
  - Artifacts:
    - Eval Metrics: `/home/annx9/Code/Personal/temp-clone-cp008/eval-out/metrics.json`
    - Eval Report: `/home/annx9/Code/Personal/temp-clone-cp008/eval-out/report.md`
    - Smoke artifacts folder: `/home/annx9/Code/Personal/temp-clone-cp008/smoke-target/.codepawl/runs/run_1781142892375_iytud5/`
  - External Install Verdict:
    - **FAIL** on original `v0.2.0` tag. Because target/external repositories do not have `@codepawl/cli` package, executing `bun --filter @codepawl/cli` directly inside target workspace fails immediately.
    - **PASS** with post-release patch. Modified the sample workflow and reusable workflow to clone `codepawl` to a subdirectory (`.openpawl-src`), execute Openpawl there targeting the target repository's absolute path, and automatically clean up `.openpawl-src` to avoid git history pollution.
  - Follow-up Fix Commit: `024d61b` (pushed to main, tag untouched)

- `CP-009` (2026-06-11, completed): Release v0.2.1 patch release for the external installability fix.
  - Owner: Antigravity
  - Scope:
    - `packages/core/package.json`
    - `packages/shared/package.json`
    - `packages/cli/package.json`
    - `README.md`
    - `docs/ROADMAP.md`
    - `CHANGELOG.md`
    - `docs/samples/openpawl.workflow.yml`
    - `.github/workflows/openpawl-run.yml`
    - `docs/OPENPAWL_INSTALL.md`
  - Commands + Validation Results (Temporary Clone):
    - Created target workspace repo, cloned `codepawl` to `.openpawl-src`, ran `bun install`, `bun run typecheck`, and executed agent dry-run smoke targeting parent directory:
      - `bun --cwd .openpawl-src --filter @codepawl/cli dev -- run --repo /home/annx9/Code/Personal/temp-install-smoke --task "add tests for auth helpers" --dry-run --mock-fixture /home/annx9/Code/Personal/temp-install-smoke/.openpawl-src/packages/core/src/__tests__/fixtures/mock-llm.json --test-cmd "echo ok"` ✅
      - Verdict: **PASS** (10 steps, status: SUCCESS, Readiness: ready)
    - Patch-quality eval on 50 fixtures: `bun --filter @codepawl/cli dev -- eval patch-quality --limit 50` ✅ (Passed: 50, Failed: 0)
    - Main branch verification: `bun run typecheck && bun run test` ✅
  - Artifacts:
    - Smoke artifacts: `temp-install-smoke/.codepawl/runs/run_1781143205927_zuj1zy/` (verified and cleaned up)
    - Tag: `v0.2.1`
    - Tag Hash: `0e13515258a150e73435f80ea1a0bffb1d8c61aa`
    - Commit Hash: `46c6ba4c9a2e114c10a722ee11a7430e46395252`
    - GitHub Release URL: `https://github.com/codepawl/codepawl/releases/tag/v0.2.1`
  - Known issues/caveats documented:
    - Updated v0.2.0 release notes on GitHub with a known-issue note pointing users to v0.2.1.

- `CP-010` (2026-06-11, completed): Post-release integrity audit for v0.2.1.
  - Owner: Antigravity
  - Scope: Post-release tag, release, and metadata consistency audit.
  - Audit Results:
    - Tag Target Commit: `46c6ba4c9a2e114c10a722ee11a7430e46395252` ✅
    - Tag Object Hash: `0e13515258a150e73435f80ea1a0bffb1d8c61aa` ✅
    - Main HEAD Commit: `c46e4c29c87895e69e20014765d70f8073eb4cf1` ✅
    - CP-009 Tag Inclusion: Confirmed CP-009 checkpoint is **not** inside the `v0.2.1` tag target commit (`46c6ba4`), but exists immediately after on `main` (in commit `c46e4c2`). This is normal and correct. ✅
    - GitHub Release Notes: Confirmed `v0.2.0` release notes point to `v0.2.1` as a known-issue update, and `v0.2.1` contains the installability notes. ✅
    - Metadata Consistency: Package versions, README, CHANGELOG, ROADMAP, and workflow default references are all aligned to `v0.2.1`. ✅
  - Verdict: **PASS**. No follow-up release or corrections are needed.

- `CP-011` (2026-06-11, completed): Release v0.2.2 trigger command parity and reusable workflow patch.
  - Owner: Antigravity
  - Scope:
    - `packages/cli/src/openpawl-trigger.ts`
    - `packages/cli/src/__tests__/openpawl-trigger.test.ts`
    - `.github/workflows/openpawl-run.yml`
    - `packages/core/package.json`
    - `packages/shared/package.json`
    - `packages/cli/package.json`
    - `README.md`
    - `docs/ROADMAP.md`
    - `CHANGELOG.md`
    - `docs/samples/openpawl.workflow.yml`
    - `docs/OPENPAWL_INSTALL.md`
  - Commands + Validation Results:
    - Main branch validation: `bun run typecheck && bun run test` ✅
    - Parser trigger test suite resolves slash commands successfully: `/openpawl plan`, `/openpawl fix failing tests` ✅
    - Created and published GitHub Release: `v0.2.2` ✅
  - Artifacts:
    - Tag: `v0.2.2`
    - Tag Hash: `d82f633569bc49f774616d58487ae2403a4feb84`
    - Commit Hash: `e9b146d510990bbc52d8b0ddd9aaefd15fc14078`
    - GitHub Release URL: `https://github.com/codepawl/codepawl/releases/tag/v0.2.2`

- `CP-012` (2026-06-11, completed): Post-release integrity and safety audit for v0.2.2.
  - Owner: Antigravity
  - Scope: Post-release tag, release, workflow inputs, trigger parser, and safety boundaries audit.
  - Audit Results:
    - Tag Target Commit: `e9b146d510990bbc52d8b0ddd9aaefd15fc14078` ✅
    - Tag Object Hash: `d82f633569bc49f774616d58487ae2403a4feb84` ✅
    - Main HEAD Commit: `f7ca8773211e54270dc2617716167a8eeb86283d` ✅
    - Safety Gates Audit: Confirmed that `workflow_dispatch` write mode cannot bypass write safety checks. The core `assertWriteSafe` checks run before any write operations, and only create chunks of allowed test files under test paths are created. Existing files cannot be modified or overwritten. ✅
    - Parity Audit: Confirmed that slash and mention command parity only adds dry-run support for `plan` and `fix failing tests`. ✅
    - Metadata & Docs Consistency: Package versions (`0.2.2`), README, CHANGELOG, ROADMAP, installation docs, and workflow examples are all aligned to `v0.2.2`. ✅
  - Verdict: `PASS_NO_FOLLOWUP_RELEASE`

- `CP-013` (2026-06-11, completed): Plan & Implement v0.3: Repository scanning reliability with `.gitignore` / `.openpawl-src` awareness and optional validation retry-loop.
  - Owner: Antigravity
  - Scope:
    - `packages/core/src/safety.ts`
    - `packages/core/src/gitignore.ts`
    - `packages/core/src/agent/nodes.ts`
    - `packages/core/src/runner.ts`
    - `packages/core/src/state/schema.ts`
    - `packages/cli/src/openpawl-config.ts`
    - `packages/cli/src/bin.ts`
    - `packages/core/src/providers/llm.ts`
  - Verification Results:
    - Typecheck: `bun run typecheck` passed cleanly across all packages. ✅
    - Unit/Integration Tests: `bun run test` passed (222/222 passed) with new unit tests for gitignore parsing/matching and runner retry loops. ✅
    - Patch Quality Harness: `bun --filter @codepawl/cli dev -- eval patch-quality --limit 50` successfully completed with a 100% pass rate (50/50 cases passed) and zero regressions on release safety boundaries. ✅

- `CP-014` (2026-06-11, completed): v0.3 scope audit after CP-013 implementation.
  - Owner: Antigravity
  - Verdict: `V0_3_READY`
  - Audit Results:
    - Scope Verification: Confirmed that v0.3 scope (.gitignore-aware repository scanning, exclusion of .openpawl-src/.git/node_modules/lockfiles/secrets/generated artifacts, and optional bounded validation retry-loop design) was fully implemented in CP-013. ✅
    - Mock Match Safety: Confirmed that the mock provider rule match issue was resolved in CP-013 by ignoring the serialized context block in MockLlmProvider pattern matching, thus preventing regressions in existing dry-run tests. ✅
    - Verification Commands: Verified that typecheck, global test suites, and 50-fixture patch-quality evaluation harness pass with 100% success rate. ✅
    - Regression Risks Audit: Confirmed that write safety gates, approval/apply policies, validation precedence, unsafe write rejection, and beta create-only guardrails were preserved intact and not relaxed. ✅
  - Next Recommended Checkpoint: `CP-015` for v0.3.0 release packaging and tagging.

- `CP-015` (2026-06-11, completed): v0.3.0 release packaging, tagging, and GitHub release.
  - Owner: Antigravity
  - Scope: Commit all v0.3 files, bump package versions, update CHANGELOG/ROADMAP/README docs to v0.3.0, tag, and publish.
  - Release Details:
    - Release Commit Hash: `4bf33110aeb04d5d617e2673eab2c8c5c31ccd00` ✅
    - Tag Object Hash: `f8a9777df64eabebf90218055a6832c6adbad3ab` ✅
    - GitHub Release URL: `https://github.com/codepawl/codepawl/releases/tag/v0.3.0` ✅
    - Validation Status: Typecheck, global tests, and patch-quality eval pass. ✅

- `CP-016` (2026-06-11, completed): post-release reproducibility audit for v0.3.0.
  - Owner: Antigravity
  - Verdict: `PASS_NO_FOLLOWUP_RELEASE`
  - Audit Results:
    - Reproducibility: Confirmed that a clean local clone of `v0.3.0` compiles, runs typecheck, passes the complete unit/integration test suite, and passes the 50-fixture patch-quality harness with 100% success rate. ✅
    - `.gitignore` Scanning Verification: Verified that `.gitignore` parsing, stack-matching, and file exclusions function as expected, as covered by robust unit and integration tests. ✅
    - Validation Retries: Confirmed that validation retries are disabled by default (default limit `0`), bounded when enabled, and perform clean workspace file cleanups on failure. ✅
    - Safety Boundary: Confirmed that write safety gates, approval/apply policies, validation precedence, unsafe write rejection, and beta create-only guardrails were preserved intact and not relaxed. ✅

- `CP-018` (2026-06-11, completed): v0.4 scope audit after CP-017 trace/evidence foundation work.
  - Owner: codex
  - Verdict: `PARTIAL_SCOPE_ONLY`
  - Scope audited:
    - `packages/core/src/state/evidence.ts`
    - `packages/core/src/agent/nodes.ts`
    - `packages/core/src/runner.ts`
    - `packages/core/src/__tests__/runner.test.ts`
    - `packages/core/src/index.ts`
    - existing artifact surfaces for `run.json`, `trace.json`, `selected-files.json`, `patch-plan.json`, `applied-files.json`, `metrics.json`, and `report.md`
    - release/user docs: `README.md`, `CHANGELOG.md`, `docs/ROADMAP.md`
  - Git state:
    - CP-017 changes are present in the working tree but are not committed.
    - `packages/core/src/state/evidence.ts` is untracked at audit time.
    - Modified files at audit time: `packages/core/src/__tests__/runner.test.ts`, `packages/core/src/agent/nodes.ts`, `packages/core/src/index.ts`, `packages/core/src/runner.ts`.
  - Commands + results:
    - `git status --short && git diff --stat && git log --oneline -10` ✅
    - `bun run typecheck` ✅
      - 4/4 package typechecks successful.
    - `bun run test` ✅
      - turbo reported 5/5 tasks successful.
      - core suite: 145 tests passed.
      - cli suite: 185 tests passed.
    - `bun --filter @codepawl/cli dev -- eval patch-quality --out-dir /tmp/codepawl-cp018-eval --limit 50` ✅
      - Run ID: `eval_1781147648366_ungfxg`
      - Cases: 50
      - Passed: 50
      - Failed: 0
    - `bun --filter @codepawl/cli dev -- run --repo . --task "review current repository changes" --dry-run --test-command "echo cp018-smoke-ok" --mock-fixture packages/core/src/__tests__/fixtures/mock-llm.json` ✅
      - Run ID: `run_1781147648370_6o1gg6`
      - Status: success
      - Readiness: ready
      - Artifacts written under `.codepawl/runs/run_1781147648370_6o1gg6/`
    - Smoke `run.json` schema check with `RunArtifactSchema.parse(...)` ✅
  - Artifacts:
    - Patch-quality metrics: `/tmp/codepawl-cp018-eval/metrics.json`
    - Patch-quality report: `/tmp/codepawl-cp018-eval/report.md`
    - Smoke report: `.codepawl/runs/run_1781147648370_6o1gg6/report.md`
    - Smoke trace: `.codepawl/runs/run_1781147648370_6o1gg6/trace.json`
    - Smoke run artifact: `.codepawl/runs/run_1781147648370_6o1gg6/run.json`
    - Smoke patch plan: `.codepawl/runs/run_1781147648370_6o1gg6/patch-plan.json`
    - Smoke selected files: `.codepawl/runs/run_1781147648370_6o1gg6/selected-files.json`
    - Smoke applied files: `.codepawl/runs/run_1781147648370_6o1gg6/applied-files.json`
  - Audit findings:
    - CP-017 establishes a useful foundation by adding a strict `RunArtifactSchema`, exporting it from core, validating normal report-export `run.json`, validating aborted-run `run.json`, and adding runner tests that parse `run.json`.
    - v0.4 scope is not complete because schema validation currently covers `run.json` only. `trace.json`, `patch-plan.json`, `selected-files.json`, `applied-files.json`, eval `metrics.json`, and `report.md` remain artifact conventions rather than schema-versioned evidence contracts.
    - No evidence was found that write safety gates, approval/apply policy, validation precedence, unsafe write rejection, beta create-only guardrails, `.gitignore` scanning, or bounded retry behavior were relaxed by the CP-017 working-tree changes.
  - Remaining artifact/schema gaps for `CP-019`:
    - Add explicit schema/version contracts for `trace.json`, `patch-plan.json`, `selected-files.json`, `applied-files.json`, and patch-quality `metrics.json`.
    - Add cross-artifact consistency checks: run ID, mode, success/error state, validation decision, readiness, write summary, and artifact timestamps where applicable.
    - Add failure-path schema coverage for validation failure, readiness rejection, provider JSON failure, unsafe write rejection, and bounded validation retry exhaustion.
    - Decide whether `report.md` remains human-only or gains a machine-readable front matter/summary block.
    - Track schema versions/migration expectations before calling v0.4 complete.
  - Next checkpoint: `CP-019` should convert the CP-017 foundation into complete artifact evidence contracts without changing runtime write/apply behavior.

- `CP-019` (2026-06-11, completed): schema-backed artifact contract for v0.4 Trace/Evidence Layer.
  - Owner: codex
  - Verdict: `V0_4_CONTRACT_READY`
  - Scope:
    - `packages/core/src/state/evidence.ts`
    - `packages/core/src/agent/nodes.ts`
    - `packages/core/src/runner.ts`
    - `packages/core/src/index.ts`
    - `packages/core/src/__tests__/runner.test.ts`
    - `packages/cli/src/patch-quality-eval.ts`
    - `packages/cli/src/__tests__/patch-quality-eval.test.ts`
    - `README.md`
    - `CHANGELOG.md`
    - `docs/ROADMAP.md`
  - Git state:
    - `packages/core/src/state/evidence.ts` is now tracked intent (`A`) rather than unknown.
    - No tag was created.
  - Contract changes:
    - Added `schemaVersion: "1"` to generated machine-readable artifacts:
      - `run.json`
      - `trace.json`
      - `patch-plan.json`
      - `selected-files.json`
      - `applied-files.json`
      - patch-quality `metrics.json`
    - Added Zod schemas for run, trace, patch-plan, selected-files, applied-files, patch-quality metrics, and a combined run artifact set.
    - Added cross-artifact consistency checks for run ID alignment, trace ID/event correlation, write summary counts, and applied-file summaries.
    - Kept `report.md` human-readable only and documented that decision in `README.md`; no machine-readable Markdown front matter was added.
  - Safety boundary audit:
    - No write safety gates were relaxed.
    - Approval/apply policy was not changed.
    - Validation precedence was not changed.
    - Unsafe write rejection and beta create-only guardrails were not changed.
    - `.gitignore` scanning and bounded retry behavior were not changed.
  - Commands + results:
    - `git status --short` ✅
      - showed `A packages/core/src/state/evidence.ts`
    - `bun run typecheck` ✅
      - 4/4 package typechecks successful.
    - `bun run test` ✅
      - turbo reported 5/5 tasks successful.
      - core suite: 145 tests passed.
      - cli suite: 185 tests passed.
    - `bun --filter @codepawl/cli dev -- eval patch-quality --out-dir /tmp/codepawl-cp019-eval-final --limit 50` ✅
      - Run ID: `eval_1781148264062_u5riw5`
      - Cases: 50
      - Passed: 50
      - Failed: 0
      - `metrics.json` parsed with `PatchQualityEvalMetricsArtifactSchema`.
    - `bun --filter @codepawl/cli dev -- run --repo . --task "review current repository changes" --dry-run --test-command "echo cp019-smoke-ok" --mock-fixture packages/core/src/__tests__/fixtures/mock-llm.json --out-dir /tmp/codepawl-cp019-dry-run-smoke-final` ✅
      - Run ID: `run_1781148263988_kkbvb2`
      - Status: success
      - Readiness: ready
      - All machine-readable artifacts parsed with `RunArtifactSetSchema`.
    - `bun --filter @codepawl/cli dev -- run --repo . --task "write a poem about repo maintenance" --write --test-command "echo cp019-failure-smoke" --mock-fixture packages/core/src/__tests__/fixtures/mock-llm.json --out-dir /tmp/codepawl-cp019-failure-smoke-final` ✅ expected non-zero failure
      - Run ID: `run_1781148264258_z2dd91`
      - Status: failed
      - Readiness: unsupported
      - Provider calls: 0
      - All machine-readable artifacts parsed with `RunArtifactSetSchema`.
  - Artifacts:
    - Eval metrics: `/tmp/codepawl-cp019-eval-final/metrics.json`
    - Eval report: `/tmp/codepawl-cp019-eval-final/report.md`
    - Dry-run smoke artifacts: `/tmp/codepawl-cp019-dry-run-smoke-final/`
    - Failure smoke artifacts: `/tmp/codepawl-cp019-failure-smoke-final/`
  - Remaining gaps:
    - v0.4 is not declared complete by this checkpoint.
    - Backward-compatibility readers for pre-schemaVersion artifacts are not yet implemented; schemas intentionally validate the new generated contract.
    - Release packaging/tagging is explicitly deferred.
  - Next checkpoint: `CP-020` should audit v0.4 readiness and decide whether the contract is sufficient for release docs/package preparation, without creating a tag unless separately requested.

- `CP-020` (2026-06-11, completed): v0.4.0 release readiness audit, packaging, and tagging gate.
  - Owner: codex
  - Verdict: `V0_4_RELEASE_READY`
  - Scope:
    - Commit CP-017 through CP-019 Trace/Evidence Layer source, tests, docs, and release metadata.
    - Bump Openpawl package versions to `0.4.0`.
    - Update README, CHANGELOG, ROADMAP, install docs, reusable workflow default ref, and sample workflow ref for `v0.4.0`.
  - Release contents:
    - Schema-backed machine-readable artifacts with `schemaVersion: "1"`:
      - `run.json`
      - `trace.json`
      - `patch-plan.json`
      - `selected-files.json`
      - `applied-files.json`
      - patch-quality `metrics.json`
    - Exported Zod schemas from `@codepawl/core`.
    - Cross-artifact consistency checks for run IDs, trace IDs/events, and write/apply summaries.
    - `report.md` remains human-readable Markdown only.
  - Safety boundary audit:
    - No write safety gates were relaxed.
    - Approval/apply policy was not changed.
    - Validation precedence was not changed.
    - Unsafe write rejection and beta create-only guardrails were not changed.
    - `.gitignore` scanning and bounded retry behavior were not changed.
  - Commands + results:
    - `bun run typecheck` ✅
      - 4/4 package typechecks successful.
    - `bun run test` ✅
      - turbo reported 5/5 tasks successful.
      - core suite: 145 tests passed.
      - cli suite: 185 tests passed.
    - `bun --filter @codepawl/cli dev -- eval patch-quality --out-dir /tmp/codepawl-cp020-eval --limit 50` ✅
      - Run ID: `eval_1781148491980_znxa9c`
      - Cases: 50
      - Passed: 50
      - Failed: 0
      - `metrics.json` parsed with `PatchQualityEvalMetricsArtifactSchema`.
    - `bun --filter @codepawl/cli dev -- run --repo . --task "review current repository changes" --dry-run --test-command "echo cp020-smoke-ok" --mock-fixture packages/core/src/__tests__/fixtures/mock-llm.json --out-dir /tmp/codepawl-cp020-dry-run-smoke` ✅
      - Run ID: `run_1781148491983_fkacpd`
      - Status: success
      - Readiness: ready
      - All machine-readable artifacts parsed with `RunArtifactSetSchema`.
    - `bun --filter @codepawl/cli dev -- run --repo . --task "write a poem about repo maintenance" --write --test-command "echo cp020-failure-smoke" --mock-fixture packages/core/src/__tests__/fixtures/mock-llm.json --out-dir /tmp/codepawl-cp020-failure-smoke` ✅ expected non-zero failure
      - Run ID: `run_1781148492001_khqk2p`
      - Status: failed
      - Readiness: unsupported
      - Provider calls: 0
      - All machine-readable artifacts parsed with `RunArtifactSetSchema`.
  - Artifacts:
    - Eval metrics: `/tmp/codepawl-cp020-eval/metrics.json`
    - Eval report: `/tmp/codepawl-cp020-eval/report.md`
    - Dry-run smoke artifacts: `/tmp/codepawl-cp020-dry-run-smoke/`
    - Failure smoke artifacts: `/tmp/codepawl-cp020-failure-smoke/`
  - Release action:
    - Commit, annotated tag `v0.4.0`, push, and GitHub Release publication are authorized by this checkpoint after git status is clean.
  - Caveats:
    - No npm/package publish in this checkpoint.
    - Backward-compatible readers for pre-`schemaVersion` artifacts are not included; generated artifacts use the v1 contract.

- `CP-021` (2026-06-11, completed): post-release reproducibility and artifact-compatibility audit for v0.4.0.
  - Owner: codex
  - Verdict: `PASS_NO_FOLLOWUP_RELEASE`
  - Release/tag audit:
    - `git rev-list -n 1 v0.4.0`: `f5d9a49f390f27bdf41325adeb5a9c57d4fe5454`
    - `git rev-parse v0.4.0`: `dde8fc3acc690cbe23f3b13417e9fad9e25899b2`
    - GitHub Release URL: `https://github.com/codepawl/codepawl/releases/tag/v0.4.0`
    - GitHub Release state: not draft, not prerelease.
  - Clean clone:
    - Location: `/tmp/codepawl-cp021-clone`
    - Checked out tag: `v0.4.0`
    - HEAD: `f5d9a49f390f27bdf41325adeb5a9c57d4fe5454`
    - Tag object: `dde8fc3acc690cbe23f3b13417e9fad9e25899b2`
    - `git status --short` after audit: clean.
  - Commands + results:
    - `bun install` ✅
      - Initial sandbox run needed explicit `/tmp` Bun paths and network escalation for missing registry packages.
      - Final install succeeded in the clean clone.
    - `bun run typecheck` ✅
      - 4/4 package typechecks successful.
    - `bun run test` ✅
      - turbo reported 5/5 tasks successful.
      - core suite: 145 tests passed.
      - cli suite: 77 tests passed in the clean clone.
    - `bun --filter @codepawl/cli dev -- eval patch-quality --out-dir /tmp/codepawl-cp021-eval --limit 50` ✅
      - Run ID: `eval_1781149455465_s609qo`
      - Cases: 50
      - Passed: 50
      - Failed: 0
      - `metrics.json` parsed with `PatchQualityEvalMetricsArtifactSchema`.
    - `bun --filter @codepawl/cli dev -- run --repo . --task "review current repository changes" --dry-run --test-command "echo cp021-smoke-ok" --mock-fixture packages/core/src/__tests__/fixtures/mock-llm.json --out-dir /tmp/codepawl-cp021-dry-run-smoke` ✅
      - Run ID: `run_1781149455462_g3eioc`
      - Status: success
      - Readiness: ready
      - All machine-readable artifacts parsed with `RunArtifactSetSchema`.
    - `bun --filter @codepawl/cli dev -- run --repo . --task "write a poem about repo maintenance" --write --test-command "echo cp021-failure-smoke" --mock-fixture packages/core/src/__tests__/fixtures/mock-llm.json --out-dir /tmp/codepawl-cp021-failure-smoke` ✅ expected non-zero failure
      - Run ID: `run_1781149455486_i14pek`
      - Status: failed
      - Readiness: unsupported
      - Provider calls: 0
      - All machine-readable artifacts parsed with `RunArtifactSetSchema`.
  - Artifact compatibility audit:
    - Generated `v0.4.0` artifacts conform to `schemaVersion: "1"`.
    - Runtime artifact read path found: `codepawl trace --input <trace.json>`.
    - The trace reader uses structural JSON parsing and does not require `schemaVersion`.
    - A legacy trace fixture without `schemaVersion` rendered successfully through `codepawl trace`.
    - No runtime readers were found for old `run.json`, `patch-plan.json`, `selected-files.json`, `applied-files.json`, or eval `metrics.json`; references are generation/tests/docs only.
    - Result: old artifact compatibility is non-blocking; no `v0.4.1` compatibility patch required.
  - Documentation audit:
    - README, CHANGELOG, ROADMAP, workflow refs, and release notes align with `v0.4.0`.
    - `docs/OPENPAWL_INSTALL.md` had stale reusable-workflow examples pointing to `v0.3.0`; corrected on `main` after the audit. This does not affect the `v0.4.0` tag behavior or require a follow-up release.
  - Safety boundary audit:
    - No write safety gates were relaxed.
    - Approval/apply policy was not changed.
    - Validation precedence was not changed.
    - Unsafe write rejection and beta create-only guardrails were not changed.
    - `.gitignore` scanning and bounded retry behavior were not changed.
  - Release action:
    - No new tag created.
    - No npm/package publish.
    - No follow-up release required.






### CP-022: v0.5 Evidence UX Layer

- Date: 2026-06-11
- Verdict: V0_5_UX_READY
- Scope: Added presentation-only Evidence Summary and Failure Summary UX for `report.md`; preserved artifact JSON schemaVersion `"1"` and did not change write-safety, approval/apply policy, validation precedence, unsafe write rejection, beta create-only guardrails, `.gitignore` scanning, bounded retry behavior, or trace legacy compatibility.
- Implementation evidence:
  - `report.md` now starts with compact evidence derived from existing run, trace, selected-files, patch-plan, applied-files, validation, readiness, and write evidence.
  - Failure reports include normalized presentation-only categories: readiness, validation, write-policy, validation-unavailable, provider-output, and runtime failures.
  - GitHub issue/PR comments now prepend run ID, Actions URL, artifact name, artifact directory, report path, and trace path when available.
  - Existing detailed report sections remain below the summary; report remains human-readable Markdown with no machine-readable front matter.
  - Secret-shaped report text is redacted before display in summaries/comments/report details.
- Test coverage added/updated:
  - Success dry-run Evidence Summary.
  - Readiness failure / no-provider-call Failure Summary.
  - Validation failure category.
  - Write-policy failure category.
  - Raw prompt/secret leakage prevention in report output.
- Validation evidence:
  - `bun run typecheck`: pass.
  - `bun run test`: pass.
  - `bun --filter @codepawl/cli dev -- eval patch-quality --limit 50`: pass, 50/50, eval `eval_1781150283333_4bdbhq`.
  - Dry-run smoke: pass, run `run_1781150289105_d5ewzc`, artifacts in `/tmp/codepawl-cp022-dry-run-smoke` schema-valid with Evidence Summary.
  - Expected-failure smoke: expected exit 1, run `run_1781150293514_03zk06`, readiness `unsupported`, artifacts in `/tmp/codepawl-cp022-failure-smoke` schema-valid with Failure Summary.
- Next checkpoint: CP-023 should audit v0.5 release readiness without changing artifact schema v1 or safety behavior.

### CP-023: v0.5.0 Evidence UX release readiness audit

- Date: 2026-06-11
- Verdict: V0_5_RELEASE_READY
- Scope: Audited CP-022 Evidence UX Layer for v0.5.0 release readiness without bumping package versions, creating a tag, changing artifact JSON schemaVersion `"1"`, or relaxing write safety gates, approval/apply policy, validation precedence, unsafe write rejection, beta create-only guardrails, `.gitignore` scanning, bounded retry behavior, or trace legacy compatibility.
- Audit evidence:
  - Success dry-run reports include `## Evidence Summary`, `schemaVersion` display, artifact links, and `Failure category: none`.
  - Readiness failure reports include `## Evidence Summary`, `### Failure Summary`, `readiness_blocked`, and provider-call count `0`.
  - Validation failure reports are covered by runner tests and include `### Failure Summary` with `validation_failed`.
  - Write-policy failure reports are covered by runner tests and include `write_policy_blocked`.
  - Report/comment summaries do not include raw prompts, full file contents, unbounded logs, or secret-shaped tokens; report details redact secret-shaped task, rationale, validation output, error, and risk-note text.
  - GitHub workflow comments include run ID, Actions URL, artifact name, artifact directory, report path, and trace path when available.
  - Release-readiness fix: Evidence Summary artifact paths now use the actual run output directory, including custom `--out-dir` locations.
- Local validation evidence:
  - `bun run typecheck`: pass.
  - `bun run test`: pass.
  - `bun --filter @codepawl/cli dev -- eval patch-quality --limit 50`: pass, 50/50, eval `eval_1781150573123_by8z9m`.
  - Dry-run smoke: pass, run `run_1781150577063_y9yv11`, artifacts in `/tmp/codepawl-cp023-final-dry-run-smoke` schema-valid with Evidence Summary and actual artifact paths.
  - Expected-failure smoke: expected exit 1, run `run_1781150582411_2e880u`, readiness `unsupported`, artifacts in `/tmp/codepawl-cp023-final-failure-smoke` schema-valid with Failure Summary and actual artifact paths.
- Live GitHub workflow smoke:
  - Blocked by local GitHub CLI auth: `gh auth status` reports the active `github.com` token for `nxank4` is invalid.
  - No workflow dispatch was attempted after the auth failure. This is an environment/auth blocker, not a code readiness blocker.
- Next checkpoint: CP-024 should bump versions and prepare v0.5.0 release/tag only after live GitHub workflow smoke can be run with valid auth, or explicitly accept the documented auth blocker.

### CP-024: v0.5.0 live GitHub UX smoke and release packaging

- Date: 2026-06-11
- Verdict: BLOCKED_WITH_REASON
- Blocker: Live GitHub release gates cannot run because GitHub CLI is not authenticated in this environment.
  - `gh auth status`: failed with `You are not logged into any GitHub hosts. To log in, run: gh auth login`.
  - `gh repo view codepawl/codepawl --json nameWithOwner,defaultBranchRef,url`: failed with `To get started with GitHub CLI, please run: gh auth login`.
  - Because `gh repo view` does not work, no `workflow_dispatch` dry-run smoke was triggered and no GitHub comment/report evidence could be verified live.
- Repository state before release gate:
  - Branch: `main`.
  - Tracking: `main...origin/main [ahead 1]` at inspection time, with CP-023 commit `faa052f` local and not yet confirmed pushed.
  - Remote: `origin git@github.com:codepawl/codepawl.git`.
- Local validation evidence:
  - `bun run typecheck`: pass.
  - `bun run test`: pass.
  - `bun --filter @codepawl/cli dev -- eval patch-quality --limit 50`: pass, 50/50, eval `eval_1781150781021_edco1z`.
- Release actions intentionally not taken:
  - No package version bump to `0.5.0` because the live GitHub smoke gate did not pass.
  - No annotated tag `v0.5.0` created.
  - No tag pushed.
  - No GitHub Release published.
  - No npm/package publish.
- Safety boundaries preserved:
  - Artifact JSON schemaVersion `"1"` compatibility unchanged.
  - Write safety gates unchanged.
  - Approval/apply policy unchanged.
  - Validation precedence unchanged.
  - Unsafe write rejection and beta create-only guardrails unchanged.
  - `.gitignore` scanning unchanged.
  - Bounded retry behavior unchanged.
  - Trace legacy compatibility unchanged.
- Resume instructions:
  - Authenticate GitHub CLI with an account that can access `codepawl/codepawl`.
  - Re-run `gh auth status` and `gh repo view codepawl/codepawl --json nameWithOwner,defaultBranchRef,url`.
  - Push local CP-023/CP-024 commits to `main` if still ahead.
  - Trigger the workflow_dispatch dry-run smoke and verify run URL, run ID, conclusion, uploaded artifact name, report/comment Evidence Summary, Actions URL, artifact path, report path, trace path, and redaction of prompt/secret/env/log content.
  - Only after live smoke passes, bump package versions to `0.5.0`, update release docs, commit, push, create annotated tag `v0.5.0`, push tag, and publish the GitHub Release.

#### CP-024 push addendum

- Push after checkpoint: `git push origin main` succeeded, updating `origin/main` from `2104951` to `5c5734c`.
- Remote release gate remains blocked because GitHub CLI auth is still unavailable for `gh repo view`, `workflow_dispatch`, comment inspection, tag push through release automation, and GitHub Release publication.

#### CP-024 follow-up

- Date: 2026-06-11
- Verdict: TAG_READY
- Scope:
  - Rechecked GitHub CLI auth and repository access.
  - Ran live `workflow_dispatch` dry-run smoke from pushed `main`.
  - Added a presentation-only GitHub Actions URL row to `report.md` Evidence Summary because the first workflow-dispatch smoke produced no issue/PR comment and the artifact report did not yet include the Actions URL.
  - Bumped Openpawl package/docs/workflow refs to `0.5.0`.
- GitHub access evidence:
  - `gh auth status`: authenticated as `nxank4` with `repo` scope.
  - `gh repo view codepawl/codepawl --json nameWithOwner,defaultBranchRef,url`: passed for `codepawl/codepawl`, default branch `main`.
- Local validation evidence before release bump:
  - `bun run typecheck`: pass.
  - `bun run test`: pass.
  - `bun --filter @codepawl/cli dev -- eval patch-quality --out-dir /tmp/codepawl-cp024-followup-eval --limit 50`: pass, 50/50, eval `eval_1781151462223_oyypdl`.
- Live GitHub smoke evidence:
  - First smoke after auth: GitHub run `27323397150` passed, but workflow-dispatch report artifact lacked the Actions URL in Evidence Summary; no issue/PR comment was expected for workflow_dispatch.
  - Fix commit: `b0488d6` (`fix(openpawl): include actions url in evidence summary`), pushed to `origin/main`.
  - Final smoke command: `gh workflow run openpawl.yml --repo codepawl/codepawl --ref main -f mode=dry-run -f repo_path=. -f task='review changes and suggest improvements'`.
  - Final smoke run URL: `https://github.com/codepawl/codepawl/actions/runs/27323506270`.
  - GitHub run ID/conclusion: `27323506270`, `success`.
  - Head SHA: `b0488d65c830f4ed7ee1fb4b459646ca19d00677`.
  - Openpawl run ID: `run_1781151538660_qpej6x`.
  - Artifact name: `openpawl-artifacts-run_1781151538660_qpej6x`.
  - Artifact directory: `/home/runner/work/codepawl/codepawl/.codepawl/runs/run_1781151538660_qpej6x`.
  - Report path: `/home/runner/work/codepawl/codepawl/.codepawl/runs/run_1781151538660_qpej6x/report.md`.
  - Trace path: `/home/runner/work/codepawl/codepawl/.codepawl/runs/run_1781151538660_qpej6x/trace.json`.
  - Downloaded evidence path: `/tmp/codepawl-cp024-followup-live-smoke/openpawl-artifacts-run_1781151538660_qpej6x/`.
  - Evidence Summary verified to include run ID, Actions URL, artifact name, artifact directory, report path, and trace path.
  - Evidence Summary leakage check: no raw prompt, secret-shaped token, env value, or unbounded log matched in the summary. The only detailed log block was bounded placeholder validation output outside the summary.
  - Comment evidence: not applicable to workflow_dispatch because no issue/PR number is resolved; the report artifact now carries the GitHub Actions URL and artifact context.
- Release authorization:
  - Proceed with `v0.5.0` metadata commit, push, annotated tag, tag push, and GitHub Release publication.
  - Do not publish npm/packages.
  - Artifact JSON schemaVersion `"1"` compatibility unchanged.
  - Write safety gates, approval/apply policy, validation precedence, unsafe write rejection, beta create-only guardrails, `.gitignore` scanning, bounded retry behavior, and trace legacy compatibility unchanged.

### CP-025: v0.5.0 post-release reproducibility and GitHub Actions audit

- Date: 2026-06-11
- Verdict: V0_5_1_PATCH_RELEASED
- Release evidence:
  - Patch commit: `682b8be7b56d62d757e67254d082d34043f814b8` (`fix(openpawl): prepare v0.5.1 patch release`).
  - Annotated tag: `v0.5.1`, tag object `29eb89383172a185b45128793fbabcd6a92c8bb2`, target commit `682b8be7b56d62d757e67254d082d34043f814b8`.
  - GitHub Release: `https://github.com/codepawl/codepawl/releases/tag/v0.5.1`.
  - No npm/packages were published.
- v0.5.0 clean-clone reproducibility audit:
  - Checkout: clean temp clone at `v0.5.0`, target commit `040e57e38b9ed1c8f51453b1f971964da72aa744`.
  - `bun install`: pass after using `/tmp` Bun install/tmp directories for the clean clone.
  - `bun run typecheck`: failed before the patch because `apps/web/components/app-providers.tsx` imported `@clerk/ui` without a resolvable root declaration.
  - `bun run test`: pass.
  - `bun --filter @codepawl/cli dev -- eval patch-quality --out-dir /tmp/codepawl-cp025-tag-eval --limit 50`: pass, 50/50, eval `eval_1781152560452_0nnkvs`.
  - Dry-run smoke: pass, run `run_1781152560455_icskpf`, report `/tmp/codepawl-cp025-tag-dry-run-smoke/report.md`, trace `/tmp/codepawl-cp025-tag-dry-run-smoke/trace.json`.
  - Expected-failure smoke: expected exit code `1`, readiness `unsupported`, provider calls `0`, run `run_1781152560473_acxv83`, report `/tmp/codepawl-cp025-tag-failure-smoke/report.md`, trace `/tmp/codepawl-cp025-tag-failure-smoke/trace.json`.
- GitHub Actions run `27323506270` audit:
  - Conclusion: success, but logs contained harmless noisy checkout post-job cleanup warnings because `openpawl-install-smoke` was a tracked gitlink without a `.gitmodules` entry.
  - Node/action warning: checkout/upload actions were still on older majors and emitted Node 20 deprecation/forced runtime warnings under `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24`.
  - Artifact upload/download: upload completed; no artifact corruption or missing-file issue found.
  - Comment/report context: no issue/PR comment was expected for `workflow_dispatch`; the in-repo workflow carried Actions URL evidence, while reusable/sample workflows did not yet pass the same env value.
- Patch scope:
  - Added a typed `@clerk/ui` declaration for the web app using Clerk UI's `Ui<Appearance>` type.
  - Removed the stale `openpawl-install-smoke` gitlink.
  - Updated workflows and samples to `actions/checkout@v6`, `actions/upload-artifact@v7`, and `actions/github-script@v9` where applicable.
  - Removed the temporary `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24` override.
  - Passed `OPENPAWL_GITHUB_ACTIONS_URL` through reusable/sample workflows.
  - Renamed the report Evidence Summary schema row to `schemaVersion`.
- v0.5.1 local validation evidence:
  - `bun run typecheck`: pass.
  - `bun run test`: pass.
  - `bun --filter @codepawl/cli dev -- eval patch-quality --out-dir /tmp/codepawl-cp025-main-eval --limit 50`: pass, 50/50, eval `eval_1781152917046_hfmm6f`.
  - `git diff --check`: pass.
  - Local dry-run smoke: pass, run `run_1781152933493_k9pqkw`, report `/tmp/codepawl-cp025-main-dry-run-smoke/report.md`, trace `/tmp/codepawl-cp025-main-dry-run-smoke/trace.json`.
  - Local expected-failure smoke: expected exit code `1`, readiness `unsupported`, provider calls `0`, run `run_1781152933527_sxe3yh`, report `/tmp/codepawl-cp025-main-failure-smoke/report.md`, trace `/tmp/codepawl-cp025-main-failure-smoke/trace.json`.
- Live GitHub smoke after fixes:
  - Command: `gh workflow run openpawl.yml --repo codepawl/codepawl --ref main -f mode=dry-run -f repo_path=. -f task='review changes and suggest improvements'`.
  - Run URL: `https://github.com/codepawl/codepawl/actions/runs/27324386738`.
  - GitHub run ID/conclusion: `27324386738`, `success`.
  - Head SHA: `682b8be7b56d62d757e67254d082d34043f814b8`.
  - Openpawl run ID: `run_1781153102350_hx0mh7`.
  - Artifact name: `openpawl-artifacts-run_1781153102350_hx0mh7`.
  - Artifact directory: `/home/runner/work/codepawl/codepawl/.codepawl/runs/run_1781153102350_hx0mh7`.
  - Report path: `/home/runner/work/codepawl/codepawl/.codepawl/runs/run_1781153102350_hx0mh7/report.md`.
  - Trace path: `/home/runner/work/codepawl/codepawl/.codepawl/runs/run_1781153102350_hx0mh7/trace.json`.
  - Downloaded evidence path: `/tmp/codepawl-cp025-live-smoke/openpawl-artifacts-run_1781153102350_hx0mh7/`.
  - Evidence Summary includes run ID, Actions URL, artifact name, artifact directory, report path, trace path, and `schemaVersion`.
  - Evidence Summary leakage check: no raw prompt, secret-shaped value, env value, or unbounded log matched in the summary.
  - Comment evidence: not applicable to `workflow_dispatch` because no issue/PR number is resolved.
- Warning verdicts after fixes:
  - `.gitmodules` cleanup warning: fixed; no `No url found for submodule path 'openpawl-install-smoke'` or fatal submodule cleanup warning appeared in run `27324386738`.
  - Checkout/submodule behavior: `submodules: false`; checkout still runs normal credential cleanup `git submodule foreach` commands, but they complete without warnings.
  - Node 20 deprecation/forced-runtime warning: fixed for audited Openpawl/CI workflow actions; no Node 20 deprecation warning appeared in run `27324386738`.
  - Artifact upload/download: pass; artifact `openpawl-artifacts-run_1781153102350_hx0mh7` uploaded with six files and downloaded for evidence inspection.
  - Comment/report context: report artifact carries Actions URL and artifact context; issue/PR comment remains skipped for `workflow_dispatch`.
- Safety boundaries preserved:
  - Artifact JSON schemaVersion `"1"` compatibility unchanged.
  - Write safety gates unchanged.
  - Approval/apply policy unchanged.
  - Validation precedence unchanged.
  - Unsafe write rejection and beta create-only guardrails unchanged.
  - `.gitignore` scanning unchanged.
  - Bounded retry behavior unchanged.
  - Trace legacy compatibility unchanged.
- Caveats:
  - The final CP-025 evidence record is a docs-only checkpoint on `main` after the `v0.5.1` release tag, so `main` intentionally advances past the release tag with checkpoint metadata only.
  - GitHub checkout still prints upstream `git init` default-branch hints; these are not Openpawl workflow warnings and did not fail the run.

### CP-026: GitHub Marketplace readiness audit for Openpawl by CodePawl

- Date: 2026-06-11
- Verdict: BLOCKED_WITH_REASON
- Candidate release: `v0.5.1`
- Blocking reason:
  - GitHub Marketplace Action publication requires a root `action.yml` or `action.yaml` metadata file and a single-action repository/package shape.
  - Openpawl `v0.5.1` is validated as a copyable/reusable GitHub Actions workflow from the `codepawl/codepawl` monorepo, but the repository does not contain a root Action metadata file and should not be submitted as a Marketplace Action until a dedicated wrapper/package exists.
- Official requirements checked:
  - GitHub Actions metadata syntax: actions require `action.yml` or `action.yaml`, with `action.yml` preferred.
  - GitHub Marketplace publishing requirements: public repository, one root action metadata file, unique action metadata `name`, and Marketplace Developer Agreement acceptance before publication.
- Repository/release inspection:
  - Initial status: clean, `main...origin/main`.
  - Recent head before CP-026 docs: `5798ac7` (`docs(openpawl): record CP-025 release audit`).
  - `v0.5.1` tag object: `29eb89383172a185b45128793fbabcd6a92c8bb2`.
  - `v0.5.1` target commit: `682b8be7b56d62d757e67254d082d34043f814b8`.
  - GitHub Release: `https://github.com/codepawl/codepawl/releases/tag/v0.5.1`.
  - Live smoke run: `https://github.com/codepawl/codepawl/actions/runs/27324386738`, conclusion `success`, head SHA `682b8be7b56d62d757e67254d082d34043f814b8`.
- Clean `v0.5.1` reproducibility evidence:
  - Temp clone: `/tmp/codepawl-cp026-clone-og1wFs/repo`.
  - Checkout: `v0.5.1`, target commit `682b8be7b56d62d757e67254d082d34043f814b8`.
  - `bun install`: pass after rerun with network access and `/tmp` Bun cache/install dirs.
  - `bun run typecheck`: pass.
  - `bun run test`: pass.
  - `bun --filter @codepawl/cli dev -- eval patch-quality --out-dir /tmp/codepawl-cp026-tag-eval --limit 50`: pass, 50/50, eval `eval_1781153627117_t80410`.
  - Dry-run smoke: pass, run `run_1781153640800_p3ob8g`, report `/tmp/codepawl-cp026-tag-dry-run-smoke/report.md`, trace `/tmp/codepawl-cp026-tag-dry-run-smoke/trace.json`.
  - Expected-failure smoke: expected exit code `1`, readiness `unsupported`, provider calls `0`, run `run_1781153640861_2dp7i6`, report `/tmp/codepawl-cp026-tag-failure-smoke/report.md`, trace `/tmp/codepawl-cp026-tag-failure-smoke/trace.json`.
- Marketplace docs/copy fixes:
  - Added `docs/MARKETPLACE.md` with the CP-026 verdict, Marketplace field draft, support/install/status URLs, copy guardrails, screenshot/feature-card checklist, and publication blockers.
  - Updated README and install docs to state that `v0.5.1` is a workflow-install candidate, not a published Marketplace Action.
  - Updated public OpenPawl product copy and API seed/test fixtures to avoid overclaiming broad autonomous write behavior and to point at `codepawl/codepawl`.
  - Updated product documentation/glossary/API examples to use guarded workflow language.
- Marketplace field URLs recorded:
  - Current install URL: `https://github.com/codepawl/codepawl/blob/v0.5.1/docs/OPENPAWL_INSTALL.md`.
  - Reusable workflow URL: `https://github.com/codepawl/codepawl/blob/v0.5.1/.github/workflows/openpawl-run.yml`.
  - Copyable workflow URL: `https://github.com/codepawl/codepawl/blob/v0.5.1/docs/samples/openpawl.workflow.yml`.
  - Sample config URL: `https://github.com/codepawl/codepawl/blob/v0.5.1/docs/samples/openpawl.config.json`.
  - Release URL: `https://github.com/codepawl/codepawl/releases/tag/v0.5.1`.
  - Source URL: `https://github.com/codepawl/codepawl`.
  - Support URL: `https://github.com/codepawl/codepawl/issues`.
  - Status URL: `https://github.com/codepawl/codepawl/actions/workflows/openpawl.yml`.
  - Security/contact URL: `https://github.com/codepawl/codepawl/security/advisories`.
  - Documentation URL: `https://github.com/codepawl/codepawl/tree/v0.5.1/docs`.
- Listing copy verification:
  - Product name draft: `Openpawl by CodePawl`.
  - Short description draft: `Dry-run-first AI code review workflow for GitHub issues and pull requests.`
  - Full description draft explicitly says dry-run by default, schema-versioned artifacts, report context, explicit maintainer approval/manual dispatch for write mode, and beta writes limited to safe test-file creation on bot branches with PR review.
  - Copy guardrails reject claims of unattended autonomous writing, broad code modification support, npm installability, or completed Marketplace publication.
- Screenshot/feature-card checklist:
  - Added in `docs/MARKETPLACE.md`: workflow dispatch setup, successful Actions run, Evidence Summary, report comment, safety card, artifact card, and limitations card.
- Validation after docs/copy fixes:
  - `bun run typecheck`: pass.
  - `bun run test`: pass.
  - `UV_CACHE_DIR=/tmp/codepawl-cp026-uv-cache uv run pytest` in `apps/api`: pass, 22 tests; warning limited to third-party FastAPI/Starlette testclient deprecation.
- Safety boundaries preserved:
  - No product features added.
  - Did not rewrite `v0.5.1`.
  - Did not publish npm/packages.
  - Write-safety gates unchanged.
  - Artifact schema v1 unchanged.
  - Trace legacy compatibility unchanged.
  - `.gitignore` scanning unchanged.
  - Bounded retry behavior unchanged.
  - Evidence Summary behavior unchanged.
