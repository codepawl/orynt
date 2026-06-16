# Closed-Loop Frontend Evaluation v0

Status: Phase 4C local/manual calibration scaffold. It does not call external LLM APIs, train JEPA models, run CUDA jobs, or require network access.

## Purpose

The v0 loop tests whether the local Preference Critic helps a practical frontend iteration path:

1. load a rendered local UI task
2. emit critique JSON
3. write a Codex-compatible patch contract
4. apply a deterministic local patch when safe, or save manual instructions
5. rerender
6. compare before/after critic score, deterministic metrics, accessibility/overflow flags, and screenshots
7. export reproducible task and aggregate reports

All claims are limited to synthetic/local preference improvement unless future human review forms are filled.

## Build Datasets

```bash
UV_NO_SYNC=1 UV_CACHE_DIR=/tmp/uv-cache uv run python -m codepawl_harness.ui_loop_build_cli \
  data/processed/ui_jepa_v0_smoke --out data/processed/ui_loop_v0 --set loop_easy_20

UV_NO_SYNC=1 UV_CACHE_DIR=/tmp/uv-cache uv run python -m codepawl_harness.ui_loop_build_cli \
  data/processed/ui_jepa_v0_smoke --out data/processed/ui_loop_v0 --set loop_mixed_50

UV_NO_SYNC=1 UV_CACHE_DIR=/tmp/uv-cache uv run python -m codepawl_harness.ui_loop_build_cli \
  data/processed/ui_jepa_v0_smoke --out data/processed/ui_loop_v0 --set loop_hard_100
```

Current generated counts:

- `loop_easy_20`: 20 tasks.
- `loop_mixed_50`: 50 tasks.
- `loop_hard_100`: 100 tasks.

Each task record uses `ui_loop_v0_task_v1` and includes before HTML, screenshot, DOM, accessibility, metrics, known issue types, expected issue types, corruption type, severity, difficulty, split, patch-mode eligibility, clean-reference provenance, train/critic overlap flags, holdout status, and expected patch scope.

## Run Modes

`no_op` copies the before artifact and must stay at zero improvement:

```bash
UV_NO_SYNC=1 UV_CACHE_DIR=/tmp/uv-cache uv run python -m codepawl_harness.ui_loop_run_cli \
  data/processed/ui_loop_v0/loop_mixed_50 \
  --out reports/ui_loop_v0_mixed_noop \
  --patch-mode no_op \
  --no-noop-baseline

UV_NO_SYNC=1 UV_CACHE_DIR=/tmp/uv-cache uv run python -m codepawl_harness.ui_loop_run_cli \
  data/processed/ui_loop_v0/loop_hard_100 \
  --out reports/ui_loop_v0_hard_noop \
  --patch-mode no_op \
  --no-noop-baseline
```

`instruction_only` writes critique JSON, instruction Markdown, manual review templates, and Codex contracts, but it is not evidence of improvement:

```bash
UV_NO_SYNC=1 UV_CACHE_DIR=/tmp/uv-cache uv run python -m codepawl_harness.ui_loop_run_cli \
  data/processed/ui_loop_v0/loop_easy_20 \
  --out reports/ui_loop_v0_instruction_only \
  --patch-mode instruction_only \
  --limit 3
```

`deterministic_patch` operates only on copied local loop work files. For the current synthetic jitter fixtures it removes the known `data-codepawl-jitter` CSS block, rerenders, scores before/after, and exports reports:

```bash
UV_NO_SYNC=1 UV_CACHE_DIR=/tmp/uv-cache uv run python -m codepawl_harness.ui_loop_run_cli \
  data/processed/ui_loop_v0/loop_mixed_50 \
  --out reports/ui_loop_v0_mixed_deterministic \
  --patch-mode deterministic_patch

UV_NO_SYNC=1 UV_CACHE_DIR=/tmp/uv-cache uv run python -m codepawl_harness.ui_loop_run_cli \
  data/processed/ui_loop_v0/loop_hard_100 \
  --out reports/ui_loop_v0_hard_deterministic \
  --patch-mode deterministic_patch
```

`oracle_patch` copies the clean source artifact as an upper-bound sanity check. It is useful for measuring whether the task has a recoverable clean target, but it is excluded from non-oracle success claims:

