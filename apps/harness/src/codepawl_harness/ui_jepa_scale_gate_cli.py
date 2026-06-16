"""CLI gate that blocks premature UI-JEPA scaling."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from pawlbench_design import check_ui_jepa_scaling_gate


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="ui-jepa-scale-gate",
        description="Fail unless UI-JEPA smoke dataset, regions, normalization, and real B0 prerequisites exist.",
    )
    parser.add_argument("--dataset", default="data/processed/ui_jepa_v0_smoke")
    parser.add_argument("--b0-report", default="reports/ui_jepa_v0_smoke/b0_report.json")
    parser.add_argument("--m1-report", default=None)
    parser.add_argument("--m2-report", default=None)
    parser.add_argument("--m2-strong-report", default=None)
    parser.add_argument("--m25-report", default=None)
    parser.add_argument("--preference-critic-report", default=None)
    parser.add_argument("--out", help="Optional path to write the gate result JSON.")
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    result = check_ui_jepa_scaling_gate(
        Path(args.dataset),
        Path(args.b0_report),
        Path(args.m1_report) if args.m1_report else None,
        Path(args.m2_report) if args.m2_report else None,
        Path(args.m25_report) if args.m25_report else None,
        Path(args.m2_strong_report) if args.m2_strong_report else None,
        Path(args.preference_critic_report) if args.preference_critic_report else None,
    )
    if args.out:
        out = Path(args.out)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    if not result["allowed"]:
        for error in result["errors"]:
            print(f"blocked: {error}", file=sys.stderr)
        print(f"next: {result['next_command']}", file=sys.stderr)
        return 1
    print("UI-JEPA scaling gate passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
