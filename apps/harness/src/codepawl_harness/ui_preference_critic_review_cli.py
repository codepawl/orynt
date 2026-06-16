"""CLI for producing region-grounded UI preference critique JSON."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from pawlbench_design.preference_critic import PreferenceReviewConfig, write_critique_json


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="ui-preference-critic-review", description="Emit synthetic/local UI preference critique JSON.")
    parser.add_argument("dataset_dir", nargs="?", default="data/processed/ui_preference_v0")
    parser.add_argument("--report", default="reports/ui_jepa_v0_smoke/preference_critic_report.json")
    parser.add_argument("--out", default="reports/ui_jepa_v0_smoke/preference_critic_review.json")
    parser.add_argument("--screen-id", default=None)
    parser.add_argument("--limit", type=int, default=3)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        payload = write_critique_json(
            PreferenceReviewConfig(
                dataset_dir=Path(args.dataset_dir),
                report_path=Path(args.report),
                output_path=Path(args.out),
                screen_id=args.screen_id,
                limit=args.limit,
            )
        )
    except Exception as exc:
        print(f"ui-preference-critic-review: {exc}", file=sys.stderr)
        return 2
    count = len(payload.get("critiques", [])) if isinstance(payload, dict) and "critiques" in payload else 1
    print(f"Wrote {count} critique JSON record(s) to {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