```bash
UV_NO_SYNC=1 UV_CACHE_DIR=/tmp/uv-cache uv run python -m codepawl_harness.ui_loop_run_cli \
  data/processed/ui_loop_v0/loop_mixed_50 \
  --out reports/ui_loop_v0_mixed_oracle \
  --patch-mode oracle_patch

UV_NO_SYNC=1 UV_CACHE_DIR=/tmp/uv-cache uv run python -m codepawl_harness.ui_loop_run_cli \
  data/processed/ui_loop_v0/loop_hard_100 \
  --out reports/ui_loop_v0_hard_oracle \
  --patch-mode oracle_patch
```

`manual_patch_import` imports user/Codex-produced patches from `data/manual_patches/ui_loop_v0/<task_id>/`. Missing task patches are skipped, not failed:

```bash
UV_NO_SYNC=1 UV_CACHE_DIR=/tmp/uv-cache uv run python -m codepawl_harness.ui_loop_run_cli \
  data/processed/ui_loop_v0/loop_mixed_50 \
  --out reports/ui_loop_v0_mixed_manual_patch_import \
  --patch-mode manual_patch_import \
  --manual-patches data/manual_patches/ui_loop_v0 \
  --no-noop-baseline

UV_NO_SYNC=1 UV_CACHE_DIR=/tmp/uv-cache uv run python -m codepawl_harness.ui_loop_run_cli \
  data/processed/ui_loop_v0/loop_hard_100 \
  --out reports/ui_loop_v0_hard_manual_patch_import \
  --patch-mode manual_patch_import \
  --manual-patches data/manual_patches/ui_loop_v0 \
  --no-noop-baseline
```

If Chromium cannot launch in a sandbox, rerun the rendered `deterministic_patch` and `oracle_patch` commands manually in a local shell. `--skip-render` is allowed only for fixture-safe tests and should not be counted as rendered evidence.

## Report Interpretation

Primary mixed/hard reports:

```text
reports/ui_loop_v0_mixed_noop/closed_loop_report.json
reports/ui_loop_v0_mixed_deterministic/closed_loop_report.json
reports/ui_loop_v0_mixed_oracle/closed_loop_report.json
reports/ui_loop_v0_mixed_manual_patch_import/closed_loop_report.json
reports/ui_loop_v0_hard_noop/closed_loop_report.json
reports/ui_loop_v0_hard_deterministic/closed_loop_report.json
reports/ui_loop_v0_hard_oracle/closed_loop_report.json
reports/ui_loop_v0_hard_manual_patch_import/closed_loop_report.json
```

Current rendered deterministic non-oracle evidence:

- `passed_closed_loop_gate: true`
- `loop_mixed_50`: `task_count: 50`, `deterministic_non_oracle_success_rate: 1.0`
- `loop_hard_100`: `task_count: 100`, `deterministic_non_oracle_success_rate: 1.0`
- `mean_critic_delta: 0.14`
- `mean_critic_delta_non_oracle: 0.14`
- no-op mean critic delta: `0.0`
- `accessibility_regression_rate_non_oracle: 0.0`
- `responsive_regression_rate_non_oracle: 0.0`

Current oracle upper-bound evidence:

- `loop_mixed_50`: `oracle_upper_bound_success_rate: 1.0`, `passed_closed_loop_gate: false`
- `loop_hard_100`: `oracle_upper_bound_success_rate: 1.0`, `passed_closed_loop_gate: false`

Current manual-patch-import evidence:

- no manual patches are present yet
- missing patches are recorded as skipped: 50 mixed skipped, 100 hard skipped

The no-op baseline is mandatory because the same local critic helps generate and score the loop. Deterministic metric deltas, accessibility regressions, responsive/overflow regressions, and manual review exports must be read separately from critic deltas.

Reports also break down mixed/hard behavior by corruption type, severity bucket, difficulty, pair family, issue type, patch mode, train/critic overlap status, holdout status, metrics-confidence bucket, and special subsets such as `metrics_ambiguous`, `high_critic_confidence`, `low_critic_confidence`, `cross_issue`, `close_severity`, and `holdout_template`.

The main closed-loop pass flag uses non-oracle evidence only. Oracle success is an upper bound and must not be used to claim closed-loop product value.

## Codex Patch Contracts

Each task writes a direct Codex work contract under:

```text
reports/<loop_report_dir>/contracts/<task_id>.md
```

Contracts use the sections `Goal:`, `Context:`, `Constraints:`, and `Done when:`. They include source file path, before screenshot path, critic review JSON path, issue summary, allowed edit scope, explicit do-not-change rules, validation commands, expected artifact paths, acceptance criteria, and the instruction not to use external services.

