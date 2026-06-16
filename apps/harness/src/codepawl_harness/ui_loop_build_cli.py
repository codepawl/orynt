"""CLI for building local closed-loop UI evaluation sets."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from pawlbench_design.ui_loop import LoopBuildConfig, build_loop_dataset


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="ui-loop-build", description="Build ui_loop_v0 closed-loop tasks from local smoke artifacts.")
    parser.add_argument("smoke_dir", nargs="?", default="data/processed/ui_jepa_v0_smoke")
    parser.add_argument("--out", default="data/processed/ui_loop_v0")
    parser.add_argument("--set", dest="set_name", default="loop_easy_20", choices=["loop_easy_20", "loop_mixed_50", "loop_hard_100"])
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--limit", type=int, default=None)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        summary = build_loop_dataset(
            LoopBuildConfig(
                smoke_dir=Path(args.smoke_dir),
                output_dir=Path(args.out),
                set_name=args.set_name,
                seed=args.seed,
                limit=args.limit,
            )
        )
    except Exception as exc:
        print(f"ui-loop-build: {exc}", file=sys.stderr)
        return 2
    print(f"Wrote {summary['set_name']} to {Path(args.out) / args.set_name} ({summary['task_count']} tasks)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
