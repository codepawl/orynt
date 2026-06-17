"""Local PR-style screenshot regression review workflow."""

from __future__ import annotations

import json
import shutil
import time
import webbrowser
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from pawlbench_design.preference_critic import read_json, write_json
from pawlbench_design.ui_loop import (
    LOOP_MANUAL_LABEL_SCHEMA_VERSION,
    critique_from_metrics,
    deterministic_metric_deltas,
    deterministic_quality_score,
    load_manual_review_labels,
    preference_from_delta,
    regression_summary,
    to_float,
    write_screenshot_diff,
)


PR_REVIEW_INPUT_SCHEMA_VERSION = "ui_pr_review_v0_input_v1"
PR_REVIEW_REPORT_SCHEMA_VERSION = "ui_pr_review_v0_report_v1"
PR_REVIEW_CRITIC_SCHEMA_VERSION = "ui_pr_review_v0_critic_review_v1"
PR_REVIEW_PATCH_SUMMARY_SCHEMA_VERSION = "ui_pr_review_v0_patch_summary_v1"
PR_REVIEW_PILOT_SCHEMA_VERSION = "ui_pr_review_v0_pilot_v1"
PR_REVIEW_PILOT_REPORT_SCHEMA_VERSION = "ui_pr_review_v0_pilot_report_v1"
PR_REVIEW_CI_ARTIFACT_CONTRACT_SCHEMA_VERSION = "ui_pr_review_v0_ci_artifact_contract_v1"
PR_REVIEW_TRIAL_CASE_SCHEMA_VERSION = "ui_pr_review_v0_real_trial_case_v1"
PR_REVIEW_TRIAL_REVIEWER_LABEL_SCHEMA_VERSION = "ui_pr_review_v0_reviewer_label_v1"
PR_REVIEW_TRIAL_REPORT_SCHEMA_VERSION = "ui_pr_review_v0_real_trial_report_v1"
SUPPORTED_PR_REVIEW_MODES = {"render", "screenshots-only"}
PR_REVIEW_DECISIONS = {
    "approve_visual",
    "request_changes",
    "needs_manual_review",
    "blocked_missing_artifacts",
}


@dataclass(frozen=True)
class PrReviewConfig:
    review_id: str
    before: Path | None = None
    after: Path | None = None
    patch_diff: Path | None = None
    output_dir: Path = Path("reports/ui_pr_review_v0")
    mode: str = "render"
    reviewer_id: str = ""
    open_report: bool = False
    review_root: Path = Path("data/pr_review_v0")
    viewport_width: int = 1440
    viewport_height: int = 900


@dataclass(frozen=True)
class PrReviewPilotConfig:
    config_path: Path = Path("data/pr_review_v0/codepawl_web_pilot/metadata.json")
    output_dir: Path = Path("reports/ui_pr_review_v0/codepawl_web_pilot")
    reviewer_id: str = ""
    open_report: bool = False


@dataclass(frozen=True)
class PrReviewTrialConfig:
    trial_root: Path = Path("data/pr_review_v0/real_pr_trial")
    output_dir: Path = Path("reports/ui_pr_review_v0/real_pr_trial")
    reviewer_id: str = ""
    open_report: bool = False
    viewport_width: int = 1440
    viewport_height: int = 900


def run_pr_review(config: PrReviewConfig) -> dict[str, Any]:
    start = time.perf_counter()
    if config.mode not in SUPPORTED_PR_REVIEW_MODES:
        supported = ", ".join(sorted(SUPPORTED_PR_REVIEW_MODES))
        raise ValueError(f"unsupported PR review mode {config.mode!r}; expected one of: {supported}")
    review_id = validate_review_id(config.review_id)
    output_dir = resolve_output_dir(config.output_dir, review_id)
    output_dir.mkdir(parents=True, exist_ok=True)
    review_dir = config.review_root.expanduser().resolve() / review_id
    metadata = load_review_metadata(review_dir)
    review_input, input_errors = build_review_input(config, review_dir, metadata)
    artifacts, artifact_errors = collect_review_artifacts(config, review_input, output_dir)
    review_metadata = copy_optional_file(review_input.get("metadata_path"), output_dir / "review_metadata.json")
    errors = input_errors + artifact_errors

    before_metrics = read_optional_json(artifacts.get("before_metrics_path"))
    after_metrics = read_optional_json(artifacts.get("after_metrics_path"))
    missing = severe_missing_artifacts(artifacts, before_metrics, after_metrics)
    severe_errors = errors + missing

    before_critique = critique_from_metrics(f"{review_id}__before", before_metrics, "metrics") if before_metrics else {}
    after_critique = critique_from_metrics(f"{review_id}__after", after_metrics, "metrics") if after_metrics else {}
    critic_delta = round(to_float(after_critique.get("overall_score")) - to_float(before_critique.get("overall_score")), 6) if before_critique and after_critique else None
    metric_deltas = deterministic_metric_deltas(before_metrics, after_metrics) if before_metrics and after_metrics else {}
    regressions = regression_summary(before_metrics, after_metrics) if before_metrics and after_metrics else default_regressions()
    visual_regression = bool(
        before_metrics
        and after_metrics
        and (
            to_float(metric_deltas.get("quality_score_delta")) < -0.03
            or (critic_delta is not None and critic_delta < -0.05)
        )
    )
    diff_path, diff_stats = write_review_screenshot_diff(artifacts, output_dir)
    patch_summary = summarize_patch_diff(artifacts.get("patch_diff_path"))
    manual = load_pr_manual_label(review_input, output_dir)
    decision = recommended_decision(
        severe_missing=bool(severe_errors),
        visual_regression=visual_regression,
        regressions=regressions,
        critic_delta=critic_delta,
        metric_deltas=metric_deltas,
        manual=manual,
    )
    thresholds_pass = decision != "blocked_missing_artifacts" and not visual_regression and not any(regressions.values())
    critic_review = {
        "schema_version": PR_REVIEW_CRITIC_SCHEMA_VERSION,
        "review_id": review_id,
        "before": before_critique,
        "after": after_critique,
        "critic_delta": critic_delta,
        "preference_prediction": preference_from_delta(critic_delta or 0.0) if critic_delta is not None else None,
        "deterministic_metric_deltas": metric_deltas,
        "before_deterministic_quality_score": deterministic_quality_score(before_metrics) if before_metrics else None,
        "after_deterministic_quality_score": deterministic_quality_score(after_metrics) if after_metrics else None,
        "regression_flags": regressions | {"visual_regression": visual_regression},
        "valid": bool(before_critique and after_critique),
    }
    write_json(output_dir / "critic_review.json", critic_review)
    write_json(output_dir / "patch_summary.json", patch_summary)
    report = {
        "schema_version": PR_REVIEW_REPORT_SCHEMA_VERSION,
        "valid": bool(not severe_errors and critic_review["valid"]),
        "review_id": review_id,
        "mode": config.mode,
        "input": review_input,
        "output_dir": str(output_dir),
        "reviewer_id": config.reviewer_id or manual.get("reviewer_id") or "",
        "artifact_paths": {
            "before_screenshot": artifacts.get("before_screenshot_path"),
            "after_screenshot": artifacts.get("after_screenshot_path"),
            "screenshot_diff": str(diff_path) if diff_path else None,
            "critic_review_json": str(output_dir / "critic_review.json"),
            "patch_summary_json": str(output_dir / "patch_summary.json"),
            "patch_diff": artifacts.get("patch_diff_path"),
            "before_metrics": artifacts.get("before_metrics_path"),
            "after_metrics": artifacts.get("after_metrics_path"),
            "review_metadata_json": str(review_metadata) if review_metadata else None,
        },
        "severe_missing_artifacts": severe_errors,
        "screenshot_diff_stats": diff_stats,
        "patch_summary": patch_summary,
        "critic_review": critic_review,
        "critic_delta": critic_delta,
        "deterministic_metric_deltas": metric_deltas,
        "regression_flags": regressions | {"visual_regression": visual_regression},
        "regression_thresholds_pass": thresholds_pass,
        "manual_review": manual,
        "recommended_decision": decision,
        "allowed_decisions": sorted(PR_REVIEW_DECISIONS),
        "constraints": {
            "external_apis_used": False,
            "network_required": False,
            "model_training_used": False,
            "cuda_used": False,
            "canonical_datasets_modified": False,
            "dom_aware_jepa_implemented": False,
        },
        "runtime_seconds": round(time.perf_counter() - start, 4),
    }
    report = attach_manual_agreement(report)
    write_json(output_dir / "pr_review_report.json", report)
    (output_dir / "pr_review_report.md").write_text(pr_review_markdown(report), encoding="utf-8")
    if config.open_report:
        try:
            webbrowser.open((output_dir / "pr_review_report.md").resolve().as_uri())
        except Exception:
            pass
    return report


