"""Command-line interface for Pawl-JEPA hard-pair manifest preparation."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from pawl_jepa import PrepareHardConfig, prepare_hard_manifest


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="pawl-jepa-prepare-hard",
        description="Prepare a Pawl-JEPA manifest from variant-vs-variant hard preference pairs.",
    )
    parser.add_argument("hard_pairs_dir", help="Directory containing hard_pairs.jsonl or review/queue.jsonl.")
    parser.add_argument("--labels", required=True, help="Reviewed hard preference labels JSONL path.")
    parser.add_argument("--base-splits", required=True, help="Base local_v1 split directory.")
    parser.add_argument("--out", required=True, help="Output manifest directory.")
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        result = prepare_hard_manifest(
            PrepareHardConfig(
                hard_pairs_dir=Path(args.hard_pairs_dir),
                labels_path=Path(args.labels),
                base_splits_dir=Path(args.base_splits),
                output_dir=Path(args.out),
            )
        )
    except Exception as exc:
        print(f"pawl-jepa-prepare-hard: {exc}", file=sys.stderr)
        return 2
    print(f"Wrote Pawl-JEPA hard-pair manifest to {result.output_dir}")
    return 0
