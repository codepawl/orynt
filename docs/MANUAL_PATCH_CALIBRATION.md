# Manual Patch Calibration

Status: Phase 4C local/manual calibration. This workflow does not train models, call external LLM APIs, use network access, or modify canonical datasets under `data/processed/ui_loop_v0`.

## Purpose

Manual patch calibration checks whether local critic-generated patch contracts are actionable for Codex or a human reviewer:

1. select a deterministic mixed/hard batch
2. create task-local manual patch artifacts under `data/manual_patches/ui_loop_v0/<task_id>/`
3. import and score those patches through the closed-loop runner
4. export manual review label templates
5. fill completed labels with the lightweight review assistant
6. ingest completed labels and compare reviewer preference against critic and deterministic metrics
7. keep PR screenshot regression review blocked until manual patch and manual label evidence pass thresholds

All conclusions are local calibration signals, not claims about human taste.

## Build The Batch

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

This writes:

- `reports/ui_loop_v0_manual_batch/task_selection.json`
- `data/manual_patches/ui_loop_v0/<task_id>/patched.html`
- `data/manual_patches/ui_loop_v0/<task_id>/notes.json`
- `data/manual_patches/ui_loop_v0/<task_id>/patch.diff`
- `reports/ui_loop_v0_manual_batch/manual_review_labels/<task_id>.json`
- `reports/ui_loop_v0_manual_batch/manual_review_index.md`

The current Codex patch exporter only edits copied task-local HTML. For known local jitter fixtures it removes the `data-codepawl-jitter` style block. If that marker is missing, it writes a task TODO and does not count the patch as completed evidence.

## Run Manual Patch Import

Rendered evidence requires Chromium/Playwright to work locally:

```bash
UV_NO_SYNC=1 UV_CACHE_DIR=/tmp/uv-cache uv run python -m codepawl_harness.ui_loop_run_cli \
  data/processed/ui_loop_v0/loop_mixed_50 \
  --patch-mode manual_patch_import \
  --manual-patches data/manual_patches/ui_loop_v0 \
  --out reports/ui_loop_v0_manual_batch/mixed_manual_patch_import \
  --no-noop-baseline

UV_NO_SYNC=1 UV_CACHE_DIR=/tmp/uv-cache uv run python -m codepawl_harness.ui_loop_run_cli \
  data/processed/ui_loop_v0/loop_hard_100 \
  --patch-mode manual_patch_import \
  --manual-patches data/manual_patches/ui_loop_v0 \
  --out reports/ui_loop_v0_manual_batch/hard_manual_patch_import \
  --no-noop-baseline
```

If Chromium stalls or fails in a sandbox, `--skip-render` may be used only to validate import wiring. Skip-render reports are not visual improvement evidence and should keep PR readiness blocked.

## Fill Labels In The Local Web UI

Prefer the local browser UI for Phase 4C review:

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

Open the printed local URL, usually `http://127.0.0.1:8765`. The in-browser reviewer UI is Vietnamese and writes each explicit save to:

```text
reports/ui_loop_v0_manual_batch/manual_review_labels/<task_id>.json
```

The UI preserves the existing label schema and maps:

- `Sau tốt hơn` to `preferred: "after"`
- `Trước tốt hơn` to `preferred: "before"`
- `Ngang nhau` to `preferred: "tie"`
- `Bỏ qua` to no write

Keyboard shortcuts:

- `A`: mark after as preferred
- `B`: mark before as preferred
- `T`: mark tie
- `R`: toggle visual regression
- `C`: toggle accessibility concern
- `S` or `Ctrl/Cmd+S`: save
- `N`: next task
- `P`: previous task

Vietnamese review flag meanings shown in the UI:

- `Lỗi thị giác mới`: the patched version introduced a visible problem, such as clipped text, shifted elements, broken layout, worse spacing/color, missing important content, overflow, or an overall worse visual result than before.
- `Vấn đề accessibility`: the patched version may reduce readability or usability, such as low contrast, hard-to-read text, worse labels/focus/semantics, or less recognizable CTA/input controls.

The Phase 4C gate needs completed labels for the rendered evaluated manual-patch tasks. With the default batch, that means all 20 current labels should be completed before treating `manual_review_ready` or `pr_review_ready` as meaningful.

