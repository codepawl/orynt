"""Command-line interface for generated preference scaffold creation."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from pawlbench_design import GeneratedPairConfig, build_generated_pairs


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="pawlbench-design-generated-pairs",
        description="Create placeholder/manual generated-candidate preference slots.",
    )
    parser.add_argument("source_dir", help="Directory containing source HTML examples.")
    parser.add_argument("--out", required=True, help="Output generated preference scaffold directory.")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--limit", type=int, help="Maximum number of source examples to scaffold.")
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        result = build_generated_pairs(
            GeneratedPairConfig(
                source_dir=Path(args.source_dir),
                output_dir=Path(args.out),
                seed=args.seed,
                limit=args.limit,
            )
        )
    except Exception as exc:
        print(f"pawlbench-design-generated-pairs: {exc}", file=sys.stderr)
        return 2
    print(f"Wrote generated preference scaffold to {result.output_dir}")
    return 0
