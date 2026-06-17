# Real PR Visual Review Trial

Status: local artifact-only trial for PR Screenshot Regression Review v0. It does not call GitHub APIs, train models, use CUDA, call external LLM APIs, post comments, or make visual review a required check.

## Case Layout

Create 5-10 case directories under:

```text
data/pr_review_v0/real_pr_trial/<case_id>/
```

Each case has `metadata.json`:

```json
{
  "schema_version": "ui_pr_review_v0_real_trial_case_v1",
  "case_id": "settings_spacing_001",
  "source_branch": "local-settings-spacing",
  "route_or_component": "/settings",
  "mode": "screenshots-only",
  "before": {
    "screenshot_path": "before.png",
    "metrics_path": "before_metrics.json"
  },
  "after": {
    "screenshot_path": "after.png",
    "metrics_path": "after_metrics.json"
  },
  "patch_diff_path": "patch.diff",
  "reviewer_label_path": "reviewer_label.json"
}
```

Use `local_identifier` instead of `source_branch` when the change is a local snapshot rather than a branch. `before.path` and `after.path` may point at local HTML/project snapshots for render mode, but `screenshots-only` is preferred in sandboxes where Chromium cannot launch.

## Capture Screenshots

When browser rendering is available, capture each side with the repo renderer:

```bash
UV_NO_SYNC=1 UV_CACHE_DIR=/tmp/uv-cache uv run codepawl-render \
  data/pr_review_v0/real_pr_trial/<case_id>/before.html \
  --out data/pr_review_v0/real_pr_trial/<case_id>/before_render

UV_NO_SYNC=1 UV_CACHE_DIR=/tmp/uv-cache uv run codepawl-render \
  data/pr_review_v0/real_pr_trial/<case_id>/after.html \
  --out data/pr_review_v0/real_pr_trial/<case_id>/after_render
```

Then copy or reference the produced `screenshot.png` and `metrics.json` in `metadata.json`. If Chromium is blocked, capture screenshots manually and provide matching metrics from an environment where rendering works, or keep the case out of the trial until both screenshots and metrics exist.

## Reviewer Labels

After the PR review artifacts are generated, fill `reviewer_label.json`:

```json
{
  "schema_version": "ui_pr_review_v0_reviewer_label_v1",
  "case_id": "settings_spacing_001",
  "preferred": "before",
  "critic_decision_agree": false,
  "visual_regression_missed": true,
  "false_positive": false,
  "notes": "After state clips the billing card on mobile.",
  "reviewer_id": "an",
  "created_at": "2026-06-17T00:00:00Z"
}
```

Use `preferred: "after"` for accepted improvements, `preferred: "before"` for regressions, and `preferred: "tie"` when the reviewer sees no meaningful difference.

## Run Trial

Run all trial cases and aggregate:

```bash
UV_NO_SYNC=1 UV_CACHE_DIR=/tmp/uv-cache uv run ui-pr-review-trial
```

This writes:

```text
reports/ui_pr_review_v0/real_pr_trial/trial_report.json
reports/ui_pr_review_v0/real_pr_trial/trial_report.md
reports/ui_pr_review_v0/real_pr_trial/<case_id>/pr_review_report.json
reports/ui_pr_review_v0/real_pr_trial/<case_id>/pr_review_report.md
```

It also runs `ui-jepa-scale-gate --target pr-review` using one case report as gate evidence and writes:

```text
reports/ui_pr_review_v0/real_pr_trial/scale_gate_pr_review.json
```

For schema-only or aggregation-only dry runs:

```bash
UV_NO_SYNC=1 UV_CACHE_DIR=/tmp/uv-cache uv run ui-pr-review-trial --skip-gate
```

## Interpret Readiness

The trial report emits one readiness decision:

- `collect_more_real_cases`: fewer than five reviewed cases.
- `tune_thresholds`: false positives are above the conservative threshold.
- `improve_report_ux`: reviewer labels are invalid or critic/reviewer agreement is low.
- `do_not_productize_yet`: reviewers found missed regressions or regression rates are too high.
- `enable_artifact_only_workflow`: at least five reviewed cases meet agreement, false-positive, missed-regression, accessibility, and responsive thresholds.

Default thresholds are conservative:

- minimum reviewed cases: `5`
- minimum reviewer agreement: `0.8`
- maximum false-positive rate: `0.2`
- maximum missed regression count: `0`
- maximum accessibility regression rate: `0.1`
- maximum responsive regression rate: `0.1`

Low-confidence cases should stay `needs_manual_review`. Do not auto-comment and do not make the workflow required based on this v0 trial.

## Enablement Rule

Only consider renaming `.github/workflows/pr-visual-review.yml.disabled` after the real trial report says `enable_artifact_only_workflow`. Even then, keep `workflow_dispatch` as the only trigger until more production-route evidence is reviewed.

DOM-aware JEPA remains blocked because this trial measures artifact usefulness for PR screenshot review, not DOM-aware representation readiness.
