"""Manifest preparation for Pawl-JEPA microtraining."""

from __future__ import annotations

import json
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Any


SPLITS = ("train", "val", "test")
HUMAN_REVIEW_STATUSES = {"confirmed", "edited", "unclear"}


@dataclass(frozen=True)
class PrepareConfig:
    splits_dir: Path
    output_dir: Path
    labels_path: Path | None = None
    labels_paths: tuple[Path, ...] = ()


@dataclass(frozen=True)
class PrepareResult:
    output_dir: Path
    manifest_path: Path
    split_paths: dict[str, Path]
    summary: dict[str, Any]


def prepare_manifest(config: PrepareConfig) -> PrepareResult:
    splits_dir = config.splits_dir.expanduser().resolve()
    output_dir = config.output_dir.expanduser().resolve()
    label_paths = normalize_label_paths(config)
    labels_by_id, label_record_count = load_labels(label_paths)
    records_by_split: dict[str, list[dict[str, Any]]] = {}
    all_records: list[dict[str, Any]] = []

    for split in SPLITS:
        split_path = splits_dir / f"{split}.jsonl"
        if not split_path.is_file():
            raise ValueError(f"split file is missing: {split_path}")
        records = [
            build_manifest_record(record, split=split, labels_by_id=labels_by_id)
            for record in read_jsonl(split_path)
        ]
        records_by_split[split] = records
        all_records.extend(records)

    output_dir.mkdir(parents=True, exist_ok=True)
    split_paths = {split: output_dir / f"{split}.jsonl" for split in SPLITS}
    for split, path in split_paths.items():
        write_jsonl(path, records_by_split[split])

    summary = build_manifest_summary(
        splits_dir,
        labels_by_id,
        records_by_split,
        label_paths=label_paths,
        label_record_count=label_record_count,
    )
    manifest_path = output_dir / "manifest.json"
    write_json(manifest_path, summary)
    return PrepareResult(
        output_dir=output_dir,
        manifest_path=manifest_path,
        split_paths=split_paths,
        summary=summary,
    )


def load_manifest_records(manifest_dir: Path, split: str | None = None) -> list[dict[str, Any]]:
    manifest_dir = manifest_dir.expanduser().resolve()
    splits = (split,) if split else SPLITS
    records: list[dict[str, Any]] = []
    for split_name in splits:
        if split_name not in SPLITS:
            raise ValueError(f"unsupported split: {split_name}")
        records.extend(read_jsonl(manifest_dir / f"{split_name}.jsonl"))
    return records


def normalize_label_paths(config: PrepareConfig) -> tuple[Path, ...]:
    paths: list[Path] = []
    if config.labels_path is not None:
        paths.append(config.labels_path)
    paths.extend(config.labels_paths)
    return tuple(path.expanduser().resolve() for path in paths)


def load_labels(labels_paths: tuple[Path, ...]) -> tuple[dict[str, dict[str, Any]], int]:
    labels: dict[str, dict[str, Any]] = {}
    originals_by_id: dict[str, dict[str, Any]] = {}
    record_count = 0
    for labels_path in labels_paths:
        if not labels_path.is_file():
            raise ValueError(f"labels file is missing: {labels_path}")
        for label in read_jsonl(labels_path):
            record_count += 1
            label_id = label.get("label_id")
            if not isinstance(label_id, str) or not label_id:
                raise ValueError(f"label record missing label_id in {labels_path}")
            if label_id in labels:
                if originals_by_id[label_id] != label:
                    previous_path = labels[label_id].get("label_file")
                    raise ValueError(
                        "conflicting duplicate label_id "
                        f"{label_id}: {previous_path} and {labels_path}"
                    )
                continue
            originals_by_id[label_id] = label
            labels[label_id] = {**label, "label_file": str(labels_path)}
    return labels, record_count


