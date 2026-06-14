"""Command-line interface for PawlBench Design v0 evaluation."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from pawlbench_design import EvalConfig, evaluate_jitter_pairs


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="pawlbench-design-eval",
        description="Validate and score generated CodePawl jitter pair artifacts.",
    )
    parser.add_argument("input_dir", help="Path to a jitter pair artifact directory.")
    parser.add_argument("--out", required=True, help="Output evaluation directory.")
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    try:
        result = evaluate_jitter_pairs(
            EvalConfig(
                input_dir=Path(args.input_dir),
                output_dir=Path(args.out),
            )
        )
    except Exception as exc:
        print(f"pawlbench-design-eval: {exc}", file=sys.stderr)
        return 2

    print(f"Wrote PawlBench Design eval to {result.output_dir}")
    return 0
