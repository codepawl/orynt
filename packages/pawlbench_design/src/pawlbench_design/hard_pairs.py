"""Hard variant-vs-variant preference pair generation for PawlBench Design."""

from __future__ import annotations

import json
import random
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from pawlbench_design.labels import _write_json, _write_jsonl


SUGGESTED_BY = "codepawl_hard_pair_rule_v0"
PAIR_TEMPLATES = (
    ("contrast_bad", "spacing_bad"),
    ("hierarchy_bad", "alignment_bad"),
    ("spacing_bad", "hierarchy_bad"),
)


@dataclass(frozen=True)
class HardPairConfig:
    input_dir: Path
    output_dir: Path
    seed: int = 42


@dataclass(frozen=True)
class HardPairResult:
    output_dir: Path
    hard_pairs_path: Path
    suggested_labels_path: Path
    summary_path: Path
    review_queue_path: Path
    review_readme_path: Path
    records: list[dict[str, Any]]
    suggested_labels: list[dict[str, Any]]
    summary: dict[str, Any]


def build_hard_pairs(config: HardPairConfig) -> HardPairResult:
    input_dir = config.input_dir.expanduser().resolve()
    output_dir = config.output_dir.expanduser().resolve()
    dataset_path = input_dir / "dataset.json"
    if not dataset_path.is_file():
        raise ValueError(f"dataset.json is missing: {dataset_path}")
    dataset = json.loads(dataset_path.read_text(encoding="utf-8"))
    dataset_id = str(dataset.get("dataset_id", input_dir.name))
    rng = random.Random(config.seed)

    records: list[dict[str, Any]] = []
    suggested_labels: list[dict[str, Any]] = []
    skipped: list[dict[str, Any]] = []
    for sample in dataset.get("samples", []):
        if sample.get("status") != "ok":
            continue
        variants = {
            str(variant.get("variant_name")): variant
            for variant in sample.get("variants", [])
            if variant.get("variant_name")
        }
        for first_name, second_name in PAIR_TEMPLATES:
            if first_name not in variants or second_name not in variants:
                skipped.append(
                    {
                        "sample_id": sample.get("sample_id"),
                        "pair": [first_name, second_name],
                        "reason": "missing variant",
                    }
                )
                continue
            left_name, right_name = first_name, second_name
            if rng.choice((False, True)):
                left_name, right_name = right_name, left_name
            record = hard_pair_record(
                dataset_id=dataset_id,
                sample=sample,
                left_variant=variants[left_name],
                right_variant=variants[right_name],
                input_dir=input_dir,
            )
            records.append(record)
            suggested_labels.append(suggested_label(record))

    summary = build_summary(
        input_dir=input_dir,
        dataset_id=dataset_id,
        seed=config.seed,
        records=records,
        suggested_labels=suggested_labels,
        skipped=skipped,
    )

    review_dir = output_dir / "review"
    output_dir.mkdir(parents=True, exist_ok=True)
    review_dir.mkdir(parents=True, exist_ok=True)
    hard_pairs_path = output_dir / "hard_pairs.jsonl"
    suggested_labels_path = output_dir / "suggested_labels.jsonl"
    summary_path = output_dir / "summary.json"
    review_queue_path = review_dir / "queue.jsonl"
    review_suggestions_path = review_dir / "suggested_labels.jsonl"
    review_readme_path = review_dir / "README.md"

    _write_jsonl(hard_pairs_path, records)
    _write_jsonl(suggested_labels_path, suggested_labels)
    _write_jsonl(review_queue_path, records)
    _write_jsonl(review_suggestions_path, suggested_labels)
    _write_json(summary_path, summary)
    review_readme_path.write_text(review_readme(dataset_id, config.seed, len(records)), encoding="utf-8")

    return HardPairResult(
        output_dir=output_dir,
        hard_pairs_path=hard_pairs_path,
        suggested_labels_path=suggested_labels_path,
        summary_path=summary_path,
        review_queue_path=review_queue_path,
        review_readme_path=review_readme_path,
        records=records,
        suggested_labels=suggested_labels,
        summary=summary,
    )


