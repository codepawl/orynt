"""Batch dataset builder for PawlBench Design artifacts."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import sys
import tempfile
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from codepawl_jitter import JitterConfig, JitterVariant, generate_jitter_pair_files
from codepawl_renderer import RenderConfig, render_html_file
from pawlbench_design import EvalConfig, evaluate_jitter_pairs


@dataclass(frozen=True)
class BuildConfig:
    source_dir: Path
    output_dir: Path
    seed: int
    limit: int | None = None
    fail_fast: bool = False
    overwrite: bool = True


@dataclass(frozen=True)
class BuildResult:
    output_dir: Path
    dataset_path: Path
    dataset: dict[str, Any]


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="pawlbench-design-build",
        description="Build a local PawlBench Design dataset from a directory of HTML files.",
    )
    parser.add_argument("source_dir", help="Directory containing .html examples.")
    parser.add_argument("--out", required=True, help="Output dataset directory.")
    parser.add_argument("--seed", type=int, required=True, help="Deterministic jitter seed.")
    parser.add_argument("--limit", type=int, help="Maximum number of HTML files to process.")
    parser.add_argument(
        "--fail-fast",
        action="store_true",
        help="Stop at the first failed HTML file instead of recording the error.",
    )
    parser.add_argument(
        "--overwrite",
        dest="overwrite",
        action="store_true",
        default=True,
        help="Overwrite the output dataset directory. This is the default.",
    )
    parser.add_argument(
        "--no-overwrite",
        dest="overwrite",
        action="store_false",
        help="Fail if the output dataset directory already exists.",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    try:
        result = build_dataset(
            BuildConfig(
                source_dir=Path(args.source_dir),
                output_dir=Path(args.out),
                seed=args.seed,
                limit=args.limit,
                fail_fast=args.fail_fast,
                overwrite=args.overwrite,
            )
        )
    except Exception as exc:
        print(f"pawlbench-design-build: {exc}", file=sys.stderr)
        return 2

    print(f"Wrote PawlBench Design dataset to {result.output_dir}")
    return 0


def build_dataset(config: BuildConfig) -> BuildResult:
    source_dir = _validate_source_dir(config.source_dir)
    output_dir = config.output_dir.expanduser().resolve()
    if config.limit is not None and config.limit < 0:
        raise ValueError("--limit must be greater than or equal to 0")
    if output_dir.exists() and not config.overwrite:
        raise ValueError(f"output directory already exists: {output_dir}")

    html_paths = _discover_html_files(source_dir)
    if config.limit is not None:
        html_paths = html_paths[: config.limit]

    output_dir.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(
        dir=output_dir.parent,
        prefix=f".{output_dir.name}.",
    ) as temp_dir:
        stage_dir = Path(temp_dir) / output_dir.name
        samples_dir = stage_dir / "samples"
        samples_dir.mkdir(parents=True, exist_ok=True)
        sample_ids = _sample_ids(source_dir, html_paths)

        records: list[dict[str, Any]] = []
        aggregate_rows: list[dict[str, Any]] = []
        for html_path in html_paths:
            sample_id = sample_ids[html_path]
            sample_output_dir = samples_dir / sample_id
            try:
                record, rows = _build_sample(
                    html_path=html_path,
                    sample_output_dir=sample_output_dir,
                    public_sample_output_dir=output_dir / "samples" / sample_id,
                    seed=config.seed,
                )
            except Exception as exc:
                if config.fail_fast:
                    raise
                sample_output_dir.mkdir(parents=True, exist_ok=True)
                record = {
                    "sample_id": sample_id,
                    "source_path": str(html_path),
                    "output_dir": str(output_dir / "samples" / sample_id),
                    "labels_path": None,
                    "status": "failed",
                    "error": str(exc),
                    "variants": [],
                }
                rows = []
            records.append(record)
            aggregate_rows.extend(rows)

        dataset = _build_dataset_json(
            source_dir=source_dir,
            output_dir=output_dir,
            seed=config.seed,
            records=records,
            aggregate_rows=aggregate_rows,
        )
        dataset_path = stage_dir / "dataset.json"
        _write_json(dataset_path, dataset)
        _replace_output_dir(stage_dir, output_dir)

    final_dataset_path = output_dir / "dataset.json"
    return BuildResult(
        output_dir=output_dir,
        dataset_path=final_dataset_path,
        dataset=json.loads(final_dataset_path.read_text(encoding="utf-8")),
    )


def _validate_source_dir(source_dir: Path) -> Path:
    resolved = source_dir.expanduser().resolve()
    if not resolved.exists():
        raise ValueError(f"source directory does not exist: {source_dir}")
    if not resolved.is_dir():
        raise ValueError(f"source path is not a directory: {source_dir}")
    return resolved


def _discover_html_files(source_dir: Path) -> list[Path]:
    return sorted(path.resolve() for path in source_dir.rglob("*.html"))


def _sample_ids(source_dir: Path, html_paths: list[Path]) -> dict[Path, str]:
    base_counts: dict[str, int] = defaultdict(int)
    for path in html_paths:
        base_counts[_slug(path.stem)] += 1

    ids: dict[Path, str] = {}
    used: set[str] = set()
    for path in html_paths:
        base = _slug(path.stem)
        sample_id = base
        if base_counts[base] > 1 or sample_id in used:
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
    slug = "".join(chars).strip("-")
    return slug or "sample"


def _build_sample(
    *,
    html_path: Path,
    sample_output_dir: Path,
    public_sample_output_dir: Path,
    seed: int,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    jitter_result = generate_jitter_pair_files(
        JitterConfig(
            input_path=html_path,
            output_dir=sample_output_dir,
            public_output_dir=sample_output_dir,
            seed=seed,
        )
    )
    render_html_file(
        RenderConfig(
            input_path=jitter_result.original_html_path,
            output_dir=jitter_result.original_dir,
        )
    )
    _render_variants(jitter_result.variants)
    eval_result = evaluate_jitter_pairs(
        EvalConfig(
            input_dir=sample_output_dir,
            output_dir=sample_output_dir / "eval",
        )
    )
    _rewrite_artifact_json_paths(
        paths=[
            sample_output_dir / "labels.json",
            sample_output_dir / "eval" / "pairs.json",
            sample_output_dir / "eval" / "summary.json",
        ],
        stage_root=sample_output_dir,
        public_root=public_sample_output_dir,
    )

    record = {
        "sample_id": sample_output_dir.name,
        "source_path": str(html_path),
        "output_dir": str(public_sample_output_dir),
        "labels_path": str(public_sample_output_dir / "labels.json"),
        "status": "ok",
        "variants": _variant_records(public_sample_output_dir, eval_result.pairs),
    }
    rows = [
        {
            "defect_type": pair["defect_type"],
            "contrast_issue_delta": pair.get("contrast_issue_delta"),
            "min_contrast_ratio_delta": pair.get("min_contrast_ratio_delta"),
            "font_size_ratio_delta": pair.get("font_size_ratio_delta"),
            "changed_pixel_ratio": pair.get("changed_pixel_ratio"),
        }
        for pair in eval_result.pairs
    ]
    return record, rows


def _render_variants(variants: list[JitterVariant]) -> None:
    for variant in variants:
        render_html_file(
            RenderConfig(
                input_path=variant.html_path,
                output_dir=variant.html_path.parent,
            )
        )


def _variant_records(
    public_sample_output_dir: Path,
    pairs: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    records = []
    for pair in pairs:
        variant_dir = public_sample_output_dir / "jittered" / pair["variant_name"]
        records.append(
            {
                "variant_name": pair["variant_name"],
                "defect_type": pair["defect_type"],
                "html_path": str(variant_dir / "index.html"),
                "screenshot_path": str(variant_dir / "screenshot.png"),
                "dom_path": str(variant_dir / "dom.json"),
                "accessibility_path": str(variant_dir / "accessibility.json"),
                "metrics_path": str(variant_dir / "metrics.json"),
            }
        )
    return records


def _build_dataset_json(
    *,
    source_dir: Path,
    output_dir: Path,
    seed: int,
    records: list[dict[str, Any]],
    aggregate_rows: list[dict[str, Any]],
) -> dict[str, Any]:
    ok_records = [record for record in records if record["status"] == "ok"]
    failed_records = [record for record in records if record["status"] == "failed"]
    return {
        "dataset_id": output_dir.name,
        "source_dir": str(source_dir),
        "output_dir": str(output_dir),
        "seed": seed,
        "generated_at": _stable_generated_at(seed),
        "sample_count": len(ok_records),
        "variant_count": sum(len(record["variants"]) for record in ok_records),
        "failed_count": len(failed_records),
        "samples": records,
        "aggregate_metrics": _aggregate_metrics(aggregate_rows),
    }


def _aggregate_metrics(rows: list[dict[str, Any]]) -> dict[str, dict[str, float]]:
    return {
        "average_contrast_issue_delta": _average_by_defect(rows, "contrast_issue_delta"),
        "average_min_contrast_ratio_delta": _average_by_defect(rows, "min_contrast_ratio_delta"),
        "average_font_size_ratio_delta": _average_by_defect(rows, "font_size_ratio_delta"),
        "average_changed_pixel_ratio": _average_by_defect(rows, "changed_pixel_ratio"),
    }


def _average_by_defect(rows: list[dict[str, Any]], field: str) -> dict[str, float]:
    values: dict[str, list[float]] = defaultdict(list)
    for row in rows:
        value = row.get(field)
        if isinstance(value, int | float):
            values[row["defect_type"]].append(float(value))
    return {
        defect_type: sum(items) / len(items)
        for defect_type, items in sorted(values.items())
        if items
    }


def _stable_generated_at(seed: int) -> str:
    timestamp = datetime.fromtimestamp(max(seed, 0), tz=timezone.utc)
    return timestamp.isoformat().replace("+00:00", "Z")


def _replace_output_dir(stage_dir: Path, output_dir: Path) -> None:
    if not output_dir.exists():
        os.replace(stage_dir, output_dir)
        return

    backup_dir = Path(
        tempfile.mkdtemp(
            dir=output_dir.parent,
            prefix=f".{output_dir.name}.backup.",
        )
    )
    shutil.rmtree(backup_dir)

    try:
        os.replace(output_dir, backup_dir)
        os.replace(stage_dir, output_dir)
    except Exception:
        if not output_dir.exists() and backup_dir.exists():
            os.replace(backup_dir, output_dir)
        raise
    else:
        shutil.rmtree(backup_dir, ignore_errors=True)


def _write_json(path: Path, payload: Any) -> None:
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def _rewrite_artifact_json_paths(
    *,
    paths: list[Path],
    stage_root: Path,
    public_root: Path,
) -> None:
    stage_prefix = str(stage_root)
    public_prefix = str(public_root)
    for path in paths:
        if not path.exists():
            continue
        payload = json.loads(path.read_text(encoding="utf-8"))
        _write_json(path, _rewrite_value_paths(payload, stage_prefix, public_prefix))


def _rewrite_value_paths(value: Any, stage_prefix: str, public_prefix: str) -> Any:
    if isinstance(value, str):
        return value.replace(stage_prefix, public_prefix)
    if isinstance(value, list):
        return [_rewrite_value_paths(item, stage_prefix, public_prefix) for item in value]
    if isinstance(value, dict):
        return {
            key: _rewrite_value_paths(item, stage_prefix, public_prefix)
            for key, item in value.items()
        }
    return value
