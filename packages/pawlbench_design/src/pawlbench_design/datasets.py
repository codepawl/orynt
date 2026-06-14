"""Dataset QA, split, and report helpers for PawlBench Design."""

from __future__ import annotations

import json
import random
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Any


REQUIRED_DATASET_FIELDS = {
    "dataset_id",
    "source_dir",
    "output_dir",
    "seed",
    "generated_at",
    "sample_count",
    "variant_count",
    "failed_count",
    "samples",
    "aggregate_metrics",
}
ARTIFACT_FILES = ("index.html", "screenshot.png", "dom.json", "accessibility.json", "metrics.json")
UI_METRIC_FIELDS = (
    "contrast_issue_count",
    "min_contrast_ratio",
    "font_size_ratio",
    "visible_element_count",
    "viewport_fill_ratio",
)
DEFECT_TYPES = ("spacing", "contrast", "alignment", "hierarchy")
DELTA_FIELDS = (
    "contrast_issue_delta",
    "min_contrast_ratio_delta",
    "font_size_ratio_delta",
    "viewport_fill_ratio_delta",
    "horizontal_overflow_delta",
)


@dataclass(frozen=True)
class ValidationConfig:
    input_dir: Path
    output_dir: Path


@dataclass(frozen=True)
class ValidationResult:
    output_dir: Path
    validation_path: Path
    validation: dict[str, Any]


@dataclass(frozen=True)
class SplitConfig:
    input_dir: Path
    output_dir: Path
    seed: int
    train_ratio: float = 0.8
    val_ratio: float = 0.1
    test_ratio: float = 0.1


@dataclass(frozen=True)
class SplitResult:
    output_dir: Path
    splits_path: Path
    train_path: Path
    val_path: Path
    test_path: Path
    splits: dict[str, Any]


@dataclass(frozen=True)
class ReportConfig:
    input_dir: Path
    output_dir: Path


@dataclass(frozen=True)
class ReportResult:
    output_dir: Path
    report_path: Path
    summary_path: Path
    summary: dict[str, Any]


def validate_dataset(config: ValidationConfig) -> ValidationResult:
    input_dir = config.input_dir.expanduser().resolve()
    output_dir = config.output_dir.expanduser().resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    validation = build_validation(input_dir)
    validation_path = output_dir / "validation.json"
    _write_json(validation_path, validation)
    return ValidationResult(
        output_dir=output_dir,
        validation_path=validation_path,
        validation=validation,
    )


def build_validation(input_dir: Path) -> dict[str, Any]:
    errors: list[str] = []
    warnings: list[str] = []
    dataset = _load_dataset(input_dir, errors)
    defect_counts: Counter[str] = Counter()
    metric_coverage = {field: 0 for field in UI_METRIC_FIELDS}
    sample_count_actual = 0
    variant_count_actual = 0

    if dataset is None:
        return {
            "valid": False,
            "errors": errors,
            "warnings": warnings,
            "sample_count_actual": 0,
            "variant_count_actual": 0,
            "defect_type_counts": {},
            "metric_coverage": metric_coverage,
        }

    missing_fields = sorted(REQUIRED_DATASET_FIELDS - set(dataset))
    if missing_fields:
        errors.append(f"dataset.json missing required fields: {', '.join(missing_fields)}")

    samples = dataset.get("samples")
    if not isinstance(samples, list):
        errors.append("dataset.json field samples must be a list")
        samples = []

    failed_count_actual = 0
    for sample in samples:
        if not isinstance(sample, dict):
            errors.append("sample entry must be an object")
            continue
        sample_id = str(sample.get("sample_id", "<missing>"))
        status = sample.get("status")
        if status == "failed":
            failed_count_actual += 1
            continue
        if status != "ok":
            errors.append(f"sample {sample_id} has unsupported status: {status}")
            continue

        sample_count_actual += 1
        sample_dir = _sample_dir(input_dir, sample)
        labels_path = _path_from_record(input_dir, sample.get("labels_path"))
        if labels_path is None or not labels_path.is_file():
            errors.append(f"sample {sample_id} missing labels.json")

        original_dir = sample_dir / "original"
        _check_artifact_group(
            errors=errors,
            sample_id=sample_id,
            group_name="original",
            artifact_dir=original_dir,
            metric_coverage=metric_coverage,
        )

        variants = sample.get("variants")
        if not isinstance(variants, list):
            errors.append(f"sample {sample_id} variants must be a list")
            continue

        for variant in variants:
            if not isinstance(variant, dict):
                errors.append(f"sample {sample_id} variant entry must be an object")
                continue
            variant_name = str(variant.get("variant_name", "<missing>"))
            defect_type = str(variant.get("defect_type", "<missing>"))
            defect_counts[defect_type] += 1
            variant_count_actual += 1
            variant_dir = sample_dir / "jittered" / variant_name
            _check_artifact_group(
                errors=errors,
                sample_id=sample_id,
                group_name=f"variant {variant_name}",
                artifact_dir=variant_dir,
                metric_coverage=metric_coverage,
            )

    if dataset.get("sample_count") != sample_count_actual:
        errors.append(
            f"sample_count mismatch: dataset={dataset.get('sample_count')} actual={sample_count_actual}"
        )
    if dataset.get("failed_count") != failed_count_actual:
        errors.append(
            f"failed_count mismatch: dataset={dataset.get('failed_count')} actual={failed_count_actual}"
        )
    if dataset.get("variant_count") != variant_count_actual:
        errors.append(
            f"variant_count mismatch: dataset={dataset.get('variant_count')} actual={variant_count_actual}"
        )

    for defect_type in DEFECT_TYPES:
        if defect_counts[defect_type] == 0:
            errors.append(f"defect type is missing: {defect_type}")

    return {
        "valid": not errors,
        "errors": errors,
        "warnings": warnings,
        "sample_count_actual": sample_count_actual,
        "variant_count_actual": variant_count_actual,
        "defect_type_counts": dict(sorted(defect_counts.items())),
        "metric_coverage": metric_coverage,
    }


