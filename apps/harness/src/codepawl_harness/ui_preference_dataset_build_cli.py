"""CLI for exporting the canonical ui_preference_v0 feature dataset."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from pawlbench_design.preference_critic import PreferenceDatasetConfig, build_preference_dataset


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="ui-preference-dataset-build", description="Build ui_preference_v0 features from ui_jepa_v0_smoke.")
    parser.add_argument("smoke_dir", nargs="?", default="data/processed/ui_jepa_v0_smoke")
    parser.add_argument("--out", default="data/processed/ui_preference_v0")
    parser.add_argument("--dinov2-embeddings", default=None)
    parser.add_argument("--m1-embeddings", default=None)
    parser.add_argument("--m2-embeddings", default=None)
    parser.add_argument("--m2-strong-embeddings", default=None)
    parser.add_argument("--seed", type=int, default=42)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        summary = build_preference_dataset(
            PreferenceDatasetConfig(
                smoke_dir=Path(args.smoke_dir),
                output_dir=Path(args.out),
                dinov2_embeddings=Path(args.dinov2_embeddings) if args.dinov2_embeddings else None,
                m1_embeddings=Path(args.m1_embeddings) if args.m1_embeddings else None,
                m2_embeddings=Path(args.m2_embeddings) if args.m2_embeddings else None,
                m2_strong_embeddings=Path(args.m2_strong_embeddings) if args.m2_strong_embeddings else None,
                seed=args.seed,
            )
        )
    except Exception as exc:
        print(f"ui-preference-dataset-build: {exc}", file=sys.stderr)
        return 2
    print(f"Wrote ui_preference_v0 dataset to {args.out} ({summary['screen_count']} screens, {summary['pair_count']} pairs)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
