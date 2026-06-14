"""Command-line interface for PawlBench Design dataset reports."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from pawlbench_design import ReportConfig, export_dataset_report


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="pawlbench-design-report",
        description="Export a markdown report for a PawlBench Design dataset.",
    )
    parser.add_argument("input_dir", help="Path to a PawlBench dataset directory.")
    parser.add_argument("--out", required=True, help="Output report directory.")
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    try:
        result = export_dataset_report(
            ReportConfig(
                input_dir=Path(args.input_dir),
                output_dir=Path(args.out),
            )
        )
    except Exception as exc:
        print(f"pawlbench-design-report: {exc}", file=sys.stderr)
        return 2

    print(f"Wrote PawlBench Design report to {result.output_dir}")
    return 0
