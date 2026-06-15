# CodePawl

CodePawl is the company and platform for AI-assisted frontend design systems. The current pivot is focused on one product line: CodePawl Design.

CodePawl Design is planned as an AI frontend design platform that can inspect rendered interfaces, critique UI quality, compare variants, and eventually help generate better frontend work. This repository is intentionally starting with the research and evaluation foundation instead of a polished product shell.

Pawl-JEPA is a planned JEPA-style UI representation model for frontend design critique. Its job is to learn useful representations from rendered UI evidence such as screenshots, DOM structure, accessibility trees, layout metrics, and paired perturbations. The repo now includes a small optional microtraining scaffold for local PawlBench pairs; it is not the final research model and does not provide hosted inference.

PawlBench Design is the planned benchmark and evaluation suite for measuring frontend design quality, robustness, accessibility, and generation improvements. It will grow from the same local render harness used to collect data for Pawl-JEPA.

Before scaling datasets or adding ML baselines, CodePawl keeps training data separate from private style references:

- [Data Policy](docs/DATA_POLICY.md)
- [References Policy](docs/REFERENCES_POLICY.md)
- [Style Taxonomy](docs/STYLE_TAXONOMY.md)

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

Then build a small local dataset from every HTML example:

```bash
uv run pawlbench-design-build examples --out artifacts/datasets/local_v0 --seed 42
```

For the larger self-controlled example pack, build `local_v1` from `examples/local_v1`:

```bash
uv run pawlbench-design-build examples/local_v1 --out artifacts/datasets/local_v1 --seed 42
uv run pawlbench-design-validate artifacts/datasets/local_v1 --out artifacts/datasets/local_v1_validation
uv run pawlbench-design-split artifacts/datasets/local_v1 --out artifacts/datasets/local_v1_splits --seed 42
uv run pawlbench-design-report artifacts/datasets/local_v1 --out artifacts/datasets/local_v1_report
```

Generate a local-first human labeling queue from the `local_v1` train split:

```bash
uv run pawlbench-design-label-queue artifacts/datasets/local_v1_splits/train.jsonl --out artifacts/labels/local_v1_train --seed 42 --limit 100
```

Generate deterministic rule-based suggestions for faster review:

```bash
uv run pawlbench-design-label-suggest artifacts/labels/local_v1_train/queue.jsonl --out artifacts/labels/local_v1_train/suggested_labels.jsonl
```

Generate taste-calibrated suggestions without changing the legacy rule path:

```bash
uv run pawlbench-design-label-suggest artifacts/labels/local_v1_train/queue.jsonl \
  --out artifacts/labels/local_v1_train/suggested_labels.codepawl_taste_v0.jsonl \
  --taste-profile configs/labeling/codepawl_taste_v0.yaml
```

Start the local labeling app:

```bash
uv run pawlbench-design-label-app artifacts/labels/local_v1_train --host 127.0.0.1 --port 8765
```

Then open `http://127.0.0.1:8765`. The app serves one queue item at a time, writes completed labels to `artifacts/labels/local_v1_train/labels.jsonl`, and keeps progress in `artifacts/labels/local_v1_train/labeling_state.json`.

Suggested labels are deterministic synthetic-jitter guesses, not human labels until reviewed. The keyboard-first flow is:

```text
Space        confirm suggestion and go next
Enter        save edited form and go next
1 / 2 / 3 / 4 select left, right, tie, unclear
j / k        next / previous
u            mark unclear
s            skip
e            focus edit area
?            show shortcut help
Escape       close help or blur the active control
```

The static `artifacts/labels/local_v1_train/review.html` remains available as a manual fallback review sheet. It does not write files; use it to copy completed JSONL records by hand if you do not want to run the local app.

Audit label provenance before using labels for Pawl-JEPA work:

```bash
uv run pawlbench-design-label-audit artifacts/labels/local_v1_train/labels.jsonl --queue artifacts/labels/local_v1_train/queue.jsonl --out artifacts/labels/local_v1_train_audit
```

If confirmed labels were reviewed under a rule identity, rewrite reviewer provenance explicitly:

```bash
uv run pawlbench-design-label-set-reviewer artifacts/labels/local_v1_train/labels.jsonl --out artifacts/labels/local_v1_train/labels.reviewed.jsonl --reviewed-by an --only-status confirmed
```

Validate labels and export a label report:

```bash
uv run pawlbench-design-label-validate artifacts/labels/local_v1_train/labels.jsonl --queue artifacts/labels/local_v1_train/queue.jsonl --out artifacts/labels/local_v1_train_validation
uv run pawlbench-design-label-report artifacts/labels/local_v1_train/labels.jsonl --queue artifacts/labels/local_v1_train/queue.jsonl --out artifacts/labels/local_v1_train_report
```

