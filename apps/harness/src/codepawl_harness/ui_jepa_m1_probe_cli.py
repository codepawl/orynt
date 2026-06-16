"""CLI for exporting frozen M1 embeddings and running the pairwise probe."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from pawl_jepa.m1 import M1ProbeConfig, run_m1_probe


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="ui-jepa-m1-probe",
        description="Export frozen M1 embeddings and evaluate the pairwise UI preference probe.",
    )
    parser.add_argument("dataset_dir")
    parser.add_argument("--checkpoint", required=True)
    parser.add_argument("--out", default="reports/ui_jepa_v0_smoke/m1_probe")
    parser.add_argument("--report-out", default="reports/ui_jepa_v0_smoke/m1_report.json")
    parser.add_argument("--b0-report", default="reports/ui_jepa_v0_smoke/b0_report.json")
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--device", default="auto")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--probe-epochs", type=int, default=80)
    parser.add_argument("--probe-lr", type=float, default=0.05)
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        result = run_m1_probe(
            M1ProbeConfig(
                dataset_dir=Path(args.dataset_dir),
                checkpoint=Path(args.checkpoint),
                output_dir=Path(args.out),
                report_out=Path(args.report_out),
                b0_report=Path(args.b0_report) if args.b0_report else None,
                batch_size=args.batch_size,
                device=args.device,
                seed=args.seed,
                probe_epochs=args.probe_epochs,
                probe_lr=args.probe_lr,
            )
        )
    except Exception as exc:
        print(f"ui-jepa-m1-probe: {exc}", file=sys.stderr)
        return 2
    print(f"Wrote M1 report to {result.report_json_path}")
    return 0 if result.report.get("valid_m1_baseline") else 1


if __name__ == "__main__":
    raise SystemExit(main())