def split_dataset(config: SplitConfig) -> SplitResult:
    input_dir = config.input_dir.expanduser().resolve()
    output_dir = config.output_dir.expanduser().resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    dataset = _required_dataset(input_dir)
    records_by_sample = _records_by_sample(input_dir, dataset)
    sample_ids = sorted(records_by_sample)
    shuffled = sample_ids[:]
    random.Random(config.seed).shuffle(shuffled)

    train_ids, val_ids, test_ids = _split_sample_ids(
        shuffled,
        train_ratio=config.train_ratio,
        val_ratio=config.val_ratio,
    )
    split_ids = {
        "train": train_ids,
        "val": val_ids,
        "test": test_ids,
    }
    split_records = {
        split: [
            {**record, "split": split}
            for sample_id in ids
            for record in records_by_sample[sample_id]
        ]
        for split, ids in split_ids.items()
    }

    paths = {
        "train": output_dir / "train.jsonl",
        "val": output_dir / "val.jsonl",
        "test": output_dir / "test.jsonl",
    }
    for split, path in paths.items():
        _write_jsonl(path, split_records[split])

    leakage_check = _leakage_check(split_ids)
    splits = {
        "seed": config.seed,
        "ratios": {
            "train": config.train_ratio,
            "val": config.val_ratio,
            "test": config.test_ratio,
        },
        "sample_counts": {split: len(ids) for split, ids in split_ids.items()},
        "record_counts": {split: len(records) for split, records in split_records.items()},
        "sample_ids": split_ids,
        "leakage_check": leakage_check,
    }
    splits_path = output_dir / "splits.json"
    _write_json(splits_path, splits)
    return SplitResult(
        output_dir=output_dir,
        splits_path=splits_path,
        train_path=paths["train"],
        val_path=paths["val"],
        test_path=paths["test"],
        splits=splits,
    )


def export_dataset_report(config: ReportConfig) -> ReportResult:
    input_dir = config.input_dir.expanduser().resolve()
    output_dir = config.output_dir.expanduser().resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    dataset = _required_dataset(input_dir)
    validation = build_validation(input_dir)
    defect_distribution = _dataset_defect_distribution(dataset)
    summary = {
        "dataset_id": dataset["dataset_id"],
        "sample_count": dataset["sample_count"],
        "variant_count": dataset["variant_count"],
        "failed_count": dataset["failed_count"],
        "defect_distribution": defect_distribution,
        "aggregate_metrics": dataset.get("aggregate_metrics", {}),
        "validation": validation,
        "known_limitations": _known_limitations(dataset),
        "next_recommended_step": "optional DINOv2/SigLIP baseline",
    }
    summary_path = output_dir / "summary.json"
    report_path = output_dir / "report.md"
    _write_json(summary_path, summary)
    report_path.write_text(_report_markdown(summary), encoding="utf-8")
    return ReportResult(
        output_dir=output_dir,
        report_path=report_path,
        summary_path=summary_path,
        summary=summary,
    )


