"""Command-line interface for PawlBench hard preference pair generation."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Any

from codepawl_harness.progress import ProgressReporter, add_progress_arguments
from pawlbench_design import HardPairConfig, build_hard_pairs


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="pawlbench-design-hard-pairs",
        description="Generate variant-vs-variant hard preference pairs from a PawlBench dataset.",
    )
    parser.add_argument("input_dir", help="PawlBench dataset directory containing dataset.json.")
    parser.add_argument("--out", required=True, help="Output hard preference dataset directory.")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument(
        "--strategy",
        choices=("core_pairs", "all_pairs"),
        default="core_pairs",
        help="Hard-pair generation strategy. Defaults to the v1-compatible core pair set.",
    )
    parser.add_argument("--taste-profile", help="Optional taste profile YAML path for suggestions.")
    parser.add_argument("--base-splits", help="Optional base split directory for expected split diagnostics.")
    add_progress_arguments(parser)
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    progress = ProgressReporter(quiet=args.quiet, no_progress=args.no_progress)
    try:
        result = build_hard_pairs(
            HardPairConfig(
                input_dir=Path(args.input_dir),
                output_dir=Path(args.out),
                seed=args.seed,
                strategy=args.strategy,
                taste_profile_path=Path(args.taste_profile) if args.taste_profile else None,
                base_splits_dir=Path(args.base_splits) if args.base_splits else None,
                progress_callback=hard_pair_progress_callback(progress),
            )
        )
    except Exception as exc:
        print(f"pawlbench-design-hard-pairs: {exc}", file=sys.stderr)
        return 2
    progress.done("hard-pair generation complete")
    progress.log(f"Wrote PawlBench hard preference pairs to {result.output_dir}")
    return 0


def hard_pair_progress_callback(progress: ProgressReporter):
    def callback(event: dict[str, Any]) -> None:
        if event.get("event") not in {"hard_pairs_sample", "hard_pairs_sample_done"}:
            return
        progress.update(
            f"sample {event.get('sample')}/{event.get('total_samples')} "
            f"records {event.get('record_count')} "
            f"skipped {event.get('skipped_count')} "
            f"{event.get('sample_id')}"
        )

    return callback
