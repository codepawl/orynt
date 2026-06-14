"""Command-line interface for PawlBench Design dataset splits."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from pawlbench_design import SplitConfig, split_dataset


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="pawlbench-design-split",
        description="Create deterministic sample-level train/val/test splits.",
    )
    parser.add_argument("input_dir", help="Path to a PawlBench dataset directory.")
    parser.add_argument("--out", required=True, help="Output split directory.")
    parser.add_argument("--seed", type=int, required=True, help="Deterministic split seed.")
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    try:
        result = split_dataset(
            SplitConfig(
                input_dir=Path(args.input_dir),
                output_dir=Path(args.out),
                seed=args.seed,
            )
        )
    except Exception as exc:
        print(f"pawlbench-design-split: {exc}", file=sys.stderr)
        return 2

    print(f"Wrote PawlBench Design splits to {result.output_dir}")
    return 0
