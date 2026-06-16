# UI-JEPA Phase Checklist

Source plan: `docs/ui_jepa_dataset_model_plan.md` v0.1.  
Audit date: 2026-06-16.  
Scope: current repository implementation status, not claims about external datasets or large-scale model quality.

Legend:

- `[x]` implemented in the current codebase.
- `[ ]` not implemented yet.
- `[~]` partially implemented; useful scaffold exists, but it is not the final planned form.

## Current Shape

The repository is in a local-first bootstrap state. It has a render harness, deterministic UI metrics, synthetic jitter datasets, human/auto label plumbing, hard preference pairs, a tiny Pawl-JEPA microtraining scaffold, a positive-only UI corpus path, a Phase 0.5 smoke benchmark sanity gate, and M1/M2 screenshot-only JEPA baselines. It does not yet implement the canonical research-scale UI-JEPA dataset, DOM-aware JEPA, critique JSON heads, or closed-loop frontend patch evaluation.

## Phase -1: Modification And Stabilization

This phase exists because the current codebase is useful but not in the final shape described by the plan.

- [x] Document current implementation status against the UI-JEPA plan in this file.
- [x] Keep the positive-only corpus explicitly marked as a scaffold, not as the final UI-JEPA dataset.
- [x] Emit a local positive `manifest.jsonl` with plan-aligned screen fields for `beautiful_ui_v0` builds.
- [x] Validate positive corpus artifact presence and local manifest record counts.
- [x] Keep tiny positive smoke manifests trainable when only one valid sample exists.
- [x] Fail positive pretraining clearly when the train split is empty.
- [x] Add `DATASET_SPEC.md` with exact canonical schemas, extraction scripts, split logic, corruption operators, and validation tests.
- [x] Add `MODEL_EXPERIMENTS.md` with exact B0/M1/M2/M3 configs, metrics, commands, and acceptance thresholds.
- [x] Add an explicit gate that prevents DOM-aware UI-JEPA until B0/M1/M2 reports and comparisons exist.

## Phase 0: Dataset And Evaluation Harness

Goal from plan: no large model training beyond baselines; prove the dataset/evaluation path.

- [x] Local HTML render harness writes `screenshot.png`, `dom.json`, `accessibility.json`, and `metrics.json`.
  Evidence: `packages/renderer/src/codepawl_renderer/render.py`.
- [x] Deterministic render metrics include contrast, typography, layout, overflow, and viewport fill signals.
  Evidence: `packages/metrics/src/codepawl_metrics/render_metrics.py`, renderer UI metric extraction.
- [x] Synthetic corrupted original-vs-variant datasets exist for local examples.
  Evidence: `packages/jitter/src/codepawl_jitter/generator.py`, `packages/pawlbench_design/src/pawlbench_design/datasets.py`.
- [x] Label queue, label validation/reporting, reviewer provenance, and weak auto-label paths exist.
  Evidence: `packages/pawlbench_design/src/pawlbench_design/labels.py`, `packages/pawlbench_design/src/pawlbench_design/label_app.py`.
- [x] Variant-vs-variant hard preference pairs exist for less trivial taste labels.
  Evidence: `packages/pawlbench_design/src/pawlbench_design/hard_pairs.py`.
- [x] A self-authored positive UI corpus exists.
  Evidence: `examples/beautiful_ui_v0` has 40 standalone HTML examples.
- [x] Unified smoke manifest exists as canonical local JSONL under `data/processed/ui_jepa_v0_smoke`.
  Evidence: `packages/pawlbench_design/src/pawlbench_design/ui_jepa_smoke.py`, `apps/harness/src/codepawl_harness/ui_jepa_smoke_build_cli.py`.
- [x] Screenshot normalization preserves aspect ratio with padded canonical canvases.
  Evidence: `packages/pawl_jepa/src/pawl_jepa/data.py`, `tests/test_ui_jepa_smoke.py`.
- [~] DOM/accessibility capture exists, but there is no normalized common DOM/view hierarchy tree schema yet.
- [x] Semantic regions with `region_id`, `region_type`, bbox, area ratio, patch IDs, and confidence are implemented for the smoke corpus.
  Evidence: `extract_semantic_regions` in `packages/pawlbench_design/src/pawlbench_design/ui_jepa_smoke.py`.
- [x] Design token extraction into `design_tokens.jsonl` is implemented as a deterministic smoke scaffold.
  Evidence: `extract_design_tokens` in `packages/pawlbench_design/src/pawlbench_design/ui_jepa_smoke.py`.
- [~] Stable split groups by template are implemented for local smoke data; external domain/app grouping remains future work.
- [x] B0 DINOv2/SigLIP/CLIP + MLP ranking baseline code and report path are implemented with offline-safe dummy fallback.
  Evidence: `run_ui_jepa_b0_baseline`, `ui-jepa-smoke-b0`, `ui-jepa-scale-gate`.
- [x] Phase 0.5 pair-orientation leak is fixed for the local smoke benchmark.
  Evidence: `data/processed/ui_jepa_v0_smoke_validation/validation.json` reports train/val/test best constant-side accuracy near 0.50.
- [x] The local smoke pair set is expanded past 1K pairs without external datasets.
  Evidence: current `data/processed/ui_jepa_v0_smoke/summary.json` has 990 screens and 2162 pairs.
