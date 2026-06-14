"""Lightweight non-ML baseline embeddings for UI pair artifacts."""

from __future__ import annotations

import json
import math
from dataclasses import dataclass
from html.parser import HTMLParser
from pathlib import Path
from typing import Any

from PIL import Image, ImageFilter

from pawlbench_design.evaluator import _load_labels, _required_file, _validate_variants


BASELINE_NAMES = [
    "thumbnail_rgb_16x16",
    "color_histogram_rgb",
    "grayscale_edge_density",
    "dom_layout_stats",
]


@dataclass(frozen=True)
class EmbeddingConfig:
    input_dir: Path
    output_dir: Path


@dataclass(frozen=True)
class EmbeddingResult:
    output_dir: Path
    embeddings_path: Path
    similarities_path: Path
    summary_path: Path
    embeddings: dict[str, Any]
    similarities: list[dict[str, Any]]
    summary: dict[str, Any]


class _HTMLStatsParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.node_count = 0
        self.text_length = 0
        self.current_depth = 0
        self.max_depth = 0
        self.depth_sum = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self.node_count += 1
        self.current_depth += 1
        self.max_depth = max(self.max_depth, self.current_depth)
        self.depth_sum += self.current_depth

    def handle_endtag(self, tag: str) -> None:
        self.current_depth = max(0, self.current_depth - 1)

    def handle_data(self, data: str) -> None:
        self.text_length += len(" ".join(data.split()))


def build_encoder_baselines(config: EmbeddingConfig) -> EmbeddingResult:
    input_dir = config.input_dir.expanduser().resolve()
    output_dir = config.output_dir.expanduser().resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    labels = _load_labels(input_dir)
    original_screenshot = _required_file(input_dir / "original" / "screenshot.png")
    original_dom = _required_file(input_dir / "original" / "dom.json")
    variants = _validate_variants(input_dir, labels)

    original_embeddings = _build_artifact_embeddings(
        screenshot_path=original_screenshot,
        dom_path=original_dom,
        html_path=input_dir / "original" / "index.html",
    )
    variant_embeddings = [
        {
            "variant_name": variant["variant_name"],
            "defect_type": variant["defect_type"],
            "severity": variant["severity"],
            "embeddings": _build_artifact_embeddings(
                screenshot_path=Path(variant["screenshot_path"]),
                dom_path=None,
                html_path=Path(variant["html_path"]),
            ),
        }
        for variant in variants
    ]
    embeddings = {
        "input_dir": str(input_dir),
        "baseline_names": BASELINE_NAMES,
        "original": {
            "screenshot_path": str(original_screenshot),
            "dom_path": str(original_dom),
            "embeddings": original_embeddings,
        },
        "variants": variant_embeddings,
    }

    similarities = _build_similarities(original_embeddings, variant_embeddings)
    summary = _build_summary(input_dir=input_dir, output_dir=output_dir, similarities=similarities)

    embeddings_path = output_dir / "embeddings.json"
    similarities_path = output_dir / "similarities.json"
    summary_path = output_dir / "summary.json"
    _write_json(embeddings_path, embeddings)
    _write_json(similarities_path, similarities)
    _write_json(summary_path, summary)

    return EmbeddingResult(
        output_dir=output_dir,
        embeddings_path=embeddings_path,
        similarities_path=similarities_path,
        summary_path=summary_path,
        embeddings=embeddings,
        similarities=similarities,
        summary=summary,
    )


def _build_artifact_embeddings(
    *,
    screenshot_path: Path,
    dom_path: Path | None,
    html_path: Path,
) -> dict[str, list[float]]:
    return {
        "thumbnail_rgb_16x16": _thumbnail_rgb_16x16(screenshot_path),
        "color_histogram_rgb": _color_histogram_rgb(screenshot_path),
        "grayscale_edge_density": _grayscale_edge_density(screenshot_path),
        "dom_layout_stats": _dom_layout_stats(dom_path=dom_path, html_path=html_path),
    }


def _thumbnail_rgb_16x16(path: Path) -> list[float]:
    resample = getattr(Image.Resampling, "BILINEAR", Image.BILINEAR)
    with Image.open(path) as image:
        resized = image.convert("RGB").resize((16, 16), resample)
        return [channel / 255 for pixel in _image_data(resized) for channel in pixel]


def _color_histogram_rgb(path: Path, bins_per_channel: int = 8) -> list[float]:
    counts = [0] * (bins_per_channel * 3)
    with Image.open(path) as image:
        rgb = image.convert("RGB")
        pixel_count = max(1, rgb.width * rgb.height)
        for red, green, blue in _image_data(rgb):
            counts[_bin_index(red, bins_per_channel)] += 1
            counts[bins_per_channel + _bin_index(green, bins_per_channel)] += 1
            counts[(bins_per_channel * 2) + _bin_index(blue, bins_per_channel)] += 1

    return [count / pixel_count for count in counts]


def _grayscale_edge_density(path: Path) -> list[float]:
    with Image.open(path) as image:
        gray = image.convert("L")
        edges = gray.filter(ImageFilter.FIND_EDGES)
        values = list(_image_data(edges))

    pixel_count = max(1, len(values))
    mean_edge = sum(values) / (pixel_count * 255)
    thresholds = [16, 32, 64, 96]
    ratios = [sum(1 for value in values if value >= threshold) / pixel_count for threshold in thresholds]
    sorted_values = sorted(values)
    percentiles = [
        sorted_values[min(pixel_count - 1, int(pixel_count * percentile))] / 255
        for percentile in (0.5, 0.75, 0.9)
    ]
    return [mean_edge, *ratios, *percentiles]


