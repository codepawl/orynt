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

The model is intentionally small: a shared CNN image encoder, a predictor MLP from variant embedding to original embedding, a scalar preference head, and an optional defect classifier for spacing, contrast, alignment, and hierarchy. Losses combine latent prediction MSE, pairwise preference ranking when labels are not tie/unclear, and optional defect classification.

Pawl-JEPA v0 reporting must compare pairwise accuracy to constant baselines before treating it as signal. Current local labels all prefer the original UI, so `always_prefer_original_accuracy` can be 1.0 and `pairwise_good_vs_bad_accuracy` is not discriminative unless `pairwise_lift_over_always_original` improves. Defect classification should likewise be read against the majority-class baseline and confusion matrix.

Training dependencies live behind the `jepa` extra. The scaffold uses local screenshots only and does not require DINOv2/SigLIP downloads.