def hard_pair_record(
    *,
    dataset_id: str,
    sample: dict[str, Any],
    left_variant: dict[str, Any],
    right_variant: dict[str, Any],
    input_dir: Path,
) -> dict[str, Any]:
    sample_id = str(sample["sample_id"])
    left_name = str(left_variant["variant_name"])
    right_name = str(right_variant["variant_name"])
    canonical_names = sorted([left_name, right_name])
    pair_slug = f"{canonical_names[0]}__vs__{canonical_names[1]}"
    pair_id = f"hard_pref_v1__{sample_id}__{pair_slug}"
    left_metrics = read_metrics(left_variant)
    right_metrics = read_metrics(right_variant)
    suggestion = choose_preferred(left_metrics, right_metrics)
    left_record = variant_side(left_variant)
    right_record = variant_side(right_variant)
    return {
        "label_id": pair_id,
        "pair_id": pair_id,
        "pair_kind": "variant_vs_variant",
        "dataset_id": dataset_id,
        "split": "hard_pref_v1",
        "sample_id": sample_id,
        "variant_name": pair_slug,
        "defect_type": f"{left_record['defect_type']}_vs_{right_record['defect_type']}",
        "left_item": left_name,
        "right_item": right_name,
        "left_variant_name": left_name,
        "right_variant_name": right_name,
        "left_defect_type": left_record["defect_type"],
        "right_defect_type": right_record["defect_type"],
        left_name: left_record,
        right_name: right_record,
        "left": left_record,
        "right": right_record,
        "suggested_preferred": suggestion["preferred"],
        "suggestion_reason": suggestion["reason"],
        "suggestion_confidence": suggestion["confidence"],
        "heuristic_signals": suggestion["signals"],
        "source_dataset_dir": str(input_dir),
    }


def variant_side(variant: dict[str, Any]) -> dict[str, Any]:
    return {
        "variant_name": variant.get("variant_name"),
        "defect_type": variant.get("defect_type"),
        "screenshot_path": variant.get("screenshot_path"),
        "metrics_path": variant.get("metrics_path"),
        "html_path": variant.get("html_path"),
        "dom_path": variant.get("dom_path"),
        "accessibility_path": variant.get("accessibility_path"),
    }


def read_metrics(variant: dict[str, Any]) -> dict[str, Any]:
    metrics_path = variant.get("metrics_path")
    if not isinstance(metrics_path, str) or not metrics_path:
        return {}
    path = Path(metrics_path)
    if not path.is_file():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def choose_preferred(left: dict[str, Any], right: dict[str, Any]) -> dict[str, Any]:
    signals = heuristic_signals(left, right)
    for signal in signals:
        if signal["winner"] in {"left", "right"}:
            return {
                "preferred": signal["winner"],
                "reason": f"{signal['winner']} wins on {signal['name']}: {signal['reason']}",
                "confidence": signal["confidence"],
                "signals": signals,
            }
    return {
        "preferred": "tie",
        "reason": "No decisive heuristic signal separated the two variants.",
        "confidence": 2,
        "signals": signals,
    }


def heuristic_signals(left: dict[str, Any], right: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        lower_is_better_signal("contrast_issue_count", left, right, confidence=5),
        higher_is_better_signal("min_contrast_ratio", left, right, confidence=5),
        closeness_signal("font_size_ratio", left, right, target=2.0, confidence=4),
        lower_is_better_signal("hierarchy_warning_count", left, right, confidence=4),
        lower_is_better_signal("changed_pixel_ratio", left, right, confidence=3),
    ]


def lower_is_better_signal(
    key: str,
    left: dict[str, Any],
    right: dict[str, Any],
    *,
    confidence: int,
) -> dict[str, Any]:
    left_value = number(left.get(key))
    right_value = number(right.get(key))
    winner = None
    if left_value is not None and right_value is not None:
        if left_value < right_value:
            winner = "left"
        elif right_value < left_value:
            winner = "right"
    return signal(key, left_value, right_value, winner, "lower is better", confidence)


def higher_is_better_signal(
    key: str,
    left: dict[str, Any],
    right: dict[str, Any],
    *,
    confidence: int,
) -> dict[str, Any]:
    left_value = number(left.get(key))
    right_value = number(right.get(key))
    winner = None
    if left_value is not None and right_value is not None:
        if left_value > right_value:
            winner = "left"
        elif right_value > left_value:
            winner = "right"
    return signal(key, left_value, right_value, winner, "higher is better", confidence)


