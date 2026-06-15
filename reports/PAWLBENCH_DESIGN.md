# PawlBench Design

## Benchmark Purpose

PawlBench Design will evaluate whether CodePawl Design and Pawl-JEPA improve frontend design critique and generation quality using local, reproducible render artifacts.

The benchmark should start small and inspectable. Each task should have clear input files, expected artifacts, metrics, and baseline comparisons.

Before scaling beyond local fixtures, dataset work must follow:

- `docs/DATA_POLICY.md`
- `docs/REFERENCES_POLICY.md`
- `docs/STYLE_TAXONOMY.md`

PawlBench training and release artifacts should use self-controlled, generated, explicitly permitted, or compatible open-source data. Private style notes are reference material only.

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

## Style Taxonomy

Initial human-label and report dimensions are defined in `docs/STYLE_TAXONOMY.md`:

- visual hierarchy
- spacing rhythm
- CTA prominence
- contrast/accessibility
- density
- polish
- generic-AI-slop risk
- brand fit
- motion readiness
- responsive structure
- dashboard clarity
- landing-page clarity

These dimensions provide shared language for local_v1 examples, future human labels, reports, and metric-proxy experiments.

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

## Pawl-JEPA Consumption Contract

Pawl-JEPA microtraining consumes existing split files rather than re-splitting data, preserving sample-level leakage protection from `pawlbench-design-split`.

Manifest command:

```bash
uv run pawl-jepa-prepare artifacts/datasets/local_v1_splits --labels data/labels/local_v1_train/labels.reviewed.jsonl --out artifacts/pawl_jepa/local_v1_manifest
```

Inputs:

- `artifacts/datasets/local_v1_splits/{train,val,test}.jsonl`
- optional reviewed label JSONL keyed by `label_id`

Outputs:

- `manifest.json`
- `train.jsonl`
- `val.jsonl`
- `test.jsonl`

Each manifest row preserves dataset/sample/variant metadata, original and variant screenshot paths, defect type, metric deltas, label provenance, severity, tags, confidence, reviewer fields, and a normalized `preferred_item`. Reviewed labels use `preferred` plus `left_item`/`right_item` to map randomized A/B choices back to `original`, `variant`, `tie`, or `unclear`. Missing labels fall back to the synthetic assumption that `original` is preferred over `variant`.

## Human Labeling v0 Contract

PawlBench Design human labeling v0 creates local pairwise preference and critique labels from existing split JSONL files. It uses only local artifacts and a static HTML review sheet.

Queue command:

```bash
uv run pawlbench-design-label-queue artifacts/datasets/local_v1_splits/train.jsonl --out artifacts/labels/local_v1_train --seed 42 --limit 100
```

Queue outputs:

- `queue.jsonl`: one original-vs-variant pair per line.
- `labels.empty.jsonl`: empty starter file for completed labels.
- `label_schema.json`: required fields, enums, and tag vocabularies.
- `review.html`: static local review sheet with screenshots and copyable JSON label templates.
- `README.md`: local labeling instructions.

Each queue record includes a stable `label_id`, dataset/split/sample/variant metadata, randomized left/right assignment, original and variant artifact paths, expected issue and fix text, defect type, and metric deltas.

Suggestion command:

```bash
uv run pawlbench-design-label-suggest artifacts/labels/local_v1_train/queue.jsonl --out artifacts/labels/local_v1_train/suggested_labels.jsonl
```

Suggestions are deterministic rule outputs from synthetic-jitter metadata. They may prefill preference, tags, severity, reason, fix instruction, and confidence, but they are not human labels until a reviewer confirms, edits, or marks them unclear.

Completed label records include:

- `label_id`, `dataset_id`, `split`, `sample_id`, `variant_name`, `defect_type`
- `left_item` and `right_item`: `original` or `variant`
- `preferred`: `left`, `right`, `tie`, or `unclear`
- `defect_tags` and `quality_tags`
- `severity`: `none`, `low`, `medium`, or `high`
- `fix_instruction`, `reason`, `confidence`, `labeler_id`, and `created_at`

Validation command:

```bash
uv run pawlbench-design-label-validate artifacts/labels/local_v1_train/labels.jsonl --queue artifacts/labels/local_v1_train/queue.jsonl --out artifacts/labels/local_v1_train_validation
```

