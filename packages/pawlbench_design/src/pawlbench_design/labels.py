"""Human labeling helpers for PawlBench Design pair preferences."""

from __future__ import annotations

import html
import json
import random
from collections import Counter
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any


PREFERRED_VALUES = ("left", "right", "tie", "unclear")
ITEM_VALUES = ("original", "variant")
SEVERITY_VALUES = ("none", "low", "medium", "high")
REVIEW_STATUS_VALUES = ("suggested", "confirmed", "edited", "unclear", "skipped")
HUMAN_REVIEW_STATUSES = ("confirmed", "edited", "unclear")
SUGGESTED_BY = "codepawl_rule_v0"
DEFECT_TAGS = (
    "contrast",
    "spacing",
    "alignment",
    "hierarchy",
    "cta_weak",
    "too_dense",
    "too_empty",
    "generic_ai_slop",
    "inconsistent_rhythm",
    "weak_brand_fit",
    "accessibility",
    "responsive_risk",
)
QUALITY_TAGS = (
    "clear_hierarchy",
    "strong_cta",
    "good_spacing",
    "premium",
    "readable",
    "cohesive_palette",
    "polished",
    "practical",
    "dashboard_clear",
    "landing_clear",
)
REQUIRED_LABEL_FIELDS = {
    "label_id",
    "dataset_id",
    "split",
    "sample_id",
    "variant_name",
    "defect_type",
    "left_item",
    "right_item",
    "preferred",
    "defect_tags",
    "quality_tags",
    "severity",
    "fix_instruction",
    "reason",
    "confidence",
    "labeler_id",
    "created_at",
}


@dataclass(frozen=True)
class LabelQueueConfig:
    input_path: Path
    output_dir: Path
    seed: int
    limit: int | None = None


@dataclass(frozen=True)
class LabelQueueResult:
    output_dir: Path
    queue_path: Path
    labels_empty_path: Path
    schema_path: Path
    review_path: Path
    readme_path: Path
    records: list[dict[str, Any]]


@dataclass(frozen=True)
class LabelValidationConfig:
    labels_path: Path
    queue_path: Path
    output_dir: Path


@dataclass(frozen=True)
class LabelValidationResult:
    output_dir: Path
    validation_path: Path
    validation: dict[str, Any]


@dataclass(frozen=True)
class LabelReportConfig:
    labels_path: Path
    queue_path: Path
    output_dir: Path


@dataclass(frozen=True)
class LabelReportResult:
    output_dir: Path
    report_path: Path
    summary_path: Path
    summary: dict[str, Any]


@dataclass(frozen=True)
class LabelSuggestConfig:
    queue_path: Path
    output_path: Path


@dataclass(frozen=True)
class LabelSuggestResult:
    output_path: Path
    labels: list[dict[str, Any]]


@dataclass(frozen=True)
class LabelAuditConfig:
    labels_path: Path
    queue_path: Path
    output_dir: Path


@dataclass(frozen=True)
class LabelAuditResult:
    output_dir: Path
    audit_path: Path
    report_path: Path
    audit: dict[str, Any]


@dataclass(frozen=True)
class LabelSetReviewerConfig:
    labels_path: Path
    output_path: Path | None
    reviewed_by: str
    only_status: str
    in_place: bool = False


@dataclass(frozen=True)
class LabelSetReviewerResult:
    output_path: Path
    total_records: int
    rewritten_records: int
    only_status: str
    reviewed_by: str


def build_label_queue(config: LabelQueueConfig) -> LabelQueueResult:
    input_path = config.input_path.expanduser().resolve()
    output_dir = config.output_dir.expanduser().resolve()
    if config.limit is not None and config.limit < 0:
        raise ValueError("--limit must be greater than or equal to 0")

    split_records = _read_jsonl(input_path)
    if config.limit is not None:
        split_records = split_records[: config.limit]

    rng = random.Random(config.seed)
    records = [_queue_record(record, rng) for record in split_records]

    output_dir.mkdir(parents=True, exist_ok=True)
    queue_path = output_dir / "queue.jsonl"
    labels_empty_path = output_dir / "labels.empty.jsonl"
    schema_path = output_dir / "label_schema.json"
    review_path = output_dir / "review.html"
    readme_path = output_dir / "README.md"

    _write_jsonl(queue_path, records)
    labels_empty_path.write_text("", encoding="utf-8")
    _write_json(schema_path, _label_schema())
    review_path.write_text(_review_html(records), encoding="utf-8")
    readme_path.write_text(_queue_readme(input_path, config.seed, config.limit), encoding="utf-8")

    return LabelQueueResult(
        output_dir=output_dir,
        queue_path=queue_path,
        labels_empty_path=labels_empty_path,
        schema_path=schema_path,
        review_path=review_path,
        readme_path=readme_path,
        records=records,
    )


def suggest_labels(config: LabelSuggestConfig) -> LabelSuggestResult:
    queue_path = config.queue_path.expanduser().resolve()
    output_path = config.output_path.expanduser().resolve()
    records = _read_jsonl(queue_path)
    labels = [_suggested_label(record) for record in records]
    output_path.parent.mkdir(parents=True, exist_ok=True)
    _write_jsonl(output_path, labels)
    return LabelSuggestResult(output_path=output_path, labels=labels)


