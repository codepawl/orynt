"""Positive UI corpus build, validation, and reporting."""

from __future__ import annotations

import json
import os
import shutil
import tempfile
import hashlib
from collections import Counter
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

from codepawl_renderer import RenderConfig, render_html_file
from PIL import Image


ARTIFACT_FILES = ("index.html", "screenshot.png", "dom.json", "accessibility.json", "metrics.json")
SUMMARY_METRICS = (
    "contrast_issue_count",
    "min_contrast_ratio",
    "font_size_ratio",
    "viewport_fill_ratio",
)


@dataclass(frozen=True)
class PositiveBuildConfig:
    source_dir: Path
    output_dir: Path
    seed: int = 42
    limit: int | None = None
    fail_fast: bool = False
    overwrite: bool = True
    progress_callback: Callable[[dict[str, Any]], None] | None = None


@dataclass(frozen=True)
class PositiveBuildResult:
    output_dir: Path
    dataset_path: Path
    manifest_path: Path
    dataset: dict[str, Any]


@dataclass(frozen=True)
class PositiveValidationConfig:
    input_dir: Path
    output_dir: Path


@dataclass(frozen=True)
class PositiveValidationResult:
    output_dir: Path
    validation_path: Path
    validation: dict[str, Any]


@dataclass(frozen=True)
class PositiveReportConfig:
    input_dir: Path
    output_dir: Path


@dataclass(frozen=True)
class PositiveReportResult:
    output_dir: Path
    report_path: Path
    summary_path: Path
    summary: dict[str, Any]


def build_positive_dataset(config: PositiveBuildConfig) -> PositiveBuildResult:
    source_dir = _validate_source_dir(config.source_dir)
    output_dir = config.output_dir.expanduser().resolve()
    if config.limit is not None and config.limit < 0:
        raise ValueError("--limit must be greater than or equal to 0")
    if output_dir.exists() and not config.overwrite:
        raise ValueError(f"output directory already exists: {output_dir}")

    html_paths = sorted(source_dir.rglob("*.html"))
    if config.limit is not None:
        html_paths = html_paths[: config.limit]
    sample_ids = _sample_ids(source_dir, html_paths)

    output_dir.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=output_dir.parent, prefix=f".{output_dir.name}.") as temp_dir:
        stage_dir = Path(temp_dir) / output_dir.name
        samples_dir = stage_dir / "samples"
        samples_dir.mkdir(parents=True, exist_ok=True)

        records: list[dict[str, Any]] = []
        failed_count = 0
        metric_rows: list[dict[str, Any]] = []
        for index, html_path in enumerate(html_paths, start=1):
            sample_id = sample_ids[html_path]
            emit_progress(
                config.progress_callback,
                {
                    "event": "positive_sample",
                    "sample": index,
                    "total_samples": len(html_paths),
                    "failed_count": failed_count,
                    "sample_id": sample_id,
                    "source_path": str(html_path),
                },
            )
            sample_dir = samples_dir / sample_id
            try:
                record, metrics = _build_positive_sample(
                    html_path=html_path,
                    sample_dir=sample_dir,
                    public_sample_dir=output_dir / "samples" / sample_id,
                )
                metric_rows.append(metrics)
            except Exception as exc:
                if config.fail_fast:
                    raise
                failed_count += 1
                sample_dir.mkdir(parents=True, exist_ok=True)
                record = {
                    "sample_id": sample_id,
                    "source_path": str(html_path),
                    "output_dir": str(output_dir / "samples" / sample_id),
                    "status": "failed",
                    "error": str(exc),
                }
            records.append(record)

        dataset = _dataset_json(
            source_dir=source_dir,
            output_dir=output_dir,
            seed=config.seed,
            records=records,
            metric_rows=metric_rows,
        )
        dataset_path = stage_dir / "dataset.json"
        _write_json(dataset_path, dataset)
        manifest_path = stage_dir / "manifest.jsonl"
        _write_jsonl(manifest_path, _positive_manifest_records(dataset))
        _replace_output_dir(stage_dir, output_dir)

    final_dataset_path = output_dir / "dataset.json"
    final_manifest_path = output_dir / "manifest.jsonl"
    return PositiveBuildResult(
        output_dir=output_dir,
        dataset_path=final_dataset_path,
        manifest_path=final_manifest_path,
        dataset=json.loads(final_dataset_path.read_text(encoding="utf-8")),
    )


def validate_positive_dataset(config: PositiveValidationConfig) -> PositiveValidationResult:
    input_dir = config.input_dir.expanduser().resolve()
    output_dir = config.output_dir.expanduser().resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    validation = build_positive_validation(input_dir)
    validation_path = output_dir / "validation.json"
    _write_json(validation_path, validation)
    return PositiveValidationResult(output_dir, validation_path, validation)