def run_pr_review_pilot(config: PrReviewPilotConfig) -> dict[str, Any]:
    config_path = config.config_path.expanduser().resolve()
    pilot = load_pr_review_pilot_config(config_path)
    errors = validate_pr_review_pilot_config(pilot, config_path)
    output_dir = config.output_dir.expanduser().resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    copy_optional_file(config_path, output_dir / "pilot_metadata.json")
    if errors:
        report = aggregate_pr_review_pilot_reports(
            [],
            pilot_config=pilot,
            config_path=config_path,
            output_dir=output_dir,
            validation_errors=errors,
        )
        write_json(output_dir / "pilot_report.json", report)
        (output_dir / "pilot_report.md").write_text(pr_review_pilot_markdown(report), encoding="utf-8")
        return report

    case_reports: list[dict[str, Any]] = []
    config_dir = config_path.parent
    review_root = config_dir
    for case in pilot.get("cases") or []:
        review_id = validate_review_id(str(case.get("review_id") or ""))
        case_out = output_dir / review_id
        skipped_reason = pilot_case_skipped_reason(case, config_dir)
        if skipped_reason:
            report = write_skipped_pilot_case_report(case, skipped_reason, case_out)
        else:
            report = run_pr_review(
                PrReviewConfig(
                    review_id=review_id,
                    output_dir=output_dir,
                    mode=str(case.get("mode") or "screenshots-only"),
                    reviewer_id=config.reviewer_id,
                    open_report=False,
                    review_root=review_root,
                    viewport_width=int((case.get("viewport") or {}).get("width") or 1440),
                    viewport_height=int((case.get("viewport") or {}).get("height") or 900),
                )
            )
        case_reports.append(attach_pilot_case_context(report, case, config_dir))

    report = aggregate_pr_review_pilot_reports(
        case_reports,
        pilot_config=pilot,
        config_path=config_path,
        output_dir=output_dir,
        validation_errors=[],
    )
    write_json(output_dir / "pilot_report.json", report)
    (output_dir / "pilot_report.md").write_text(pr_review_pilot_markdown(report), encoding="utf-8")
    if config.open_report:
        try:
            webbrowser.open((output_dir / "pilot_report.md").resolve().as_uri())
        except Exception:
            pass
    return report


def run_pr_review_trial(config: PrReviewTrialConfig) -> dict[str, Any]:
    trial_root = config.trial_root.expanduser().resolve()
    output_dir = config.output_dir.expanduser().resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    cases, load_errors = load_pr_review_trial_cases(trial_root)
    case_reports: list[dict[str, Any]] = []
    for case in cases:
        case_id = validate_review_id(str(case.get("case_id") or ""))
        case_dir = Path(str(case["case_dir"]))
        case_out = output_dir / case_id
        validation_errors = validate_pr_review_trial_case(case)
        skipped_reason = "; ".join(validation_errors)
        if skipped_reason:
            report = write_skipped_trial_case_report(case, skipped_reason, case_out)
        else:
            report = run_pr_review(
                PrReviewConfig(
                    review_id=case_id,
                    output_dir=output_dir,
                    mode=str(case.get("mode") or "screenshots-only"),
                    reviewer_id=config.reviewer_id,
                    open_report=False,
                    review_root=trial_root,
                    viewport_width=int((case.get("viewport") or {}).get("width") or config.viewport_width),
                    viewport_height=int((case.get("viewport") or {}).get("height") or config.viewport_height),
                )
            )
        report = attach_trial_case_context(report, case, case_dir)
        case_reports.append(report)

    report = aggregate_pr_review_trial_reports(
        case_reports,
        trial_root=trial_root,
        output_dir=output_dir,
        validation_errors=load_errors,
    )
    write_json(output_dir / "trial_report.json", report)
    (output_dir / "trial_report.md").write_text(pr_review_trial_markdown(report), encoding="utf-8")
    if config.open_report:
        try:
            webbrowser.open((output_dir / "trial_report.md").resolve().as_uri())
        except Exception:
            pass
    return report


def validate_review_id(review_id: str) -> str:
    cleaned = str(review_id or "").strip()
    if not cleaned:
        raise ValueError("--review-id is required")
    if cleaned in {".", ".."} or "/" in cleaned or "\\" in cleaned:
        raise ValueError("review_id must be a simple directory name")
    return cleaned


def load_pr_review_pilot_config(config_path: Path) -> dict[str, Any]:
    if not config_path.is_file():
        raise ValueError(f"pilot config is missing: {config_path}")
    payload = read_json(config_path)
    if not isinstance(payload, dict):
        raise ValueError(f"pilot config must be a JSON object: {config_path}")
    return payload


def load_pr_review_trial_cases(trial_root: Path) -> tuple[list[dict[str, Any]], list[str]]:
    errors: list[str] = []
    if not trial_root.is_dir():
        return [], [f"trial root is missing: {trial_root}"]
    cases: list[dict[str, Any]] = []
    for path in sorted(trial_root.glob("*/metadata.json")):
        try:
            payload = read_json(path)
        except Exception as exc:
            errors.append(f"trial case metadata is unreadable: {path}: {exc}")
            continue
        if not isinstance(payload, dict):
            errors.append(f"trial case metadata must be a JSON object: {path}")
            continue
        case_dir = path.parent.resolve()
        case = dict(payload)
        case.setdefault("case_id", case_dir.name)
        case["case_dir"] = str(case_dir)
        case["metadata_path"] = str(path.resolve())
        cases.append(case)
    if not cases:
        errors.append(f"trial root has no case metadata files: {trial_root}")
    return cases, errors


