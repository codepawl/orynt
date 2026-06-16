"""CLI for validating the canonical UI-JEPA v0 smoke dataset."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from pawlbench_design import validate_ui_jepa_smoke_dataset


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="ui-jepa-smoke-validate",
        description="Validate a canonical UI-JEPA v0 smoke dataset.",
    )
    parser.add_argument("dataset_dir")
    parser.add_argument("--out", help="Validation output directory.")
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        result = validate_ui_jepa_smoke_dataset(
            Path(args.dataset_dir),
            Path(args.out) if args.out else None,
        )
    except Exception as exc:
        print(f"ui-jepa-smoke-validate: {exc}", file=sys.stderr)
        return 2
    print(f"Wrote validation to {result.validation_path}")
    if not result.validation["valid"]:
        for error in result.validation["errors"]:
            print(f"error: {error}", file=sys.stderr)
        return 1
    return 0
