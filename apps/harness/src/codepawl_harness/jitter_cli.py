"""Command-line interface for deterministic CSS jitter pairs."""

from __future__ import annotations

import argparse
import os
import shutil
import sys
import tempfile
from pathlib import Path

from codepawl_jitter import JitterConfig, JitterVariant, generate_jitter_pair_files
from codepawl_renderer import RenderConfig, render_html_file


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="codepawl-jitter",
        description="Generate deterministic degraded UI variants and render pair artifacts.",
    )
    parser.add_argument("input", help="Path to a local .html file.")
    parser.add_argument("--out", required=True, help="Output artifact directory.")
    parser.add_argument("--seed", type=int, required=True, help="Deterministic jitter seed.")
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    output_dir = Path(args.out).resolve()

    try:
        output_dir.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(
            dir=output_dir.parent,
            prefix=f".{output_dir.name}.",
        ) as temp_dir:
            stage_dir = Path(temp_dir) / output_dir.name
            result = generate_jitter_pair_files(
                JitterConfig(
                    input_path=Path(args.input),
                    output_dir=stage_dir,
                    public_output_dir=output_dir,
                    seed=args.seed,
                )
            )
            render_html_file(
                RenderConfig(
                    input_path=result.original_html_path,
                    output_dir=result.original_dir,
                )
            )
            _render_variant_screenshots(result.variants)
            _replace_output_dir(stage_dir, output_dir)
    except Exception as exc:
        print(f"codepawl-jitter: {exc}", file=sys.stderr)
        return 2

    print(f"Wrote jitter pair artifacts to {output_dir}")
    return 0


def _render_variant_screenshots(variants: list[JitterVariant]) -> None:
    for variant in variants:
        render_html_file(
            RenderConfig(
                input_path=variant.html_path,
                output_dir=variant.html_path.parent,
            )
        )


def _replace_output_dir(stage_dir: Path, output_dir: Path) -> None:
    if not output_dir.exists():
        os.replace(stage_dir, output_dir)
        return

    backup_dir = Path(
        tempfile.mkdtemp(
            dir=output_dir.parent,
            prefix=f".{output_dir.name}.backup.",
        )
    )
    shutil.rmtree(backup_dir)

    try:
        os.replace(output_dir, backup_dir)
        os.replace(stage_dir, output_dir)
    except Exception:
        if not output_dir.exists() and backup_dir.exists():
            os.replace(backup_dir, output_dir)
        raise
    else:
        shutil.rmtree(backup_dir, ignore_errors=True)
