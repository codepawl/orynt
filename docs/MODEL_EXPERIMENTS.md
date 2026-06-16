# UI-JEPA Model Experiments

Source plan: `docs/ui_jepa_dataset_model_plan.md`.  
Status: v0 experiment contract with Phase 0.5 smoke benchmark sanity checks plus M1 random-block and M2 semantic-region screenshot JEPA baselines. The current repository implements local microtraining, positive pretraining scaffolds, a metrics-only baseline, an offline-safe B0 report path, and M1/M2 train/probe/report CLIs. DOM-aware M3 remains blocked until B0, M1, and M2 reports are valid and comparable.

## Decision Gate

Do not scale UI-JEPA past local smoke work unless all of the following are true:

- B0 frozen vision baseline has a reproducible report.
- The smoke dataset validates with orientation sanity, at least 1000 pairs, at least 100 validation pairs, at least 100 test pairs, and best constant-side accuracy no higher than 0.65.
- The B0 report uses real frozen DINOv2/SigLIP/CLIP weights, not the deterministic dummy encoder.
- The B0 report includes constant/random baselines, metrics-only baseline, lift over best constant, and Wilson confidence intervals.
- B0 validation lift over the best constant baseline is positive.
- No severe leakage warnings are present.

M1 random-mask screenshot JEPA is the first trainable baseline after this gate. M2 semantic-region screenshot JEPA is implemented and must be run before DOM-aware work. The Phase 2 gate blocks DOM-aware JEPA unless B0 is valid, M1 is valid and non-collapsed, M2 exists, M2 is non-collapsed, and M2 comparison against M1/B0/metrics exists. Later scale decisions must also compare M1/M2/M3 on UI-specific downstream tasks, closed-loop critic-guided edits, and region-grounded critique output.

## Common Inputs

Dataset:

- Smoke: `artifacts/datasets/ui_jepa_v0_smoke`.
- Implemented local smoke path: `data/processed/ui_jepa_v0_smoke`.
- Local substitute while smoke is incomplete: `artifacts/datasets/beautiful_ui_v0`, `artifacts/datasets/local_v1`, and `artifacts/datasets/hard_pref_v2`.

Image normalization:

- Pilot input: preserve aspect ratio, resize longest side, pad to 768x768.
- Implemented smoke normalization helper: `pawl_jepa.data.normalize_image_padded` plus `transform_bbox_xyxy`, preserving aspect ratio on a fixed canvas.
- Compatibility path: `pawl_jepa.data.load_image_tensor(..., preserve_aspect=False)` keeps the existing square resize default; callers can opt into padded normalization with `preserve_aspect=True`.

Splits:

- Use dataset-provided train/val/test split files.
- Never split original/corrupted variants across splits.
- Keep domain/app/template groups together when those fields exist.

Reporting:

- Every run writes `config.json`, `metrics.jsonl`, checkpoint metadata if trained, and `eval_summary.json`.
- Every comparison writes `comparison.json` and `report.md`.

## B0: Frozen Vision Ranking Baseline

Purpose: prove whether custom UI-JEPA is worth building.

Models:

```text
dinov2: facebook/dinov2-small
siglip: google/siglip-base-patch16-224
clip: optional later baseline
```

Head:

```text
MLP ranking head
input: left embedding, right embedding, absolute difference, elementwise product
hidden_dim: 256
dropout: 0.1
loss: binary cross entropy or margin ranking
```

Metrics:

- Pairwise preference accuracy.
- AUC.
- Lift over constant baselines.
- Per-issue accuracy by corruption family.
- Retrieval Recall@1 and Recall@5 for same source/template pairs.

Acceptance:

- Report must include always-left, always-right, always-original, random, and suggestion/rule baselines when applicable.
- B0 is considered useful only if it beats the best constant baseline by at least 5 percentage points on validation and does not collapse on test.
- The smoke report is valid for model selection only when all validity checks pass, including real frozen weights. Dummy reports are useful test artifacts only.

