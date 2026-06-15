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

## Outputs

- `artifacts/pawl_jepa/local_v1_manifest_full_labels/{manifest.json,train.jsonl,val.jsonl,test.jsonl}`
- `artifacts/pawl_jepa/local_v1_run_full_labels/{config.json,metrics.jsonl,train_summary.json,checkpoints/last.pt}`
- `artifacts/pawl_jepa/local_v1_eval_full_labels/{eval_summary.json,pair_scores.jsonl}`
- `artifacts/pawl_jepa/local_v1_sweep/{sweep_summary.json,runs/seed_*/...}`
- `artifacts/pawl_jepa/local_v1_report/{report.md,summary.json}`

## Interpretation

The useful signal is whether the scaffold runs deterministically on local screenshots, learns a decreasing or stable loss over a smoke run, and produces pairwise, defect, cosine, retrieval, constant-baseline, and seed-sweep metrics for val/test. Results should be treated as a sanity check only because `local_v1` is intentionally small and current labels all prefer the original UI; pairwise accuracy is not meaningful unless it beats the always-original baseline.

Hard preference labels are the next dataset step for non-trivial A/B supervision:

```bash
uv run pawlbench-design-hard-pairs artifacts/datasets/local_v1 --out artifacts/datasets/hard_pref_v1 --seed 42
uv run pawlbench-design-label-app artifacts/datasets/hard_pref_v1/review --labeler-id an
```

These labels remain outside the current Pawl-JEPA manifest until variant-vs-variant supervision is explicitly added.
