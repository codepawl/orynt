# Pawl-JEPA Plan

## Hypothesis

Frontend UI quality can be represented more usefully when a model learns from rendered evidence instead of source code alone. Screenshots, DOM structure, accessibility trees, layout metrics, and controlled UI perturbations should provide enough signal for a JEPA-style representation model to support design critique and generation feedback.

Any future training data must comply with `docs/DATA_POLICY.md`. Public websites, design galleries, brand pages, and creator portfolios may be used for private manual style study only under `docs/REFERENCES_POLICY.md`; they are not Pawl-JEPA training data by default.

## What Pawl-JEPA Does

- learns representations of frontend UI states from local render artifacts
- compares original and perturbed UI examples
- supports critique tasks such as visual hierarchy, spacing, accessibility, and layout consistency
- produces embeddings or scores that can be evaluated inside PawlBench Design
- currently includes a small optional microtraining scaffold for proving the local data path

## What Pawl-JEPA Does Not Do

- it does not replace the product UI
- the microtraining scaffold is not the final Pawl-JEPA research model
- it does not provide hosted inference
- it does not require auth, billing, databases, or cloud deployment
- it does not generate production frontend code by itself
- it does not implement Sub-JEPA or SIGReg yet

## Minimum Success Gates

- A local render harness can create reproducible artifact folders for static HTML.
- Artifacts include screenshot, DOM, accessibility, and metrics data.
- PawlBench Design defines at least one repeatable benchmark task using those artifacts.
- Simple baselines are measured before training starts.
- Jitter pairs show measurable differences on known UI perturbations.
- Human preference and critique labels exist for at least one local split.
- Data provenance and release constraints are documented before dataset scaling.
- A microtraining run beats at least one simple baseline on a narrow benchmark task.

## Staged Plan

1. Data harness: implement `codepawl-render` with Playwright and write local artifacts.
2. Baselines: compute simple metrics and compare trivial embedding or rules-based approaches.
3. Jitter pairs: generate controlled UI variants for spacing, typography, contrast, hierarchy, and responsiveness.
4. Data governance: maintain data policy, reference policy, and style taxonomy before scaling local datasets.
5. Human labels: collect local JSONL pairwise preference, defect tag, severity, critique reason, and fix-instruction labels from PawlBench split queues through the local label app.
6. Microtrain: train the smallest Pawl-JEPA experiment against one narrow task.
7. Generation loop: use Pawl-JEPA and PawlBench Design results to guide CodePawl Design generation and critique workflows.

## Human Label Supervision Path

Human labeling v0 does not train Pawl-JEPA. The local label app writes JSONL supervision that later microtraining can consume:

- Pair preference labels can supervise original-vs-variant ranking objectives.
- Defect tags and severity can supervise defect classification heads.
- Free-text reasons and fix instructions can support critique and repair-evaluation tasks.
- Coverage and label reports should be checked before labels are admitted into any training manifest.

Rule-based synthetic suggestions are useful for faster review but are not human labels. Pawl-JEPA training manifests should include only labels whose `review_status` is `confirmed`, `edited`, or an explicitly handled human-review status.

Before any Pawl-JEPA microtraining run, label provenance must pass audit. Confirmed or edited labels reviewed by `codepawl_rule_v0` should be fixed with the explicit reviewer rewrite command so training manifests separate human review from deterministic suggestions.

Hard preference pairs address the current non-discriminative pairwise setup where all `local_v1` labels prefer the original UI. `hard_pref_v1` is the smoke hard-pair set:

```bash
uv run pawlbench-design-hard-pairs artifacts/datasets/local_v1 --out artifacts/datasets/hard_pref_v1 --seed 42
uv run pawlbench-design-label-app artifacts/datasets/hard_pref_v1/review --labeler-id an
uv run pawlbench-design-label-validate artifacts/datasets/hard_pref_v1/suggested_labels.jsonl --queue artifacts/datasets/hard_pref_v1/review/queue.jsonl --out artifacts/datasets/hard_pref_v1/suggested_validation
uv run pawlbench-design-label-report artifacts/datasets/hard_pref_v1/review/labels.jsonl --queue artifacts/datasets/hard_pref_v1/review/queue.jsonl --out artifacts/datasets/hard_pref_v1/label_report
```

These hard-pair labels are variant-vs-variant labels. `hard_pref_v1` preserves the original core-pair behavior for compatibility because neither side is original and reviewed preferences can be left or right.

`hard_pref_v2` is the all-pairs benchmark and should be generated before changing Pawl-JEPA architecture:

```bash
uv run pawlbench-design-hard-pairs artifacts/datasets/local_v1 \
  --out artifacts/datasets/hard_pref_v2 \
  --seed 42 \
  --strategy all_pairs \
  --taste-profile configs/labeling/codepawl_taste_v0.yaml \
  --base-splits artifacts/datasets/local_v1_splits
uv run pawlbench-design-label-app artifacts/datasets/hard_pref_v2/review --labeler-id an
uv run pawlbench-design-label-validate artifacts/datasets/hard_pref_v2/suggested_labels.jsonl --queue artifacts/datasets/hard_pref_v2/review/queue.jsonl --out artifacts/datasets/hard_pref_v2/suggested_validation
```

