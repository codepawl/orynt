"""Command-line interface for Pawl-JEPA microtraining evaluation."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Any

from codepawl_harness.progress import ProgressReporter, add_progress_arguments
from pawl_jepa.evaluate import EvalConfig, evaluate_micro_model


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="pawl-jepa-eval",
        description="Evaluate a Pawl-JEPA microtraining run.",
    )
    parser.add_argument("run_dir", help="Pawl-JEPA training run directory.")
    parser.add_argument("--manifest", required=True, help="Prepared manifest directory.")
    parser.add_argument("--out", required=True, help="Output evaluation directory.")
    parser.add_argument("--batch-size", type=int, default=8)
    parser.add_argument("--device", default="auto")
    parser.add_argument("--baseline-summary", help="Optional baseline summary JSON to include.")
    parser.add_argument("--random-seed", type=int, default=42, help="Seed for deterministic random baselines.")
    add_progress_arguments(parser)
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    progress = ProgressReporter(quiet=args.quiet, no_progress=args.no_progress)
    try:
        result = evaluate_micro_model(
            EvalConfig(
                run_dir=Path(args.run_dir),
                manifest_dir=Path(args.manifest),
                output_dir=Path(args.out),
                batch_size=args.batch_size,
                device=args.device,
                baseline_summary=Path(args.baseline_summary) if args.baseline_summary else None,
                random_seed=args.random_seed,
                progress_callback=eval_progress_callback(progress),
            )
        )
    except Exception as exc:
        print(f"pawl-jepa-eval: {exc}", file=sys.stderr)
        return 2
    progress.done("evaluation complete")
    progress.log(f"Wrote Pawl-JEPA evaluation to {result.output_dir}")
    return 0


def eval_progress_callback(progress: ProgressReporter):
    def callback(event: dict[str, Any]) -> None:
        if event.get("event") != "eval_batch":
            return
        progress.update(
            f"split {event.get('split')} "
            f"batch {event.get('batch')}/{event.get('total_batches')} "
            f"records {event.get('record_count')}"
        )

    return callback