Generated contracts are artifacts only. Do not paste them into an external LLM service as part of an automated run.

## Manual Patch Import

Manual patch records live under:

```text
data/manual_patches/ui_loop_v0/<task_id>/
```

Supported files:

- `after.html`, `patched.html`, or `index.html`
- `patch.diff` when available
- `notes.json` with optional `patched_html_path`, `patched_project_path`, `provenance`, `patch_author`, and `created_at`

Run `manual_patch_import` to render and score available patches. Missing task directories or missing patched HTML are skipped and listed in `examples.skipped`.

Phase 4C manual batch artifacts live under:

```text
reports/ui_loop_v0_manual_batch/task_selection.json
reports/ui_loop_v0_manual_batch/mixed_manual_patch_import/closed_loop_report.json
reports/ui_loop_v0_manual_batch/hard_manual_patch_import/closed_loop_report.json
reports/ui_loop_v0_manual_batch/combined_manual_patch_report.json
reports/ui_loop_v0_manual_batch/manual_review_labels/
reports/ui_loop_v0_manual_batch/manual_review_index.md
```

Build or refresh the selected batch with:

```bash
UV_NO_SYNC=1 UV_CACHE_DIR=/tmp/uv-cache uv run python -m codepawl_harness.ui_loop_manual_batch_cli build \
  --mixed-dataset data/processed/ui_loop_v0/loop_mixed_50 \
  --hard-dataset data/processed/ui_loop_v0/loop_hard_100 \
  --out reports/ui_loop_v0_manual_batch \
  --contracts reports/ui_loop_v0/contracts \
  --manual-patches data/manual_patches/ui_loop_v0 \
  --per-set-count 10 \
  --seed 42
```

In this sandbox the rendered import command stalled in Chromium before task reports were written. Structural `--skip-render` reports were exported, but they are not visual improvement evidence and therefore keep `manual_patch_ready: false`.

## Manual Review Queue

Every task writes a review template under:

```text
reports/ui_loop_v0/manual_review_queue/
```

Each template includes before/after screenshots, critic JSON, instruction Markdown, patch diff when available, and fields for:

- `preferred`: `before`, `after`, or `tie`
- `issue_types_remaining`
- `visual_regression`
- `accessibility_concern`
- `notes`
- `reviewer_id`
- `provenance`
- `created_at`

Completed labels can be ingested when rebuilding a report:

```bash
UV_NO_SYNC=1 UV_CACHE_DIR=/tmp/uv-cache uv run python -m codepawl_harness.ui_loop_report_cli \
  --out reports/ui_loop_v0_mixed_deterministic \
  --dataset-dir data/processed/ui_loop_v0/loop_mixed_50 \
  --patch-mode deterministic_patch \
  --manual-review-labels data/manual_patches/ui_loop_v0/manual_review_labels.jsonl
```

When labels exist, reports include critic-vs-human agreement, deterministic-metric-vs-human agreement, and patch win rate by human preference. With no labels, the report records a skipped reason.

Blank Phase 4C templates with `preferred: null` are ignored by ingestion. Set `preferred` to `before`, `after`, or `tie` before treating labels as completed.

Manual agreement or disagreement with the critic is the required next evidence before using this critic for real PR review.

For the Phase 4C manual batch, use the local web reviewer instead of editing JSON:

```bash
UV_NO_SYNC=1 UV_CACHE_DIR=/tmp/uv-cache uv run ui-loop-review-web \
  --selection reports/ui_loop_v0_manual_batch/task_selection.json \
  --labels reports/ui_loop_v0_manual_batch/manual_review_labels \
  --mixed-report reports/ui_loop_v0_manual_batch/mixed_manual_patch_import/closed_loop_report.json \
  --hard-report reports/ui_loop_v0_manual_batch/hard_manual_patch_import/closed_loop_report.json \
  --manual-patches data/manual_patches/ui_loop_v0 \
  --host 127.0.0.1 \
  --port 8765 \
  --reviewer-id "$USER"
```

The browser UI is local-only and Vietnamese. It compares before/after screenshots, shows task metadata, patch notes, diffs, and critic contracts, then writes the existing manual review JSON schema only after the reviewer presses `Lưu`.

Vietnamese labels:

- `Sau tốt hơn`: writes `preferred: "after"`
- `Trước tốt hơn`: writes `preferred: "before"`
- `Ngang nhau`: writes `preferred: "tie"`
- `Lỗi thị giác mới`: the patched version created a visible visual regression such as clipped text, shifted elements, broken layout, worse spacing/color, missing important content, overflow, or an overall worse result.
- `Vấn đề accessibility`: the patched version may reduce readability or usability, such as low contrast, hard-to-read text, worse labels/focus/semantics, or unclear CTA/input controls.

