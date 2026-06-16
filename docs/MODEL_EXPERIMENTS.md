# UI-JEPA Model Experiments

Source plan: `docs/ui_jepa_dataset_model_plan.md`.  
Status: v0 experiment contract with Phase 0.5 smoke benchmark sanity checks plus M1 random-block, M2 semantic-region screenshot JEPA baselines, and M2.5 representation diagnostics. The current repository implements local microtraining, positive pretraining scaffolds, a metrics-only baseline, an offline-safe B0 report path, M1/M2 train/probe/report CLIs, and an M2.5 ablation/diagnostic CLI. DOM-aware M3 remains blocked until B0, M1, M2, and M2.5 reports show useful representation evidence.

## Decision Gate

Do not scale UI-JEPA past local smoke work unless all of the following are true:

- B0 frozen vision baseline has a reproducible report.
- The smoke dataset validates with orientation sanity, at least 1000 pairs, at least 100 validation pairs, at least 100 test pairs, and best constant-side accuracy no higher than 0.65.
- The B0 report uses real frozen DINOv2/SigLIP/CLIP weights, not the deterministic dummy encoder.
- The B0 report includes constant/random baselines, metrics-only baseline, lift over best constant, and Wilson confidence intervals.
- B0 validation lift over the best constant baseline is positive.
- No severe leakage warnings are present.

M1 random-mask screenshot JEPA is the first trainable baseline after this gate. M2 semantic-region screenshot JEPA is implemented and must be run before DOM-aware work. M2.5 diagnoses whether M1/M2 failed from undertraining/model scale, weak masking, objective mismatch, or a metrics-driven synthetic benchmark. The Phase 2 gate blocks DOM-aware JEPA unless B0 is valid, M1 is valid and non-collapsed, M2 exists, M2 is non-collapsed, M2 comparison against M1/B0/metrics exists, and M2.5 finds useful representation signal with a DOM-aware recommendation. `reports/ui_jepa_v0_smoke/m2_strong_report.json`, when present and valid, is treated as externally/manual-produced strong M2 evidence. Later scale decisions must also compare M1/M2/M3 on UI-specific downstream tasks, closed-loop critic-guided edits, and region-grounded critique output.

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

## M2.5: Representation Diagnosis And Stronger M2 Validation

Purpose: turn non-collapsed near-chance M1/M2 results into actionable evidence before any DOM-aware work.

Diagnostics:

- Frozen embedding probes for original-vs-corrupted detection, corruption type classification, severity bucket classification, and severity regression.
- Pair-side original-vs-corrupted detection with split-wise and pair-family/corruption/difficulty/severity grouped summaries.
- Nearest-neighbor metadata for same template, same corruption type, originalness, and region-type overlap/retrieval.
- Metrics-only diagnostic probes from local `metrics.json` plus smoke design-token fields.
- DINOv2 comparison through the existing B0 preference report; DINOv2 diagnostic probes require a persisted B0 embedding export and are otherwise marked unavailable rather than inferred.

Stronger M2 configs:

```text
tiny CPU smoke: image_size=64, embedding_dim=32, epochs=1, --smoke
local CUDA default: image_size=128, embedding_dim=128, epochs=20, target_regions=2
area/count sweep: image_size=128, embedding_dim=128, target_regions=3, max_region_area_ratio=0.55
feasible larger probe: image_size=224, embedding_dim=256, predictor_hidden_dim=512, transformer_layers=3
```

The ablation runner auto-reduces batch size on CUDA/VRAM failures and records the exact failed batch/config/error in the report.

Current implementation:

- `uv run ui-jepa-m25-ablation data/processed/ui_jepa_v0_smoke --out checkpoints/ui_jepa_m25 --report-out reports/ui_jepa_v0_smoke/m25_diagnostics_report.json --b0-report reports/ui_jepa_v0_smoke/b0_report.json --m1-report reports/ui_jepa_v0_smoke/m1_report.json --m2-report reports/ui_jepa_v0_smoke/m2_report.json --device cuda --stronger-epochs 20`
- Existing manual strong reports can be registered without retraining: `uv run ui-jepa-m25-ablation data/processed/ui_jepa_v0_smoke --out checkpoints/ui_jepa_m25 --report-out reports/ui_jepa_v0_smoke/m25_diagnostics_report.json --b0-report reports/ui_jepa_v0_smoke/b0_report.json --m1-report reports/ui_jepa_v0_smoke/m1_report.json --m2-report reports/ui_jepa_v0_smoke/m2_report.json --m2-strong-report reports/ui_jepa_v0_smoke/m2_strong_report.json --skip-stronger-m2`
- Use `--skip-stronger-m2` for offline report-only diagnostics and `--smoke --stronger-epochs 1 --device cpu` for CI.
- The report compares M1, M2, stronger M2 runs, B0 DINOv2 preference accuracy, and metrics-only preference/diagnostic baselines.
- Current authoritative strong M2 evidence was run manually by the user on CUDA with `image_size=128`, `embedding_dim=128`, and 20 epochs. It is valid/non-collapsed, but the preference probe remains near chance with test accuracy about `0.4977`, no improvement over M1, and metrics-only still dominates.
- This closes the undertraining hypothesis for the current smoke corpus. Future CUDA training should be manual-user-run and registered through reports; it is not required inside the Codex sandbox.

