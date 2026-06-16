"""Closed-loop frontend evaluation harness for synthetic/local UI tasks."""

from __future__ import annotations

import difflib
import json
import math
import random
import shutil
import subprocess
import time
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Callable, TextIO

from PIL import Image, ImageChops

from pawlbench_design.preference_critic import (
    critique_for_screen,
    metrics_feature_dict,
    read_json,
    read_jsonl,
    region_feature_dict,
    write_json,
    write_jsonl,
)


LOOP_TASK_SCHEMA_VERSION = "ui_loop_v0_task_v1"
LOOP_SUMMARY_SCHEMA_VERSION = "ui_loop_v0_summary_v1"
LOOP_INSTRUCTION_SCHEMA_VERSION = "ui_loop_v0_instruction_v1"
LOOP_REPORT_SCHEMA_VERSION = "ui_loop_v0_report_v1"
LOOP_REVIEW_FORM_SCHEMA_VERSION = "ui_loop_v0_manual_review_form_v1"
LOOP_MANUAL_LABEL_SCHEMA_VERSION = "ui_loop_v0_manual_review_label_v1"
LOOP_MANUAL_BATCH_SCHEMA_VERSION = "ui_loop_v0_manual_batch_v1"
LOOP_MANUAL_PATCH_NOTES_SCHEMA_VERSION = "ui_loop_v0_manual_patch_notes_v1"
LOOP_MANUAL_BATCH_REPORT_SCHEMA_VERSION = "ui_loop_v0_manual_batch_report_v1"
SUPPORTED_SETS = {
    "loop_easy_20": {"count": 20, "difficulties": ("easy",)},
    "loop_mixed_50": {"count": 50, "difficulties": ("easy", "medium", "hard")},
    "loop_hard_100": {"count": 100, "difficulties": ("hard",)},
}
SUPPORTED_PATCH_MODES = {"no_op", "instruction_only", "deterministic_patch", "oracle_patch", "manual_patch", "manual_patch_import"}
NON_ORACLE_PATCH_MODES = {"deterministic_patch", "manual_patch", "manual_patch_import"}
ISSUE_TYPES = ("spacing", "contrast", "alignment", "hierarchy")
DEFAULT_VALIDATION_COMMANDS = [
    "UV_NO_SYNC=1 UV_CACHE_DIR=/tmp/uv-cache uv run ui-loop-run data/processed/ui_loop_v0/loop_easy_20 --patch-mode instruction_only",
    "UV_NO_SYNC=1 UV_CACHE_DIR=/tmp/uv-cache uv run ui-loop-run data/processed/ui_loop_v0/loop_easy_20 --patch-mode deterministic_patch --limit 4",
]


@dataclass(frozen=True)
class LoopBuildConfig:
    smoke_dir: Path
    output_dir: Path
    set_name: str = "loop_easy_20"
    seed: int = 42
    limit: int | None = None


@dataclass(frozen=True)
class LoopRunConfig:
    dataset_dir: Path
    output_dir: Path
    preference_report: Path | None = None
    patch_mode: str = "instruction_only"
    limit: int | None = None
    seed: int = 42
    render: bool = True
    include_noop_baseline: bool = True
    manual_patches_dir: Path | None = None
    viewport_width: int = 1440
    viewport_height: int = 900


@dataclass(frozen=True)
class ManualBatchConfig:
    mixed_dataset_dir: Path
    hard_dataset_dir: Path
    output_dir: Path
    contracts_dir: Path = Path("reports/ui_loop_v0/contracts")
    manual_patches_dir: Path = Path("data/manual_patches/ui_loop_v0")
    per_set_count: int = 10
    seed: int = 42
    created_at: str | None = None


@dataclass(frozen=True)
class ManualLabelReviewConfig:
    selection_path: Path = Path("reports/ui_loop_v0_manual_batch/task_selection.json")
    label_dir: Path = Path("reports/ui_loop_v0_manual_batch/manual_review_labels")
    mixed_report_dir: Path = Path("reports/ui_loop_v0_manual_batch/mixed_manual_patch_import")
    hard_report_dir: Path = Path("reports/ui_loop_v0_manual_batch/hard_manual_patch_import")
    manual_patches_dir: Path = Path("data/manual_patches/ui_loop_v0")
    reviewer_id: str = ""
    limit: int | None = None
    only_empty: bool = False
    overwrite: bool = False
    dry_run: bool = False
    open_images: bool = False


def build_loop_dataset(config: LoopBuildConfig) -> dict[str, Any]:
    smoke_dir = config.smoke_dir.expanduser().resolve()
    output_dir = config.output_dir.expanduser().resolve() / config.set_name
    if config.set_name not in SUPPORTED_SETS:
        supported = ", ".join(sorted(SUPPORTED_SETS))
        raise ValueError(f"unsupported loop set {config.set_name!r}; expected one of: {supported}")

    manifest = read_jsonl(smoke_dir / "manifest.jsonl")
    pairs = read_jsonl(smoke_dir / "pairs.jsonl")
    splits = read_json(smoke_dir / "splits.json") if (smoke_dir / "splits.json").is_file() else {}
    screen_by_id = {str(record["screen_id"]): record for record in manifest}
    split_by_group = splits.get("pair_split_by_group") or {}

    candidates = []
    for pair in pairs:
        if pair.get("pair_family") != "original_vs_corrupted":
            continue
        preferred_id = str(pair.get("preferred_screen_id"))
        left_id = str(pair.get("left_screen_id"))
        right_id = str(pair.get("right_screen_id"))
        before_id = right_id if preferred_id == left_id else left_id
        base_id = preferred_id
        before = screen_by_id.get(before_id)
        base = screen_by_id.get(base_id)
        if before is None or base is None:
            continue
        corruption_type = normalize_issue_type(pair.get("corruption_type"))
        if corruption_type not in ISSUE_TYPES:
            continue
        candidates.append(
            {
                "pair": pair,
                "before": before,
                "base": base,
                "difficulty": str(pair.get("difficulty") or "medium"),
                "corruption_type": corruption_type,
            }
        )

    spec = SUPPORTED_SETS[config.set_name]
    selected = select_loop_candidates(
        candidates,
        target_count=int(config.limit or spec["count"]),
        difficulties=tuple(spec["difficulties"]),
        seed=config.seed,
    )
    tasks = [loop_task_record(item, index=index, set_name=config.set_name, split_by_group=split_by_group) for index, item in enumerate(selected)]

    output_dir.mkdir(parents=True, exist_ok=True)
    write_jsonl(output_dir / "tasks.jsonl", tasks)
    summary = {
        "schema_version": LOOP_SUMMARY_SCHEMA_VERSION,
        "set_name": config.set_name,
        "source_dataset": str(smoke_dir),
        "task_count": len(tasks),
        "seed": config.seed,
        "split_counts": dict(Counter(task["split"] for task in tasks)),
        "difficulty_counts": dict(Counter(task["difficulty"] for task in tasks)),
        "corruption_type_counts": dict(Counter(task["corruption_type"] for task in tasks)),
        "label_provenance": "synthetic_local",
        "sets_supported": sorted(SUPPORTED_SETS),
    }
    write_json(output_dir / "summary.json", summary)
    return summary


def build_manual_calibration_batch(config: ManualBatchConfig) -> dict[str, Any]:
    """Select tasks and export Codex-authored copied-artifact patches for Phase 4C."""
    output_dir = config.output_dir.expanduser().resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    created_at = config.created_at or datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    selected = select_manual_calibration_tasks(
        mixed_dataset_dir=config.mixed_dataset_dir,
        hard_dataset_dir=config.hard_dataset_dir,
        contracts_dir=config.contracts_dir,
        per_set_count=config.per_set_count,
        seed=config.seed,
    )
    selection = {
        "schema_version": LOOP_MANUAL_BATCH_SCHEMA_VERSION,
        "seed": config.seed,
        "per_set_count": config.per_set_count,
        "created_at": created_at,
        "task_count": len(selected),
        "tasks": selected,
        "selection_summary": manual_batch_selection_summary(selected),
        "constraints": {
            "external_llm_apis_used": False,
            "model_training_used": False,
            "canonical_datasets_modified": False,
            "oracle_used": False,
        },
    }
    write_json(output_dir / "task_selection.json", selection)
    patch_summary = export_manual_patch_outputs(selection, config.manual_patches_dir, created_at=created_at)
    review_summary = export_manual_review_templates(selection, output_dir / "manual_review_labels", output_dir / "manual_review_index.md")
    combined = combine_manual_batch_reports(
        [],
        selection=selection,
        output_path=output_dir / "combined_manual_patch_report.json",
        label_dir=output_dir / "manual_review_labels",
    )
    return {
        "schema_version": LOOP_MANUAL_BATCH_SCHEMA_VERSION,
        "output_dir": str(output_dir),
        "task_selection_path": str(output_dir / "task_selection.json"),
        "manual_patch_summary": patch_summary,
        "manual_review_summary": review_summary,
        "combined_report_path": str(output_dir / "combined_manual_patch_report.json"),
        "combined_report": combined,
    }


def select_manual_calibration_tasks(
    *,
    mixed_dataset_dir: Path,
    hard_dataset_dir: Path,
    contracts_dir: Path,
    per_set_count: int = 10,
    seed: int = 42,
) -> list[dict[str, Any]]:
    selected: list[dict[str, Any]] = []
    for dataset_dir, source_set in ((mixed_dataset_dir, "loop_mixed_50"), (hard_dataset_dir, "loop_hard_100")):
        tasks = read_jsonl(dataset_dir.expanduser().resolve() / "tasks.jsonl")
        selected.extend(
            manual_calibration_tasks_for_set(
                tasks,
                source_set=source_set,
                contracts_dir=contracts_dir.expanduser().resolve(),
                count=per_set_count,
                seed=seed,
            )
        )
    return selected


def manual_calibration_tasks_for_set(
    tasks: list[dict[str, Any]],
    *,
    source_set: str,
    contracts_dir: Path,
    count: int,
    seed: int,
) -> list[dict[str, Any]]:
    eligible = [
        task
        for task in tasks
        if task.get("provenance_safe_for_non_oracle")
        and "manual_patch_import" in (task.get("patch_mode_allowed") or [])
        and "oracle_patch" not in set(task.get("patch_mode_allowed") or []) - set(SUPPORTED_PATCH_MODES)
    ]
    annotated = [manual_selection_record(task, source_set=source_set, contracts_dir=contracts_dir) for task in eligible]
    rng = random.Random(f"{source_set}:{seed}")
    quotas = issue_quotas(count)
    by_issue: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for record in annotated:
        by_issue[normalize_issue_type(record.get("corruption_type"))].append(record)
    selected: list[dict[str, Any]] = []
    for issue in ISSUE_TYPES:
        bucket = by_issue.get(issue, [])
        if not bucket:
            continue
        rng.shuffle(bucket)
        bucket.sort(key=lambda row: manual_selection_sort_key(row, selected))
        for record in bucket[: quotas.get(issue, 0)]:
            selected.append(record)
    if len(selected) < count:
        chosen = {row["task_id"] for row in selected}
        remainder = [row for row in annotated if row["task_id"] not in chosen]
        rng.shuffle(remainder)
        remainder.sort(key=lambda row: manual_selection_sort_key(row, selected))
        selected.extend(remainder[: count - len(selected)])
    return sorted(selected[:count], key=lambda row: (row["source_loop_set"], row["task_id"]))


