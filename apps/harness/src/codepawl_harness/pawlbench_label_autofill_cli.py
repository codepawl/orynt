"""Command-line interface for promoting suggestions to weak auto labels."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Any

from codepawl_harness.progress import ProgressReporter, add_progress_arguments
from pawlbench_design import LabelAutofillConfig, autofill_labels


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="pawlbench-design-label-autofill",
        description="Create weak auto_labeled labels from a queue and suggestions JSONL.",
    )
    parser.add_argument("queue_path", help="Path to queue.jsonl.")
    parser.add_argument("--suggestions", required=True, help="Path to suggested_labels.jsonl.")
    parser.add_argument("--out", required=True, help="Output labels.auto.jsonl path.")
    parser.add_argument("--labeler-id", required=True, help="Machine/rule labeler identifier.")
    parser.add_argument("--auto-label-method", default="codepawl_taste_v0")
    add_progress_arguments(parser)
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    progress = ProgressReporter(quiet=args.quiet, no_progress=args.no_progress)
    try:
        result = autofill_labels(
            LabelAutofillConfig(
                queue_path=Path(args.queue_path),
                suggestions_path=Path(args.suggestions),
                output_path=Path(args.out),
                labeler_id=args.labeler_id,
                auto_label_method=args.auto_label_method,
                progress_callback=autofill_progress_callback(progress),
            )
        )
    except Exception as exc:
        print(f"pawlbench-design-label-autofill: {exc}", file=sys.stderr)
        return 2
    progress.done("label autofill complete")
    progress.log(f"Wrote PawlBench Design auto labels to {result.output_path}")
    return 0


def autofill_progress_callback(progress: ProgressReporter):
    def callback(event: dict[str, Any]) -> None:
        if event.get("event") != "label_autofill_record":
            return
        progress.update(
            f"records {event.get('record')}/{event.get('total_records')} "
            f"{event.get('label_id')}"
        )

    return callback
