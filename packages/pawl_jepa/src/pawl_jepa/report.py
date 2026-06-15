"""Experiment report export for Pawl-JEPA microtraining."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from pawl_jepa.manifest import write_json


LIMITATIONS = (
    "All current local_v1 labels prefer the original UI over the jittered variant.",
    "Validation and test splits are small.",
    "The current data is dominated by synthetic jitter labels.",
    "The benchmark does not yet include real generated UI failures.",
    "hard_pref_v1 is still a small synthetic-jitter hard preference benchmark.",
)


@dataclass(frozen=True)
class ReportConfig:
    eval_dir: Path
    manifest_dir: Path
    output_dir: Path
    baseline_summary: Path | None = None


@dataclass(frozen=True)
class ReportResult:
    output_dir: Path
    report_path: Path
    summary_path: Path
    summary: dict[str, Any]


def export_experiment_report(config: ReportConfig) -> ReportResult:
    eval_dir = config.eval_dir.expanduser().resolve()
    manifest_dir = config.manifest_dir.expanduser().resolve()
    output_dir = config.output_dir.expanduser().resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    eval_summary = read_json(eval_dir / "eval_summary.json")
    manifest_summary = read_json(manifest_dir / "manifest.json")
    train_summary = read_optional_train_summary(eval_summary)
    baseline_summary = (
        read_json(config.baseline_summary.expanduser().resolve())
        if config.baseline_summary is not None
        else eval_summary.get("baseline_summary")
    )

    summary = {
        "eval_dir": str(eval_dir),
        "manifest_dir": str(manifest_dir),
        "dataset": dataset_summary(manifest_summary),
        "label_coverage": manifest_summary.get("label_coverage_by_split", {}),
        "splits": eval_summary.get("splits", {}),
        "train_summary": train_summary,
        "baseline_summary": baseline_summary,
        "limitations": list(LIMITATIONS),
        "recommendations": recommendations(eval_summary),
    }

    summary_path = output_dir / "summary.json"
    report_path = output_dir / "report.md"
    write_json(summary_path, summary)
    report_path.write_text(render_markdown(summary), encoding="utf-8")
    return ReportResult(output_dir, report_path, summary_path, summary)


def read_json(path: Path) -> dict[str, Any]:
    if not path.is_file():
        raise ValueError(f"JSON file is missing: {path}")
    return json.loads(path.read_text(encoding="utf-8"))


def read_optional_train_summary(eval_summary: dict[str, Any]) -> dict[str, Any] | None:
    run_dir = eval_summary.get("run_dir")
    if not run_dir:
        return None
    path = Path(str(run_dir)) / "train_summary.json"
    if not path.is_file():
        return None
    return read_json(path)


def dataset_summary(manifest_summary: dict[str, Any]) -> dict[str, Any]:
    return {
        "record_counts": manifest_summary.get("record_counts", {}),
        "total_records": manifest_summary.get("total_records"),
        "defect_types": manifest_summary.get("defect_types", []),
        "label_file_count": manifest_summary.get("label_file_count"),
        "label_record_count": manifest_summary.get("label_record_count"),
        "preferred_item_counts": manifest_summary.get("preferred_item_counts", {}),
        "human_reviewed_count_by_split": manifest_summary.get("human_reviewed_count_by_split", {}),
        "synthetic_fallback_count_by_split": manifest_summary.get(
            "synthetic_fallback_count_by_split", {}
        ),
    }


def recommendations(eval_summary: dict[str, Any]) -> list[str]:
    recs = [
        "Add hard preference pairs where the variant can be better than the original.",
        "Add real generated UI failures in addition to synthetic jitter variants.",
        "Grow validation and test splits before using small metric differences for decisions.",
        "Treat pairwise accuracy as meaningful only after it beats constant baselines.",
    ]
    if any(
        "All labels prefer original" in warning
        for split in eval_summary.get("splits", {}).values()
        for warning in split.get("warnings", [])
    ):
        recs.insert(0, "Prioritize non-trivial labels before changing Pawl-JEPA architecture.")
    return recs


def render_markdown(summary: dict[str, Any]) -> str:
    lines = [
        "# Pawl-JEPA v0 Experiment Report",
        "",
        "## Dataset Summary",
        "",
        f"- Manifest: `{summary['manifest_dir']}`",
        f"- Eval: `{summary['eval_dir']}`",
        f"- Total records: {summary['dataset'].get('total_records')}",
        f"- Record counts: {format_json(summary['dataset'].get('record_counts', {}))}",
        f"- Defect types: {', '.join(summary['dataset'].get('defect_types', []))}",
        "",
        "## Label Coverage",
        "",
        f"- Coverage by split: {format_json(summary.get('label_coverage', {}))}",
        "- Human reviewed counts: "
        f"{format_json(summary['dataset'].get('human_reviewed_count_by_split', {}))}",
        "- Synthetic fallback counts: "
        f"{format_json(summary['dataset'].get('synthetic_fallback_count_by_split', {}))}",
        f"- Preferred item counts: {format_json(summary['dataset'].get('preferred_item_counts', {}))}",
        "",
        "## Evaluation Summary",
        "",
    ]
    for split, split_summary in sorted(summary.get("splits", {}).items()):
        lines.extend(render_split_summary(split, split_summary))
    lines.extend(
        [
            "## Baseline Comparison",
            "",
            baseline_text(summary.get("baseline_summary")),
            "",
            "## Limitations",
            "",
        ]
    )
    lines.extend(f"- {item}" for item in summary["limitations"])
    lines.extend(["", "## Next Recommended Improvements", ""])
    lines.extend(f"- {item}" for item in summary["recommendations"])
    lines.append("")
    return "\n".join(lines)


def render_split_summary(split: str, split_summary: dict[str, Any]) -> list[str]:
    if "pairwise_preference_accuracy" in split_summary:
        return render_hard_split_summary(split, split_summary)
    lines = [
        f"### {split}",
        "",
        f"- Pairwise accuracy: {fmt(split_summary.get('pairwise_good_vs_bad_accuracy'))}",
        f"- Always-original baseline: {fmt(split_summary.get('always_prefer_original_accuracy'))}",
        f"- Pairwise lift over always-original: "
        f"{fmt(split_summary.get('pairwise_lift_over_always_original'))}",
        f"- Metric heuristic accuracy: {fmt(split_summary.get('metric_heuristic_accuracy'))}",
        f"- Defect accuracy: {fmt(split_summary.get('defect_classification_accuracy'))}",
        f"- Defect majority baseline: {fmt(split_summary.get('defect_majority_class_accuracy'))}",
        f"- Defect lift over majority: {fmt(split_summary.get('defect_lift_over_majority'))}",
        f"- Retrieval top1: {fmt(split_summary.get('retrieval_top1'))}",
        f"- Average latent prediction loss: "
        f"{fmt(split_summary.get('average_latent_prediction_loss'))}",
    ]
    for warning in split_summary.get("warnings", []):
        lines.append(f"- Warning: {warning}")
    lines.append("")
    return lines


def render_hard_split_summary(split: str, split_summary: dict[str, Any]) -> list[str]:
    lines = [
        f"### {split}",
        "",
        f"- Pairwise preference accuracy: {fmt(split_summary.get('pairwise_preference_accuracy'))}",
        f"- Always-left baseline: {fmt(split_summary.get('always_left_accuracy'))}",
        f"- Always-right baseline: {fmt(split_summary.get('always_right_accuracy'))}",
        f"- Random preference baseline: {fmt(split_summary.get('random_preference_accuracy'))}",
        f"- Suggestion baseline: {fmt(split_summary.get('suggestion_baseline_accuracy'))}",
        f"- Pairwise lift over best constant: "
        f"{fmt(split_summary.get('pairwise_lift_over_best_constant'))}",
        f"- Defect accuracy on losing side: {fmt(split_summary.get('defect_accuracy_on_losing_side'))}",
        f"- Retrieval top1: {fmt(split_summary.get('retrieval_top1'))}",
        f"- Average latent prediction loss: "
        f"{fmt(split_summary.get('average_latent_prediction_loss'))}",
    ]
    for warning in split_summary.get("warnings", []):
        lines.append(f"- Warning: {warning}")
    lines.append("")
    return lines


def baseline_text(baseline_summary: dict[str, Any] | None) -> str:
    if not baseline_summary:
        return "No external DINOv2/SigLIP baseline summary was provided."
    models = baseline_summary.get("models", [])
    top1 = baseline_summary.get("top1_retrieval_accuracy_by_model", {})
    similarity = baseline_summary.get("average_similarity_by_model", {})
    return (
        f"External baseline models: {', '.join(models)}. "
        f"Top1 retrieval: {format_json(top1)}. "
        f"Average similarity: {format_json(similarity)}."
    )


def fmt(value: Any) -> str:
    if value is None:
        return "n/a"
    if isinstance(value, float):
        return f"{value:.4f}"
    return str(value)


def format_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True)
