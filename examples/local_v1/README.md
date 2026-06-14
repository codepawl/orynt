# local_v1 HTML Example Pack

`local_v1` is a self-controlled PawlBench Design fixture pack. Every page is static, fictional, standalone HTML with inline CSS and no external assets, fonts, scripts, APIs, logos, screenshots, or brand references.

Purpose:

- provide a larger local dataset than `local_v0`
- exercise landing, pricing, dashboard, docs, settings, onboarding, portfolio, and empty-state layouts
- support deterministic render, jitter, validation, split, and report workflows
- keep all source examples compatible with `docs/DATA_POLICY.md`, `docs/REFERENCES_POLICY.md`, and `docs/STYLE_TAXONOMY.md`

Build and validate:

```bash
uv run pawlbench-design-build examples/local_v1 --out artifacts/datasets/local_v1 --seed 42
uv run pawlbench-design-validate artifacts/datasets/local_v1 --out artifacts/datasets/local_v1_validation
uv run pawlbench-design-split artifacts/datasets/local_v1 --out artifacts/datasets/local_v1_splits --seed 42
uv run pawlbench-design-report artifacts/datasets/local_v1 --out artifacts/datasets/local_v1_report
```

All product names and page copy are fictional. These examples are intentionally simple enough to maintain while still giving jitter variants meaningful spacing, contrast, alignment, and hierarchy changes.
