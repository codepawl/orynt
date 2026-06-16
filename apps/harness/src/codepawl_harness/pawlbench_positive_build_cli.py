"""Command-line interface for PawlBench positive UI corpus builds."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Any

from codepawl_harness.progress import ProgressReporter, add_progress_arguments
from pawlbench_design import PositiveBuildConfig, build_positive_dataset


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="pawlbench-design-positive-build",
        description="Build a positive UI corpus dataset from standalone HTML files.",
    )
    parser.add_argument("source_dir", help="Directory containing positive .html examples.")
    parser.add_argument("--out", required=True, help="Output positive dataset directory.")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--limit", type=int, help="Maximum number of HTML files to process.")
    parser.add_argument("--fail-fast", action="store_true", help="Stop at the first failed HTML file.")
    parser.add_argument("--overwrite", dest="overwrite", action="store_true", default=True)
    parser.add_argument("--no-overwrite", dest="overwrite", action="store_false")
    add_progress_arguments(parser)
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    progress = ProgressReporter(quiet=args.quiet, no_progress=args.no_progress)
    try:
        result = build_positive_dataset(
            PositiveBuildConfig(
                source_dir=Path(args.source_dir),
                output_dir=Path(args.out),
                seed=args.seed,
                limit=args.limit,
                fail_fast=args.fail_fast,
                overwrite=args.overwrite,
                progress_callback=positive_progress_callback(progress),
            )
        )
    except Exception as exc:
        print(f"pawlbench-design-positive-build: {exc}", file=sys.stderr)
        return 2
    progress.done("positive dataset build complete")
    progress.log(f"Wrote PawlBench positive dataset to {result.output_dir}")
    return 0


def positive_progress_callback(progress: ProgressReporter):
    def callback(event: dict[str, Any]) -> None:
        if event.get("event") != "positive_sample":
            return
        progress.update(
            f"sample {event.get('sample')}/{event.get('total_samples')} "
            f"failed {event.get('failed_count')} "
            f"{event.get('sample_id')} "
            f"{event.get('source_path')}"
        )

    return callback