def _load_dataset(input_dir: Path, errors: list[str]) -> dict[str, Any] | None:
    dataset_path = input_dir / "dataset.json"
    if not dataset_path.is_file():
        errors.append(f"dataset.json is missing: {dataset_path}")
        return None
    try:
        return json.loads(dataset_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        errors.append(f"dataset.json is invalid JSON: {exc}")
        return None


def _required_dataset(input_dir: Path) -> dict[str, Any]:
    dataset_path = input_dir / "dataset.json"
    if not dataset_path.is_file():
        raise ValueError(f"dataset.json is missing: {dataset_path}")
    return json.loads(dataset_path.read_text(encoding="utf-8"))


def _sample_dir(input_dir: Path, sample: dict[str, Any]) -> Path:
    output_dir = sample.get("output_dir")
    if isinstance(output_dir, str) and output_dir:
        path = Path(output_dir).expanduser()
        return path.resolve() if path.is_absolute() else (input_dir / path).resolve()
    return input_dir / "samples" / str(sample.get("sample_id", ""))


def _path_from_record(input_dir: Path, raw_path: Any) -> Path | None:
    if not isinstance(raw_path, str) or not raw_path:
        return None
    path = Path(raw_path).expanduser()
    return path.resolve() if path.is_absolute() else (input_dir / path).resolve()


def _check_artifact_group(
    *,
    errors: list[str],
    sample_id: str,
    group_name: str,
    artifact_dir: Path,
    metric_coverage: dict[str, int],
) -> None:
    for filename in ARTIFACT_FILES:
        path = artifact_dir / filename
        if not path.is_file():
            errors.append(f"sample {sample_id} {group_name} missing {filename}: {path}")
    metrics_path = artifact_dir / "metrics.json"
    if not metrics_path.is_file():
        return
    try:
        metrics = json.loads(metrics_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        errors.append(f"sample {sample_id} {group_name} metrics.json is invalid JSON: {exc}")
        return
    for field in UI_METRIC_FIELDS:
        if field in metrics:
            metric_coverage[field] += 1
        else:
            errors.append(f"sample {sample_id} {group_name} metrics.json missing {field}")


def _records_by_sample(input_dir: Path, dataset: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
    records: dict[str, list[dict[str, Any]]] = {}
    for sample in dataset.get("samples", []):
        if sample.get("status") != "ok":
            continue
        sample_id = sample["sample_id"]
        sample_dir = _sample_dir(input_dir, sample)
        labels = _load_optional_json(sample_dir / "labels.json")
        label_variants = {
            variant.get("variant_name"): variant
            for variant in labels.get("variants", [])
            if isinstance(variant, dict)
        }
        eval_pairs = {
            pair.get("variant_name"): pair
            for pair in _load_optional_json(sample_dir / "eval" / "pairs.json", default=[]).copy()
            if isinstance(pair, dict)
        }
        sample_records = []
        for variant in sample.get("variants", []):
            variant_name = variant["variant_name"]
            label_variant = label_variants.get(variant_name, {})
            eval_pair = eval_pairs.get(variant_name, {})
            deltas = {
                field: eval_pair.get(field)
                for field in DELTA_FIELDS
            }
            sample_records.append(
                {
                    "dataset_id": dataset["dataset_id"],
                    "sample_id": sample_id,
                    "source_path": sample["source_path"],
                    "original": _artifact_paths(sample_dir / "original"),
                    "variant_name": variant_name,
                    "defect_type": variant["defect_type"],
                    "variant": {
                        "html_path": variant["html_path"],
                        "screenshot_path": variant["screenshot_path"],
                        "dom_path": variant["dom_path"],
                        "accessibility_path": variant["accessibility_path"],
                        "metrics_path": variant["metrics_path"],
                    },
                    "expected_issue": label_variant.get("expected_issue"),
                    "expected_fix_instruction": label_variant.get("expected_fix_instruction"),
                    "metric_deltas": deltas,
                }
            )
        records[sample_id] = sample_records
    return records


def _load_optional_json(path: Path, default: Any | None = None) -> Any:
    if default is None:
        default = {}
    if not path.is_file():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def _artifact_paths(artifact_dir: Path) -> dict[str, str]:
    return {
        "html_path": str(artifact_dir / "index.html"),
        "screenshot_path": str(artifact_dir / "screenshot.png"),
        "dom_path": str(artifact_dir / "dom.json"),
        "accessibility_path": str(artifact_dir / "accessibility.json"),
        "metrics_path": str(artifact_dir / "metrics.json"),
    }


def _split_sample_ids(
    sample_ids: list[str],
    *,
    train_ratio: float,
    val_ratio: float,
) -> tuple[list[str], list[str], list[str]]:
    total = len(sample_ids)
    train_count = int(total * train_ratio)
    val_count = int(total * val_ratio)
    train_ids = sorted(sample_ids[:train_count])
    val_ids = sorted(sample_ids[train_count : train_count + val_count])
    test_ids = sorted(sample_ids[train_count + val_count :])
    return train_ids, val_ids, test_ids


def _leakage_check(split_ids: dict[str, list[str]]) -> dict[str, Any]:
    seen: dict[str, list[str]] = defaultdict(list)
    for split, sample_ids in split_ids.items():
        for sample_id in sample_ids:
            seen[sample_id].append(split)
    leaked = {
        sample_id: splits
        for sample_id, splits in sorted(seen.items())
        if len(splits) != 1
    }
    return {
        "valid": not leaked,
        "leaked_sample_ids": leaked,
        "message": "Every sample_id appears in exactly one split." if not leaked else "Leakage detected.",
    }


def _dataset_defect_distribution(dataset: dict[str, Any]) -> dict[str, int]:
    counts: Counter[str] = Counter()
    for sample in dataset.get("samples", []):
        if sample.get("status") != "ok":
            continue
        for variant in sample.get("variants", []):
            counts[variant.get("defect_type", "<missing>")] += 1
    return dict(sorted(counts.items()))


def _known_limitations(dataset: dict[str, Any]) -> list[str]:
    sample_count = dataset.get("sample_count", 0)
    return [
        f"Small local dataset with {sample_count} successful samples.",
        "Synthetic CSS jitter labels are deterministic but not human preference labels.",
        "Metrics are lightweight browser-derived heuristics, not learned visual representations.",
    ]


def _report_markdown(summary: dict[str, Any]) -> str:
    aggregate_metrics = summary["aggregate_metrics"]
    validation = summary["validation"]
    lines = [
        f"# PawlBench Dataset Report: {summary['dataset_id']}",
        "",
        "## Summary",
        "",
        f"- Sample count: {summary['sample_count']}",
        f"- Variant count: {summary['variant_count']}",
        f"- Failed count: {summary['failed_count']}",
        f"- Validation valid: {validation['valid']}",
        "",
        "## Defect Distribution",
        "",
    ]
    for defect_type, count in summary["defect_distribution"].items():
        lines.append(f"- {defect_type}: {count}")

    lines.extend(["", "## Aggregate Metric Deltas", ""])
    for metric_name, values in aggregate_metrics.items():
        lines.append(f"### {metric_name}")
        lines.append("")
        if values:
            for defect_type, value in values.items():
                lines.append(f"- {defect_type}: {value}")
        else:
            lines.append("- No values")
        lines.append("")

    lines.extend(
        [
            "## Validation",
            "",
            f"- Errors: {len(validation['errors'])}",
            f"- Warnings: {len(validation['warnings'])}",
            "",
            "## Known Limitations",
            "",
        ]
    )
    for limitation in summary["known_limitations"]:
        lines.append(f"- {limitation}")
    lines.extend(
        [
            "",
            "## Next Recommended Step",
            "",
            f"{summary['next_recommended_step']}.",
            "",
        ]
    )
    return "\n".join(lines)


def _write_json(path: Path, payload: Any) -> None:
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def _write_jsonl(path: Path, records: list[dict[str, Any]]) -> None:
    path.write_text(
        "".join(json.dumps(record, sort_keys=True) + "\n" for record in records),
        encoding="utf-8",
    )
