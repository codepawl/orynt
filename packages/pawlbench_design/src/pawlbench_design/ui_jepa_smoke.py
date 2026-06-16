"""Canonical UI-JEPA v0 smoke dataset, validation, and B0 baseline helpers."""

from __future__ import annotations

import hashlib
import importlib.util
import json
import math
import os
import random
import shutil
import subprocess
import tempfile
import time
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from itertools import combinations
from pathlib import Path
from typing import Any, Protocol

from PIL import Image


SCHEMA_VERSION = "ui_jepa_v0_smoke"
MANIFEST_SCHEMA_VERSION = "ui_jepa_v0_smoke_manifest_v1"
REGION_SCHEMA_VERSION = "ui_jepa_v0_smoke_region_v1"
PAIR_SCHEMA_VERSION = "ui_jepa_v0_smoke_pair_v1"
TOKEN_SCHEMA_VERSION = "ui_jepa_v0_smoke_design_tokens_v1"
SPLITS = ("train", "val", "test")
REGION_TYPES = {
    "navbar",
    "hero",
    "cta",
    "card",
    "card_grid",
    "form",
    "sidebar",
    "footer",
    "modal",
    "table",
    "unknown",
}
MODEL_ALIASES = {
    "dinov2": "facebook/dinov2-small",
    "siglip": "google/siglip-base-patch16-224",
    "clip": "openai/clip-vit-base-patch32",
}
SOURCE_JITTER_SEED_COUNT = 8
SMOKE_TOTAL_PAIR_THRESHOLD = 1000
SMOKE_EVAL_PAIR_THRESHOLD = 100
BEST_CONSTANT_THRESHOLD = 0.65


@dataclass(frozen=True)
class UiJepaSmokeBuildConfig:
    output_dir: Path
    source_dir: Path | None = None
    local_dataset_dir: Path | None = None
    seed: int = 42
    limit: int | None = None
    overwrite: bool = True
    canvas_size: int = 768
    patch_size: int = 16


@dataclass(frozen=True)
class UiJepaSmokeBuildResult:
    output_dir: Path
    manifest_path: Path
    regions_path: Path
    pairs_path: Path
    splits_path: Path
    design_tokens_path: Path
    dataset_card_path: Path
    summary: dict[str, Any]


@dataclass(frozen=True)
class UiJepaSmokeValidationResult:
    output_dir: Path
    validation_path: Path
    validation: dict[str, Any]


@dataclass(frozen=True)
class UiJepaSmokeB0Config:
    dataset_dir: Path
    output_dir: Path
    backend: str = "auto"
    seed: int = 42
    epochs: int = 80
    hidden_dim: int = 16
    learning_rate: float = 0.05
    allow_dummy: bool = True
    export_embeddings: Path | None = None


@dataclass(frozen=True)
class UiJepaSmokeB0Result:
    output_dir: Path
    report_json_path: Path
    report_md_path: Path
    report: dict[str, Any]


class VisionEncoder(Protocol):
    backend: str
    model_name: str
    is_real: bool

    def encode(self, image_paths: list[Path]) -> dict[str, list[float]]:
        """Return normalized embeddings keyed by image path string."""


def build_ui_jepa_smoke_dataset(config: UiJepaSmokeBuildConfig) -> UiJepaSmokeBuildResult:
    output_dir = config.output_dir.expanduser().resolve()
    if output_dir.exists() and not config.overwrite:
        raise ValueError(f"output directory already exists: {output_dir}")
    if config.source_dir is None and config.local_dataset_dir is None:
        raise ValueError("either source_dir or local_dataset_dir is required")
    if config.limit is not None and config.limit < 0:
        raise ValueError("limit must be greater than or equal to 0")

    output_dir.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=output_dir.parent, prefix=f".{output_dir.name}.") as tmp:
        stage_dir = Path(tmp) / output_dir.name
        stage_dir.mkdir()
        source_dataset_dir = (
            _build_local_corruption_dataset(
                source_dir=config.source_dir,
                stage_dir=stage_dir,
                seed=config.seed,
                limit=config.limit,
            )
            if config.source_dir is not None
            else config.local_dataset_dir.expanduser().resolve()  # type: ignore[union-attr]
        )
        manifest, pairs = _canonical_records_from_local_dataset(
            source_dataset_dir,
            public_root=output_dir,
            stage_root=stage_dir,
            seed=config.seed,
        )
        splits = _stable_splits(manifest, seed=config.seed)
        pairs = _orient_pairs_by_split(pairs, splits, seed=config.seed)
        stage_manifest = [_stage_path_record(record, public_root=output_dir, stage_root=stage_dir) for record in manifest]
        regions = [
            region
            for record in stage_manifest
            for region in extract_semantic_regions(
                record,
                canvas_size=config.canvas_size,
                patch_size=config.patch_size,
            )
        ]
        token_records = [extract_design_tokens(record) for record in stage_manifest]
        summary = _write_smoke_outputs(
            stage_dir=stage_dir,
            output_dir=output_dir,
            manifest=manifest,
            regions=regions,
            pairs=pairs,
            splits=splits,
            design_tokens=token_records,
            seed=config.seed,
            canvas_size=config.canvas_size,
            patch_size=config.patch_size,
        )
        _replace_output_dir(stage_dir, output_dir)

    return UiJepaSmokeBuildResult(
        output_dir=output_dir,
        manifest_path=output_dir / "manifest.jsonl",
        regions_path=output_dir / "regions.jsonl",
        pairs_path=output_dir / "pairs.jsonl",
        splits_path=output_dir / "splits.json",
        design_tokens_path=output_dir / "design_tokens.jsonl",
        dataset_card_path=output_dir / "dataset_card.md",
        summary=json.loads((output_dir / "summary.json").read_text(encoding="utf-8")),
    )


def validate_ui_jepa_smoke_dataset(input_dir: Path, output_dir: Path | None = None) -> UiJepaSmokeValidationResult:
    input_dir = input_dir.expanduser().resolve()
    output_dir = (output_dir or input_dir / "validation").expanduser().resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    validation = build_ui_jepa_smoke_validation(input_dir)
    validation_path = output_dir / "validation.json"
    _write_json(validation_path, validation)
    return UiJepaSmokeValidationResult(output_dir, validation_path, validation)


def build_ui_jepa_smoke_validation(input_dir: Path) -> dict[str, Any]:
    errors: list[str] = []
    warnings: list[str] = []
    manifest = _read_jsonl_required(input_dir / "manifest.jsonl", errors)
    regions = _read_jsonl_required(input_dir / "regions.jsonl", errors)
    pairs = _read_jsonl_required(input_dir / "pairs.jsonl", errors)
    tokens = _read_jsonl_required(input_dir / "design_tokens.jsonl", errors)
    splits = _read_json_required(input_dir / "splits.json", errors)
    screen_ids = [str(record.get("screen_id")) for record in manifest]
    screen_id_set = set(screen_ids)

    if len(screen_id_set) != len(screen_ids):
        errors.append("manifest screen_id values must be unique")
    manifest_by_id = {str(record.get("screen_id")): record for record in manifest}
    for record in manifest:
        screen_id = str(record.get("screen_id", "<missing>"))
        for field in (
            "screen_id",
            "source",
            "source_path",
            "screenshot_path",
            "dom_path",
            "accessibility_path",
            "metrics_path",
            "width",
            "height",
            "viewport",
            "template_id",
            "domain_or_app_id",
            "render_hash",
            "created_at",
            "schema_version",
        ):
            if field not in record:
                errors.append(f"manifest {screen_id} missing {field}")
        screenshot = _resolve_path(input_dir, record.get("screenshot_path"))
        if screenshot is None or not screenshot.is_file():
            errors.append(f"manifest {screen_id} missing screenshot: {record.get('screenshot_path')}")
        else:
            with Image.open(screenshot) as image:
                if int(record.get("width") or -1) != image.width or int(record.get("height") or -1) != image.height:
                    errors.append(f"manifest {screen_id} width/height do not match screenshot")
        for artifact_field in ("dom_path", "accessibility_path", "metrics_path"):
            artifact = _resolve_path(input_dir, record.get(artifact_field))
            if artifact is None or not artifact.is_file():
                errors.append(f"manifest {screen_id} missing {artifact_field}: {record.get(artifact_field)}")

    regions_by_screen: dict[str, set[str]] = defaultdict(set)
    for region in regions:
        screen_id = str(region.get("screen_id"))
        region_id = str(region.get("region_id"))
        record = manifest_by_id.get(screen_id)
        if record is None:
            errors.append(f"region {region_id} references unknown screen_id {screen_id}")
            continue
        if region_id in regions_by_screen[screen_id]:
            errors.append(f"duplicate region_id for screen {screen_id}: {region_id}")
        regions_by_screen[screen_id].add(region_id)
        bbox = region.get("bbox_xyxy")
        if not _valid_bbox(bbox, float(record["width"]), float(record["height"])):
            errors.append(f"region {region_id} bbox is outside screen bounds")
        area_ratio = _as_float(region.get("area_ratio"))
        if area_ratio is None or area_ratio <= 0 or area_ratio > 1:
            errors.append(f"region {region_id} area_ratio must be in (0, 1]")
        if region.get("region_type") not in REGION_TYPES:
            errors.append(f"region {region_id} has unsupported region_type: {region.get('region_type')}")
    if manifest and not regions:
        errors.append("regions.jsonl has no extracted regions")

    pair_ids: list[str] = []
    split_pair_stats: dict[str, dict[str, Any]] = {}
    for pair in pairs:
        pair_id = str(pair.get("pair_id"))
        pair_ids.append(pair_id)
        for field in (
            "left_screen_id",
            "right_screen_id",
            "preferred_screen_id",
            "left_is_preferred",
            "orientation_seed",
            "pair_family",
            "difficulty",
            "label_source",
            "corruption_type",
            "severity",
            "split_group",
            "schema_version",
        ):
            if field not in pair:
                errors.append(f"pair {pair_id} missing {field}")
        if pair.get("left_screen_id") not in screen_id_set:
            errors.append(f"pair {pair_id} has unknown left_screen_id")
        if pair.get("right_screen_id") not in screen_id_set:
            errors.append(f"pair {pair_id} has unknown right_screen_id")
        if pair.get("preferred_screen_id") not in {pair.get("left_screen_id"), pair.get("right_screen_id")}:
            errors.append(f"pair {pair_id} preferred_screen_id must be left or right")
        if bool(pair.get("left_is_preferred")) != (pair.get("preferred_screen_id") == pair.get("left_screen_id")):
            errors.append(f"pair {pair_id} left_is_preferred does not match preferred side")
        if pair.get("orientation_seed") != _orientation_seed(pair_id, int(splits.get("seed", 0)) if isinstance(splits, dict) else 0):
            errors.append(f"pair {pair_id} orientation_seed is not deterministic")
    if len(pair_ids) != len(set(pair_ids)):
        errors.append("pairs.jsonl pair_id values must be unique")
    if pair_ids != sorted(pair_ids):
        errors.append("pairs.jsonl pair_id values must be sorted for deterministic output")

    token_ids = {str(record.get("screen_id")) for record in tokens}
    missing_tokens = sorted(screen_id_set - token_ids)
    if missing_tokens:
        errors.append(f"design token records missing for screens: {', '.join(missing_tokens[:5])}")
    for token in tokens:
        for field in ("colors", "typography", "spacing", "shape", "layout", "extraction_confidence"):
            if field not in token:
                errors.append(f"design token {token.get('screen_id')} missing {field}")

    split_groups_by_split = {
        split: set(str(group) for group in (splits.get("split_groups", {}).get(split, []) if isinstance(splits, dict) else []))
        for split in SPLITS
    }
    seen_groups: dict[str, str] = {}
    leaked_groups: dict[str, list[str]] = defaultdict(list)
    for split, groups in split_groups_by_split.items():
        for group in groups:
            previous = seen_groups.get(group)
            if previous is not None and previous != split:
                leaked_groups[group].extend([previous, split])
            seen_groups[group] = split
    if leaked_groups:
        errors.append(f"split_group leakage detected: {dict(leaked_groups)}")
    for pair in pairs:
        group = str(pair.get("split_group"))
        if group not in seen_groups:
            errors.append(f"pair {pair.get('pair_id')} split_group missing from splits.json: {group}")
    pairs_by_split: dict[str, list[dict[str, Any]]] = {split: [] for split in SPLITS}
    for pair in pairs:
        split = seen_groups.get(str(pair.get("split_group")), "train")
        if split in pairs_by_split:
            pairs_by_split[split].append(pair)
    orientation_sanity = {"valid": True, "threshold": BEST_CONSTANT_THRESHOLD, "splits": {}}
    for split, split_pairs in pairs_by_split.items():
        left_preferred = sum(1 for pair in split_pairs if pair.get("preferred_screen_id") == pair.get("left_screen_id"))
        count = len(split_pairs)
        always_left = left_preferred / count if count else None
        always_right = 1.0 - always_left if always_left is not None else None
        best_constant = max(always_left, always_right) if always_left is not None and always_right is not None else None
        balance = min(always_left, always_right) if always_left is not None and always_right is not None else None
        split_valid = True
        if count >= 20 and best_constant is not None and best_constant > BEST_CONSTANT_THRESHOLD:
            split_valid = False
            errors.append(f"{split} best_constant_accuracy {best_constant:.3f} exceeds {BEST_CONSTANT_THRESHOLD:.2f}")
        if count >= 20 and (always_left is not None and (always_left >= 0.95 or always_right >= 0.95)):
            split_valid = False
            errors.append(f"{split} preferred side is orientation-leaked")
        orientation_sanity["splits"][split] = {
            "pair_count": count,
            "always_left_accuracy": always_left,
            "always_right_accuracy": always_right,
            "best_constant_accuracy": best_constant,
            "preferred_side_balance": balance,
            "valid": split_valid,
            "tiny_sample": count < 20,
        }
    orientation_sanity["valid"] = all(item["valid"] for item in orientation_sanity["splits"].values())
    pair_family_counts = dict(sorted(Counter(str(pair.get("pair_family")) for pair in pairs).items()))

    return {
        "schema_version": "ui_jepa_v0_smoke_validation_v1",
        "valid": not errors,
        "errors": errors,
        "warnings": warnings,
        "manifest_count": len(manifest),
        "region_count": len(regions),
        "pair_count": len(pairs),
        "pair_family_counts": pair_family_counts,
        "orientation_sanity": orientation_sanity,
        "design_token_count": len(tokens),
        "screens_with_regions": len(regions_by_screen),
        "split_counts": {
            split: len(splits.get("screen_ids", {}).get(split, [])) if isinstance(splits, dict) else 0
            for split in SPLITS
        },
    }


