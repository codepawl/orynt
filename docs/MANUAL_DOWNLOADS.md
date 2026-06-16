# Manual Downloads

This repository does not require external datasets for the UI-JEPA v0 smoke gate.

## Optional Model Weights For A Valid B0 Gate

The B0 baseline can run offline with a deterministic dummy encoder for tests, but that report is not valid for model-selection decisions. A valid B0 gate requires one real frozen vision encoder cached locally.

Suggested first model:

- DINOv2 small: `facebook/dinov2-small`

Optional later backends:

- SigLIP base: `google/siglip-base-patch16-224`
- CLIP ViT-B/32: `openai/clip-vit-base-patch32`

Expected cache:

- Hugging Face cache controlled by `HF_HOME`.
- Recommended local cache: `.cache/huggingface` inside the repo or another persistent local directory.

Example setup:

```bash
export HF_HOME="$PWD/.cache/huggingface"
uv run huggingface-cli download facebook/dinov2-small
```

Optional backend downloads:

```bash
export HF_HOME="$PWD/.cache/huggingface"
uv run huggingface-cli download google/siglip-base-patch16-224
uv run huggingface-cli download openai/clip-vit-base-patch32
```

After downloading weights, rerun B0:

```bash
export HF_HOME="$PWD/.cache/huggingface"
uv run ui-jepa-smoke-b0 data/processed/ui_jepa_v0_smoke --out reports/ui_jepa_v0_smoke --backend dinov2
uv run ui-jepa-scale-gate --dataset data/processed/ui_jepa_v0_smoke --b0-report reports/ui_jepa_v0_smoke/b0_report.json
```

If the report says `real_weights: false`, the backend was unavailable offline and the gate must remain blocked.

The deterministic dummy backend is intentionally allowed for offline tests:

```bash
uv run ui-jepa-smoke-b0 data/processed/ui_jepa_v0_smoke --out reports/ui_jepa_v0_smoke --backend dummy
```

Dummy reports must keep `valid_for_model_selection: false`. Do not copy dummy metrics into a real B0 report or mark `real_weights: true` manually.
