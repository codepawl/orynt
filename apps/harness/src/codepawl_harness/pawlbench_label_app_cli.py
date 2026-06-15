"""Command-line interface for the local PawlBench Design label app."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from pawlbench_design import LabelAppConfig, run_label_app


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="pawlbench-design-label-app",
        description="Serve a localhost-only PawlBench Design human labeling app.",
    )
    parser.add_argument("queue_dir", help="Directory containing queue.jsonl.")
    parser.add_argument(
        "--host",
        default="127.0.0.1",
        help="Local bind host. Defaults to 127.0.0.1.",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=8765,
        help="Local bind port. Defaults to 8765.",
    )
    parser.add_argument(
        "--labeler-id",
        help="Default human labeler/reviewer identifier. Defaults to USER or an.",
    )
    parser.add_argument(
        "--blind",
        action="store_true",
        help="Hide suggestions until the reviewer selects a preference and reveals them.",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    try:
        run_label_app(
            LabelAppConfig(
                queue_dir=Path(args.queue_dir),
                host=args.host,
                port=args.port,
                labeler_id=args.labeler_id,
                blind=args.blind,
            )
        )
    except Exception as exc:
        print(f"pawlbench-design-label-app: {exc}", file=sys.stderr)
        return 2

    return 0
