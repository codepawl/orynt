"""CLI for running the local closed-loop UI evaluation harness."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from pawlbench_design.ui_loop import LoopRunConfig, run_loop


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="ui-loop-run", description="Run closed-loop UI critique, instruction, patch, rerender, and scoring.")
    parser.add_argument("dataset_dir", nargs="?", default="data/processed/ui_loop_v0/loop_easy_20")
    parser.add_argument("--out", default="reports/ui_loop_v0")
    parser.add_argument("--preference-report", default="reports/ui_jepa_v0_smoke/preference_critic_report.json")
    parser.add_argument("--patch-mode", default="instruction_only", choices=["no_op", "instruction_only", "deterministic_patch", "oracle_patch", "manual_patch", "manual_patch_import"])
    parser.add_argument("--manual-patches", default=None, help="Directory containing manual patch records keyed by task_id.")
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--skip-render", action="store_true", help="Skip browser rendering for offline fixture-only checks.")
    parser.add_argument("--no-noop-baseline", action="store_true", help="Do not include no-op baseline task reports.")
    parser.add_argument("--viewport-width", type=int, default=1440)
    parser.add_argument("--viewport-height", type=int, default=900)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        report = run_loop(
            LoopRunConfig(
                dataset_dir=Path(args.dataset_dir),
                output_dir=Path(args.out),
                preference_report=Path(args.preference_report) if args.preference_report else None,
                patch_mode=args.patch_mode,
                limit=args.limit,
                seed=args.seed,
                render=not args.skip_render,
                include_noop_baseline=not args.no_noop_baseline,
                manual_patches_dir=Path(args.manual_patches) if args.manual_patches else None,
                viewport_width=args.viewport_width,
                viewport_height=args.viewport_height,
            )
        )
    except Exception as exc:
        print(f"ui-loop-run: {exc}", file=sys.stderr)
        return 2
    print(
        f"Wrote closed-loop report to {Path(args.out) / 'closed_loop_report.json'} "
        f"({report['task_count']} tasks, success_rate={report['success_rate']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