def validate_pr_review_trial_case(case: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    case_id = str(case.get("case_id") or "").strip()
    try:
        validate_review_id(case_id)
    except ValueError as exc:
        errors.append(str(exc).replace("--review-id", "case_id"))
    if case.get("schema_version") != PR_REVIEW_TRIAL_CASE_SCHEMA_VERSION:
        errors.append(f"unsupported trial case schema_version: {case.get('schema_version')}")
    if not case.get("source_branch") and not case.get("local_identifier"):
        errors.append("source_branch or local_identifier is required")
    if not case.get("route_or_component"):
        errors.append("route_or_component is required")
    mode = str(case.get("mode") or "screenshots-only")
    if mode not in SUPPORTED_PR_REVIEW_MODES:
        errors.append(f"unsupported mode: {mode}")
    case_dir = Path(str(case.get("case_dir") or "."))
    before = entry_from_metadata(case, "before")
    after = entry_from_metadata(case, "after")
    if mode == "screenshots-only":
        for side, entry in (("before", before), ("after", after)):
            screenshot = path_from_entry(entry, "screenshot_path", case_dir)
            if screenshot is None or not screenshot.is_file():
                errors.append(f"{side} screenshot is missing for screenshots-only mode")
            metrics = path_from_entry(entry, "metrics_path", case_dir)
            if metrics is None or not metrics.is_file():
                errors.append(f"{side} metrics are missing for screenshots-only mode")
    else:
        for side, entry in (("before", before), ("after", after)):
            html_path = path_from_entry(entry, "path", case_dir)
            if html_path is None or resolve_project_entry(html_path) is None:
                errors.append(f"{side} HTML/project path is missing or not renderable")
    patch = path_from_entry(case, "patch_diff_path", case_dir)
    if patch is None or not patch.is_file():
        errors.append("patch_diff_path is missing")
    label_path = resolve_trial_reviewer_label_path(case, case_dir)
    if label_path and label_path.is_file():
        label = read_trial_reviewer_label(label_path)
        errors.extend(validate_trial_reviewer_label(label, expected_case_id=case_id))
    return errors


def resolve_trial_reviewer_label_path(case: dict[str, Any], case_dir: Path) -> Path | None:
    path = path_from_entry(case, "reviewer_label_path", case_dir)
    if path is not None:
        return path
    conventional = case_dir / "reviewer_label.json"
    return conventional.resolve() if conventional.is_file() else None


def read_trial_reviewer_label(path: Path) -> dict[str, Any]:
    try:
        payload = read_json(path)
    except Exception as exc:
        return {"_read_error": str(exc), "_path": str(path)}
    return payload if isinstance(payload, dict) else {"_read_error": "reviewer label must be a JSON object", "_path": str(path)}


def validate_trial_reviewer_label(label: dict[str, Any], *, expected_case_id: str | None = None) -> list[str]:
    errors: list[str] = []
    if label.get("_read_error"):
        return [f"reviewer label is unreadable: {label.get('_read_error')}"]
    if label.get("schema_version") != PR_REVIEW_TRIAL_REVIEWER_LABEL_SCHEMA_VERSION:
        errors.append(f"unsupported reviewer label schema_version: {label.get('schema_version')}")
    case_id = str(label.get("case_id") or "").strip()
    if expected_case_id and case_id != expected_case_id:
        errors.append(f"reviewer label case_id {case_id!r} does not match {expected_case_id!r}")
    if label.get("preferred") not in {"before", "after", "tie"}:
        errors.append("reviewer label preferred must be before, after, or tie")
    for key in ("critic_decision_agree", "visual_regression_missed", "false_positive"):
        if not isinstance(label.get(key), bool):
            errors.append(f"reviewer label {key} must be boolean")
    if not str(label.get("reviewer_id") or "").strip():
        errors.append("reviewer label reviewer_id is required")
    if not str(label.get("created_at") or "").strip():
        errors.append("reviewer label created_at is required")
    return errors


def validate_pr_review_pilot_config(pilot: dict[str, Any], config_path: Path | None = None) -> list[str]:
    errors: list[str] = []
    if pilot.get("schema_version") != PR_REVIEW_PILOT_SCHEMA_VERSION:
        errors.append(f"unsupported pilot schema_version: {pilot.get('schema_version')}")
    cases = pilot.get("cases")
    if not isinstance(cases, list):
        return errors + ["pilot cases must be a list"]
    if not 3 <= len(cases) <= 5:
        errors.append("pilot must define 3-5 cases")
    seen: set[str] = set()
    config_dir = config_path.parent if config_path is not None else Path(".")
    for index, case in enumerate(cases):
        if not isinstance(case, dict):
            errors.append(f"case {index} must be a JSON object")
            continue
        review_id = str(case.get("review_id") or "").strip()
        try:
            validate_review_id(review_id)
        except ValueError as exc:
            errors.append(f"case {index}: {exc}")
        if review_id in seen:
            errors.append(f"case {index}: duplicate review_id {review_id!r}")
        seen.add(review_id)
        if not case.get("route") and not case.get("component_name"):
            errors.append(f"case {review_id or index}: route or component_name is required")
        mode = case.get("mode")
        if mode not in SUPPORTED_PR_REVIEW_MODES:
            errors.append(f"case {review_id or index}: unsupported mode {mode!r}")
        viewport = case.get("viewport") or {}
        if not isinstance(viewport, dict) or not viewport.get("width") or not viewport.get("height"):
            errors.append(f"case {review_id or index}: viewport width and height are required")
        artifacts = case.get("expected_artifact_paths") or {}
        if not isinstance(artifacts, dict):
            errors.append(f"case {review_id or index}: expected_artifact_paths must be an object")
        elif not artifacts.get("pr_review_report_json") or not artifacts.get("pr_review_report_md"):
            errors.append(f"case {review_id or index}: expected report artifact paths are required")
        if case.get("skip"):
            continue
        if mode == "screenshots-only":
            if not case.get("before_screenshot_path"):
                errors.append(f"case {review_id or index}: before_screenshot_path is required")
            if not case.get("after_screenshot_path"):
                errors.append(f"case {review_id or index}: after_screenshot_path is required")
        elif mode == "render":
            if not case.get("before_url") and not case.get("before_path"):
                errors.append(f"case {review_id or index}: before_url or before_path is required")
            if not case.get("after_url") and not case.get("after_path"):
                errors.append(f"case {review_id or index}: after_url or after_path is required")
        if case.get("case_metadata_path"):
            metadata = resolve_pilot_path(config_dir, case.get("case_metadata_path"))
            if not metadata.is_file():
                errors.append(f"case {review_id or index}: case metadata is missing: {metadata}")
        for path_key in ("before_path", "after_path"):
            if case.get(path_key) and not resolve_pilot_path(config_dir, case.get(path_key)).is_file():
                errors.append(f"case {review_id or index}: {path_key} is missing: {case.get(path_key)}")
    return errors


def validate_pr_review_ci_artifacts(artifact_dir: Path, scale_gate_report: Path) -> dict[str, Any]:
    """Validate the CI artifact contract without running GitHub Actions."""
    root = artifact_dir.expanduser().resolve()
    gate_path = scale_gate_report.expanduser().resolve()
    errors: list[str] = []
    warnings: list[str] = []
    review_results: list[dict[str, Any]] = []

    if not root.is_dir():
        errors.append(f"artifact directory is missing: {root}")

    gate: dict[str, Any] = {}
    if not gate_path.is_file():
        errors.append(f"scale gate report is missing: {gate_path}")
    else:
        try:
            loaded = read_json(gate_path)
            gate = loaded if isinstance(loaded, dict) else {}
        except Exception as exc:
            errors.append(f"scale gate report is unreadable: {gate_path}: {exc}")
        if gate:
            if gate.get("target") != "pr-review":
                errors.append(f"scale gate target must be pr-review, got {gate.get('target')!r}")
            if gate.get("target_ready") is not True:
                errors.append("scale gate target_ready must be true")

    pilot_report_path = root / "pilot_report.json"
    if pilot_report_path.is_file():
        try:
            pilot = read_json(pilot_report_path)
        except Exception as exc:
            pilot = {}
            errors.append(f"pilot report is unreadable: {pilot_report_path}: {exc}")
        pilot_md = root / "pilot_report.md"
        pilot_metadata = root / "pilot_metadata.json"
        if not pilot_md.is_file():
            errors.append(f"pilot Markdown report is missing: {pilot_md}")
        if not pilot_metadata.is_file():
            errors.append(f"pilot metadata artifact is missing: {pilot_metadata}")
        if pilot and pilot.get("valid") is not True:
            errors.append("pilot report must be valid for CI artifact upload")
        if pilot and pilot.get("skipped_count", 0) != 0:
            errors.append("pilot report must not contain skipped cases for CI artifact upload")
        items = pilot.get("artifact_paths") if isinstance(pilot, dict) else None
        if not isinstance(items, list) or not items:
            errors.append("pilot report must list per-case artifact paths")
        else:
            for item in items:
                if not isinstance(item, dict):
                    errors.append("pilot artifact path entry must be an object")
                    continue
                if item.get("skipped"):
                    errors.append(f"pilot case {item.get('review_id')} is skipped")
                output_dir = Path(str(item.get("output_dir") or ""))
                case_dir = output_dir if output_dir.is_absolute() else root / output_dir
                case_result = validate_pr_review_case_artifacts(case_dir)
                review_results.append(case_result)
                errors.extend(case_result["errors"])
                warnings.extend(case_result["warnings"])
    else:
        case_result = validate_pr_review_case_artifacts(root)
        review_results.append(case_result)
        errors.extend(case_result["errors"])
        warnings.extend(case_result["warnings"])

    return {
        "schema_version": PR_REVIEW_CI_ARTIFACT_CONTRACT_SCHEMA_VERSION,
        "valid": not errors,
        "artifact_dir": str(root),
        "scale_gate_report": str(gate_path),
        "errors": errors,
        "warnings": warnings,
        "review_artifacts": review_results,
        "required_artifacts": [
            "pr_review_report.json",
            "pr_review_report.md",
            "scale_gate_pr_review.json",
            "before.png",
            "after.png",
            "review_metadata.json or pilot_metadata.json",
        ],
        "optional_artifacts_checked_when_declared": [
            "screenshot_diff.png",
            "critic_review.json",
            "patch_summary.json",
            "patch.diff",
        ],
    }


def validate_pr_review_case_artifacts(case_dir: Path) -> dict[str, Any]:
    case_dir = case_dir.expanduser().resolve()
    errors: list[str] = []
    warnings: list[str] = []
    report_path = case_dir / "pr_review_report.json"
    report_md = case_dir / "pr_review_report.md"
    report: dict[str, Any] = {}
    if not report_path.is_file():
        errors.append(f"PR review JSON report is missing: {report_path}")
    else:
        try:
            loaded = read_json(report_path)
            report = loaded if isinstance(loaded, dict) else {}
        except Exception as exc:
            errors.append(f"PR review JSON report is unreadable: {report_path}: {exc}")
    if not report_md.is_file():
        errors.append(f"PR review Markdown report is missing: {report_md}")

    if report:
        if report.get("valid") is not True:
            errors.append(f"PR review report must be valid: {report_path}")
        if report.get("output_dir") and Path(str(report["output_dir"])).expanduser().resolve() != case_dir:
            errors.append(f"PR review output_dir is not stable for artifact directory: {report.get('output_dir')}")
        artifacts = report.get("artifact_paths") or {}
        for label in ("before_screenshot", "after_screenshot"):
            path = resolve_ci_artifact_path(case_dir, artifacts.get(label), default_name=f"{label.split('_')[0]}.png")
            if not path.is_file():
                errors.append(f"{label} is missing: {path}")
        metadata_path = resolve_ci_artifact_path(case_dir, artifacts.get("review_metadata_json"), default_name="review_metadata.json")
        if not metadata_path.is_file():
            errors.append(f"review metadata artifact is missing: {metadata_path}")
        for label in ("critic_review_json", "patch_summary_json"):
            value = artifacts.get(label)
            path = resolve_ci_artifact_path(case_dir, value, default_name=label.replace("_json", ".json"))
            if not path.is_file():
                errors.append(f"{label} is missing: {path}")
            elif path.suffix == ".json":
                try:
                    read_json(path)
                except Exception as exc:
                    errors.append(f"{label} is unreadable: {path}: {exc}")
        diff_value = artifacts.get("screenshot_diff")
        if diff_value:
            diff_path = resolve_ci_artifact_path(case_dir, diff_value)
            if not diff_path.is_file():
                errors.append(f"screenshot_diff is declared but missing: {diff_path}")
        else:
            warnings.append(f"screenshot_diff is not available for {case_dir.name}")

    return {
        "artifact_dir": str(case_dir),
        "valid": not errors,
        "errors": errors,
        "warnings": warnings,
        "report_json": str(report_path),
        "report_markdown": str(report_md),
    }


def resolve_ci_artifact_path(case_dir: Path, value: Any, default_name: str | None = None) -> Path:
    if value:
        path = Path(str(value)).expanduser()
        if not path.is_absolute():
            path = case_dir / path
        return path.resolve()
    if default_name:
        return (case_dir / default_name).resolve()
    return case_dir.resolve()


def pilot_case_skipped_reason(case: dict[str, Any], config_dir: Path) -> str | None:
    if case.get("skip"):
        return str(case.get("skipped_reason") or "case marked skipped")
    mode = case.get("mode")
    if mode == "screenshots-only":
        for key in ("before_screenshot_path", "after_screenshot_path", "before_metrics_path", "after_metrics_path"):
            value = case.get(key)
            if value and not resolve_pilot_path(config_dir, value).is_file():
                return f"missing configured {key}: {value}"
    if case.get("case_metadata_path") and not resolve_pilot_path(config_dir, case.get("case_metadata_path")).is_file():
        return f"missing case metadata: {case.get('case_metadata_path')}"
    return None


def write_skipped_pilot_case_report(case: dict[str, Any], skipped_reason: str, output_dir: Path) -> dict[str, Any]:
    review_id = str(case.get("review_id") or "unknown")
    output_dir.mkdir(parents=True, exist_ok=True)
    report = {
        "schema_version": PR_REVIEW_REPORT_SCHEMA_VERSION,
        "valid": False,
        "review_id": review_id,
        "mode": case.get("mode"),
        "output_dir": str(output_dir),
        "route": case.get("route"),
        "component_name": case.get("component_name"),
        "skipped": True,
        "skipped_reason": skipped_reason,
        "artifact_paths": {
            "before_screenshot": None,
            "after_screenshot": None,
            "screenshot_diff": None,
            "critic_review_json": None,
            "patch_summary_json": None,
            "patch_diff": None,
            "before_metrics": None,
            "after_metrics": None,
        },
        "severe_missing_artifacts": [skipped_reason],
        "critic_delta": None,
        "regression_flags": default_regressions() | {"visual_regression": False},
        "regression_thresholds_pass": False,
        "recommended_decision": "blocked_missing_artifacts",
        "constraints": {
            "external_apis_used": False,
            "network_required": False,
            "model_training_used": False,
            "cuda_used": False,
            "canonical_datasets_modified": False,
            "dom_aware_jepa_implemented": False,
        },
    }
    write_json(output_dir / "pr_review_report.json", report)
    (output_dir / "pr_review_report.md").write_text(pr_review_markdown(report), encoding="utf-8")
    return report


def attach_pilot_case_context(report: dict[str, Any], case: dict[str, Any], config_dir: Path) -> dict[str, Any]:
    enriched = dict(report)
    enriched["route"] = case.get("route")
    enriched["component_name"] = case.get("component_name")
    enriched["pilot_mode"] = case.get("mode")
    enriched["pilot_schema_version"] = case.get("schema_version")
    enriched["before_url"] = case.get("before_url")
    enriched["after_url"] = case.get("after_url")
    enriched["before_path"] = str(resolve_pilot_path(config_dir, case.get("before_path"))) if case.get("before_path") else None
    enriched["after_path"] = str(resolve_pilot_path(config_dir, case.get("after_path"))) if case.get("after_path") else None
    enriched["case_metadata_path"] = str(resolve_pilot_path(config_dir, case.get("case_metadata_path"))) if case.get("case_metadata_path") else None
    return enriched


def aggregate_pr_review_pilot_reports(
    case_reports: list[dict[str, Any]],
    *,
    pilot_config: dict[str, Any],
    config_path: Path,
    output_dir: Path,
    validation_errors: list[str],
) -> dict[str, Any]:
    decisions = {decision: 0 for decision in sorted(PR_REVIEW_DECISIONS)}
    critic_deltas: list[float] = []
    visual_regressions = 0
    accessibility_regressions = 0
    responsive_regressions = 0
    skipped_count = 0
    rendered_count = 0
    artifacts: list[dict[str, Any]] = []
    for report in case_reports:
        decision = report.get("recommended_decision")
        if decision in decisions:
            decisions[decision] += 1
        if report.get("skipped"):
            skipped_count += 1
        if report.get("valid") and not report.get("skipped"):
            rendered_count += 1
        delta = report.get("critic_delta")
        if isinstance(delta, int | float):
            critic_deltas.append(float(delta))
        regressions = report.get("regression_flags") or {}
        visual_regressions += int(bool(regressions.get("visual_regression")))
        accessibility_regressions += int(bool(regressions.get("accessibility_regression")))
        responsive_regressions += int(bool(regressions.get("responsive_regression")))
        artifacts.append(
            {
                "review_id": report.get("review_id"),
                "route": report.get("route"),
                "component_name": report.get("component_name"),
                "before_url": report.get("before_url"),
                "after_url": report.get("after_url"),
                "before_path": report.get("before_path"),
                "after_path": report.get("after_path"),
                "decision": decision,
                "skipped": bool(report.get("skipped")),
                "skipped_reason": report.get("skipped_reason"),
                "output_dir": report.get("output_dir"),
                "artifact_paths": {
                    "pr_review_report_json": str(Path(str(report.get("output_dir") or "")) / "pr_review_report.json") if report.get("output_dir") else None,
                    "pr_review_report_md": str(Path(str(report.get("output_dir") or "")) / "pr_review_report.md") if report.get("output_dir") else None,
                    **(report.get("artifact_paths") or {}),
                },
            }
        )

    useful_for_artifacts = bool(
        not validation_errors
        and len(case_reports) >= 3
        and rendered_count >= 3
        and decisions["blocked_missing_artifacts"] == 0
    )
    discovery = pilot_config.get("web_discovery") or {}
    return {
        "schema_version": PR_REVIEW_PILOT_REPORT_SCHEMA_VERSION,
        "valid": bool(not validation_errors and case_reports),
        "pilot_id": pilot_config.get("pilot_id") or config_path.parent.name,
        "config_path": str(config_path),
        "output_dir": str(output_dir),
        "validation_errors": validation_errors,
        "web_discovery": discovery,
        "case_count": len(case_reports),
        "rendered_count": rendered_count,
        "skipped_count": skipped_count,
        "approve_visual_count": decisions["approve_visual"],
        "request_changes_count": decisions["request_changes"],
        "needs_manual_review_count": decisions["needs_manual_review"],
        "blocked_missing_artifacts_count": decisions["blocked_missing_artifacts"],
        "mean_critic_delta": round(sum(critic_deltas) / len(critic_deltas), 6) if critic_deltas else None,
        "visual_regression_count": visual_regressions,
        "accessibility_regression_count": accessibility_regressions,
        "responsive_regression_count": responsive_regressions,
        "artifact_paths": artifacts,
        "useful_enough_for_github_actions_artifact_integration": useful_for_artifacts,
        "recommended_next_stage": (
            "Add a disabled GitHub Actions artifact-upload job for the PR-review target; keep auto-commenting disabled."
            if useful_for_artifacts
            else "Add real app route screenshots or fix missing pilot artifacts before GitHub Actions artifact integration."
        ),
        "constraints": {
            "external_apis_used": False,
            "network_required": False,
            "model_training_used": False,
            "cuda_used": False,
            "github_actions_enabled": False,
            "dom_aware_jepa_implemented": False,
        },
    }


def pr_review_pilot_markdown(report: dict[str, Any]) -> str:
    lines = [
        "# CodePawl Web PR Review Pilot",
        "",
        f"- Pilot ID: {report.get('pilot_id')}",
        f"- Valid: {report.get('valid')}",
        f"- Cases: {report.get('case_count')}",
        f"- Rendered/screenshots-only cases: {report.get('rendered_count')}",
        f"- Skipped cases: {report.get('skipped_count')}",
        f"- Approve visual: {report.get('approve_visual_count')}",
        f"- Request changes: {report.get('request_changes_count')}",
        f"- Needs manual review: {report.get('needs_manual_review_count')}",
        f"- Blocked missing artifacts: {report.get('blocked_missing_artifacts_count')}",
        f"- Mean critic delta: {report.get('mean_critic_delta')}",
        f"- Useful for GitHub Actions artifact integration: {report.get('useful_enough_for_github_actions_artifact_integration')}",
        f"- Recommended next stage: {report.get('recommended_next_stage')}",
        "",
        "## Web Discovery",
        "",
    ]
    discovery = report.get("web_discovery") or {}
    for key in (
        "web_app_directory",
        "local_dev_command",
        "local_build_command",
        "local_port",
        "route_list",
        "render_flow",
        "sandbox_browser_render_status",
    ):
        lines.append(f"- {key}: {discovery.get(key)}")
    lines.extend(["", "## Cases", ""])
    for item in report.get("artifact_paths") or []:
        lines.extend(
            [
                f"### {item.get('review_id')}",
                "",
                f"- Route/component: {item.get('route') or item.get('component_name')}",
                f"- Before route file: {item.get('before_path')}",
                f"- After route file: {item.get('after_path')}",
                f"- Before URL: {item.get('before_url')}",
                f"- After URL: {item.get('after_url')}",
                f"- Decision: {item.get('decision')}",
                f"- Skipped: {item.get('skipped')}",
                f"- Skipped reason: {item.get('skipped_reason')}",
                f"- Report JSON: {(item.get('artifact_paths') or {}).get('pr_review_report_json')}",
                f"- Report Markdown: {(item.get('artifact_paths') or {}).get('pr_review_report_md')}",
                f"- Before screenshot: {(item.get('artifact_paths') or {}).get('before_screenshot')}",
                f"- After screenshot: {(item.get('artifact_paths') or {}).get('after_screenshot')}",
                f"- Screenshot diff: {(item.get('artifact_paths') or {}).get('screenshot_diff')}",
                "",
            ]
        )
    errors = report.get("validation_errors") or []
    if errors:
        lines.extend(["## Validation Errors", ""])
        lines.extend(f"- {error}" for error in errors)
        lines.append("")
    lines.append("All pilot evidence is local artifact-based. DOM-aware JEPA remains blocked.")
    return "\n".join(lines) + "\n"


def write_skipped_trial_case_report(case: dict[str, Any], skipped_reason: str, output_dir: Path) -> dict[str, Any]:
    case_id = str(case.get("case_id") or "unknown")
    output_dir.mkdir(parents=True, exist_ok=True)
    report = {
        "schema_version": PR_REVIEW_REPORT_SCHEMA_VERSION,
        "valid": False,
        "review_id": case_id,
        "case_id": case_id,
        "mode": case.get("mode") or "screenshots-only",
        "output_dir": str(output_dir),
        "route_or_component": case.get("route_or_component"),
        "source_branch": case.get("source_branch"),
        "local_identifier": case.get("local_identifier"),
        "skipped": True,
        "skipped_reason": skipped_reason,
        "artifact_paths": {
            "before_screenshot": None,
            "after_screenshot": None,
            "screenshot_diff": None,
            "critic_review_json": None,
            "patch_summary_json": None,
            "patch_diff": None,
            "before_metrics": None,
            "after_metrics": None,
            "review_metadata_json": None,
        },
        "severe_missing_artifacts": [skipped_reason],
        "critic_delta": None,
        "regression_flags": default_regressions() | {"visual_regression": False},
        "regression_thresholds_pass": False,
        "manual_review": {"labels_available": False, "status": "pending"},
        "recommended_decision": "blocked_missing_artifacts",
        "constraints": {
            "external_apis_used": False,
            "network_required": False,
            "model_training_used": False,
            "cuda_used": False,
            "canonical_datasets_modified": False,
            "dom_aware_jepa_implemented": False,
        },
    }
    write_json(output_dir / "pr_review_report.json", report)
    (output_dir / "pr_review_report.md").write_text(pr_review_markdown(report), encoding="utf-8")
    return report


def attach_trial_case_context(report: dict[str, Any], case: dict[str, Any], case_dir: Path) -> dict[str, Any]:
    enriched = dict(report)
    case_id = str(case.get("case_id") or report.get("review_id") or "")
    label_path = resolve_trial_reviewer_label_path(case, case_dir)
    label = {}
    label_errors: list[str] = []
    if label_path and label_path.is_file():
        label = read_trial_reviewer_label(label_path)
        label_errors = validate_trial_reviewer_label(label, expected_case_id=case_id)
    enriched.update(
        {
            "case_id": case_id,
            "source_branch": case.get("source_branch"),
            "local_identifier": case.get("local_identifier"),
            "route_or_component": case.get("route_or_component"),
            "case_dir": str(case_dir),
            "case_metadata_path": case.get("metadata_path"),
            "reviewer_label_path": str(label_path) if label_path else None,
            "reviewer_label": label if label and not label_errors else None,
            "reviewer_label_errors": label_errors,
        }
    )
    return enriched


def aggregate_pr_review_trial_reports(
    case_reports: list[dict[str, Any]],
    *,
    trial_root: Path,
    output_dir: Path,
    validation_errors: list[str],
) -> dict[str, Any]:
    decisions = {decision: 0 for decision in sorted(PR_REVIEW_DECISIONS)}
    critic_deltas: list[float] = []
    visual_regressions = 0
    accessibility_regressions = 0
    responsive_regressions = 0
    skipped_count = 0
    reviewed_count = 0
    agreement_count = 0
    false_positive_count = 0
    missed_regression_count = 0
    reviewer_errors: list[str] = []
    artifact_paths: list[dict[str, Any]] = []
    for report in case_reports:
        decision = report.get("recommended_decision")
        if decision in decisions:
            decisions[decision] += 1
        if report.get("skipped"):
            skipped_count += 1
        delta = report.get("critic_delta")
        if isinstance(delta, int | float):
            critic_deltas.append(float(delta))
        regressions = report.get("regression_flags") or {}
        visual_regressions += int(bool(regressions.get("visual_regression")))
        accessibility_regressions += int(bool(regressions.get("accessibility_regression")))
        responsive_regressions += int(bool(regressions.get("responsive_regression")))
        label_errors = report.get("reviewer_label_errors") or []
        reviewer_errors.extend(f"{report.get('case_id')}: {error}" for error in label_errors)
        label = report.get("reviewer_label") or {}
        if label:
            reviewed_count += 1
            agreement_count += int(bool(label.get("critic_decision_agree")))
            false_positive_count += int(bool(label.get("false_positive")))
            missed_regression_count += int(bool(label.get("visual_regression_missed")))
        artifact_paths.append(
            {
                "case_id": report.get("case_id") or report.get("review_id"),
                "source_branch": report.get("source_branch"),
                "local_identifier": report.get("local_identifier"),
                "route_or_component": report.get("route_or_component"),
                "decision": decision,
                "skipped": bool(report.get("skipped")),
                "skipped_reason": report.get("skipped_reason"),
                "reviewed": bool(label),
                "reviewer_label_path": report.get("reviewer_label_path"),
                "output_dir": report.get("output_dir"),
                "artifact_paths": {
                    "pr_review_report_json": str(Path(str(report.get("output_dir") or "")) / "pr_review_report.json") if report.get("output_dir") else None,
                    "pr_review_report_md": str(Path(str(report.get("output_dir") or "")) / "pr_review_report.md") if report.get("output_dir") else None,
                    **(report.get("artifact_paths") or {}),
                },
            }
        )

    agreement_rate = round(agreement_count / reviewed_count, 6) if reviewed_count else None
    false_positive_rate = round(false_positive_count / reviewed_count, 6) if reviewed_count else None
    accessibility_rate = round(accessibility_regressions / max(1, len(case_reports)), 6)
    responsive_rate = round(responsive_regressions / max(1, len(case_reports)), 6)
    thresholds = default_trial_thresholds()
    readiness = decide_pr_review_trial_readiness(
        reviewed_count=reviewed_count,
        agreement_rate=agreement_rate,
        false_positive_rate=false_positive_rate,
        missed_regression_count=missed_regression_count,
        accessibility_regression_rate=accessibility_rate,
        responsive_regression_rate=responsive_rate,
        reviewer_errors=reviewer_errors,
        thresholds=thresholds,
    )
    return {
        "schema_version": PR_REVIEW_TRIAL_REPORT_SCHEMA_VERSION,
        "valid": bool(case_reports and not validation_errors),
        "trial_root": str(trial_root),
        "output_dir": str(output_dir),
        "validation_errors": validation_errors,
        "reviewer_label_errors": reviewer_errors,
        "case_count": len(case_reports),
        "reviewed_count": reviewed_count,
        "skipped_count": skipped_count,
        "approve_visual_count": decisions["approve_visual"],
        "request_changes_count": decisions["request_changes"],
        "needs_manual_review_count": decisions["needs_manual_review"],
        "blocked_missing_artifacts_count": decisions["blocked_missing_artifacts"],
        "critic_vs_reviewer_agreement_count": agreement_count,
        "critic_vs_reviewer_agreement": agreement_rate,
        "false_positive_count": false_positive_count,
        "false_positive_rate": false_positive_rate,
        "missed_regression_count": missed_regression_count,
        "mean_critic_delta": round(sum(critic_deltas) / len(critic_deltas), 6) if critic_deltas else None,
        "visual_regression_count": visual_regressions,
        "accessibility_regression_count": accessibility_regressions,
        "responsive_regression_count": responsive_regressions,
        "accessibility_regression_rate": accessibility_rate,
        "responsive_regression_rate": responsive_rate,
        "artifact_paths": artifact_paths,
        "threshold_recommendations": trial_threshold_recommendations(thresholds, readiness),
        "readiness_decision": readiness["decision"],
        "readiness_reasons": readiness["reasons"],
        "artifact_only_github_workflow_ready": readiness["decision"] == "enable_artifact_only_workflow",
        "constraints": {
            "external_apis_used": False,
            "network_required": False,
            "model_training_used": False,
            "cuda_used": False,
            "github_auto_comments_enabled": False,
            "github_required_check_enabled": False,
            "dom_aware_jepa_implemented": False,
        },
    }


def default_trial_thresholds() -> dict[str, Any]:
    return {
        "min_reviewed_cases": 5,
        "recommended_case_count_range": [5, 10],
        "minimum_reviewer_agreement": 0.8,
        "maximum_false_positive_rate": 0.2,
        "maximum_missed_regression_count": 0,
        "maximum_accessibility_regression_rate": 0.1,
        "maximum_responsive_regression_rate": 0.1,
        "low_confidence_decision": "needs_manual_review",
        "auto_commenting": "disabled",
        "required_check": "disabled",
    }


def decide_pr_review_trial_readiness(
    *,
    reviewed_count: int,
    agreement_rate: float | None,
    false_positive_rate: float | None,
    missed_regression_count: int,
    accessibility_regression_rate: float,
    responsive_regression_rate: float,
    reviewer_errors: list[str],
    thresholds: dict[str, Any] | None = None,
) -> dict[str, Any]:
    thresholds = thresholds or default_trial_thresholds()
    reasons: list[str] = []
    if reviewed_count < int(thresholds["min_reviewed_cases"]):
        reasons.append(f"fewer than {thresholds['min_reviewed_cases']} reviewed real cases")
        return {"decision": "collect_more_real_cases", "reasons": reasons}
    if reviewer_errors:
        reasons.append("reviewer label errors are present")
        return {"decision": "improve_report_ux", "reasons": reasons}
    if missed_regression_count > int(thresholds["maximum_missed_regression_count"]):
        reasons.append("reviewer found missed visual regressions")
        return {"decision": "do_not_productize_yet", "reasons": reasons}
    if accessibility_regression_rate > float(thresholds["maximum_accessibility_regression_rate"]):
        reasons.append("accessibility regression rate is above threshold")
        return {"decision": "do_not_productize_yet", "reasons": reasons}
    if responsive_regression_rate > float(thresholds["maximum_responsive_regression_rate"]):
        reasons.append("responsive regression rate is above threshold")
        return {"decision": "do_not_productize_yet", "reasons": reasons}
    if false_positive_rate is None or false_positive_rate > float(thresholds["maximum_false_positive_rate"]):
        reasons.append("false positive rate is above conservative threshold")
        return {"decision": "tune_thresholds", "reasons": reasons}
    if agreement_rate is None or agreement_rate < float(thresholds["minimum_reviewer_agreement"]):
        reasons.append("critic/reviewer agreement is below threshold")
        return {"decision": "improve_report_ux", "reasons": reasons}
    reasons.append("reviewed real cases meet artifact-only workflow thresholds")
    return {"decision": "enable_artifact_only_workflow", "reasons": reasons}


def trial_threshold_recommendations(thresholds: dict[str, Any], readiness: dict[str, Any]) -> dict[str, Any]:
    return {
        "thresholds": thresholds,
        "current_readiness_decision": readiness.get("decision"),
        "decision_policy": {
            "approve_visual": "Use only when artifacts are complete, no regression flags are set, critic delta is non-negative or reviewer agrees, and confidence is not low.",
            "needs_manual_review": "Prefer this over request_changes when evidence is ambiguous, reviewer agreement is below threshold, or a case lacks completed reviewer labels.",
            "request_changes": "Reserve for clear visual, accessibility, overflow, responsive, or reviewer-confirmed regressions.",
        },
        "github_policy": {
            "artifact_upload": "enable only after readiness_decision is enable_artifact_only_workflow",
            "auto_commenting": "keep disabled",
            "required_check": "keep disabled",
        },
    }


def pr_review_trial_markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Real PR Visual Review Trial",
        "",
        f"- Valid: {report.get('valid')}",
        f"- Cases: {report.get('case_count')}",
        f"- Reviewed: {report.get('reviewed_count')}",
        f"- Skipped: {report.get('skipped_count')}",
        f"- Approve visual: {report.get('approve_visual_count')}",
        f"- Request changes: {report.get('request_changes_count')}",
        f"- Needs manual review: {report.get('needs_manual_review_count')}",
        f"- Blocked missing artifacts: {report.get('blocked_missing_artifacts_count')}",
        f"- Critic/reviewer agreement: {report.get('critic_vs_reviewer_agreement')}",
        f"- False positives: {report.get('false_positive_count')}",
        f"- Missed regressions: {report.get('missed_regression_count')}",
        f"- Mean critic delta: {report.get('mean_critic_delta')}",
        f"- Readiness decision: {report.get('readiness_decision')}",
        f"- Artifact-only workflow ready: {report.get('artifact_only_github_workflow_ready')}",
        "",
        "## Readiness Reasons",
        "",
    ]
    lines.extend(f"- {reason}" for reason in report.get("readiness_reasons") or [])
    lines.extend(["", "## Cases", ""])
    for item in report.get("artifact_paths") or []:
        lines.extend(
            [
                f"### {item.get('case_id')}",
                "",
                f"- Route/component: {item.get('route_or_component')}",
                f"- Source branch/local id: {item.get('source_branch') or item.get('local_identifier')}",
                f"- Decision: {item.get('decision')}",
                f"- Reviewed: {item.get('reviewed')}",
                f"- Skipped: {item.get('skipped')}",
                f"- Skipped reason: {item.get('skipped_reason')}",
                f"- Report JSON: {(item.get('artifact_paths') or {}).get('pr_review_report_json')}",
                f"- Report Markdown: {(item.get('artifact_paths') or {}).get('pr_review_report_md')}",
                f"- Before screenshot: {(item.get('artifact_paths') or {}).get('before_screenshot')}",
                f"- After screenshot: {(item.get('artifact_paths') or {}).get('after_screenshot')}",
                f"- Screenshot diff: {(item.get('artifact_paths') or {}).get('screenshot_diff')}",
                f"- Reviewer label: {item.get('reviewer_label_path')}",
                "",
            ]
        )
    errors = (report.get("validation_errors") or []) + (report.get("reviewer_label_errors") or [])
    if errors:
        lines.extend(["## Validation Errors", ""])
        lines.extend(f"- {error}" for error in errors)
        lines.append("")
    lines.append("Auto-commenting and required PR checks remain disabled. DOM-aware JEPA remains blocked.")
    return "\n".join(lines) + "\n"


