# loop_mixed_50__0010__app_empty_state__spacing_bad_seed02

Summary: Fix spacing in a local synthetic UI corruption.

## Ordered Issues
- spacing (medium, confidence=0.64): Normalize card padding and vertical rhythm using the existing spacing scale.

## Concrete Patch Instructions
- Remove synthetic spacing compression and restore the existing page spacing scale, card padding, gaps, and line-height.

## Allowed Files
- after.html

## Do Not Change
- Do not call external LLM APIs.
- Do not use external services.
- Do not edit source fixtures; patch only copied loop work artifacts.
- Keep viewport, content, and semantic structure unchanged unless the issue requires a local CSS fix.
- Report synthetic/local preference improvement only; do not claim human taste improvement.

## Validation Commands
- `UV_NO_SYNC=1 UV_CACHE_DIR=/tmp/uv-cache uv run ui-loop-run data/processed/ui_loop_v0/loop_easy_20 --patch-mode instruction_only`
- `UV_NO_SYNC=1 UV_CACHE_DIR=/tmp/uv-cache uv run ui-loop-run data/processed/ui_loop_v0/loop_easy_20 --patch-mode deterministic_patch --limit 4`

## Expected Visual Improvement Criteria
- Critic issue count should not increase.
- Contrast issue count and overflow metrics should not regress.
- Deterministic quality score should stay flat or improve.
- Before/after screenshots and metrics must be saved in the loop report.

## Codex-Compatible Work Contract

Goal:
Improve local synthetic spacing defect for loop_mixed_50__0010__app_empty_state__spacing_bad_seed02.

Context:
- source_file_path: /home/nxank4/Code/personal/codepawl/data/processed/ui_jepa_v0_smoke/samples/app_empty_state/jittered/spacing_bad_seed02/index.html
- before_screenshot_path: /home/nxank4/Code/personal/codepawl/data/processed/ui_jepa_v0_smoke/samples/app_empty_state/jittered/spacing_bad_seed02/screenshot.png
- critic_review_json_path: /home/nxank4/Code/personal/codepawl/reports/ui_loop_v0_manual_batch/mixed_manual_patch_import/contracts/loop_mixed_50__0010__app_empty_state__spacing_bad_seed02.critic.json
- issue_summary: spacing issue, difficulty=hard, severity=0.1748
- allowed_edit_scope: {'allowed_files': ['after.html'], 'allowed_issue_types': ['spacing'], 'source_is_copied_fixture': True}

Constraints:
- Do not call external LLM APIs.
- Do not use external services.
- Do not edit source fixtures; patch only copied loop work artifacts.
- Keep viewport, content, and semantic structure unchanged unless the issue requires a local CSS fix.
- Report synthetic/local preference improvement only; do not claim human taste improvement.

Done when:
- A patched after.html exists or the artifact is instruction-only/manual mode.
- After render artifacts and before/after scoring are present.
- No accessibility or overflow regression is introduced.
- No external services were used.
