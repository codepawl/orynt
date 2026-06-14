# codepawl-renderer

Python package for the future local Playwright render harness.

Responsibilities:

- accept an HTML file or URL
- render it in a reproducible browser context
- capture screenshots
- capture DOM and accessibility snapshots
- collect basic layout and page metrics
- write artifacts to a local output directory

The first implementation supports local `.html` files using absolute `file://` URLs and headless Chromium.