def export_positive_report(config: PositiveReportConfig) -> PositiveReportResult:
    input_dir = config.input_dir.expanduser().resolve()
    output_dir = config.output_dir.expanduser().resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    dataset = _required_dataset(input_dir)
    validation = build_positive_validation(input_dir)
    summary = {
        "dataset_id": dataset.get("dataset_id"),
        "sample_count": dataset.get("sample_count"),
        "failed_count": dataset.get("failed_count"),
        "metrics_summary": dataset.get("metrics_summary", {}),
        "warnings": dataset.get("warnings", []),
        "validation": validation,
        "next_recommended_step": "Pawl-JEPA positive pretraining scaffold",
    }
    summary_path = output_dir / "summary.json"
    report_path = output_dir / "report.md"
    _write_json(summary_path, summary)
    report_path.write_text(_report_markdown(summary), encoding="utf-8")
    return PositiveReportResult(output_dir, report_path, summary_path, summary)


def _build_positive_sample(
    *,
    html_path: Path,
    sample_dir: Path,
    public_sample_dir: Path,
) -> tuple[dict[str, Any], dict[str, Any]]:
    sample_dir.mkdir(parents=True, exist_ok=True)
    index_path = sample_dir / "index.html"
    shutil.copyfile(html_path, index_path)
    render_html_file(RenderConfig(input_path=index_path, output_dir=sample_dir))
    metrics = json.loads((sample_dir / "metrics.json").read_text(encoding="utf-8"))
    with Image.open(sample_dir / "screenshot.png") as image:
        width, height = image.size
    record = {
        "sample_id": sample_dir.name,
        "source_dataset": "internal",
        "platform": "web_desktop",
        "page_type": _infer_page_type(html_path),
        "source_path": str(html_path),
        "output_dir": str(public_sample_dir),
        "status": "ok",
        "html_path": str(public_sample_dir / "index.html"),
        "screenshot_path": str(public_sample_dir / "screenshot.png"),
        "dom_path": str(public_sample_dir / "dom.json"),
        "accessibility_path": str(public_sample_dir / "accessibility.json"),
        "metrics_path": str(public_sample_dir / "metrics.json"),
        "width": width,
        "height": height,
        "dpr": 1.0,
        "viewport_width": int(metrics.get("viewport_width") or 1440),
        "viewport_height": int(metrics.get("viewport_height") or 900),
        "is_synthetic": False,
        "is_corrupted": False,
        "parent_sample_id": None,
        "split_group_id": sample_dir.name,
        "quality_filter_score": _quality_filter_score(metrics),
    }
    return record, metrics


def build_positive_validation(input_dir: Path) -> dict[str, Any]:
    errors: list[str] = []
    warnings: list[str] = []
    dataset = _load_dataset(input_dir, errors)
    metric_coverage = {field: 0 for field in SUMMARY_METRICS}
    sample_count_actual = 0
    failed_count_actual = 0
    if dataset is None:
        return {
            "valid": False,
            "errors": errors,
            "warnings": warnings,
            "sample_count_actual": 0,
            "failed_count_actual": 0,
            "metric_coverage": metric_coverage,
        }

    required = {
        "schema_version",
        "dataset_id",
        "source_dir",
        "output_dir",
        "seed",
        "generated_at",
        "sample_count",
        "failed_count",
        "samples",
        "metrics_summary",
        "warnings",
        "manifest_path",
    }
    missing = sorted(required - set(dataset))
    if missing:
        errors.append(f"dataset.json missing required fields: {', '.join(missing)}")
    samples = dataset.get("samples")
    if not isinstance(samples, list):
        errors.append("dataset.json field samples must be a list")
        samples = []

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
        for field in (
            "source_dataset",
            "platform",
            "page_type",
            "screenshot_path",
            "width",
            "height",
            "viewport_width",
            "viewport_height",
            "quality_filter_score",
            "is_synthetic",
            "is_corrupted",
            "split_group_id",
        ):
            if field not in sample:
                errors.append(f"sample {sample_id} missing local manifest field: {field}")
        sample_dir = _sample_dir(input_dir, sample)
        for filename in ARTIFACT_FILES:
            if not (sample_dir / filename).is_file():
                errors.append(f"sample {sample_id} missing {filename}: {sample_dir / filename}")
        metrics_path = sample_dir / "metrics.json"
        if metrics_path.is_file():
            try:
                metrics = json.loads(metrics_path.read_text(encoding="utf-8"))
            except json.JSONDecodeError as exc:
                errors.append(f"sample {sample_id} metrics.json is invalid JSON: {exc}")
                continue
            for field in SUMMARY_METRICS:
                if field in metrics:
                    metric_coverage[field] += 1
                else:
                    errors.append(f"sample {sample_id} metrics.json missing {field}")

    if dataset.get("sample_count") != sample_count_actual:
        errors.append(
            f"sample_count mismatch: dataset={dataset.get('sample_count')} actual={sample_count_actual}"
        )
    if dataset.get("failed_count") != failed_count_actual:
        errors.append(
            f"failed_count mismatch: dataset={dataset.get('failed_count')} actual={failed_count_actual}"
        )
    manifest_path = _path_from_record(input_dir, dataset.get("manifest_path"))
    if manifest_path is None or not manifest_path.is_file():
        errors.append(f"manifest.jsonl is missing: {input_dir / 'manifest.jsonl'}")
    else:
        manifest_records = [
            json.loads(line)
            for line in manifest_path.read_text(encoding="utf-8").splitlines()
            if line.strip()
        ]
        if len(manifest_records) != sample_count_actual:
            errors.append(
                f"manifest record count mismatch: manifest={len(manifest_records)} actual={sample_count_actual}"
            )
    return {
        "valid": not errors,
        "errors": errors,
        "warnings": warnings,
        "sample_count_actual": sample_count_actual,
        "failed_count_actual": failed_count_actual,
        "metric_coverage": metric_coverage,
    }


