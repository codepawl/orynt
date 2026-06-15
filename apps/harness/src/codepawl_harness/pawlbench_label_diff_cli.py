"""Command-line interface for PawlBench label suggestion diffs."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from pawlbench_design import LabelDiffConfig, diff_labels


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="pawlbench-design-label-diff",
        description="Compare two PawlBench labels or suggestion JSONL files.",
    )
    parser.add_argument("old_path", help="Old labels or suggestions JSONL.")
    parser.add_argument("new_path", help="New labels or suggestions JSONL.")
    parser.add_argument("--out", required=True, help="Output diff directory.")
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        result = diff_labels(
            LabelDiffConfig(
                old_path=Path(args.old_path),
                new_path=Path(args.new_path),
                output_dir=Path(args.out),
            )
        )
    except Exception as exc:
        print(f"pawlbench-design-label-diff: {exc}", file=sys.stderr)
        return 2
    print(f"Wrote PawlBench Design label diff to {result.output_dir}")
    return 0
