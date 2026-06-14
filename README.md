# CodePawl

CodePawl is the company and platform for AI-assisted frontend design systems. The current pivot is focused on one product line: CodePawl Design.

CodePawl Design is planned as an AI frontend design platform that can inspect rendered interfaces, critique UI quality, compare variants, and eventually help generate better frontend work. This repository is intentionally starting with the research and evaluation foundation instead of a polished product shell.

Pawl-JEPA is a planned JEPA-style UI representation model for frontend design critique. Its job is to learn useful representations from rendered UI evidence such as screenshots, DOM structure, accessibility trees, layout metrics, and paired perturbations. It is not implemented yet, and this repo does not train a model today.

PawlBench Design is the planned benchmark and evaluation suite for measuring frontend design quality, robustness, accessibility, and generation improvements. It will grow from the same local render harness used to collect data for Pawl-JEPA.

## Current Milestone

The first milestone is a local render and evaluation harness. Before adding product UI, auth, billing, databases, deployment, hosted inference, or model training, the repo renders static examples locally and collects:

- `screenshot.png`
- `dom.json`
- `accessibility.json`
- `metrics.json`
- reproducible artifact folders for experiments

`metrics.json` now includes deterministic UI metrics v1 extracted from the rendered page:

- contrast checks for visible text, including `contrast_issue_count`, `min_contrast_ratio`, `average_contrast_ratio`, `contrast_checked_text_node_count`, and sampled `contrast_issues`
- typography hierarchy signals such as `max_font_size`, `min_font_size`, `font_size_ratio`, `heading_count`, `cta_like_element_count`, and `hierarchy_warning_count`
- layout/spacing signals such as `visible_element_count`, element-area summaries, `viewport_fill_ratio`, `horizontal_overflow_px`, `vertical_scroll_height`, and `max_right_overflow_px`

Run the first harness command with:

```bash
uv run codepawl-render examples/simple_landing.html --out artifacts/render_baseline
```

Then generate deterministic synthetic good/bad UI pairs with:

```bash
uv run codepawl-jitter examples/simple_landing.html --out artifacts/jitter_pairs --seed 42
```

Then validate and score the pair directory with PawlBench Design v0:

```bash
uv run pawlbench-design-eval artifacts/jitter_pairs --out artifacts/pawlbench_eval
```

Then build lightweight non-ML encoder baselines:

```bash
uv run pawlbench-design-embed artifacts/jitter_pairs --out artifacts/encoder_baselines
```

## Repository Layout

```text
apps/
  site/                  Product web app placeholder.
  design/                CodePawl Design product placeholder.
  harness/               Local render/evaluation CLI.
packages/
  renderer/              Playwright rendering package.
  metrics/               Basic UI metrics package.
  jitter/                Deterministic CSS perturbation package.
  generators/            Future fixture and prompt generator package.
  pawl_jepa/             Future model research package.
  pawlbench_design/      Future benchmark package.
experiments/             Staged experiment notes.
reports/                 Research plans and experiment log.
examples/                Static examples for local harness tests.
artifacts/               Local generated outputs, ignored by git.
tests/                   Scaffold and future harness tests.
```

## Setup

This repo is Python-first and uses `uv`.

On Fedora/Linux:

```bash
sudo dnf install -y python3 python3-pip
curl -LsSf https://astral.sh/uv/install.sh | sh
uv sync
uv run playwright install chromium
uv run pytest
```

If `uv` is already installed:

```bash
uv sync
uv run playwright install chromium
uv run pytest
```

Some Fedora systems need Chromium runtime libraries before Playwright can launch the browser. If Chromium fails to start, install Playwright's Linux dependencies or the equivalent Fedora packages:

```bash
uv run playwright install-deps chromium
```

Then run the local render baseline:

```bash
uv run codepawl-render examples/simple_landing.html --out artifacts/render_baseline
```

Expected outputs:

```text
artifacts/render_baseline/
  screenshot.png
  dom.json
  accessibility.json
  metrics.json
```

Then run the first jitter pair experiment:

```bash
uv run codepawl-jitter examples/simple_landing.html --out artifacts/jitter_pairs --seed 42
command find artifacts/jitter_pairs -maxdepth 3 -type f | sort
cat artifacts/jitter_pairs/labels.json
```

Expected outputs:

```text
artifacts/jitter_pairs/
  labels.json
  original/
    index.html
    screenshot.png
    dom.json
    accessibility.json
    metrics.json
  jittered/
    spacing_bad/
      index.html
      screenshot.png
      dom.json
      accessibility.json
      metrics.json
    contrast_bad/
      index.html
      screenshot.png
      dom.json
      accessibility.json
      metrics.json
    alignment_bad/
      index.html
      screenshot.png
      dom.json
      accessibility.json
      metrics.json
    hierarchy_bad/
      index.html
      screenshot.png
      dom.json
      accessibility.json
      metrics.json
```

Evaluate the generated pairs:

```bash
uv run pawlbench-design-eval artifacts/jitter_pairs --out artifacts/pawlbench_eval
cat artifacts/pawlbench_eval/summary.json
cat artifacts/pawlbench_eval/pairs.json
```

Each `pairs.json` record includes an `original_metrics` subset, a `variant_metrics` subset, and simple deltas for contrast, hierarchy scale, viewport fill, and horizontal overflow.

Expected outputs:

```text
artifacts/pawlbench_eval/
  summary.json
  pairs.json
```

Build lightweight encoder baselines:

```bash
uv run pawlbench-design-embed artifacts/jitter_pairs --out artifacts/encoder_baselines
cat artifacts/encoder_baselines/summary.json
```

`dom_layout_stats` uses real `dom.json` and `metrics.json` artifacts for each variant. Missing variant DOM or metrics artifacts are reported in `summary.json` warnings.

Expected outputs:

```text
artifacts/encoder_baselines/
  embeddings.json
  similarities.json
  summary.json
```

## What Is Intentionally Missing

This scaffold does not include auth, billing, database code, cloud deployment, hosted inference, model training, or a full frontend product. Those should wait until the render harness and evaluation loop are useful locally.