def extract_semantic_regions(
    manifest_record: dict[str, Any],
    *,
    canvas_size: int = 768,
    patch_size: int = 16,
) -> list[dict[str, Any]]:
    dom_path = Path(str(manifest_record["dom_path"])).expanduser()
    dom = json.loads(dom_path.read_text(encoding="utf-8"))
    width = float(manifest_record["width"])
    height = float(manifest_record["height"])
    screen_area = max(1.0, width * height)
    candidates: list[dict[str, Any]] = []
    for node, depth in _walk_dom(dom):
        bbox = _bbox_xyxy(node.get("bounding_box"))
        if bbox is None:
            continue
        x1, y1, x2, y2 = _clip_bbox(bbox, width, height)
        area = max(0.0, x2 - x1) * max(0.0, y2 - y1)
        if area / screen_area < 0.005 or area / screen_area > 0.98:
            continue
        region_type, confidence = _classify_region(node, bbox=[x1, y1, x2, y2], depth=depth, screen_width=width, screen_height=height)
        if confidence < 0.25:
            continue
        text_density = _text_density(node, area)
        interactive_density = _interactive_density(node, area)
        candidates.append(
            {
                "region_type": region_type,
                "bbox_xyxy": [round(x1, 2), round(y1, 2), round(x2, 2), round(y2, 2)],
                "area_ratio": round(area / screen_area, 6),
                "confidence": round(confidence, 3),
                "source": "dom_heuristic",
                "text_density": text_density,
                "interactive_density": interactive_density,
                "children_count": len(node.get("children", []) or []),
            }
        )
    selected = _dedupe_regions(candidates)
    if not selected:
        selected = [
            {
                "region_type": "unknown",
                "bbox_xyxy": [0.0, 0.0, width, height],
                "area_ratio": 1.0,
                "confidence": 0.1,
                "source": "fallback",
                "text_density": 0.0,
                "interactive_density": 0.0,
                "children_count": 0,
            }
        ]
    records = []
    for index, region in enumerate(selected, start=1):
        region_id = f"{manifest_record['screen_id']}__r{index:03d}_{region['region_type']}"
        records.append(
            {
                "schema_version": REGION_SCHEMA_VERSION,
                "screen_id": manifest_record["screen_id"],
                "region_id": region_id,
                "region_type": region["region_type"],
                "bbox_xyxy": region["bbox_xyxy"],
                "area_ratio": region["area_ratio"],
                "patch_ids": _patch_ids_for_bbox(
                    region["bbox_xyxy"],
                    original_width=width,
                    original_height=height,
                    canvas_size=canvas_size,
                    patch_size=patch_size,
                ),
                "patch_metadata": {
                    "canvas_size": canvas_size,
                    "patch_size": patch_size,
                    "grid_width": canvas_size // patch_size,
                    "grid_height": canvas_size // patch_size,
                },
                "confidence": region["confidence"],
                "source": region["source"],
                "text_density": region["text_density"],
                "interactive_density": region["interactive_density"],
                "children_count": region["children_count"],
            }
        )
    return records


def extract_design_tokens(manifest_record: dict[str, Any]) -> dict[str, Any]:
    html_path = Path(str(manifest_record["source_path"]))
    metrics_path = Path(str(manifest_record["metrics_path"]))
    html = html_path.read_text(encoding="utf-8") if html_path.is_file() else ""
    metrics = json.loads(metrics_path.read_text(encoding="utf-8")) if metrics_path.is_file() else {}
    colors = sorted(set(_find_css_values(html, r"#[0-9a-fA-F]{3,8}")))
    font_sizes = sorted(set(float(value) for value in _find_css_numbers(html, r"font-size\s*:\s*([0-9.]+)px")))
    radii = sorted(set(float(value) for value in _find_css_numbers(html, r"border-radius\s*:\s*([0-9.]+)px")))
    spacing = sorted(set(float(value) for value in _find_css_numbers(html, r"(?:gap|padding|margin)\s*:\s*([0-9.]+)px")))
    shadow_count = html.count("box-shadow")
    confidence = 0.75 if html else 0.35
    return {
        "schema_version": TOKEN_SCHEMA_VERSION,
        "screen_id": manifest_record["screen_id"],
        "colors": {
            "palette": colors[:16],
            "dominant_palette": colors[:6],
            "contrast_warnings": int(metrics.get("contrast_issue_count") or 0),
        },
        "typography": {
            "font_sizes_px": font_sizes[:12],
            "min_font_size_px": metrics.get("min_font_size"),
            "max_font_size_px": metrics.get("max_font_size"),
            "font_size_ratio": metrics.get("font_size_ratio"),
        },
        "spacing": {
            "scale_px": spacing[:12],
            "spacing_consistency_score": _spacing_consistency(spacing),
        },
        "shape": {
            "border_radius_px": radii[:12],
            "shadow_levels": shadow_count,
        },
        "layout": {
            "grid_detected": "grid" in html.lower(),
            "viewport_fill_ratio": metrics.get("viewport_fill_ratio"),
            "visible_element_count": metrics.get("visible_element_count"),
        },
        "shadow_elevation_hints": shadow_count,
        "extraction_confidence": confidence,
        "source": "html_css_metrics" if html else "metrics_fallback",
    }


def run_ui_jepa_b0_baseline(
    config: UiJepaSmokeB0Config,
    *,
    encoder: VisionEncoder | None = None,
) -> UiJepaSmokeB0Result:
    start = time.perf_counter()
    dataset_dir = config.dataset_dir.expanduser().resolve()
    output_dir = config.output_dir.expanduser().resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    manifest = _read_jsonl(dataset_dir / "manifest.jsonl")
    pairs = _read_jsonl(dataset_dir / "pairs.jsonl")
    splits = _read_json(dataset_dir / "splits.json")
    tokens = _read_jsonl(dataset_dir / "design_tokens.jsonl")
    validation = build_ui_jepa_smoke_validation(dataset_dir)
    warnings: list[str] = []
    skipped_reasons: list[str] = []
    if encoder is None:
        encoder, backend_warning = _resolve_b0_encoder(config.backend, allow_dummy=config.allow_dummy)
        if backend_warning:
            warnings.append(backend_warning)
    if not encoder.is_real:
        warnings.append("B0 used the deterministic dummy encoder; this report is invalid for model-selection decisions.")

    image_paths = sorted({Path(str(record["screenshot_path"])) for record in manifest}, key=str)
    embeddings = encoder.encode(image_paths)
    if config.export_embeddings is not None:
        rows = []
        for record in sorted(manifest, key=lambda item: str(item["screen_id"])):
            vector = embeddings.get(str(record["screenshot_path"]))
            if vector is not None:
                rows.append({"screen_id": record["screen_id"], "model": encoder.backend, "embedding": vector})
        _write_jsonl(config.export_embeddings.expanduser().resolve(), rows)
    manifest_by_id = {record["screen_id"]: record for record in manifest}
    examples = _b0_examples(pairs, embeddings, manifest_by_id)
    head = _TinyMlpRanker(input_dim=len(examples[0]["features"]) if examples else 1, hidden_dim=config.hidden_dim, seed=config.seed)
    train_examples = [example for example in examples if _pair_split(example["pair"], splits) == "train"]
    if train_examples:
        head.fit(train_examples, epochs=config.epochs, learning_rate=config.learning_rate)
    else:
        skipped_reasons.append("no train pairs available")
    pair_scores = []
    split_summaries: dict[str, Any] = {}
    for split in SPLITS:
        split_examples = [example for example in examples if _pair_split(example["pair"], splits) == split]
        scored = _score_b0_examples(head, split_examples)
        pair_scores.extend(scored)
        split_summaries[split] = _summarize_b0_scores(scored, seed=config.seed)
    metrics_baseline = _run_metrics_baseline(manifest, pairs, splits, tokens, dataset_dir=dataset_dir, seed=config.seed)
    validity = _b0_validity(
        validation=validation,
        report_warnings=warnings,
        split_summaries=split_summaries,
        metrics_baseline=metrics_baseline,
        pair_count=len(pairs),
        encoder_is_real=encoder.is_real,
    )
    report = {
        "schema_version": "ui_jepa_b0_report_v1",
        "dataset_dir": str(dataset_dir),
        "dataset_counts": {
            "manifest": len(manifest),
            "regions": len(_read_jsonl(dataset_dir / "regions.jsonl")),
            "pairs": len(pairs),
        },
        "split_counts": {split: len(splits.get("screen_ids", {}).get(split, [])) for split in SPLITS},
        "pair_counts": {split: len([pair for pair in pairs if _pair_split(pair, splits) == split]) for split in SPLITS},
        "model_backend": encoder.backend,
        "model_name": encoder.model_name,
        "real_weights": encoder.is_real,
        "valid_for_model_selection": validity["valid"],
        "validity_checks": validity,
        "backend_status": {
            "requested_backend": config.backend,
            "resolved_backend": encoder.backend,
            "real_weights": encoder.is_real,
            "supported_real_backends": MODEL_ALIASES,
        },
        "splits": split_summaries,
        "baseline_accuracy": {
            split: split_summaries[split].get("best_constant_accuracy")
            for split in SPLITS
        },
        "metrics_baseline": metrics_baseline,
        "dummy_encoder": {
            "used": encoder.backend == "dummy",
            "valid_for_model_selection": False,
        },
        "warnings": warnings,
        "failed_or_skipped_reasons": skipped_reasons + validity["failed_conditions"],
        "command": " ".join(os.sys.argv),
        "git": _git_state(),
        "runtime_seconds": round(time.perf_counter() - start, 4),
        "validation": {
            "valid": validation["valid"],
            "errors": validation["errors"],
            "orientation_sanity": validation.get("orientation_sanity"),
        },
    }
    report_json_path = output_dir / "b0_report.json"
    report_md_path = output_dir / "b0_report.md"
    _write_json(report_json_path, report)
    _write_jsonl(output_dir / "pair_scores.jsonl", pair_scores)
    report_md_path.write_text(_b0_markdown(report), encoding="utf-8")
    return UiJepaSmokeB0Result(output_dir, report_json_path, report_md_path, report)