def manual_selection_record(task: dict[str, Any], *, source_set: str, contracts_dir: Path) -> dict[str, Any]:
    task_id = str(task["task_id"])
    contract_path = contracts_dir / f"{task_id}.md"
    critic_path = contracts_dir / f"{task_id}.critic.json"
    critic = read_json(critic_path) if critic_path.is_file() else {}
    confidences = [to_float(issue.get("confidence")) for issue in critic.get("issues") or []]
    confidence = max(confidences) if confidences else None
    bucket = "missing"
    if confidence is not None:
        bucket = "high" if confidence >= 0.75 else "medium" if confidence >= 0.4 else "low"
    reason_bits = [
        f"{task.get('corruption_type')} coverage",
        f"{task.get('difficulty')} difficulty",
        f"{severity_bucket(task.get('severity'))} severity",
        str(task.get("holdout_status") or "unknown_holdout_status"),
    ]
    if bucket in {"high", "low"}:
        reason_bits.append(f"{bucket} critic confidence")
    elif bucket == "medium":
        reason_bits.append("medium critic confidence; no high/low confidence metadata available for this task")
    else:
        reason_bits.append("critic confidence metadata missing")
    return {
        "task_id": task_id,
        "source_loop_set": source_set,
        "difficulty": task.get("difficulty"),
        "corruption_type": task.get("corruption_type"),
        "severity": task.get("severity"),
        "known_issue_types": list(task.get("known_issue_types") or []),
        "before_html_path": task.get("before_html_path"),
        "before_screenshot_path": task.get("before_screenshot_path"),
        "contract_path": str(contract_path),
        "critic_json_path": str(critic_path) if critic_path.is_file() else None,
        "selection_reason": "; ".join(reason_bits),
        "critic_confidence": confidence,
        "critic_confidence_bucket": bucket,
        "holdout_status": task.get("holdout_status"),
        "train_template_overlap": bool(task.get("train_template_overlap")),
        "critic_train_overlap": bool(task.get("critic_train_overlap")),
    }


def issue_quotas(count: int) -> dict[str, int]:
    base, extra = divmod(count, len(ISSUE_TYPES))
    return {issue: base + (1 if index < extra else 0) for index, issue in enumerate(ISSUE_TYPES)}


def manual_selection_sort_key(record: dict[str, Any], selected: list[dict[str, Any]]) -> tuple[Any, ...]:
    selected_status = Counter(row.get("holdout_status") for row in selected)
    status = record.get("holdout_status")
    confidence_rank = {"high": 0, "low": 1, "medium": 2, "missing": 3}.get(str(record.get("critic_confidence_bucket")), 4)
    return (
        selected_status.get(status, 0),
        confidence_rank,
        -to_float(record.get("severity")),
        str(record.get("task_id")),
    )


def manual_batch_selection_summary(records: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "task_count": len(records),
        "source_loop_set_counts": dict(Counter(row.get("source_loop_set") for row in records)),
        "corruption_type_counts": dict(Counter(row.get("corruption_type") for row in records)),
        "difficulty_counts": dict(Counter(row.get("difficulty") for row in records)),
        "severity_bucket_counts": dict(Counter(severity_bucket(row.get("severity")) for row in records)),
        "critic_confidence_bucket_counts": dict(Counter(row.get("critic_confidence_bucket") for row in records)),
        "holdout_status_counts": dict(Counter(row.get("holdout_status") for row in records)),
    }


def export_manual_patch_outputs(selection: dict[str, Any], manual_patches_dir: Path, *, created_at: str) -> dict[str, Any]:
    manual_patches_dir = manual_patches_dir.expanduser().resolve()
    exported = 0
    todos = 0
    for task in selection.get("tasks") or []:
        task_id = str(task["task_id"])
        task_dir = manual_patches_dir / task_id
        task_dir.mkdir(parents=True, exist_ok=True)
        before_html = Path(str(task["before_html_path"])).expanduser()
        patched_html = task_dir / "patched.html"
        patch_diff = task_dir / "patch.diff"
        notes_path = task_dir / "notes.json"
        limitations: list[str] = []
        if not before_html.is_file():
            (task_dir / "PATCH_TODO.md").write_text(f"# {task_id}\n\nBefore HTML is missing: {before_html}\n", encoding="utf-8")
            limitations.append("before_html_path missing; patch TODO exported instead of patched.html")
            todos += 1
        else:
            original = before_html.read_text(encoding="utf-8")
            patched, removed = remove_known_jitter_style(original)
            if not removed:
                patched = original
                limitations.append("known CodePawl jitter marker was not found; copied HTML unchanged for manual follow-up")
                (task_dir / "PATCH_TODO.md").write_text(manual_patch_todo_markdown(task), encoding="utf-8")
                todos += 1
            else:
                exported += 1
            patched_html.write_text(patched, encoding="utf-8")
            diff = difflib.unified_diff(
                original.splitlines(keepends=True),
                patched.splitlines(keepends=True),
                fromfile=str(before_html),
                tofile=str(patched_html),
            )
            patch_diff.write_text("".join(diff), encoding="utf-8")
        notes = {
            "schema_version": LOOP_MANUAL_PATCH_NOTES_SCHEMA_VERSION,
            "task_id": task_id,
            "patch_author": "codex",
            "provenance": "manual_codex_patch",
            "created_at": created_at,
            "source_contract_path": task.get("contract_path"),
            "patched_html_path": str(patched_html),
            "patch_summary": "Removed the task-local CodePawl jitter style block from a copied HTML artifact.",
            "edited_files": [str(patched_html)],
            "expected_issue_fixes": list(task.get("known_issue_types") or [task.get("corruption_type")]),
            "known_limitations": limitations,
            "oracle_used": False,
        }
        write_json(notes_path, notes)
    return {
        "manual_patches_dir": str(manual_patches_dir),
        "selected_task_count": len(selection.get("tasks") or []),
        "patched_html_count": exported,
        "todo_count": todos,
        "notes_schema_version": LOOP_MANUAL_PATCH_NOTES_SCHEMA_VERSION,
    }


def manual_patch_todo_markdown(task: dict[str, Any]) -> str:
    return "\n".join(
        [
            f"# Manual Patch TODO: {task['task_id']}",
            "",
            f"- Before HTML: {task.get('before_html_path')}",
            f"- Before screenshot: {task.get('before_screenshot_path')}",
            f"- Contract: {task.get('contract_path')}",
            f"- Expected issue fixes: {', '.join(task.get('known_issue_types') or [str(task.get('corruption_type'))])}",
            "",
            "Apply the contract to `patched.html` using only task-local copied HTML. Do not copy the clean/oracle source.",
        ]
    ) + "\n"


def export_manual_review_templates(selection: dict[str, Any], label_dir: Path, index_path: Path) -> dict[str, Any]:
    label_dir = label_dir.expanduser().resolve()
    index_path = index_path.expanduser().resolve()
    label_dir.mkdir(parents=True, exist_ok=True)
    lines = ["# UI Loop v0 Manual Batch Review Index", "", "Fill `preferred` with `before`, `after`, or `tie` after inspecting local screenshots and diffs.", ""]
    for task in selection.get("tasks") or []:
        task_id = str(task["task_id"])
        patch_dir = Path("data/manual_patches/ui_loop_v0") / task_id
        label_path = label_dir / f"{task_id}.json"
        payload = {
            "task_id": task_id,
            "preferred": None,
            "issue_types_remaining": [],
            "visual_regression": None,
            "accessibility_concern": None,
            "notes": "",
            "reviewer_id": "",
            "provenance": "manual_review",
            "created_at": None,
        }
        write_json(label_path, payload)
        lines.extend(
            [
                f"## {task_id}",
                f"- before screenshot: {task.get('before_screenshot_path')}",
                "- after screenshot: generated by manual_patch_import report after rendering",
                f"- critic JSON: {task.get('critic_json_path')}",
                f"- instruction contract: {task.get('contract_path')}",
                f"- patch diff: {patch_dir / 'patch.diff'}",
                f"- review label file: {label_path}",
                "",
            ]
        )
    index_path.write_text("\n".join(lines), encoding="utf-8")
    return {"label_dir": str(label_dir), "index_path": str(index_path), "template_count": len(selection.get("tasks") or [])}


def load_selected_manual_review_tasks(selection_path: Path) -> list[dict[str, Any]]:
    selection = read_json(selection_path.expanduser().resolve())
    tasks = selection.get("tasks") if isinstance(selection, dict) else None
    if not isinstance(tasks, list):
        raise ValueError(f"manual review selection has no tasks list: {selection_path}")
    return [task for task in tasks if isinstance(task, dict)]


def load_manual_patch_import_task_reports(*report_dirs: Path) -> dict[str, dict[str, Any]]:
    reports: dict[str, dict[str, Any]] = {}
    for report_dir in report_dirs:
        task_dir = report_dir.expanduser().resolve() / "tasks"
        if not task_dir.is_dir():
            continue
        for path in sorted(task_dir.glob("*.json")):
            report = read_json(path)
            task_id = str(report.get("task_id") or "")
            if task_id:
                reports[task_id] = report
    return reports


def manual_review_task_evidence(task: dict[str, Any], report: dict[str, Any] | None, *, label_dir: Path, manual_patches_dir: Path) -> dict[str, Any]:
    task_id = str(task["task_id"])
    before_screenshot = task.get("before_screenshot_path")
    after_screenshot = None
    patch_diff = None
    if report:
        before_screenshot = ((report.get("before") or {}).get("screenshot_path")) or report.get("before_screenshot_path") or before_screenshot
        after_screenshot = ((report.get("after") or {}).get("screenshot_path")) or report.get("after_screenshot_path")
        patch_diff = report.get("patch_diff_path") or ((report.get("patch_details") or {}).get("manual_patch_record") or {}).get("patch_diff_path")
    patch_diff = patch_diff or str(manual_patches_dir.expanduser() / task_id / "patch.diff")
    return {
        "task_id": task_id,
        "label_path": str(label_dir.expanduser() / f"{task_id}.json"),
        "before_screenshot_path": before_screenshot,
        "after_screenshot_path": after_screenshot,
        "patch_diff_path": patch_diff,
    }


def blank_manual_review_label(task_id: str) -> dict[str, Any]:
    return {
        "task_id": task_id,
        "preferred": None,
        "issue_types_remaining": [],
        "visual_regression": None,
        "accessibility_concern": None,
        "notes": "",
        "reviewer_id": "",
        "provenance": "manual_review",
        "created_at": None,
    }


