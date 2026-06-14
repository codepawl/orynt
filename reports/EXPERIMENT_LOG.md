# Experiment Log

Use one entry per run. Keep commands exact so results can be reproduced.

Before adding dataset samples, confirm the source is allowed by `docs/DATA_POLICY.md`. Private manual style notes under `references/` are not training data by default.

## YYYY-MM-DD - local_v1 Policy Gate

- Objective: Confirm data policy, references policy, and style taxonomy are in place before creating local_v1 examples.
- Command: `uv run pytest`
- Dataset: policy docs and style note templates only
- Result:
- Failure:
- Next action: Create 30-50 self-controlled HTML examples for local_v1.

## YYYY-MM-DD - local_v1 Example Pack

- Objective: Build, validate, split, and report a 30-sample self-controlled HTML fixture pack.
- Command: `uv run pawlbench-design-build examples/local_v1 --out artifacts/datasets/local_v1 --seed 42`
- Command: `uv run pawlbench-design-validate artifacts/datasets/local_v1 --out artifacts/datasets/local_v1_validation`
- Command: `uv run pawlbench-design-split artifacts/datasets/local_v1 --out artifacts/datasets/local_v1_splits --seed 42`
- Command: `uv run pawlbench-design-report artifacts/datasets/local_v1 --out artifacts/datasets/local_v1_report`
- Dataset: `artifacts/datasets/local_v1/dataset.json`
- Result:
- Failure:
- Next action:

## YYYY-MM-DD - Human Labeling v0

- Objective: Generate a deterministic local label queue, collect pairwise UI preference labels, validate labels, and export a label report.
- Command: `uv run pawlbench-design-label-queue artifacts/datasets/local_v1_splits/train.jsonl --out artifacts/labels/local_v1_train --seed 42 --limit 100`
- Command: `uv run pawlbench-design-label-suggest artifacts/labels/local_v1_train/queue.jsonl --out artifacts/labels/local_v1_train/suggested_labels.jsonl`
- Command: `uv run pawlbench-design-label-app artifacts/labels/local_v1_train --host 127.0.0.1 --port 8765`
- Command: `uv run pawlbench-design-label-audit artifacts/labels/local_v1_train/labels.jsonl --queue artifacts/labels/local_v1_train/queue.jsonl --out artifacts/labels/local_v1_train_audit`
- Command: `uv run pawlbench-design-label-validate artifacts/labels/local_v1_train/labels.jsonl --queue artifacts/labels/local_v1_train/queue.jsonl --out artifacts/labels/local_v1_train_validation`
- Command: `uv run pawlbench-design-label-report artifacts/labels/local_v1_train/labels.jsonl --queue artifacts/labels/local_v1_train/queue.jsonl --out artifacts/labels/local_v1_train_report`
- Dataset: `artifacts/labels/local_v1_train/queue.jsonl`
- Result:
- Failure:
- Next action:

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

## YYYY-MM-DD - local_v0 Dataset QA

- Objective: Validate artifacts, generate sample-level splits, and export a dataset report before ML baselines.
- Command: `uv run pawlbench-design-validate artifacts/datasets/local_v0 --out artifacts/datasets/local_v0_validation`
- Command: `uv run pawlbench-design-split artifacts/datasets/local_v0 --out artifacts/datasets/local_v0_splits --seed 42`
- Command: `uv run pawlbench-design-report artifacts/datasets/local_v0 --out artifacts/datasets/local_v0_report`
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
