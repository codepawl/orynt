# Local Harness App

Command-line entry points for local CodePawl research harnesses.

The first command is `codepawl-render`, which renders a local HTML file with headless Chromium and writes screenshot, DOM, accessibility, and metrics artifacts.

Example:

```bash
uv run codepawl-render examples/simple_landing.html --out artifacts/render_baseline
```
