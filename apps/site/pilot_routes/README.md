# CodePawl Site Pilot Routes

This directory contains explicit pilot-only static CodePawl web routes for the PR screenshot regression review pilot.

The production `apps/site` app is still a placeholder. These files are controlled route/component artifacts copied from the local CodePawl UI render corpus and selected manual patch imports so the PR review pipeline can run against stable web route files without network, auth, live data, or GitHub Actions.

Serve locally when browser rendering is available:

```bash
python -m http.server 8766 --directory apps/site/pilot_routes
```

Render a route file directly with the repo renderer:

```bash
UV_NO_SYNC=1 UV_CACHE_DIR=/tmp/uv-cache uv run codepawl-render \
  apps/site/pilot_routes/openpawl/docs-api-reference/before.html \
  --out /tmp/codepawl-render-before
```

The checked-in pilot uses `ui-pr-review --pilot-config data/pr_review_v0/codepawl_web_pilot/metadata.json` in `screenshots-only` mode because Chromium is not available in every sandbox.
