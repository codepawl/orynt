# 003 Encoder Baselines

Goal: evaluate simple non-training baselines over collected UI artifacts before implementing Pawl-JEPA training.

Candidate baselines may include hand-written metrics, image embeddings, DOM feature summaries, and accessibility issue counts.

Encoder baselines come after PawlBench Design v0 validates jitter pair artifacts with:

```bash
uv run pawlbench-design-eval artifacts/jitter_pairs --out artifacts/pawlbench_eval
```

Do not add heavy ML dependencies until the v0 pair evaluator is stable and producing `summary.json` and `pairs.json`.
