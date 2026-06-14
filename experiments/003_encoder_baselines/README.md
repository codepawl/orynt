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
- `dom_layout_stats` uses real per-variant `dom.json` and `metrics.json` artifacts.

If variant DOM or metrics artifacts are missing, `summary.json` includes an explicit warning and that variant gets a zero `dom_layout_stats` vector. This prevents silent fallback values from hiding broken pair artifacts.

These baselines are comparison floors for later optional DINOv2/SigLIP experiments or a Pawl-JEPA microtraining scaffold.

## Optional Frozen Vision Baselines

DINOv2 and SigLIP baselines are optional because they require `torch`, `torchvision`, `transformers`, and model downloads. They are frozen image encoders only; no training happens.

Install optional dependencies:

```bash
uv sync --extra vision
```

The Hugging Face DINOv2/SigLIP image processors require `torchvision`. A PIL-only preprocessing fallback may be possible for some models later, but this baseline declares `torchvision` explicitly instead of relying on backend-specific behavior.
Embedding extraction supports common Hugging Face output shapes including raw tensors, `image_embeds`, `pooler_output`, `last_hidden_state`, and tuple/list tensor outputs. DINOv2 may expose pooled or hidden-state tensors; SigLIP may expose image embeddings or pooled vision outputs depending on the loaded model class.

Run against local_v1:

```bash
uv run pawlbench-design-vision-embed artifacts/datasets/local_v1 --out artifacts/vision_baselines/local_v1 --models dinov2,siglip
cat artifacts/vision_baselines/local_v1/summary.json
cat artifacts/vision_baselines/local_v1/similarities.json
cat artifacts/vision_baselines/local_v1/retrieval.json
```

Interpretation:

- Higher original-vs-variant cosine similarity means the frozen encoder sees less visual change.
- Lower similarity for a defect type can indicate that the jitter produces stronger visual perturbations for that encoder.
- Retrieval queries each variant against all original screenshots.
- Top-1 success means the variant's own original is ranked first.
- Top-5 success is a softer retrieval signal for larger datasets.
- Pawl-JEPA should beat these frozen external baselines on documented benchmark tasks before microtraining is considered successful.

Expected outputs:

```text
artifacts/vision_baselines/local_v1/
  embeddings.jsonl
  similarities.json
  retrieval.json
  summary.json
```
