"""Command-line interface for the local render harness."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from codepawl_renderer import RenderConfig, render_html_file


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="codepawl-render",
        description="Render a local HTML file and collect UI artifacts.",
    )
    parser.add_argument("input", help="Path to a local .html file.")
    parser.add_argument("--out", required=True, help="Output artifact directory.")
    parser.add_argument(
        "--viewport-width",
        type=int,
        default=1440,
        help="Browser viewport width. Defaults to 1440.",
    )
    parser.add_argument(
        "--viewport-height",
        type=int,
        default=900,
        help="Browser viewport height. Defaults to 900.",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    config = RenderConfig(
        input_path=Path(args.input),
        output_dir=Path(args.out),
        viewport_width=args.viewport_width,
        viewport_height=args.viewport_height,
    )

    try:
        result = render_html_file(config)
    except Exception as exc:
        print(f"codepawl-render: {exc}", file=sys.stderr)
        return 2

    print(f"Wrote render artifacts to {result.output_dir}")
    return 0