def check_ui_jepa_scaling_gate(
    dataset_dir: Path,
    b0_report: Path,
    m1_report: Path | None = None,
    m2_report: Path | None = None,
    m25_report: Path | None = None,
    m2_strong_report: Path | None = None,
    preference_critic_report: Path | None = None,
    closed_loop_report: Path | None = None,
) -> dict[str, Any]:
    dataset_dir = dataset_dir.expanduser().resolve()
    b0_report = b0_report.expanduser().resolve()
    m1_report = m1_report.expanduser().resolve() if m1_report is not None else None
    m2_report = m2_report.expanduser().resolve() if m2_report is not None else None
    m25_report = m25_report.expanduser().resolve() if m25_report is not None else None
    m2_strong_report = _resolve_m2_strong_gate_report(m2_strong_report, m2_report, m25_report)
    preference_critic_report = preference_critic_report.expanduser().resolve() if preference_critic_report is not None else None
    closed_loop_report = closed_loop_report.expanduser().resolve() if closed_loop_report is not None else None
    errors: list[str] = []
    m2_errors: list[str] = []
    dom_errors: list[str] = []
    critic_errors: list[str] = []
    loop_errors: list[str] = []
    validation = build_ui_jepa_smoke_validation(dataset_dir)
    if not validation["valid"]:
        errors.append("canonical smoke dataset validation failed")
    if not (validation.get("orientation_sanity") or {}).get("valid"):
        errors.append("pair orientation sanity failed; rerun: uv run ui-jepa-smoke-build --source examples/local_v1 --out data/processed/ui_jepa_v0_smoke --seed 42")
    if validation.get("pair_count", 0) < SMOKE_TOTAL_PAIR_THRESHOLD:
        errors.append(f"smoke pair count is below {SMOKE_TOTAL_PAIR_THRESHOLD}; rerun: uv run ui-jepa-smoke-build --source examples/local_v1 --out data/processed/ui_jepa_v0_smoke --seed 42")
    if not b0_report.is_file():
        errors.append(f"B0 report is missing: {b0_report}")
        report = {}
    else:
        report = json.loads(b0_report.read_text(encoding="utf-8"))
    if report and not report.get("real_weights"):
        errors.append("B0 report does not use a real frozen vision encoder")
    if report and not report.get("valid_for_model_selection"):
        failed = ", ".join(report.get("validity_checks", {}).get("failed_conditions", [])) or "unknown"
        errors.append(f"B0 report is not valid for model selection: {failed}")
    if report and not report.get("metrics_baseline", {}).get("available"):
        errors.append("B0 report is missing the metrics-only baseline")
    if report:
        val_lift = ((report.get("splits") or {}).get("val") or {}).get("lift_over_best_constant")
        if not isinstance(val_lift, int | float) or val_lift <= 0:
            errors.append("B0 validation lift over best constant baseline is not positive")
    if not (dataset_dir / "regions.jsonl").is_file() or validation.get("region_count", 0) == 0:
        errors.append("semantic regions are missing or empty")
    if not (dataset_dir / "summary.json").is_file():
        errors.append("dataset summary with padded normalization metadata is missing")
    m1 = {}
    if m1_report is None:
        m2_errors.append("M1 report is missing; pass --m1-report reports/ui_jepa_v0_smoke/m1_report.json")
    elif not m1_report.is_file():
        m2_errors.append(f"M1 report is missing: {m1_report}")
    else:
        m1 = json.loads(m1_report.read_text(encoding="utf-8"))
        if not m1.get("valid_m1_baseline"):
            m2_errors.append("M1 report is not a valid trained baseline")
        if not (m1.get("collapse_diagnostics") or {}).get("valid"):
            m2_errors.append("M1 embeddings are collapsed or collapse diagnostics are missing")
        if not (m1.get("probe") or {}).get("available"):
            m2_errors.append("M1 frozen probe report is missing")
        if not (m1.get("b0_comparison") or {}).get("available"):
            m2_errors.append("M1-vs-B0 comparison is missing")
    m2 = {}
    m2_strong = {}
    m2_strong_evidence = {"available": False}
    if m2_report is None:
        dom_errors.append("M2 report is missing; pass --m2-report reports/ui_jepa_v0_smoke/m2_report.json")
    elif not m2_report.is_file():
        dom_errors.append(f"M2 report is missing: {m2_report}")
    else:
        m2 = json.loads(m2_report.read_text(encoding="utf-8"))
        if not m2.get("valid_m2_baseline"):
            dom_errors.append("M2 report is not a valid semantic-region baseline")
        if not (m2.get("collapse_diagnostics") or {}).get("valid"):
            dom_errors.append("M2 embeddings are collapsed or collapse diagnostics are missing")
        if not (m2.get("probe") or {}).get("available"):
            dom_errors.append("M2 frozen probe report is missing")
        comparison = m2.get("comparison") or {}
        if not comparison.get("valid"):
            dom_errors.append("M2 comparison against M1/B0/metrics is missing or invalid")
    if m2_strong_report is not None:
        m2_strong = json.loads(m2_strong_report.read_text(encoding="utf-8"))
        m2_strong_evidence = _m2_strong_gate_evidence(m2_strong_report, m2_strong)
        if not m2_strong_evidence["valid"]:
            dom_errors.append(f"M2 strong report is present but not valid evidence: {m2_strong_report}")
    m25 = {}
    if m25_report is None:
        dom_errors.append("M2.5 diagnostics report is missing; pass --m25-report reports/ui_jepa_v0_smoke/m25_diagnostics_report.json")
    elif not m25_report.is_file():
        dom_errors.append(f"M2.5 diagnostics report is missing: {m25_report}")
    else:
        m25 = json.loads(m25_report.read_text(encoding="utf-8"))
        if not m25.get("useful_representation_signal"):
            dom_errors.append("M2.5 did not find useful representation signal; do not start DOM-aware JEPA from non-collapse alone")
        if not m25.get("dom_aware_recommended"):
            dom_errors.append(f"M2.5 recommendation does not support DOM-aware JEPA: {m25.get('recommended_decision')}")
    critic = {}
    if preference_critic_report is None:
        pass
    elif not preference_critic_report.is_file():
        critic_errors.append(f"preference critic report is missing: {preference_critic_report}")
    else:
        critic = json.loads(preference_critic_report.read_text(encoding="utf-8"))
        if not critic.get("valid"):
            critic_errors.append("preference critic report is not valid")
        if not critic.get("critique_json_examples"):
            critic_errors.append("preference critic report has no critique JSON examples")
        hard = ((critic.get("hard_subset_metrics") or {}).get("hard_test") or {})
        baseline = ((critic.get("full_test_metrics") or {}).get("best_constant_accuracy"))
        hard_acc = hard.get("pairwise_accuracy")
        if not hard.get("available"):
            critic_errors.append("preference critic hard-subset evaluation is missing")
        elif not (isinstance(hard_acc, int | float) and isinstance(baseline, int | float) and hard_acc >= baseline + 0.02):
            critic_errors.append("preference critic hard-subset lift is below the closed-loop margin")
        if not _issue_heads_have_signal_or_skip_reasons(critic.get("issue_heads") or {}):
            critic_errors.append("preference critic issue heads need non-trivial signal or explicit skipped reasons")
    loop = {}
    closed_loop_easy_passed = False
    closed_loop_mixed_passed = False
    closed_loop_hard_passed = False
    closed_loop_non_oracle_ready = False
    manual_review_ready = False
    pr_review_ready = False
    if closed_loop_report is None:
        pass
    elif not closed_loop_report.is_file():
        loop_errors.append(f"closed-loop report is missing: {closed_loop_report}")
    else:
        loop = json.loads(closed_loop_report.read_text(encoding="utf-8"))
        if not loop.get("valid"):
            loop_errors.append("closed-loop report is not valid")
        if not loop.get("passed_closed_loop_gate"):
            loop_errors.append("closed-loop report did not pass the local non-oracle closed-loop gate")
        noop = loop.get("noop_baseline") or {}
        if noop.get("false_improvement_detected"):
            loop_errors.append("closed-loop no-op baseline falsely improved")
        patch_mode = str(loop.get("patch_mode") or "")
        if patch_mode == "oracle_patch":
            loop_errors.append("oracle_patch is upper-bound evidence only and cannot pass the non-oracle closed-loop gate")
        if not loop.get("passed_closed_loop_gate_uses_non_oracle_only", False):
            loop_errors.append("closed-loop gate must be based on non-oracle evidence only")
        easy = ((loop.get("difficulty_breakdown") or {}).get("easy") or {})
        easy_success = easy.get("success_rate")
        non_oracle_rate = loop.get("deterministic_non_oracle_success_rate")
        if patch_mode == "manual_patch_import":
            non_oracle_rate = loop.get("manual_patch_success_rate")
        if non_oracle_rate is None and patch_mode in {"deterministic_patch", "manual_patch"}:
            non_oracle_rate = loop.get("success_rate")
        if patch_mode in {"deterministic_patch", "manual_patch", "manual_patch_import"}:
            if not isinstance(non_oracle_rate, int | float):
                loop_errors.append("closed-loop non-oracle success rate is missing")
        elif patch_mode not in {"instruction_only"}:
            loop_errors.append(f"closed-loop patch mode is unsupported for gate pass: {patch_mode}")
        if float(loop.get("accessibility_regression_rate_non_oracle", loop.get("accessibility_regression_rate") or 0.0) or 0.0) > 0.1:
            loop_errors.append("closed-loop accessibility regression rate is above 0.10")
        if float(loop.get("responsive_regression_rate_non_oracle", loop.get("responsive_regression_rate") or 0.0) or 0.0) > 0.1:
            loop_errors.append("closed-loop responsive regression rate is above 0.10")
        set_name = str(loop.get("set_name") or Path(str(loop.get("dataset_dir") or "")).name)
        gate_passed = bool(loop.get("passed_closed_loop_gate")) and not (loop.get("noop_baseline") or {}).get("false_improvement_detected")
        closed_loop_easy_passed = gate_passed and (set_name == "loop_easy_20" or bool(easy_success and float(easy_success) >= 0.5))
        closed_loop_mixed_passed = gate_passed and set_name == "loop_mixed_50"
        closed_loop_hard_passed = gate_passed and set_name == "loop_hard_100"
        closed_loop_non_oracle_ready = gate_passed and patch_mode in {"deterministic_patch", "manual_patch", "manual_patch_import"} and patch_mode != "oracle_patch"
        manual_review = loop.get("manual_review") or {}
        manual_review_ready = bool(manual_review.get("labels_available") and manual_review.get("matched_label_count", 0) > 0)
        companion_reports = _closed_loop_companion_reports(closed_loop_report, loop)
        closed_loop_easy_passed = closed_loop_easy_passed or any(_closed_loop_report_passes_set(report, "loop_easy_20") for report in companion_reports)
        closed_loop_mixed_passed = closed_loop_mixed_passed or any(_closed_loop_report_passes_set(report, "loop_mixed_50") for report in companion_reports)
        closed_loop_hard_passed = closed_loop_hard_passed or any(_closed_loop_report_passes_set(report, "loop_hard_100") for report in companion_reports)
        closed_loop_non_oracle_ready = closed_loop_non_oracle_ready or any(_closed_loop_report_non_oracle_ready(report) for report in companion_reports)
        manual_review_ready = manual_review_ready or any(_closed_loop_report_manual_review_ready(report) for report in companion_reports)
        pr_review_ready = closed_loop_non_oracle_ready and (closed_loop_mixed_passed or closed_loop_hard_passed) and manual_review_ready
    closed_loop_ready = preference_critic_report is not None and not errors and not m2_errors and not critic_errors
    closed_loop_passed = closed_loop_report is not None and closed_loop_ready and not loop_errors
    dom_aware_ready = (
        not errors
        and not m2_errors
        and not dom_errors
        and closed_loop_passed
        and bool(critic.get("valid"))
        and (
            "localization" in str((loop.get("recommended_next_stage") or "")).lower()
            or "dom" in str((critic.get("decisions") or {}).get("recommended_next_stage", "")).lower()
        )
    )
    return {
        "schema_version": "ui_jepa_scaling_gate_v1",
        "allowed": dom_aware_ready,
        "errors": errors + m2_errors + dom_errors + critic_errors + loop_errors,
        "phase_0_5_allowed": not errors,
        "m2_ready": not errors and not m2_errors,
        "dom_aware_ready": dom_aware_ready,
        "closed_loop_ready": closed_loop_ready,
        "closed_loop_passed": closed_loop_passed,
        "closed_loop_easy_passed": closed_loop_easy_passed,
        "closed_loop_mixed_passed": closed_loop_mixed_passed,
        "closed_loop_hard_passed": closed_loop_hard_passed,
        "closed_loop_non_oracle_ready": closed_loop_non_oracle_ready,
        "manual_review_ready": manual_review_ready,
        "pr_review_ready": pr_review_ready,
        "m1_report": str(m1_report) if m1_report is not None else None,
        "m2_report": str(m2_report) if m2_report is not None else None,
        "m2_strong_report": str(m2_strong_report) if m2_strong_report is not None else None,
        "m2_strong_evidence": m2_strong_evidence,
        "m25_report": str(m25_report) if m25_report is not None else None,
        "preference_critic_report": str(preference_critic_report) if preference_critic_report is not None else None,
        "closed_loop_report": str(closed_loop_report) if closed_loop_report is not None else None,
        "preference_critic_ready": preference_critic_report is not None and not critic_errors,
        "closed_loop_gate_errors": loop_errors,
        "next_command": (
            "uv run ui-loop-build data/processed/ui_jepa_v0_smoke --out data/processed/ui_loop_v0 --set loop_mixed_50 && "
            "uv run ui-loop-run data/processed/ui_loop_v0/loop_mixed_50 --out reports/ui_loop_v0_mixed_deterministic --patch-mode deterministic_patch"
            if closed_loop_ready and closed_loop_report is None
            else (
            "uv run ui-preference-dataset-build data/processed/ui_jepa_v0_smoke --out data/processed/ui_preference_v0 && "
            "uv run ui-preference-critic-eval data/processed/ui_preference_v0 --report-out reports/ui_jepa_v0_smoke/preference_critic_report.json"
            if not errors and not m2_errors and not dom_errors and critic_errors
            else (
            "uv run ui-jepa-m25-ablation "
            f"{dataset_dir} --out checkpoints/ui_jepa_m25 --report-out reports/ui_jepa_v0_smoke/m25_diagnostics_report.json "
            "--b0-report reports/ui_jepa_v0_smoke/b0_report.json --m1-report reports/ui_jepa_v0_smoke/m1_report.json "
            "--m2-report reports/ui_jepa_v0_smoke/m2_report.json --device cuda"
            if not errors and not m2_errors and (m25_report is None or not m25_report.is_file())
            else (
            "Do not start DOM-aware JEPA; harden dataset labels or add a preference-aligned objective, then rerun ui-jepa-m25-ablation."
            if not errors and not m2_errors and dom_errors
            else (
            "uv run ui-jepa-m2-train "
            f"{dataset_dir} --out checkpoints/ui_jepa_m2 --report-out reports/ui_jepa_v0_smoke/m2_report.json "
            "--b0-report reports/ui_jepa_v0_smoke/b0_report.json --m1-report reports/ui_jepa_v0_smoke/m1_report.json"
            if not errors and not m2_errors
            else (
            "uv run ui-jepa-m1-train "
            f"{dataset_dir} --out checkpoints/ui_jepa_m1 --report-out reports/ui_jepa_v0_smoke/m1_report.json "
            "--b0-report reports/ui_jepa_v0_smoke/b0_report.json"
            if not errors
            else "uv run ui-jepa-smoke-b0 "
            f"{dataset_dir} --out reports/ui_jepa_v0_smoke --backend dinov2"
            )
            )
            )
            )
            )
        ),
        "blocked_stages": (
            ["M1_random_mask_jepa", "M2_semantic_mask_jepa", "preference_critic", "closed_loop_frontend_eval", "DOM_aware_jepa"]
            if errors
            else (
                ["M2_semantic_mask_jepa", "preference_critic", "closed_loop_frontend_eval", "DOM_aware_jepa"]
                if m2_errors
                else (
                    (["closed_loop_frontend_eval"] if critic_errors or (preference_critic_report is not None and not closed_loop_passed) else [])
                    + (["DOM_aware_jepa"] if not dom_aware_ready else [])
                )
            )
        ),
        "recommendation": _scale_gate_recommendation(m2, m25, m2_strong_evidence, critic, loop),
    }