Interpretation rules:

- JEPA loss improves but diagnostic/preference probes remain chance: objective is likely not aligned.
- Diagnostic probes work but preference probe fails: preference labels are likely metrics/style-specific or too synthetic.
- All diagnostic probes fail: model scale, masking, or training is insufficient.
- Stronger M2 improves over M1/M2: continue stronger M2 and only then consider DOM-aware probes.
- Metrics-only dominates all learned representations: harden dataset/labels or change the objective before taste research claims.
- Manual strong M2 is valid/non-collapsed but still near chance: do not proceed to DOM-aware JEPA from non-collapse alone; harden the dataset and add a preference-aligned critic/objective first.

Gate:

- DOM-aware JEPA is not recommended merely because M2 is valid and non-collapsed.
- `ui-jepa-scale-gate` requires `--m25-report`; DOM-aware readiness requires useful M2.5 representation signal and a DOM-aware recommendation in that report.

## Phase 3A: Synthetic Preference Critic v0

Purpose: build a useful local UI preference critic before returning to architecture work.

Current command flow:

```bash
uv run ui-preference-dataset-build data/processed/ui_jepa_v0_smoke --out data/processed/ui_preference_v0
uv run ui-preference-critic-eval data/processed/ui_preference_v0 \
  --out reports/ui_jepa_v0_smoke/preference_critic \
  --report-out reports/ui_jepa_v0_smoke/preference_critic_report.json \
  --b0-report reports/ui_jepa_v0_smoke/b0_report.json \
  --m25-report reports/ui_jepa_v0_smoke/m25_diagnostics_report.json
uv run ui-preference-critic-review data/processed/ui_preference_v0 \
  --report reports/ui_jepa_v0_smoke/preference_critic_report.json \
  --out reports/ui_jepa_v0_smoke/preference_critic_review.json \
  --limit 3
```

Closed-loop frontend patch evaluation may proceed with this synthetic/local critic when the gate reports `closed_loop_ready: true`.

## Phase 4C: Manual Codex Patch Calibration

Phase 4C runs a local/manual calibration batch rather than model work. The selected batch is written to `reports/ui_loop_v0_manual_batch/task_selection.json` and contains 10 tasks from `loop_mixed_50` plus 10 tasks from `loop_hard_100`, balanced across spacing, contrast, alignment, and hierarchy when available.

Patch artifacts are copied-task HTML edits under `data/manual_patches/ui_loop_v0/<task_id>/`. The current Codex patches remove the known local `data-codepawl-jitter` style block from `patched.html`, write `notes.json` with `provenance: manual_codex_patch`, and write `patch.diff`. This is not oracle copy-from-clean behavior and does not touch `data/processed/ui_loop_v0`.

Manual patch import reports are expected at:

- `reports/ui_loop_v0_manual_batch/mixed_manual_patch_import/closed_loop_report.json`
- `reports/ui_loop_v0_manual_batch/hard_manual_patch_import/closed_loop_report.json`
- `reports/ui_loop_v0_manual_batch/combined_manual_patch_report.json`

In the current sandbox, Chromium rendering stalled during manual import, so only `--skip-render` structural reports exist. These validate import wiring but are not rendered improvement evidence; `manual_patch_ready` and `pr_review_ready` remain false.

PR screenshot regression review requires the preference critic report, mixed/hard closed-loop reports, rendered manual patch import evidence above threshold, low accessibility/responsive regression rates, and completed manual review labels. Empty label templates do not count. DOM-aware JEPA remains frozen because M2.5 and the manually registered M2-strong run still do not justify architecture expansion.

## Phase 4B: Mixed/Hard Closed-Loop Frontend Evaluation v0

Purpose: test whether the Preference Critic helps a practical local frontend iteration loop on mixed and hard local tasks before doing more JEPA architecture work or real PR review.

