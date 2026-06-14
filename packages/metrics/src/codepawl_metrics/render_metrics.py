"""Basic metrics for first-pass render artifacts."""

from __future__ import annotations

from pathlib import Path
from typing import Any


def build_render_metrics(
    *,
    input_path: Path,
    output_dir: Path,
    viewport_width: int,
    viewport_height: int,
    screenshot_path: Path,
    dom_node_count: int,
    body_text_length: int,
    overflow: dict[str, bool],
) -> dict[str, Any]:
    """Build a stable, human-readable metrics payload for one render."""

    return {
        "render_ok": True,
        "input_path": str(input_path),
        "output_dir": str(output_dir),
        "viewport_width": viewport_width,
        "viewport_height": viewport_height,
        "screenshot_path": str(screenshot_path),
        "dom_node_count": dom_node_count,
        "body_text_length": body_text_length,
        "has_horizontal_overflow": overflow["has_horizontal_overflow"],
        "has_vertical_overflow": overflow["has_vertical_overflow"],
        "contrast_issue_count": 0,
        "contrast_issue_note": "Placeholder: full contrast calculation is not implemented yet.",
    }
