"""CLI for UI-JEPA M2.5 representation diagnostics and stronger-M2 ablations."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from pawl_jepa.m25 import M25Config, run_m25_ablation


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="ui-jepa-m25-ablation",
        description="Run M2.5 representation diagnostics and optional stronger controlled M2 runs.",
    )
    parser.add_argument("dataset_dir")
    parser.add_argument("--out", default="checkpoints/ui_jepa_m25")
    parser.add_argument("--report-out", default="reports/ui_jepa_v0_smoke/m25_diagnostics_report.json")
    parser.add_argument("--b0-report", default="reports/ui_jepa_v0_smoke/b0_report.json")
    parser.add_argument("--m1-report", default="reports/ui_jepa_v0_smoke/m1_report.json")
    parser.add_argument("--m2-report", default="reports/ui_jepa_v0_smoke/m2_report.json")
    parser.add_argument("--m2-strong-report", default=None, help="Optional externally produced stronger M2 report to include without retraining.")
    parser.add_argument("--device", default="auto")
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--min-batch-size", type=int, default=4)
    parser.add_argument("--stronger-epochs", type=int, default=20)
    parser.add_argument("--max-stronger-runs", type=int, default=1)
    parser.add_argument("--skip-stronger-m2", action="store_true")
    parser.add_argument("--probe-epochs", type=int, default=80)
    parser.add_argument("--probe-lr", type=float, default=0.05)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--smoke", action="store_true", help="Limit stronger-M2 training records for fast CPU/CI smoke validation.")
    parser.add_argument("--smoke-limit", type=int, default=96)
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        report = run_m25_ablation(
            M25Config(
                dataset_dir=Path(args.dataset_dir),
                output_dir=Path(args.out),
                report_out=Path(args.report_out),
                b0_report=Path(args.b0_report) if args.b0_report else None,
                m1_report=Path(args.m1_report) if args.m1_report else None,
                m2_report=Path(args.m2_report) if args.m2_report else None,
                m2_strong_report=Path(args.m2_strong_report) if args.m2_strong_report else None,
                run_stronger_m2=not args.skip_stronger_m2,
                max_stronger_runs=args.max_stronger_runs,
                stronger_epochs=args.stronger_epochs,
                batch_size=args.batch_size,
                min_batch_size=args.min_batch_size,
                probe_epochs=args.probe_epochs,
                probe_lr=args.probe_lr,
                device=args.device,
                seed=args.seed,
                smoke=args.smoke,
                smoke_limit=args.smoke_limit,
            )
        )
    except Exception as exc:
        print(f"ui-jepa-m25-ablation: {exc}", file=sys.stderr)
        return 2
    print(f"Wrote M2.5 diagnostics report to {args.report_out}")
    if report.get("stronger_m2_runs"):
        for run in report["stronger_m2_runs"]:
            print(f"stronger-m2 {run.get('name')}: {run.get('status')} {run.get('failure_reason') or ''}".rstrip())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
