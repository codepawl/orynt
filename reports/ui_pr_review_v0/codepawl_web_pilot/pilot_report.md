# CodePawl Web PR Review Pilot

- Pilot ID: codepawl_web_pilot
- Valid: True
- Cases: 4
- Rendered/screenshots-only cases: 4
- Skipped cases: 0
- Approve visual: 4
- Request changes: 0
- Needs manual review: 0
- Blocked missing artifacts: 0
- Mean critic delta: 0.035
- Useful for GitHub Actions artifact integration: True
- Recommended next stage: Add a disabled GitHub Actions artifact-upload job for the PR-review target; keep auto-commenting disabled.

## Web Discovery

- web_app_directory: apps/site/pilot_routes (pilot-only static route files; apps/site and apps/design remain production placeholders)
- local_dev_command: python -m http.server 8766 --directory apps/site/pilot_routes
- local_build_command: not required for static pilot route files
- local_port: 8766
- route_list: ['/openpawl/docs/api-reference', '/cloud/dashboard/ai-agent', '/cloud/dashboard/analytics', '/cloud/app-empty-state']
- render_flow: screenshots-only from checked-in captures in this sandbox; local render mode can render apps/site/pilot_routes/<route>/before.html and after.html with codepawl-render or ui-pr-review when Chromium is available.
- sandbox_browser_render_status: blocked in this sandbox: Chromium launch fails with sandbox_host_linux.cc operation not permitted

## Cases

### docs_api_reference_contrast

- Route/component: /openpawl/docs/api-reference
- Before route file: /home/nxank4/Code/personal/codepawl/apps/site/pilot_routes/openpawl/docs-api-reference/before.html
- After route file: /home/nxank4/Code/personal/codepawl/apps/site/pilot_routes/openpawl/docs-api-reference/after.html
- Before URL: http://127.0.0.1:8766/openpawl/docs-api-reference/before.html
- After URL: http://127.0.0.1:8766/openpawl/docs-api-reference/after.html
- Decision: approve_visual
- Skipped: False
- Skipped reason: None
- Report JSON: /home/nxank4/Code/personal/codepawl/reports/ui_pr_review_v0/codepawl_web_pilot/docs_api_reference_contrast/pr_review_report.json
- Report Markdown: /home/nxank4/Code/personal/codepawl/reports/ui_pr_review_v0/codepawl_web_pilot/docs_api_reference_contrast/pr_review_report.md
- Before screenshot: /home/nxank4/Code/personal/codepawl/reports/ui_pr_review_v0/codepawl_web_pilot/docs_api_reference_contrast/before.png
- After screenshot: /home/nxank4/Code/personal/codepawl/reports/ui_pr_review_v0/codepawl_web_pilot/docs_api_reference_contrast/after.png
- Screenshot diff: /home/nxank4/Code/personal/codepawl/reports/ui_pr_review_v0/codepawl_web_pilot/docs_api_reference_contrast/screenshot_diff.png

### dashboard_ai_agent_alignment

- Route/component: /cloud/dashboard/ai-agent
- Before route file: /home/nxank4/Code/personal/codepawl/apps/site/pilot_routes/cloud/dashboard-ai-agent/before.html
- After route file: /home/nxank4/Code/personal/codepawl/apps/site/pilot_routes/cloud/dashboard-ai-agent/after.html
- Before URL: http://127.0.0.1:8766/cloud/dashboard-ai-agent/before.html
- After URL: http://127.0.0.1:8766/cloud/dashboard-ai-agent/after.html
- Decision: approve_visual
- Skipped: False
- Skipped reason: None
- Report JSON: /home/nxank4/Code/personal/codepawl/reports/ui_pr_review_v0/codepawl_web_pilot/dashboard_ai_agent_alignment/pr_review_report.json
- Report Markdown: /home/nxank4/Code/personal/codepawl/reports/ui_pr_review_v0/codepawl_web_pilot/dashboard_ai_agent_alignment/pr_review_report.md
- Before screenshot: /home/nxank4/Code/personal/codepawl/reports/ui_pr_review_v0/codepawl_web_pilot/dashboard_ai_agent_alignment/before.png
- After screenshot: /home/nxank4/Code/personal/codepawl/reports/ui_pr_review_v0/codepawl_web_pilot/dashboard_ai_agent_alignment/after.png
- Screenshot diff: /home/nxank4/Code/personal/codepawl/reports/ui_pr_review_v0/codepawl_web_pilot/dashboard_ai_agent_alignment/screenshot_diff.png

### dashboard_analytics_hierarchy

- Route/component: /cloud/dashboard/analytics
- Before route file: /home/nxank4/Code/personal/codepawl/apps/site/pilot_routes/cloud/dashboard-analytics/before.html
- After route file: /home/nxank4/Code/personal/codepawl/apps/site/pilot_routes/cloud/dashboard-analytics/after.html
- Before URL: http://127.0.0.1:8766/cloud/dashboard-analytics/before.html
- After URL: http://127.0.0.1:8766/cloud/dashboard-analytics/after.html
- Decision: approve_visual
- Skipped: False
- Skipped reason: None
- Report JSON: /home/nxank4/Code/personal/codepawl/reports/ui_pr_review_v0/codepawl_web_pilot/dashboard_analytics_hierarchy/pr_review_report.json
- Report Markdown: /home/nxank4/Code/personal/codepawl/reports/ui_pr_review_v0/codepawl_web_pilot/dashboard_analytics_hierarchy/pr_review_report.md
- Before screenshot: /home/nxank4/Code/personal/codepawl/reports/ui_pr_review_v0/codepawl_web_pilot/dashboard_analytics_hierarchy/before.png
- After screenshot: /home/nxank4/Code/personal/codepawl/reports/ui_pr_review_v0/codepawl_web_pilot/dashboard_analytics_hierarchy/after.png
- Screenshot diff: /home/nxank4/Code/personal/codepawl/reports/ui_pr_review_v0/codepawl_web_pilot/dashboard_analytics_hierarchy/screenshot_diff.png

### app_empty_state_spacing

- Route/component: /cloud/app-empty-state
- Before route file: /home/nxank4/Code/personal/codepawl/apps/site/pilot_routes/cloud/app-empty-state/before.html
- After route file: /home/nxank4/Code/personal/codepawl/apps/site/pilot_routes/cloud/app-empty-state/after.html
- Before URL: http://127.0.0.1:8766/cloud/app-empty-state/before.html
- After URL: http://127.0.0.1:8766/cloud/app-empty-state/after.html
- Decision: approve_visual
- Skipped: False
- Skipped reason: None
- Report JSON: /home/nxank4/Code/personal/codepawl/reports/ui_pr_review_v0/codepawl_web_pilot/app_empty_state_spacing/pr_review_report.json
- Report Markdown: /home/nxank4/Code/personal/codepawl/reports/ui_pr_review_v0/codepawl_web_pilot/app_empty_state_spacing/pr_review_report.md
- Before screenshot: /home/nxank4/Code/personal/codepawl/reports/ui_pr_review_v0/codepawl_web_pilot/app_empty_state_spacing/before.png
- After screenshot: /home/nxank4/Code/personal/codepawl/reports/ui_pr_review_v0/codepawl_web_pilot/app_empty_state_spacing/after.png
- Screenshot diff: None

All pilot evidence is local artifact-based. DOM-aware JEPA remains blocked.