Keyboard shortcuts are `A` after, `B` before, `T` tie, `R` visual regression, `C` accessibility concern, `S` or `Ctrl/Cmd+S` save, `N` next, and `P` previous.

For the default Phase 4C batch, complete the 20 selected labels, then use the web `Recombine report` button or run:

```bash
UV_NO_SYNC=1 UV_CACHE_DIR=/tmp/uv-cache uv run ui-loop-manual-batch combine \
  --selection reports/ui_loop_v0_manual_batch/task_selection.json \
  --mixed-report reports/ui_loop_v0_manual_batch/mixed_manual_patch_import/closed_loop_report.json \
  --hard-report reports/ui_loop_v0_manual_batch/hard_manual_patch_import/closed_loop_report.json \
  --labels reports/ui_loop_v0_manual_batch/manual_review_labels \
  --out reports/ui_loop_v0_manual_batch/combined_manual_patch_report.json
```

After labels are filled and recombined, run the scale gate with `--manual-batch-report reports/ui_loop_v0_manual_batch/combined_manual_patch_report.json` as shown below.

## Gate

Run:

```bash
UV_NO_SYNC=1 UV_CACHE_DIR=/tmp/uv-cache uv run python -m codepawl_harness.ui_jepa_scale_gate_cli \
  --dataset data/processed/ui_jepa_v0_smoke \
  --b0-report reports/ui_jepa_v0_smoke/b0_report.json \
  --m1-report reports/ui_jepa_v0_smoke/m1_report.json \
  --m2-report reports/ui_jepa_v0_smoke/m2_report.json \
  --m2-strong-report reports/ui_jepa_v0_smoke/m2_strong_report.json \
  --m25-report reports/ui_jepa_v0_smoke/m25_diagnostics_report.json \
  --preference-critic-report reports/ui_jepa_v0_smoke/preference_critic_report.json \
  --closed-loop-report reports/ui_loop_v0_mixed_deterministic/closed_loop_report.json \
  --out reports/ui_jepa_v0_smoke/scale_gate.json
```

The current gate records `closed_loop_ready: true`, `closed_loop_mixed_passed: true`, `closed_loop_hard_passed: true`, and `closed_loop_non_oracle_ready: true`. `manual_review_ready` and `pr_review_ready` remain false until manual labels are ingested. `dom_aware_ready` remains false because M2.5 still finds no useful representation signal and no DOM/localization bottleneck has been shown.

For Phase 4C, pass the combined manual batch report:

```bash
UV_NO_SYNC=1 UV_CACHE_DIR=/tmp/uv-cache uv run python -m codepawl_harness.ui_jepa_scale_gate_cli \
  --dataset data/processed/ui_jepa_v0_smoke \
  --b0-report reports/ui_jepa_v0_smoke/b0_report.json \
  --m1-report reports/ui_jepa_v0_smoke/m1_report.json \
  --m2-report reports/ui_jepa_v0_smoke/m2_report.json \
  --m25-report reports/ui_jepa_v0_smoke/m25_diagnostics_report.json \
  --m2-strong-report reports/ui_jepa_v0_smoke/m2_strong_report.json \
  --preference-critic-report reports/ui_jepa_v0_smoke/preference_critic_report.json \
  --closed-loop-report reports/ui_loop_v0_mixed_deterministic/closed_loop_report.json \
  --manual-batch-report reports/ui_loop_v0_manual_batch/combined_manual_patch_report.json \
  --out reports/ui_jepa_v0_smoke/scale_gate.json
```

`pr_review_ready` now additionally requires manual patch import evidence with enough rendered tasks, success rate above threshold, accessibility/responsive regression rates below threshold, and completed manual review labels. A high manual patch success rate without labels recommends filling labels; low manual patch success recommends improving contracts or the critic instruction adapter; critic-review disagreement recommends collecting more labels and recalibrating.

## Before Real PR Review

Evidence still needed:

- inspect mixed/hard deterministic wins and failures in the manual review queue
- run manual Codex/user patches on selected mixed/hard contracts
- collect human labels if reviewers disagree with critic rankings
- recalibrate the critic if manual review disagrees
- only revisit DOM-aware JEPA if closed-loop failures show critic localization or DOM grounding is the bottleneck
