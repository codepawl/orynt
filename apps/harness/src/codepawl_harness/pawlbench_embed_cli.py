"""Command-line interface for lightweight PawlBench Design baselines."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from pawlbench_design import EmbeddingConfig, build_encoder_baselines


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="pawlbench-design-embed",
        description="Build lightweight non-ML embeddings for CodePawl jitter pairs.",
    )
    parser.add_argument("input_dir", help="Path to a jitter pair artifact directory.")
    parser.add_argument("--out", required=True, help="Output embedding baseline directory.")
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    try:
        result = build_encoder_baselines(
            EmbeddingConfig(
                input_dir=Path(args.input_dir),
                output_dir=Path(args.out),
            )
        )
    except Exception as exc:
        print(f"pawlbench-design-embed: {exc}", file=sys.stderr)
        return 2

    print(f"Wrote PawlBench Design embeddings to {result.output_dir}")
    return 0
