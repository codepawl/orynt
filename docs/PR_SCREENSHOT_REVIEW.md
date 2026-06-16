# PR Screenshot Review v0

Status: local-first PR-style screenshot regression review. It does not train models, call external APIs, require network access, use CUDA, or implement DOM-aware JEPA.

## Input Schema

Create a review directory:

```text
data/pr_review_v0/<review_id>/
```

`metadata.json` uses `ui_pr_review_v0_input_v1`:

```json
{
  "schema_version": "ui_pr_review_v0_input_v1",
  "review_id": "my_change",
  "before": {
    "path": "before.html",
    "screenshot_path": "before.png",
    "metrics_path": "before_metrics.json"
  },
  "after": {
    "path": "after.html",
    "screenshot_path": "after.png",
    "metrics_path": "after_metrics.json"
  },
  "patch_diff_path": "patch.diff",
  "manual_label_path": "manual_label.json"
}
```

`path` may point at a standalone HTML file or a project directory with `index.html`. Screenshots and metrics are optional for render mode because the CLI can render them. In `screenshots-only` mode, screenshots must exist and metrics should exist for critic scoring; missing metrics produce `blocked_missing_artifacts`.

## Run Locally

Render before/after HTML:

```bash
UV_NO_SYNC=1 UV_CACHE_DIR=/tmp/uv-cache uv run ui-pr-review \
  --review-id my_change \
  --before data/pr_review_v0/my_change/before.html \
  --after data/pr_review_v0/my_change/after.html \
  --patch-diff data/pr_review_v0/my_change/patch.diff \
  --out reports/ui_pr_review_v0/my_change \
  --mode render \
  --reviewer-id "$USER"
```

Use existing screenshots and metrics:

```bash
UV_NO_SYNC=1 UV_CACHE_DIR=/tmp/uv-cache uv run ui-pr-review \
  --review-id fixture_manual_patch \
  --mode screenshots-only \
  --out reports/ui_pr_review_v0 \
  --reviewer-id "$USER"
```

If Chromium cannot run in a sandbox, use `screenshots-only` mode with pre-rendered screenshots and metrics. This keeps CI/offline tests independent of browser availability.

## CodePawl Web Pilot

The real web app discovery step currently finds:

- `apps/site/pilot_routes`: explicit pilot-only static CodePawl route files for this PR review pilot.
- `apps/site/README.md`: public site placeholder outside the pilot route files.
- `apps/design/README.md`: product app placeholder outside the pilot route files.
- no `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, Vite, Next, or Astro app exists in this checkout.

Because no production frontend route tree exists yet, the pilot uses controlled static route files under `apps/site/pilot_routes` plus checked-in screenshots and metrics captured from the same local UI artifacts. The config is:

```text
data/pr_review_v0/codepawl_web_pilot/metadata.json
```

It defines four screenshots-only cases backed by stable route/component HTML, rendered screenshots, and metrics:

- `/openpawl/docs/api-reference` (`docs_api_reference`)
- `/cloud/dashboard/ai-agent` (`dashboard_ai_agent`)
- `/cloud/dashboard/analytics` (`dashboard_analytics`)
- `/cloud/app-empty-state` (`app_empty_state`)

Serve the pilot-only routes locally when browser rendering is available:

```bash
python -m http.server 8766 --directory apps/site/pilot_routes
```

Render a route file directly:

```bash
UV_NO_SYNC=1 UV_CACHE_DIR=/tmp/uv-cache uv run codepawl-render \
  apps/site/pilot_routes/openpawl/docs-api-reference/before.html \
  --out /tmp/codepawl-web-pilot-before
```

Run the aggregate pilot:

```bash
UV_NO_SYNC=1 UV_CACHE_DIR=/tmp/uv-cache uv run ui-pr-review \
  --pilot-config data/pr_review_v0/codepawl_web_pilot/metadata.json \
  --out reports/ui_pr_review_v0/codepawl_web_pilot \
  --reviewer-id "$USER"
