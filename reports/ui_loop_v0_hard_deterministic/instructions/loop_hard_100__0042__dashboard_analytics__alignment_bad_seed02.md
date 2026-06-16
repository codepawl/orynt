# loop_hard_100__0042__dashboard_analytics__alignment_bad_seed02

Summary: Fix alignment in a local synthetic UI corruption.

## Ordered Issues
- alignment (medium, confidence=0.64): Realign overflowing content to the viewport and layout grid.

## Concrete Patch Instructions
- Remove synthetic transforms or text alignment overrides that push content off the layout grid or viewport.

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
Improve local synthetic alignment defect for loop_hard_100__0042__dashboard_analytics__alignment_bad_seed02.

Context:
- source_file_path: /home/nxank4/Code/personal/codepawl/data/processed/ui_jepa_v0_smoke/samples/dashboard_analytics/jittered/alignment_bad_seed02/index.html
- before_screenshot_path: /home/nxank4/Code/personal/codepawl/data/processed/ui_jepa_v0_smoke/samples/dashboard_analytics/jittered/alignment_bad_seed02/screenshot.png
- critic_review_json_path: /home/nxank4/Code/personal/codepawl/reports/ui_loop_v0_hard_deterministic/contracts/loop_hard_100__0042__dashboard_analytics__alignment_bad_seed02.critic.json
- issue_summary: alignment issue, difficulty=hard, severity=0.05
- allowed_edit_scope: {'allowed_files': ['after.html'], 'allowed_issue_types': ['alignment'], 'source_is_copied_fixture': True}

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