Current command flow, using no external LLM APIs and no network-dependent tasks:

```bash
UV_NO_SYNC=1 UV_CACHE_DIR=/tmp/uv-cache uv run python -m codepawl_harness.ui_loop_build_cli \
  data/processed/ui_jepa_v0_smoke --out data/processed/ui_loop_v0 --set loop_easy_20
UV_NO_SYNC=1 UV_CACHE_DIR=/tmp/uv-cache uv run python -m codepawl_harness.ui_loop_build_cli \
  data/processed/ui_jepa_v0_smoke --out data/processed/ui_loop_v0 --set loop_mixed_50
UV_NO_SYNC=1 UV_CACHE_DIR=/tmp/uv-cache uv run python -m codepawl_harness.ui_loop_build_cli \
  data/processed/ui_jepa_v0_smoke --out data/processed/ui_loop_v0 --set loop_hard_100

UV_NO_SYNC=1 UV_CACHE_DIR=/tmp/uv-cache uv run python -m codepawl_harness.ui_loop_run_cli \
  data/processed/ui_loop_v0/loop_easy_20 \
  --out reports/ui_loop_v0_instruction_only \
  --patch-mode instruction_only \
  --limit 3

UV_NO_SYNC=1 UV_CACHE_DIR=/tmp/uv-cache uv run python -m codepawl_harness.ui_loop_run_cli \
  data/processed/ui_loop_v0/loop_mixed_50 \
  --out reports/ui_loop_v0_mixed_deterministic \
  --patch-mode deterministic_patch

UV_NO_SYNC=1 UV_CACHE_DIR=/tmp/uv-cache uv run python -m codepawl_harness.ui_loop_run_cli \
  data/processed/ui_loop_v0/loop_hard_100 \
  --out reports/ui_loop_v0_hard_deterministic \
  --patch-mode deterministic_patch
```

Current mixed/hard deterministic non-oracle evidence:

- `reports/ui_loop_v0_mixed_deterministic/closed_loop_report.json`
- `reports/ui_loop_v0_hard_deterministic/closed_loop_report.json`
- `passed_closed_loop_gate: true`
- mixed task count: `50`
- hard task count: `100`
- non-oracle success rate: `1.0`
- `mean_critic_delta_non_oracle: 0.14`
- no-op mean critic delta: `0.0`
- non-oracle accessibility regression rate: `0.0`
- non-oracle responsive regression rate: `0.0`

Interpretation rules:

- This is synthetic/local preference improvement only, not human taste evidence.
- Instruction-only mode creates contracts and review artifacts but cannot pass the closed-loop gate.
- Deterministic patch mode can pass mixed/hard gates only with non-oracle evidence and a clean no-op baseline.
- Oracle patch mode is upper-bound evidence only and is excluded from non-oracle success claims.
- Manual patch import reads `data/manual_patches/ui_loop_v0/<task_id>/`; missing patches are skipped, not failed.
- Codex patch contracts are saved under report `contracts/` directories and are not sent to external services.
- If critic score improves while accessibility or responsive checks regress, fix scoring/gate before using the critic.
- If manual review disagrees with the critic, collect human labels and recalibrate.
- DOM-aware JEPA remains blocked unless closed-loop failures show critic localization or DOM grounding is the bottleneck.

## Phase 3A Current Evidence

The critic trains deterministic CPU logistic-ranking heads over feature groups: metrics, design tokens, semantic regions, DINOv2 when embeddings are available, M1, M2, M2-strong, and combinations. Missing expensive embeddings are skipped with manual commands instead of generated inside Codex.

Current evidence:

- Best feature group: `metrics`.
- Full test accuracy: about `0.9014` on the synthetic/local smoke preference pairs.
- Hard test accuracy: about `0.8786`.
- M2-strong-only test accuracy is about `0.5399`, below metrics and not enough to justify JEPA architecture work.
- DINOv2 screen embeddings are currently missing as reusable `screen_id` JSONL, so DINOv2 feature groups are skipped until the manual export is run.
- Region-grounded critique JSON is rule/template-based and uses synthetic/local issue provenance. Do not call this human taste.

Decision:

- JEPA features do not add measurable value for this corpus.
- Metrics still dominate, so DOM-aware JEPA remains blocked.
- Freeze JEPA architecture work for this corpus unless future feature ablations show clear M1/M2/M2-strong lift.
- Phase 4B closed-loop mixed/hard deterministic evaluation has passed synthetic/local non-oracle validation. Real PR review remains blocked until manual labels confirm the metric/critic wins.

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
