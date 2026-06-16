"""Command-line interface for PawlBench positive corpus validation."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from pawlbench_design import PositiveValidationConfig, validate_positive_dataset


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="pawlbench-design-positive-validate",
        description="Validate a PawlBench positive UI corpus dataset.",
    )
    parser.add_argument("input_dir", help="Path to a positive dataset directory.")
    parser.add_argument("--out", required=True, help="Output validation directory.")
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        result = validate_positive_dataset(
            PositiveValidationConfig(input_dir=Path(args.input_dir), output_dir=Path(args.out))
        )
    except Exception as exc:
        print(f"pawlbench-design-positive-validate: {exc}", file=sys.stderr)
        return 2
    print(f"Wrote PawlBench positive validation to {result.output_dir}")
    return 0 if result.validation["valid"] else 1