def audit_labels(config: LabelAuditConfig) -> LabelAuditResult:
    output_dir = config.output_dir.expanduser().resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    labels_path = config.labels_path.expanduser().resolve()
    queue_path = config.queue_path.expanduser().resolve()
    labels = _read_jsonl(labels_path) if labels_path.is_file() else []
    queue_records = _read_jsonl(queue_path)
    validation = build_label_validation(labels_path=labels_path, queue_path=queue_path)
    audit = _label_provenance_audit(labels=labels, queue_records=queue_records, validation=validation)
    audit_path = output_dir / "audit.json"
    report_path = output_dir / "report.md"
    _write_json(audit_path, audit)
    report_path.write_text(_audit_markdown(audit), encoding="utf-8")
    return LabelAuditResult(
        output_dir=output_dir,
        audit_path=audit_path,
        report_path=report_path,
        audit=audit,
    )


def set_label_reviewer(config: LabelSetReviewerConfig) -> LabelSetReviewerResult:
    labels_path = config.labels_path.expanduser().resolve()
    if not config.reviewed_by:
        raise ValueError("--reviewed-by is required")
    if config.only_status not in REVIEW_STATUS_VALUES:
        raise ValueError(f"--only-status must be one of: {', '.join(REVIEW_STATUS_VALUES)}")
    if config.in_place:
        output_path = labels_path
    elif config.output_path is not None:
        output_path = config.output_path.expanduser().resolve()
    else:
        raise ValueError("--out is required unless --in-place is passed")
    labels = _read_jsonl(labels_path)
    rewritten = 0
    updated: list[dict[str, Any]] = []
    reviewed_at = _now_iso()
    for label in labels:
        record = dict(label)
        if record.get("review_status") == config.only_status:
            record["reviewed_by"] = config.reviewed_by
            record["labeler_id"] = config.reviewed_by
            record["reviewed_at"] = reviewed_at
            rewritten += 1
        updated.append(record)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    _write_jsonl(output_path, updated)
    return LabelSetReviewerResult(
        output_path=output_path,
        total_records=len(labels),
        rewritten_records=rewritten,
        only_status=config.only_status,
        reviewed_by=config.reviewed_by,
    )


def validate_labels(config: LabelValidationConfig) -> LabelValidationResult:
    output_dir = config.output_dir.expanduser().resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    validation = build_label_validation(
        labels_path=config.labels_path.expanduser().resolve(),
        queue_path=config.queue_path.expanduser().resolve(),
    )
    validation_path = output_dir / "validation.json"
    _write_json(validation_path, validation)
    return LabelValidationResult(
        output_dir=output_dir,
        validation_path=validation_path,
        validation=validation,
    )


