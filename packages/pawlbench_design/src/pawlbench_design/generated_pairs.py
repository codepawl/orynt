"""Generated-candidate preference scaffold for PawlBench Design."""

from __future__ import annotations

import json
import random
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from pawlbench_design.labels import _write_json, _write_jsonl


@dataclass(frozen=True)
class GeneratedPairConfig:
    source_dir: Path
    output_dir: Path
    seed: int = 42
    limit: int | None = None


@dataclass(frozen=True)
class GeneratedPairResult:
    output_dir: Path
    candidates_dir: Path
    review_queue_path: Path
    summary_path: Path
    readme_path: Path
    records: list[dict[str, Any]]
    summary: dict[str, Any]


def build_generated_pairs(config: GeneratedPairConfig) -> GeneratedPairResult:
    source_dir = config.source_dir.expanduser().resolve()
    output_dir = config.output_dir.expanduser().resolve()
    if not source_dir.is_dir():
        raise ValueError(f"source directory is missing: {source_dir}")
    if config.limit is not None and config.limit < 0:
        raise ValueError("--limit must be greater than or equal to 0")

    html_paths = sorted(source_dir.rglob("*.html"))
    rng = random.Random(config.seed)
    rng.shuffle(html_paths)
    html_paths = sorted(html_paths[: config.limit]) if config.limit is not None else sorted(html_paths)

    candidates_dir = output_dir / "candidates"
    review_dir = output_dir / "review"
    candidates_dir.mkdir(parents=True, exist_ok=True)
    review_dir.mkdir(parents=True, exist_ok=True)

    records = [
        generated_pair_record(source_dir, path, output_dir=output_dir, index=index)
        for index, path in enumerate(html_paths)
    ]
    for record in records:
        slot_dir = candidates_dir / str(record["sample_id"])
        slot_dir.mkdir(parents=True, exist_ok=True)
        (slot_dir / "README.md").write_text(candidate_readme(record), encoding="utf-8")

    summary = {
        "schema_version": "pawlbench_generated_pref_v0",
        "dataset_id": output_dir.name,
        "source": "manual_or_future_generator",
        "source_dir": str(source_dir),
        "output_dir": str(output_dir),
        "seed": config.seed,
        "limit": config.limit,
        "total_records": len(records),
        "candidate_count": len(records),
        "warnings": [
            "This scaffold contains placeholder/manual candidate slots only.",
            "No generated UI screenshots or model-generated artifacts are fabricated.",
        ],
    }

    review_queue_path = review_dir / "queue.jsonl"
    summary_path = output_dir / "summary.json"
    readme_path = output_dir / "README.md"
    _write_jsonl(review_queue_path, records)
    _write_json(summary_path, summary)
    readme_path.write_text(readme(summary), encoding="utf-8")
    return GeneratedPairResult(
        output_dir=output_dir,
        candidates_dir=candidates_dir,
        review_queue_path=review_queue_path,
        summary_path=summary_path,
        readme_path=readme_path,
        records=records,
        summary=summary,
    )


def generated_pair_record(source_dir: Path, html_path: Path, *, output_dir: Path, index: int) -> dict[str, Any]:
    sample_id = slug(html_path.stem)
    relative_path = html_path.relative_to(source_dir).as_posix()
    label_id = f"{output_dir.name}__{index:04d}__{sample_id}"
    candidate_dir = output_dir / "candidates" / sample_id
    return {
        "label_id": label_id,
        "pair_id": label_id,
        "pair_kind": "generated_candidate_placeholder",
        "dataset_id": output_dir.name,
        "split": output_dir.name,
        "sample_id": sample_id,
        "variant_name": "manual_or_future_generator",
        "defect_type": "generated_candidate_placeholder",
        "source_type": "manual_or_future_generator",
        "source_path": str(html_path),
        "source_relative_path": relative_path,
        "left_item": "source",
        "right_item": "candidate",
        "source": {
            "item": "source",
            "html_path": str(html_path),
            "screenshot_path": None,
        },
        "candidate": {
            "item": "candidate",
            "candidate_slot_dir": str(candidate_dir),
            "html_path": None,
            "screenshot_path": None,
            "source": "manual_or_future_generator",
        },
        "placeholder": True,
        "review_note": "Add a real generated/manual candidate artifact before labeling this pair.",
    }


def slug(value: str) -> str:
    chars = []
    previous_dash = False
    for char in value.lower():
        if char.isalnum() or char == "_":
            chars.append(char)
            previous_dash = False
        elif not previous_dash:
            chars.append("-")
            previous_dash = True
    return "".join(chars).strip("-") or "sample"


def candidate_readme(record: dict[str, Any]) -> str:
    return f"""# Candidate Slot

Sample: `{record['sample_id']}`
Source: `{record['source_relative_path']}`

Place a real manually-created or future-generator candidate artifact here before labeling.
Do not treat this placeholder as generated data.
"""


def readme(summary: dict[str, Any]) -> str:
    return f"""# Generated Preference v0 Scaffold

Source: `{summary['source_dir']}`
Records: `{summary['total_records']}`
Seed: `{summary['seed']}`

This directory contains placeholder/manual candidate slots only. It does not include fabricated
model-generated UI data.

Review queue:

```bash
uv run pawlbench-design-label-app {summary['output_dir']}/review --labeler-id an --blind
```
"""
