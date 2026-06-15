"""Command-line interface for Pawl-JEPA experiment reports."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from pawl_jepa.report import ReportConfig, export_experiment_report


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="pawl-jepa-report",
        description="Export a Markdown/JSON report for a Pawl-JEPA evaluation.",
    )
    parser.add_argument("eval_dir", help="Pawl-JEPA evaluation output directory.")
    parser.add_argument("--manifest", required=True, help="Prepared manifest directory.")
    parser.add_argument("--out", required=True, help="Output report directory.")
    parser.add_argument("--baseline-summary", help="Optional DINOv2/SigLIP baseline summary JSON.")
    parser.add_argument("--sweep-summary", help="Optional Pawl-JEPA sweep_summary.json path.")
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        result = export_experiment_report(
            ReportConfig(
                eval_dir=Path(args.eval_dir),
                manifest_dir=Path(args.manifest),
                output_dir=Path(args.out),
                baseline_summary=Path(args.baseline_summary) if args.baseline_summary else None,
                sweep_summary=Path(args.sweep_summary) if args.sweep_summary else None,
            )
        )
    except Exception as exc:
        print(f"pawl-jepa-report: {exc}", file=sys.stderr)
        return 2
    print(f"Wrote Pawl-JEPA report to {result.output_dir}")
    return 0
