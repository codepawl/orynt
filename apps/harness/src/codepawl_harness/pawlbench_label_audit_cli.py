"""Command-line interface for PawlBench Design label provenance audits."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from pawlbench_design import LabelAuditConfig, audit_labels


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="pawlbench-design-label-audit",
        description="Audit PawlBench Design label provenance.",
    )
    parser.add_argument("labels_path", help="Path to labels JSONL.")
    parser.add_argument("--queue", required=True, help="Path to queue JSONL.")
    parser.add_argument("--out", required=True, help="Output audit directory.")
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    try:
        result = audit_labels(
            LabelAuditConfig(
                labels_path=Path(args.labels_path),
                queue_path=Path(args.queue),
                output_dir=Path(args.out),
            )
        )
    except Exception as exc:
        print(f"pawlbench-design-label-audit: {exc}", file=sys.stderr)
        return 2

    print(f"Wrote PawlBench Design label audit to {result.output_dir}")
    return 0 if result.audit["valid"] else 1