def build_label_validation(*, labels_path: Path, queue_path: Path) -> dict[str, Any]:
    errors: list[str] = []
    warnings: list[str] = []
    queue_records = _read_queue_for_validation(queue_path, errors)
    labels = _read_labels_for_validation(labels_path, errors)
    queue_by_id = {
        str(record.get("label_id")): record
        for record in queue_records
        if isinstance(record, dict) and record.get("label_id")
    }
    queue_ids = set(queue_by_id)

    seen: set[str] = set()
    completed = 0
    defect_counts: Counter[str] = Counter()
    preferred_counts: Counter[str] = Counter()
    severity_counts: Counter[str] = Counter()
    review_status_counts: Counter[str] = Counter()
    suspicious_confirmed_count = 0
    rule_reviewed_count = 0

    for index, label in enumerate(labels, start=1):
        if not isinstance(label, dict):
            errors.append(f"line {index}: label record must be an object")
            continue
        label_id = str(label.get("label_id", ""))
        missing_fields = sorted(REQUIRED_LABEL_FIELDS - set(label))
        if missing_fields:
            errors.append(f"line {index}: missing required fields: {', '.join(missing_fields)}")
        if label_id in seen:
            errors.append(f"line {index}: duplicate label_id: {label_id}")
        seen.add(label_id)
        if label_id and label_id not in queue_ids:
            errors.append(f"line {index}: label_id is not present in queue: {label_id}")

        queue_record = queue_by_id.get(label_id)
        allowed_items = queue_item_values(queue_record) if queue_record else ITEM_VALUES
        _validate_enum(errors, index, label, "left_item", allowed_items)
        _validate_enum(errors, index, label, "right_item", allowed_items)
        if label.get("left_item") == label.get("right_item") and label.get("left_item") in allowed_items:
            errors.append(f"line {index}: left_item and right_item must differ")
        _validate_enum(errors, index, label, "preferred", PREFERRED_VALUES)
        _validate_enum(errors, index, label, "severity", SEVERITY_VALUES)
        _validate_tag_list(errors, index, label, "defect_tags", DEFECT_TAGS)
        _validate_tag_list(errors, index, label, "quality_tags", QUALITY_TAGS)
        confidence = label.get("confidence")
        if not isinstance(confidence, int) or isinstance(confidence, bool) or confidence < 1 or confidence > 5:
            errors.append(f"line {index}: confidence must be an integer from 1 to 5")
        for field in ("fix_instruction", "reason", "labeler_id", "created_at"):
            if field in label and not isinstance(label[field], str):
                errors.append(f"line {index}: {field} must be a string")
        if isinstance(label.get("created_at"), str):
            _validate_iso_datetime(errors, index, label["created_at"])

        if queue_record is not None:
            for field in ("dataset_id", "split", "sample_id", "variant_name", "defect_type"):
                if field in label and label[field] != queue_record.get(field):
                    errors.append(f"line {index}: {field} does not match queue for {label_id}")
            for field in (
                "pair_id",
                "pair_kind",
                "left_variant_name",
                "right_variant_name",
                "left_defect_type",
                "right_defect_type",
            ):
                if field in label and field in queue_record and label[field] != queue_record.get(field):
                    errors.append(f"line {index}: {field} does not match queue for {label_id}")

        completed += 1
        if isinstance(label.get("defect_type"), str):
            defect_counts[label["defect_type"]] += 1
        if label.get("preferred") in PREFERRED_VALUES:
            preferred_counts[label["preferred"]] += 1
        if label.get("severity") in SEVERITY_VALUES:
            severity_counts[label["severity"]] += 1
        review_status = label.get("review_status")
        if review_status is not None:
            if review_status not in REVIEW_STATUS_VALUES:
                errors.append(
                    f"line {index}: review_status must be one of: {', '.join(REVIEW_STATUS_VALUES)}"
                )
            else:
                review_status_counts[review_status] += 1
        else:
            review_status_counts["confirmed"] += 1
            review_status = "confirmed"
        if review_status in HUMAN_REVIEW_STATUSES:
            provenance = _label_provenance(label)
            if provenance["rule_reviewed"]:
                rule_reviewed_count += 1
            if provenance["suspicious_confirmed"]:
                suspicious_confirmed_count += 1

    total = len(queue_records)
    coverage_ratio = completed / total if total else 0.0
    if total and completed < total:
        warnings.append(
            f"label coverage is partial: {completed}/{total} ({coverage_ratio:.3f})"
        )
    if not total:
        warnings.append("queue is empty")
    human_reviewed = sum(review_status_counts.get(status, 0) for status in HUMAN_REVIEW_STATUSES)
    if completed and human_reviewed == 0:
        warnings.append("label file contains suggestions but no confirmed or edited human labels")
    if suspicious_confirmed_count:
        warnings.append(
            f"{suspicious_confirmed_count} confirmed or edited labels have suspicious rule provenance"
        )

    return {
        "valid": not errors,
        "errors": errors,
        "warnings": warnings,
        "total_queue_records": total,
        "completed_labels": completed,
        "coverage_ratio": coverage_ratio,
        "counts_by_defect_type": dict(sorted(defect_counts.items())),
        "counts_by_preferred": _enum_counts(preferred_counts, PREFERRED_VALUES),
        "counts_by_severity": _enum_counts(severity_counts, SEVERITY_VALUES),
        "counts_by_review_status": _enum_counts(review_status_counts, REVIEW_STATUS_VALUES),
        "suggested_count": review_status_counts.get("suggested", 0),
        "confirmed_count": review_status_counts.get("confirmed", 0),
        "edited_count": review_status_counts.get("edited", 0),
        "unclear_count": review_status_counts.get("unclear", 0),
        "skipped_count": review_status_counts.get("skipped", 0),
        "human_reviewed_count": human_reviewed,
        "rule_reviewed_count": rule_reviewed_count,
        "suspicious_confirmed_count": suspicious_confirmed_count,
    }


def export_label_report(config: LabelReportConfig) -> LabelReportResult:
    labels_path = config.labels_path.expanduser().resolve()
    queue_path = config.queue_path.expanduser().resolve()
    output_dir = config.output_dir.expanduser().resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    queue_records = _read_jsonl(queue_path)
    labels = _read_jsonl(labels_path) if labels_path.is_file() else []
    validation = build_label_validation(labels_path=labels_path, queue_path=queue_path)
    summary = _label_report_summary(
        labels=labels,
        queue_records=queue_records,
        validation=validation,
    )
    summary_path = output_dir / "summary.json"
    report_path = output_dir / "report.md"
    _write_json(summary_path, summary)
    report_path.write_text(_label_report_markdown(summary), encoding="utf-8")

    return LabelReportResult(
        output_dir=output_dir,
        report_path=report_path,
        summary_path=summary_path,
        summary=summary,
    )


def queue_item_values(queue_record: dict[str, Any] | None) -> tuple[str, ...]:
    if not queue_record:
        return ITEM_VALUES
    items = []
    for side in ("left_item", "right_item"):
        item = queue_record.get(side)
        if isinstance(item, str) and item and item not in items:
            items.append(item)
    return tuple(items) if items else ITEM_VALUES