For 30 complete `local_v1` samples, `hard_pref_v2` emits 180 records and writes `diagnostics.md` with pair type distribution, suggestion balance, confidence distribution, and expected split counts.

Because current hard-pair labels can still track suggestions too closely, collect the next review pass in blind mode before changing Pawl-JEPA architecture:

```bash
uv run pawlbench-design-label-app artifacts/datasets/hard_pref_v2/review --labeler-id an --blind
```

If manual review is being deferred, create an explicit weak-label file instead of treating suggestions as human labels:

```bash
uv run pawlbench-design-label-autofill artifacts/datasets/hard_pref_v2/review/queue.jsonl \
  --suggestions artifacts/datasets/hard_pref_v2/review/suggested_labels.jsonl \
  --out artifacts/datasets/hard_pref_v2/review/labels.auto.jsonl \
  --labeler-id codepawl_taste_v0_auto
uv run pawl-jepa-prepare-hard artifacts/datasets/hard_pref_v2 \
  --labels artifacts/datasets/hard_pref_v2/review/labels.auto.jsonl \
  --base-splits artifacts/datasets/local_v1_splits \
  --out artifacts/pawl_jepa/hard_pref_v2_auto_manifest
```

Pawl-JEPA manifests and reports keep `auto_labeled` counts separate from `human_reviewed` counts. Auto labels are useful for bootstrapping model plumbing, but they are not sufficient for final research claims.

Also prepare local placeholder slots for future/manual generated UI candidate comparisons:

```bash
uv run pawlbench-design-generated-pairs examples/local_v1 --out artifacts/datasets/generated_pref_v0 --seed 42 --limit 20
```

`generated_pref_v0` is not model-generated data; it is a file-based scaffold marked `manual_or_future_generator`.

CodePawl Taste v0 calibrates suggestions toward the current frontend taste profile without overwriting human labels:

```bash
uv run pawlbench-design-label-resuggest artifacts/datasets/hard_pref_v1/review/queue.jsonl \
  --existing-labels artifacts/datasets/hard_pref_v1/suggested_labels.jsonl \
  --out artifacts/datasets/hard_pref_v1/suggested_labels.codepawl_taste_v0.jsonl \
  --taste-profile configs/labeling/codepawl_taste_v0.yaml
uv run pawlbench-design-label-diff artifacts/datasets/hard_pref_v1/suggested_labels.jsonl artifacts/datasets/hard_pref_v1/suggested_labels.codepawl_taste_v0.jsonl --out artifacts/datasets/hard_pref_v1/codepawl_taste_v0_diff
```

Taste-calibrated details use `left_penalty` and `right_penalty`; lower penalty is better.

## Microtraining Scaffold v1

The current scaffold proves that CodePawl can train a local UI representation model from PawlBench pairs and reviewed labels:

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

Hard preference pairs use the same microtraining scaffold with a variant-vs-variant manifest. Use reviewed `hard_pref_v2` labels for the all-pairs benchmark:

```bash
uv run pawl-jepa-prepare-hard artifacts/datasets/hard_pref_v2 \
  --labels data/labels/hard_pref_v2/labels.reviewed.jsonl \
  --base-splits artifacts/datasets/local_v1_splits \
  --out artifacts/pawl_jepa/hard_pref_v2_manifest
uv run pawl-jepa-train artifacts/pawl_jepa/hard_pref_v2_manifest --out artifacts/pawl_jepa/hard_pref_v2_run --epochs 10 --batch-size 8 --device auto
uv run pawl-jepa-eval artifacts/pawl_jepa/hard_pref_v2_run --manifest artifacts/pawl_jepa/hard_pref_v2_manifest --out artifacts/pawl_jepa/hard_pref_v2_eval
```

The model is intentionally small: a shared CNN image encoder, a predictor MLP from nonpreferred embedding to preferred embedding, a scalar preference head, and an optional defect classifier for spacing, contrast, alignment, and hierarchy. Losses combine latent prediction MSE, pairwise preference ranking when labels are not tie/unclear, and optional defect classification.

Pawl-JEPA v0 reporting must compare pairwise accuracy to constant baselines before treating it as signal. Current local labels all prefer the original UI, so `always_prefer_original_accuracy` can be 1.0 and `pairwise_good_vs_bad_accuracy` is not discriminative unless `pairwise_lift_over_always_original` improves. Hard-pair eval reports always-left, always-right, random, and suggestion baselines instead. Defect classification should likewise be read against the majority-class baseline and confusion matrix.

Training dependencies live behind the `jepa` extra. The scaffold uses local screenshots only and does not require DINOv2/SigLIP downloads.
