# Labeling Taste Calibration

CodePawl Taste v0 makes label suggestions reflect the current frontend taste profile while keeping all data local and file-based.

## Provenance

- Synthetic labels are deterministic metadata or heuristic outputs.
- Suggestions use `review_status: "suggested"` and are not human-reviewed labels.
- Human-reviewed labels use `confirmed`, `edited`, or `unclear`.
- Regenerated suggestions must be written to a new output path. Do not overwrite reviewed `labels.jsonl` unless an explicit workflow says to.

## CodePawl Taste v0

Config:

```text
configs/labeling/codepawl_taste_v0.yaml
```

Priority order:

1. readability
2. spaciousness
3. hierarchy clarity
4. alignment correctness
5. polished/premium feel
6. contrast/accessibility

Taste rules:

- Tight spacing is high impact because it harms visual comfort and scannability.
- Clear alignment issues are worse than weak readable contrast.
- Weak contrast is severe only when readability is materially harmed.
- Weak hierarchy is lower severity unless the main action or primary content becomes unclear.
- Generic AI slop is product-facing high severity even when usable.
- Tie is rare and should only be used when options are effectively indistinguishable or equally bad.

## Generate Suggestions

Legacy deterministic rules:

```bash
uv run pawlbench-design-label-suggest artifacts/labels/local_v1_train/queue.jsonl \
  --out artifacts/labels/local_v1_train/suggested_labels.jsonl
```

Taste-calibrated suggestions:

```bash
uv run pawlbench-design-label-suggest artifacts/labels/local_v1_train/queue.jsonl \
  --out artifacts/labels/local_v1_train/suggested_labels.codepawl_taste_v0.jsonl \
  --taste-profile configs/labeling/codepawl_taste_v0.yaml
```

## Regenerate Suggestions

Regenerate hard-pair suggestions without changing existing suggestions or human labels:

```bash
uv run pawlbench-design-label-resuggest artifacts/datasets/hard_pref_v1/review/queue.jsonl \
  --existing-labels artifacts/datasets/hard_pref_v1/suggested_labels.jsonl \
  --out artifacts/datasets/hard_pref_v1/suggested_labels.codepawl_taste_v0.jsonl \
  --taste-profile configs/labeling/codepawl_taste_v0.yaml
```

The command prints changed counts for preferred side, severity, defect tags, and quality tags.
Taste suggestion details report `left_penalty` and `right_penalty`; lower penalty is better.

## Diff Suggestions

```bash
uv run pawlbench-design-label-diff artifacts/datasets/hard_pref_v1/suggested_labels.jsonl \
  artifacts/datasets/hard_pref_v1/suggested_labels.codepawl_taste_v0.jsonl \
  --out artifacts/datasets/hard_pref_v1/codepawl_taste_v0_diff
```

Outputs:

- `diff.json`
- `report.md`

The diff reports changed preferred decisions, severity, defect tags, quality tags, reasons, fix instructions, per-defect-type change counts, and examples.

## Review

Use the local label app to turn suggestions into human-reviewed labels:

```bash
uv run pawlbench-design-label-app artifacts/datasets/hard_pref_v1/review --labeler-id an
```

The app shows the suggestion source, taste profile id, reason detail, and confidence when available.