def resolve_pilot_path(config_dir: Path, value: Any) -> Path:
    path = Path(str(value or "")).expanduser()
    if not path.is_absolute():
        path = config_dir / path
    return path.resolve()


def resolve_output_dir(output_dir: Path, review_id: str) -> Path:
    resolved = output_dir.expanduser().resolve()
    return resolved if resolved.name == review_id else resolved / review_id


def load_review_metadata(review_dir: Path) -> dict[str, Any]:
    path = review_dir / "metadata.json"
    if not path.is_file():
        return {}
    payload = read_json(path)
    if not isinstance(payload, dict):
        raise ValueError(f"metadata must be a JSON object: {path}")
    return payload


def build_review_input(config: PrReviewConfig, review_dir: Path, metadata: dict[str, Any]) -> tuple[dict[str, Any], list[str]]:
    errors: list[str] = []
    before = entry_from_metadata(metadata, "before")
    after = entry_from_metadata(metadata, "after")
    schema_version = metadata.get("schema_version") or PR_REVIEW_INPUT_SCHEMA_VERSION
    if schema_version == PR_REVIEW_TRIAL_CASE_SCHEMA_VERSION:
        schema_version = PR_REVIEW_INPUT_SCHEMA_VERSION
    before_path = resolve_maybe_path(config.before, review_dir) or path_from_entry(before, "path", review_dir) or conventional_path(review_dir, "before.html")
    after_path = resolve_maybe_path(config.after, review_dir) or path_from_entry(after, "path", review_dir) or conventional_path(review_dir, "after.html")
    patch_diff = resolve_maybe_path(config.patch_diff, review_dir) or path_from_entry(metadata, "patch_diff_path", review_dir) or conventional_path(review_dir, "patch.diff")
    manual_label = path_from_entry(metadata, "manual_label_path", review_dir) or conventional_path(review_dir, "manual_label.json")

    if config.mode == "screenshots-only":
        before_screenshot = path_from_entry(before, "screenshot_path", review_dir) or choose_screenshot_path(config.before, review_dir, "before")
        after_screenshot = path_from_entry(after, "screenshot_path", review_dir) or choose_screenshot_path(config.after, review_dir, "after")
    else:
        before_screenshot = path_from_entry(before, "screenshot_path", review_dir)
        after_screenshot = path_from_entry(after, "screenshot_path", review_dir)

    review_input = {
        "schema_version": schema_version,
        "review_id": config.review_id,
        "review_dir": str(review_dir),
        "mode": config.mode,
        "before": {
            "path": str(before_path) if before_path else None,
            "screenshot_path": str(before_screenshot) if before_screenshot else None,
            "metrics_path": str(path_from_entry(before, "metrics_path", review_dir) or conventional_path(review_dir, "before_metrics.json")),
        },
        "after": {
            "path": str(after_path) if after_path else None,
            "screenshot_path": str(after_screenshot) if after_screenshot else None,
            "metrics_path": str(path_from_entry(after, "metrics_path", review_dir) or conventional_path(review_dir, "after_metrics.json")),
        },
        "patch_diff_path": str(patch_diff) if patch_diff else None,
        "manual_label_path": str(manual_label) if manual_label else None,
        "metadata_path": str(review_dir / "metadata.json") if (review_dir / "metadata.json").is_file() else None,
    }
    errors.extend(validate_pr_review_input(review_input))
    return review_input, errors