Current implementation:

- `uv run ui-jepa-smoke-b0 data/processed/ui_jepa_v0_smoke --out reports/ui_jepa_v0_smoke --backend dinov2` runs an offline-safe B0 ranking report.
- Backends are pluggable: DINOv2, SigLIP, CLIP, and deterministic dummy for tests/offline fallback.
- If real frozen weights are not present locally, the command falls back to dummy by default and marks the report invalid for model-selection decisions.
- `metrics_baseline` is a deterministic UI-metrics score baseline using local `metrics.json` and design-token scaffold fields.
- Pair accuracy is reported by split, pair family, corruption type, severity bucket, and difficulty.
- Confidence intervals use Wilson score intervals, so perfect small-sample accuracy no longer reports `[1.0, 1.0]`.
- `uv run ui-jepa-scale-gate --dataset data/processed/ui_jepa_v0_smoke --b0-report reports/ui_jepa_v0_smoke/b0_report.json` passes for the current local DINOv2 B0 report. The same gate blocks dummy or otherwise invalid B0 reports.

## M1: Screenshot Random-JEPA

Purpose: establish the closest I-JEPA-style screenshot-only baseline.

Inputs:

```text
screenshot image patches
patch_size: 16 or 32
image_size: 768 padded for pilot, 224/256 acceptable for local smoke
```

Masking:

```text
target_blocks: 4
target_area_ratio: 0.10-0.35 each
context: distributed non-target patches
overlap: disallowed
```

Model:

```text
encoder: ViT-S for pilot, tiny CNN/ViT allowed for smoke
embedding_dim: 384 pilot, 64/128 smoke
predictor: 4-layer transformer pilot, MLP smoke
target_encoder: EMA copy for pilot
loss: normalized L2 or cosine latent prediction
```

Metrics:

- Pretraining loss curve.
- Embedding variance/collapse warning.
- Same-screen augmented-view retrieval.
- Downstream pairwise preference after ranking head training.

Acceptance:

- Loss is stable.
- Embedding variance stays above collapse threshold.
- Downstream ranking is not worse than B0 by more than 2 percentage points.

Current implementation:

- `uv run ui-jepa-m1-train data/processed/ui_jepa_v0_smoke --out checkpoints/ui_jepa_m1 --report-out reports/ui_jepa_v0_smoke/m1_report.json --b0-report reports/ui_jepa_v0_smoke/b0_report.json` trains M1 and writes a checkpoint plus `m1_report.json`/`m1_report.md`.
- `uv run ui-jepa-m1-probe data/processed/ui_jepa_v0_smoke --checkpoint checkpoints/ui_jepa_m1/checkpoints/m1_last.pt --report-out reports/ui_jepa_v0_smoke/m1_report.json --b0-report reports/ui_jepa_v0_smoke/b0_report.json` re-exports frozen embeddings and reruns the ranking probe.
- The loader reads `manifest.jsonl`, `splits.json`, screenshot paths, and metadata pointers for regions/design tokens while using screenshot-only random-block masking.
- Random-block masking samples one or more target blocks on the patch grid, keeps context as non-target patches, enforces a minimum visible context ratio, and records mask metadata.
- The model is a compact patch-conv encoder, Transformer context predictor, EMA target encoder, and latent normalized-L2 target prediction loss.
- Collapse diagnostics include embedding mean/std, feature variance, pairwise cosine distribution, nearest-neighbor diversity, duplicate-neighbor rate, and retrieval examples.
- Frozen-probe reporting includes train/val/test pairwise accuracy, grouped accuracy by pair family, corruption type, severity bucket, and difficulty, plus lift over best constant, metrics-only comparison, and DINOv2 B0 comparison.
- `valid_m1_baseline` can be true even when M1 loses to B0. M1 is considered implemented when it is trainable, non-collapsed, probe-comparable, and report-complete.

## M2: Screenshot Semantic-Region JEPA

Purpose: test whether UI-aware masking beats random masking.

Inputs:

