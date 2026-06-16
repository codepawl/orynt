# Closed-Loop Frontend Evaluation v0

Status: Phase 4A local/synthetic harness. It does not call external LLM APIs, train JEPA models, run CUDA jobs, or require network access.

## Purpose

The v0 loop tests whether the local Preference Critic helps a practical frontend iteration path:

1. load a rendered local UI task
2. emit critique JSON
3. write a Codex-compatible patch contract
4. apply a deterministic local patch when safe, or save manual instructions
5. rerender
6. compare before/after critic score, deterministic metrics, accessibility/overflow flags, and screenshots
7. export reproducible task and aggregate reports

All claims are limited to synthetic/local preference improvement unless future human review forms are filled.

## Build Datasets

```bash
UV_NO_SYNC=1 UV_CACHE_DIR=/tmp/uv-cache uv run python -m codepawl_harness.ui_loop_build_cli \
  data/processed/ui_jepa_v0_smoke --out data/processed/ui_loop_v0 --set loop_easy_20

UV_NO_SYNC=1 UV_CACHE_DIR=/tmp/uv-cache uv run python -m codepawl_harness.ui_loop_build_cli \
  data/processed/ui_jepa_v0_smoke --out data/processed/ui_loop_v0 --set loop_mixed_50

UV_NO_SYNC=1 UV_CACHE_DIR=/tmp/uv-cache uv run python -m codepawl_harness.ui_loop_build_cli \
  data/processed/ui_jepa_v0_smoke --out data/processed/ui_loop_v0 --set loop_hard_100
```

Current generated counts:

- `loop_easy_20`: 20 tasks.
- `loop_mixed_50`: 50 tasks.
- `loop_hard_100`: 100 tasks.

Each task record uses `ui_loop_v0_task_v1` and includes before HTML, screenshot, DOM, accessibility, metrics, known issue types, corruption type, severity, difficulty, split, and expected patch scope.

## Run Modes

Instruction-only mode writes critique JSON and Markdown contracts, but it is not evidence of improvement:

```bash
UV_NO_SYNC=1 UV_CACHE_DIR=/tmp/uv-cache uv run python -m codepawl_harness.ui_loop_run_cli \
  data/processed/ui_loop_v0/loop_easy_20 \
  --out reports/ui_loop_v0_instruction_only \
  --patch-mode instruction_only \
  --limit 3
```

Deterministic patch mode operates only on copied local loop work files. For the current synthetic jitter fixtures it removes the known `data-codepawl-jitter` CSS block, rerenders, scores before/after, and exports reports:

```bash
UV_NO_SYNC=1 UV_CACHE_DIR=/tmp/uv-cache uv run python -m codepawl_harness.ui_loop_run_cli \
  data/processed/ui_loop_v0/loop_easy_20 \
  --out reports/ui_loop_v0 \
  --patch-mode deterministic_patch
```

`oracle_patch` copies the clean source artifact as an upper-bound sanity check and must be excluded from non-oracle claims. `manual_patch` is for saved contracts and future human/Codex-applied patches; generated instructions are artifacts and are not sent anywhere.

## Report Interpretation

Primary report:

```text
reports/ui_loop_v0/closed_loop_report.json
```

Current deterministic easy-set result:

- `passed_closed_loop_gate: true`
- `task_count: 20`
- `success_rate: 1.0`
- `mean_critic_delta: 0.14`
- no-op mean critic delta: `0.0`
- accessibility regression rate: `0.0`
- responsive regression rate: `0.0`
- recommendation: `expand_loop_mixed_50`

The no-op baseline is mandatory because the same local critic helps generate and score the loop. Deterministic metric deltas, accessibility regressions, responsive/overflow regressions, and manual review exports must be read separately from critic deltas.

## Manual Review Queue

Every task writes a review template under:

```text
reports/ui_loop_v0/manual_review_queue/
```

Each template includes before/after screenshots, critic JSON, instruction Markdown, patch diff when available, and fields for:

- `preferred`: `before`, `after`, or `tie`
- `issue_types_remaining`
- `notes`
- `reviewer_id`
- `provenance`

Manual agreement or disagreement with the critic is the required next evidence before using this critic for real PR review.

## Gate

Run:

```bash
UV_NO_SYNC=1 UV_CACHE_DIR=/tmp/uv-cache uv run python -m codepawl_harness.ui_jepa_scale_gate_cli \
  --dataset data/processed/ui_jepa_v0_smoke \
  --b0-report reports/ui_jepa_v0_smoke/b0_report.json \
  --m1-report reports/ui_jepa_v0_smoke/m1_report.json \
  --m2-report reports/ui_jepa_v0_smoke/m2_report.json \
  --m2-strong-report reports/ui_jepa_v0_smoke/m2_strong_report.json \
  --m25-report reports/ui_jepa_v0_smoke/m25_diagnostics_report.json \
  --preference-critic-report reports/ui_jepa_v0_smoke/preference_critic_report.json \
  --closed-loop-report reports/ui_loop_v0/closed_loop_report.json \
  --out reports/ui_jepa_v0_smoke/scale_gate.json
```

The current gate records `closed_loop_ready: true` and `closed_loop_passed: true`, while `dom_aware_ready` remains false because M2.5 still finds no useful representation signal and no DOM/localization bottleneck has been shown.

## Before Real PR Review

Evidence still needed:

- run `loop_mixed_50` in deterministic or manual mode
- inspect failures and wins in the manual review queue
- collect human labels if reviewers disagree with critic rankings
- recalibrate the critic if manual review disagrees
- only revisit DOM-aware JEPA if closed-loop failures show critic localization or DOM grounding is the bottleneck