def build_manifest_record(
    split_record: dict[str, Any],
    *,
    split: str,
    labels_by_id: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    dataset_id = str(split_record["dataset_id"])
    sample_id = str(split_record["sample_id"])
    variant_name = str(split_record["variant_name"])
    label_id = make_label_id(dataset_id, split, sample_id, variant_name)
    label = labels_by_id.get(label_id)
    preferred_item = preferred_item_from_label(label) if label else "original"

    return {
        "split": split,
        "label_id": label_id,
        "dataset_id": dataset_id,
        "sample_id": sample_id,
        "variant_name": variant_name,
        "defect_type": split_record.get("defect_type"),
        "original_screenshot_path": split_record["original"]["screenshot_path"],
        "variant_screenshot_path": split_record["variant"]["screenshot_path"],
        "preferred": label.get("preferred") if label else "synthetic_original",
        "preferred_item": preferred_item,
        "severity": label.get("severity") if label else "medium",
        "defect_tags": label.get("defect_tags", []) if label else [split_record.get("defect_type")],
        "quality_tags": label.get("quality_tags", []) if label else [],
        "confidence": label.get("confidence") if label else 0,
        "review_status": label.get("review_status") if label else "synthetic_fallback",
        "reviewed_by": label.get("reviewed_by") if label else None,
        "label_file": label.get("label_file") if label else None,
        "left_item": label.get("left_item") if label else "original",
        "right_item": label.get("right_item") if label else "variant",
        "metric_deltas": split_record.get("metric_deltas", {}),
        "label_source": "human_reviewed" if label else "synthetic_fallback",
    }


def make_label_id(dataset_id: str, split: str, sample_id: str, variant_name: str) -> str:
    return f"{dataset_id}__{split}__{sample_id}__{variant_name}"


def preferred_item_from_label(label: dict[str, Any] | None) -> str:
    if not label:
        return "original"
    preferred = label.get("preferred")
    if preferred in {"tie", "unclear"}:
        return str(preferred)
    if preferred == "left":
        return str(label.get("left_item"))
    if preferred == "right":
        return str(label.get("right_item"))
    raise ValueError(f"unsupported preferred value: {preferred}")


def build_manifest_summary(
    splits_dir: Path,
    labels_by_id: dict[str, dict[str, Any]],
    records_by_split: dict[str, list[dict[str, Any]]],
    *,
    label_paths: tuple[Path, ...],
    label_record_count: int,
) -> dict[str, Any]:
    all_records = [record for records in records_by_split.values() for record in records]
    label_source_counts = Counter(record["label_source"] for record in all_records)
    preferred_counts = Counter(record["preferred_item"] for record in all_records)
    human_reviewed_count_by_split = {
        split: sum(1 for record in records_by_split[split] if is_human_reviewed(record))
        for split in SPLITS
    }
    synthetic_fallback_count_by_split = {
        split: sum(
            1
            for record in records_by_split[split]
            if record.get("label_source") == "synthetic_fallback"
        )
        for split in SPLITS
    }
    missing_label_count_by_split = dict(synthetic_fallback_count_by_split)
    label_coverage_by_split = {
        split: (
            human_reviewed_count_by_split[split] / len(records_by_split[split])
            if records_by_split[split]
            else 0
        )
        for split in SPLITS
    }
    return {
        "schema_version": "pawl_jepa_manifest_v1",
        "splits_dir": str(splits_dir),
        "record_counts": {split: len(records_by_split[split]) for split in SPLITS},
        "total_records": len(all_records),
        "reviewed_label_count": len(labels_by_id),
        "label_file_count": len(label_paths),
        "label_record_count": label_record_count,
        "label_coverage_by_split": label_coverage_by_split,
        "missing_label_count_by_split": missing_label_count_by_split,
        "human_reviewed_count_by_split": human_reviewed_count_by_split,
        "synthetic_fallback_count_by_split": synthetic_fallback_count_by_split,
        "label_source_counts": dict(sorted(label_source_counts.items())),
        "preferred_item_counts": dict(sorted(preferred_counts.items())),
        "defect_types": sorted({str(record.get("defect_type")) for record in all_records}),
    }


def is_human_reviewed(record: dict[str, Any]) -> bool:
    return record.get("label_source") in {"human_reviewed", "reviewed"}


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    if not path.is_file():
        raise ValueError(f"JSONL file is missing: {path}")
    return [
        json.loads(line)
        for line in path.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]


def write_json(path: Path, payload: Any) -> None:
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def write_jsonl(path: Path, records: list[dict[str, Any]]) -> None:
    path.write_text(
        "".join(json.dumps(record, sort_keys=True) + "\n" for record in records),
        encoding="utf-8",
    )
