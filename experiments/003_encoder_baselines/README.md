# 003 Encoder Baselines

Goal: evaluate simple non-training baselines over collected UI artifacts before implementing Pawl-JEPA training.

Candidate baselines may include hand-written metrics, image embeddings, DOM feature summaries, and accessibility issue counts.

Encoder baselines come after PawlBench Design v0 validates jitter pair artifacts with:

```bash
uv run pawlbench-design-eval artifacts/jitter_pairs --out artifacts/pawlbench_eval
```

Do not add heavy ML dependencies until the v0 pair evaluator is stable and producing `summary.json` and `pairs.json`.

First baseline command:

```bash
uv run pawlbench-design-embed artifacts/jitter_pairs --out artifacts/encoder_baselines
cat artifacts/encoder_baselines/summary.json
cat artifacts/encoder_baselines/similarities.json
```

Interpretation:

- Lower screenshot embedding similarity can indicate a larger visual change from the original.
- `thumbnail_rgb_16x16` catches broad composition and color shifts.
- `color_histogram_rgb` catches global color distribution changes.
- `grayscale_edge_density` catches coarse visual complexity changes.
- `dom_layout_stats` is a cheap structural baseline, not a learned layout model.

These baselines are comparison floors for later optional DINOv2/SigLIP experiments or a Pawl-JEPA microtraining scaffold.
