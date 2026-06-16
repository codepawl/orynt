"""Command-line interface for PawlBench positive corpus reports."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from pawlbench_design import PositiveReportConfig, export_positive_report


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="pawlbench-design-positive-report",
        description="Export a report for a PawlBench positive UI corpus dataset.",
    )
    parser.add_argument("input_dir", help="Path to a positive dataset directory.")
    parser.add_argument("--out", required=True, help="Output report directory.")
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        result = export_positive_report(
            PositiveReportConfig(input_dir=Path(args.input_dir), output_dir=Path(args.out))
        )
    except Exception as exc:
        print(f"pawlbench-design-positive-report: {exc}", file=sys.stderr)
        return 2
    print(f"Wrote PawlBench positive report to {result.output_dir}")
    return 0