def validate_pr_review_input(review_input: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    if review_input.get("schema_version") != PR_REVIEW_INPUT_SCHEMA_VERSION:
        errors.append(f"unsupported input schema_version: {review_input.get('schema_version')}")
    if review_input.get("mode") not in SUPPORTED_PR_REVIEW_MODES:
        errors.append(f"unsupported mode: {review_input.get('mode')}")
    before = review_input.get("before") or {}
    after = review_input.get("after") or {}
    if review_input.get("mode") == "render":
        for side, entry in (("before", before), ("after", after)):
            path = resolve_project_entry(entry.get("path"))
            if path is None or not path.is_file():
                errors.append(f"{side} HTML/project path is missing or not renderable")
    else:
        for side, entry in (("before", before), ("after", after)):
            screenshot = Path(str(entry.get("screenshot_path") or "")).expanduser()
            if not screenshot.is_file():
                errors.append(f"{side} screenshot is missing for screenshots-only mode")
    return errors


def collect_review_artifacts(config: PrReviewConfig, review_input: dict[str, Any], output_dir: Path) -> tuple[dict[str, str | None], list[str]]:
    errors: list[str] = []
    artifacts: dict[str, str | None] = {
        "before_screenshot_path": None,
        "after_screenshot_path": None,
        "before_metrics_path": None,
        "after_metrics_path": None,
        "patch_diff_path": None,
    }
    if config.mode == "render":
        for side in ("before", "after"):
            rendered, render_errors = render_review_side(side, review_input, output_dir, config)
            errors.extend(render_errors)
            artifacts[f"{side}_screenshot_path"] = rendered.get("screenshot_path")
            artifacts[f"{side}_metrics_path"] = rendered.get("metrics_path")
    else:
        for side in ("before", "after"):
            entry = review_input.get(side) or {}
            copied = copy_optional_file(entry.get("screenshot_path"), output_dir / f"{side}.png")
            if copied:
                artifacts[f"{side}_screenshot_path"] = str(copied)
            metrics = copy_optional_file(entry.get("metrics_path"), output_dir / f"{side}_metrics.json")
            if metrics:
                artifacts[f"{side}_metrics_path"] = str(metrics)
    patch = copy_optional_file(review_input.get("patch_diff_path"), output_dir / "patch.diff")
    artifacts["patch_diff_path"] = str(patch) if patch else None
    return artifacts, errors


def render_review_side(side: str, review_input: dict[str, Any], output_dir: Path, config: PrReviewConfig) -> tuple[dict[str, str], list[str]]:
    entry = review_input.get(side) or {}
    html_path = resolve_project_entry(entry.get("path"))
    if html_path is None:
        return {}, [f"{side} HTML/project path is missing or not renderable"]
    try:
        from codepawl_renderer import RenderConfig, render_html_file

        result = render_html_file(
            RenderConfig(
                input_path=html_path,
                output_dir=output_dir / "render" / side,
                viewport_width=config.viewport_width,
                viewport_height=config.viewport_height,
            )
        )
    except Exception as exc:
        return {}, [f"{side} render failed: {exc}"]
    screenshot = shutil.copyfile(result.screenshot_path, output_dir / f"{side}.png")
    metrics = shutil.copyfile(result.metrics_path, output_dir / f"{side}_metrics.json")
    return {"screenshot_path": str(screenshot), "metrics_path": str(metrics)}, []


def write_review_screenshot_diff(artifacts: dict[str, str | None], output_dir: Path) -> tuple[Path | None, dict[str, Any]]:
    before = artifacts.get("before_screenshot_path")
    after = artifacts.get("after_screenshot_path")
    if not before or not after:
        return None, {"available": False, "reason": "missing screenshot"}
    return write_screenshot_diff(Path(before), Path(after), output_dir)


def severe_missing_artifacts(artifacts: dict[str, str | None], before_metrics: dict[str, Any], after_metrics: dict[str, Any]) -> list[str]:
    missing = []
    for key in ("before_screenshot_path", "after_screenshot_path", "before_metrics_path", "after_metrics_path"):
        value = artifacts.get(key)
        if not value or not Path(value).is_file():
            missing.append(f"missing {key}")
    if not before_metrics:
        missing.append("missing or unreadable before metrics")
    if not after_metrics:
        missing.append("missing or unreadable after metrics")
    return missing


def recommended_decision(
    *,
    severe_missing: bool,
    visual_regression: bool,
    regressions: dict[str, bool],
    critic_delta: float | None,
    metric_deltas: dict[str, Any],
    manual: dict[str, Any],
) -> str:
    if severe_missing:
        return "blocked_missing_artifacts"
    if manual.get("labels_available"):
        if manual.get("visual_regression") or manual.get("accessibility_concern") or manual.get("preferred") == "before":
            return "request_changes"
        if manual.get("preferred") == "after" and not visual_regression and not any(regressions.values()):
            return "approve_visual"
        return "needs_manual_review"
    if visual_regression or any(regressions.values()):
        return "request_changes"
    quality_delta = to_float(metric_deltas.get("quality_score_delta"))
    if (critic_delta is not None and critic_delta >= 0.02) or quality_delta >= 0.0:
        return "approve_visual"
    return "needs_manual_review"


def load_pr_manual_label(review_input: dict[str, Any], output_dir: Path) -> dict[str, Any]:
    label_path = Path(str(review_input.get("manual_label_path") or ""))
    labels = load_manual_review_labels(label_path if label_path.is_file() else None)
    completed = labels[0] if labels and labels[0].get("completed") else None
    if completed is None:
        template = {
            "schema_version": LOOP_MANUAL_LABEL_SCHEMA_VERSION,
            "review_id": review_input.get("review_id"),
            "preferred": None,
            "visual_regression": None,
            "accessibility_concern": None,
            "notes": "",
            "reviewer_id": "",
            "provenance": "manual_pr_review",
            "created_at": None,
        }
        write_json(output_dir / "manual_label_template.json", template)
        return {
            "labels_available": False,
            "status": "pending",
            "skipped_reason": "manual PR review label is pending",
            "manual_label_template_path": str(output_dir / "manual_label_template.json"),
            "critic_vs_human_agreement": None,
        }
    critic_preferred = None
    return {
        "labels_available": True,
        "status": "completed",
        "preferred": completed.get("preferred"),
        "visual_regression": bool(completed.get("visual_regression")),
        "accessibility_concern": bool(completed.get("accessibility_concern")),
        "notes": completed.get("notes") or "",
        "reviewer_id": completed.get("reviewer_id") or "",
        "label_path": str(label_path),
        "critic_vs_human_agreement": critic_preferred,
    }


def attach_manual_agreement(report: dict[str, Any]) -> dict[str, Any]:
    manual = report.get("manual_review") or {}
    if not manual.get("labels_available"):
        return report
    expected = (report.get("critic_review") or {}).get("preference_prediction")
    manual["critic_vs_human_agreement"] = bool(expected and manual.get("preferred") == expected)
    report["manual_review"] = manual
    return report


def summarize_patch_diff(path_value: str | None) -> dict[str, Any]:
    path = Path(str(path_value or ""))
    if not path_value or not path.is_file():
        return {
            "schema_version": PR_REVIEW_PATCH_SUMMARY_SCHEMA_VERSION,
            "available": False,
            "path": str(path) if path_value else None,
            "files_changed": 0,
            "added_lines": 0,
            "removed_lines": 0,
        }
    files = set()
    added = 0
    removed = 0
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        if line.startswith("+++ ") or line.startswith("--- "):
            files.add(line[4:])
        elif line.startswith("+") and not line.startswith("+++"):
            added += 1
        elif line.startswith("-") and not line.startswith("---"):
            removed += 1
    return {
        "schema_version": PR_REVIEW_PATCH_SUMMARY_SCHEMA_VERSION,
        "available": True,
        "path": str(path),
        "files_changed": len(files),
        "added_lines": added,
        "removed_lines": removed,
    }


def pr_review_markdown(report: dict[str, Any]) -> str:
    artifacts = report.get("artifact_paths") or {}
    regressions = report.get("regression_flags") or {}
    manual = report.get("manual_review") or {}
    lines = [
        "# PR Screenshot Review v0",
        "",
        f"- Review ID: {report.get('review_id')}",
        f"- Mode: {report.get('mode')}",
        f"- Valid: {report.get('valid')}",
        f"- Decision: {report.get('recommended_decision')}",
        f"- Critic delta: {report.get('critic_delta')}",
        f"- Regression thresholds pass: {report.get('regression_thresholds_pass')}",
        f"- Visual regression: {regressions.get('visual_regression')}",
        f"- Accessibility regression: {regressions.get('accessibility_regression')}",
        f"- Responsive regression: {regressions.get('responsive_regression')}",
        f"- Manual review: {manual.get('status')}",
        "",
        "## Artifacts",
        "",
        f"- Before screenshot: {artifacts.get('before_screenshot')}",
        f"- After screenshot: {artifacts.get('after_screenshot')}",
        f"- Screenshot diff: {artifacts.get('screenshot_diff')}",
        f"- Critic review JSON: {artifacts.get('critic_review_json')}",
        f"- Patch summary JSON: {artifacts.get('patch_summary_json')}",
    ]
    missing = report.get("severe_missing_artifacts") or []
    if missing:
        lines.extend(["", "## Blockers", ""])
        lines.extend(f"- {item}" for item in missing)
    lines.extend(["", "All evidence is local artifact-based. DOM-aware JEPA remains blocked."])
    return "\n".join(lines) + "\n"


def entry_from_metadata(metadata: dict[str, Any], key: str) -> dict[str, Any]:
    value = metadata.get(key) or {}
    return value if isinstance(value, dict) else {"path": value}


def path_from_entry(entry: dict[str, Any], key: str, base: Path) -> Path | None:
    value = entry.get(key)
    return resolve_maybe_path(Path(str(value)), base) if value else None


def resolve_maybe_path(path: Path | None, base: Path) -> Path | None:
    if path is None:
        return None
    candidate = path.expanduser()
    if not candidate.is_absolute():
        candidate = base / candidate
    return candidate.resolve()


def conventional_path(base: Path, name: str) -> Path | None:
    path = (base / name).resolve()
    return path if path.exists() else None


def choose_screenshot_path(explicit: Path | None, review_dir: Path, stem: str) -> Path | None:
    if explicit is not None and explicit.suffix.lower() in {".png", ".jpg", ".jpeg", ".webp"}:
        return resolve_maybe_path(explicit, review_dir)
    for name in (f"{stem}.png", f"{stem}_screenshot.png", f"{stem}.jpg", f"{stem}.jpeg", f"{stem}.webp"):
        path = conventional_path(review_dir, name)
        if path:
            return path
    return None


def resolve_project_entry(value: Any) -> Path | None:
    if not value:
        return None
    path = Path(str(value)).expanduser().resolve()
    if path.is_dir():
        index = path / "index.html"
        return index if index.is_file() else None
    if path.is_file() and path.suffix.lower() == ".html":
        return path
    return None


def copy_optional_file(source: Any, destination: Path) -> Path | None:
    if not source:
        return None
    path = Path(str(source)).expanduser()
    if not path.is_file():
        return None
    destination.parent.mkdir(parents=True, exist_ok=True)
    return Path(shutil.copyfile(path, destination))


def read_optional_json(path_value: str | None) -> dict[str, Any]:
    if not path_value:
        return {}
    path = Path(path_value)
    if not path.is_file():
        return {}
    try:
        payload = read_json(path)
    except (OSError, json.JSONDecodeError):
        return {}
    return payload if isinstance(payload, dict) else {}


def default_regressions() -> dict[str, bool]:
    return {"accessibility_regression": False, "overflow_regression": False, "responsive_regression": False}


def new_manual_pr_label(review_id: str, *, preferred: str | None = None, reviewer_id: str = "", notes: str = "") -> dict[str, Any]:
    return {
        "schema_version": LOOP_MANUAL_LABEL_SCHEMA_VERSION,
        "task_id": review_id,
        "review_id": review_id,
        "preferred": preferred,
        "visual_regression": False,
        "accessibility_concern": False,
        "notes": notes,
        "reviewer_id": reviewer_id,
        "provenance": "manual_pr_review",
        "created_at": datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
    }
