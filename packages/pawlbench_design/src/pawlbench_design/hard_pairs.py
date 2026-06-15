"""Hard variant-vs-variant preference pair generation for PawlBench Design."""

from __future__ import annotations

import json
import random
from collections import Counter
from dataclasses import dataclass
from itertools import combinations
from pathlib import Path
from typing import Any

from pawlbench_design.labels import _write_json, _write_jsonl
from pawlbench_design.taste import load_taste_profile, suggest_label_with_taste


SUGGESTED_BY = "codepawl_hard_pair_rule_v0"
CORE_PAIR_TEMPLATES = (
    ("contrast_bad", "spacing_bad"),
    ("hierarchy_bad", "alignment_bad"),
    ("spacing_bad", "hierarchy_bad"),
)
ALL_PAIR_VARIANTS = ("contrast_bad", "spacing_bad", "alignment_bad", "hierarchy_bad")
STRATEGIES = ("core_pairs", "all_pairs")


@dataclass(frozen=True)
class HardPairConfig:
    input_dir: Path
    output_dir: Path
    seed: int = 42
    strategy: str = "core_pairs"
    taste_profile_path: Path | None = None
    base_splits_dir: Path | None = None


@dataclass(frozen=True)
class HardPairResult:
    output_dir: Path
    hard_pairs_path: Path
    suggested_labels_path: Path
    summary_path: Path
    diagnostics_path: Path
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
    if config.strategy not in STRATEGIES:
        raise ValueError(f"unsupported hard-pair strategy: {config.strategy}")
    dataset = json.loads(dataset_path.read_text(encoding="utf-8"))
    dataset_id = str(dataset.get("dataset_id", input_dir.name))
    hard_dataset_id = hard_dataset_id_from_output(output_dir)
    pair_templates = pair_templates_for_strategy(config.strategy)
    taste_profile = load_taste_profile(config.taste_profile_path) if config.taste_profile_path else None
    rng = random.Random(config.seed)

    records: list[dict[str, Any]] = []
    suggested_labels: list[dict[str, Any]] = []
    skipped: list[dict[str, Any]] = []
    ok_sample_count = 0
    for sample in dataset.get("samples", []):
        if sample.get("status") != "ok":
            continue
        ok_sample_count += 1
        variants = {
            str(variant.get("variant_name")): variant
            for variant in sample.get("variants", [])
            if variant.get("variant_name")
        }
        for first_name, second_name in pair_templates:
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
                hard_dataset_id=hard_dataset_id,
                sample=sample,
                left_variant=variants[left_name],
                right_variant=variants[right_name],
                input_dir=input_dir,
            )
            label = suggest_label_with_taste(record, taste_profile) if taste_profile else suggested_label(record)
            apply_suggestion_to_record(record, label)
            records.append(record)
            suggested_labels.append(label)

    summary = build_summary(
        input_dir=input_dir,
        dataset_id=dataset_id,
        hard_dataset_id=hard_dataset_id,
        seed=config.seed,
        strategy=config.strategy,
        pair_templates=pair_templates,
        sample_count=ok_sample_count,
        records=records,
        suggested_labels=suggested_labels,
        skipped=skipped,
        base_splits_dir=config.base_splits_dir,
    )

    review_dir = output_dir / "review"
    output_dir.mkdir(parents=True, exist_ok=True)
    review_dir.mkdir(parents=True, exist_ok=True)
    hard_pairs_path = output_dir / "hard_pairs.jsonl"
    suggested_labels_path = output_dir / "suggested_labels.jsonl"
    summary_path = output_dir / "summary.json"
    diagnostics_path = output_dir / "diagnostics.md"
    review_queue_path = review_dir / "queue.jsonl"
    review_suggestions_path = review_dir / "suggested_labels.jsonl"
    review_readme_path = review_dir / "README.md"

    _write_jsonl(hard_pairs_path, records)
    _write_jsonl(suggested_labels_path, suggested_labels)
    _write_jsonl(review_queue_path, records)
    _write_jsonl(review_suggestions_path, suggested_labels)
    _write_json(summary_path, summary)
    diagnostics_path.write_text(diagnostics_markdown(summary), encoding="utf-8")
    review_readme_path.write_text(
        review_readme(hard_dataset_id, config.seed, config.strategy, len(records)),
        encoding="utf-8",
    )

    return HardPairResult(
        output_dir=output_dir,
        hard_pairs_path=hard_pairs_path,
        suggested_labels_path=suggested_labels_path,
        summary_path=summary_path,
        diagnostics_path=diagnostics_path,
        review_queue_path=review_queue_path,
        review_readme_path=review_readme_path,
        records=records,
        suggested_labels=suggested_labels,
        summary=summary,
    )


