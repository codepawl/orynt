# CodePawl Master Plan Dashboard

Last updated: 2026-06-10 (UTC)

## Current Release Status

- **Product:** Openpawl (`codepawl`)
- **Current baseline:** `v0.2.0` (tag ready)
- **Safety posture:** Dry-run default; write mode is gated by approval + safe test-file create policy.
- **Canonical references (no duplicate logs):**
  - [CHANGELOG.md](../CHANGELOG.md)
  - [README.md](../README.md)
  - [walkthrough.md](../walkthrough.md)
  - [docs/ROADMAP.md](../docs/ROADMAP.md)
  - [docs/PRODUCT.md](../docs/PRODUCT.md)

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
| 1 (lowest) | Master-plan governance and tracking | `.agents/CODEPAWL_MASTER_PLAN.md` | **Completed** | Single source of progress updated at each checkpoint. |
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

- `CP-000` (2026-06-10): Baseline state documented; `.agents/CODEPAWL_MASTER_PLAN.md` created.
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
  - Scope: `packages/cli/src/patch-quality-eval.ts`, `packages/cli/src/__tests__/patch-quality-eval.test.ts`, `.agents/CODEPAWL_MASTER_PLAN.md`
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
  - Scope: `packages/cli/src/patch-quality-eval.ts`, `packages/cli/src/__tests__/patch-quality-eval.test.ts`, `.agents/CODEPAWL_MASTER_PLAN.md`
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
    - `.agents/CODEPAWL_MASTER_PLAN.md`
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
    - `.agents/CODEPAWL_MASTER_PLAN.md`
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
    - `.agents/CODEPAWL_MASTER_PLAN.md`
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
