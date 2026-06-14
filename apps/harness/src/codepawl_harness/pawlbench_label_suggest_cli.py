"""Command-line interface for PawlBench Design label suggestions."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from pawlbench_design import LabelSuggestConfig, suggest_labels


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="pawlbench-design-label-suggest",
        description="Generate deterministic rule-based label suggestions from a queue JSONL.",
    )
    parser.add_argument("queue_path", help="Path to queue.jsonl.")
    parser.add_argument("--out", required=True, help="Output suggested_labels.jsonl path.")
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    try:
        result = suggest_labels(
            LabelSuggestConfig(
                queue_path=Path(args.queue_path),
                output_path=Path(args.out),
            )
        )
    except Exception as exc:
        print(f"pawlbench-design-label-suggest: {exc}", file=sys.stderr)
        return 2

    print(f"Wrote PawlBench Design label suggestions to {result.output_path}")
    return 0
