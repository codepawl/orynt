"""Command-line interface for Pawl-JEPA positive representation evaluation."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Any

from codepawl_harness.progress import ProgressReporter, add_progress_arguments
from pawl_jepa.positive import PositiveEvalConfig, evaluate_positive_model


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="pawl-jepa-positive-eval",
        description="Evaluate positive Pawl-JEPA representation pretraining.",
    )
    parser.add_argument("run_dir", help="Pawl-JEPA positive pretraining run directory.")
    parser.add_argument("--manifest", required=True, help="Prepared positive manifest directory.")
    parser.add_argument("--out", required=True, help="Output evaluation directory.")
    parser.add_argument("--batch-size", type=int, default=8)
    parser.add_argument("--device", default="auto")
    parser.add_argument("--image-size", type=int)
    parser.add_argument("--seed", type=int, default=42)
    add_progress_arguments(parser)
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    progress = ProgressReporter(quiet=args.quiet, no_progress=args.no_progress)
    try:
        result = evaluate_positive_model(
            PositiveEvalConfig(
                run_dir=Path(args.run_dir),
                manifest_dir=Path(args.manifest),
                output_dir=Path(args.out),
                batch_size=args.batch_size,
                device=args.device,
                image_size=args.image_size,
                seed=args.seed,
                progress_callback=positive_eval_progress_callback(progress),
            )
        )
    except Exception as exc:
        print(f"pawl-jepa-positive-eval: {exc}", file=sys.stderr)
        return 2
    progress.done("positive evaluation complete")
    progress.log(f"Wrote Pawl-JEPA positive evaluation to {result.output_dir}")
    return 0


def positive_eval_progress_callback(progress: ProgressReporter):
    def callback(event: dict[str, Any]) -> None:
        if event.get("event") != "positive_eval_batch":
            return
        progress.update(
            f"batch {event.get('batch')}/{event.get('total_batches')} "
            f"records {event.get('record_count')}"
        )

    return callback
