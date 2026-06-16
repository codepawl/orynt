"""Command-line interface for Pawl-JEPA positive pretraining."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Any

from codepawl_harness.progress import ProgressReporter, add_progress_arguments, format_elapsed
from pawl_jepa.positive import PositiveTrainConfig, train_positive_model


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="pawl-jepa-positive-train",
        description="Pretrain the small Pawl-JEPA encoder on positive UI screenshots.",
    )
    parser.add_argument("manifest_dir", help="Prepared positive manifest directory.")
    parser.add_argument("--out", required=True, help="Output pretraining run directory.")
    parser.add_argument("--epochs", type=int, default=2)
    parser.add_argument("--batch-size", type=int, default=8)
    parser.add_argument("--lr", type=float, default=1e-3)
    parser.add_argument("--device", default="auto")
    parser.add_argument("--image-size", type=int, default=224)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--embedding-dim", type=int, default=64)
    parser.add_argument("--hidden-dim", type=int, default=128)
    add_progress_arguments(parser)
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    progress = ProgressReporter(quiet=args.quiet, no_progress=args.no_progress)
    try:
        result = train_positive_model(
            PositiveTrainConfig(
                manifest_dir=Path(args.manifest_dir),
                output_dir=Path(args.out),
                epochs=args.epochs,
                batch_size=args.batch_size,
                lr=args.lr,
                device=args.device,
                image_size=args.image_size,
                seed=args.seed,
                embedding_dim=args.embedding_dim,
                hidden_dim=args.hidden_dim,
                progress_callback=positive_train_progress_callback(progress),
            )
        )
    except Exception as exc:
        print(f"pawl-jepa-positive-train: {exc}", file=sys.stderr)
        return 2
    progress.done("positive pretraining complete")
    progress.log(f"Wrote Pawl-JEPA positive pretraining run to {result.output_dir}")
    return 0


def positive_train_progress_callback(progress: ProgressReporter):
    def callback(event: dict[str, Any]) -> None:
        if event.get("event") != "positive_train_batch":
            return
        progress.update(
            f"epoch {event.get('epoch')}/{event.get('epochs')} "
            f"batch {event.get('batch')}/{event.get('total_batches')} "
            f"loss {fmt_float(event.get('loss'))} "
            f"consistency {fmt_float(event.get('consistency'))} "
            f"train_elapsed {format_elapsed(float(event.get('elapsed_seconds') or 0))}"
        )

    return callback


def fmt_float(value: Any) -> str:
    return "n/a" if value is None else f"{float(value):.4f}"