The `Recombine report` button directly runs the same local combine logic and updates:

- `label_count`
- `manual_review_ready`
- `pr_review_ready`
- `critic_vs_human_agreement`
- `blocked_reason`

It also shows the exact CLI command for reproducibility.

## Fill Labels In The CLI

Use the label assistant instead of editing JSON by hand:

```bash
UV_NO_SYNC=1 UV_CACHE_DIR=/tmp/uv-cache uv run ui-loop-label-review \
  --selection reports/ui_loop_v0_manual_batch/task_selection.json \
  --labels reports/ui_loop_v0_manual_batch/manual_review_labels \
  --mixed-report-dir reports/ui_loop_v0_manual_batch/mixed_manual_patch_import \
  --hard-report-dir reports/ui_loop_v0_manual_batch/hard_manual_patch_import \
  --reviewer-id "$USER" \
  --only-empty \
  --limit 10
```

For each selected task it prints task metadata, before/after screenshot paths, and the patch diff path. Pass `--open-images` to open available screenshots with `xdg-open`.

Prompt choices:

- `a`: preferred after
- `b`: preferred before
- `t`: tie
- `s`: skip without writing

The assistant also prompts for optional `visual_regression`, `accessibility_concern`, and notes. It writes only explicit reviewer input, sets `provenance` to `manual_review`, and stamps `created_at` with the current local date/time. Completed labels are preserved unless `--overwrite` is passed. Blank templates are intentionally ignored by ingestion.

After labeling, run the combine command printed by the assistant.

## Combine Reports

```bash
UV_NO_SYNC=1 UV_CACHE_DIR=/tmp/uv-cache uv run python -m codepawl_harness.ui_loop_manual_batch_cli combine \
  --selection reports/ui_loop_v0_manual_batch/task_selection.json \
  --mixed-report reports/ui_loop_v0_manual_batch/mixed_manual_patch_import/closed_loop_report.json \
  --hard-report reports/ui_loop_v0_manual_batch/hard_manual_patch_import/closed_loop_report.json \
  --labels reports/ui_loop_v0_manual_batch/manual_review_labels \
  --out reports/ui_loop_v0_manual_batch/combined_manual_patch_report.json
```

Default PR-review thresholds:

- at least 10 rendered manual patch imports
- manual patch success rate at least `0.5`
- accessibility regression rate at most `0.1`
- responsive regression rate at most `0.1`
- completed manual review labels available
- critic-vs-reviewer agreement at least `0.6` when agreement can be computed

Each review template starts empty and keeps the same schema on disk:

```json
{
  "task_id": "...",
  "preferred": null,
  "issue_types_remaining": [],
  "visual_regression": null,
  "accessibility_concern": null,
  "notes": "",
  "reviewer_id": "",
  "provenance": "manual_review",
  "created_at": null
}
```

## Gate

Run:

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
  --pr-review-report reports/ui_pr_review_v0/fixture_manual_patch/pr_review_report.json \
  --out reports/ui_jepa_v0_smoke/scale_gate.json
```

`pr_review_foundation_ready` becomes true only after the rendered manual patch import report passes thresholds and completed manual review labels are ingested. `pr_review_ready` additionally requires a valid local PR screenshot review report with no severe missing artifacts and passing regression thresholds.

Run the offline PR review fixture:

```bash
UV_NO_SYNC=1 UV_CACHE_DIR=/tmp/uv-cache uv run ui-pr-review \
  --review-id fixture_manual_patch \
  --mode screenshots-only \
  --out reports/ui_pr_review_v0 \
  --reviewer-id "$USER"
```

For a real local change, create `data/pr_review_v0/<review_id>/metadata.json` with before/after HTML or screenshots, optional `patch.diff`, and optional `manual_label.json`. Use `--mode render` for HTML/project paths and `--mode screenshots-only` when screenshots/metrics already exist or Chromium cannot run in a sandbox.

DOM-aware JEPA remains frozen: M2.5 and M2-strong do not show useful representation signal for this corpus, and Phase 4C/PR review is testing patch contracts, reviewer calibration, artifact reports, and regression gates, not new architecture or training.
