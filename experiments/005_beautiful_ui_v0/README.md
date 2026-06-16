# 005 beautiful_ui_v0 Positive Corpus

Goal: create a self-authored positive UI corpus for future Pawl-JEPA representation pretraining.

This experiment does not train Pawl-JEPA and does not change model architecture. It creates polished, fictional, local-only HTML/CSS examples and renders them into a positive dataset artifact.

## Commands

```bash
uv run pawlbench-design-positive-build examples/beautiful_ui_v0 --out artifacts/datasets/beautiful_ui_v0 --seed 42
uv run pawlbench-design-positive-validate artifacts/datasets/beautiful_ui_v0 --out artifacts/datasets/beautiful_ui_v0_validation
uv run pawlbench-design-positive-report artifacts/datasets/beautiful_ui_v0 --out artifacts/datasets/beautiful_ui_v0_report
uv run pawl-jepa-positive-prepare artifacts/datasets/beautiful_ui_v0 --out artifacts/pawl_jepa/beautiful_ui_v0_manifest
uv run pawl-jepa-positive-train artifacts/pawl_jepa/beautiful_ui_v0_manifest --out artifacts/pawl_jepa/beautiful_ui_v0_pretrain --epochs 10 --batch-size 8 --device auto
uv run pawl-jepa-positive-eval artifacts/pawl_jepa/beautiful_ui_v0_pretrain --manifest artifacts/pawl_jepa/beautiful_ui_v0_manifest --out artifacts/pawl_jepa/beautiful_ui_v0_eval
```

## Expected Outputs

- `artifacts/datasets/beautiful_ui_v0/dataset.json`
- `artifacts/datasets/beautiful_ui_v0/samples/{sample_id}/index.html`
- `artifacts/datasets/beautiful_ui_v0/samples/{sample_id}/screenshot.png`
- `artifacts/datasets/beautiful_ui_v0/samples/{sample_id}/dom.json`
- `artifacts/datasets/beautiful_ui_v0/samples/{sample_id}/accessibility.json`
- `artifacts/datasets/beautiful_ui_v0/samples/{sample_id}/metrics.json`
- `artifacts/datasets/beautiful_ui_v0_report/{summary.json,report.md}`
- `artifacts/pawl_jepa/beautiful_ui_v0_manifest/{manifest.json,all.jsonl,train.jsonl,val.jsonl,test.jsonl}`
- `artifacts/pawl_jepa/beautiful_ui_v0_pretrain/{config.json,metrics.jsonl,train_summary.json,checkpoints/last.pt}`
- `artifacts/pawl_jepa/beautiful_ui_v0_eval/eval_summary.json`

## Acceptance Checks

- Exactly 40 HTML examples exist under `examples/beautiful_ui_v0`.
- Examples are standalone static HTML with inline CSS only.
- No external URLs, scripts, CDNs, fonts, images, logos, screenshots, or brand assets are referenced.
- Positive build succeeds with `failed_count: 0`.
- Validation reports `valid: true`.
- Positive eval reports augmented-view consistency, retrieval top1/top5, and average embedding variance.

## Next Step

Use the positive checkpoint to initialize hard-pair preference fine-tuning:

```bash
uv run pawl-jepa-train artifacts/pawl_jepa/hard_pref_v2_manifest \
  --out artifacts/pawl_jepa/hard_pref_v2_run_from_positive \
  --epochs 10 \
  --batch-size 8 \
  --device auto \
  --pretrained-checkpoint artifacts/pawl_jepa/beautiful_ui_v0_pretrain/checkpoints/last.pt
```

Positive pretraining teaches the polished UI manifold; hard pairs teach preference and taste.
