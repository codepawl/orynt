"""Command-line interface for PawlBench hard preference pair generation."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from pawlbench_design import HardPairConfig, build_hard_pairs


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="pawlbench-design-hard-pairs",
        description="Generate variant-vs-variant hard preference pairs from a PawlBench dataset.",
    )
    parser.add_argument("input_dir", help="PawlBench dataset directory containing dataset.json.")
    parser.add_argument("--out", required=True, help="Output hard preference dataset directory.")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument(
        "--strategy",
        choices=("core_pairs", "all_pairs"),
        default="core_pairs",
        help="Hard-pair generation strategy. Defaults to the v1-compatible core pair set.",
    )
    parser.add_argument("--taste-profile", help="Optional taste profile YAML path for suggestions.")
    parser.add_argument("--base-splits", help="Optional base split directory for expected split diagnostics.")
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        result = build_hard_pairs(
            HardPairConfig(
                input_dir=Path(args.input_dir),
                output_dir=Path(args.out),
                seed=args.seed,
                strategy=args.strategy,
                taste_profile_path=Path(args.taste_profile) if args.taste_profile else None,
                base_splits_dir=Path(args.base_splits) if args.base_splits else None,
            )
        )
    except Exception as exc:
        print(f"pawlbench-design-hard-pairs: {exc}", file=sys.stderr)
        return 2
    print(f"Wrote PawlBench hard preference pairs to {result.output_dir}")
    return 0
