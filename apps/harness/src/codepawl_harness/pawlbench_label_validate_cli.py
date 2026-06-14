"""Command-line interface for PawlBench Design label validation."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from pawlbench_design import LabelValidationConfig, validate_labels


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="pawlbench-design-label-validate",
        description="Validate completed PawlBench Design human labels.",
    )
    parser.add_argument("labels_path", help="Path to completed labels JSONL.")
    parser.add_argument("--queue", required=True, help="Path to queue JSONL.")
    parser.add_argument("--out", required=True, help="Output validation directory.")
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    try:
        result = validate_labels(
            LabelValidationConfig(
                labels_path=Path(args.labels_path),
                queue_path=Path(args.queue),
                output_dir=Path(args.out),
            )
        )
    except Exception as exc:
        print(f"pawlbench-design-label-validate: {exc}", file=sys.stderr)
        return 2

    print(f"Wrote PawlBench Design label validation to {result.output_dir}")
    return 0 if result.validation["valid"] else 1