Validation writes `validation.json` with schema errors, warnings, coverage, duplicate checks, and counts by defect type, preference, and severity. Partial coverage is a warning, not a schema error.

Report command:

```bash
uv run pawlbench-design-label-report artifacts/labels/local_v1_train/labels.jsonl --queue artifacts/labels/local_v1_train/queue.jsonl --out artifacts/labels/local_v1_train_report
```

Report outputs:

- `report.md`
- `summary.json`

The report summarizes coverage, preference counts, defect tag counts, quality tag counts, severity counts, common fix instructions, and v0 limitations.

## Hard Preference Dataset v1

Hard preference v1 creates variant-vs-variant A/B pairs from an existing PawlBench dataset so pairwise labels are not trivially solved by always preferring the original.

Generation command:

```bash
uv run pawlbench-design-hard-pairs artifacts/datasets/local_v1 --out artifacts/datasets/hard_pref_v1 --seed 42
```

Outputs:

- `hard_pairs.jsonl`: one variant-vs-variant pair per line.
- `suggested_labels.jsonl`: heuristic suggestions with `review_status: "suggested"`.
- `summary.json`: counts, templates, seed, and warning metadata.
- `review/queue.jsonl`: label-app queue for human review.
- `review/suggested_labels.jsonl`: suggestions beside the review queue for app prefill.
- `review/README.md`: local review instructions.

Pair templates:

- `contrast_bad` vs `spacing_bad`
- `hierarchy_bad` vs `alignment_bad`
- `spacing_bad` vs `hierarchy_bad`

No hard preference pair includes the original UI. Left/right assignment is deterministic by seed. Suggested preference uses metric heuristics: fewer contrast issues, higher minimum contrast ratio, better font-size ratio, fewer hierarchy warnings, and changed-pixel fallback if available. Suggestions are not human labels until a reviewer confirms, edits, or marks them unclear.

Review, validate, and report commands:

```bash
uv run pawlbench-design-label-app artifacts/datasets/hard_pref_v1/review --labeler-id an
uv run pawlbench-design-label-validate artifacts/datasets/hard_pref_v1/suggested_labels.jsonl --queue artifacts/datasets/hard_pref_v1/review/queue.jsonl --out artifacts/datasets/hard_pref_v1/suggested_validation
uv run pawlbench-design-label-validate artifacts/datasets/hard_pref_v1/review/labels.jsonl --queue artifacts/datasets/hard_pref_v1/review/queue.jsonl --out artifacts/datasets/hard_pref_v1/label_validation
uv run pawlbench-design-label-report artifacts/datasets/hard_pref_v1/review/labels.jsonl --queue artifacts/datasets/hard_pref_v1/review/queue.jsonl --out artifacts/datasets/hard_pref_v1/label_report
```

## Local Labeling App v0 Contract

The local labeling app is the default browser workflow for completing human labels from an existing label queue. It is localhost-only by default, uses no database or external service, and stores labels as JSONL on disk.

Command:

```bash
uv run pawlbench-design-label-app artifacts/labels/local_v1_train --host 127.0.0.1 --port 8765 --labeler-id an
```

Then open:

```text
http://127.0.0.1:8765
```

Input directory:

- `queue.jsonl`
- optional existing `labels.jsonl`

App-written outputs:

- `labels.jsonl`: completed labels, upserted by `label_id`
- `labeling_state.json`: current index and update timestamp

Endpoints:

- `GET /`: main app
- `GET /api/queue`: queue summary and enum/tag vocabularies
- `GET /api/item/{index}`: one queue item and any existing label
- `POST /api/label`: validate and save one label
- `GET /api/progress`: completion and coverage summary
- `GET /image/{label_id}/{side}`: serve only the known left/right screenshot for a queue record

Saving labels copies dataset, split, sample, variant, defect type, and left/right item values from the queue record. For hard preference queues, it also preserves pair metadata such as `pair_id`, left/right variant names, and heuristic signals. The app rejects unknown `label_id` values and invalid schema enums before writing. Label writes are atomic: a temporary file is written in the queue directory and then replaces `labels.jsonl`.

If `suggested_labels.jsonl` exists, the app prefills each item with the matching suggestion. Review actions write `review_status`:

- `confirmed`: suggestion accepted without edits
- `edited`: reviewer saved manual changes
- `unclear`: reviewer could not confidently choose
- `skipped`: item skipped for later review

Keyboard shortcuts:

| Key | Action |
| --- | --- |
| Space | Confirm current suggestion and go next |
| Enter | Save edited form and go next |
| ArrowRight or `j` | Next item |
| ArrowLeft or `k` | Previous item |
| `1` | Select Left better |
| `2` | Select Right better |
| `3` | Select Tie |
| `4` | Select Unclear |
| `u` | Mark unclear and go next |
| `s` | Skip current item |
| `e` | Focus reason/fix edit area |
| `?` | Show or hide shortcut help |
| Escape | Close help or blur active control |

Shortcuts are ignored while focus is inside an input, textarea, select, or contenteditable control.

The static `review.html` output remains supported as fallback/manual mode for copy-editing JSONL outside the app.

## Label Provenance Audit Contract

Before labels are used for Pawl-JEPA training manifests, provenance should be audited:

```bash
uv run pawlbench-design-label-audit artifacts/labels/local_v1_train/labels.jsonl --queue artifacts/labels/local_v1_train/queue.jsonl --out artifacts/labels/local_v1_train_audit
```

Audit outputs:

- `audit.json`
- `report.md`

The audit flags confirmed or edited labels with missing `reviewed_by`, `reviewed_by == suggested_by`, or `labeler_id` beginning with `codepawl_rule`. It reports coverage by review status, `human_reviewed_count`, `auto_suggested_count`, `rule_reviewed_count`, and `suspicious_confirmed_count`.

Reviewer provenance can be rewritten explicitly without changing preference, tags, severity, reason, or fix instruction:

```bash
uv run pawlbench-design-label-set-reviewer artifacts/labels/local_v1_train/labels.jsonl --out artifacts/labels/local_v1_train/labels.reviewed.jsonl --reviewed-by an --only-status confirmed
```

The rewrite command preserves `suggested_by`, `suggested_*`, and `suggestion_confidence`, updates `reviewed_by`, `labeler_id`, and `reviewed_at`, and does not overwrite the input unless `--in-place` is passed.

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

## Optional Frozen Vision Baseline Contract

PawlBench Design can run optional DINOv2 and SigLIP frozen image encoders over dataset screenshots. These dependencies are not required for normal tests or local harness use.

Install:

```bash
uv sync --extra vision
```

The `vision` extra installs `torch`, `torchvision`, and `transformers`. DINOv2/SigLIP image processors require `torchvision`; a PIL-only processor fallback can be considered later but is not relied on for this baseline.

Command:

```bash
uv run pawlbench-design-vision-embed artifacts/datasets/local_v1 --out artifacts/vision_baselines/local_v1 --models dinov2,siglip
```

Default model aliases:

- `dinov2`: `facebook/dinov2-small`
- `siglip`: `google/siglip-base-patch16-224`

Outputs:

- `embeddings.jsonl`: normalized image embeddings for original and variant screenshots.
- `similarities.json`: cosine similarity between each variant and its own original.
- `retrieval.json`: variant-to-original retrieval ranks and top-k success.
- `summary.json`: dataset counts, models, device, average similarities, retrieval accuracy, runtime, warnings, and errors.

Runtime behavior:

- CPU works by default.
- CUDA is used automatically when available.
- `--batch-size` controls image batch size.
- Missing optional dependencies fail with install instructions.
- Embedding extraction handles common Hugging Face output shapes: raw tensors, `image_embeds`, `pooler_output`, `last_hidden_state`, and tuple/list tensor outputs.

These are frozen external baselines. Pawl-JEPA should beat them on documented PawlBench tasks before it is considered useful.

## Baseline Model Comparison Plan

Start with simple baselines before Pawl-JEPA training:

- rules-based metrics from DOM, accessibility, and layout data
- screenshot-only image embeddings
- DOM-only structural summaries
- combined handcrafted feature vectors
- optional frozen DINOv2/SigLIP vision embeddings
- general-purpose multimodal model critique outputs where locally available or explicitly configured

Pawl-JEPA should only be considered useful when it beats these baselines on a documented benchmark task.