Generate variant-vs-variant hard preference pairs for non-trivial A/B review:

```bash
uv run pawlbench-design-hard-pairs artifacts/datasets/local_v1 --out artifacts/datasets/hard_pref_v1 --seed 42
uv run pawlbench-design-label-app artifacts/datasets/hard_pref_v1/review --labeler-id an
uv run pawlbench-design-label-validate artifacts/datasets/hard_pref_v1/suggested_labels.jsonl --queue artifacts/datasets/hard_pref_v1/review/queue.jsonl --out artifacts/datasets/hard_pref_v1/suggested_validation
uv run pawlbench-design-label-validate artifacts/datasets/hard_pref_v1/review/labels.jsonl --queue artifacts/datasets/hard_pref_v1/review/queue.jsonl --out artifacts/datasets/hard_pref_v1/label_validation
uv run pawlbench-design-label-report artifacts/datasets/hard_pref_v1/review/labels.jsonl --queue artifacts/datasets/hard_pref_v1/review/queue.jsonl --out artifacts/datasets/hard_pref_v1/label_report
```

Hard preference suggestions use `review_status: "suggested"` and are not human-reviewed labels until confirmed or edited in the label app.

Regenerate hard-pair suggestions with CodePawl Taste v0 and diff them against the old suggestions:

```bash
uv run pawlbench-design-label-resuggest artifacts/datasets/hard_pref_v1/review/queue.jsonl \
  --existing-labels artifacts/datasets/hard_pref_v1/suggested_labels.jsonl \
  --out artifacts/datasets/hard_pref_v1/suggested_labels.codepawl_taste_v0.jsonl \
  --taste-profile configs/labeling/codepawl_taste_v0.yaml

uv run pawlbench-design-label-diff artifacts/datasets/hard_pref_v1/suggested_labels.jsonl \
  artifacts/datasets/hard_pref_v1/suggested_labels.codepawl_taste_v0.jsonl \
  --out artifacts/datasets/hard_pref_v1/codepawl_taste_v0_diff
```

Taste suggestion details report `left_penalty` and `right_penalty`; lower penalty is better.

Then validate, split, and summarize the dataset:

```bash
uv run pawlbench-design-validate artifacts/datasets/local_v0 --out artifacts/datasets/local_v0_validation
uv run pawlbench-design-split artifacts/datasets/local_v0 --out artifacts/datasets/local_v0_splits --seed 42
uv run pawlbench-design-report artifacts/datasets/local_v0 --out artifacts/datasets/local_v0_report
```

Then build lightweight non-ML encoder baselines:

```bash
uv run pawlbench-design-embed artifacts/jitter_pairs --out artifacts/encoder_baselines
```

Optional frozen vision baselines can be installed and run after local_v1 exists:

```bash
uv sync --extra vision
uv run pawlbench-design-vision-embed artifacts/datasets/local_v1 --out artifacts/vision_baselines/local_v1 --models dinov2,siglip
```

The `vision` extra installs `torch`, `torchvision`, and `transformers`; DINOv2/SigLIP image processors require `torchvision`.

Prepare, train, evaluate, sweep, and report the Pawl-JEPA microtraining scaffold with local screenshots and reviewed full-split labels:

```bash
uv sync --extra jepa
uv run pawl-jepa-prepare artifacts/datasets/local_v1_splits \
  --labels data/labels/local_v1_train/labels.reviewed.jsonl \
  --labels data/labels/local_v1_val/labels.reviewed.jsonl \
  --labels data/labels/local_v1_test/labels.reviewed.jsonl \
  --out artifacts/pawl_jepa/local_v1_manifest_full_labels
uv run pawl-jepa-train artifacts/pawl_jepa/local_v1_manifest_full_labels --out artifacts/pawl_jepa/local_v1_run_full_labels --epochs 2 --batch-size 8 --device auto
uv run pawl-jepa-eval artifacts/pawl_jepa/local_v1_run_full_labels --manifest artifacts/pawl_jepa/local_v1_manifest_full_labels --out artifacts/pawl_jepa/local_v1_eval_full_labels
uv run pawl-jepa-sweep artifacts/pawl_jepa/local_v1_manifest_full_labels --out artifacts/pawl_jepa/local_v1_sweep --epochs 5 --batch-size 8 --seeds 1,2,3,4,5 --device auto
uv run pawl-jepa-report artifacts/pawl_jepa/local_v1_eval_full_labels --manifest artifacts/pawl_jepa/local_v1_manifest_full_labels --out artifacts/pawl_jepa/local_v1_report
```

Prepare, train, and evaluate the first discriminative hard preference benchmark:

