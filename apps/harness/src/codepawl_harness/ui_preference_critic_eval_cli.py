"""CLI for training/evaluating the synthetic local UI preference critic."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from pawlbench_design.preference_critic import PreferenceCriticConfig, evaluate_preference_critic


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="ui-preference-critic-eval", description="Run UI preference critic feature ablations.")
    parser.add_argument("dataset_dir", nargs="?", default="data/processed/ui_preference_v0")
    parser.add_argument("--out", default="reports/ui_jepa_v0_smoke/preference_critic")
    parser.add_argument("--report-out", default="reports/ui_jepa_v0_smoke/preference_critic_report.json")
    parser.add_argument("--b0-report", default="reports/ui_jepa_v0_smoke/b0_report.json")
    parser.add_argument("--m25-report", default="reports/ui_jepa_v0_smoke/m25_diagnostics_report.json")
    parser.add_argument("--epochs", type=int, default=80)
    parser.add_argument("--learning-rate", type=float, default=0.05)
    parser.add_argument("--seed", type=int, default=42)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        report = evaluate_preference_critic(
            PreferenceCriticConfig(
                dataset_dir=Path(args.dataset_dir),
                output_dir=Path(args.out),
                report_out=Path(args.report_out),
                b0_report=Path(args.b0_report) if args.b0_report else None,
                m25_report=Path(args.m25_report) if args.m25_report else None,
                epochs=args.epochs,
                learning_rate=args.learning_rate,
                seed=args.seed,
            )
        )
    except Exception as exc:
        print(f"ui-preference-critic-eval: {exc}", file=sys.stderr)
        return 2
    print(f"Wrote preference critic report to {args.report_out}")
    print(f"best_feature_group={report.get('best_feature_group')} valid={report.get('valid')}")
    return 0 if report.get("valid") else 1


if __name__ == "__main__":
    raise SystemExit(main())