def _queue_record(record: dict[str, Any], rng: random.Random) -> dict[str, Any]:
    for field in ("dataset_id", "split", "sample_id", "variant_name", "defect_type"):
        if field not in record:
            raise ValueError(f"split record missing required field: {field}")
    original = record.get("original")
    variant = record.get("variant")
    if not isinstance(original, dict) or not isinstance(variant, dict):
        raise ValueError("split record must include original and variant objects")

    left_item, right_item = ("original", "variant")
    if rng.choice((False, True)):
        left_item, right_item = ("variant", "original")

    dataset_id = str(record["dataset_id"])
    split = str(record["split"])
    sample_id = str(record["sample_id"])
    variant_name = str(record["variant_name"])
    return {
        "label_id": f"{dataset_id}__{split}__{sample_id}__{variant_name}",
        "dataset_id": dataset_id,
        "split": split,
        "sample_id": sample_id,
        "variant_name": variant_name,
        "defect_type": record["defect_type"],
        "left_item": left_item,
        "right_item": right_item,
        "original": {
            "screenshot_path": original.get("screenshot_path"),
            "metrics_path": original.get("metrics_path"),
            "html_path": original.get("html_path"),
            "dom_path": original.get("dom_path"),
            "accessibility_path": original.get("accessibility_path"),
        },
        "variant": {
            "screenshot_path": variant.get("screenshot_path"),
            "metrics_path": variant.get("metrics_path"),
            "html_path": variant.get("html_path"),
            "dom_path": variant.get("dom_path"),
            "accessibility_path": variant.get("accessibility_path"),
        },
        "expected_issue": record.get("expected_issue"),
        "expected_fix_instruction": record.get("expected_fix_instruction"),
        "metric_deltas": record.get("metric_deltas") or {},
    }


def _suggested_label(record: dict[str, Any]) -> dict[str, Any]:
    defect_type = str(record.get("defect_type", ""))
    preferred = "left" if record.get("left_item") == "original" else "right"
    severity, confidence = _suggested_severity_and_confidence(defect_type, record)
    defect_tags = _suggested_defect_tags(defect_type)
    quality_tags = _suggested_quality_tags(defect_type, severity)
    return {
        "label_id": record["label_id"],
        "dataset_id": record["dataset_id"],
        "split": record["split"],
        "sample_id": record["sample_id"],
        "variant_name": record["variant_name"],
        "defect_type": defect_type,
        "left_item": record["left_item"],
        "right_item": record["right_item"],
        "preferred": preferred,
        "defect_tags": defect_tags,
        "quality_tags": quality_tags,
        "severity": severity,
        "fix_instruction": record.get("expected_fix_instruction") or _fallback_fix(defect_type),
        "reason": _suggested_reason(defect_type, record, severity),
        "confidence": confidence,
        "labeler_id": SUGGESTED_BY,
        "created_at": "1970-01-01T00:00:00Z",
        "suggested_by": SUGGESTED_BY,
        "suggestion_confidence": confidence,
        "review_status": "suggested",
        "reviewed_by": None,
        "reviewed_at": None,
    }


def _suggested_severity_and_confidence(
    defect_type: str,
    record: dict[str, Any],
) -> tuple[str, int]:
    deltas = record.get("metric_deltas") if isinstance(record.get("metric_deltas"), dict) else {}
    has_metric = False
    severity_score = 1
    if defect_type == "contrast":
        contrast_delta = _number(deltas.get("contrast_issue_delta"))
        min_ratio_delta = _number(deltas.get("min_contrast_ratio_delta"))
        has_metric = contrast_delta is not None or min_ratio_delta is not None
        if (contrast_delta or 0) >= 10 or (min_ratio_delta or 0) <= -2.5:
            severity_score = 3
        elif (contrast_delta or 0) >= 3 or (min_ratio_delta or 0) <= -1:
            severity_score = 2
    elif defect_type == "hierarchy":
        font_delta = abs(_number(deltas.get("font_size_ratio_delta")) or 0)
        warning_delta = _number(deltas.get("hierarchy_warning_delta"))
        has_metric = "font_size_ratio_delta" in deltas or "hierarchy_warning_delta" in deltas
        if font_delta >= 2 or (warning_delta or 0) >= 2:
            severity_score = 3
        elif font_delta >= 0.8 or (warning_delta or 0) >= 1:
            severity_score = 2
    elif defect_type in {"spacing", "alignment"}:
        changed = _number(deltas.get("changed_pixel_ratio"))
        has_metric = changed is not None
        if changed is not None and changed >= 0.18:
            severity_score = 3
        elif changed is not None and changed >= 0.05:
            severity_score = 2
        else:
            severity_score = 2
    else:
        severity_score = 1

    severity = ("low", "medium", "high")[severity_score - 1]
    confidence = 5 if has_metric and severity_score >= 2 else 4 if has_metric else 3
    return severity, confidence


def _suggested_defect_tags(defect_type: str) -> list[str]:
    mapping = {
        "contrast": ["contrast", "accessibility"],
        "spacing": ["spacing", "inconsistent_rhythm"],
        "alignment": ["alignment", "inconsistent_rhythm"],
        "hierarchy": ["hierarchy", "cta_weak"],
    }
    return mapping.get(defect_type, [defect_type] if defect_type in DEFECT_TAGS else [])


def _suggested_quality_tags(defect_type: str, severity: str) -> list[str]:
    if severity == "high":
        return ["readable"] if defect_type == "contrast" else ["practical"]
    mapping = {
        "contrast": ["readable"],
        "spacing": ["good_spacing", "polished"],
        "alignment": ["polished", "practical"],
        "hierarchy": ["clear_hierarchy"],
    }
    return mapping.get(defect_type, ["practical"])


def _suggested_reason(defect_type: str, record: dict[str, Any], severity: str) -> str:
    expected_issue = record.get("expected_issue")
    if expected_issue:
        return f"Suggested {severity} {defect_type} issue: {expected_issue}"
    return f"Suggested {severity} {defect_type} issue based on the synthetic jitter metadata."