def is_completed_manual_review_label(label: dict[str, Any]) -> bool:
    return str(label.get("preferred") or "").lower() in {"before", "after", "tie"}


def is_empty_manual_review_label(label: dict[str, Any]) -> bool:
    return (
        not is_completed_manual_review_label(label)
        and not list(label.get("issue_types_remaining") or [])
        and label.get("visual_regression") is None
        and label.get("accessibility_concern") is None
        and not str(label.get("notes") or "").strip()
        and not str(label.get("reviewer_id") or "").strip()
        and not str(label.get("created_at") or "").strip()
    )


def parse_manual_review_bool(raw: str, *, existing: Any = None) -> bool | None:
    value = raw.strip().lower()
    if not value:
        return existing if existing in {True, False, None} else None
    if value in {"y", "yes", "true", "t", "1"}:
        return True
    if value in {"n", "no", "false", "f", "0"}:
        return False
    raise ValueError("expected true/false, yes/no, or blank")


def manual_review_label_from_input(
    task_id: str,
    existing: dict[str, Any],
    *,
    reviewer_id: str,
    input_func: Callable[[str], str] = input,
) -> dict[str, Any] | None:
    preference_map = {"a": "after", "b": "before", "t": "tie"}
    while True:
        raw = input_func("Preference [a=after, b=before, t=tie, s=skip]: ").strip().lower()
        if raw == "s":
            return None
        if raw in preference_map:
            preferred = preference_map[raw]
            break
        print("Enter a, b, t, or s.")

    while True:
        try:
            visual_regression = parse_manual_review_bool(input_func("Visual regression? [true/false, blank=unknown]: "), existing=existing.get("visual_regression"))
            break
        except ValueError as exc:
            print(str(exc))
    while True:
        try:
            accessibility_concern = parse_manual_review_bool(input_func("Accessibility concern? [true/false, blank=unknown]: "), existing=existing.get("accessibility_concern"))
            break
        except ValueError as exc:
            print(str(exc))
    notes = input_func("Notes [optional]: ")
    return {
        "task_id": task_id,
        "preferred": preferred,
        "issue_types_remaining": list(existing.get("issue_types_remaining") or []),
        "visual_regression": visual_regression,
        "accessibility_concern": accessibility_concern,
        "notes": notes,
        "reviewer_id": reviewer_id or str(existing.get("reviewer_id") or ""),
        "provenance": "manual_review",
        "created_at": datetime.now().astimezone().replace(microsecond=0).isoformat(),
    }


def combine_manual_label_command(config: ManualLabelReviewConfig) -> str:
    return (
        "UV_NO_SYNC=1 UV_CACHE_DIR=/tmp/uv-cache uv run ui-loop-manual-batch combine "
        f"--selection {config.selection_path} "
        f"--mixed-report {config.mixed_report_dir / 'closed_loop_report.json'} "
        f"--hard-report {config.hard_report_dir / 'closed_loop_report.json'} "
        f"--labels {config.label_dir} "
        "--out reports/ui_loop_v0_manual_batch/combined_manual_patch_report.json"
    )


def review_manual_labels(
    config: ManualLabelReviewConfig,
    *,
    input_func: Callable[[str], str] = input,
    output: TextIO | None = None,
) -> dict[str, Any]:
    out = output

    def emit(message: str = "") -> None:
        print(message, file=out)

    tasks = load_selected_manual_review_tasks(config.selection_path)
    reports = load_manual_patch_import_task_reports(config.mixed_report_dir, config.hard_report_dir)
    label_dir = config.label_dir.expanduser().resolve()
    if not config.dry_run:
        label_dir.mkdir(parents=True, exist_ok=True)

    stats = {"selected_task_count": len(tasks), "visited": 0, "written": 0, "would_write": 0, "skipped": 0, "dry_run": config.dry_run}
    remaining = tasks[: config.limit] if config.limit is not None else tasks
    for index, task in enumerate(remaining, start=1):
        task_id = str(task["task_id"])
        label_path = label_dir / f"{task_id}.json"
        existing = read_json(label_path) if label_path.is_file() else blank_manual_review_label(task_id)
        if config.only_empty and not is_empty_manual_review_label(existing):
            stats["skipped"] += 1
            continue
        if is_completed_manual_review_label(existing) and not config.overwrite:
            stats["skipped"] += 1
            continue

        evidence = manual_review_task_evidence(task, reports.get(task_id), label_dir=label_dir, manual_patches_dir=config.manual_patches_dir)
        emit(f"\n[{index}/{len(remaining)}] {task_id}")
        emit(f"loop set: {task.get('source_loop_set')}")
        emit(f"difficulty: {task.get('difficulty')}")
        emit(f"corruption_type: {task.get('corruption_type')}")
        emit(f"severity: {task.get('severity')}")
        emit(f"known_issue_types: {', '.join(str(item) for item in task.get('known_issue_types') or [])}")
        emit(f"before screenshot: {evidence.get('before_screenshot_path')}")
        emit(f"after screenshot: {evidence.get('after_screenshot_path') or 'missing'}")
        emit(f"patch diff: {evidence.get('patch_diff_path') if Path(str(evidence.get('patch_diff_path'))).expanduser().is_file() else 'missing'}")
        emit(f"label file: {label_path}")
        if config.open_images:
            for path_value in (evidence.get("before_screenshot_path"), evidence.get("after_screenshot_path")):
                if path_value and Path(str(path_value)).expanduser().is_file():
                    subprocess.run(["xdg-open", str(path_value)], check=False)
        label = manual_review_label_from_input(task_id, existing, reviewer_id=config.reviewer_id, input_func=input_func)
        stats["visited"] += 1
        if label is None:
            stats["skipped"] += 1
            continue
        if config.dry_run:
            emit(f"dry-run: would write {label_path}")
            stats["would_write"] += 1
        else:
            write_json(label_path, label)
            stats["written"] += 1

    emit("\nNext combine command:")
    emit(combine_manual_label_command(config))
    return stats


def combine_manual_batch_reports(
    report_paths: list[Path],
    *,
    selection: dict[str, Any] | None = None,
    output_path: Path | None = None,
    label_dir: Path | None = None,
    min_task_count: int = 10,
    min_success_rate: float = 0.5,
    max_regression_rate: float = 0.1,
    min_human_agreement: float = 0.6,
) -> dict[str, Any]:
    reports = [read_json(path.expanduser().resolve()) for path in report_paths if path.expanduser().is_file()]
    evaluated_count = sum(int(report.get("evaluated_task_count") or 0) for report in reports)
    task_count = sum(int(report.get("task_count") or 0) for report in reports)
    skipped_count = sum(int(report.get("skipped_task_count") or 0) for report in reports)
    success_numerators = []
    for report in reports:
        evaluated = int(report.get("evaluated_task_count") or 0)
        rate_value = report.get("manual_patch_success_rate")
        if isinstance(rate_value, int | float):
            success_numerators.append(float(rate_value) * evaluated)
    success_rate = rate(sum(success_numerators), evaluated_count)
    accessibility_rate = rate(
        sum(float(report.get("accessibility_regression_rate_non_oracle", report.get("accessibility_regression_rate") or 0.0) or 0.0) * int(report.get("evaluated_task_count") or 0) for report in reports),
        evaluated_count,
    )
    responsive_rate = rate(
        sum(float(report.get("responsive_regression_rate_non_oracle", report.get("responsive_regression_rate") or 0.0) or 0.0) * int(report.get("evaluated_task_count") or 0) for report in reports),
        evaluated_count,
    )
    labels = load_manual_review_labels(label_dir)
    label_complete = [label for label in labels if str(label.get("preferred") or "") in {"before", "after", "tie"}]
    label_count = len(label_complete)
    agreement_values = [
        value
        for report in reports
        for value in [((report.get("manual_review") or {}).get("critic_vs_human_agreement"))]
        if isinstance(value, int | float)
    ]
    agreement = mean([float(value) for value in agreement_values])
    patch_ready = bool(evaluated_count >= min_task_count and success_rate >= min_success_rate and accessibility_rate <= max_regression_rate and responsive_rate <= max_regression_rate)
    manual_review_ready = bool(label_count >= evaluated_count >= min_task_count and (not agreement_values or agreement >= min_human_agreement))
    blocked_reason = None
    if not patch_ready:
        blocked_reason = "manual patch import count, success rate, or regression thresholds are not satisfied"
    elif not manual_review_ready:
        blocked_reason = "manual review labels are missing or below agreement threshold"
    combined = {
        "schema_version": LOOP_MANUAL_BATCH_REPORT_SCHEMA_VERSION,
        "valid": True,
        "report_paths": [str(path) for path in report_paths],
        "selection_task_count": len((selection or {}).get("tasks") or []),
        "task_count": task_count,
        "evaluated_task_count": evaluated_count,
        "skipped_task_count": skipped_count,
        "manual_patch_success_rate": success_rate if evaluated_count else None,
        "accessibility_regression_rate": accessibility_rate,
        "responsive_regression_rate": responsive_rate,
        "manual_patch_ready": patch_ready,
        "manual_review_ready": manual_review_ready,
        "pr_review_ready": patch_ready and manual_review_ready,
        "blocked_reason": blocked_reason,
        "thresholds": {
            "min_task_count": min_task_count,
            "min_success_rate": min_success_rate,
            "max_regression_rate": max_regression_rate,
            "min_human_agreement": min_human_agreement,
        },
        "manual_review": {
            "label_count": label_count,
            "labels_available": bool(label_count),
            "critic_vs_human_agreement": round(agreement, 6) if agreement_values else None,
            "skipped_reason": None if label_count else "manual review label templates are empty or unfilled",
        },
    }
    if output_path is not None:
        write_json(output_path.expanduser().resolve(), combined)
    return combined


def select_loop_candidates(candidates: list[dict[str, Any]], *, target_count: int, difficulties: tuple[str, ...], seed: int) -> list[dict[str, Any]]:
    eligible = [item for item in candidates if item["difficulty"] in difficulties]
    rng = random.Random(seed)
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for item in sorted(eligible, key=lambda row: str(row["pair"].get("pair_id"))):
        grouped[item["corruption_type"]].append(item)
    for values in grouped.values():
        rng.shuffle(values)
        values.sort(key=lambda row: (str(row["difficulty"]), str(row["pair"].get("pair_id"))))

    selected: list[dict[str, Any]] = []
    issue_order = list(ISSUE_TYPES)
    while len(selected) < target_count and any(grouped.values()):
        for issue in issue_order:
            if grouped[issue]:
                selected.append(grouped[issue].pop(0))
                if len(selected) >= target_count:
                    break
    return sorted(selected, key=lambda row: str(row["pair"].get("pair_id")))