def _dom_layout_stats(*, dom_path: Path | None, html_path: Path) -> list[float]:
    if dom_path is not None and dom_path.is_file():
        dom = json.loads(dom_path.read_text(encoding="utf-8"))
        stats = _stats_from_dom_snapshot(dom)
    else:
        stats = _stats_from_html(html_path)

    return [
        _scale(stats["node_count"], 200),
        _scale(stats["text_length"], 5000),
        _scale(stats["max_depth"], 30),
        _scale(stats["average_depth"], 30),
        _scale(stats["total_area"], 2_000_000),
        _scale(stats["average_area"], 500_000),
        _scale(stats["max_area"], 2_000_000),
    ]


def _stats_from_dom_snapshot(node: dict[str, Any], depth: int = 1) -> dict[str, float]:
    children = node.get("children", [])
    child_stats = [_stats_from_dom_snapshot(child, depth + 1) for child in children]
    text_length = len(str(node.get("text_snippet", "")))
    bounding_box = node.get("bounding_box", {})
    area = float(bounding_box.get("width", 0)) * float(bounding_box.get("height", 0))

    node_count = 1 + sum(stats["node_count"] for stats in child_stats)
    depth_sum = depth + sum(stats["depth_sum"] for stats in child_stats)
    total_area = area + sum(stats["total_area"] for stats in child_stats)
    max_area = max([area, *(stats["max_area"] for stats in child_stats)])

    return {
        "node_count": node_count,
        "text_length": text_length + sum(stats["text_length"] for stats in child_stats),
        "max_depth": max([depth, *(stats["max_depth"] for stats in child_stats)]),
        "depth_sum": depth_sum,
        "average_depth": depth_sum / max(1, node_count),
        "total_area": total_area,
        "average_area": total_area / max(1, node_count),
        "max_area": max_area,
    }


def _stats_from_html(path: Path) -> dict[str, float]:
    parser = _HTMLStatsParser()
    parser.feed(path.read_text(encoding="utf-8"))
    node_count = max(1, parser.node_count)
    return {
        "node_count": parser.node_count,
        "text_length": parser.text_length,
        "max_depth": parser.max_depth,
        "depth_sum": parser.depth_sum,
        "average_depth": parser.depth_sum / node_count,
        "total_area": 0.0,
        "average_area": 0.0,
        "max_area": 0.0,
    }


def _build_similarities(
    original_embeddings: dict[str, list[float]],
    variant_embeddings: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    records = []
    for variant in variant_embeddings:
        similarities = {
            baseline_name: _cosine_similarity(
                original_embeddings[baseline_name],
                variant["embeddings"][baseline_name],
            )
            for baseline_name in BASELINE_NAMES
        }
        records.append(
            {
                "variant_name": variant["variant_name"],
                "defect_type": variant["defect_type"],
                "severity": variant["severity"],
                "similarities": similarities,
            }
        )

    return records


def _build_summary(
    *,
    input_dir: Path,
    output_dir: Path,
    similarities: list[dict[str, Any]],
) -> dict[str, Any]:
    average_similarity_by_baseline = {}
    lowest_similarity_variant_by_baseline = {}
    for baseline_name in BASELINE_NAMES:
        scores = [
            (record["variant_name"], record["similarities"][baseline_name])
            for record in similarities
        ]
        average_similarity_by_baseline[baseline_name] = sum(score for _, score in scores) / max(
            1, len(scores)
        )
        lowest_variant, lowest_score = min(scores, key=lambda item: item[1])
        lowest_similarity_variant_by_baseline[baseline_name] = {
            "variant_name": lowest_variant,
            "similarity": lowest_score,
        }

    return {
        "input_dir": str(input_dir),
        "output_dir": str(output_dir),
        "variant_count": len(similarities),
        "valid": True,
        "errors": [],
        "baseline_names": BASELINE_NAMES,
        "average_similarity_by_baseline": average_similarity_by_baseline,
        "lowest_similarity_variant_by_baseline": lowest_similarity_variant_by_baseline,
    }


def _cosine_similarity(left: list[float], right: list[float]) -> float:
    length = min(len(left), len(right))
    if length == 0:
        return 0.0

    dot = sum(left[index] * right[index] for index in range(length))
    left_norm = math.sqrt(sum(left[index] * left[index] for index in range(length)))
    right_norm = math.sqrt(sum(right[index] * right[index] for index in range(length)))
    if left_norm == 0 or right_norm == 0:
        return 0.0

    return dot / (left_norm * right_norm)


def _bin_index(value: int, bins_per_channel: int) -> int:
    return min(bins_per_channel - 1, int(value / (256 / bins_per_channel)))


def _image_data(image: Image.Image) -> Any:
    return (
        image.get_flattened_data()
        if hasattr(image, "get_flattened_data")
        else image.getdata()
    )


def _scale(value: float, denominator: float) -> float:
    return min(1.0, value / denominator) if denominator else 0.0


def _write_json(path: Path, payload: Any) -> None:
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
