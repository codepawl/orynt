"""CLI for the UI-JEPA v0 smoke B0 frozen-vision ranking baseline."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from pawlbench_design import UiJepaSmokeB0Config, run_ui_jepa_b0_baseline


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="ui-jepa-smoke-b0",
        description="Run the B0 frozen vision + ranking-head baseline for UI-JEPA v0 smoke pairs.",
    )
    parser.add_argument("dataset_dir")
    parser.add_argument("--out", default="reports/ui_jepa_v0_smoke")
    parser.add_argument("--backend", default="auto", choices=("auto", "dinov2", "siglip", "clip", "dummy"))
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--epochs", type=int, default=80)
    parser.add_argument("--hidden-dim", type=int, default=16)
    parser.add_argument("--learning-rate", type=float, default=0.05)
    parser.add_argument("--no-dummy", dest="allow_dummy", action="store_false", default=True)
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        result = run_ui_jepa_b0_baseline(
            UiJepaSmokeB0Config(
                dataset_dir=Path(args.dataset_dir),
                output_dir=Path(args.out),
                backend=args.backend,
                seed=args.seed,
                epochs=args.epochs,
                hidden_dim=args.hidden_dim,
                learning_rate=args.learning_rate,
                allow_dummy=args.allow_dummy,
            )
        )
    except Exception as exc:
        print(f"ui-jepa-smoke-b0: {exc}", file=sys.stderr)
        return 2
    print(f"Wrote B0 report to {result.report_json_path}")
    if not result.report["valid_for_model_selection"]:
        print("B0 report is not valid for model selection; see warnings in the report.", file=sys.stderr)
    return 0
