"""CLI helpers for UI loop manual Codex patch calibration batches."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from pawlbench_design.ui_loop import ManualBatchConfig, build_manual_calibration_batch, combine_manual_batch_reports, read_json


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="ui-loop-manual-batch", description="Build or aggregate a local manual/Codex patch calibration batch.")
    sub = parser.add_subparsers(dest="command", required=True)

    build = sub.add_parser("build", help="Select tasks and export manual patch/review artifacts.")
    build.add_argument("--mixed-dataset", default="data/processed/ui_loop_v0/loop_mixed_50")
    build.add_argument("--hard-dataset", default="data/processed/ui_loop_v0/loop_hard_100")
    build.add_argument("--out", default="reports/ui_loop_v0_manual_batch")
    build.add_argument("--contracts", default="reports/ui_loop_v0/contracts")
    build.add_argument("--manual-patches", default="data/manual_patches/ui_loop_v0")
    build.add_argument("--per-set-count", type=int, default=10)
    build.add_argument("--seed", type=int, default=42)
    build.add_argument("--created-at", default=None)

    combine = sub.add_parser("combine", help="Aggregate manual_patch_import reports and optional labels.")
    combine.add_argument("--selection", default="reports/ui_loop_v0_manual_batch/task_selection.json")
    combine.add_argument("--mixed-report", default="reports/ui_loop_v0_manual_batch/mixed_manual_patch_import/closed_loop_report.json")
    combine.add_argument("--hard-report", default="reports/ui_loop_v0_manual_batch/hard_manual_patch_import/closed_loop_report.json")
    combine.add_argument("--labels", default="reports/ui_loop_v0_manual_batch/manual_review_labels")
    combine.add_argument("--out", default="reports/ui_loop_v0_manual_batch/combined_manual_patch_report.json")
    combine.add_argument("--min-task-count", type=int, default=10)
    combine.add_argument("--min-success-rate", type=float, default=0.5)
    combine.add_argument("--max-regression-rate", type=float, default=0.1)
    combine.add_argument("--min-human-agreement", type=float, default=0.6)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        if args.command == "build":
            result = build_manual_calibration_batch(
                ManualBatchConfig(
                    mixed_dataset_dir=Path(args.mixed_dataset),
                    hard_dataset_dir=Path(args.hard_dataset),
                    output_dir=Path(args.out),
                    contracts_dir=Path(args.contracts),
                    manual_patches_dir=Path(args.manual_patches),
                    per_set_count=args.per_set_count,
                    seed=args.seed,
                    created_at=args.created_at,
                )
            )
            print(json.dumps(result, indent=2, sort_keys=True))
            return 0
        selection_path = Path(args.selection)
        selection = read_json(selection_path) if selection_path.is_file() else {}
        report = combine_manual_batch_reports(
            [Path(args.mixed_report), Path(args.hard_report)],
            selection=selection,
            output_path=Path(args.out),
            label_dir=Path(args.labels),
            min_task_count=args.min_task_count,
            min_success_rate=args.min_success_rate,
            max_regression_rate=args.max_regression_rate,
            min_human_agreement=args.min_human_agreement,
        )
    except Exception as exc:
        print(f"ui-loop-manual-batch: {exc}", file=sys.stderr)
        return 2
    print(json.dumps(report, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