def _resolve_m2_strong_gate_report(
    explicit_report: Path | None,
    m2_report: Path | None,
    m25_report: Path | None,
) -> Path | None:
    candidates = []
    if explicit_report is not None:
        candidates.append(explicit_report.expanduser())
    if m2_report is not None:
        candidates.append(m2_report.parent / "m2_strong_report.json")
    if m25_report is not None:
        candidates.append(m25_report.parent / "m2_strong_report.json")
    for candidate in candidates:
        if candidate.is_file():
            return candidate.resolve()
    return None


def _m2_strong_gate_evidence(path: Path, report: dict[str, Any]) -> dict[str, Any]:
    model_config = report.get("model_config") or {}
    command = str((report.get("commands") or {}).get("train") or "")
    test_accuracy = ((((report.get("probe") or {}).get("splits") or {}).get("test") or {}).get("pairwise_accuracy"))
    valid = bool(
        report.get("valid_m2_baseline")
        and (report.get("collapse_diagnostics") or {}).get("valid")
        and (report.get("probe") or {}).get("available")
        and (report.get("comparison") or {}).get("valid")
    )
    return {
        "available": True,
        "report_path": str(path),
        "valid": valid,
        "manual_external": True,
        "collapse_valid": (report.get("collapse_diagnostics") or {}).get("valid"),
        "test_accuracy": test_accuracy,
        "near_chance": isinstance(test_accuracy, int | float) and abs(float(test_accuracy) - 0.5) <= 0.03,
        "metrics_only_still_dominates": (report.get("comparison") or {}).get("metrics_only_still_dominates"),
        "config": {
            "image_size": model_config.get("image_size"),
            "embedding_dim": model_config.get("embedding_dim"),
            "epochs": _extract_cli_int(command, "--epochs"),
            "device": "cuda" if "--device cuda" in command else None,
        },
    }


def _closed_loop_companion_reports(primary_path: Path | None, primary_report: dict[str, Any]) -> list[dict[str, Any]]:
    reports = [primary_report] if primary_report else []
    if primary_path is None:
        return reports
    reports_root = primary_path.expanduser().resolve().parent.parent
    for name in (
        "ui_loop_v0_easy_deterministic",
        "ui_loop_v0_mixed_deterministic",
        "ui_loop_v0_hard_deterministic",
        "ui_loop_v0_mixed_manual_patch_import",
        "ui_loop_v0_hard_manual_patch_import",
    ):
        path = reports_root / name / "closed_loop_report.json"
        if not path.is_file() or path == primary_path:
            continue
        try:
            reports.append(json.loads(path.read_text(encoding="utf-8")))
        except (OSError, json.JSONDecodeError):
            continue
    return reports


def _closed_loop_report_passes_set(report: dict[str, Any], set_name: str) -> bool:
    report_set = str(report.get("set_name") or Path(str(report.get("dataset_dir") or "")).name)
    return bool(
        report_set == set_name
        and report.get("valid")
        and report.get("passed_closed_loop_gate")
        and report.get("passed_closed_loop_gate_uses_non_oracle_only")
        and _closed_loop_report_non_oracle_ready(report)
    )


def _closed_loop_report_non_oracle_ready(report: dict[str, Any]) -> bool:
    patch_mode = str(report.get("patch_mode") or "")
    return bool(
        patch_mode in {"deterministic_patch", "manual_patch", "manual_patch_import"}
        and patch_mode != "oracle_patch"
        and report.get("passed_closed_loop_gate")
        and not (report.get("noop_baseline") or {}).get("false_improvement_detected")
        and float(report.get("accessibility_regression_rate_non_oracle", report.get("accessibility_regression_rate") or 0.0) or 0.0) <= 0.1
        and float(report.get("responsive_regression_rate_non_oracle", report.get("responsive_regression_rate") or 0.0) or 0.0) <= 0.1
    )


def _closed_loop_report_manual_review_ready(report: dict[str, Any]) -> bool:
    manual_review = report.get("manual_review") or {}
    return bool(manual_review.get("labels_available") and manual_review.get("matched_label_count", 0) > 0)


def _extract_cli_int(command: str, flag: str) -> int | None:
    parts = command.split()
    try:
        index = parts.index(flag)
    except ValueError:
        return None
    if index + 1 >= len(parts):
        return None
    try:
        return int(parts[index + 1])
    except ValueError:
        return None


def _issue_heads_have_signal_or_skip_reasons(issue_heads: dict[str, Any]) -> bool:
    if not issue_heads:
        return False
    for issue, result in issue_heads.items():
        if result.get("available"):
            test = ((result.get("splits") or {}).get("test") or {})
            if isinstance(test.get("f1"), int | float) and float(test["f1"]) > 0.0:
                continue
            return False
        if not result.get("skipped_reason"):
            return False
    return True


def _scale_gate_recommendation(
    m2_report: dict[str, Any],
    m25_report: dict[str, Any] | None = None,
    m2_strong_evidence: dict[str, Any] | None = None,
    preference_critic_report: dict[str, Any] | None = None,
    closed_loop_report: dict[str, Any] | None = None,
) -> str:
    if not m2_report:
        return "Train and validate M2 before starting DOM-aware JEPA."
    if not m2_report.get("valid_m2_baseline"):
        return "Fix M2 collapse, masking, or frozen-probe validity before DOM-aware JEPA."
    if not m25_report:
        return "Run M2.5 diagnostics and a stronger controlled M2 attempt before DOM-aware JEPA."
    if preference_critic_report and preference_critic_report.get("valid"):
        decision = (preference_critic_report.get("decisions") or {}).get("recommended_next_stage") or preference_critic_report.get("recommended_next_stage")
        if closed_loop_report and closed_loop_report.get("valid"):
            loop_decision = closed_loop_report.get("recommended_next_stage")
            if not closed_loop_report.get("passed_closed_loop_gate"):
                return f"Closed-loop report exists but did not pass; keep DOM-aware JEPA blocked and follow next stage: {loop_decision}."
            return f"Closed-loop report passed synthetic/local non-oracle evaluation; keep DOM-aware JEPA blocked unless localization is the measured bottleneck. Require manual review labels before real PR review. Next stage: {loop_decision}."
        if not preference_critic_report.get("jepa_features_add_value"):
            return f"Preference critic is valid but JEPA features do not add value; keep DOM-aware JEPA blocked and follow next stage: {decision}."
        return f"Preference critic is valid and reports JEPA feature value; DOM-aware still requires concrete DOM-need evidence before implementation. Next stage: {decision}."
    if (
        m2_strong_evidence
        and m2_strong_evidence.get("valid")
        and m2_strong_evidence.get("near_chance")
        and not m25_report.get("dom_aware_recommended")
    ):
        return (
            "Manual strong M2 evidence is valid and non-collapsed but remains near chance "
            f"(test accuracy {m2_strong_evidence.get('test_accuracy')}); metrics-only still dominates, "
            "so DOM-aware JEPA stays blocked. Next step: preference-aligned critic/dataset hardening."
        )
    if not m25_report.get("useful_representation_signal"):
        return "M2.5 remains near chance on representation diagnostics; harden dataset labels or change the objective before DOM-aware JEPA."
    if not m25_report.get("dom_aware_recommended"):
        return f"M2.5 found some signal but recommends {m25_report.get('recommended_decision')}; do not start DOM-aware JEPA yet."
    test_accuracy = (((m2_report.get("probe") or {}).get("splits") or {}).get("test") or {}).get("pairwise_accuracy")
    if isinstance(test_accuracy, int | float) and abs(float(test_accuracy) - 0.5) <= 0.03:
        return "M2 is near chance but M2.5 found useful signal; continue only with the M2.5-supported next stage."
    return "M2 is valid for comparison; DOM-aware JEPA may proceed only with the same split and baseline controls."


