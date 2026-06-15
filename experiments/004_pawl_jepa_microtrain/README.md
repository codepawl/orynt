# 004 Pawl-JEPA Microtrain

Goal: run the smallest useful Pawl-JEPA training experiment after the harness, benchmark tasks, baselines, and jitter pairs exist.

This experiment uses the optional Pawl-JEPA microtraining scaffold. It is a local proof of the data and training path, not the final Pawl-JEPA research model.

## Commands

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

Hard preference microtraining uses reviewed variant-vs-variant labels:

```bash
uv run pawl-jepa-prepare-hard artifacts/datasets/hard_pref_v1 \
  --labels data/labels/hard_pref_v1/labels.reviewed.jsonl \
  --base-splits artifacts/datasets/local_v1_splits \
  --out artifacts/pawl_jepa/hard_pref_v1_manifest
uv run pawl-jepa-train artifacts/pawl_jepa/hard_pref_v1_manifest --out artifacts/pawl_jepa/hard_pref_v1_run --epochs 10 --batch-size 8 --device auto
uv run pawl-jepa-eval artifacts/pawl_jepa/hard_pref_v1_run --manifest artifacts/pawl_jepa/hard_pref_v1_manifest --out artifacts/pawl_jepa/hard_pref_v1_eval
```

## Outputs

- `artifacts/pawl_jepa/local_v1_manifest_full_labels/{manifest.json,train.jsonl,val.jsonl,test.jsonl}`
- `artifacts/pawl_jepa/local_v1_run_full_labels/{config.json,metrics.jsonl,train_summary.json,checkpoints/last.pt}`
- `artifacts/pawl_jepa/local_v1_eval_full_labels/{eval_summary.json,pair_scores.jsonl}`
- `artifacts/pawl_jepa/local_v1_sweep/{sweep_summary.json,runs/seed_*/...}`
- `artifacts/pawl_jepa/local_v1_report/{report.md,summary.json}`
- `artifacts/pawl_jepa/hard_pref_v1_manifest/{manifest.json,train.jsonl,val.jsonl,test.jsonl}`
- `artifacts/pawl_jepa/hard_pref_v1_run/{config.json,metrics.jsonl,train_summary.json,checkpoints/last.pt}`
- `artifacts/pawl_jepa/hard_pref_v1_eval/{eval_summary.json,pair_scores.jsonl}`

## Interpretation

The useful signal is whether the scaffold runs deterministically on local screenshots, learns a decreasing or stable loss over a smoke run, and produces pairwise, defect, cosine, retrieval, constant-baseline, and seed-sweep metrics for val/test. Original-vs-variant `local_v1` results should be treated as a sanity check only because current labels all prefer the original UI; pairwise accuracy is not meaningful unless it beats the always-original baseline. `hard_pref_v1` is the smoke variant-vs-variant set; `hard_pref_v2` is the all-pairs benchmark because neither side is original and reviewed preferences can be left or right.

Hard preference labels are the next dataset step for non-trivial A/B supervision:

```bash
uv run pawlbench-design-hard-pairs artifacts/datasets/local_v1 --out artifacts/datasets/hard_pref_v1 --seed 42
uv run pawlbench-design-label-app artifacts/datasets/hard_pref_v1/review --labeler-id an
```

Generate the all-pairs benchmark before architecture changes:

```bash
uv run pawlbench-design-hard-pairs artifacts/datasets/local_v1 \
  --out artifacts/datasets/hard_pref_v2 \
  --seed 42 \
  --strategy all_pairs \
  --taste-profile configs/labeling/codepawl_taste_v0.yaml \
  --base-splits artifacts/datasets/local_v1_splits
uv run pawlbench-design-label-validate artifacts/datasets/hard_pref_v2/suggested_labels.jsonl --queue artifacts/datasets/hard_pref_v2/review/queue.jsonl --out artifacts/datasets/hard_pref_v2/suggested_validation
```

Use blind review to reduce suggestion leakage before treating `hard_pref_v2` as training signal:

```bash
uv run pawlbench-design-label-app artifacts/datasets/hard_pref_v2/review --labeler-id an --blind
```

Prepare future/manual generated candidate slots without fabricating model output:

```bash
uv run pawlbench-design-generated-pairs examples/local_v1 --out artifacts/datasets/generated_pref_v0 --seed 42 --limit 20
```