def loop_task_record(item: dict[str, Any], *, index: int, set_name: str, split_by_group: dict[str, str]) -> dict[str, Any]:
    pair = item["pair"]
    before = item["before"]
    base = item["base"]
    corruption_type = item["corruption_type"]
    before_id = str(before["screen_id"])
    base_id = str(base["screen_id"])
    split_group = str(pair.get("split_group") or before.get("split_group") or base_id)
    split = str(split_by_group.get(split_group, "train"))
    clean_source_path = str(base.get("source_path"))
    difficulty = str(pair.get("difficulty") or "medium")
    severity = float(pair.get("severity") or 0.0)
    return {
        "schema_version": LOOP_TASK_SCHEMA_VERSION,
        "task_id": f"{set_name}__{index:04d}__{before_id}",
        "base_screen_id": base_id,
        "before_screen_id": before_id,
        "source_path": str(before.get("source_path")),
        "clean_source_path": clean_source_path,
        "before_html_path": str(before.get("source_path")),
        "before_screenshot_path": str(before.get("screenshot_path")),
        "before_dom_path": str(before.get("dom_path")),
        "before_accessibility_path": str(before.get("accessibility_path")),
        "before_metrics_path": str(before.get("metrics_path")),
        "known_issue_types": [corruption_type],
        "expected_issue_types": [corruption_type],
        "corruption_type": corruption_type,
        "severity": severity,
        "difficulty": difficulty,
        "split": split,
        "expected_patch_scope": {
            "allowed_files": ["after.html"],
            "allowed_issue_types": [corruption_type],
            "source_is_copied_fixture": True,
        },
        "patch_mode_allowed": sorted(SUPPORTED_PATCH_MODES),
        "is_oracle_eligible": Path(clean_source_path).is_file(),
        "has_clean_original_reference": bool(clean_source_path) and Path(clean_source_path).is_file(),
        "provenance_safe_for_non_oracle": True,
        "train_template_overlap": split == "train",
        "critic_train_overlap": split == "train",
        "holdout_status": "holdout_template" if split != "train" else "train_template_overlap",
        "pair_family": str(pair.get("pair_family") or "original_vs_corrupted"),
        "split_group": split_group,
        "pair_id": pair.get("pair_id"),
    }


def validate_loop_task(task: dict[str, Any]) -> list[str]:
    errors = []
    required = (
        "task_id",
        "base_screen_id",
        "source_path",
        "before_html_path",
        "before_screenshot_path",
        "before_dom_path",
        "before_accessibility_path",
        "before_metrics_path",
        "known_issue_types",
        "expected_issue_types",
        "corruption_type",
        "severity",
        "difficulty",
        "split",
        "expected_patch_scope",
        "patch_mode_allowed",
        "is_oracle_eligible",
        "has_clean_original_reference",
        "provenance_safe_for_non_oracle",
        "train_template_overlap",
        "critic_train_overlap",
        "holdout_status",
        "schema_version",
    )
    for field in required:
        if field not in task:
            errors.append(f"missing {field}")
    if task.get("schema_version") != LOOP_TASK_SCHEMA_VERSION:
        errors.append("unexpected schema_version")
    for field in ("before_html_path", "before_screenshot_path", "before_dom_path", "before_accessibility_path", "before_metrics_path"):
        value = task.get(field)
        if value and not Path(str(value)).is_file():
            errors.append(f"missing artifact {field}: {value}")
    allowed_modes = task.get("patch_mode_allowed") or []
    invalid_modes = sorted(str(mode) for mode in allowed_modes if str(mode) not in SUPPORTED_PATCH_MODES)
    if not allowed_modes:
        errors.append("missing patch_mode_allowed")
    if invalid_modes:
        errors.append(f"invalid patch_mode_allowed values: {', '.join(invalid_modes)}")
    if str(task.get("difficulty") or "") not in {"easy", "medium", "hard"}:
        errors.append(f"invalid difficulty: {task.get('difficulty')}")
    if task.get("severity") is None:
        errors.append("missing severity")
    if normalize_issue_type(task.get("corruption_type")) not in ISSUE_TYPES:
        errors.append(f"unsupported corruption_type: {task.get('corruption_type')}")
    return errors


def run_loop(config: LoopRunConfig) -> dict[str, Any]:
    start = time.perf_counter()
    if config.patch_mode not in SUPPORTED_PATCH_MODES:
        supported = ", ".join(sorted(SUPPORTED_PATCH_MODES))
        raise ValueError(f"unsupported patch_mode {config.patch_mode!r}; expected one of: {supported}")

    dataset_dir = config.dataset_dir.expanduser().resolve()
    output_dir = config.output_dir.expanduser().resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    tasks = read_jsonl(dataset_dir / "tasks.jsonl")
    if config.limit is not None:
        tasks = tasks[: max(0, config.limit)]

    preference_report = read_json(config.preference_report.expanduser().resolve()) if config.preference_report and config.preference_report.expanduser().is_file() else {}
    feature_group = str(preference_report.get("best_feature_group") or "metrics")
    per_task = []
    for task in tasks:
        errors = validate_loop_task(task)
        if errors:
            per_task.append(failed_task_report(task, config.patch_mode, errors))
            continue
        per_task.append(run_loop_task(task, config, feature_group, mode=config.patch_mode))
        if config.include_noop_baseline and config.patch_mode != "no_op":
            per_task.append(run_loop_task(task, config, feature_group, mode="no_op"))

    for report in per_task:
        task_path = output_dir / "tasks" / f"{report['task_id']}__{report['patch_mode']}.json"
        write_json(task_path, report)

    aggregate = aggregate_loop_reports(
        per_task,
        dataset_dir=dataset_dir,
        output_dir=output_dir,
        patch_mode=config.patch_mode,
        preference_report=config.preference_report,
        runtime_seconds=round(time.perf_counter() - start, 4),
    )
    write_json(output_dir / "closed_loop_report.json", aggregate)
    (output_dir / "closed_loop_report.md").write_text(loop_report_markdown(aggregate), encoding="utf-8")
    return aggregate


def run_loop_task(task: dict[str, Any], config: LoopRunConfig, feature_group: str, *, mode: str) -> dict[str, Any]:
    task_id = str(task["task_id"])
    work_dir = config.output_dir.expanduser().resolve() / "work" / task_id / mode
    work_dir.mkdir(parents=True, exist_ok=True)
    instruction = critique_to_instruction(task, feature_group=feature_group)
    write_instruction_artifacts(instruction, task, config.output_dir.expanduser().resolve())

    before_metrics = read_json(Path(str(task["before_metrics_path"])))
    before_critique = critique_from_metrics(task["before_screen_id"], before_metrics, feature_group)
    before_score = float(before_critique["overall_score"])
    before_html = Path(str(task["before_html_path"]))
    before_screenshot = Path(str(task["before_screenshot_path"]))

    patch_result = apply_patch_mode(task, instruction, mode=mode, work_dir=work_dir, manual_patches_dir=config.manual_patches_dir)
    after_html = Path(str(patch_result["after_html_path"]))
    skipped = bool(patch_result.get("skipped"))
    if mode in {"instruction_only", "manual_patch", "no_op"} or skipped:
        after_artifacts = {
            "screenshot_path": str(before_screenshot),
            "dom_path": str(task["before_dom_path"]),
            "accessibility_path": str(task["before_accessibility_path"]),
            "metrics_path": str(task["before_metrics_path"]),
            "metrics": before_metrics,
        }
    else:
        after_artifacts = render_after_html(after_html, work_dir, config)

    after_metrics = after_artifacts["metrics"]
    after_screen_id = str(task["before_screen_id"]) if mode in {"instruction_only", "manual_patch", "no_op"} or skipped else f"{task['base_screen_id']}__after"
    after_critique = critique_from_metrics(after_screen_id, after_metrics, feature_group)
    after_score = float(after_critique["overall_score"])
    diff_path, diff_stats = write_screenshot_diff(before_screenshot, Path(str(after_artifacts["screenshot_path"])), work_dir)
    patch_diff_path = write_patch_diff(before_html, after_html, work_dir)
    review_form_path = write_manual_review_form(task, before_critique, after_critique, instruction, patch_diff_path, after_artifacts, config.output_dir.expanduser().resolve(), mode)
    metric_deltas = deterministic_metric_deltas(before_metrics, after_metrics)
    regression_flags = regression_summary(before_metrics, after_metrics)
    issue_changes = issue_head_changes(before_critique, after_critique)
    critic_delta = after_score - before_score
    pass_threshold = 0.05 if mode in NON_ORACLE_PATCH_MODES else 0.0
    improvement_passes = (
        mode in NON_ORACLE_PATCH_MODES
        and not skipped
        and critic_delta >= pass_threshold
        and not regression_flags["accessibility_regression"]
        and not regression_flags["overflow_regression"]
    )
    if mode == "oracle_patch":
        improvement_passes = critic_delta >= 0.0 and not regression_flags["overflow_regression"]
    if mode in {"instruction_only", "no_op"} or skipped:
        improvement_passes = False
    confidence_bucket = critic_confidence_bucket(before_critique)

    return {
        "schema_version": LOOP_REPORT_SCHEMA_VERSION,
        "task_id": task_id,
        "base_screen_id": task["base_screen_id"],
        "before_screen_id": task["before_screen_id"],
        "patch_mode": mode,
        "patch_mode_allowed": task.get("patch_mode_allowed") or [],
        "synthetic_local": True,
        "oracle_excluded_from_non_oracle_claims": mode == "oracle_patch" or bool(patch_result.get("oracle_patch")),
        "provenance_safe_for_non_oracle": bool(task.get("provenance_safe_for_non_oracle")),
        "is_oracle_eligible": bool(task.get("is_oracle_eligible")),
        "has_clean_original_reference": bool(task.get("has_clean_original_reference")),
        "difficulty": task["difficulty"],
        "corruption_type": task["corruption_type"],
        "severity": task.get("severity"),
        "severity_bucket": severity_bucket(task.get("severity")),
        "pair_family": task.get("pair_family") or "original_vs_corrupted",
        "split": task.get("split"),
        "split_group": task.get("split_group"),
        "train_template_overlap": bool(task.get("train_template_overlap")),
        "critic_train_overlap": bool(task.get("critic_train_overlap")),
        "holdout_status": task.get("holdout_status"),
        "metrics_only_confidence_bucket": confidence_bucket,
        "known_issue_types": task["known_issue_types"],
        "expected_issue_types": task.get("expected_issue_types") or task["known_issue_types"],
        "before": {
            "html_path": str(before_html),
            "screenshot_path": str(before_screenshot),
            "dom_path": task["before_dom_path"],
            "accessibility_path": task["before_accessibility_path"],
            "metrics_path": task["before_metrics_path"],
            "critic_score": before_score,
            "critic_json": before_critique,
        },
        "after": {
            "html_path": str(after_html),
            "screenshot_path": str(after_artifacts["screenshot_path"]),
            "dom_path": str(after_artifacts["dom_path"]),
            "accessibility_path": str(after_artifacts["accessibility_path"]),
            "metrics_path": str(after_artifacts["metrics_path"]),
            "critic_score": after_score,
            "critic_json": after_critique,
        },
        "critic_delta": round(critic_delta, 6),
        "deterministic_metric_deltas": metric_deltas,
        "before_deterministic_quality_score": deterministic_quality_score(before_metrics),
        "after_deterministic_quality_score": deterministic_quality_score(after_metrics),
        "issue_head_changes": issue_changes,
        "accessibility_regression": regression_flags["accessibility_regression"],
        "responsive_regression": regression_flags["responsive_regression"],
        "overflow_regression": regression_flags["overflow_regression"],
        "regression_flags": regression_flags,
        "screenshot_diff_path": str(diff_path) if diff_path else None,
        "screenshot_diff_stats": diff_stats,
        "patch_diff_path": str(patch_diff_path) if patch_diff_path else None,
        "instruction_json_path": instruction["artifact_paths"]["json"],
        "instruction_markdown_path": instruction["artifact_paths"]["markdown"],
        "manual_review_form_path": str(review_form_path),
        "patch_success": bool(patch_result["success"]),
        "patch_failure_reason": patch_result.get("failure_reason"),
        "skipped": skipped,
        "skip_reason": patch_result.get("skip_reason"),
        "patch_details": patch_result,
        "improvement_passes_local_threshold": improvement_passes,
    }