class DummyVisionEncoder:
    backend = "dummy"
    model_name = "deterministic-image-statistics"
    is_real = False

    def encode(self, image_paths: list[Path]) -> dict[str, list[float]]:
        return {str(path): _normalize_vector(_dummy_image_features(path)) for path in image_paths}


class OfflineHuggingFaceVisionEncoder:
    is_real = True

    def __init__(self, backend: str) -> None:
        self.backend = backend
        self.model_name = MODEL_ALIASES[backend]
        if importlib.util.find_spec("torch") is None or importlib.util.find_spec("transformers") is None:
            raise RuntimeError("torch and transformers are required for real B0 backends")
        import torch
        import transformers

        self._torch = torch
        self._device = "cuda" if torch.cuda.is_available() else "cpu"
        self._processor = transformers.AutoImageProcessor.from_pretrained(self.model_name, local_files_only=True)
        self._model = transformers.AutoModel.from_pretrained(self.model_name, local_files_only=True).to(self._device)
        self._model.eval()

    def encode(self, image_paths: list[Path]) -> dict[str, list[float]]:
        embeddings: dict[str, list[float]] = {}
        for path in image_paths:
            with Image.open(path) as image:
                inputs = self._processor(images=[image.convert("RGB")], return_tensors="pt")
            inputs = {key: value.to(self._device) if hasattr(value, "to") else value for key, value in inputs.items()}
            with self._torch.no_grad():
                if self.backend == "siglip" and hasattr(self._model, "get_image_features"):
                    output = self._model.get_image_features(**inputs)
                else:
                    output = self._model(**inputs)
                tensor = _extract_tensor(output)
            embeddings[str(path)] = _normalize_vector(tensor.detach().cpu().float().reshape(-1).tolist())
        return embeddings


class _TinyMlpRanker:
    def __init__(self, *, input_dim: int, hidden_dim: int, seed: int) -> None:
        rng = random.Random(seed)
        self.w1 = [[rng.uniform(-0.05, 0.05) for _ in range(input_dim)] for _ in range(hidden_dim)]
        self.b1 = [0.0 for _ in range(hidden_dim)]
        self.w2 = [rng.uniform(-0.05, 0.05) for _ in range(hidden_dim)]
        self.b2 = 0.0

    def predict(self, features: list[float]) -> float:
        hidden = [math.tanh(sum(w * x for w, x in zip(row, features, strict=True)) + bias) for row, bias in zip(self.w1, self.b1, strict=True)]
        logit = sum(w * h for w, h in zip(self.w2, hidden, strict=True)) + self.b2
        return 1.0 / (1.0 + math.exp(-max(-40.0, min(40.0, logit))))

    def fit(self, examples: list[dict[str, Any]], *, epochs: int, learning_rate: float) -> None:
        for _ in range(max(0, epochs)):
            for example in sorted(examples, key=lambda item: item["pair"]["pair_id"]):
                x = example["features"]
                y = float(example["target"])
                hidden_raw = [sum(w * value for w, value in zip(row, x, strict=True)) + bias for row, bias in zip(self.w1, self.b1, strict=True)]
                hidden = [math.tanh(value) for value in hidden_raw]
                logit = sum(w * h for w, h in zip(self.w2, hidden, strict=True)) + self.b2
                pred = 1.0 / (1.0 + math.exp(-max(-40.0, min(40.0, logit))))
                dlogit = pred - y
                old_w2 = self.w2[:]
                for i, h in enumerate(hidden):
                    self.w2[i] -= learning_rate * dlogit * h
                self.b2 -= learning_rate * dlogit
                for i, row in enumerate(self.w1):
                    dh = dlogit * old_w2[i] * (1 - hidden[i] * hidden[i])
                    for j, value in enumerate(x):
                        row[j] -= learning_rate * dh * value
                    self.b1[i] -= learning_rate * dh


def _build_local_corruption_dataset(*, source_dir: Path | None, stage_dir: Path, seed: int, limit: int | None) -> Path:
    if source_dir is None:
        raise ValueError("source_dir is required")
    from codepawl_jitter import JitterConfig, generate_jitter_pair_files
    from codepawl_renderer import RenderConfig, render_html_file
    from pawlbench_design.evaluator import EvalConfig, evaluate_jitter_pairs

    source_dir = source_dir.expanduser().resolve()
    html_paths = sorted(source_dir.rglob("*.html"))
    if limit is not None:
        html_paths = html_paths[:limit]
    dataset_dir = stage_dir / "_local_corruptions"
    samples_dir = dataset_dir / "samples"
    samples_dir.mkdir(parents=True)
    samples = []
    for html_path in html_paths:
        sample_id = _slug(html_path.stem)
        sample_dir = samples_dir / sample_id
        sample_dir.mkdir(parents=True, exist_ok=True)
        variants = []
        for seed_index in range(SOURCE_JITTER_SEED_COUNT):
            variant_seed = seed + seed_index
            seed_dir = sample_dir / f"_seed_{seed_index:02d}"
            jitter = generate_jitter_pair_files(JitterConfig(input_path=html_path, output_dir=seed_dir, seed=variant_seed, public_output_dir=seed_dir))
            render_html_file(RenderConfig(input_path=jitter.original_html_path, output_dir=jitter.original_dir))
            if seed_index == 0:
                shutil.copytree(jitter.original_dir, sample_dir / "original", dirs_exist_ok=True)
            for variant in jitter.variants:
                render_html_file(RenderConfig(input_path=variant.html_path, output_dir=variant.html_path.parent))
                variant_name = f"{variant.variant_name}_seed{seed_index:02d}"
                variant_dir = sample_dir / "jittered" / variant_name
                shutil.copytree(variant.html_path.parent, variant_dir, dirs_exist_ok=True)
                variants.append(
                    {
                        "variant_name": variant_name,
                        "base_variant_name": variant.variant_name,
                        "defect_type": variant.defect_type,
                        "severity": variant.severity,
                        "corruption_seed": variant_seed,
                        "seed_index": seed_index,
                        "html_path": str(variant_dir / "index.html"),
                        "screenshot_path": str(variant_dir / "screenshot.png"),
                        "dom_path": str(variant_dir / "dom.json"),
                        "accessibility_path": str(variant_dir / "accessibility.json"),
                        "metrics_path": str(variant_dir / "metrics.json"),
                        "expected_issue": variant.expected_issue,
                        "expected_fix_instruction": variant.expected_fix_instruction,
                    }
                )
        _write_json(sample_dir / "labels.json", {"variants": variants})
        evaluate_jitter_pairs(EvalConfig(input_dir=sample_dir, output_dir=sample_dir / "eval"))
        samples.append(
            {
                "sample_id": sample_id,
                "source_path": str(html_path),
                "output_dir": str(sample_dir),
                "labels_path": str(sample_dir / "labels.json"),
                "status": "ok",
                "variants": variants,
            }
        )
    _write_json(
        dataset_dir / "dataset.json",
        {
            "dataset_id": "ui_jepa_v0_smoke_source",
            "source_dir": str(source_dir),
            "output_dir": str(dataset_dir),
            "seed": seed,
            "generated_at": _stable_created_at(seed),
            "sample_count": len(samples),
            "variant_count": sum(len(sample["variants"]) for sample in samples),
            "failed_count": 0,
            "samples": samples,
        },
    )
    return dataset_dir


def _canonical_records_from_local_dataset(
    source_dataset_dir: Path,
    *,
    public_root: Path,
    stage_root: Path,
    seed: int,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    dataset = _read_json(source_dataset_dir / "dataset.json")
    samples_root = stage_root / "samples"
    samples_root.mkdir(exist_ok=True)
    manifest: list[dict[str, Any]] = []
    pairs: list[dict[str, Any]] = []
    for sample in dataset.get("samples", []):
        if sample.get("status") != "ok":
            continue
        sample_id = str(sample["sample_id"])
        source_sample_dir = _sample_dir(source_dataset_dir, sample)
        target_sample_dir = samples_root / sample_id
        shutil.copytree(source_sample_dir, target_sample_dir, dirs_exist_ok=True)
        original_dir = target_sample_dir / "original"
        original_screen_id = f"{sample_id}__original"
        manifest.append(
            _manifest_record(
                screen_id=original_screen_id,
                source="beautiful_ui_v0",
                source_path=target_sample_dir / "original" / "index.html",
                artifact_dir=original_dir,
                public_artifact_dir=public_root / "samples" / sample_id / "original",
                template_id=sample_id,
                is_corrupted=False,
                parent_screen_id=None,
                seed=seed,
            )
        )
        original_metrics = _read_json(original_dir / "metrics.json")
        variants = sample.get("variants") or json.loads((target_sample_dir / "labels.json").read_text(encoding="utf-8")).get("variants", [])
        variant_infos: list[dict[str, Any]] = []
        for variant in variants:
            variant_name = str(variant["variant_name"])
            variant_dir = target_sample_dir / "jittered" / variant_name
            variant_screen_id = f"{sample_id}__{variant_name}"
            defect_type = str(variant.get("defect_type") or variant_name.replace("_bad", "").split("_seed")[0])
            metrics = _read_json(variant_dir / "metrics.json")
            severity = _variant_severity(original_metrics, metrics)
            manifest.append(
                _manifest_record(
                    screen_id=variant_screen_id,
                    source="local_corruption",
                    source_path=variant_dir / "index.html",
                    artifact_dir=variant_dir,
                    public_artifact_dir=public_root / "samples" / sample_id / "jittered" / variant_name,
                    template_id=sample_id,
                    is_corrupted=True,
                    parent_screen_id=original_screen_id,
                    seed=seed,
                )
            )
            variant_infos.append(
                {
                    "screen_id": variant_screen_id,
                    "variant_name": variant_name,
                    "base_variant_name": str(variant.get("base_variant_name") or variant_name),
                    "defect_type": defect_type,
                    "seed_index": variant.get("seed_index"),
                    "severity": severity,
                    "metrics": metrics,
                }
            )
        pairs.extend(_preference_pairs_for_sample(sample_id, original_screen_id, variant_infos, seed=seed))
    return manifest, sorted(pairs, key=lambda pair: pair["pair_id"])


def _preference_pairs_for_sample(
    sample_id: str,
    original_screen_id: str,
    variants: list[dict[str, Any]],
    *,
    seed: int,
) -> list[dict[str, Any]]:
    pairs: list[dict[str, Any]] = []
    for variant in sorted(variants, key=lambda item: item["variant_name"]):
        pairs.append(
            _canonical_pair(
                pair_id=f"{sample_id}__original_vs_{variant['variant_name']}",
                preferred_screen_id=original_screen_id,
                rejected_screen_id=variant["screen_id"],
                split_group=sample_id,
                pair_family="original_vs_corrupted",
                corruption_type=variant["defect_type"],
                severity=variant["severity"],
                difficulty=_difficulty_for_severity(float(variant["severity"])),
                label_source="synthetic_original_preferred",
                issue_labels=[variant["defect_type"]],
                confidence=0.82,
                seed=seed,
                rationale="Original local UI is preferred over a deterministic corrupted render.",
            )
        )

    by_defect: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for variant in variants:
        by_defect[str(variant["defect_type"])].append(variant)
    for defect_type, defect_variants in sorted(by_defect.items()):
        for left, right in combinations(sorted(defect_variants, key=lambda item: item["variant_name"]), 2):
            preferred, rejected, gap = _prefer_lower_severity(left, right)
            if gap < 0.015:
                continue
            family = "low_severity_vs_high_severity" if gap >= 0.04 else "variant_vs_variant_same_corruption"
            pairs.append(
                _canonical_pair(
                    pair_id=f"{sample_id}__variant_vs_variant_same_corruption__{defect_type}__{left['variant_name']}__vs__{right['variant_name']}",
                    preferred_screen_id=preferred["screen_id"],
                    rejected_screen_id=rejected["screen_id"],
                    split_group=sample_id,
                    pair_family=family,
                    corruption_type=defect_type,
                    severity=max(float(left["severity"]), float(right["severity"])),
                    difficulty="hard" if gap < 0.04 else "medium",
                    label_source="metric_rule_lower_corruption_severity",
                    issue_labels=[defect_type],
                    confidence=0.62 if gap < 0.12 else 0.72,
                    seed=seed,
                    rationale="Lower metric-derived corruption severity is preferred for variants of the same corruption type.",
                )
            )

    mixed_candidates: list[tuple[str, dict[str, Any], dict[str, Any], float]] = []
    for left, right in combinations(sorted(variants, key=lambda item: item["variant_name"]), 2):
        if left["defect_type"] == right["defect_type"]:
            continue
        preferred, rejected, gap = _prefer_lower_severity(left, right)
        if gap < 0.025:
            continue
        key = _stable_hash(f"{sample_id}|mixed|{left['variant_name']}|{right['variant_name']}|{seed}")
        mixed_candidates.append((key, preferred, rejected, gap))
    mixed_limit = 24 if len(variants) > 8 else len(mixed_candidates)
    for _, preferred, rejected, gap in sorted(mixed_candidates, key=lambda item: item[0])[:mixed_limit]:
        corruption_type = "_vs_".join(sorted([str(preferred["defect_type"]), str(rejected["defect_type"])]))
        pairs.append(
            _canonical_pair(
                pair_id=(
                    f"{sample_id}__variant_vs_variant_mixed_corruption__"
                    f"{preferred['variant_name']}__vs__{rejected['variant_name']}"
                ),
                preferred_screen_id=preferred["screen_id"],
                rejected_screen_id=rejected["screen_id"],
                split_group=sample_id,
                pair_family="variant_vs_variant_mixed_corruption",
                corruption_type=corruption_type,
                severity=max(float(preferred["severity"]), float(rejected["severity"])),
                difficulty="hard" if gap < 0.12 else "medium",
                label_source="metric_rule_lower_corruption_severity",
                issue_labels=sorted({str(preferred["defect_type"]), str(rejected["defect_type"])}),
                confidence=0.6 if gap < 0.12 else 0.7,
                seed=seed,
                rationale="Lower metric-derived corruption severity is preferred across deterministic corrupted variants.",
            )
        )
    return pairs


def _canonical_pair(
    *,
    pair_id: str,
    preferred_screen_id: str,
    rejected_screen_id: str,
    split_group: str,
    pair_family: str,
    corruption_type: str,
    severity: float,
    difficulty: str,
    label_source: str,
    issue_labels: list[str],
    confidence: float,
    seed: int,
    rationale: str,
) -> dict[str, Any]:
    return {
        "schema_version": PAIR_SCHEMA_VERSION,
        "pair_id": pair_id,
        "left_screen_id": preferred_screen_id,
        "right_screen_id": rejected_screen_id,
        "preferred_screen_id": preferred_screen_id,
        "left_is_preferred": True,
        "orientation_seed": _orientation_seed(pair_id, seed),
        "pair_family": pair_family,
        "difficulty": difficulty,
        "label_source": label_source,
        "corruption_type": corruption_type,
        "severity": round(float(severity), 4),
        "split_group": split_group,
        "issue_labels": issue_labels,
        "confidence": confidence,
        "label_rationale": rationale,
    }


def _orient_pairs_by_split(pairs: list[dict[str, Any]], splits: dict[str, Any], *, seed: int) -> list[dict[str, Any]]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for pair in pairs:
        grouped[_pair_split(pair, splits)].append(dict(pair))
    oriented: list[dict[str, Any]] = []
    for split in SPLITS:
        split_pairs = sorted(grouped.get(split, []), key=lambda pair: _stable_hash(f"{pair['pair_id']}|{seed}|{split}"))
        for index, pair in enumerate(split_pairs):
            preferred = str(pair["preferred_screen_id"])
            other = pair["right_screen_id"] if pair["left_screen_id"] == preferred else pair["left_screen_id"]
            left_is_preferred = index % 2 == 0
            pair["left_screen_id"] = preferred if left_is_preferred else other
            pair["right_screen_id"] = other if left_is_preferred else preferred
            pair["left_is_preferred"] = left_is_preferred
            pair["orientation_seed"] = _orientation_seed(str(pair["pair_id"]), seed)
            oriented.append(pair)
    return sorted(oriented, key=lambda pair: pair["pair_id"])


def _prefer_lower_severity(left: dict[str, Any], right: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any], float]:
    left_severity = float(left["severity"])
    right_severity = float(right["severity"])
    if left_severity <= right_severity:
        return left, right, abs(right_severity - left_severity)
    return right, left, abs(left_severity - right_severity)


