# Experiment Log

Use one entry per run. Keep commands exact so results can be reproduced.

## YYYY-MM-DD - 002 Jitter Pairs

- Objective: Generate deterministic synthetic good/bad UI pairs from `examples/simple_landing.html`.
- Command: `uv run codepawl-jitter examples/simple_landing.html --out artifacts/jitter_pairs --seed 42`
- Dataset:
- Result:
- Failure:
- Next action:

## YYYY-MM-DD - local_v0 Dataset Build

- Objective: Build a deterministic local PawlBench Design dataset from all HTML files in `examples/`.
- Command: `uv run pawlbench-design-build examples --out artifacts/datasets/local_v0 --seed 42`
- Dataset: `artifacts/datasets/local_v0/dataset.json`
- Result:
- Failure:
- Next action:

## YYYY-MM-DD - Experiment Name

- Objective:
- Command:
- Dataset:
- Result:
- Failure:
- Next action:
