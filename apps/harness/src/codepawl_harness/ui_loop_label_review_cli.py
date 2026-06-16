"""CLI for filling UI loop manual review labels without editing JSON by hand."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from pawlbench_design.ui_loop import ManualLabelReviewConfig, review_manual_labels


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="ui-loop-label-review", description="Interactively fill local UI loop manual review label JSON files.")
    parser.add_argument("--selection", default="reports/ui_loop_v0_manual_batch/task_selection.json")
    parser.add_argument("--labels", default="reports/ui_loop_v0_manual_batch/manual_review_labels")
    parser.add_argument("--mixed-report-dir", default="reports/ui_loop_v0_manual_batch/mixed_manual_patch_import")
    parser.add_argument("--hard-report-dir", default="reports/ui_loop_v0_manual_batch/hard_manual_patch_import")
    parser.add_argument("--manual-patches", default="data/manual_patches/ui_loop_v0")
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--only-empty", action="store_true", help="Only prompt for completely blank label templates.")
    parser.add_argument("--overwrite", action="store_true", help="Allow replacing completed labels.")
    parser.add_argument("--reviewer-id", required=True)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--open-images", action="store_true", help="Open before/after screenshots with xdg-open before prompting.")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        result = review_manual_labels(
            ManualLabelReviewConfig(
                selection_path=Path(args.selection),
                label_dir=Path(args.labels),
                mixed_report_dir=Path(args.mixed_report_dir),
                hard_report_dir=Path(args.hard_report_dir),
                manual_patches_dir=Path(args.manual_patches),
                reviewer_id=args.reviewer_id,
                limit=args.limit,
                only_empty=args.only_empty,
                overwrite=args.overwrite,
                dry_run=args.dry_run,
                open_images=args.open_images,
            )
        )
    except Exception as exc:
        print(f"ui-loop-label-review: {exc}", file=sys.stderr)
        return 2
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
