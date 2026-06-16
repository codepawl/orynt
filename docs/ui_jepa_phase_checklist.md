# UI-JEPA Phase Checklist

Source plan: `docs/ui_jepa_dataset_model_plan.md` v0.1.  
Audit date: 2026-06-16.  
Scope: current repository implementation status, not claims about external datasets or large-scale model quality.

Legend:

- `[x]` implemented in the current codebase.
- `[ ]` not implemented yet.
- `[~]` partially implemented; useful scaffold exists, but it is not the final planned form.

## Current Shape

The repository is in a local-first bootstrap state. It has a render harness, deterministic UI metrics, synthetic jitter datasets, human/auto label plumbing, hard preference pairs, a tiny Pawl-JEPA microtraining scaffold, a positive-only UI corpus path, a Phase 0.5 smoke benchmark sanity gate, M1/M2 screenshot-only JEPA baselines, M2.5 diagnostics, a synthetic/local UI preference critic v0, and mixed/hard closed-loop frontend patch evaluation. It does not yet implement the canonical research-scale UI-JEPA dataset, DOM-aware JEPA, or human-validated PR review.

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
- [x] Add an explicit gate that prevents DOM-aware UI-JEPA until B0/M1/M2 reports, M2.5 diagnostics, and evidence-based comparisons exist.

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
- [x] A real frozen-weight DINOv2 B0 report is present in this workspace and passes the Phase 0.5 checks.
  Evidence: `reports/ui_jepa_v0_smoke/b0_report.json` has `real_weights: true` and `valid_for_model_selection: true`.

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
- [x] M2.5 representation diagnostics are implemented for corruption type, severity, original-vs-corrupted detection, pair-family grouped probe summaries, and nearest-neighbor region/template/corruption metadata.
  Evidence: `packages/pawl_jepa/src/pawl_jepa/m25.py`, `ui-jepa-m25-ablation`.
- [x] Stronger controlled M2 configs are implemented as local RTX-class ablations with batch-size auto-reduction, CPU smoke mode, and support for a manually produced strong M2 report.
  Evidence: `ui-jepa-m25-ablation --stronger-epochs 20 --device cuda`, `--m2-strong-report reports/ui_jepa_v0_smoke/m2_strong_report.json`, and `--smoke`/`--skip-stronger-m2` options.
- [x] M2 strong CUDA was run manually by the user and registered as the current strongest M2 evidence.
  Evidence: `reports/ui_jepa_v0_smoke/m2_strong_report.json` uses `image_size=128`, `embedding_dim=128`, 20 epochs, and CUDA. It is valid/non-collapsed, but test accuracy is about `0.4977`, no better than M1, and metrics-only still dominates.

## Phase 2: DOM-Aware JEPA

Goal from plan: test whether DOM/view hierarchy improves critic performance.

- [x] Raw DOM and accessibility artifacts are captured during render.
- [~] Pawl-JEPA manifests retain DOM/accessibility paths for positive records.
- [ ] DOM token encoding is not implemented. The scale gate now requires valid M1/M2 plus M2.5 useful representation signal and a DOM-aware recommendation before DOM-aware work.
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
- [x] Synthetic/local issue heads exist for spacing, contrast, alignment, and hierarchy with provenance recorded as synthetic.
  Evidence: `reports/ui_jepa_v0_smoke/preference_critic_report.json`.
- [ ] Quality regression head is not implemented.
- [x] Region-grounded critique JSON adapter exists as a deterministic rule/template scaffold.
  Evidence: `ui-preference-critic-review`, `reports/ui_jepa_v0_smoke/preference_critic_review.json`.
- [x] Feature ablations measure whether JEPA features add value instead of assuming they do.
  Evidence: `ui-preference-critic-eval`; current report says metrics wins and JEPA features do not add value.
- [ ] UICrit-style critique calibration corpus is not integrated.
- [ ] Human preference evaluation beyond local labels is not implemented.

## Phase 4: Closed-Loop Frontend Pipeline

Goal from plan: prove real frontend value.

- [x] Critique JSON to Codex-compatible patch contract output is implemented and saved as artifacts, not sent to external services.
  Evidence: `packages/pawlbench_design/src/pawlbench_design/ui_loop.py`, `reports/ui_loop_v0/instructions/`.
