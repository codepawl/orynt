"""Command-line interface for Pawl-JEPA manifest preparation."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from pawl_jepa import PrepareConfig, prepare_manifest


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="pawl-jepa-prepare",
        description="Prepare a Pawl-JEPA microtraining manifest from PawlBench splits.",
    )
    parser.add_argument("splits_dir", help="Directory containing train/val/test JSONL splits.")
    parser.add_argument(
        "--labels",
        action="append",
        default=[],
        help="Optional reviewed label JSONL path. May be passed multiple times.",
    )
    parser.add_argument("--out", required=True, help="Output manifest directory.")
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        result = prepare_manifest(
            PrepareConfig(
                splits_dir=Path(args.splits_dir),
                labels_paths=tuple(Path(label_path) for label_path in args.labels),
                output_dir=Path(args.out),
            )
        )
    except Exception as exc:
        print(f"pawl-jepa-prepare: {exc}", file=sys.stderr)
        return 2
    print(f"Wrote Pawl-JEPA manifest to {result.output_dir}")
    return 0