def _fallback_fix(defect_type: str) -> str:
    return f"Review and repair the {defect_type} treatment."


def _number(value: Any) -> float | None:
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, int | float):
        return float(value)
    return None


def _label_schema() -> dict[str, Any]:
    return {
        "schema_name": "pawlbench_design_human_label_v0",
        "record_format": "jsonl",
        "required_fields": sorted(REQUIRED_LABEL_FIELDS),
        "enums": {
            "left_item": list(ITEM_VALUES),
            "right_item": list(ITEM_VALUES),
            "preferred": list(PREFERRED_VALUES),
            "severity": list(SEVERITY_VALUES),
            "review_status": list(REVIEW_STATUS_VALUES),
        },
        "defect_tags": list(DEFECT_TAGS),
        "quality_tags": list(QUALITY_TAGS),
        "confidence": {"type": "integer", "minimum": 1, "maximum": 5},
        "notes": [
            "Use labels only from contributors who agree labels may be used for research, product development, benchmark release, and model training.",
            "Do not include sensitive personal information in label text.",
            "Suggested labels are not human labels until review_status is confirmed, edited, or unclear.",
        ],
    }


def _review_html(records: list[dict[str, Any]]) -> str:
    cards = "\n".join(_review_card(record) for record in records)
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>PawlBench Design Label Review</title>
  <style>
    body {{ margin: 0; font: 14px/1.5 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #172026; background: #f5f7f8; }}
    header {{ padding: 24px; background: #ffffff; border-bottom: 1px solid #d8dee4; }}
    main {{ padding: 24px; display: grid; gap: 24px; }}
    h1, h2, h3 {{ margin: 0; }}
    code, pre {{ font: 12px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }}
    .pair {{ background: #ffffff; border: 1px solid #d8dee4; border-radius: 8px; overflow: hidden; }}
    .pair header {{ padding: 16px; border-bottom: 1px solid #d8dee4; }}
    .meta {{ margin-top: 8px; color: #53616b; display: flex; flex-wrap: wrap; gap: 8px 16px; }}
    .screens {{ display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; padding: 16px; }}
    .shot {{ min-width: 0; }}
    .shot h3 {{ margin-bottom: 8px; font-size: 14px; }}
    .shot img {{ width: 100%; height: auto; border: 1px solid #d8dee4; background: #ffffff; }}
    .details {{ padding: 0 16px 16px; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 16px; }}
    .box {{ border: 1px solid #d8dee4; border-radius: 6px; padding: 12px; background: #fbfcfd; min-width: 0; }}
    pre {{ margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }}
    @media (max-width: 800px) {{ .screens, .details {{ grid-template-columns: 1fr; }} main {{ padding: 12px; }} }}
  </style>
</head>
<body>
  <header>
    <h1>PawlBench Design Label Review</h1>
    <p>Static local review sheet. Inspect each pair, then copy completed JSONL records into <code>labels.jsonl</code>.</p>
    <p>Defect tags: <code>{", ".join(DEFECT_TAGS)}</code></p>
    <p>Quality tags: <code>{", ".join(QUALITY_TAGS)}</code></p>
  </header>
  <main>
    {cards}
  </main>
</body>
</html>
"""


def _review_card(record: dict[str, Any]) -> str:
    left_item = record["left_item"]
    right_item = record["right_item"]
    left = record[left_item]
    right = record[right_item]
    template = _label_template(record)
    deltas = json.dumps(record.get("metric_deltas", {}), indent=2, sort_keys=True)
    return f"""<section class="pair">
  <header>
    <h2>{html.escape(record["label_id"])}</h2>
    <div class="meta">
      <span>sample: <code>{html.escape(record["sample_id"])}</code></span>
      <span>variant: <code>{html.escape(record["variant_name"])}</code></span>
      <span>defect: <code>{html.escape(str(record["defect_type"]))}</code></span>
    </div>
  </header>
  <div class="screens">
    <div class="shot">
      <h3>Left: {html.escape(left_item)}</h3>
      <img src="{html.escape(str(left.get("screenshot_path") or ""))}" alt="Left screenshot">
      <p><code>{html.escape(str(left.get("metrics_path") or ""))}</code></p>
    </div>
    <div class="shot">
      <h3>Right: {html.escape(right_item)}</h3>
      <img src="{html.escape(str(right.get("screenshot_path") or ""))}" alt="Right screenshot">
      <p><code>{html.escape(str(right.get("metrics_path") or ""))}</code></p>
    </div>
  </div>
  <div class="details">
    <div class="box">
      <h3>Expected Issue</h3>
      <p>{html.escape(str(record.get("expected_issue") or ""))}</p>
      <h3>Expected Fix</h3>
      <p>{html.escape(str(record.get("expected_fix_instruction") or ""))}</p>
      <h3>Metric Deltas</h3>
      <pre>{html.escape(deltas)}</pre>
    </div>
    <div class="box">
      <h3>Copyable Label Template</h3>
      <pre>{html.escape(json.dumps(template, indent=2, sort_keys=True))}</pre>
    </div>
  </div>
</section>"""


def _label_template(record: dict[str, Any]) -> dict[str, Any]:
    return {
        "label_id": record["label_id"],
        "dataset_id": record["dataset_id"],
        "split": record["split"],
        "sample_id": record["sample_id"],
        "variant_name": record["variant_name"],
        "defect_type": record["defect_type"],
        "left_item": record["left_item"],
        "right_item": record["right_item"],
        "preferred": "left",
        "defect_tags": [],
        "quality_tags": [],
        "severity": "medium",
        "fix_instruction": record.get("expected_fix_instruction") or "",
        "reason": "",
        "confidence": 3,
        "labeler_id": "",
        "created_at": "YYYY-MM-DDTHH:MM:SSZ",
    }


def _queue_readme(input_path: Path, seed: int, limit: int | None) -> str:
    limit_text = "none" if limit is None else str(limit)
    return f"""# PawlBench Design Label Queue

Source split: `{input_path}`
Seed: `{seed}`
Limit: `{limit_text}`

Generate deterministic suggestions and start the local app with:

```bash
uv run pawlbench-design-label-suggest queue.jsonl --out suggested_labels.jsonl
uv run pawlbench-design-label-app . --host 127.0.0.1 --port 8765
```

Open `http://127.0.0.1:8765`, confirm or edit suggested labels, and save completed labels into `labels.jsonl`.

`review.html` remains available as a manual fallback. It does not write files; use it to copy completed JSONL records by hand if needed.

Validate completed labels with:

```bash
uv run pawlbench-design-label-validate labels.jsonl --queue queue.jsonl --out validation
```

Labels are intended for local research and later Pawl-JEPA supervision. Follow `docs/DATA_POLICY.md` and do not include sensitive personal information in label text.
"""


def _label_report_summary(
    *,
    labels: list[dict[str, Any]],
    queue_records: list[dict[str, Any]],
    validation: dict[str, Any],
) -> dict[str, Any]:
    defect_tag_counts: Counter[str] = Counter()
    quality_tag_counts: Counter[str] = Counter()
    fix_instructions: Counter[str] = Counter()
    suggested_by_id = {
        label.get("label_id"): label
        for label in labels
        if isinstance(label, dict) and label.get("review_status") == "suggested"
    }
    human_by_id = {
        label.get("label_id"): label
        for label in labels
        if isinstance(label, dict) and label.get("review_status") in HUMAN_REVIEW_STATUSES
    }
    for label in labels:
        if not isinstance(label, dict):
            continue
        for tag in label.get("defect_tags", []):
            if isinstance(tag, str):
                defect_tag_counts[tag] += 1
        for tag in label.get("quality_tags", []):
            if isinstance(tag, str):
                quality_tag_counts[tag] += 1
        fix_instruction = label.get("fix_instruction")
        if isinstance(fix_instruction, str) and fix_instruction.strip():
            fix_instructions[fix_instruction.strip()] += 1

    return {
        "total_queue_records": len(queue_records),
        "completed_labels": validation["completed_labels"],
        "coverage_ratio": validation["coverage_ratio"],
        "valid": validation["valid"],
        "errors": validation["errors"],
        "warnings": validation["warnings"],
        "preference_counts": validation["counts_by_preferred"],
        "severity_counts": validation["counts_by_severity"],
        "review_status_counts": validation["counts_by_review_status"],
        "suggested_count": validation["suggested_count"],
        "confirmed_count": validation["confirmed_count"],
        "edited_count": validation["edited_count"],
        "unclear_count": validation["unclear_count"],
        "skipped_count": validation["skipped_count"],
        "human_reviewed_count": validation["human_reviewed_count"],
        "rule_reviewed_count": validation["rule_reviewed_count"],
        "suspicious_confirmed_count": validation["suspicious_confirmed_count"],
        "defect_type_counts": validation["counts_by_defect_type"],
        "defect_tag_counts": dict(sorted(defect_tag_counts.items())),
        "quality_tag_counts": dict(sorted(quality_tag_counts.items())),
        "agreement": _agreement_stats(suggested_by_id, human_by_id),
        "common_fix_instructions": [
            {"fix_instruction": text, "count": count}
            for text, count in fix_instructions.most_common(10)
        ],
        "known_limitations": [
            "v0 labels are local JSONL records without inter-labeler agreement tracking.",
            "Suggested labels are deterministic rule outputs, not human labels until reviewed.",
            "Static review HTML does not write files or enforce completion in the browser.",
            "Labels cover controlled original-vs-jittered pairs, not arbitrary production UI states.",
            "Partial coverage is allowed so labeling can proceed incrementally.",
        ],
    }


def _label_report_markdown(summary: dict[str, Any]) -> str:
    lines = [
        "# PawlBench Design Label Report",
        "",
        "## Coverage",
        "",
        f"- Queue records: {summary['total_queue_records']}",
            f"- Completed labels: {summary['completed_labels']}",
            f"- Coverage ratio: {summary['coverage_ratio']:.3f}",
            f"- Validation valid: {summary['valid']}",
            f"- Human reviewed: {summary['human_reviewed_count']}",
            f"- Rule reviewed: {summary['rule_reviewed_count']}",
            f"- Suspicious confirmed: {summary['suspicious_confirmed_count']}",
            "",
        "## Review Status",
        "",
    ]
    lines.extend(_count_lines(summary["review_status_counts"]))
    lines.extend(
        [
            "",
            "## Suggestion Agreement",
            "",
            f"- Compared labels: {summary['agreement']['compared_count']}",
            f"- Preferred agreement: {summary['agreement']['preferred_agreement']:.3f}",
            f"- Severity agreement: {summary['agreement']['severity_agreement']:.3f}",
            f"- Average defect tag overlap: {summary['agreement']['average_defect_tag_overlap']:.3f}",
            "",
        ]
    )
    lines.extend(
        [
        "## Preferences",
        "",
        ]
    )
    lines.extend(_count_lines(summary["preference_counts"]))
    lines.extend(["", "## Severity", ""])
    lines.extend(_count_lines(summary["severity_counts"]))
    lines.extend(["", "## Defect Tags", ""])
    lines.extend(_count_lines(summary["defect_tag_counts"]))
    lines.extend(["", "## Quality Tags", ""])
    lines.extend(_count_lines(summary["quality_tag_counts"]))
    lines.extend(["", "## Common Fix Instructions", ""])
    if summary["common_fix_instructions"]:
        for item in summary["common_fix_instructions"]:
            lines.append(f"- {item['count']}x: {item['fix_instruction']}")
    else:
        lines.append("- No completed fix instructions yet.")
    lines.extend(["", "## Known Limitations", ""])
    lines.extend(f"- {item}" for item in summary["known_limitations"])
    return "\n".join(lines) + "\n"


def _label_provenance_audit(
    *,
    labels: list[dict[str, Any]],
    queue_records: list[dict[str, Any]],
    validation: dict[str, Any],
) -> dict[str, Any]:
    flagged: list[dict[str, Any]] = []
    for label in labels:
        if not isinstance(label, dict):
            continue
        status = label.get("review_status", "confirmed")
        provenance = _label_provenance(label)
        if status in HUMAN_REVIEW_STATUSES and (
            provenance["missing_reviewed_by"]
            or provenance["reviewed_by_matches_suggested_by"]
            or provenance["labeler_id_is_rule"]
        ):
            flagged.append(
                {
                    "label_id": label.get("label_id"),
                    "review_status": status,
                    "labeler_id": label.get("labeler_id"),
                    "reviewed_by": label.get("reviewed_by"),
                    "suggested_by": label.get("suggested_by"),
                    "issues": provenance["issues"],
                }
            )
    status_counts = validation.get("counts_by_review_status", {})
    auto_suggested_count = status_counts.get("suggested", 0)
    human_reviewed_count = validation.get("human_reviewed_count", 0)
    suspicious_confirmed_count = len(flagged)
    return {
        "valid": validation.get("valid", False) and suspicious_confirmed_count == 0,
        "errors": validation.get("errors", []),
        "warnings": validation.get("warnings", []),
        "total_queue_records": len(queue_records),
        "completed_labels": validation.get("completed_labels", 0),
        "coverage_ratio": validation.get("coverage_ratio", 0.0),
        "coverage_by_review_status": status_counts,
        "human_reviewed_count": human_reviewed_count,
        "auto_suggested_count": auto_suggested_count,
        "rule_reviewed_count": validation.get("rule_reviewed_count", 0),
        "suspicious_confirmed_count": suspicious_confirmed_count,
        "suggested_labels_in_human_file_count": auto_suggested_count,
        "flagged_labels": flagged,
    }


def _audit_markdown(audit: dict[str, Any]) -> str:
    lines = [
        "# PawlBench Design Label Provenance Audit",
        "",
        "## Summary",
        "",
        f"- Valid provenance: {audit['valid']}",
        f"- Queue records: {audit['total_queue_records']}",
        f"- Completed labels: {audit['completed_labels']}",
        f"- Coverage ratio: {audit['coverage_ratio']:.3f}",
        f"- Human reviewed: {audit['human_reviewed_count']}",
        f"- Auto suggested: {audit['auto_suggested_count']}",
        f"- Rule reviewed: {audit['rule_reviewed_count']}",
        f"- Suspicious confirmed: {audit['suspicious_confirmed_count']}",
        "",
        "## Coverage By Review Status",
        "",
    ]
    lines.extend(_count_lines(audit["coverage_by_review_status"]))
    lines.extend(["", "## Flagged Labels", ""])
    if audit["flagged_labels"]:
        for item in audit["flagged_labels"]:
            issues = ", ".join(item["issues"])
            lines.append(
                f"- {item['label_id']}: status={item['review_status']} "
                f"labeler_id={item['labeler_id']} reviewed_by={item['reviewed_by']} "
                f"suggested_by={item['suggested_by']} issues={issues}"
            )
    else:
        lines.append("- No suspicious confirmed or edited labels.")
    return "\n".join(lines) + "\n"


def _label_provenance(label: dict[str, Any]) -> dict[str, Any]:
    issues: list[str] = []
    reviewed_by = label.get("reviewed_by")
    suggested_by = label.get("suggested_by")
    labeler_id = label.get("labeler_id")
    missing_reviewed_by = not isinstance(reviewed_by, str) or not reviewed_by
    reviewed_by_matches_suggested_by = (
        isinstance(reviewed_by, str)
        and isinstance(suggested_by, str)
        and reviewed_by == suggested_by
    )
    labeler_id_is_rule = isinstance(labeler_id, str) and labeler_id.startswith("codepawl_rule")
    if missing_reviewed_by:
        issues.append("missing_reviewed_by")
    if reviewed_by_matches_suggested_by:
        issues.append("reviewed_by_matches_suggested_by")
    if labeler_id_is_rule:
        issues.append("labeler_id_is_rule")
    rule_reviewed = reviewed_by_matches_suggested_by or (
        isinstance(reviewed_by, str) and reviewed_by.startswith("codepawl_rule")
    )
    return {
        "missing_reviewed_by": missing_reviewed_by,
        "reviewed_by_matches_suggested_by": reviewed_by_matches_suggested_by,
        "labeler_id_is_rule": labeler_id_is_rule,
        "rule_reviewed": rule_reviewed,
        "suspicious_confirmed": bool(issues),
        "issues": issues,
    }


def _agreement_stats(
    suggested_by_id: dict[Any, dict[str, Any]],
    human_by_id: dict[Any, dict[str, Any]],
) -> dict[str, Any]:
    comparable: list[tuple[dict[str, Any], dict[str, Any]]] = []
    for label_id in sorted(set(suggested_by_id) & set(human_by_id)):
        comparable.append((suggested_by_id[label_id], human_by_id[label_id]))
    if not comparable:
        for human in human_by_id.values():
            if "suggested_preferred" not in human:
                continue
            comparable.append(
                (
                    {
                        "preferred": human.get("suggested_preferred"),
                        "severity": human.get("suggested_severity"),
                        "defect_tags": human.get("suggested_defect_tags", []),
                    },
                    human,
                )
            )
    if not comparable:
        return {
            "compared_count": 0,
            "preferred_agreement": 0.0,
            "severity_agreement": 0.0,
            "average_defect_tag_overlap": 0.0,
        }
    preferred_matches = 0
    severity_matches = 0
    overlap_total = 0.0
    for suggested, human in comparable:
        if suggested.get("preferred") == human.get("preferred"):
            preferred_matches += 1
        if suggested.get("severity") == human.get("severity"):
            severity_matches += 1
        suggested_tags = set(suggested.get("defect_tags", []))
        human_tags = set(human.get("defect_tags", []))
        union = suggested_tags | human_tags
        overlap_total += len(suggested_tags & human_tags) / len(union) if union else 1.0
    compared = len(comparable)
    return {
        "compared_count": compared,
        "preferred_agreement": preferred_matches / compared,
        "severity_agreement": severity_matches / compared,
        "average_defect_tag_overlap": overlap_total / compared,
    }


def _count_lines(counts: dict[str, int]) -> list[str]:
    if not counts:
        return ["- No values"]
    return [f"- {name}: {count}" for name, count in counts.items()]


def _read_queue_for_validation(path: Path, errors: list[str]) -> list[dict[str, Any]]:
    if not path.is_file():
        errors.append(f"queue file is missing: {path}")
        return []
    try:
        return _read_jsonl(path)
    except ValueError as exc:
        errors.append(str(exc))
        return []


def _read_labels_for_validation(path: Path, errors: list[str]) -> list[dict[str, Any]]:
    if not path.is_file():
        errors.append(f"labels file is missing: {path}")
        return []
    try:
        return _read_jsonl(path)
    except ValueError as exc:
        errors.append(str(exc))
        return []


def _read_jsonl(path: Path) -> list[dict[str, Any]]:
    if not path.is_file():
        raise ValueError(f"JSONL file is missing: {path}")
    records = []
    for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        if not line.strip():
            continue
        try:
            value = json.loads(line)
        except json.JSONDecodeError as exc:
            raise ValueError(f"{path} line {line_number} is invalid JSON: {exc}") from exc
        if not isinstance(value, dict):
            raise ValueError(f"{path} line {line_number} must be a JSON object")
        records.append(value)
    return records


def _write_json(path: Path, value: Any) -> None:
    path.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def _write_jsonl(path: Path, records: list[dict[str, Any]]) -> None:
    path.write_text(
        "".join(json.dumps(record, sort_keys=True) + "\n" for record in records),
        encoding="utf-8",
    )


def _validate_enum(
    errors: list[str],
    index: int,
    label: dict[str, Any],
    field: str,
    allowed: tuple[str, ...],
) -> None:
    if field in label and label[field] not in allowed:
        errors.append(f"line {index}: {field} must be one of: {', '.join(allowed)}")


def _validate_tag_list(
    errors: list[str],
    index: int,
    label: dict[str, Any],
    field: str,
    allowed: tuple[str, ...],
) -> None:
    if field not in label:
        return
    value = label[field]
    if not isinstance(value, list):
        errors.append(f"line {index}: {field} must be a list")
        return
    for tag in value:
        if tag not in allowed:
            errors.append(f"line {index}: unsupported {field} tag: {tag}")


def _validate_iso_datetime(errors: list[str], index: int, value: str) -> None:
    normalized = value
    if normalized.endswith("Z"):
        normalized = f"{normalized[:-1]}+00:00"
    try:
        datetime.fromisoformat(normalized)
    except ValueError:
        errors.append(f"line {index}: created_at must be an ISO datetime string")


def _now_iso() -> str:
    return datetime.utcnow().replace(microsecond=0).isoformat() + "Z"


def _enum_counts(counts: Counter[str], values: tuple[str, ...]) -> dict[str, int]:
    return {value: counts.get(value, 0) for value in values}