def _variant_severity(original_metrics: dict[str, Any], variant_metrics: dict[str, Any]) -> float:
    original_contrast = _as_float(original_metrics.get("min_contrast_ratio")) or 0.0
    variant_contrast = _as_float(variant_metrics.get("min_contrast_ratio")) or original_contrast
    original_font_ratio = _as_float(original_metrics.get("font_size_ratio")) or 0.0
    variant_font_ratio = _as_float(variant_metrics.get("font_size_ratio")) or original_font_ratio
    original_fill = _as_float(original_metrics.get("viewport_fill_ratio")) or 0.0
    variant_fill = _as_float(variant_metrics.get("viewport_fill_ratio")) or original_fill
    original_visible = _as_float(original_metrics.get("visible_element_count")) or 0.0
    variant_visible = _as_float(variant_metrics.get("visible_element_count")) or original_visible
    score = 0.05
    score += max(0.0, (_as_float(variant_metrics.get("contrast_issue_count")) or 0.0) - (_as_float(original_metrics.get("contrast_issue_count")) or 0.0)) * 0.04
    score += max(0.0, original_contrast - variant_contrast) * 0.035
    score += abs(variant_font_ratio - original_font_ratio) * 0.055
    score += max(0.0, (_as_float(variant_metrics.get("hierarchy_warning_count")) or 0.0) - (_as_float(original_metrics.get("hierarchy_warning_count")) or 0.0)) * 0.1
    score += abs(variant_fill - original_fill) * 0.12
    score += abs(variant_visible - original_visible) * 0.01
    if variant_metrics.get("has_horizontal_overflow") and not original_metrics.get("has_horizontal_overflow"):
        score += 0.18
    if variant_metrics.get("has_vertical_overflow") and not original_metrics.get("has_vertical_overflow"):
        score += 0.08
    median_original = _as_float(original_metrics.get("median_element_area"))
    median_variant = _as_float(variant_metrics.get("median_element_area"))
    if median_original and median_variant:
        score += min(abs(median_variant - median_original) / max(median_original, 1.0), 2.0) * 0.12
    return max(0.05, min(0.95, round(score, 4)))


def _difficulty_for_severity(severity: float) -> str:
    if severity < 0.2:
        return "hard"
    if severity < 0.45:
        return "medium"
    return "easy"


def _orientation_seed(pair_id: str, seed: int) -> int:
    return int(_stable_hash(f"{seed}|{pair_id}")[:12], 16)


