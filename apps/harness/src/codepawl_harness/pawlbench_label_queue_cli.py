"""Command-line interface for PawlBench Design label queue generation."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from pawlbench_design import LabelQueueConfig, build_label_queue


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="pawlbench-design-label-queue",
        description="Generate a local PawlBench Design human label queue from a split JSONL.",
    )
    parser.add_argument("input_path", help="Path to a PawlBench split JSONL file.")
    parser.add_argument("--out", required=True, help="Output label queue directory.")
    parser.add_argument("--seed", type=int, required=True, help="Deterministic A/B seed.")
    parser.add_argument("--limit", type=int, help="Maximum number of queue records to write.")
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    try:
        result = build_label_queue(
            LabelQueueConfig(
                input_path=Path(args.input_path),
                output_dir=Path(args.out),
                seed=args.seed,
                limit=args.limit,
            )
        )
    except Exception as exc:
        print(f"pawlbench-design-label-queue: {exc}", file=sys.stderr)
        return 2

    print(f"Wrote PawlBench Design label queue to {result.output_dir}")
    return 0
