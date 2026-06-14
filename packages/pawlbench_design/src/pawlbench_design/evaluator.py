"""PawlBench Design v0 evaluator for generated UI pairs."""

from __future__ import annotations

import json
import math
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from PIL import Image, ImageChops


REQUIRED_VARIANT_FIELDS = {
    "variant_name",
    "defect_type",
    "severity",
    "html_path",
    "screenshot_path",
    "expected_issue",
    "expected_fix_instruction",
}


@dataclass(frozen=True)
class EvalConfig:
    input_dir: Path
    output_dir: Path


@dataclass(frozen=True)
class EvalResult:
    output_dir: Path
    summary_path: Path
    pairs_path: Path
    summary: dict[str, Any]
    pairs: list[dict[str, Any]]


def evaluate_jitter_pairs(config: EvalConfig) -> EvalResult:
    input_dir = config.input_dir.expanduser().resolve()
    output_dir = config.output_dir.expanduser().resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    labels = _load_labels(input_dir)
    original_screenshot = _required_file(input_dir / "original" / "screenshot.png")
    _required_file(input_dir / "original" / "metrics.json")

    variants = _validate_variants(input_dir, labels)
    pairs = [
        _build_pair_record(
            original_screenshot=original_screenshot,
            variant=variant,
        )
        for variant in variants
    ]
    summary = _build_summary(input_dir=input_dir, output_dir=output_dir, pairs=pairs)

    summary_path = output_dir / "summary.json"
    pairs_path = output_dir / "pairs.json"
    _write_json(summary_path, summary)
    _write_json(pairs_path, pairs)

    return EvalResult(
        output_dir=output_dir,
        summary_path=summary_path,
        pairs_path=pairs_path,
        summary=summary,
        pairs=pairs,
    )


def _load_labels(input_dir: Path) -> dict[str, Any]:
    labels_path = _required_file(input_dir / "labels.json")
    try:
        labels = json.loads(labels_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ValueError(f"invalid labels.json: {exc}") from exc

    variants = labels.get("variants")
    if not isinstance(variants, list) or not variants:
        raise ValueError("labels.json must contain a non-empty variants list")

    return labels


def _validate_variants(input_dir: Path, labels: dict[str, Any]) -> list[dict[str, Any]]:
    variants: list[dict[str, Any]] = []
    for index, variant in enumerate(labels["variants"]):
        if not isinstance(variant, dict):
            raise ValueError(f"variant at index {index} must be an object")

        missing_fields = sorted(REQUIRED_VARIANT_FIELDS - set(variant))
        if missing_fields:
            raise ValueError(
                f"variant {index} is missing required fields: {', '.join(missing_fields)}"
            )

        html_path = _resolve_artifact_path(input_dir, variant["html_path"])
        screenshot_path = _resolve_artifact_path(input_dir, variant["screenshot_path"])
        _required_file(html_path)
        _required_file(screenshot_path)

        normalized = dict(variant)
        normalized["html_path"] = str(html_path)
        normalized["screenshot_path"] = str(screenshot_path)
        variants.append(normalized)

    return variants


def _build_pair_record(*, original_screenshot: Path, variant: dict[str, Any]) -> dict[str, Any]:
    screenshot_path = Path(variant["screenshot_path"])
    image_metrics = _compare_screenshots(original_screenshot, screenshot_path)
    return {
        "variant_name": variant["variant_name"],
        "defect_type": variant["defect_type"],
        "severity": variant["severity"],
        "expected_issue": variant["expected_issue"],
        "expected_fix_instruction": variant["expected_fix_instruction"],
        "html_path": variant["html_path"],
        "screenshot_path": variant["screenshot_path"],
        **image_metrics,
    }


def _build_summary(
    *,
    input_dir: Path,
    output_dir: Path,
    pairs: list[dict[str, Any]],
) -> dict[str, Any]:
    variant_count = len(pairs)
    return {
        "input_dir": str(input_dir),
        "output_dir": str(output_dir),
        "variant_count": variant_count,
        "valid": True,
        "errors": [],
        "average_mean_absolute_pixel_delta": _average(
            pair["mean_absolute_pixel_delta"] for pair in pairs
        ),
        "average_changed_pixel_ratio": _average(pair["changed_pixel_ratio"] for pair in pairs),
        "variants_by_defect_type": dict(
            sorted(Counter(pair["defect_type"] for pair in pairs).items())
        ),
    }


def _compare_screenshots(original_path: Path, variant_path: Path) -> dict[str, int | float]:
    with Image.open(original_path) as original_image:
        original = original_image.convert("RGB")
    with Image.open(variant_path) as variant_image:
        variant = variant_image.convert("RGB")

    width = min(original.width, variant.width)
    height = min(original.height, variant.height)
    if width <= 0 or height <= 0:
        raise ValueError(f"cannot compare empty screenshots: {original_path}, {variant_path}")

    original_crop = original.crop((0, 0, width, height))
    variant_crop = variant.crop((0, 0, width, height))
    diff = ImageChops.difference(original_crop, variant_crop)

    total_channel_delta = 0
    total_squared_delta = 0
    changed_pixels = 0
    threshold = 8

    pixel_data = (
        diff.get_flattened_data()
        if hasattr(diff, "get_flattened_data")
        else diff.getdata()
    )
    for red, green, blue in pixel_data:
        total_channel_delta += red + green + blue
        total_squared_delta += red * red + green * green + blue * blue
        if max(red, green, blue) > threshold:
            changed_pixels += 1

    pixel_count = width * height
    channel_count = pixel_count * 3

    return {
        "image_width": width,
        "image_height": height,
        "mean_absolute_pixel_delta": total_channel_delta / channel_count,
        "rms_pixel_delta": math.sqrt(total_squared_delta / channel_count),
        "changed_pixel_ratio": changed_pixels / pixel_count,
        "original_file_size_bytes": original_path.stat().st_size,
        "variant_file_size_bytes": variant_path.stat().st_size,
    }


def _resolve_artifact_path(input_dir: Path, raw_path: str) -> Path:
    path = Path(raw_path).expanduser()
    if path.is_absolute():
        return path.resolve()
    return (input_dir / path).resolve()


def _required_file(path: Path) -> Path:
    resolved = path.expanduser().resolve()
    if not resolved.is_file():
        raise ValueError(f"required file is missing: {resolved}")
    return resolved


def _average(values: Any) -> float:
    items = list(values)
    if not items:
        return 0.0
    return sum(items) / len(items)


def _write_json(path: Path, payload: Any) -> None:
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
