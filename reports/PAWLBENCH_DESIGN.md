# PawlBench Design

## Benchmark Purpose

PawlBench Design will evaluate whether CodePawl Design and Pawl-JEPA improve frontend design critique and generation quality using local, reproducible render artifacts.

The benchmark should start small and inspectable. Each task should have clear input files, expected artifacts, metrics, and baseline comparisons.

## Planned Task Types

- Static landing page render quality
- Responsive layout behavior across viewport sizes
- Accessibility tree completeness and issue detection
- Visual hierarchy and spacing consistency
- Controlled jitter detection
- Before/after design improvement ranking
- Component-level regression checks

## Planned Metrics

- Screenshot availability and dimensions
- DOM node counts and semantic element coverage
- Accessibility role/name coverage
- Contrast and readable text checks
- Layout overflow and clipping counts
- Spacing and alignment summaries
- Responsive breakpoint differences
- Human-labeled preference agreement when labels exist

## UI Metrics v1

Render artifacts include lightweight deterministic metrics extracted from the browser page with Playwright evaluation. These metrics are local-first and do not use model inference.

Contrast metrics traverse visible text elements, read computed foreground color plus effective background color, and apply WCAG-style thresholds:

- `contrast_issue_count`
- `min_contrast_ratio`
- `average_contrast_ratio`
- `contrast_checked_text_node_count`
- `contrast_issues` samples with selector, tag, text snippet, ratio, and threshold

Typography hierarchy metrics summarize visible text sizing and prominence:

- `max_font_size`
- `min_font_size`
- `font_size_ratio`
- `heading_count`
- `cta_like_element_count`
- `hierarchy_warning_count`

Layout metrics summarize visible element boxes and overflow:

- `visible_element_count`
- `average_element_area`
- `median_element_area`
- `viewport_fill_ratio`
- `horizontal_overflow_px`
- `vertical_scroll_height`
- `max_right_overflow_px`

## v0 Pair Evaluator Contract

PawlBench Design v0 validates and scores generated jitter pair directories before any encoder baseline or Pawl-JEPA microtraining work.

Command:

```bash
uv run pawlbench-design-eval artifacts/jitter_pairs --out artifacts/pawlbench_eval
```

Input contract:

- `labels.json` exists at the pair root.
- `original/screenshot.png` exists.
- `original/metrics.json` exists.
- each label variant has `variant_name`, `defect_type`, `severity`, `html_path`, `screenshot_path`, `dom_path`, `accessibility_path`, `metrics_path`, `expected_issue`, and `expected_fix_instruction`.
- each referenced variant HTML, screenshot, DOM, accessibility, and metrics artifact exists.

Outputs:

- `summary.json`: aggregate validity, counts, average image deltas, and variants by defect type.
- `pairs.json`: one record per variant with label metadata and pair-level image metrics.

v0 image metrics:

- `image_width`
- `image_height`
- `mean_absolute_pixel_delta`
- `rms_pixel_delta`
- `changed_pixel_ratio`
- `original_file_size_bytes`
- `variant_file_size_bytes`

When variant `metrics.json` is available, `pairs.json` also includes:

- `dom_node_count`
- `body_text_length`
- `has_horizontal_overflow`
- `has_vertical_overflow`
- `original_metrics`
- `variant_metrics`
- `contrast_issue_delta`
- `min_contrast_ratio_delta`
- `font_size_ratio_delta`
- `viewport_fill_ratio_delta`
- `horizontal_overflow_delta`

## Dataset Builder Contract

PawlBench Design can batch local HTML examples into a structured dataset without adding model inference or hosted services.

Command:

```bash
uv run pawlbench-design-build examples --out artifacts/datasets/local_v0 --seed 42
```

Input contract:

- input is a directory.
- static `.html` files are discovered recursively.
- `--limit` restricts the sorted input list.
- default behavior overwrites output atomically for deterministic local reruns.
- `--no-overwrite` fails if the output directory already exists.
- one failed HTML sample is recorded and processing continues unless `--fail-fast` is set.

Output contract:

