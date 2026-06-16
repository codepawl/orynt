"""CLI for rebuilding an aggregate closed-loop report from task reports."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from pawlbench_design.ui_loop import build_loop_report_from_task_dir


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="ui-loop-report", description="Rebuild ui_loop_v0 aggregate report from saved task JSON files.")
    parser.add_argument("--out", default="reports/ui_loop_v0")
    parser.add_argument("--dataset-dir", default="data/processed/ui_loop_v0/loop_easy_20")
    parser.add_argument("--patch-mode", default="deterministic_patch", choices=["no_op", "instruction_only", "deterministic_patch", "oracle_patch", "manual_patch", "manual_patch_import"])
    parser.add_argument("--manual-review-labels", default=None, help="JSON, JSONL, or directory of manual review labels.")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        report = build_loop_report_from_task_dir(
            Path(args.out),
            dataset_dir=Path(args.dataset_dir),
            patch_mode=args.patch_mode,
            manual_review_labels=Path(args.manual_review_labels) if args.manual_review_labels else None,
        )
    except Exception as exc:
        print(f"ui-loop-report: {exc}", file=sys.stderr)
        return 2
    print(f"Rebuilt closed-loop report at {Path(args.out) / 'closed_loop_report.json'} ({report['task_count']} tasks)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