def hard_pair_record(
    *,
    dataset_id: str,
    hard_dataset_id: str,
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
    pair_id = f"{hard_dataset_id}__{sample_id}__{pair_slug}"
    left_metrics = read_metrics(left_variant)
    right_metrics = read_metrics(right_variant)
    suggestion = choose_preferred(left_metrics, right_metrics)
    left_record = variant_side(left_variant)
    right_record = variant_side(right_variant)
    pair_type = canonical_pair_type(left_record["defect_type"], right_record["defect_type"])
    return {
        "label_id": pair_id,
        "pair_id": pair_id,
        "pair_kind": "variant_vs_variant",
        "dataset_id": dataset_id,
        "split": hard_dataset_id,
        "sample_id": sample_id,
        "variant_name": pair_slug,
        "defect_type": f"{left_record['defect_type']}_vs_{right_record['defect_type']}",
        "pair_type": pair_type,
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
        "pair_type": record["pair_type"],
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


def apply_suggestion_to_record(record: dict[str, Any], label: dict[str, Any]) -> None:
    record["suggested_preferred"] = label["preferred"]
    record["suggestion_reason"] = label["reason"]
    record["suggestion_confidence"] = label["suggestion_confidence"]
    if "suggestion_reason_detail" in label:
        record["suggestion_reason_detail"] = label["suggestion_reason_detail"]
    if "taste_profile_id" in label:
        record["taste_profile_id"] = label["taste_profile_id"]
    if "taste_profile_version" in label:
        record["taste_profile_version"] = label["taste_profile_version"]


def build_summary(
    *,
    input_dir: Path,
    dataset_id: str,
    hard_dataset_id: str,
    seed: int,
    strategy: str,
    pair_templates: tuple[tuple[str, str], ...],
    sample_count: int,
    records: list[dict[str, Any]],
    suggested_labels: list[dict[str, Any]],
    skipped: list[dict[str, Any]],
    base_splits_dir: Path | None = None,
) -> dict[str, Any]:
    pair_type_counts = dict(sorted(Counter(record["pair_type"] for record in records).items()))
    preferred_counts = dict(sorted(Counter(label["preferred"] for label in suggested_labels).items()))
    confidence_distribution = dict(
        sorted(Counter(str(label["suggestion_confidence"]) for label in suggested_labels).items())
    )
    warnings = ["Suggested labels are heuristic suggestions and are not human-reviewed labels."]
    if skipped:
        warnings.append("Some hard pairs were skipped because required variants were missing.")
    imbalance_warnings = pair_type_imbalance_warnings(pair_type_counts)
    warnings.extend(imbalance_warnings)
    expected_split_counts = expected_split_counts_for_pairs(base_splits_dir, len(pair_templates))
    return {
        "schema_version": "pawlbench_hard_pref_v1",
        "hard_pref_schema_version": "pawlbench_hard_pref_v2",
        "dataset_id": dataset_id,
        "hard_dataset_id": hard_dataset_id,
        "source_dataset_dir": str(input_dir),
        "seed": seed,
        "strategy": strategy,
        "pair_templates": [list(item) for item in pair_templates],
        "sample_count": sample_count,
        "total_records": len(records),
        "pair_count": len(records),
        "suggested_label_count": len(suggested_labels),
        "review_queue_count": len(records),
        "preferred_counts": preferred_counts,
        "suggestion_preferred_counts": preferred_counts,
        "left_right_preferred_counts": {
            side: preferred_counts.get(side, 0)
            for side in ("left", "right")
        },
        "suggestion_confidence_distribution": confidence_distribution,
        "pair_type_counts": pair_type_counts,
        "pair_counts_by_template": dict(sorted(Counter(record["variant_name"] for record in records).items())),
        "expected_split_counts": expected_split_counts,
        "skipped": skipped,
        "warnings": warnings,
    }


def pair_templates_for_strategy(strategy: str) -> tuple[tuple[str, str], ...]:
    if strategy == "core_pairs":
        return CORE_PAIR_TEMPLATES
    if strategy == "all_pairs":
        return tuple(combinations(ALL_PAIR_VARIANTS, 2))
    raise ValueError(f"unsupported hard-pair strategy: {strategy}")


def hard_dataset_id_from_output(output_dir: Path) -> str:
    name = output_dir.name
    return name if name.startswith("hard_pref_") else "hard_pref_v1"


def canonical_pair_type(left_defect: Any, right_defect: Any) -> str:
    return "_vs_".join(sorted([str(left_defect), str(right_defect)]))


def pair_type_imbalance_warnings(pair_type_counts: dict[str, int]) -> list[str]:
    if not pair_type_counts:
        return ["No hard preference records were generated."]
    counts = set(pair_type_counts.values())
    if len(counts) <= 1:
        return []
    return [f"Pair-type imbalance detected: {pair_type_counts}."]


def expected_split_counts_for_pairs(base_splits_dir: Path | None, pairs_per_sample: int) -> dict[str, int]:
    if base_splits_dir is None:
        return {}
    splits_dir = base_splits_dir.expanduser().resolve()
    counts: dict[str, int] = {}
    for split in ("train", "val", "test"):
        split_path = splits_dir / f"{split}.jsonl"
        if not split_path.is_file():
            counts[split] = 0
            continue
        sample_ids = {
            str(record.get("sample_id"))
            for record in read_jsonl(split_path)
            if record.get("sample_id")
        }
        counts[split] = len(sample_ids) * pairs_per_sample
    return counts


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    return [
        json.loads(line)
        for line in path.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]


def diagnostics_markdown(summary: dict[str, Any]) -> str:
    lines = [
        "# Hard Preference Diagnostics",
        "",
        f"- Dataset: `{summary['hard_dataset_id']}`",
        f"- Source dataset: `{summary['dataset_id']}`",
        f"- Strategy: `{summary['strategy']}`",
        f"- Seed: `{summary['seed']}`",
        f"- Samples: {summary['sample_count']}",
        f"- Total records: {summary['total_records']}",
        "",
        "## Pair Types",
        "",
    ]
    lines.extend(count_lines(summary["pair_type_counts"]))
    lines.extend(["", "## Suggestions", ""])
    lines.extend(["Preferred:"])
    lines.extend(count_lines(summary["suggestion_preferred_counts"]))
    lines.extend(["", "Confidence:"])
    lines.extend(count_lines(summary["suggestion_confidence_distribution"]))
    if summary["expected_split_counts"]:
        lines.extend(["", "## Expected Split Counts", ""])
        lines.extend(count_lines(summary["expected_split_counts"]))
    lines.extend(["", "## Warnings", ""])
    lines.extend(f"- {warning}" for warning in summary["warnings"])
    if summary["skipped"]:
        lines.extend(["", "## Skipped", ""])
        for item in summary["skipped"]:
            pair = " vs ".join(item.get("pair", []))
            lines.append(f"- {item.get('sample_id')}: {pair} ({item.get('reason')})")
    return "\n".join(lines) + "\n"


def count_lines(counts: dict[str, Any]) -> list[str]:
    if not counts:
        return ["- None"]
    return [f"- `{key}`: {value}" for key, value in sorted(counts.items())]


def review_readme(dataset_id: str, seed: int, strategy: str, count: int) -> str:
    return f"""# Hard Preference Review Queue

Dataset: `{dataset_id}`
Seed: `{seed}`
Strategy: `{strategy}`
Pairs: `{count}`

This queue contains variant-vs-variant hard preference pairs. Neither side is the original UI.

Run:

```bash
uv run pawlbench-design-label-app artifacts/datasets/{dataset_id}/review --labeler-id an
```

Suggested labels are heuristic only and use `review_status: "suggested"` until a human reviewer confirms or edits them.
"""