- [x] Source screenshot/code -> critic JSON -> deterministic local patch/manual contract -> rerender -> before/after report loop is implemented for local synthetic fixtures.
  Evidence: `ui-loop-build`, `ui-loop-run`, `reports/ui_loop_v0_mixed_deterministic/closed_loop_report.json`.
- [x] `loop_easy_20`, `loop_mixed_50`, and `loop_hard_100` evaluation sets are implemented from local smoke artifacts.
  Evidence: `data/processed/ui_loop_v0/loop_easy_20`, `data/processed/ui_loop_v0/loop_mixed_50`, `data/processed/ui_loop_v0/loop_hard_100`.
- [x] Mixed/hard non-oracle closed-loop evaluation is implemented with no-op, deterministic, oracle upper-bound, and manual-patch-import modes.
  Evidence: `reports/ui_loop_v0_mixed_deterministic/closed_loop_report.json`, `reports/ui_loop_v0_hard_deterministic/closed_loop_report.json`, `reports/ui_loop_v0_mixed_oracle/closed_loop_report.json`, `reports/ui_loop_v0_hard_oracle/closed_loop_report.json`.
- [x] Codex-compatible patch contracts are exported as artifacts and include Goal, Context, Constraints, and Done when sections.
  Evidence: `reports/ui_loop_v0_mixed_deterministic/contracts/`.
- [x] Manual patch import and manual review label ingestion are implemented for the selected Phase 4C batch.
  Evidence: `data/manual_patches/ui_loop_v0/`, `reports/ui_loop_v0_manual_batch/mixed_manual_patch_import/closed_loop_report.json`, `reports/ui_loop_v0_manual_batch/hard_manual_patch_import/closed_loop_report.json`, `reports/ui_loop_v0_manual_batch/combined_manual_patch_report.json`.
- [x] Phase 4C manual Codex patch calibration artifacts are exported for a deterministic mixed/hard batch, and the local Vietnamese browser review UI is implemented for before/after labeling.
  Evidence: `reports/ui_loop_v0_manual_batch/task_selection.json`, `data/manual_patches/ui_loop_v0/<task_id>/patched.html`, `reports/ui_loop_v0_manual_batch/manual_review_labels/`, `apps/harness/src/codepawl_harness/ui_loop_review_web.py`, `ui-loop-review-web`.
- [~] Before/after human preference evaluation exists for the selected manual batch, but live app PR review labels are still needed before automation.
- [x] Accessibility/responsive regression checks inside the closed-loop gate are implemented for local deterministic reports and separated for non-oracle evidence.
  Evidence: `reports/ui_loop_v0_mixed_deterministic/closed_loop_report.json`, `reports/ui_loop_v0_hard_deterministic/closed_loop_report.json`, `reports/ui_jepa_v0_smoke/scale_gate.json`.
- [x] Local PR screenshot diff regression review is implemented with before/after screenshots, preference critic scoring, deterministic metrics, manual-label hooks, artifact reports, and gate ingestion.
  Evidence: `packages/pawlbench_design/src/pawlbench_design/ui_pr_review.py`, `ui-pr-review`, `data/pr_review_v0/fixture_manual_patch/metadata.json`, `reports/ui_pr_review_v0/fixture_manual_patch/pr_review_report.json`.
- [x] A CodePawl web pilot config and aggregate report exist for explicit pilot-only static route files.
  Evidence: `apps/site/pilot_routes/`, `data/pr_review_v0/codepawl_web_pilot/metadata.json`, `reports/ui_pr_review_v0/codepawl_web_pilot/pilot_report.json`, `reports/ui_pr_review_v0/codepawl_web_pilot/*/pr_review_report.json`.
- [ ] Production app route rendering is not implemented yet; outside `apps/site/pilot_routes`, `apps/site` and `apps/design` are placeholders with no package manager workspace, framework route tree, dev server, or build command.
- [x] PR screenshot review has a target-specific CI gate that can pass independently from DOM-aware JEPA.
  Evidence: `ui-jepa-scale-gate --target pr-review` exits zero when `pr_review_ready: true`; `--target dom-aware` remains blocked while M2.5 blocks DOM-aware work.