```text
screenshot image patches
semantic regions from regions.jsonl
region type and bbox embeddings
```

Masking:

```text
sample target from semantic regions
region_area_ratio: 0.03-0.60
context must cover at least 3 macro zones
mask full region plus small margin
target query includes position/region embedding
```

Metrics:

- Same metrics as M1.
- Region type classification F1.
- Region retrieval Recall@K.
- Issue localization region-hit rate.

Acceptance:

- Beats M1 and B0 on at least two downstream probes.
- Does not regress pairwise preference test accuracy versus M1.
- Retrieval examples show UI-meaningful clusters, not just color/background similarity.

Current implementation:

- `uv run ui-jepa-m2-train data/processed/ui_jepa_v0_smoke --out checkpoints/ui_jepa_m2 --report-out reports/ui_jepa_v0_smoke/m2_report.json --b0-report reports/ui_jepa_v0_smoke/b0_report.json --m1-report reports/ui_jepa_v0_smoke/m1_report.json` trains M2 and writes `m2_report.json`, `m2_report.md`, and `m2_comparison.json`.
- Use `--device cuda` or the default `--device auto` for local RTX-class training. Keep `--device cpu` only for deterministic smoke/CI validation and environments without GPU access.
- M2 reuses the M1 screenshot-only patch encoder, Transformer context predictor, EMA target encoder, frozen embedding export, pairwise probe, and collapse diagnostics.
- Semantic masking reads `regions.jsonl`, maps original screenshot bboxes through the same aspect-preserving padded normalization used by M1, converts them to patch IDs at the requested `image_size`/`patch_size`, and samples `target_regions` per screen.
- Supported semantic region types are `navbar`, `hero`, `cta`, `card`, `card_grid`, `form`, `sidebar`, `footer`, `modal`, `table`, and `unknown`.
- If a screen has no usable semantic region after bbox/area/context validation, M2 explicitly falls back to the M1 random-block sampler and reports the fallback reason.
- Region diagnostics include target region type counts, fallback random-mask rate, average target area ratio, region coverage by split, per-region-type JEPA loss where available, and small example metadata by region type.
- The current smoke run is valid and non-collapsed, but the frozen pairwise probe remains near chance: train `0.4997`, val `0.5000`, test `0.4977`. It ties M1, does not close the B0 gap, and remains below the metrics-only baseline. This validates the implementation path, not model quality.

Interpretation rules:

- M2 collapsed: fix model/training before using the result.
- M2 near chance but non-collapsed: semantic masking alone is insufficient at this model/data scale; improve masking, target selection, probe features, or model capacity before relying on DOM-aware results.
- M2 > M1 but < B0: proceed to stronger M2 or DOM-aware probes while keeping B0 as the reference.
- M2 > B0: audit the benchmark for shortcuts before trusting the result.

## M3: DOM-Aware Late Fusion JEPA

Purpose: test whether DOM/view hierarchy helps without committing to cross-attention fusion.

Inputs:

```text
screenshot embedding from M2
DOM/view hierarchy tokens
optional design token vector
```

DOM token fields:

```text
tag/role
component type
bbox x1/y1/x2/y2/area
text length bucket
clickable/input/scrollable flags
depth
sibling index
safe class/token hash
```

Fusion:

```text
image_encoder -> z
dom_encoder -> d
downstream_head_input = concat(z, d)
```

Metrics:

- Pairwise preference accuracy/AUC.
- Region issue localization.
- Component classification F1.
- DOM-screenshot alignment proxy.

Acceptance:

- Improves issue localization over M2.
- Improves at least one component/region probe over M2.
- Does not overfit source templates based on split diagnostics.

Current implementation:

- Raw DOM/accessibility paths exist.
- DOM token encoding and late fusion are not implemented.

## M4: DOM-Aware Cross-Attention Fusion

Purpose: only test if M3 helps.

Gate:

- M3 must beat M2 on localization or component probes.
- M3 must not materially regress pairwise ranking.

