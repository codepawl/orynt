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


def validate_review_id(review_id: str) -> str:
    cleaned = str(review_id or "").strip()
    if not cleaned:
        raise ValueError("--review-id is required")
    if cleaned in {".", ".."} or "/" in cleaned or "\\" in cleaned:
        raise ValueError("review_id must be a simple directory name")
    return cleaned


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
        "schema_version": metadata.get("schema_version") or PR_REVIEW_INPUT_SCHEMA_VERSION,
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