```bash
uv run pawl-jepa-prepare-hard artifacts/datasets/hard_pref_v1 \
  --labels data/labels/hard_pref_v1/labels.reviewed.jsonl \
  --base-splits artifacts/datasets/local_v1_splits \
  --out artifacts/pawl_jepa/hard_pref_v1_manifest
uv run pawl-jepa-train artifacts/pawl_jepa/hard_pref_v1_manifest --out artifacts/pawl_jepa/hard_pref_v1_run --epochs 10 --batch-size 8 --device auto
uv run pawl-jepa-eval artifacts/pawl_jepa/hard_pref_v1_run --manifest artifacts/pawl_jepa/hard_pref_v1_manifest --out artifacts/pawl_jepa/hard_pref_v1_eval
```

`eval_summary.json` includes constant and heuristic baselines. Current `local_v1` labels all prefer the original UI, so pairwise accuracy must be interpreted against `always_prefer_original_accuracy` and `pairwise_lift_over_always_original`. `hard_pref_v1` records are variant-vs-variant, so hard-pair eval reports always-left, always-right, random, and suggestion baselines instead.

The `jepa` extra installs `torch` only. Pawl-JEPA microtraining uses a small local CNN and does not download DINOv2, SigLIP, or other external model weights. Normal `uv run pytest` remains CPU/GPU agnostic; Torch-only smoke tests are skipped unless the training extra is installed.

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
  pawl_jepa/             Optional Pawl-JEPA microtraining scaffold.
  pawlbench_design/      Future benchmark package.
experiments/             Staged experiment notes.
reports/                 Research plans and experiment log.
docs/                    Data policy, reference policy, and style taxonomy.
references/              Private style-study note templates, not training data.
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

Build a local multi-sample dataset:

```bash
uv run pawlbench-design-build examples --out artifacts/datasets/local_v0 --seed 42
cat artifacts/datasets/local_v0/dataset.json
```

Expected outputs:

```text
artifacts/datasets/local_v0/
  dataset.json
  samples/
    simple_landing/
      labels.json
      original/
      jittered/
    simple_dashboard/
      labels.json
      original/
      jittered/
```

`dataset.json` records sample status, per-variant artifact paths, failed samples, and aggregate metric deltas by defect type.

Build the self-controlled `local_v1` dataset:

```bash
uv run pawlbench-design-build examples/local_v1 --out artifacts/datasets/local_v1 --seed 42
uv run pawlbench-design-validate artifacts/datasets/local_v1 --out artifacts/datasets/local_v1_validation
uv run pawlbench-design-split artifacts/datasets/local_v1 --out artifacts/datasets/local_v1_splits --seed 42
uv run pawlbench-design-report artifacts/datasets/local_v1 --out artifacts/datasets/local_v1_report
```

`examples/local_v1/` contains 30 self-authored static HTML pages with fictional product names and no external assets.

Validate, split, and report on the local dataset:

```bash
uv run pawlbench-design-validate artifacts/datasets/local_v0 --out artifacts/datasets/local_v0_validation
uv run pawlbench-design-split artifacts/datasets/local_v0 --out artifacts/datasets/local_v0_splits --seed 42
uv run pawlbench-design-report artifacts/datasets/local_v0 --out artifacts/datasets/local_v0_report
cat artifacts/datasets/local_v0_validation/validation.json
cat artifacts/datasets/local_v0_splits/splits.json
cat artifacts/datasets/local_v0_report/report.md
```

Expected outputs:

```text
artifacts/datasets/local_v0_validation/
  validation.json
artifacts/datasets/local_v0_splits/
  splits.json
  train.jsonl
  val.jsonl
  test.jsonl
artifacts/datasets/local_v0_report/
  report.md
  summary.json
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

Build optional DINOv2/SigLIP frozen vision baselines:

```bash
uv sync --extra vision
uv run pawlbench-design-vision-embed artifacts/datasets/local_v1 --out artifacts/vision_baselines/local_v1 --models dinov2,siglip
cat artifacts/vision_baselines/local_v1/summary.json
```

The first run downloads model weights through standard Hugging Face cache mechanisms. These are frozen external baselines that future Pawl-JEPA experiments should beat.
The `vision` extra installs `torch`, `torchvision`, and `transformers`; DINOv2/SigLIP image processors require `torchvision`.

Expected outputs:

```text
artifacts/vision_baselines/local_v1/
  embeddings.jsonl
  similarities.json
  retrieval.json
  summary.json
```

## What Is Intentionally Missing

This scaffold does not include auth, billing, database code, cloud deployment, hosted inference, model training, or a full frontend product. Those should wait until the render harness and evaluation loop are useful locally.

The repo also intentionally excludes third-party screenshots, logos, brand assets, gallery downloads, and scraped design images. Public websites and design galleries may be used only for private manual style study under the references policy, not as training data by default.