Current implementation:

- Not started.

## M5: Design-Token JEPA

Purpose: test whether style/layout token prediction improves taste critique.

Gate:

- M2 or M3 must be promising.
- `design_tokens.json` extraction must validate on the smoke dataset.

Current implementation:

- Not started.

## M6: Responsive-JEPA

Purpose: predict mobile from desktop or desktop from mobile for responsive reasoning.

Gate:

- Paired responsive renders must exist.
- Responsive sibling split grouping must validate.

Current implementation:

- Not started.

## Phase 3 Heads

Heads:

```text
pairwise_ranking_head
issue_multilabel_head
quality_regression_head
critique_adapter_json_head
```

Required issue labels:

```text
inconsistent_spacing
poor_alignment
dense_layout
weak_visual_hierarchy
unclear_cta
poor_typography
low_readability
low_contrast
noisy_palette
weak_brand_consistency
inconsistent_components
layout_instability
poor_composition
responsive_regression
accessibility_risk
```

Metrics:

- Pairwise accuracy and AUC.
- Macro/micro issue F1.
- Quality Spearman/Kendall against human/designer ratings.
- Localization IoU or region-hit rate.
- Instruction usefulness by human preference or accepted patch rate.

Current implementation:

- Narrow pairwise head and four-class defect head exist in the microtraining scaffold.
- Full multilabel, quality, and critique JSON heads are not implemented.

## Closed-Loop Experiment

Minimum set:

```text
loop_easy_20
```

Comparison:

```text
baseline: no-critic prompt
candidate: UI-JEPA critique JSON -> coding model patch
```

Metrics:

- Human preference: baseline patch vs critic-guided patch.
- Regression rate.
- Contrast/accessibility warnings.
- Overflow/clipping count.
- Issue/action alignment.
- Before/after UI-JEPA score delta.

Acceptance:

- Critic-guided patches win more often than baseline patches.
- Accessibility and responsive regressions do not increase.
- Critique JSON remains valid and region-grounded.

Current implementation:

- Not implemented.

## Current Local Commands

Positive pretraining scaffold:

```bash
uv run pawl-jepa-positive-prepare artifacts/datasets/beautiful_ui_v0 --out artifacts/pawl_jepa/beautiful_ui_v0_manifest
uv run pawl-jepa-positive-train artifacts/pawl_jepa/beautiful_ui_v0_manifest --out artifacts/pawl_jepa/beautiful_ui_v0_pretrain --epochs 10 --batch-size 8 --device auto
uv run pawl-jepa-positive-eval artifacts/pawl_jepa/beautiful_ui_v0_pretrain --manifest artifacts/pawl_jepa/beautiful_ui_v0_manifest --out artifacts/pawl_jepa/beautiful_ui_v0_eval
```

Hard-pair microtraining:

```bash
uv run pawl-jepa-prepare-hard artifacts/datasets/hard_pref_v2 \
  --labels data/labels/hard_pref_v2/labels.reviewed.jsonl \
  --base-splits artifacts/datasets/local_v1_splits \
  --out artifacts/pawl_jepa/hard_pref_v2_manifest
uv run pawl-jepa-train artifacts/pawl_jepa/hard_pref_v2_manifest --out artifacts/pawl_jepa/hard_pref_v2_run --epochs 10 --batch-size 8 --device auto
uv run pawl-jepa-eval artifacts/pawl_jepa/hard_pref_v2_run --manifest artifacts/pawl_jepa/hard_pref_v2_manifest --out artifacts/pawl_jepa/hard_pref_v2_eval
```

Optional positive initialization:

```bash
uv run pawl-jepa-train artifacts/pawl_jepa/hard_pref_v2_manifest \
  --out artifacts/pawl_jepa/hard_pref_v2_run_from_positive \
  --epochs 10 \
  --batch-size 8 \
  --device auto \
  --pretrained-checkpoint artifacts/pawl_jepa/beautiful_ui_v0_pretrain/checkpoints/last.pt
```