def _stable_hash(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _manifest_record(
    *,
    screen_id: str,
    source: str,
    source_path: Path,
    artifact_dir: Path,
    public_artifact_dir: Path,
    template_id: str,
    is_corrupted: bool,
    parent_screen_id: str | None,
    seed: int,
) -> dict[str, Any]:
    screenshot = artifact_dir / "screenshot.png"
    metrics = _read_json(artifact_dir / "metrics.json")
    with Image.open(screenshot) as image:
        width, height = image.size
    return {
        "schema_version": MANIFEST_SCHEMA_VERSION,
        "screen_id": screen_id,
        "sample_id": screen_id,
        "source": source,
        "source_dataset": source,
        "source_path": str(public_artifact_dir / "index.html"),
        "screenshot_path": str(public_artifact_dir / "screenshot.png"),
        "dom_path": str(public_artifact_dir / "dom.json"),
        "accessibility_path": str(public_artifact_dir / "accessibility.json"),
        "accessibility_tree_path": str(public_artifact_dir / "accessibility.json"),
        "metrics_path": str(public_artifact_dir / "metrics.json"),
        "width": width,
        "height": height,
        "viewport": {
            "width": int(metrics.get("viewport_width") or width),
            "height": int(metrics.get("viewport_height") or height),
            "dpr": 1.0,
        },
        "viewport_width": int(metrics.get("viewport_width") or width),
        "viewport_height": int(metrics.get("viewport_height") or height),
        "template_id": template_id,
        "split_group": template_id,
        "split_group_id": template_id,
        "domain_or_app_id": "local:beautiful_ui_v0",
        "render_hash": _sha256_file(screenshot),
        "created_at": _stable_created_at(seed),
        "is_synthetic": False,
        "is_corrupted": is_corrupted,
        "parent_screen_id": parent_screen_id,
        "quality_filter_score": _quality_filter_score(metrics),
    }


def _stage_path_record(record: dict[str, Any], *, public_root: Path, stage_root: Path) -> dict[str, Any]:
    public_prefix = str(public_root)
    stage_prefix = str(stage_root)

    def rewrite(value: Any) -> Any:
        if isinstance(value, str):
            return value.replace(public_prefix, stage_prefix)
        if isinstance(value, dict):
            return {key: rewrite(item) for key, item in value.items()}
        if isinstance(value, list):
            return [rewrite(item) for item in value]
        return value

    return rewrite(record)


def _write_smoke_outputs(
    *,
    stage_dir: Path,
    output_dir: Path,
    manifest: list[dict[str, Any]],
    regions: list[dict[str, Any]],
    pairs: list[dict[str, Any]],
    splits: dict[str, Any],
    design_tokens: list[dict[str, Any]],
    seed: int,
    canvas_size: int,
    patch_size: int,
) -> dict[str, Any]:
    _write_jsonl(stage_dir / "manifest.jsonl", manifest)
    _write_jsonl(stage_dir / "regions.jsonl", regions)
    _write_jsonl(stage_dir / "pairs.jsonl", pairs)
    _write_jsonl(stage_dir / "design_tokens.jsonl", design_tokens)
    _write_json(stage_dir / "splits.json", splits)
    summary = {
        "schema_version": SCHEMA_VERSION,
        "dataset_id": "ui_jepa_v0_smoke",
        "seed": seed,
        "created_at": _stable_created_at(seed),
        "manifest_count": len(manifest),
        "region_count": len(regions),
        "pair_count": len(pairs),
        "design_token_count": len(design_tokens),
        "normalization": {
            "schema_version": "ui_jepa_padded_normalization_v1",
            "canvas_size": canvas_size,
            "patch_size": patch_size,
            "preserve_aspect_ratio": True,
        },
        "outputs": {
            "manifest": str(output_dir / "manifest.jsonl"),
            "regions": str(output_dir / "regions.jsonl"),
            "pairs": str(output_dir / "pairs.jsonl"),
            "splits": str(output_dir / "splits.json"),
            "design_tokens": str(output_dir / "design_tokens.jsonl"),
        },
    }
    _write_json(stage_dir / "summary.json", summary)
    (stage_dir / "dataset_card.md").write_text(_dataset_card(summary, splits), encoding="utf-8")
    _maybe_write_parquet(stage_dir / "manifest.parquet", manifest)
    _maybe_write_parquet(stage_dir / "regions.parquet", regions)
    _maybe_write_parquet(stage_dir / "pairs.parquet", pairs)
    return summary


def _stable_splits(manifest: list[dict[str, Any]], *, seed: int) -> dict[str, Any]:
    groups = sorted({str(record["split_group"]) for record in manifest})
    shuffled = groups[:]
    random.Random(seed).shuffle(shuffled)
    train_count = int(len(shuffled) * 0.8)
    val_count = int(len(shuffled) * 0.1)
    if len(shuffled) >= 3:
        train_count = max(1, train_count)
        val_count = max(1, val_count)
    split_groups = {
        "train": sorted(shuffled[:train_count] or shuffled[:1]),
        "val": sorted(shuffled[train_count : train_count + val_count]),
        "test": sorted(shuffled[train_count + val_count :]),
    }
    assigned = {group: split for split, values in split_groups.items() for group in values}
    return {
        "schema_version": "ui_jepa_v0_smoke_splits_v1",
        "seed": seed,
        "split_groups": split_groups,
        "screen_ids": {
            split: sorted(record["screen_id"] for record in manifest if assigned.get(str(record["split_group"])) == split)
            for split in SPLITS
        },
        "pair_split_by_group": assigned,
        "leakage_check": {"valid": True, "message": "Each split_group appears in exactly one split."},
    }


def _walk_dom(node: dict[str, Any], depth: int = 0):
    yield node, depth
    for child in node.get("children", []) or []:
        if isinstance(child, dict):
            yield from _walk_dom(child, depth + 1)


def _classify_region(node: dict[str, Any], *, bbox: list[float], depth: int, screen_width: float, screen_height: float) -> tuple[str, float]:
    tag = str(node.get("tag_name") or "").lower()
    class_name = str(node.get("class") or "").lower()
    text = str(node.get("text_snippet") or "").lower()
    combined = f"{tag} {class_name} {text}"
    x1, y1, x2, y2 = bbox
    area_ratio = ((x2 - x1) * (y2 - y1)) / max(1.0, screen_width * screen_height)
    if tag in {"nav", "header"} or "navbar" in combined or "navigation" in combined:
        return "navbar", 0.85
    if tag == "footer" or y1 > screen_height * 0.75 and "footer" in combined:
        return "footer", 0.8
    if tag in {"aside"} or "sidebar" in combined:
        return "sidebar", 0.8
    if tag == "form" or any(word in combined for word in ("input", "email", "password", "submit")):
        return "form", 0.72
    if tag == "table" or "table" in combined:
        return "table", 0.75
    if any(word in combined for word in ("modal", "dialog")):
        return "modal", 0.72
    if tag in {"a", "button"} or any(word in combined for word in ("cta", "button", "start", "export", "save")):
        return "cta", 0.7
    if any(word in combined for word in ("card", "panel", "tile")):
        return "card", 0.68
    children = node.get("children", []) or []
    child_boxes = [_bbox_xyxy(child.get("bounding_box")) for child in children if isinstance(child, dict)]
    visible_children = [box for box in child_boxes if box is not None and (box[2] - box[0]) * (box[3] - box[1]) > 1000]
    if len(visible_children) >= 3 and area_ratio < 0.7:
        return "card_grid", 0.58
    if y1 <= screen_height * 0.35 and ("h1" in combined or (area_ratio > 0.12 and depth <= 4)):
        return "hero", 0.62
    if tag in {"main", "section", "article"} and 0.02 <= area_ratio <= 0.8:
        return "unknown", 0.35
    return "unknown", 0.2


def _dedupe_regions(candidates: list[dict[str, Any]]) -> list[dict[str, Any]]:
    ranked = sorted(candidates, key=lambda item: (-float(item["confidence"]), -float(item["area_ratio"]), item["region_type"]))
    selected: list[dict[str, Any]] = []
    for candidate in ranked:
        if any(_iou(candidate["bbox_xyxy"], existing["bbox_xyxy"]) > 0.88 for existing in selected):
            continue
        selected.append(candidate)
        if len(selected) >= 24:
            break
    return sorted(selected, key=lambda item: (item["bbox_xyxy"][1], item["bbox_xyxy"][0], item["region_type"]))


def _patch_ids_for_bbox(
    bbox: list[float],
    *,
    original_width: float,
    original_height: float,
    canvas_size: int,
    patch_size: int,
) -> list[int]:
    scale = min(canvas_size / original_width, canvas_size / original_height)
    resized_width = round(original_width * scale)
    resized_height = round(original_height * scale)
    pad_left = (canvas_size - resized_width) // 2
    pad_top = (canvas_size - resized_height) // 2
    x1, y1, x2, y2 = [value * scale for value in bbox]
    x1 += pad_left
    x2 += pad_left
    y1 += pad_top
    y2 += pad_top
    grid = canvas_size // patch_size
    min_col = max(0, int(math.floor(x1 / patch_size)))
    max_col = min(grid - 1, int(math.floor(max(x1, x2 - 1) / patch_size)))
    min_row = max(0, int(math.floor(y1 / patch_size)))
    max_row = min(grid - 1, int(math.floor(max(y1, y2 - 1) / patch_size)))
    return [row * grid + col for row in range(min_row, max_row + 1) for col in range(min_col, max_col + 1)]


def _b0_examples(
    pairs: list[dict[str, Any]],
    embeddings: dict[str, list[float]],
    manifest_by_id: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    examples = []
    for pair in pairs:
        left_path = str(manifest_by_id[pair["left_screen_id"]]["screenshot_path"])
        right_path = str(manifest_by_id[pair["right_screen_id"]]["screenshot_path"])
        left = embeddings[left_path]
        right = embeddings[right_path]
        features = left + right + [abs(a - b) for a, b in zip(left, right, strict=True)] + [a * b for a, b in zip(left, right, strict=True)]
        examples.append({"pair": pair, "features": features, "target": 1.0 if pair["preferred_screen_id"] == pair["left_screen_id"] else 0.0})
    return examples


def _score_b0_examples(head: _TinyMlpRanker, examples: list[dict[str, Any]]) -> list[dict[str, Any]]:
    scores = []
    for example in examples:
        probability_left = head.predict(example["features"])
        pair = example["pair"]
        predicted = pair["left_screen_id"] if probability_left >= 0.5 else pair["right_screen_id"]
        scores.append(
            {
                "pair_id": pair["pair_id"],
                "split_group": pair["split_group"],
                "pair_family": pair.get("pair_family"),
                "difficulty": pair.get("difficulty"),
                "corruption_type": pair["corruption_type"],
                "severity": pair.get("severity"),
                "left_screen_id": pair["left_screen_id"],
                "right_screen_id": pair["right_screen_id"],
                "preferred_screen_id": pair["preferred_screen_id"],
                "predicted_preferred_screen_id": predicted,
                "probability_left": probability_left,
                "correct": predicted == pair["preferred_screen_id"],
            }
        )
    return scores


def _summarize_b0_scores(scores: list[dict[str, Any]], *, seed: int) -> dict[str, Any]:
    if not scores:
        return {
            "pair_count": 0,
            "pairwise_accuracy": None,
            "always_left_accuracy": None,
            "always_right_accuracy": None,
            "random_accuracy": None,
            "best_constant_accuracy": None,
            "confidence_interval_95": None,
        }
    correct_count = sum(1 for score in scores if score["correct"])
    accuracy = correct_count / len(scores)
    always_left = sum(1 for score in scores if score["preferred_screen_id"] == score.get("left_screen_id")) / len(scores)
    always_right = 1.0 - always_left
    rng = random.Random(seed)
    random_correct = sum(rng.choice([True, False]) for _ in sorted(scores, key=lambda item: item["pair_id"])) / len(scores)
    interval = _wilson_score_interval(correct_count, len(scores))
    return {
        "pair_count": len(scores),
        "pairwise_accuracy": accuracy,
        "always_left_accuracy": always_left,
        "always_right_accuracy": always_right,
        "random_accuracy": random_correct,
        "best_constant_accuracy": max(always_left, always_right),
        "lift_over_best_constant": accuracy - max(always_left, always_right),
        "confidence_interval_95": interval,
        "confidence_interval_method": "wilson",
        "accuracy_by_pair_family": _accuracy_by(scores, "pair_family"),
        "accuracy_by_corruption_type": _accuracy_by(scores, "corruption_type"),
        "accuracy_by_difficulty": _accuracy_by(scores, "difficulty"),
        "accuracy_by_severity": _accuracy_by_severity(scores),
    }


def _run_metrics_baseline(
    manifest: list[dict[str, Any]],
    pairs: list[dict[str, Any]],
    splits: dict[str, Any],
    tokens: list[dict[str, Any]],
    *,
    dataset_dir: Path,
    seed: int,
) -> dict[str, Any]:
    token_by_id = {str(token.get("screen_id")): token for token in tokens}
    manifest_by_id = {str(record["screen_id"]): record for record in manifest}
    scores_by_screen: dict[str, float] = {}
    skipped: list[str] = []
    for screen_id, record in manifest_by_id.items():
        metrics_path = _resolve_path(dataset_dir, record.get("metrics_path"))
        if metrics_path is None or not metrics_path.is_file():
            skipped.append(screen_id)
            continue
        scores_by_screen[screen_id] = _metrics_quality_score(_read_json(metrics_path), token_by_id.get(screen_id, {}))
    scored_pairs: list[dict[str, Any]] = []
    for pair in pairs:
        left_score = scores_by_screen.get(str(pair["left_screen_id"]))
        right_score = scores_by_screen.get(str(pair["right_screen_id"]))
        if left_score is None or right_score is None:
            continue
        predicted = pair["left_screen_id"] if left_score >= right_score else pair["right_screen_id"]
        scored_pairs.append(
            {
                "pair_id": pair["pair_id"],
                "split_group": pair["split_group"],
                "pair_family": pair.get("pair_family"),
                "difficulty": pair.get("difficulty"),
                "corruption_type": pair["corruption_type"],
                "severity": pair.get("severity"),
                "left_screen_id": pair["left_screen_id"],
                "right_screen_id": pair["right_screen_id"],
                "preferred_screen_id": pair["preferred_screen_id"],
                "predicted_preferred_screen_id": predicted,
                "left_score": left_score,
                "right_score": right_score,
                "correct": predicted == pair["preferred_screen_id"],
            }
        )
    split_summaries = {
        split: _summarize_b0_scores([score for score in scored_pairs if _pair_split(score, splits) == split], seed=seed)
        for split in SPLITS
    }
    return {
        "schema_version": "ui_jepa_metrics_baseline_v1",
        "method": "deterministic_linear_ui_metrics_quality_score",
        "available": bool(scored_pairs),
        "skipped_screen_count": len(skipped),
        "scored_pair_count": len(scored_pairs),
        "splits": split_summaries,
    }


def _metrics_quality_score(metrics: dict[str, Any], tokens: dict[str, Any]) -> float:
    score = 1.0
    score -= min((_as_float(metrics.get("contrast_issue_count")) or 0.0) * 0.035, 0.35)
    min_contrast = _as_float(metrics.get("min_contrast_ratio"))
    if min_contrast is not None and min_contrast < 4.5:
        score -= min((4.5 - min_contrast) * 0.05, 0.25)
    font_ratio = _as_float(metrics.get("font_size_ratio"))
    if font_ratio is not None:
        score -= min(abs(font_ratio - 2.4) * 0.025, 0.18)
    score -= min((_as_float(metrics.get("hierarchy_warning_count")) or 0.0) * 0.06, 0.18)
    if metrics.get("has_horizontal_overflow"):
        score -= 0.2
    if metrics.get("has_vertical_overflow"):
        score -= 0.08
    spacing_score = ((tokens.get("spacing") or {}) if isinstance(tokens, dict) else {}).get("spacing_consistency_score")
    if isinstance(spacing_score, int | float):
        score += min(max(float(spacing_score), 0.0), 1.0) * 0.08
    shadow_levels = ((tokens.get("shape") or {}) if isinstance(tokens, dict) else {}).get("shadow_levels")
    if isinstance(shadow_levels, int | float) and shadow_levels > 8:
        score -= 0.04
    return round(max(0.0, min(1.0, score)), 6)


def _b0_validity(
    *,
    validation: dict[str, Any],
    report_warnings: list[str],
    split_summaries: dict[str, Any],
    metrics_baseline: dict[str, Any],
    pair_count: int,
    encoder_is_real: bool,
) -> dict[str, Any]:
    checks = {
        "dataset_validation": bool(validation.get("valid")),
        "orientation_sanity": bool((validation.get("orientation_sanity") or {}).get("valid")),
        "confidence_intervals_valid": _confidence_intervals_valid(split_summaries),
        "pair_count_threshold": pair_count >= SMOKE_TOTAL_PAIR_THRESHOLD,
        "val_pair_threshold": (split_summaries.get("val") or {}).get("pair_count", 0) >= SMOKE_EVAL_PAIR_THRESHOLD,
        "test_pair_threshold": (split_summaries.get("test") or {}).get("pair_count", 0) >= SMOKE_EVAL_PAIR_THRESHOLD,
        "best_constant_below_threshold": all(
            summary.get("best_constant_accuracy") is not None and summary.get("best_constant_accuracy") <= BEST_CONSTANT_THRESHOLD
            for summary in split_summaries.values()
            if summary.get("pair_count", 0) >= 20
        ),
        "real_frozen_weights": encoder_is_real,
        "positive_lift_over_constant": (split_summaries.get("val") or {}).get("lift_over_best_constant", 0.0) > 0.0,
        "metrics_baseline_present": bool(metrics_baseline.get("available")),
        "no_severe_leakage_warnings": not any("orientation-leaked" in warning or "leakage" in warning for warning in report_warnings),
    }
    failed = [name for name, passed in checks.items() if not passed]
    return {
        "valid": not failed,
        "checks": checks,
        "failed_conditions": failed,
        "thresholds": {
            "best_constant_accuracy": BEST_CONSTANT_THRESHOLD,
            "total_pairs": SMOKE_TOTAL_PAIR_THRESHOLD,
            "val_pairs": SMOKE_EVAL_PAIR_THRESHOLD,
            "test_pairs": SMOKE_EVAL_PAIR_THRESHOLD,
        },
    }


def _confidence_intervals_valid(split_summaries: dict[str, Any]) -> bool:
    for summary in split_summaries.values():
        pair_count = summary.get("pair_count") or 0
        interval = summary.get("confidence_interval_95")
        accuracy = summary.get("pairwise_accuracy")
        if pair_count <= 0:
            continue
        if not isinstance(interval, list) or len(interval) != 2:
            return False
        if accuracy is None or not (0.0 <= interval[0] <= accuracy <= interval[1] <= 1.0):
            return False
        if pair_count < 500 and accuracy in {0.0, 1.0} and interval[0] == interval[1]:
            return False
    return True


def _wilson_score_interval(k: int, n: int, z: float = 1.959963984540054) -> list[float] | None:
    if n <= 0:
        return None
    p = k / n
    denominator = 1 + z * z / n
    center = (p + z * z / (2 * n)) / denominator
    margin = z * math.sqrt((p * (1 - p) + z * z / (4 * n)) / n) / denominator
    return [max(0.0, center - margin), min(1.0, center + margin)]


def _resolve_b0_encoder(backend: str, *, allow_dummy: bool) -> tuple[VisionEncoder, str | None]:
    requested = "dinov2" if backend == "auto" else backend
    if requested == "dummy":
        return DummyVisionEncoder(), None
    if requested not in MODEL_ALIASES:
        raise ValueError(f"unsupported B0 backend: {backend}")
    try:
        return OfflineHuggingFaceVisionEncoder(requested), None
    except Exception as exc:
        if not allow_dummy:
            raise
        return DummyVisionEncoder(), f"{requested} weights are unavailable offline: {exc}"


def _extract_tensor(output: Any) -> Any:
    for name in ("image_embeds", "pooler_output", "last_hidden_state"):
        value = getattr(output, name, None)
        if value is not None and hasattr(value, "detach"):
            if name == "last_hidden_state" and len(value.shape) == 3:
                return value[:, 0, :]
            return value
    if hasattr(output, "__getitem__"):
        value = output[0]
        if hasattr(value, "detach"):
            return value
    raise ValueError("could not extract image embedding tensor")


def _dummy_image_features(path: Path) -> list[float]:
    with Image.open(path) as image:
        image = image.convert("RGB").resize((8, 8), Image.Resampling.BILINEAR)
        if hasattr(image, "get_flattened_data"):
            pixels = list(image.get_flattened_data())
        else:
            pixels = list(image.getdata())
    channels = [[pixel[index] / 255.0 for pixel in pixels] for index in range(3)]
    means = [sum(channel) / len(channel) for channel in channels]
    variances = [sum((value - means[index]) ** 2 for value in channel) / len(channel) for index, channel in enumerate(channels)]
    grayscale = [sum(pixel) / (3 * 255.0) for pixel in pixels]
    return means + variances + grayscale


def _pair_split(pair: dict[str, Any], splits: dict[str, Any]) -> str:
    group = str(pair.get("split_group"))
    for split, groups in splits.get("split_groups", {}).items():
        if group in groups:
            return split
    return "train"


def _b0_markdown(report: dict[str, Any]) -> str:
    lines = [
        "# UI-JEPA v0 Smoke B0 Report",
        "",
        f"- Backend: {report['model_backend']} ({report['model_name']})",
        f"- Real weights: {report['real_weights']}",
        f"- Valid for model selection: {report['valid_for_model_selection']}",
        f"- Pair count: {report['dataset_counts']['pairs']}",
        "",
        "## Split Accuracy",
        "",
    ]
    for split, summary in report["splits"].items():
        lines.append(f"- {split}: {summary.get('pairwise_accuracy')} ({summary.get('pair_count')} pairs)")
    lines.extend(["", "## Warnings", ""])
    warnings = report.get("warnings") or []
    lines.extend(f"- {warning}" for warning in warnings) if warnings else lines.append("- None")
    lines.append("")
    return "\n".join(lines)


def _dataset_card(summary: dict[str, Any], splits: dict[str, Any]) -> str:
    return "\n".join(
        [
            "# UI-JEPA v0 Smoke Dataset",
            "",
            "This is a local smoke/evaluation harness built from self-authored examples and deterministic corruptions. It is not a research-scale UI-JEPA corpus and should not be used to claim model quality.",
            "",
            f"- Screens: {summary['manifest_count']}",
            f"- Regions: {summary['region_count']}",
            f"- Pairs: {summary['pair_count']}",
            f"- Design token records: {summary['design_token_count']}",
            f"- Normalization: aspect-preserving padded {summary['normalization']['canvas_size']}x{summary['normalization']['canvas_size']}",
            "",
            "## Splits",
            "",
            *(f"- {split}: {len(splits['screen_ids'][split])} screens" for split in SPLITS),
            "",
        ]
    )


def _bbox_xyxy(box: Any) -> list[float] | None:
    if not isinstance(box, dict):
        return None
    x = _as_float(box.get("x"))
    y = _as_float(box.get("y"))
    width = _as_float(box.get("width"))
    height = _as_float(box.get("height"))
    if x is None or y is None or width is None or height is None or width <= 0 or height <= 0:
        return None
    return [x, y, x + width, y + height]


def _clip_bbox(bbox: list[float], width: float, height: float) -> list[float]:
    x1, y1, x2, y2 = bbox
    return [max(0.0, min(width, x1)), max(0.0, min(height, y1)), max(0.0, min(width, x2)), max(0.0, min(height, y2))]


def _valid_bbox(bbox: Any, width: float, height: float) -> bool:
    if not isinstance(bbox, list) or len(bbox) != 4:
        return False
    x1, y1, x2, y2 = [_as_float(value) for value in bbox]
    if None in {x1, y1, x2, y2}:
        return False
    return 0 <= x1 < x2 <= width and 0 <= y1 < y2 <= height


def _text_density(node: dict[str, Any], area: float) -> float:
    text = str(node.get("text_snippet") or "")
    return round(len(text) / max(area, 1.0), 6)


def _interactive_density(node: dict[str, Any], area: float) -> float:
    count = sum(1 for child, _ in _walk_dom(node) if str(child.get("tag_name") or "").lower() in {"a", "button", "input", "select", "textarea"})
    return round(count / max(area / 10000.0, 1.0), 6)


def _iou(left: list[float], right: list[float]) -> float:
    x1 = max(left[0], right[0])
    y1 = max(left[1], right[1])
    x2 = min(left[2], right[2])
    y2 = min(left[3], right[3])
    intersection = max(0.0, x2 - x1) * max(0.0, y2 - y1)
    left_area = max(0.0, left[2] - left[0]) * max(0.0, left[3] - left[1])
    right_area = max(0.0, right[2] - right[0]) * max(0.0, right[3] - right[1])
    union = left_area + right_area - intersection
    return intersection / union if union else 0.0


def _find_css_values(text: str, pattern: str) -> list[str]:
    import re

    return re.findall(pattern, text)


def _find_css_numbers(text: str, pattern: str) -> list[str]:
    import re

    return re.findall(pattern, text)


def _spacing_consistency(values: list[float]) -> float | None:
    if not values:
        return None
    rounded = [round(value / 4) * 4 for value in values if value > 0]
    if not rounded:
        return None
    return round(Counter(rounded).most_common(1)[0][1] / len(rounded), 4)


def _sample_dir(input_dir: Path, sample: dict[str, Any]) -> Path:
    output_dir = sample.get("output_dir")
    if isinstance(output_dir, str) and output_dir:
        path = Path(output_dir)
        return path.resolve() if path.is_absolute() else (input_dir / path).resolve()
    return input_dir / "samples" / str(sample.get("sample_id", ""))


def _resolve_path(base_dir: Path, raw: Any) -> Path | None:
    if not isinstance(raw, str) or not raw:
        return None
    path = Path(raw).expanduser()
    return path.resolve() if path.is_absolute() else (base_dir / path).resolve()


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(65536), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _quality_filter_score(metrics: dict[str, Any]) -> float:
    score = 1.0
    if metrics.get("has_horizontal_overflow"):
        score -= 0.25
    if float(metrics.get("contrast_issue_count") or 0) > 0:
        score -= 0.15
    return max(0.0, round(score, 4))


def _severity_to_float(value: Any) -> float:
    if isinstance(value, int | float):
        return float(value)
    return {"subtle": 0.25, "medium": 0.5, "visible": 0.5, "high": 0.75, "obvious": 0.85}.get(str(value), 0.5)


def _stable_created_at(seed: int) -> str:
    return datetime.fromtimestamp(max(seed, 0), tz=timezone.utc).isoformat().replace("+00:00", "Z")


def _slug(value: str) -> str:
    chars: list[str] = []
    previous_dash = False
    for char in value.lower():
        if char.isalnum() or char == "_":
            chars.append(char)
            previous_dash = False
        elif not previous_dash:
            chars.append("-")
            previous_dash = True
    return "".join(chars).strip("-") or "sample"


def _replace_output_dir(stage_dir: Path, output_dir: Path) -> None:
    if not output_dir.exists():
        os.replace(stage_dir, output_dir)
        return
    backup_dir = Path(tempfile.mkdtemp(dir=output_dir.parent, prefix=f".{output_dir.name}.backup."))
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


def _maybe_write_parquet(path: Path, records: list[dict[str, Any]]) -> None:
    if not records or importlib.util.find_spec("pandas") is None or importlib.util.find_spec("pyarrow") is None:
        return
    import pandas as pd

    pd.DataFrame(records).to_parquet(path)


def _read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def _read_json_required(path: Path, errors: list[str]) -> Any:
    if not path.is_file():
        errors.append(f"missing JSON file: {path}")
        return {}
    try:
        return _read_json(path)
    except json.JSONDecodeError as exc:
        errors.append(f"invalid JSON file {path}: {exc}")
        return {}


def _read_jsonl(path: Path) -> list[dict[str, Any]]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def _read_jsonl_required(path: Path, errors: list[str]) -> list[dict[str, Any]]:
    if not path.is_file():
        errors.append(f"missing JSONL file: {path}")
        return []
    try:
        return _read_jsonl(path)
    except json.JSONDecodeError as exc:
        errors.append(f"invalid JSONL file {path}: {exc}")
        return []


def _write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def _write_jsonl(path: Path, records: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("".join(json.dumps(record, sort_keys=True) + "\n" for record in records), encoding="utf-8")


def _as_float(value: Any) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _normalize_vector(vector: list[float]) -> list[float]:
    norm = math.sqrt(sum(float(value) * float(value) for value in vector))
    return [float(value) / norm for value in vector] if norm else [0.0 for value in vector]


def _accuracy_by(scores: list[dict[str, Any]], key: str) -> dict[str, float]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for score in scores:
        grouped[str(score.get(key))].append(score)
    return {name: sum(1 for score in rows if score["correct"]) / len(rows) for name, rows in sorted(grouped.items()) if rows}


def _accuracy_by_severity(scores: list[dict[str, Any]]) -> dict[str, float]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for score in scores:
        severity = _as_float(score.get("severity")) or 0.0
        if severity < 0.2:
            bucket = "subtle"
        elif severity < 0.45:
            bucket = "visible"
        else:
            bucket = "obvious"
        grouped[bucket].append(score)
    return {name: sum(1 for score in rows if score["correct"]) / len(rows) for name, rows in sorted(grouped.items()) if rows}


def _git_state() -> dict[str, Any]:
    try:
        commit = subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()
        dirty = bool(subprocess.check_output(["git", "status", "--porcelain"], text=True).strip())
        return {"commit": commit, "dirty": dirty}
    except Exception:
        return {"commit": None, "dirty": None}