def failed_task_report(task: dict[str, Any], mode: str, errors: list[str]) -> dict[str, Any]:
    return {
        "schema_version": LOOP_REPORT_SCHEMA_VERSION,
        "task_id": str(task.get("task_id", "unknown")),
        "patch_mode": mode,
        "synthetic_local": True,
        "patch_success": False,
        "patch_failure_reason": "; ".join(errors),
        "skipped": False,
        "critic_delta": 0.0,
        "improvement_passes_local_threshold": False,
        "accessibility_regression": False,
        "responsive_regression": False,
        "overflow_regression": False,
    }


def critique_from_metrics(screen_id: str, metrics: dict[str, Any], feature_group: str) -> dict[str, Any]:
    screen = {
        "screen_id": screen_id,
        "metrics_features": metrics_feature_dict(metrics),
        "design_token_features": {},
        "region_features": region_feature_dict([]),
    }
    return critique_for_screen(screen, feature_group)


def critique_to_instruction(task: dict[str, Any], *, feature_group: str = "metrics") -> dict[str, Any]:
    metrics = read_json(Path(str(task["before_metrics_path"])))
    critique = critique_from_metrics(str(task["before_screen_id"]), metrics, feature_group)
    issues = sorted(
        critique.get("issues") or [],
        key=lambda item: (-float(item.get("confidence") or 0.0), str(item.get("type"))),
    )
    if not issues:
        issues = [
            {
                "type": normalize_issue_type(task.get("corruption_type")),
                "severity": "medium",
                "confidence": 0.5,
                "instruction": "Inspect the local synthetic corruption and preserve unrelated design choices.",
            }
        ]
    concrete = [instruction_for_issue(issue) for issue in issues]
    allowed_files = list((task.get("expected_patch_scope") or {}).get("allowed_files") or ["after.html"])
    expected_artifacts = {
        "after_html_path": f"reports/ui_loop_v0/work/{task['task_id']}/manual_patch_import/after.html",
        "patch_diff_path": f"data/manual_patches/ui_loop_v0/{task['task_id']}/patch.diff",
        "manual_notes_path": f"data/manual_patches/ui_loop_v0/{task['task_id']}/notes.json",
        "manual_review_label_path": "data/manual_patches/ui_loop_v0/manual_review_labels.jsonl",
    }
    constraints = [
        "Do not call external LLM APIs.",
        "Do not use external services.",
        "Do not edit source fixtures; patch only copied loop work artifacts.",
        "Keep viewport, content, and semantic structure unchanged unless the issue requires a local CSS fix.",
        "Report synthetic/local preference improvement only; do not claim human taste improvement.",
    ]
    payload = {
        "schema_version": LOOP_INSTRUCTION_SCHEMA_VERSION,
        "task_id": task["task_id"],
        "summary": f"Fix {', '.join(sorted({issue['type'] for issue in issues}))} in a local synthetic UI corruption.",
        "ordered_issues": [
            {
                "type": issue.get("type"),
                "severity": issue.get("severity"),
                "confidence": issue.get("confidence"),
                "region_id": issue.get("region_id"),
                "instruction": issue.get("instruction"),
            }
            for issue in issues
        ],
        "concrete_patch_instructions": concrete,
        "allowed_files": allowed_files,
        "source_file_path": task.get("before_html_path"),
        "before_screenshot_path": task.get("before_screenshot_path"),
        "allowed_edit_scope": task.get("expected_patch_scope") or {},
        "do_not_change": constraints,
        "validation_commands": DEFAULT_VALIDATION_COMMANDS,
        "expected_artifact_paths": expected_artifacts,
        "expected_visual_improvement_criteria": [
            "Critic issue count should not increase.",
            "Contrast issue count and overflow metrics should not regress.",
            "Deterministic quality score should stay flat or improve.",
            "Before/after screenshots and metrics must be saved in the loop report.",
        ],
        "work_contract": {
            "Goal": f"Improve local synthetic {task['corruption_type']} defect for {task['task_id']}.",
            "Context": {
                "source_file_path": task.get("before_html_path"),
                "before_screenshot_path": task.get("before_screenshot_path"),
                "critic_review_json_path": "",
                "issue_summary": f"{task['corruption_type']} issue, difficulty={task.get('difficulty')}, severity={task.get('severity')}",
                "allowed_edit_scope": task.get("expected_patch_scope") or {},
            },
            "Constraints": constraints,
            "Done when": [
                "A patched after.html exists or the artifact is instruction-only/manual mode.",
                "After render artifacts and before/after scoring are present.",
                "No accessibility or overflow regression is introduced.",
                "No external services were used.",
            ],
        },
        "critique_json": critique,
        "artifact_paths": {},
    }
    return payload


def instruction_for_issue(issue: dict[str, Any]) -> str:
    issue_type = normalize_issue_type(issue.get("type"))
    if issue_type == "spacing":
        return "Remove synthetic spacing compression and restore the existing page spacing scale, card padding, gaps, and line-height."
    if issue_type == "contrast":
        return "Restore accessible foreground/background contrast using existing palette tokens and keep CTA text legible."
    if issue_type == "alignment":
        return "Remove synthetic transforms or text alignment overrides that push content off the layout grid or viewport."
    if issue_type == "hierarchy":
        return "Restore heading scale, primary CTA salience, font-weight contrast, and secondary text balance."
    return str(issue.get("instruction") or "Make the minimal local CSS fix for the reported issue.")


def instruction_markdown(instruction: dict[str, Any]) -> str:
    contract = instruction["work_contract"]
    lines = [
        f"# {instruction['task_id']}",
        "",
        f"Summary: {instruction['summary']}",
        "",
        "## Ordered Issues",
    ]
    for issue in instruction["ordered_issues"]:
        lines.append(f"- {issue['type']} ({issue['severity']}, confidence={issue['confidence']}): {issue['instruction']}")
    lines.extend(["", "## Concrete Patch Instructions"])
    for item in instruction["concrete_patch_instructions"]:
        lines.append(f"- {item}")
    lines.extend(["", "## Allowed Files"])
    for item in instruction["allowed_files"]:
        lines.append(f"- {item}")
    lines.extend(["", "## Do Not Change"])
    for item in instruction["do_not_change"]:
        lines.append(f"- {item}")
    lines.extend(["", "## Validation Commands"])
    for item in instruction["validation_commands"]:
        lines.append(f"- `{item}`")
    lines.extend(["", "## Expected Visual Improvement Criteria"])
    for item in instruction["expected_visual_improvement_criteria"]:
        lines.append(f"- {item}")
    context = contract["Context"]
    lines.extend(["", "## Codex-Compatible Work Contract", "", "Goal:", str(contract["Goal"]), "", "Context:"])
    if isinstance(context, dict):
        for key, value in context.items():
            lines.append(f"- {key}: {value}")
    else:
        lines.append(str(context))
    lines.extend(["", "Constraints:"])
    for item in contract["Constraints"]:
        lines.append(f"- {item}")
    lines.extend(["", "Done when:"])
    for item in contract["Done when"]:
        lines.append(f"- {item}")
    return "\n".join(lines) + "\n"


def contract_markdown(instruction: dict[str, Any], task: dict[str, Any]) -> str:
    contract = instruction["work_contract"]
    context = dict(contract["Context"])
    context["critic_review_json_path"] = instruction["artifact_paths"]["critic_review_json"]
    lines = [
        f"# Codex Patch Contract: {instruction['task_id']}",
        "",
        "Goal:",
        str(contract["Goal"]),
        "",
        "Context:",
        f"- source file path: {task.get('before_html_path')}",
        f"- before screenshot path: {task.get('before_screenshot_path')}",
        f"- critic review JSON path: {context['critic_review_json_path']}",
        f"- issue summary: {context.get('issue_summary')}",
        f"- allowed edit scope: {task.get('expected_patch_scope')}",
        "",
        "Constraints:",
    ]
    lines.extend(f"- {item}" for item in contract["Constraints"])
    lines.extend(
        [
            "",
            "Done when:",
            "- Patched HTML is saved under the expected manual patch directory or imported by ui-loop-run.",
            "- Before/after score, screenshots, and patch diff are present in the report.",
            "- No accessibility, overflow, or responsive regression is introduced.",
            "- Oracle source files are not copied for non-oracle modes.",
            "",
            "Validation commands:",
        ]
    )
    lines.extend(f"- `{item}`" for item in instruction["validation_commands"])
    lines.extend(["", "Expected artifact paths:"])
    lines.extend(f"- {key}: {value}" for key, value in instruction["expected_artifact_paths"].items())
    lines.extend(["", "Acceptance criteria:"])
    lines.extend(f"- {item}" for item in instruction["expected_visual_improvement_criteria"])
    return "\n".join(lines) + "\n"


def write_instruction_artifacts(instruction: dict[str, Any], task: dict[str, Any], output_dir: Path) -> None:
    instructions_dir = output_dir / "instructions"
    contracts_dir = output_dir / "contracts"
    instructions_dir.mkdir(parents=True, exist_ok=True)
    contracts_dir.mkdir(parents=True, exist_ok=True)
    json_path = instructions_dir / f"{instruction['task_id']}.json"
    md_path = instructions_dir / f"{instruction['task_id']}.md"
    contract_path = contracts_dir / f"{instruction['task_id']}.md"
    critique_path = contracts_dir / f"{instruction['task_id']}.critic.json"
    instruction["artifact_paths"] = {"json": str(json_path), "markdown": str(md_path), "contract": str(contract_path), "critic_review_json": str(critique_path)}
    if isinstance(instruction.get("work_contract", {}).get("Context"), dict):
        instruction["work_contract"]["Context"]["critic_review_json_path"] = str(critique_path)
    write_json(critique_path, instruction["critique_json"])
    md_path.write_text(instruction_markdown(instruction), encoding="utf-8")
    contract_path.write_text(contract_markdown(instruction, task), encoding="utf-8")
    if output_dir.name != "ui_loop_v0" and output_dir.parent.name == "reports":
        canonical_dir = output_dir.parent / "ui_loop_v0" / "contracts"
        canonical_dir.mkdir(parents=True, exist_ok=True)
        canonical_contract_path = canonical_dir / f"{instruction['task_id']}.md"
        canonical_critique_path = canonical_dir / f"{instruction['task_id']}.critic.json"
        canonical_contract_path.write_text(contract_markdown(instruction, task), encoding="utf-8")
        write_json(canonical_critique_path, instruction["critique_json"])
        instruction["artifact_paths"]["canonical_contract"] = str(canonical_contract_path)
        instruction["artifact_paths"]["canonical_critic_review_json"] = str(canonical_critique_path)
    write_json(json_path, instruction)


