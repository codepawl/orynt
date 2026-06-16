"""CLI for UI-JEPA M2 semantic-region screenshot JEPA training."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Any

from codepawl_harness.progress import ProgressReporter, add_progress_arguments
from pawl_jepa.m2 import M2TrainConfig, train_m2


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="ui-jepa-m2-train",
        description="Train the M2 semantic-region screenshot JEPA baseline and write its report.",
    )
    parser.add_argument("dataset_dir")
    parser.add_argument("--out", required=True, help="Checkpoint/run output directory.")
    parser.add_argument("--report-out", default="reports/ui_jepa_v0_smoke/m2_report.json")
    parser.add_argument("--b0-report", default="reports/ui_jepa_v0_smoke/b0_report.json")
    parser.add_argument("--m1-report", default="reports/ui_jepa_v0_smoke/m1_report.json")
    parser.add_argument("--regions-jsonl", default=None, help="Optional regions.jsonl override.")
    parser.add_argument("--epochs", type=int, default=2)
    parser.add_argument("--batch-size", type=int, default=16)
    parser.add_argument("--lr", type=float, default=1e-3)
    parser.add_argument("--weight-decay", type=float, default=1e-4)
    parser.add_argument("--ema-decay", type=float, default=0.99)
    parser.add_argument("--device", default="auto")
    parser.add_argument("--image-size", type=int, default=224)
    parser.add_argument("--patch-size", type=int, default=16)
    parser.add_argument("--embedding-dim", type=int, default=128)
    parser.add_argument("--predictor-hidden-dim", type=int, default=256)
    parser.add_argument("--transformer-layers", type=int, default=2)
    parser.add_argument("--transformer-heads", type=int, default=4)
    parser.add_argument("--target-regions", type=int, default=2)
    parser.add_argument("--min-region-area-ratio", type=float, default=0.001)
    parser.add_argument("--max-region-area-ratio", type=float, default=0.80)
    parser.add_argument("--min-context-ratio", type=float, default=0.45)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--smoke", action="store_true", help="Limit records for fast CPU/CUDA smoke validation.")
    parser.add_argument("--smoke-limit", type=int, default=96)
    parser.add_argument("--probe-epochs", type=int, default=60)
    parser.add_argument("--probe-lr", type=float, default=0.05)
    add_progress_arguments(parser)
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    progress = ProgressReporter(quiet=args.quiet, no_progress=args.no_progress)
    try:
        result = train_m2(
            M2TrainConfig(
                dataset_dir=Path(args.dataset_dir),
                output_dir=Path(args.out),
                report_out=Path(args.report_out),
                b0_report=Path(args.b0_report) if args.b0_report else None,
                m1_report=Path(args.m1_report) if args.m1_report else None,
                regions_path=Path(args.regions_jsonl) if args.regions_jsonl else None,
                epochs=args.epochs,
                batch_size=args.batch_size,
                lr=args.lr,
                weight_decay=args.weight_decay,
                ema_decay=args.ema_decay,
                device=args.device,
                image_size=args.image_size,
                patch_size=args.patch_size,
                embedding_dim=args.embedding_dim,
                predictor_hidden_dim=args.predictor_hidden_dim,
                transformer_layers=args.transformer_layers,
                transformer_heads=args.transformer_heads,
                target_regions=args.target_regions,
                min_region_area_ratio=args.min_region_area_ratio,
                max_region_area_ratio=args.max_region_area_ratio,
                min_context_ratio=args.min_context_ratio,
                seed=args.seed,
                smoke=args.smoke,
                smoke_limit=args.smoke_limit,
                probe_epochs=args.probe_epochs,
                probe_lr=args.probe_lr,
                progress_callback=progress_callback(progress),
            )
        )
    except Exception as exc:
        print(f"ui-jepa-m2-train: {exc}", file=sys.stderr)
        return 2
    progress.done("M2 training complete")
    progress.log(f"Wrote checkpoint to {result.checkpoint_path}")
    progress.log(f"Wrote report to {result.report_json_path}")
    return 0 if result.report.get("valid_m2_baseline") else 1


def progress_callback(progress: ProgressReporter):
    def callback(event: dict[str, Any]) -> None:
        if event.get("event") == "m2_train_batch":
            progress.update(f"epoch {event.get('epoch')} batch {event.get('batch')} loss {float(event.get('loss') or 0):.4f}")
        if event.get("event") == "m2_epoch_end":
            progress.log(
                "epoch "
                f"{event.get('epoch')} train_loss {float(event.get('train_loss') or 0):.4f} "
                f"val_loss {event.get('val_loss')}"
            )

    return callback


if __name__ == "__main__":
    raise SystemExit(main())
