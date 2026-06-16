"""CLI for local PR-style screenshot regression review."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from pawlbench_design.ui_pr_review import PrReviewConfig, run_pr_review


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="ui-pr-review",
        description="Review a local before/after frontend change from rendered HTML or existing screenshots.",
    )
    parser.add_argument("--review-id", required=True)
    parser.add_argument("--before", default=None, help="Before HTML/project path, or before screenshot in screenshots-only mode.")
    parser.add_argument("--after", default=None, help="After HTML/project path, or after screenshot in screenshots-only mode.")
    parser.add_argument("--patch-diff", default=None)
    parser.add_argument("--out", default="reports/ui_pr_review_v0")
    parser.add_argument("--mode", default="render", choices=["render", "screenshots-only"])
    parser.add_argument("--reviewer-id", default="")
    parser.add_argument("--open-report", action="store_true")
    parser.add_argument("--review-root", default="data/pr_review_v0")
    parser.add_argument("--viewport-width", type=int, default=1440)
    parser.add_argument("--viewport-height", type=int, default=900)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        report = run_pr_review(
            PrReviewConfig(
                review_id=args.review_id,
                before=Path(args.before) if args.before else None,
                after=Path(args.after) if args.after else None,
                patch_diff=Path(args.patch_diff) if args.patch_diff else None,
                output_dir=Path(args.out),
                mode=args.mode,
                reviewer_id=args.reviewer_id,
                open_report=args.open_report,
                review_root=Path(args.review_root),
                viewport_width=args.viewport_width,
                viewport_height=args.viewport_height,
            )
        )
    except Exception as exc:
        print(f"ui-pr-review: {exc}", file=sys.stderr)
        return 2
    print(
        f"Wrote PR review report to {Path(report['output_dir']) / 'pr_review_report.json'} "
        f"(decision={report['recommended_decision']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