```

The pilot writes one normal PR review artifact set per case plus:

```text
reports/ui_pr_review_v0/codepawl_web_pilot/pilot_report.json
reports/ui_pr_review_v0/codepawl_web_pilot/pilot_report.md
```

The current aggregate report has four rendered/screenshots-only cases, zero skipped cases, four `approve_visual` decisions, mean critic delta `0.035`, and no visual/accessibility/responsive regressions. This is useful enough for a future GitHub Actions artifact-upload job, but not for auto-commenting. When a production `apps/site` or `apps/design` frontend exists, replace these pilot-only static routes with production local render-mode cases.

## Outputs

The CLI writes:

- `pr_review_report.json`
- `pr_review_report.md`
- `before.png`
- `after.png`
- `screenshot_diff.png` when image sizes match
- `critic_review.json`
- `patch_summary.json`
- `patch.diff` when supplied
- `manual_label_template.json` when no manual label exists

CI should treat the following as the artifact contract:

- required JSON: `pr_review_report.json`
- required summary: `pr_review_report.md`
- required images: `before.png`, `after.png`
- optional image: `screenshot_diff.png`, unavailable when screenshots are missing or sizes differ
- required critic evidence: `critic_review.json`
- required patch evidence: `patch_summary.json`, plus `patch.diff` when supplied
- optional human evidence: `manual_label.json` or generated `manual_label_template.json`

## Decisions

- `approve_visual`: artifacts are present, regression thresholds pass, and the critic/metrics do not detect a visual, accessibility, or responsive regression.
- `request_changes`: the after state introduces a visual, accessibility, overflow, or responsive regression, or a completed manual label prefers before.
- `needs_manual_review`: artifacts are usable but the signal is ambiguous or a completed manual label is a tie.
- `blocked_missing_artifacts`: required screenshots or metrics are missing/unreadable, or rendering failed.

Manual labels are optional. If `manual_label.json` exists with `preferred: "before"`, `"after"`, or `"tie"`, the report includes critic-vs-human agreement. If no label exists, manual review is `pending`, not failed.

## Targeted Gate Evidence

`ui-jepa-scale-gate` can consume PR review evidence independently from DOM-aware research gating. PR-review CI should use `--target pr-review`:

```bash
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
  --pr-review-report reports/ui_pr_review_v0/fixture_manual_patch/pr_review_report.json \
  --out reports/ui_jepa_v0_smoke/scale_gate.json
```

Expected exit codes:

- `--target pr-review`: exits `0` when `pr_review_ready: true`, even when `dom_aware_ready: false`.
- `--target dom-aware`: exits `1` while M2.5 blocks DOM-aware JEPA.
- `--target all`: keeps strict research behavior and exits `1` while DOM-aware remains blocked.

Gate JSON includes `target`, `target_ready`, `exit_code_reason`, `pr_review_ready`, `dom_aware_ready`, `blocked_reasons_by_target`, and `recommended_next_stage_by_target`.

PR review readiness requires valid preference critic evidence, valid non-oracle closed-loop evidence, a manual batch that makes `pr_review_foundation_ready: true`, a valid PR review report, no severe missing artifacts, and passing regression thresholds. DOM-aware JEPA remains blocked because M2/M2.5 evidence does not show useful representation signal or a DOM-aware recommendation for this corpus. This means PR screenshot review can pass in CI while DOM-aware JEPA correctly remains blocked.

DOM-aware target check:

```bash
UV_NO_SYNC=1 UV_CACHE_DIR=/tmp/uv-cache uv run ui-jepa-scale-gate \
  --target dom-aware \
  --dataset data/processed/ui_jepa_v0_smoke \
  --b0-report reports/ui_jepa_v0_smoke/b0_report.json \
  --m1-report reports/ui_jepa_v0_smoke/m1_report.json \
  --m2-report reports/ui_jepa_v0_smoke/m2_report.json \
  --m25-report reports/ui_jepa_v0_smoke/m25_diagnostics_report.json \
  --m2-strong-report reports/ui_jepa_v0_smoke/m2_strong_report.json \
  --preference-critic-report reports/ui_jepa_v0_smoke/preference_critic_report.json \
  --closed-loop-report reports/ui_loop_v0_mixed_deterministic/closed_loop_report.json \
  --manual-batch-report reports/ui_loop_v0_manual_batch/combined_manual_patch_report.json \
  --pr-review-report reports/ui_pr_review_v0/fixture_manual_patch/pr_review_report.json
```

## Disabled CI Draft

A future GitHub Actions job should remain artifact-only until more local PR reports are reviewed:

```yaml
# .github/workflows/pr-screenshot-review.yml.disabled
name: PR Screenshot Review
on: pull_request
jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run local screenshot review
        run: |
          UV_NO_SYNC=1 UV_CACHE_DIR=/tmp/uv-cache uv run ui-pr-review \
            --review-id fixture_manual_patch \
            --mode screenshots-only \
            --out reports/ui_pr_review_v0 \
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
            --pr-review-report reports/ui_pr_review_v0/fixture_manual_patch/pr_review_report.json
```

Do not enable auto-commenting yet. CI should upload the artifact contract above and let a human inspect it. The checked-in web pilot supports a disabled artifact-upload draft as the next stage, using `reports/ui_pr_review_v0/codepawl_web_pilot/pilot_report.json` plus each per-case report.

## Before GitHub Bot Integration

Evidence still needed before a GitHub PR bot:

- multiple local PR review reports covering production app routes, not only pilot-only static routes
- completed manual labels for ambiguous cases
- low false-positive rate for `request_changes`
- documented artifact retention paths for screenshots, diffs, JSON, and Markdown summaries
- CI jobs that run with `UV_NO_SYNC=1` and no network access