def _dataset_json(
    *,
    source_dir: Path,
    output_dir: Path,
    seed: int,
    records: list[dict[str, Any]],
    metric_rows: list[dict[str, Any]],
) -> dict[str, Any]:
    ok_records = [record for record in records if record["status"] == "ok"]
    failed_records = [record for record in records if record["status"] == "failed"]
    metrics_summary = _metrics_summary(metric_rows)
    warnings = []
    if metrics_summary.get("overflow_count", 0) > 0:
        warnings.append("one or more positive samples report horizontal overflow")
    if metrics_summary.get("average_contrast_issue_count", 0) > 0:
        warnings.append("one or more positive samples report contrast issues")
    return {
        "schema_version": "pawlbench_positive_dataset_v1",
        "dataset_id": output_dir.name,
        "source_dir": str(source_dir),
        "output_dir": str(output_dir),
        "manifest_path": str(output_dir / "manifest.jsonl"),
        "seed": seed,
        "generated_at": _stable_generated_at(seed),
        "sample_count": len(ok_records),
        "failed_count": len(failed_records),
        "samples": records,
        "metrics_summary": metrics_summary,
        "warnings": warnings,
    }


def _positive_manifest_records(dataset: dict[str, Any]) -> list[dict[str, Any]]:
    records = []
    for sample in dataset.get("samples", []):
        if sample.get("status") != "ok":
            continue
        records.append(
            {
                "schema_version": "ui_jepa_local_positive_manifest_v1",
                "dataset_id": dataset.get("dataset_id"),
                "sample_id": sample.get("sample_id"),
                "source_dataset": sample.get("source_dataset"),
                "platform": sample.get("platform"),
                "page_type": sample.get("page_type"),
                "screenshot_path": sample.get("screenshot_path"),
                "html_path": sample.get("html_path"),
                "dom_path": sample.get("dom_path"),
                "accessibility_tree_path": sample.get("accessibility_path"),
                "metrics_path": sample.get("metrics_path"),
                "width": sample.get("width"),
                "height": sample.get("height"),
                "dpr": sample.get("dpr"),
                "viewport_width": sample.get("viewport_width"),
                "viewport_height": sample.get("viewport_height"),
                "quality_filter_score": sample.get("quality_filter_score"),
                "is_synthetic": sample.get("is_synthetic"),
                "is_corrupted": sample.get("is_corrupted"),
                "parent_sample_id": sample.get("parent_sample_id"),
                "split_group_id": sample.get("split_group_id"),
            }
        )
    return records


def _quality_filter_score(metrics: dict[str, Any]) -> float:
    score = 1.0
    if metrics.get("has_horizontal_overflow"):
        score -= 0.25
    if float(metrics.get("contrast_issue_count") or 0) > 0:
        score -= 0.15
    viewport_fill = metrics.get("viewport_fill_ratio")
    if isinstance(viewport_fill, int | float) and viewport_fill < 0.2:
        score -= 0.2
    return max(0.0, round(score, 4))


def _infer_page_type(path: Path) -> str:
    name = path.stem.lower()
    for page_type in (
        "landing",
        "dashboard",
        "auth",
        "settings",
        "pricing",
        "docs",
        "portfolio",
        "onboarding",
    ):
        if page_type in name:
            return "docs" if page_type == "docs" else page_type
    return "unknown"


