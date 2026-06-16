"""Command-line interface for Pawl-JEPA positive manifest preparation."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from pawl_jepa.positive import PositivePrepareConfig, prepare_positive_manifest


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="pawl-jepa-positive-prepare",
        description="Prepare a positive-only Pawl-JEPA manifest.",
    )
    parser.add_argument("dataset_dir", help="PawlBench positive dataset directory.")
    parser.add_argument("--out", required=True, help="Output positive manifest directory.")
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        result = prepare_positive_manifest(
            PositivePrepareConfig(dataset_dir=Path(args.dataset_dir), output_dir=Path(args.out))
        )
    except Exception as exc:
        print(f"pawl-jepa-positive-prepare: {exc}", file=sys.stderr)
        return 2
    print(f"Wrote Pawl-JEPA positive manifest to {result.output_dir}")
    return 0
