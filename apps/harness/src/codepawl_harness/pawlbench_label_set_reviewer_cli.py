"""Command-line interface for rewriting PawlBench Design label reviewer provenance."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from pawlbench_design import LabelSetReviewerConfig, set_label_reviewer


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="pawlbench-design-label-set-reviewer",
        description="Set reviewed_by and labeler_id for selected label records.",
    )
    parser.add_argument("labels_path", help="Path to labels JSONL.")
    parser.add_argument("--out", help="Output labels JSONL path.")
    parser.add_argument("--reviewed-by", required=True, help="Human reviewer identifier.")
    parser.add_argument("--only-status", required=True, help="Only rewrite this review_status.")
    parser.add_argument(
        "--in-place",
        action="store_true",
        help="Overwrite the input labels JSONL instead of writing --out.",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    try:
        result = set_label_reviewer(
            LabelSetReviewerConfig(
                labels_path=Path(args.labels_path),
                output_path=Path(args.out) if args.out else None,
                reviewed_by=args.reviewed_by,
                only_status=args.only_status,
                in_place=args.in_place,
            )
        )
    except Exception as exc:
        print(f"pawlbench-design-label-set-reviewer: {exc}", file=sys.stderr)
        return 2

    print(
        "Rewrote "
        f"{result.rewritten_records}/{result.total_records} records "
        f"with review_status={result.only_status} to reviewed_by={result.reviewed_by}: "
        f"{result.output_path}"
    )
    return 0
