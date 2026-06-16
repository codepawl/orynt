# Codex Patch Contract: loop_hard_100__0029__dashboard_ai_agent__hierarchy_bad_seed05

Goal:
Improve local synthetic hierarchy defect for loop_hard_100__0029__dashboard_ai_agent__hierarchy_bad_seed05.

Context:
- source file path: /home/nxank4/Code/personal/codepawl/data/processed/ui_jepa_v0_smoke/samples/dashboard_ai_agent/jittered/hierarchy_bad_seed05/index.html
- before screenshot path: /home/nxank4/Code/personal/codepawl/data/processed/ui_jepa_v0_smoke/samples/dashboard_ai_agent/jittered/hierarchy_bad_seed05/screenshot.png
- critic review JSON path: /home/nxank4/Code/personal/codepawl/reports/ui_loop_v0_hard_deterministic/contracts/loop_hard_100__0029__dashboard_ai_agent__hierarchy_bad_seed05.critic.json
- issue summary: hierarchy issue, difficulty=hard, severity=0.0562
- allowed edit scope: {'allowed_files': ['after.html'], 'allowed_issue_types': ['hierarchy'], 'source_is_copied_fixture': True}

Constraints:
- Do not call external LLM APIs.
- Do not use external services.
- Do not edit source fixtures; patch only copied loop work artifacts.
- Keep viewport, content, and semantic structure unchanged unless the issue requires a local CSS fix.
- Report synthetic/local preference improvement only; do not claim human taste improvement.

Done when:
- Patched HTML is saved under the expected manual patch directory or imported by ui-loop-run.
- Before/after score, screenshots, and patch diff are present in the report.
- No accessibility, overflow, or responsive regression is introduced.
- Oracle source files are not copied for non-oracle modes.

Validation commands:
- `UV_NO_SYNC=1 UV_CACHE_DIR=/tmp/uv-cache uv run ui-loop-run data/processed/ui_loop_v0/loop_easy_20 --patch-mode instruction_only`
- `UV_NO_SYNC=1 UV_CACHE_DIR=/tmp/uv-cache uv run ui-loop-run data/processed/ui_loop_v0/loop_easy_20 --patch-mode deterministic_patch --limit 4`

Expected artifact paths:
- after_html_path: reports/ui_loop_v0/work/loop_hard_100__0029__dashboard_ai_agent__hierarchy_bad_seed05/manual_patch_import/after.html
- patch_diff_path: data/manual_patches/ui_loop_v0/loop_hard_100__0029__dashboard_ai_agent__hierarchy_bad_seed05/patch.diff
- manual_notes_path: data/manual_patches/ui_loop_v0/loop_hard_100__0029__dashboard_ai_agent__hierarchy_bad_seed05/notes.json
- manual_review_label_path: data/manual_patches/ui_loop_v0/manual_review_labels.jsonl

Acceptance criteria:
- Critic issue count should not increase.
- Contrast issue count and overflow metrics should not regress.
- Deterministic quality score should stay flat or improve.
- Before/after screenshots and metrics must be saved in the loop report.