- `dataset.json`: dataset metadata, sample records, failed records, and aggregate metrics.
- `samples/<sample_id>/labels.json`
- `samples/<sample_id>/original/{index.html,screenshot.png,dom.json,accessibility.json,metrics.json}`
- `samples/<sample_id>/jittered/<variant>/{index.html,screenshot.png,dom.json,accessibility.json,metrics.json}`
- `samples/<sample_id>/eval/{summary.json,pairs.json}` for reused pair-evaluator metrics.

`dataset.json` fields:

- `dataset_id`
- `source_dir`
- `output_dir`
- `seed`
- `generated_at`
- `sample_count`
- `variant_count`
- `failed_count`
- `samples`
- `aggregate_metrics`

Aggregate metrics are grouped by `defect_type`:

- `average_contrast_issue_delta`
- `average_min_contrast_ratio_delta`
- `average_font_size_ratio_delta`
- `average_changed_pixel_ratio`

## Dataset QA Contracts

Validation checks the current dataset format and writes `validation.json`.

Command:

```bash
uv run pawlbench-design-validate artifacts/datasets/local_v0 --out artifacts/datasets/local_v0_validation
```

Validation output includes:

- `valid`
- `errors`
- `warnings`
- `sample_count_actual`
- `variant_count_actual`
- `defect_type_counts`
- `metric_coverage`

The validator checks `dataset.json`, count consistency, original artifacts, variant artifacts, required UI metrics v1 fields, and coverage for each defect type.

Splits are deterministic by `sample_id`, not by variant, so variants from one original page do not leak across train/val/test.

Command:

```bash
uv run pawlbench-design-split artifacts/datasets/local_v0 --out artifacts/datasets/local_v0_splits --seed 42
```

Split outputs:

- `splits.json`: seed, ratios, sample counts, record counts, split sample IDs, and leakage check.
- `train.jsonl`
- `val.jsonl`
- `test.jsonl`

Default ratios are 80% train, 10% val, and 10% test. Tiny datasets use deterministic floor-based counts, so one or more splits may be empty.

Report export writes a markdown summary plus machine-readable facts.

Command:

```bash
uv run pawlbench-design-report artifacts/datasets/local_v0 --out artifacts/datasets/local_v0_report
```

Report outputs:

- `report.md`
- `summary.json`

The report includes dataset id, sample count, variant count, failed count, defect distribution, aggregate metric deltas, validation status, known limitations, and the next recommended step.

## Lightweight Encoder Baseline Contract

Before adding DINOv2, SigLIP, CLIP, Pawl-JEPA, or any heavy ML dependency, PawlBench Design provides cheap deterministic baselines for comparing jittered screenshots to the original.

Command:

```bash
uv run pawlbench-design-embed artifacts/jitter_pairs --out artifacts/encoder_baselines
```

Outputs:

- `embeddings.json`: original and per-variant vectors.
- `similarities.json`: cosine similarity between each jittered variant and the original for every baseline.
- `summary.json`: aggregate average similarities and lowest-similarity variant per baseline.

Baseline names:

- `thumbnail_rgb_16x16`: resized RGB screenshot flattened and normalized.
- `color_histogram_rgb`: fixed RGB channel histograms.
- `grayscale_edge_density`: simple grayscale edge magnitude summary.
- `dom_layout_stats`: DOM/layout summary using real `dom.json` and `metrics.json` artifacts for the original and each variant.

If a variant is missing DOM or metrics artifacts, `summary.json` includes a warning and the variant receives a zero `dom_layout_stats` vector. The baseline must not silently infer replacement layout values from HTML when render artifacts are missing.

These are not learned encoders. They are sanity-check baselines for later model comparisons.

## Baseline Model Comparison Plan

Start with simple baselines before Pawl-JEPA training:

- rules-based metrics from DOM, accessibility, and layout data
- screenshot-only image embeddings
- DOM-only structural summaries
- combined handcrafted feature vectors
- general-purpose multimodal model critique outputs where locally available or explicitly configured

Pawl-JEPA should only be considered useful when it beats these baselines on a documented benchmark task.