def _metrics_summary(rows: list[dict[str, Any]]) -> dict[str, float | int | None]:
    return {
        "average_contrast_issue_count": _average(rows, "contrast_issue_count"),
        "average_min_contrast_ratio": _average(rows, "min_contrast_ratio"),
        "average_font_size_ratio": _average(rows, "font_size_ratio"),
        "average_viewport_fill_ratio": _average(rows, "viewport_fill_ratio"),
        "overflow_count": sum(
            1
            for row in rows
            if row.get("has_horizontal_overflow") or float(row.get("horizontal_overflow_px") or 0) > 0
        ),
    }


def _average(rows: list[dict[str, Any]], field: str) -> float | None:
    values = [float(row[field]) for row in rows if isinstance(row.get(field), int | float)]
    return sum(values) / len(values) if values else None


def _report_markdown(summary: dict[str, Any]) -> str:
    validation = summary.get("validation", {})
    lines = [
        "# PawlBench Positive UI Corpus Report",
        "",
        f"- Dataset: {summary.get('dataset_id')}",
        f"- Sample count: {summary.get('sample_count')}",
        f"- Failed count: {summary.get('failed_count')}",
        f"- Validation valid: {validation.get('valid')}",
        "",
        "## Metrics Summary",
        "",
    ]
    for key, value in sorted((summary.get("metrics_summary") or {}).items()):
        lines.append(f"- {key}: {value}")
    lines.extend(["", "## Warnings", ""])
    warnings = summary.get("warnings") or validation.get("warnings") or []
    lines.extend(f"- {warning}" for warning in warnings) if warnings else lines.append("- None")
    lines.extend(
        [
            "",
            "## Next Step",
            "",
            f"- {summary.get('next_recommended_step')}",
            "",
        ]
    )
    return "\n".join(lines)


def _validate_source_dir(source_dir: Path) -> Path:
    resolved = source_dir.expanduser().resolve()
    if not resolved.exists():
        raise ValueError(f"source directory does not exist: {source_dir}")
    if not resolved.is_dir():
        raise ValueError(f"source path is not a directory: {source_dir}")
    return resolved


def _sample_ids(source_dir: Path, html_paths: list[Path]) -> dict[Path, str]:
    counts = Counter(_slug(path.stem) for path in html_paths)
    used: set[str] = set()
    ids: dict[Path, str] = {}
    for path in html_paths:
        base = _slug(path.stem)
        sample_id = base
        if counts[base] > 1 or sample_id in used:
            relative = path.relative_to(source_dir).as_posix()
            digest = hashlib.sha1(relative.encode("utf-8")).hexdigest()[:8]
            sample_id = f"{base}-{digest}"
        used.add(sample_id)
        ids[path] = sample_id
    return ids


def _slug(value: str) -> str:
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


def _sample_dir(input_dir: Path, sample: dict[str, Any]) -> Path:
    output_dir = sample.get("output_dir")
    if isinstance(output_dir, str) and output_dir:
        path = Path(output_dir).expanduser()
        return path.resolve() if path.is_absolute() else (input_dir / path).resolve()
    return input_dir / "samples" / str(sample.get("sample_id", ""))


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


def _replace_output_dir(stage_dir: Path, output_dir: Path) -> None:
    if not output_dir.exists():
        os.replace(stage_dir, output_dir)
        return
    backup_dir = Path(tempfile.mkdtemp(dir=output_dir.parent, prefix=f".{output_dir.name}.backup."))
    try:
        os.replace(output_dir, backup_dir / output_dir.name)
        os.replace(stage_dir, output_dir)
    except Exception:
        if output_dir.exists():
            shutil.rmtree(output_dir)
        os.replace(backup_dir / output_dir.name, output_dir)
        raise
    finally:
        shutil.rmtree(backup_dir, ignore_errors=True)


def _stable_generated_at(seed: int) -> str:
    timestamp = datetime.fromtimestamp(max(seed, 0), tz=timezone.utc)
    return timestamp.isoformat().replace("+00:00", "Z")


def _write_json(path: Path, payload: Any) -> None:
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def _write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    path.write_text(
        "".join(json.dumps(row, sort_keys=True) + "\n" for row in rows),
        encoding="utf-8",
    )


def _path_from_record(base_dir: Path, raw_path: Any) -> Path | None:
    if not isinstance(raw_path, str) or not raw_path:
        return None
    path = Path(raw_path).expanduser()
    return path.resolve() if path.is_absolute() else (base_dir / path).resolve()


def emit_progress(callback: Callable[[dict[str, Any]], None] | None, payload: dict[str, Any]) -> None:
    if callback is not None:
        callback(payload)