def apply_patch_mode(task: dict[str, Any], instruction: dict[str, Any], *, mode: str, work_dir: Path, manual_patches_dir: Path | None = None) -> dict[str, Any]:
    before_html = Path(str(task["before_html_path"]))
    after_html = work_dir / "after.html"
    shutil.copyfile(before_html, after_html)
    if mode in {"instruction_only", "manual_patch", "no_op"}:
        return {
            "success": True,
            "patch_mode": mode,
            "after_html_path": str(after_html),
            "patch_applied": False,
            "failure_reason": None,
        }
    if mode == "manual_patch_import":
        manual = load_manual_patch_record(task, manual_patches_dir)
        if not manual.get("available"):
            return {
                "success": False,
                "patch_mode": mode,
                "after_html_path": str(after_html),
                "patch_applied": False,
                "failure_reason": None,
                "skipped": True,
                "skip_reason": manual.get("skip_reason") or "manual patch missing",
                "manual_patch_record": manual,
            }
        source = Path(str(manual["patched_html_path"]))
        shutil.copyfile(source, after_html)
        if manual.get("patch_diff_path"):
            diff_source = Path(str(manual["patch_diff_path"]))
            if diff_source.is_file():
                shutil.copyfile(diff_source, work_dir / "patch.diff")
        return {
            "success": True,
            "patch_mode": mode,
            "after_html_path": str(after_html),
            "patch_applied": True,
            "failure_reason": None,
            "manual_patch_record": manual,
        }
    if mode == "oracle_patch":
        clean = Path(str(task.get("clean_source_path") or ""))
        if not clean.is_file():
            return {"success": False, "patch_mode": mode, "after_html_path": str(after_html), "patch_applied": False, "failure_reason": "clean_source_path missing", "oracle_patch": True}
        shutil.copyfile(clean, after_html)
        return {"success": True, "patch_mode": mode, "after_html_path": str(after_html), "patch_applied": True, "failure_reason": None, "oracle_patch": True}
    html = after_html.read_text(encoding="utf-8")
    patched, removed = remove_known_jitter_style(html)
    if removed:
        after_html.write_text(patched, encoding="utf-8")
        return {
            "success": True,
            "patch_mode": mode,
            "after_html_path": str(after_html),
            "patch_applied": True,
            "patch_family": normalize_issue_type(task.get("corruption_type")),
            "patcher": "remove_known_codepawl_jitter_style",
            "failure_reason": None,
        }
    return {
        "success": False,
        "patch_mode": mode,
        "after_html_path": str(after_html),
        "patch_applied": False,
        "failure_reason": "no known CodePawl jitter style marker found",
    }


def load_manual_patch_record(task: dict[str, Any], manual_patches_dir: Path | None) -> dict[str, Any]:
    if manual_patches_dir is None:
        return {"available": False, "skip_reason": "manual_patches_dir not provided"}
    task_dir = manual_patches_dir.expanduser().resolve() / str(task["task_id"])
    if not task_dir.is_dir():
        return {"available": False, "skip_reason": f"manual patch directory missing: {task_dir}"}
    notes_path = task_dir / "notes.json"
    notes = read_json(notes_path) if notes_path.is_file() else {}
    patched_html = notes.get("patched_html_path")
    patched_project = notes.get("patched_project_path")
    candidates = []
    if patched_html:
        candidates.append(Path(str(patched_html)))
    candidates.extend([task_dir / "after.html", task_dir / "patched.html", task_dir / "index.html"])
    if patched_project:
        project = Path(str(patched_project))
        candidates.extend([project / "index.html", project / "after.html"])
    source = next((path.expanduser().resolve() for path in candidates if path.expanduser().is_file()), None)
    if source is None:
        return {"available": False, "skip_reason": f"manual patched HTML missing under {task_dir}", "notes_path": str(notes_path) if notes_path.is_file() else None}
    patch_diff = task_dir / "patch.diff"
    return {
        "available": True,
        "task_id": task["task_id"],
        "patched_html_path": str(source),
        "patched_project_path": str(patched_project) if patched_project else None,
        "patch_diff_path": str(patch_diff) if patch_diff.is_file() else None,
        "notes_path": str(notes_path) if notes_path.is_file() else None,
        "notes": notes,
        "provenance": notes.get("provenance") or "manual_patch_import",
        "patch_author": notes.get("patch_author"),
        "created_at": notes.get("created_at"),
    }


def remove_known_jitter_style(html: str) -> tuple[str, bool]:
    marker = '<style data-codepawl-jitter="true">'
    marker_index = html.find(marker)
    if marker_index == -1:
        return html, False
    start = html.rfind("<!-- CodePawl jitter:", 0, marker_index)
    if start == -1:
        start = marker_index
    end = html.find("</style>", marker_index)
    if end == -1:
        return html, False
    end += len("</style>")
    while end < len(html) and html[end] in " \t\r\n":
        end += 1
    return html[:start] + html[end:], True


def render_after_html(after_html: Path, work_dir: Path, config: LoopRunConfig) -> dict[str, Any]:
    if not config.render:
        metrics_path = work_dir / "metrics.json"
        metrics = {"render_ok": False, "render_skipped": True}
        write_json(metrics_path, metrics)
        return {
            "screenshot_path": "",
            "dom_path": "",
            "accessibility_path": "",
            "metrics_path": str(metrics_path),
            "metrics": metrics,
        }
    from codepawl_renderer import RenderConfig, render_html_file

    render_dir = work_dir / "render"
    result = render_html_file(
        RenderConfig(
            input_path=after_html,
            output_dir=render_dir,
            viewport_width=config.viewport_width,
            viewport_height=config.viewport_height,
        )
    )
    return {
        "screenshot_path": str(result.screenshot_path),
        "dom_path": str(result.dom_path),
        "accessibility_path": str(result.accessibility_path),
        "metrics_path": str(result.metrics_path),
        "metrics": read_json(result.metrics_path),
    }


def deterministic_quality_score(metrics: dict[str, Any]) -> float:
    contrast = min(0.35, 0.04 * float(metrics.get("contrast_issue_count") or 0.0))
    hierarchy = min(0.2, 0.08 * float(metrics.get("hierarchy_warning_count") or 0.0))
    overflow = 0.18 if metrics.get("has_horizontal_overflow") else 0.0
    overflow += min(0.12, float(metrics.get("max_right_overflow_px") or 0.0) / 500.0)
    fill = float(metrics.get("viewport_fill_ratio") or 0.0)
    fill_penalty = 0.08 if 0.0 < fill < 0.45 else 0.0
    return round(max(0.0, min(1.0, 1.0 - contrast - hierarchy - overflow - fill_penalty)), 6)


def deterministic_metric_deltas(before: dict[str, Any], after: dict[str, Any]) -> dict[str, Any]:
    keys = (
        "contrast_issue_count",
        "min_contrast_ratio",
        "hierarchy_warning_count",
        "horizontal_overflow_px",
        "max_right_overflow_px",
        "viewport_fill_ratio",
        "font_size_ratio",
    )
    return {key: round(to_float(after.get(key)) - to_float(before.get(key)), 6) for key in keys} | {
        "quality_score_delta": round(deterministic_quality_score(after) - deterministic_quality_score(before), 6)
    }


def regression_summary(before: dict[str, Any], after: dict[str, Any]) -> dict[str, bool]:
    accessibility = (
        to_float(after.get("contrast_issue_count")) > to_float(before.get("contrast_issue_count"))
        or (0 < to_float(after.get("min_contrast_ratio")) < max(4.5, to_float(before.get("min_contrast_ratio")) - 0.05) and to_float(after.get("min_contrast_ratio")) < to_float(before.get("min_contrast_ratio")) - 0.05)
    )
    overflow = bool(after.get("has_horizontal_overflow") and not before.get("has_horizontal_overflow")) or to_float(after.get("max_right_overflow_px")) > to_float(before.get("max_right_overflow_px")) + 1
    responsive = overflow or to_float(after.get("horizontal_overflow_px")) > to_float(before.get("horizontal_overflow_px")) + 1
    return {
        "accessibility_regression": accessibility,
        "overflow_regression": overflow,
        "responsive_regression": responsive,
    }


def issue_head_changes(before: dict[str, Any], after: dict[str, Any]) -> dict[str, Any]:
    before_counts = Counter(issue.get("type") for issue in before.get("issues") or [])
    after_counts = Counter(issue.get("type") for issue in after.get("issues") or [])
    return {
        "before_issue_count": sum(before_counts.values()),
        "after_issue_count": sum(after_counts.values()),
        "issue_count_delta": sum(after_counts.values()) - sum(before_counts.values()),
        "by_type": {issue: after_counts.get(issue, 0) - before_counts.get(issue, 0) for issue in ISSUE_TYPES},
    }


def write_patch_diff(before_html: Path, after_html: Path, work_dir: Path) -> Path | None:
    before_lines = before_html.read_text(encoding="utf-8").splitlines(keepends=True)
    after_lines = after_html.read_text(encoding="utf-8").splitlines(keepends=True)
    diff = list(difflib.unified_diff(before_lines, after_lines, fromfile=str(before_html), tofile=str(after_html)))
    if not diff:
        return None
    path = work_dir / "patch.diff"
    path.write_text("".join(diff), encoding="utf-8")
    return path


def write_screenshot_diff(before_screenshot: Path, after_screenshot: Path, work_dir: Path) -> tuple[Path | None, dict[str, Any]]:
    if not before_screenshot.is_file() or not after_screenshot.is_file():
        return None, {"available": False, "reason": "missing screenshot"}
    try:
        with Image.open(before_screenshot).convert("RGB") as before, Image.open(after_screenshot).convert("RGB") as after:
            if before.size != after.size:
                return None, {"available": False, "reason": "screenshot sizes differ", "before_size": before.size, "after_size": after.size}
            diff = ImageChops.difference(before, after)
            bbox = diff.getbbox()
            changed = 0
            if bbox is not None:
                changed = sum(1 for pixel in diff.getdata() if pixel != (0, 0, 0))
            path = work_dir / "screenshot_diff.png"
            diff.save(path)
            total = before.width * before.height
            return path, {"available": True, "changed_pixel_ratio": round(changed / total if total else 0.0, 6), "bbox": bbox}
    except Exception as exc:
        return None, {"available": False, "reason": str(exc)}


