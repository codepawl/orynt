"""Command-line interface for Pawl-JEPA microtraining."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Any

from codepawl_harness.progress import ProgressReporter, add_progress_arguments, format_elapsed
from pawl_jepa.train import TrainConfig, train_micro_model


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="pawl-jepa-train",
        description="Train the small Pawl-JEPA microtraining model.",
    )
    parser.add_argument("manifest_dir", help="Prepared Pawl-JEPA manifest directory.")
    parser.add_argument("--out", required=True, help="Output run directory.")
    parser.add_argument("--epochs", type=int, default=2)
    parser.add_argument("--batch-size", type=int, default=8)
    parser.add_argument("--lr", type=float, default=1e-3)
    parser.add_argument("--device", default="auto")
    parser.add_argument("--image-size", type=int, default=224)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--latent-weight", type=float, default=1.0)
    parser.add_argument("--preference-weight", type=float, default=0.25)
    parser.add_argument("--defect-weight", type=float, default=0.1)
    parser.add_argument("--embedding-dim", type=int, default=64)
    parser.add_argument("--hidden-dim", type=int, default=128)
    parser.add_argument("--no-defect-head", action="store_true")
    add_progress_arguments(parser)
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    progress = ProgressReporter(quiet=args.quiet, no_progress=args.no_progress)
    try:
        result = train_micro_model(
            TrainConfig(
                manifest_dir=Path(args.manifest_dir),
                output_dir=Path(args.out),
                epochs=args.epochs,
                batch_size=args.batch_size,
                lr=args.lr,
                device=args.device,
                image_size=args.image_size,
                seed=args.seed,
                latent_weight=args.latent_weight,
                preference_weight=args.preference_weight,
                defect_weight=args.defect_weight,
                embedding_dim=args.embedding_dim,
                hidden_dim=args.hidden_dim,
                defect_head=not args.no_defect_head,
                progress_callback=train_progress_callback(progress),
            )
        )
    except Exception as exc:
        print(f"pawl-jepa-train: {exc}", file=sys.stderr)
        return 2
    progress.done("training complete")
    progress.log(f"Wrote Pawl-JEPA training run to {result.output_dir}")
    return 0


def train_progress_callback(progress: ProgressReporter):
    def callback(event: dict[str, Any]) -> None:
        if event.get("event") != "train_batch":
            return
        progress.update(
            "epoch "
            f"{event.get('epoch')}/{event.get('epochs')} "
            "batch "
            f"{event.get('batch')}/{event.get('total_batches')} "
            f"total_loss {fmt_loss(event.get('total_loss'))} "
            f"latent {fmt_loss(event.get('latent_loss'))} "
            f"pref {fmt_loss(event.get('preference_loss'))} "
            f"defect {fmt_loss(event.get('defect_loss'))} "
            f"train_elapsed {format_elapsed(float(event.get('elapsed_seconds') or 0))}"
        )

    return callback


def fmt_loss(value: Any) -> str:
    return "n/a" if value is None else f"{float(value):.4f}"
