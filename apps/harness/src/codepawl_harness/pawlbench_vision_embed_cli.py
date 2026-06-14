"""Command-line interface for optional frozen vision encoder baselines."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from pawlbench_design import VisionEmbeddingConfig, build_vision_baselines


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="pawlbench-design-vision-embed",
        description="Build optional DINOv2/SigLIP frozen vision baselines for a PawlBench dataset.",
    )
    parser.add_argument("input_dir", help="Path to a PawlBench dataset directory.")
    parser.add_argument("--out", required=True, help="Output vision baseline directory.")
    parser.add_argument(
        "--models",
        default="dinov2,siglip",
        help="Comma-separated model aliases. Supported: dinov2,siglip.",
    )
    parser.add_argument("--batch-size", type=int, default=8, help="Image batch size.")
    parser.add_argument(
        "--device",
        default="auto",
        help="Device to use: auto, cpu, cuda, or another torch device string.",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    try:
        result = build_vision_baselines(
            VisionEmbeddingConfig(
                input_dir=Path(args.input_dir),
                output_dir=Path(args.out),
                models=tuple(args.models.split(",")),
                batch_size=args.batch_size,
                device=args.device,
            )
        )
    except Exception as exc:
        print(f"pawlbench-design-vision-embed: {exc}", file=sys.stderr)
        return 2

    print(f"Wrote PawlBench Design vision baselines to {result.output_dir}")
    return 0
