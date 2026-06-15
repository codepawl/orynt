"""Taste-calibrated label suggestion helpers for PawlBench Design."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml


TASTE_SUGGESTED_BY = "codepawl_taste_v0"
FACTOR_KEYS = (
    "readability",
    "spacing",
    "hierarchy",
    "alignment",
    "polish",
    "contrast_accessibility",
)


@dataclass(frozen=True)
class TasteProfile:
    profile_id: str
    taste_profile_version: int
    priority_order: tuple[str, ...]
    defect_weights: dict[str, str]
    raw: dict[str, Any]


def load_taste_profile(path: Path) -> TasteProfile:
    profile_path = path.expanduser().resolve()
    if not profile_path.is_file():
        raise ValueError(f"taste profile is missing: {profile_path}")
    payload = yaml.safe_load(profile_path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError("taste profile must be a YAML object")
    profile_id = str(payload.get("profile_id") or "")
    if not profile_id:
        raise ValueError("taste profile missing profile_id")
    priority_order = tuple(str(item) for item in payload.get("priority_order", []))
    if not priority_order:
        raise ValueError("taste profile missing priority_order")
    return TasteProfile(
        profile_id=profile_id,
        taste_profile_version=int(payload.get("taste_profile_version", 0)),
        priority_order=priority_order,
        defect_weights=dict(payload.get("defect_weights", {})),
        raw=payload,
    )


def score_pair_with_taste(
    left_record: dict[str, Any],
    right_record: dict[str, Any],
    profile: TasteProfile,
) -> dict[str, Any]:
    left_factors = taste_decision_factors(left_record, profile)
    right_factors = taste_decision_factors(right_record, profile)
    left_penalty = weighted_score(left_factors, profile)
    right_penalty = weighted_score(right_factors, profile)
    gap = abs(left_penalty - right_penalty)
    if gap < 0.15 and left_factors == right_factors:
        preferred = "tie"
    else:
        preferred = "left" if left_penalty < right_penalty else "right"
    return {
        "preferred": preferred,
        "left_penalty": left_penalty,
        "right_penalty": right_penalty,
        "penalty_gap": gap,
        # Backward-compatible aliases. User-facing copy should use penalty names.
        "left_score": left_penalty,
        "right_score": right_penalty,
        "score_gap": gap,
        "left_factors": left_factors,
        "right_factors": right_factors,
        "decisive_factor": decisive_factor(left_factors, right_factors, profile),
    }


def suggest_label_with_taste(queue_record: dict[str, Any], profile: TasteProfile) -> dict[str, Any]:
    left_item = str(queue_record["left_item"])
    right_item = str(queue_record["right_item"])
    left_record = side_record(queue_record, "left")
    right_record = side_record(queue_record, "right")
    score = score_pair_with_taste(left_record, right_record, profile)
    preferred = score["preferred"]
    losing_record = losing_side_record(left_record, right_record, preferred)
    severity = severity_for_record(losing_record, score)
    defect_tags = defect_tags_for_record(losing_record)
    quality_tags = quality_tags_for_preferred(preferred, left_record, right_record)
    explanation = explain_taste_decision(queue_record, profile)
    confidence = confidence_for_score(score, severity)
    return {
        "label_id": queue_record["label_id"],
        "dataset_id": queue_record["dataset_id"],
        "split": queue_record["split"],
        "sample_id": queue_record["sample_id"],
        "variant_name": queue_record["variant_name"],
        "defect_type": queue_record["defect_type"],
        "left_item": left_item,
        "right_item": right_item,
        "preferred": preferred,
        "defect_tags": defect_tags,
        "quality_tags": quality_tags,
        "severity": severity,
        "fix_instruction": taste_fix_instruction(losing_record),
        "reason": explanation["summary"],
        "confidence": confidence,
        "labeler_id": TASTE_SUGGESTED_BY,
        "created_at": "1970-01-01T00:00:00Z",
        "suggested_by": TASTE_SUGGESTED_BY,
        "suggested_preferred": preferred,
        "suggested_severity": severity,
        "suggested_defect_tags": defect_tags,
        "suggestion_confidence": confidence,
        "review_status": "suggested",
        "reviewed_by": None,
        "reviewed_at": None,
        "taste_profile_id": profile.profile_id,
        "taste_profile_version": profile.taste_profile_version,
        "suggestion_reason_detail": explanation["detail"],
        "taste_decision_factors": {
            "left": score["left_factors"],
            "right": score["right_factors"],
            "left_penalty": score["left_penalty"],
            "right_penalty": score["right_penalty"],
            "decisive_factor": score["decisive_factor"],
            "priority_order": list(profile.priority_order),
        },
    } | optional_pair_fields(queue_record)


def explain_taste_decision(queue_record: dict[str, Any], profile: TasteProfile) -> dict[str, str]:
    left_record = side_record(queue_record, "left")
    right_record = side_record(queue_record, "right")
    score = score_pair_with_taste(left_record, right_record, profile)
    if score["preferred"] == "tie":
        summary = "Taste profile found both sides effectively indistinguishable."
    else:
        preferred_name = queue_record[f"{score['preferred']}_item"]
        decisive = score["decisive_factor"] or "overall taste score"
        summary = f"{score['preferred']} ({preferred_name}) is preferred on lower {decisive} penalty."
        rationale = taste_pair_rationale(left_record, right_record)
        if rationale:
            summary = f"{summary} {rationale}"
    detail_parts = [
        f"left_penalty={score['left_penalty']:.2f}",
        f"right_penalty={score['right_penalty']:.2f}",
        "lower penalty is better",
    ]
    detail_parts.extend(taste_detail_flags(left_record, right_record))
    detail_parts.append(f"priority={', '.join(profile.priority_order)}")
    detail = "; ".join(detail_parts)
    return {"summary": summary, "detail": detail}


def side_record(queue_record: dict[str, Any], side: str) -> dict[str, Any]:
    item = str(queue_record[f"{side}_item"])
    record = queue_record.get(item)
    if not isinstance(record, dict):
        record = queue_record.get(side)
    if not isinstance(record, dict):
        record = {}
    metrics = read_metrics(record.get("metrics_path"))
    if not metrics and isinstance(record.get("metrics"), dict):
        metrics = dict(record["metrics"])
    if not metrics and isinstance(queue_record.get("metric_deltas"), dict):
        metrics = dict(queue_record["metric_deltas"])
    defect_type = record.get("defect_type")
    if not defect_type:
        defect_type = queue_record.get("defect_type") if item == "variant" else "original"
    defect_tags = []
    if isinstance(record.get("defect_tags"), list):
        defect_tags.extend(record["defect_tags"])
    if isinstance(queue_record.get("defect_tags"), list):
        defect_tags.extend(queue_record["defect_tags"])
    return {
        **record,
        "item": item,
        "defect_type": defect_type,
        "metrics": metrics,
        "metric_deltas": queue_record.get("metric_deltas", {}),
        "defect_tags": defect_tags,
    }


def read_metrics(path_value: Any) -> dict[str, Any]:
    if not isinstance(path_value, str) or not path_value:
        return {}
    path = Path(path_value)
    if not path.is_file():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def taste_decision_factors(record: dict[str, Any], profile: TasteProfile) -> dict[str, float]:
    defect_type = str(record.get("defect_type", ""))
    item = str(record.get("item", ""))
    metrics = record.get("metrics") if isinstance(record.get("metrics"), dict) else {}
    deltas = record.get("metric_deltas") if isinstance(record.get("metric_deltas"), dict) else {}
    factors = {key: 0.0 for key in FACTOR_KEYS}
    if item == "original" or defect_type == "original":
        return factors

    if defect_type == "spacing":
        crowded = spacing_crowded(record)
        factors["spacing"] = 3.4 if crowded else 1.4
        factors["readability"] = 1.3 if crowded else 0.5
        factors["hierarchy"] = 0.8 if crowded else 0.3
        factors["polish"] = 1.0 if crowded else 0.5
    elif defect_type == "contrast":
        if readability_harmed(record):
            factors["readability"] = 5.0
            factors["contrast_accessibility"] = 3.2
        else:
            factors["readability"] = 0.35
            factors["contrast_accessibility"] = 1.4
    elif defect_type == "alignment":
        severity = alignment_severity(record)
        if severity == "severe":
            factors["alignment"] = 3.1
            factors["polish"] = 1.8
            factors["readability"] = 1.1
        elif severity == "mild":
            factors["alignment"] = 1.0
            factors["polish"] = 1.2
            factors["readability"] = 0.3
    elif defect_type == "hierarchy":
        severity = hierarchy_prominence_severity(record)
        if severity == "too_small_or_unclear":
            factors["hierarchy"] = 3.0
            factors["readability"] = 1.5
            factors["polish"] = 1.0
        elif severity == "weak_readable":
            factors["hierarchy"] = 0.9
            factors["readability"] = 0.35
            factors["polish"] = 0.8
        else:
            factors["hierarchy"] = 1.2
            factors["readability"] = 0.6
            factors["polish"] = 1.0
    else:
        tags = {str(tag) for tag in record.get("defect_tags", [])}
        if "generic_ai_slop" in tags or "generic_ai_slop" in defect_type:
            factors["polish"] = 3.0
            factors["readability"] = 1.0
        else:
            factors["polish"] = 0.8

    return factors


def weighted_score(factors: dict[str, float], profile: TasteProfile) -> float:
    priority = {name: len(profile.priority_order) - index for index, name in enumerate(profile.priority_order)}
    factor_to_priority = {
        "readability": "readability",
        "spacing": "spaciousness",
        "hierarchy": "hierarchy_clarity",
        "alignment": "alignment_correctness",
        "polish": "polish",
        "contrast_accessibility": "contrast_accessibility",
    }
    total = 0.0
    for factor, value in factors.items():
        priority_name = factor_to_priority.get(factor, factor)
        total += value * priority.get(priority_name, 1)
    return total


def contrast_materially_harms_readability(
    min_contrast: float | None,
    contrast_issues: float | None,
) -> bool:
    if contrast_issues is not None and contrast_issues >= 10:
        return True
    if min_contrast is not None and min_contrast < 1.35:
        return True
    return (
        min_contrast is not None
        and min_contrast < 1.8
        and contrast_issues is not None
        and contrast_issues >= 6
    )


def readability_harmed(record: dict[str, Any]) -> bool:
    if str(record.get("defect_type", "")) != "contrast":
        return False
    metrics = record.get("metrics") if isinstance(record.get("metrics"), dict) else {}
    deltas = record.get("metric_deltas") if isinstance(record.get("metric_deltas"), dict) else {}
    min_contrast = number(metrics.get("min_contrast_ratio"))
    contrast_issues = number(metrics.get("contrast_issue_count"), deltas.get("contrast_issue_delta"))
    if min_contrast is not None:
        if min_contrast < 1.35:
            return True
        if min_contrast <= 1.4 and contrast_issues is not None and contrast_issues >= 18:
            return True
        return False
    return contrast_issues is not None and contrast_issues >= 18


def contrast_is_weak_but_readable(record: dict[str, Any]) -> bool:
    if str(record.get("defect_type", "")) != "contrast":
        return False
    metrics = record.get("metrics") if isinstance(record.get("metrics"), dict) else {}
    deltas = record.get("metric_deltas") if isinstance(record.get("metric_deltas"), dict) else {}
    min_contrast = number(metrics.get("min_contrast_ratio"))
    contrast_issues = number(metrics.get("contrast_issue_count"), deltas.get("contrast_issue_delta"))
    if min_contrast is None and contrast_issues is None:
        return True
    return not readability_harmed(record)


def spacing_crowded(record: dict[str, Any]) -> bool:
    if str(record.get("defect_type", "")) != "spacing":
        return False
    metrics = record.get("metrics") if isinstance(record.get("metrics"), dict) else {}
    names = {
        str(record.get("item", "")),
        str(record.get("variant_name", "")),
        str(record.get("defect_type", "")),
    }
    if "spacing_bad" in names:
        return True
    average_area = number(metrics.get("average_element_area"))
    median_area = number(metrics.get("median_element_area"))
    visible_count = number(metrics.get("visible_element_count"))
    if visible_count is not None and visible_count >= 24 and median_area is not None and median_area < 12000:
        return True
    return average_area is not None and average_area < 90000 and visible_count is not None and visible_count >= 24


def alignment_is_clear_defect(record: dict[str, Any]) -> bool:
    return alignment_severity(record) == "severe"


def alignment_severity(record: dict[str, Any]) -> str:
    if str(record.get("defect_type", "")) != "alignment":
        return "none"
    metrics = record.get("metrics") if isinstance(record.get("metrics"), dict) else {}
    deltas = record.get("metric_deltas") if isinstance(record.get("metric_deltas"), dict) else {}
    changed_pixels = number(metrics.get("changed_pixel_ratio"), deltas.get("changed_pixel_ratio"))
    if changed_pixels is not None and changed_pixels >= 0.05:
        return "severe"
    tags = {str(tag) for tag in record.get("defect_tags", [])}
    names = {
        str(record.get("item", "")),
        str(record.get("variant_name", "")),
        str(record.get("defect_type", "")),
    }
    if not ("alignment" in tags or "alignment_bad" in names):
        return "none"
    html = read_optional_text(record.get("html_path"))
    if alignment_css_hits_layout(record, html):
        return "severe"
    return "mild"


def alignment_css_hits_layout(record: dict[str, Any], html: str) -> bool:
    if not html:
        return False
    impactful_classes = ("hero", "lede", "actions", "panel")
    if any(f'class="{class_name}"' in html or f" {class_name} " in html for class_name in impactful_classes):
        return True
    h1 = first_dom_node(record, "h1")
    if not h1:
        return False
    box = h1.get("bounding_box") if isinstance(h1.get("bounding_box"), dict) else {}
    width = number(box.get("width"))
    height = number(box.get("height"))
    return width is not None and height is not None and width >= 500 and height >= 40


def hierarchy_action_unclear(record: dict[str, Any]) -> bool:
    if str(record.get("defect_type", "")) != "hierarchy":
        return False
    metrics = record.get("metrics") if isinstance(record.get("metrics"), dict) else {}
    deltas = record.get("metric_deltas") if isinstance(record.get("metric_deltas"), dict) else {}
    tags = {str(tag) for tag in record.get("defect_tags", [])}
    explicit_values = (
        record.get("hierarchy_action_unclear"),
        record.get("cta_lost"),
        record.get("main_action_lost"),
        metrics.get("hierarchy_action_unclear"),
        metrics.get("cta_lost"),
        metrics.get("main_action_lost"),
    )
    if any(value is True for value in explicit_values):
        return True
    hierarchy_warnings = number(metrics.get("hierarchy_warning_count"), deltas.get("hierarchy_warning_delta"))
    cta_count = number(metrics.get("cta_like_element_count"))
    if hierarchy_warnings is not None and hierarchy_warnings >= 2:
        return True
    if cta_count is not None and cta_count <= 0:
        return True
    return bool(tags & {"action_unclear", "cta_lost", "main_action_lost"})


def hierarchy_is_weak_but_readable(record: dict[str, Any]) -> bool:
    return hierarchy_prominence_severity(record) == "weak_readable"


def hierarchy_prominence_severity(record: dict[str, Any]) -> str:
    if str(record.get("defect_type", "")) != "hierarchy":
        return "none"
    if hierarchy_action_unclear(record):
        return "too_small_or_unclear"
    metrics = record.get("metrics") if isinstance(record.get("metrics"), dict) else {}
    deltas = record.get("metric_deltas") if isinstance(record.get("metric_deltas"), dict) else {}
    min_contrast = number(metrics.get("min_contrast_ratio"))
    contrast_issues = number(metrics.get("contrast_issue_count"), deltas.get("contrast_issue_delta"))
    min_font_size = number(metrics.get("min_font_size"))
    cta_count = number(metrics.get("cta_like_element_count"))
    horizontal_overflow = metrics.get("has_horizontal_overflow")
    vertical_overflow = metrics.get("has_vertical_overflow")
    if contrast_materially_harms_readability(min_contrast, contrast_issues):
        return "too_small_or_unclear"
    if min_font_size is not None and min_font_size < 14:
        return "too_small_or_unclear"
    if cta_count is not None and cta_count <= 0:
        return "too_small_or_unclear"
    if horizontal_overflow is True or vertical_overflow is True:
        return "too_small_or_unclear"
    h1_box = dom_node_box(first_dom_node(record, "h1"))
    original_h1_box = dom_node_box(first_original_dom_node(record, "h1"))
    h1_height = number(h1_box.get("height"))
    original_h1_height = number(original_h1_box.get("height"))
    visible_count = number(metrics.get("visible_element_count"))
    dense_ui = visible_count is not None and visible_count >= 20
    if h1_height is not None and h1_height < 32 and dense_ui:
        return "too_small_or_unclear"
    if (
        h1_height is not None
        and original_h1_height is not None
        and original_h1_height >= 40
        and h1_height / original_h1_height < 0.75
        and dense_ui
    ):
        return "too_small_or_unclear"
    return "weak_readable"


def read_optional_text(path_value: Any) -> str:
    if not isinstance(path_value, str) or not path_value:
        return ""
    path = Path(path_value)
    if not path.is_file():
        return ""
    try:
        return path.read_text(encoding="utf-8")
    except OSError:
        return ""


def read_optional_json(path_value: Any) -> Any:
    if not isinstance(path_value, str) or not path_value:
        return None
    path = Path(path_value)
    if not path.is_file():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def first_dom_node(record: dict[str, Any], tag_name: str) -> dict[str, Any]:
    payload = read_optional_json(record.get("dom_path"))
    return first_dom_node_in_payload(payload, tag_name)


def first_original_dom_node(record: dict[str, Any], tag_name: str) -> dict[str, Any]:
    dom_path = record.get("dom_path")
    if not isinstance(dom_path, str) or "/jittered/" not in dom_path:
        return {}
    prefix, suffix = dom_path.split("/jittered/", 1)
    parts = suffix.split("/")
    if len(parts) < 2:
        return {}
    original_path = str(Path(prefix) / "original" / "/".join(parts[1:]))
    payload = read_optional_json(original_path)
    return first_dom_node_in_payload(payload, tag_name)


def first_dom_node_in_payload(payload: Any, tag_name: str) -> dict[str, Any]:
    if isinstance(payload, dict):
        if str(payload.get("tag_name", "")).lower() == tag_name:
            return payload
        children = payload.get("children")
        if isinstance(children, list):
            for child in children:
                match = first_dom_node_in_payload(child, tag_name)
                if match:
                    return match
    elif isinstance(payload, list):
        for item in payload:
            match = first_dom_node_in_payload(item, tag_name)
            if match:
                return match
    return {}


def dom_node_box(node: dict[str, Any]) -> dict[str, Any]:
    box = node.get("bounding_box") if isinstance(node, dict) else None
    return box if isinstance(box, dict) else {}


def has_alignment_vs_hierarchy_pair(left_record: dict[str, Any], right_record: dict[str, Any]) -> bool:
    defect_types = {str(left_record.get("defect_type", "")), str(right_record.get("defect_type", ""))}
    return defect_types == {"alignment", "hierarchy"}


def taste_pair_rationale(left_record: dict[str, Any], right_record: dict[str, Any]) -> str:
    records = (left_record, right_record)
    has_spacing = any(str(record.get("defect_type", "")) == "spacing" for record in records)
    has_readable_contrast = any(contrast_is_weak_but_readable(record) for record in records)
    if has_spacing and has_readable_contrast:
        return "Readable weak contrast is less harmful than crowded spacing that hurts visual comfort and scannability."
    if has_alignment_vs_hierarchy_pair(left_record, right_record):
        has_readable_hierarchy = any(hierarchy_is_weak_but_readable(record) for record in records)
        has_severe_alignment = any(alignment_severity(record) == "severe" for record in records)
        has_mild_alignment = any(alignment_severity(record) == "mild" for record in records)
        has_too_small_hierarchy = any(hierarchy_prominence_severity(record) == "too_small_or_unclear" for record in records)
        if has_too_small_hierarchy and has_mild_alignment:
            return "Hierarchy is too small or weak to scan, so mild alignment issues are preferable."
        if has_readable_hierarchy and has_severe_alignment:
            return "Readable weak hierarchy is less harmful than visible alignment discomfort from an off-grid layout."
    return ""


def taste_detail_flags(left_record: dict[str, Any], right_record: dict[str, Any]) -> list[str]:
    records = (left_record, right_record)
    flags = []
    if any(contrast_is_weak_but_readable(record) for record in records):
        flags.append("contrast_exception=weak_readable")
    if any(str(record.get("defect_type", "")) == "spacing" for record in records):
        flags.append("spacing_rationale=crowded_scanability")
    if has_alignment_vs_hierarchy_pair(left_record, right_record):
        if any(hierarchy_is_weak_but_readable(record) for record in records):
            flags.append("hierarchy_exception=weak_readable")
        if any(hierarchy_prominence_severity(record) == "too_small_or_unclear" for record in records):
            flags.append("hierarchy_rationale=too_small_or_unclear")
        if any(alignment_severity(record) == "severe" for record in records):
            flags.append("alignment_rationale=visible_off_grid_discomfort")
        if any(alignment_severity(record) == "mild" for record in records):
            flags.append("alignment_exception=mild_or_noop")
    return flags


def decisive_factor(
    left_factors: dict[str, float],
    right_factors: dict[str, float],
    profile: TasteProfile,
) -> str | None:
    aliases = {
        "readability": "readability",
        "spaciousness": "spacing",
        "hierarchy_clarity": "hierarchy",
        "alignment_correctness": "alignment",
        "polish": "polish",
        "contrast_accessibility": "contrast_accessibility",
    }
    for priority_name in profile.priority_order:
        factor = aliases.get(priority_name, priority_name)
        if abs(left_factors.get(factor, 0) - right_factors.get(factor, 0)) >= 0.5:
            return factor
    return None


def losing_side_record(
    left_record: dict[str, Any],
    right_record: dict[str, Any],
    preferred: str,
) -> dict[str, Any]:
    if preferred == "left":
        return right_record
    if preferred == "right":
        return left_record
    return left_record


def severity_for_record(record: dict[str, Any], score: dict[str, Any]) -> str:
    factors = taste_decision_factors(record, TasteProfile("", 0, FACTOR_KEYS, {}, {}))
    max_factor = max(factors.values()) if factors else 0
    if max_factor >= 3.0:
        return "high"
    if max_factor >= 1.2:
        return "medium"
    return "low"


def defect_tags_for_record(record: dict[str, Any]) -> list[str]:
    defect_type = str(record.get("defect_type", ""))
    mapping = {
        "contrast": ["contrast", "accessibility"],
        "spacing": ["spacing", "inconsistent_rhythm", "too_dense"],
        "alignment": ["alignment", "inconsistent_rhythm"],
        "hierarchy": ["hierarchy", "cta_weak"],
    }
    if "generic_ai_slop" in defect_type:
        return ["generic_ai_slop", "weak_brand_fit"]
    return mapping.get(defect_type, [defect_type] if defect_type else [])


def quality_tags_for_preferred(
    preferred: str,
    left_record: dict[str, Any],
    right_record: dict[str, Any],
) -> list[str]:
    if preferred == "tie":
        return ["practical"]
    winner = left_record if preferred == "left" else right_record
    defect_type = str(winner.get("defect_type", ""))
    if defect_type == "original":
        return ["readable", "good_spacing", "polished"]
    return ["practical"]


def taste_fix_instruction(record: dict[str, Any]) -> str:
    defect_type = str(record.get("defect_type", ""))
    if defect_type == "spacing":
        return "Restore breathing room so content feels calm, scannable, and comfortable."
    if defect_type == "contrast":
        return "Improve contrast only where readability is materially harmed."
    if defect_type == "alignment":
        return "Clean up alignment details enough for the UI to feel intentional and polished."
    if defect_type == "hierarchy":
        return "Clarify the primary action and most important content."
    return "Prefer the side that reads better and feels less generic."


def confidence_for_score(score: dict[str, Any], severity: str) -> int:
    if score["preferred"] == "tie":
        return 2
    if score["score_gap"] >= 4 or severity == "high":
        return 5
    if score["score_gap"] >= 1:
        return 4
    return 3


def optional_pair_fields(queue_record: dict[str, Any]) -> dict[str, Any]:
    fields = {}
    for key in (
        "pair_id",
        "pair_kind",
        "left_variant_name",
        "right_variant_name",
        "left_defect_type",
        "right_defect_type",
        "pair_type",
        "heuristic_signals",
    ):
        if key in queue_record:
            fields[key] = queue_record[key]
    return fields


def number(*values: Any) -> float | None:
    for value in values:
        if isinstance(value, bool) or value is None:
            continue
        if isinstance(value, int | float):
            return float(value)
    return None
