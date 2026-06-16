# GitHub Actions Visual Review Template

Status: disabled/manual CI template for PR Screenshot Regression Review v0. It does not train models, call external APIs, run CUDA jobs, post to PRs, or run the DOM-aware gate.

## Artifact Directory

The CI artifact root is:

```text
reports/ui_pr_review_v0/<review_id>/
```

For the checked-in CodePawl web pilot, the review id is `codepawl_web_pilot`:

```text
reports/ui_pr_review_v0/codepawl_web_pilot/
```

The uploaded artifact must include:

- `pilot_report.json` and `pilot_report.md` for pilot runs.
- `pilot_metadata.json` for the pilot config used by CI.
- one subdirectory per review case, each with `pr_review_report.json`, `pr_review_report.md`, `before.png`, `after.png`, `review_metadata.json`, `critic_review.json`, and `patch_summary.json`.
- `screenshot_diff.png` when screenshot dimensions match.
- `patch.diff` when a patch diff is supplied.
- `reports/ui_jepa_v0_smoke/scale_gate_pr_review.json`.

Validate the contract locally with:

```bash
UV_NO_SYNC=1 UV_CACHE_DIR=/tmp/uv-cache uv run ui-pr-review-ci \
  --validate-only \
  --out reports/ui_pr_review_v0/codepawl_web_pilot \
  --gate-out reports/ui_jepa_v0_smoke/scale_gate_pr_review.json
```

## Local Dry Run

Run the same sequence as the disabled workflow without GitHub Actions:

```bash
UV_NO_SYNC=1 UV_CACHE_DIR=/tmp/uv-cache uv run ui-pr-review \
  --pilot-config data/pr_review_v0/codepawl_web_pilot/metadata.json \
  --out reports/ui_pr_review_v0/codepawl_web_pilot \
  --reviewer-id ci

UV_NO_SYNC=1 UV_CACHE_DIR=/tmp/uv-cache uv run ui-jepa-scale-gate \
  --target pr-review \
  --dataset data/processed/ui_jepa_v0_smoke \
  --b0-report reports/ui_jepa_v0_smoke/b0_report.json \
  --m1-report reports/ui_jepa_v0_smoke/m1_report.json \
  --m2-report reports/ui_jepa_v0_smoke/m2_report.json \
  --m25-report reports/ui_jepa_v0_smoke/m25_diagnostics_report.json \
  --m2-strong-report reports/ui_jepa_v0_smoke/m2_strong_report.json \
  --preference-critic-report reports/ui_jepa_v0_smoke/preference_critic_report.json \
  --closed-loop-report reports/ui_loop_v0_mixed_deterministic/closed_loop_report.json \
  --manual-batch-report reports/ui_loop_v0_manual_batch/combined_manual_patch_report.json \
  --pr-review-report reports/ui_pr_review_v0/codepawl_web_pilot/docs_api_reference_contrast/pr_review_report.json \
  --out reports/ui_jepa_v0_smoke/scale_gate_pr_review.json

UV_NO_SYNC=1 UV_CACHE_DIR=/tmp/uv-cache uv run ui-pr-review-ci \
  --validate-only \
  --out reports/ui_pr_review_v0/codepawl_web_pilot \
  --gate-out reports/ui_jepa_v0_smoke/scale_gate_pr_review.json
```

The wrapper can also run the pilot, gate, and validator in one local command:

```bash
UV_NO_SYNC=1 UV_CACHE_DIR=/tmp/uv-cache uv run ui-pr-review-ci
```

Expected exit codes:

- `0`: PR review artifacts exist, the `pr-review` gate passes, and the artifact contract validates.
- `1`: the `pr-review` gate blocks or required artifacts are missing.
- `2`: the review pilot itself could not run.

## Workflow Template

The disabled template lives at:

```text
.github/workflows/pr-visual-review.yml.disabled
```

To enable it manually, rename it to:

```text
.github/workflows/pr-visual-review.yml
```

Keep `workflow_dispatch` as the only trigger until more production-route PR review reports have been inspected. Do not make it a required pull-request check yet.

## Why The Target Is `pr-review`

`ui-jepa-scale-gate --target pr-review` checks the PR Screenshot Regression Review evidence and can pass while DOM-aware JEPA remains blocked. This is intentional: PR screenshot artifact review is ready for manual artifact upload, but DOM-aware JEPA still lacks useful representation evidence.

The workflow must not run `--target dom-aware` or `--target all`, because those targets correctly fail while DOM-aware JEPA remains blocked.

## Disabled Automation

The template only uploads artifacts. Posting to PRs is intentionally off until there is evidence from multiple production-route reports showing a low false-positive rate for `request_changes`, completed manual labels for ambiguous cases, stable artifact retention, and reviewer agreement that the artifact bundle is useful enough to become a required check.
