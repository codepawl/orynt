# Manual Training And Embedding Commands

Codex must not run CUDA training for the current UI-JEPA smoke corpus. GPU or expensive embedding work should be run manually by the user, then registered through report or embedding files.

## DINOv2 Screen Embeddings

Use this only when local DINOv2 weights are already available:

```bash
uv run ui-jepa-smoke-b0 data/processed/ui_jepa_v0_smoke \
  --out reports/ui_jepa_v0_smoke \
  --backend dinov2 \
  --epochs 20 \
  --export-embeddings reports/ui_jepa_v0_smoke/dinov2_embeddings.jsonl
```

Expected output:

```text
reports/ui_jepa_v0_smoke/dinov2_embeddings.jsonl
```

Then rerun:

```bash
uv run ui-preference-dataset-build data/processed/ui_jepa_v0_smoke \
  --out data/processed/ui_preference_v0 \
  --dinov2-embeddings reports/ui_jepa_v0_smoke/dinov2_embeddings.jsonl
uv run ui-preference-critic-eval data/processed/ui_preference_v0 \
  --out reports/ui_jepa_v0_smoke/preference_critic \
  --report-out reports/ui_jepa_v0_smoke/preference_critic_report.json \
  --b0-report reports/ui_jepa_v0_smoke/b0_report.json \
  --m25-report reports/ui_jepa_v0_smoke/m25_diagnostics_report.json
```

## M1/M2/M2-Strong Embeddings

Current expected paths:

```text
checkpoints/ui_jepa_m1/probe/embeddings.jsonl
checkpoints/ui_jepa_m2/probe/embeddings.jsonl
checkpoints/ui_jepa_m2_strong/probe/embeddings.jsonl
```

If M1 embeddings are missing:

```bash
uv run ui-jepa-m1-probe data/processed/ui_jepa_v0_smoke \
  --checkpoint checkpoints/ui_jepa_m1/checkpoints/m1_last.pt \
  --report-out reports/ui_jepa_v0_smoke/m1_report.json \
  --b0-report reports/ui_jepa_v0_smoke/b0_report.json \
  --device cpu
```

If M2 strong embeddings are missing, rerun the CUDA training manually outside Codex only:

```bash
uv run ui-jepa-m2-train data/processed/ui_jepa_v0_smoke \
  --out checkpoints/ui_jepa_m2_strong \
  --report-out reports/ui_jepa_v0_smoke/m2_strong_report.json \
  --b0-report reports/ui_jepa_v0_smoke/b0_report.json \
  --m1-report reports/ui_jepa_v0_smoke/m1_report.json \
  --epochs 20 \
  --batch-size 64 \
  --image-size 128 \
  --patch-size 16 \
  --embedding-dim 128 \
  --predictor-hidden-dim 256 \
  --transformer-layers 2 \
  --transformer-heads 4 \
  --target-regions 2 \
  --probe-epochs 30 \
  --device cuda
```

The current manual M2-strong evidence already exists and closes the undertraining hypothesis for this smoke corpus: it is valid/non-collapsed but remains near chance, with test accuracy about `0.4977`.

## Decision Rules

- Do not return to JEPA architecture work unless M1/M2/M2-strong features add measurable value in `preference_critic_report.json`.
- Do not implement DOM-aware JEPA while metrics-only dominates and M2.5 lacks useful M2-family representation signal.
- Closed-loop patch evaluation is now the local Phase 4B path. Build loop sets with `python -m codepawl_harness.ui_loop_build_cli`, run no-op/deterministic/oracle/manual-patch-import modes with `python -m codepawl_harness.ui_loop_run_cli`, and pass `--closed-loop-report reports/ui_loop_v0_mixed_deterministic/closed_loop_report.json` to the scale gate.
- The current gate records `closed_loop_mixed_passed: true`, `closed_loop_hard_passed: true`, and `closed_loop_non_oracle_ready: true`, while `manual_review_ready`, `pr_review_ready`, and `dom_aware_ready` remain false. Next manual evidence should come from Codex/user patches and human/manual review queue labels on selected mixed/hard tasks, not CUDA training.
