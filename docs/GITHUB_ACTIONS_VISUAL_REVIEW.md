# GitHub Actions Visual Review

Status: enabled manual-only artifact workflow for PR Screenshot Regression Review v0. It does not train models, call external APIs, run CUDA jobs, post to PRs, enable a required check, or run the DOM-aware gate.

The active workflow is:

```text
.github/workflows/pr-visual-review.yml
```

Run it from GitHub Actions with **Run workflow**. The default `review_id` is `codepawl_web_pilot`, which writes `reports/ui_pr_review_v0/codepawl_web_pilot/`. Keep `upload_artifacts` enabled unless you are only checking failure behavior.

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

Run the same artifact-only sequence as the workflow without GitHub Actions:

```bash
UV_NO_SYNC=1 UV_CACHE_DIR=/tmp/uv-cache uv run ui-pr-review-ci \
  --target pr-review \
  --out reports/ui_pr_review_v0/codepawl_web_pilot \
  --gate-out reports/ui_jepa_v0_smoke/scale_gate_pr_review.json \
  --reviewer-id ci

UV_NO_SYNC=1 UV_CACHE_DIR=/tmp/uv-cache uv run ui-pr-review-ci \
  --validate-only \
  --target pr-review \
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

## Workflow Trigger

The workflow is manual-only by design:

```yaml
on:
  workflow_dispatch:
```

Do not add the workflow as a required branch protection check yet. A failed manual run should block only the manual run, not a pull request merge.

Future pull request trigger snippet, intentionally not active:

```yaml
on:
  pull_request:
    paths:
      - "apps/**"
      - "packages/**"
      - "frontend/**"
```

Enable the pull request trigger only after Phase 10A has 5-10 additional real frontend changes with useful uploaded artifacts, no missed regressions, acceptable false positives, and reviewer agreement that the artifact bundle is worth inspecting.

## Why The Target Is `pr-review`

`ui-jepa-scale-gate --target pr-review` checks the PR Screenshot Regression Review evidence and can pass while DOM-aware JEPA remains blocked. This is intentional: PR screenshot artifact review is ready for manual artifact upload, but DOM-aware JEPA still lacks useful representation evidence.

The workflow must not run `--target dom-aware` or `--target all`, because those targets correctly fail while DOM-aware JEPA remains blocked.

## Disabled Automation

The workflow only uploads `codepawl-pr-visual-review`. Posting to PRs is intentionally off until there is evidence from multiple production-route reports showing a low false-positive rate for `request_changes`, completed manual labels for ambiguous cases, stable artifact retention, and reviewer agreement that the artifact bundle is useful enough to become a required check.

Add PR comments only after the artifact-only workflow is useful on real pull requests, the comment content is human-reviewed, and comment permissions can stay narrowly scoped. Until then, keep `permissions: contents: read` and do not grant `pull-requests: write`, `issues: write`, or comment permissions.