- [x] Hard preference pair families are present in the smoke corpus.
  Evidence: validation pair-family counts include `original_vs_corrupted`, `low_severity_vs_high_severity`, `variant_vs_variant_same_corruption`, and `variant_vs_variant_mixed_corruption`.
- [x] B0 reports use Wilson score confidence intervals and include a deterministic metrics-only baseline.
  Evidence: `reports/ui_jepa_v0_smoke/b0_report.json`.
- [ ] 5K-10K mixed-source samples are not present.
- [x] A real frozen-weight DINOv2 B0 report is present in this workspace and passes the scale gate.
  Evidence: `reports/ui_jepa_v0_smoke/b0_report.json` has `real_weights: true` and `valid_for_model_selection: true`; `reports/ui_jepa_v0_smoke/scale_gate.json` has `allowed: true`.

## Phase 1: Screenshot-Only JEPA

Goal from plan: compare random masking versus semantic region masking.

- [x] A small local CNN-based Pawl-JEPA microtraining scaffold exists for paired screenshots.
  Evidence: `packages/pawl_jepa/src/pawl_jepa/model.py`, `packages/pawl_jepa/src/pawl_jepa/train.py`.
- [x] Positive-only two-view pretraining scaffold exists for polished UI screenshots.
  Evidence: `packages/pawl_jepa/src/pawl_jepa/positive.py`.
- [x] Positive train/eval CLIs exist.
  Evidence: `apps/harness/src/codepawl_harness/pawl_jepa_positive_train_cli.py`, `apps/harness/src/codepawl_harness/pawl_jepa_positive_eval_cli.py`.
- [~] Retrieval-style positive eval exists, but it is not the planned M1/M2 downstream probe suite.
- [x] M1 random-block screenshot JEPA is implemented as the first trainable screenshot-only baseline.
  Evidence: `packages/pawl_jepa/src/pawl_jepa/m1.py`, `ui-jepa-m1-train`, `ui-jepa-m1-probe`.
- [x] M2 semantic-region screenshot JEPA is implemented.
  Evidence: `packages/pawl_jepa/src/pawl_jepa/m2.py`, `ui-jepa-m2-train`, `reports/ui_jepa_v0_smoke/m2_report.json`.
- [x] Random-block mask sampling with target/context blocks is implemented for M1.
- [x] Semantic region mask sampling is implemented for M2 with deterministic bbox-to-patch mapping and random-mask fallback.
- [x] M1/M2/B0/metrics comparison reports are implemented for the smoke corpus.
- [ ] Nearest-neighbor retrieval cluster analysis for UI meaning is not implemented.

## Phase 2: DOM-Aware JEPA

Goal from plan: test whether DOM/view hierarchy improves critic performance.

- [x] Raw DOM and accessibility artifacts are captured during render.
- [~] Pawl-JEPA manifests retain DOM/accessibility paths for positive records.
- [ ] DOM token encoding is not implemented. The scale gate now requires valid non-collapsed M2 plus M2-vs-M1-vs-B0-vs-metrics comparison before DOM-aware work.
- [ ] Late-fusion DOM-aware JEPA is not implemented.
- [ ] Cross-attention DOM fusion is not implemented.
- [ ] Region issue localization evaluation is not implemented.
- [ ] Component classification and DOM-screenshot alignment probes are not implemented.

## Phase 3: Taste, Ranking, And Critique Heads

Goal from plan: make the model useful for frontend review.

- [x] Pairwise preference training scaffold exists for original-vs-variant and hard variant-vs-variant records.
- [x] Defect classification head exists for the narrow local defect set: spacing, contrast, alignment, hierarchy.
- [x] Evaluation compares pairwise accuracy to constant/suggestion baselines where applicable.
  Evidence: `packages/pawl_jepa/src/pawl_jepa/evaluate.py`.
- [~] Human-reviewed and auto-labeled provenance are represented separately.
- [ ] Issue multilabel head for the full planned issue taxonomy is not implemented.
- [ ] Quality regression head is not implemented.
- [ ] Region-grounded critique adapter or JSON instruction generator is not implemented.
- [ ] UICrit-style critique calibration corpus is not integrated.
- [ ] Human preference evaluation beyond local labels is not implemented.

## Phase 4: Closed-Loop Frontend Pipeline

Goal from plan: prove real frontend value.

- [ ] Critique JSON contract output is not implemented.
- [ ] Source screenshot/code -> critic JSON -> model patch -> rerender loop is not implemented.
- [ ] `loop_easy_20`, `loop_mixed_50`, and `loop_hard_100` evaluation sets are not implemented.
- [ ] Before/after human preference evaluation is not implemented.
- [ ] Accessibility/responsive regression checks inside the closed-loop gate are not implemented.
- [ ] PR screenshot diff aesthetic regression review is not implemented.

## Immediate Next Build Order

1. Produce and validate `data/processed/ui_jepa_v0_smoke` from the existing local corruption dataset.
2. Train M1 random-block screenshot JEPA and verify `m1_report.json` is valid, non-collapsed, and comparable to B0.
3. Train M2 semantic-region screenshot JEPA and verify `m2_report.json` is valid, non-collapsed, and comparable to M1/B0/metrics.
4. Current smoke M2 is non-collapsed but near chance, so improve masking/model scale before treating DOM-aware results as meaningful.
5. Do not scale external datasets or train larger UI-JEPA variants until the decision rule in the source plan is satisfied.
