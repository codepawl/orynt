"""CLI for building the canonical UI-JEPA v0 smoke dataset."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from pawlbench_design import UiJepaSmokeBuildConfig, build_ui_jepa_smoke_dataset


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="ui-jepa-smoke-build",
        description="Build the canonical UI-JEPA v0 smoke dataset from local examples or an existing local jitter dataset.",
    )
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--source", help="Directory containing standalone HTML examples to render and corrupt.")
    source.add_argument("--local-dataset", help="Existing local PawlBench jitter dataset directory to canonicalize.")
    parser.add_argument("--out", default="data/processed/ui_jepa_v0_smoke", help="Output smoke dataset directory.")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--limit", type=int, help="Maximum number of source HTML files to process.")
    parser.add_argument("--canvas-size", type=int, default=768)
    parser.add_argument("--patch-size", type=int, default=16)
    parser.add_argument("--overwrite", dest="overwrite", action="store_true", default=True)
    parser.add_argument("--no-overwrite", dest="overwrite", action="store_false")
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        result = build_ui_jepa_smoke_dataset(
            UiJepaSmokeBuildConfig(
                source_dir=Path(args.source) if args.source else None,
                local_dataset_dir=Path(args.local_dataset) if args.local_dataset else None,
                output_dir=Path(args.out),
                seed=args.seed,
                limit=args.limit,
                overwrite=args.overwrite,
                canvas_size=args.canvas_size,
                patch_size=args.patch_size,
            )
        )
    except Exception as exc:
        print(f"ui-jepa-smoke-build: {exc}", file=sys.stderr)
        return 2
    print(f"Wrote UI-JEPA smoke dataset to {result.output_dir}")
    print(f"Manifest: {result.manifest_path}")
    return 0