def closeness_signal(
    key: str,
    left: dict[str, Any],
    right: dict[str, Any],
    *,
    target: float,
    confidence: int,
) -> dict[str, Any]:
    left_value = number(left.get(key))
    right_value = number(right.get(key))
    winner = None
    if left_value is not None and right_value is not None:
        left_distance = abs(left_value - target)
        right_distance = abs(right_value - target)
        if left_distance < right_distance:
            winner = "left"
        elif right_distance < left_distance:
            winner = "right"
    return signal(key, left_value, right_value, winner, f"closer to {target:g} is better", confidence)


def signal(
    key: str,
    left_value: float | None,
    right_value: float | None,
    winner: str | None,
    reason: str,
    confidence: int,
) -> dict[str, Any]:
    return {
        "name": key,
        "left": left_value,
        "right": right_value,
        "winner": winner or "tie",
        "reason": reason,
        "confidence": confidence if winner else 2,
    }


def number(value: Any) -> float | None:
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, int | float):
        return float(value)
    return None


def suggested_label(record: dict[str, Any]) -> dict[str, Any]:
    preferred = record["suggested_preferred"]
    defect_tags = sorted(
        {
            str(record["left_defect_type"]),
            str(record["right_defect_type"]),
        }
    )
    return {
        "label_id": record["label_id"],
        "pair_id": record["pair_id"],
        "pair_kind": record["pair_kind"],
        "dataset_id": record["dataset_id"],
        "split": record["split"],
        "sample_id": record["sample_id"],
        "variant_name": record["variant_name"],
        "defect_type": record["defect_type"],
        "left_item": record["left_item"],
        "right_item": record["right_item"],
        "left_variant_name": record["left_variant_name"],
        "right_variant_name": record["right_variant_name"],
        "left_defect_type": record["left_defect_type"],
        "right_defect_type": record["right_defect_type"],
        "preferred": preferred,
        "defect_tags": defect_tags,
        "quality_tags": ["practical"],
        "severity": "medium" if preferred in {"left", "right"} else "low",
        "fix_instruction": "Compare both variants and preserve the stronger visual treatment.",
        "reason": record["suggestion_reason"],
        "confidence": int(record["suggestion_confidence"]),
        "labeler_id": SUGGESTED_BY,
        "created_at": "1970-01-01T00:00:00Z",
        "suggested_by": SUGGESTED_BY,
        "suggested_preferred": preferred,
        "suggestion_reason": record["suggestion_reason"],
        "suggestion_confidence": int(record["suggestion_confidence"]),
        "heuristic_signals": record["heuristic_signals"],
        "review_status": "suggested",
        "reviewed_by": None,
        "reviewed_at": None,
    }


def build_summary(
    *,
    input_dir: Path,
    dataset_id: str,
    seed: int,
    records: list[dict[str, Any]],
    suggested_labels: list[dict[str, Any]],
    skipped: list[dict[str, Any]],
) -> dict[str, Any]:
    return {
        "schema_version": "pawlbench_hard_pref_v1",
        "dataset_id": dataset_id,
        "source_dataset_dir": str(input_dir),
        "seed": seed,
        "pair_templates": [list(item) for item in PAIR_TEMPLATES],
        "pair_count": len(records),
        "suggested_label_count": len(suggested_labels),
        "review_queue_count": len(records),
        "preferred_counts": dict(sorted(Counter(label["preferred"] for label in suggested_labels).items())),
        "pair_counts_by_template": dict(sorted(Counter(record["variant_name"] for record in records).items())),
        "skipped": skipped,
        "warnings": ["Suggested labels are heuristic suggestions and are not human-reviewed labels."],
    }


def review_readme(dataset_id: str, seed: int, count: int) -> str:
    return f"""# Hard Preference Review Queue

Dataset: `{dataset_id}`
Seed: `{seed}`
Pairs: `{count}`

This queue contains variant-vs-variant hard preference pairs. Neither side is the original UI.

Run:

```bash
uv run pawlbench-design-label-app artifacts/datasets/hard_pref_v1/review --labeler-id an
```

Suggested labels are heuristic only and use `review_status: "suggested"` until a human reviewer confirms or edits them.
"""