- [x] PR screenshot review has a disabled/manual GitHub Actions artifact-upload integration layer.
  Evidence: `.github/workflows/pr-visual-review.yml.disabled`, `ui-pr-review-ci`, `validate_pr_review_ci_artifacts`, and `docs/GITHUB_ACTIONS_VISUAL_REVIEW.md`.
- [ ] GitHub PR bot integration is not implemented; PR review remains local-first and artifact-based.

Current Phase 4B evidence: deterministic non-oracle patch mode passes `loop_mixed_50` and `loop_hard_100` with no-op mean critic delta `0.0`, `mean_critic_delta_non_oracle: 0.14`, accessibility regression rate `0.0`, and responsive regression rate `0.0`. This is not human taste evidence. Manual review queue artifacts and Codex contracts are exported under each report directory.

## Immediate Next Build Order

1. Produce and validate `data/processed/ui_jepa_v0_smoke` from the existing local corruption dataset.
2. Train M1 random-block screenshot JEPA and verify `m1_report.json` is valid, non-collapsed, and comparable to B0.
3. Train M2 semantic-region screenshot JEPA and verify `m2_report.json` is valid, non-collapsed, and comparable to M1/B0/metrics.
4. Treat the manual strong CUDA M2 run as closing the undertraining hypothesis for the current smoke corpus: stronger screenshot-only M2 is valid/non-collapsed but remains near chance and does not improve over M1.
5. Do not require future CUDA training inside the Codex sandbox. Future CUDA runs should be manual-user-run and then registered through report files.
6. Use the M2.5 decision: continue JEPA only with useful representation/preference signal; otherwise harden dataset labels or add a preference-aligned critic/objective before DOM-aware work.
7. Use Preference Critic v0 as the next frontend-loop scaffold: metrics currently dominates, M2-strong adds no useful lift, DOM-aware JEPA remains blocked, and closed-loop patch evaluation is the next practical validation path.
8. Phase 4B mixed/hard closed-loop validation is implemented and passed locally for deterministic non-oracle patches.
9. Phase 4C selected 20 mixed/hard manual calibration tasks and exported Codex patch artifacts plus blank review templates. The current local manual-patch import reports show rendered manual patch evidence for the selected batch, and completed human labels make `pr_review_foundation_ready` true.
10. Run local PR screenshot review with `ui-pr-review`; use `screenshots-only` for CI/sandbox paths and `render` for local HTML/project paths. The CodePawl web pilot runs with `--pilot-config data/pr_review_v0/codepawl_web_pilot/metadata.json` and uses pilot-only static route files under `apps/site/pilot_routes`. Gate CI with `ui-jepa-scale-gate --target pr-review`; keep `--target dom-aware` blocked until M2.5 evidence changes. The disabled GitHub Actions artifact upload template and `ui-pr-review-ci` validator now exist; next stage is manual inspection of uploaded artifacts, not auto-commenting or required PR checks.

## Phase 4C Manual Review UI Notes

Start the local-only web UI with:

```bash
UV_NO_SYNC=1 UV_CACHE_DIR=/tmp/uv-cache uv run ui-loop-review-web \
  --selection reports/ui_loop_v0_manual_batch/task_selection.json \
  --labels reports/ui_loop_v0_manual_batch/manual_review_labels \
  --mixed-report reports/ui_loop_v0_manual_batch/mixed_manual_patch_import/closed_loop_report.json \
  --hard-report reports/ui_loop_v0_manual_batch/hard_manual_patch_import/closed_loop_report.json \
  --manual-patches data/manual_patches/ui_loop_v0 \
  --host 127.0.0.1 \
  --port 8765 \
  --reviewer-id "$USER"
```

The browser UI uses Vietnamese review controls. `Lỗi thị giác mới` means the patch introduced a visible visual regression. `Vấn đề accessibility` means the patch may reduce readability or usability. Shortcuts are `A` after, `B` before, `T` tie, `R` visual regression, `C` accessibility concern, `S` save, `N` next, and `P` previous.

After the 20 Phase 4C labels are filled, click `Recombine report` or run `ui-loop-manual-batch combine`, then run `ui-jepa-scale-gate` with `--manual-batch-report reports/ui_loop_v0_manual_batch/combined_manual_patch_report.json`.
