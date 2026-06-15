"""Command-line interface for regenerating PawlBench label suggestions."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from pawlbench_design import LabelResuggestConfig, resuggest_labels


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="pawlbench-design-label-resuggest",
        description="Regenerate label suggestions without overwriting existing labels.",
    )
    parser.add_argument("queue_path", help="Path to queue.jsonl.")
    parser.add_argument("--existing-labels", required=True, help="Existing labels or suggestions JSONL.")
    parser.add_argument("--out", required=True, help="Output suggestions JSONL path.")
    parser.add_argument("--taste-profile", required=True, help="Taste profile YAML path.")
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        result = resuggest_labels(
            LabelResuggestConfig(
                queue_path=Path(args.queue_path),
                existing_labels_path=Path(args.existing_labels),
                output_path=Path(args.out),
                taste_profile_path=Path(args.taste_profile),
            )
        )
    except Exception as exc:
        print(f"pawlbench-design-label-resuggest: {exc}", file=sys.stderr)
        return 2

    summary = result.summary
    print(f"total records: {summary['total_records']}")
    print(f"changed preferred count: {summary['changed_preferred_count']}")
    print(f"changed severity count: {summary['changed_severity_count']}")
    print(f"changed defect tags count: {summary['changed_defect_tags_count']}")
    print(f"changed quality tags count: {summary['changed_quality_tags_count']}")
    print(f"Wrote PawlBench Design regenerated suggestions to {result.output_path}")
    return 0
