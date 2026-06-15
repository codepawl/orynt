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

Inspect metric deltas in the evaluator output:

```bash
python -m json.tool artifacts/pawlbench_eval/pairs.json
```

Each pair record includes `original_metrics`, `variant_metrics`, and deltas including `contrast_issue_delta`, `min_contrast_ratio_delta`, `font_size_ratio_delta`, `viewport_fill_ratio_delta`, and `horizontal_overflow_delta`. The `contrast_bad` variant should show increased contrast issues and a lower minimum contrast ratio than the original.

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

## Batch Dataset Build

Build a local dataset from every HTML fixture:

```bash
uv run pawlbench-design-build examples --out artifacts/datasets/local_v0 --seed 42
cat artifacts/datasets/local_v0/dataset.json
```

The builder creates one `samples/<sample_id>/` directory per discovered HTML file, reuses the jitter and render pipeline for original plus variants, and stores aggregate metric deltas in `dataset.json`.

Useful checks:

```bash
python -m json.tool artifacts/datasets/local_v0/dataset.json
find artifacts/datasets/local_v0/samples -maxdepth 3 -type f | sort
```

## Dataset QA

Validate, split, and report before using the dataset for encoder baselines:

```bash
uv run pawlbench-design-validate artifacts/datasets/local_v0 --out artifacts/datasets/local_v0_validation
uv run pawlbench-design-split artifacts/datasets/local_v0 --out artifacts/datasets/local_v0_splits --seed 42
uv run pawlbench-design-report artifacts/datasets/local_v0 --out artifacts/datasets/local_v0_report
```

Useful checks:

```bash
cat artifacts/datasets/local_v0_validation/validation.json
cat artifacts/datasets/local_v0_splits/splits.json
cat artifacts/datasets/local_v0_report/report.md
```

Splits are sample-level, so all variants for a `sample_id` stay in exactly one split.

## Hard Preference Dataset

Create variant-vs-variant hard preference pairs from `local_v1` so pairwise labeling is not limited to original-vs-jittered comparisons:

```bash
uv run pawlbench-design-hard-pairs artifacts/datasets/local_v1 --out artifacts/datasets/hard_pref_v1 --seed 42
uv run pawlbench-design-label-app artifacts/datasets/hard_pref_v1/review --labeler-id an
uv run pawlbench-design-label-validate artifacts/datasets/hard_pref_v1/suggested_labels.jsonl --queue artifacts/datasets/hard_pref_v1/review/queue.jsonl --out artifacts/datasets/hard_pref_v1/suggested_validation
uv run pawlbench-design-label-report artifacts/datasets/hard_pref_v1/review/labels.jsonl --queue artifacts/datasets/hard_pref_v1/review/queue.jsonl --out artifacts/datasets/hard_pref_v1/label_report
```

Hard-pair suggestions are deterministic metric heuristics with `review_status: "suggested"` and must be reviewed before they become human labels.
