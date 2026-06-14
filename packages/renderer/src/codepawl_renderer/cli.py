"""Placeholder CLI for the future Playwright render harness."""

from __future__ import annotations

import argparse


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="codepawl-render",
        description="Render an HTML page and collect UI artifacts. Not implemented yet.",
    )
    parser.add_argument("input", help="Path or URL to render.")
    parser.add_argument("--out", required=True, help="Output artifact directory.")
    return parser


def main() -> int:
    parser = build_parser()
    parser.parse_args()
    parser.exit(
        2,
        "codepawl-render is scaffolded but not implemented. "
        "Next task: implement the Playwright render harness.\n",
    )
    return 2
