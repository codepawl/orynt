# 002 Jitter Pairs

Goal: create controlled UI perturbation pairs from baseline examples and compare render artifacts across the pair.

Synthetic good/bad UI pairs let Pawl-JEPA learn from targeted design defects before real labeled datasets exist. Each pair keeps the clean original HTML and generates degraded variants for spacing, contrast, alignment, and hierarchy.

The first command is:

```bash
uv run codepawl-jitter examples/simple_landing.html --out artifacts/jitter_pairs --seed 42
command find artifacts/jitter_pairs -maxdepth 3 -type f | sort
cat artifacts/jitter_pairs/labels.json
```

Evaluate the generated pair directory:

```bash
uv run pawlbench-design-eval artifacts/jitter_pairs --out artifacts/pawlbench_eval
cat artifacts/pawlbench_eval/summary.json
cat artifacts/pawlbench_eval/pairs.json
```

Expected output:

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

`labels.json` points to `html_path`, `screenshot_path`, `dom_path`, `accessibility_path`, and `metrics_path` for each variant.

The current implementation uses deterministic CSS injection only. It does not train a model, launch a product UI, or require a JavaScript build pipeline.

PawlBench Design v0 should pass on the generated directory before adding encoder baselines.