def write_manual_review_form(
    task: dict[str, Any],
    before_critique: dict[str, Any],
    after_critique: dict[str, Any],
    instruction: dict[str, Any],
    patch_diff_path: Path | None,
    after_artifacts: dict[str, Any],
    output_dir: Path,
    mode: str,
) -> Path:
    queue_dir = output_dir / "manual_review_queue"
    queue_dir.mkdir(parents=True, exist_ok=True)
    path = queue_dir / f"{task['task_id']}__{mode}.review.json"
    payload = {
        "schema_version": LOOP_REVIEW_FORM_SCHEMA_VERSION,
        "task_id": task["task_id"],
        "patch_mode": mode,
        "before_screenshot_path": task["before_screenshot_path"],
        "after_screenshot_path": after_artifacts["screenshot_path"],
        "critic_json": {"before": before_critique, "after": after_critique},
        "instruction_markdown_path": instruction["artifact_paths"]["markdown"],
        "patch_diff_path": str(patch_diff_path) if patch_diff_path else None,
        "preferred": None,
        "issue_types_remaining": [],
        "visual_regression": False,
        "accessibility_concern": False,
        "notes": "",
        "reviewer_id": "",
        "created_at": "",
        "provenance": {
            "label_source": "manual_future",
            "source_task_provenance": "synthetic_local",
            "allowed_values": {"preferred": ["before", "after", "tie"]},
        },
    }
    write_json(path, payload)
    return path


def aggregate_loop_reports(
    reports: list[dict[str, Any]],
    *,
    dataset_dir: Path,
    output_dir: Path,
    patch_mode: str,
    preference_report: Path | None,
    runtime_seconds: float,
    manual_review_labels: Path | None = None,
) -> dict[str, Any]:
    main = [report for report in reports if report.get("patch_mode") == patch_mode]
    evaluated_main = [report for report in main if not report.get("skipped")]
    noops = [report for report in reports if report.get("patch_mode") == "no_op"]
    non_oracle = [report for report in evaluated_main if not report.get("oracle_excluded_from_non_oracle_claims")]
    oracle = [report for report in evaluated_main if report.get("oracle_excluded_from_non_oracle_claims")]
    deltas = [float(report.get("critic_delta") or 0.0) for report in evaluated_main if report.get("patch_success")]
    non_oracle_deltas = [float(report.get("critic_delta") or 0.0) for report in non_oracle if report.get("patch_success")]
    oracle_deltas = [float(report.get("critic_delta") or 0.0) for report in oracle if report.get("patch_success")]
    noop_deltas = [float(report.get("critic_delta") or 0.0) for report in noops if report.get("patch_success")]
    success_count = sum(1 for report in evaluated_main if report.get("improvement_passes_local_threshold"))
    non_oracle_success_count = sum(1 for report in non_oracle if report.get("improvement_passes_local_threshold"))
    oracle_success_count = sum(1 for report in oracle if report.get("improvement_passes_local_threshold"))
    easy = [report for report in evaluated_main if report.get("difficulty") == "easy"]
    easy_success = sum(1 for report in easy if report.get("improvement_passes_local_threshold"))
    issue_reduction = Counter()
    for report in evaluated_main:
        changes = ((report.get("issue_head_changes") or {}).get("by_type") or {})
        for issue, delta in changes.items():
            if isinstance(delta, int | float) and delta < 0:
                issue_reduction[issue] += abs(int(delta))
    false_noop = any(abs(delta) > 1e-9 for delta in noop_deltas)
    accessibility_rate = rate(sum(1 for report in evaluated_main if report.get("accessibility_regression")), len(evaluated_main))
    responsive_rate = rate(sum(1 for report in evaluated_main if report.get("responsive_regression")), len(evaluated_main))
    non_oracle_accessibility_rate = rate(sum(1 for report in non_oracle if report.get("accessibility_regression")), len(non_oracle))
    non_oracle_responsive_rate = rate(sum(1 for report in non_oracle if report.get("responsive_regression")), len(non_oracle))
    deterministic_or_manual_improves_easy = bool(easy) and rate(easy_success, len(easy)) >= 0.5
    non_oracle_success_rate = rate(non_oracle_success_count, len(non_oracle))
    set_name = dataset_dir.name
    passed_gate = (
        bool(evaluated_main)
        and not false_noop
        and non_oracle_accessibility_rate <= 0.1
        and non_oracle_responsive_rate <= 0.1
        and patch_mode in NON_ORACLE_PATCH_MODES
        and bool(non_oracle)
        and (non_oracle_success_rate >= 0.5 if set_name in {"loop_mixed_50", "loop_hard_100"} else deterministic_or_manual_improves_easy)
    )
    schema_validation = validate_report_schema_safeguards(main, patch_mode)
    if schema_validation:
        passed_gate = False
    labels = load_manual_review_labels(manual_review_labels)
    manual_review = manual_review_agreement(evaluated_main, labels)
    recommendation = recommendation_for_next_stage(
        patch_mode,
        deterministic_or_manual_improves_easy,
        false_noop,
        accessibility_rate,
        responsive_rate,
        set_name=set_name,
        passed_gate=passed_gate,
        has_oracle=bool(oracle),
        has_manual_labels=bool(labels),
    )
    return {
        "schema_version": LOOP_REPORT_SCHEMA_VERSION,
        "valid": bool(main),
        "passed_closed_loop_gate": passed_gate,
        "passed_closed_loop_gate_uses_non_oracle_only": True,
        "synthetic_local": True,
        "dataset_dir": str(dataset_dir),
        "set_name": set_name,
        "output_dir": str(output_dir),
        "preference_report": str(preference_report) if preference_report else None,
        "task_count": len(main),
        "evaluated_task_count": len(evaluated_main),
        "skipped_task_count": len(main) - len(evaluated_main),
        "non_oracle_task_count": len(non_oracle),
        "oracle_task_count": len(oracle),
        "success_rate": rate(success_count, len(evaluated_main)),
        "no_op_success_rate": rate(sum(1 for report in noops if report.get("improvement_passes_local_threshold")), len(noops)),
        "deterministic_non_oracle_success_rate": non_oracle_success_rate if patch_mode == "deterministic_patch" else 0.0,
        "oracle_upper_bound_success_rate": rate(oracle_success_count, len(oracle)),
        "instruction_only_artifact_count": sum(1 for report in reports if report.get("patch_mode") == "instruction_only"),
        "manual_patch_success_rate": non_oracle_success_rate if patch_mode == "manual_patch_import" and evaluated_main else None,
        "mean_critic_delta": round(mean(deltas), 6),
        "mean_critic_delta_non_oracle": round(mean(non_oracle_deltas), 6),
        "mean_critic_delta_oracle": round(mean(oracle_deltas), 6),
        "median_critic_delta": round(median(deltas), 6),
        "noop_baseline": {
            "task_count": len(noops),
            "success_rate": rate(sum(1 for report in noops if report.get("improvement_passes_local_threshold")), len(noops)),
            "mean_critic_delta": round(mean(noop_deltas), 6),
            "median_critic_delta": round(median(noop_deltas), 6),
            "false_improvement_detected": false_noop,
        },
        "issue_reduction_by_type": dict(issue_reduction),
        "accessibility_regression_rate": accessibility_rate,
        "responsive_regression_rate": responsive_rate,
        "accessibility_regression_rate_non_oracle": non_oracle_accessibility_rate,
        "responsive_regression_rate_non_oracle": non_oracle_responsive_rate,
        "patch_mode_breakdown": dict(Counter(report.get("patch_mode") for report in reports)),
        "difficulty_breakdown": breakdown(evaluated_main, "difficulty"),
        "corruption_type_breakdown": breakdown(evaluated_main, "corruption_type"),
        "severity_breakdown": breakdown(evaluated_main, "severity_bucket"),
        "pair_family_breakdown": breakdown(evaluated_main, "pair_family"),
        "issue_type_breakdown": issue_type_breakdown(evaluated_main),
        "patch_mode_diagnostics": breakdown(reports, "patch_mode"),
        "train_overlap_breakdown": breakdown(evaluated_main, "train_template_overlap"),
        "critic_overlap_breakdown": breakdown(evaluated_main, "critic_train_overlap"),
        "holdout_status_breakdown": breakdown(evaluated_main, "holdout_status"),
        "metrics_confidence_breakdown": breakdown(evaluated_main, "metrics_only_confidence_bucket"),
        "special_subsets": special_subset_breakdowns(evaluated_main),
        "schema_validation_errors": schema_validation,
        "patch_mode": patch_mode,
        "examples": {
            "wins": [example_summary(report) for report in sorted(evaluated_main, key=lambda row: float(row.get("critic_delta") or 0.0), reverse=True)[:5]],
            "failures": [example_summary(report) for report in sorted(evaluated_main, key=lambda row: float(row.get("critic_delta") or 0.0))[:5] if not report.get("improvement_passes_local_threshold")],
            "skipped": [example_summary(report) for report in main if report.get("skipped")][:5],
        },
        "manual_review": manual_review,
        "anti_self_grading_safeguards": {
            "deterministic_metrics_reported": True,
            "accessibility_regressions_reported": True,
            "responsive_regressions_reported": True,
            "noop_baseline_included": bool(noops),
            "oracle_upper_bound_separated": any(report.get("oracle_excluded_from_non_oracle_claims") for report in reports),
            "oracle_excluded_from_non_oracle_success_claims": True,
            "manual_review_queue_exported": True,
            "manual_review_label_ingestion_supported": True,
            "claims_limited_to_synthetic_local": True,
        },
        "recommended_next_stage": recommendation,
        "runtime_seconds": runtime_seconds,
    }


def recommendation_for_next_stage(
    patch_mode: str,
    easy_ok: bool,
    false_noop: bool,
    accessibility_rate: float,
    responsive_rate: float,
    *,
    set_name: str = "",
    passed_gate: bool = False,
    has_oracle: bool = False,
    has_manual_labels: bool = False,
) -> str:
    if false_noop:
        return "fix_noop_baseline_or_scoring_before_using_closed_loop_results"
    if accessibility_rate > 0.1 or responsive_rate > 0.1:
        return "critic_score_improved_but_metrics_or_accessibility_regressed_fix_scoring_gate"
    if patch_mode == "oracle_patch":
        return "oracle_upper_bound_only_do_not_claim_closed_loop_product_value"
    if set_name == "loop_easy_20" and patch_mode == "deterministic_patch" and easy_ok:
        return "expand_loop_mixed_50"
    if set_name == "loop_mixed_50" and patch_mode == "deterministic_patch" and passed_gate:
        return "run_manual_codex_patch_workflow_on_selected_mixed_and_hard_tasks"
    if set_name == "loop_hard_100" and patch_mode == "deterministic_patch" and passed_gate:
        return "prepare_pr_review_only_after_manual_review_labels_confirm_metric_wins"
    if patch_mode == "deterministic_patch" and has_oracle:
        return "mixed_or_hard_non_oracle_failed_but_oracle_passed_improve_critique_to_instruction_adapter_or_patcher"
    if patch_mode == "deterministic_patch":
        return "improve_critique_adapter_and_issue_heads"
    if patch_mode == "manual_patch_import" and has_manual_labels:
        return "compare_manual_review_labels_with_critic_before_pr_review"
    return "export_manual_codex_patch_contracts_or_run_deterministic_patch_mode"


