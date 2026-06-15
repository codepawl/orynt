"""Command-line interface for Pawl-JEPA seed sweeps."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from pawl_jepa.sweep import SweepConfig, run_seed_sweep


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="pawl-jepa-sweep",
        description="Run a deterministic Pawl-JEPA seed sweep.",
    )
    parser.add_argument("manifest_dir", help="Prepared Pawl-JEPA manifest directory.")
    parser.add_argument("--out", required=True, help="Output sweep directory.")
    parser.add_argument("--epochs", type=int, default=2)
    parser.add_argument("--batch-size", type=int, default=8)
    parser.add_argument("--seeds", required=True, help="Comma-separated integer seeds.")
    parser.add_argument("--lr", type=float, default=1e-3)
    parser.add_argument("--device", default="auto")
    parser.add_argument("--image-size", type=int, default=224)
    parser.add_argument("--latent-weight", type=float, default=1.0)
    parser.add_argument("--preference-weight", type=float, default=0.25)
    parser.add_argument("--defect-weight", type=float, default=0.1)
    parser.add_argument("--embedding-dim", type=int, default=64)
    parser.add_argument("--hidden-dim", type=int, default=128)
    parser.add_argument("--no-defect-head", action="store_true")
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        result = run_seed_sweep(
            SweepConfig(
                manifest_dir=Path(args.manifest_dir),
                output_dir=Path(args.out),
                seeds=parse_seeds(args.seeds),
                epochs=args.epochs,
                batch_size=args.batch_size,
                lr=args.lr,
                device=args.device,
                image_size=args.image_size,
                latent_weight=args.latent_weight,
                preference_weight=args.preference_weight,
                defect_weight=args.defect_weight,
                embedding_dim=args.embedding_dim,
                hidden_dim=args.hidden_dim,
                defect_head=not args.no_defect_head,
            )
        )
    except Exception as exc:
        print(f"pawl-jepa-sweep: {exc}", file=sys.stderr)
        return 2
    print(f"Wrote Pawl-JEPA seed sweep to {result.output_dir}")
    return 0


def parse_seeds(raw: str) -> tuple[int, ...]:
    seeds: list[int] = []
    for item in raw.split(","):
        value = item.strip()
        if not value:
            continue
        seed = int(value)
        if seed not in seeds:
            seeds.append(seed)
    if not seeds:
        raise ValueError("at least one seed is required")
    return tuple(seeds)