def loop_report_markdown(report: dict[str, Any]) -> str:
    lines = [
        "# UI Loop v0 Closed-Loop Report",
        "",
        f"- Valid: {report.get('valid')}",
        f"- Passed closed-loop gate: {report.get('passed_closed_loop_gate')}",
        f"- Patch mode: {report.get('patch_mode')}",
        f"- Task count: {report.get('task_count')}",
        f"- Success rate: {report.get('success_rate')}",
        f"- Non-oracle success rate: {report.get('deterministic_non_oracle_success_rate') or report.get('manual_patch_success_rate')}",
        f"- Oracle upper-bound success rate: {report.get('oracle_upper_bound_success_rate')}",
        f"- Mean critic delta: {report.get('mean_critic_delta')}",
        f"- Mean critic delta non-oracle: {report.get('mean_critic_delta_non_oracle')}",
        f"- No-op false improvement: {(report.get('noop_baseline') or {}).get('false_improvement_detected')}",
        f"- Accessibility regression rate: {report.get('accessibility_regression_rate')}",
        f"- Responsive regression rate: {report.get('responsive_regression_rate')}",
        f"- Recommendation: {report.get('recommended_next_stage')}",
        "",
        "All results are synthetic/local preference improvement signals, not human taste claims.",
    ]
    return "\n".join(lines) + "\n"


def build_loop_report_from_task_dir(output_dir: Path, *, dataset_dir: Path | None = None, patch_mode: str = "deterministic_patch", manual_review_labels: Path | None = None) -> dict[str, Any]:
    output_dir = output_dir.expanduser().resolve()
    reports = [read_json(path) for path in sorted((output_dir / "tasks").glob("*.json"))]
    aggregate = aggregate_loop_reports(
        reports,
        dataset_dir=(dataset_dir or Path("")).expanduser().resolve(),
        output_dir=output_dir,
        patch_mode=patch_mode,
        preference_report=None,
        runtime_seconds=0.0,
        manual_review_labels=manual_review_labels,
    )
    write_json(output_dir / "closed_loop_report.json", aggregate)
    (output_dir / "closed_loop_report.md").write_text(loop_report_markdown(aggregate), encoding="utf-8")
    return aggregate


def breakdown(reports: list[dict[str, Any]], key: str) -> dict[str, Any]:
    groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for report in reports:
        groups[str(report.get(key))].append(report)
    return {
        name: {
            "task_count": len(rows),
            "success_rate": rate(sum(1 for row in rows if row.get("improvement_passes_local_threshold")), len(rows)),
            "mean_critic_delta": round(mean([float(row.get("critic_delta") or 0.0) for row in rows]), 6),
        }
        for name, rows in sorted(groups.items())
    }


def issue_type_breakdown(reports: list[dict[str, Any]]) -> dict[str, Any]:
    groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for report in reports:
        for issue in report.get("expected_issue_types") or report.get("known_issue_types") or [report.get("corruption_type")]:
            groups[str(issue)].append(report)
    return {
        issue: {
            "task_count": len(rows),
            "success_rate": rate(sum(1 for row in rows if row.get("improvement_passes_local_threshold")), len(rows)),
            "mean_critic_delta": round(mean([float(row.get("critic_delta") or 0.0) for row in rows]), 6),
        }
        for issue, rows in sorted(groups.items())
    }


def special_subset_breakdowns(reports: list[dict[str, Any]]) -> dict[str, Any]:
    subsets = {
        "metrics_ambiguous": [row for row in reports if row.get("metrics_only_confidence_bucket") == "medium"],
        "high_critic_confidence": [row for row in reports if row.get("metrics_only_confidence_bucket") == "high"],
        "low_critic_confidence": [row for row in reports if row.get("metrics_only_confidence_bucket") == "low"],
        "cross_issue": [row for row in reports if len(row.get("expected_issue_types") or row.get("known_issue_types") or []) > 1],
        "close_severity": [row for row in reports if 0.4 <= to_float(row.get("severity")) <= 0.6],
        "holdout_template": [row for row in reports if row.get("holdout_status") == "holdout_template"],
    }
    return {name: breakdown(rows, "patch_mode").get(str(rows[0].get("patch_mode")), {"task_count": 0, "success_rate": 0.0, "mean_critic_delta": 0.0}) if rows else {"task_count": 0, "success_rate": 0.0, "mean_critic_delta": 0.0} for name, rows in subsets.items()}


def validate_report_schema_safeguards(reports: list[dict[str, Any]], patch_mode: str) -> list[str]:
    errors: list[str] = []
    for report in reports:
        allowed = report.get("patch_mode_allowed") or []
        if allowed and patch_mode not in allowed:
            errors.append(f"{report.get('task_id')}: patch mode {patch_mode} not allowed by task schema")
        if patch_mode in NON_ORACLE_PATCH_MODES | {"instruction_only", "no_op"} and report.get("oracle_excluded_from_non_oracle_claims"):
            errors.append(f"{report.get('task_id')}: oracle evidence appeared in non-oracle mode {patch_mode}")
        if report.get("difficulty") not in {"easy", "medium", "hard", None}:
            errors.append(f"{report.get('task_id')}: invalid difficulty metadata")
    return errors


def load_manual_review_labels(path: Path | None) -> list[dict[str, Any]]:
    if path is None:
        return []
    path = path.expanduser().resolve()
    if not path.exists():
        return []
    if path.is_dir():
        labels = []
        for item in sorted(path.glob("*.json")):
            payload = read_json(item)
            if isinstance(payload, list):
                labels.extend(row for row in payload if isinstance(row, dict))
            elif isinstance(payload, dict):
                labels.append(payload)
        return [normalize_manual_review_label(row) for row in labels]
    text = path.read_text(encoding="utf-8").strip()
    if not text:
        return []
    if path.suffix == ".jsonl":
        return [normalize_manual_review_label(json.loads(line)) for line in text.splitlines() if line.strip()]
    payload = json.loads(text)
    if isinstance(payload, list):
        return [normalize_manual_review_label(row) for row in payload if isinstance(row, dict)]
    if isinstance(payload, dict):
        return [normalize_manual_review_label(payload)]
    return []


def normalize_manual_review_label(row: dict[str, Any]) -> dict[str, Any]:
    preferred = str(row.get("preferred") or "").lower()
    completed = preferred in {"before", "after", "tie"}
    if not completed:
        preferred = ""
    return {
        "schema_version": row.get("schema_version") or LOOP_MANUAL_LABEL_SCHEMA_VERSION,
        "task_id": str(row.get("task_id") or ""),
        "preferred": preferred,
        "completed": completed,
        "issue_types_remaining": list(row.get("issue_types_remaining") or []),
        "visual_regression": bool(row.get("visual_regression", False)),
        "accessibility_concern": bool(row.get("accessibility_concern", False)),
        "notes": str(row.get("notes") or ""),
        "reviewer_id": str(row.get("reviewer_id") or ""),
        "provenance": str(row.get("provenance") or "manual_review_label"),
        "created_at": str(row.get("created_at") or ""),
    }


def manual_review_agreement(reports: list[dict[str, Any]], labels: list[dict[str, Any]]) -> dict[str, Any]:
    completed_labels = [label for label in labels if label.get("completed")]
    if not completed_labels:
        return {
            "labels_available": False,
            "label_count": len(labels),
            "matched_label_count": 0,
            "skipped_reason": "no completed manual review labels provided",
            "critic_vs_human_agreement": None,
            "deterministic_metric_vs_human_agreement": None,
            "patch_win_rate_by_human_preference": None,
        }
    report_by_task = {str(report.get("task_id")): report for report in reports}
    matched = [(label, report_by_task.get(str(label.get("task_id")))) for label in completed_labels]
    matched = [(label, report) for label, report in matched if report is not None]
    critic_matches = 0
    metric_matches = 0
    after_wins = 0
    for label, report in matched:
        preferred = label["preferred"]
        if preferred == "after":
            after_wins += 1
        if preferred == preference_from_delta(to_float(report.get("critic_delta"))):
            critic_matches += 1
        metric_delta = to_float((report.get("deterministic_metric_deltas") or {}).get("quality_score_delta"))
        if preferred == preference_from_delta(metric_delta):
            metric_matches += 1
    return {
        "labels_available": True,
        "label_count": len(completed_labels),
        "matched_label_count": len(matched),
        "critic_vs_human_agreement": rate(critic_matches, len(matched)),
        "deterministic_metric_vs_human_agreement": rate(metric_matches, len(matched)),
        "patch_win_rate_by_human_preference": rate(after_wins, len(matched)),
    }


def preference_from_delta(delta: float) -> str:
    if delta > 1e-9:
        return "after"
    if delta < -1e-9:
        return "before"
    return "tie"


def example_summary(report: dict[str, Any]) -> dict[str, Any]:
    return {
        "task_id": report.get("task_id"),
        "patch_mode": report.get("patch_mode"),
        "difficulty": report.get("difficulty"),
        "corruption_type": report.get("corruption_type"),
        "critic_delta": report.get("critic_delta"),
        "patch_success": report.get("patch_success"),
        "patch_failure_reason": report.get("patch_failure_reason"),
        "skipped": report.get("skipped"),
        "skip_reason": report.get("skip_reason"),
        "before_screenshot_path": ((report.get("before") or {}).get("screenshot_path")),
        "after_screenshot_path": ((report.get("after") or {}).get("screenshot_path")),
    }


def severity_bucket(value: Any) -> str:
    severity = to_float(value)
    if severity < 0.34:
        return "low"
    if severity < 0.67:
        return "medium"
    return "high"


def critic_confidence_bucket(critique: dict[str, Any]) -> str:
    confidence = max([to_float(issue.get("confidence")) for issue in critique.get("issues") or []] or [0.0])
    if confidence >= 0.75:
        return "high"
    if confidence >= 0.4:
        return "medium"
    return "low"


def normalize_issue_type(value: Any) -> str:
    text = str(value or "").lower()
    for issue in ISSUE_TYPES:
        if issue in text:
            return issue
    return "unknown"


def to_float(value: Any) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return 0.0
    if math.isnan(number) or math.isinf(number):
        return 0.0
    return number


def mean(values: list[float]) -> float:
    return sum(values) / len(values) if values else 0.0


def median(values: list[float]) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    mid = len(ordered) // 2
    if len(ordered) % 2:
        return ordered[mid]
    return (ordered[mid - 1] + ordered[mid]) / 2


def rate(count: int, total: int) -> float:
    return round(count / total, 6) if total else 0.0
