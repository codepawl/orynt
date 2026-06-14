"""Basic metrics for first-pass render artifacts."""

from __future__ import annotations

from pathlib import Path
from typing import Any


def relative_luminance(red: int, green: int, blue: int) -> float:
    """Return WCAG relative luminance for an sRGB color."""

    def channel(value: int) -> float:
        normalized = value / 255
        if normalized <= 0.03928:
            return normalized / 12.92
        return ((normalized + 0.055) / 1.055) ** 2.4

    return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue)


def contrast_ratio(
    foreground: tuple[int, int, int],
    background: tuple[int, int, int],
) -> float:
    """Return the WCAG contrast ratio between two RGB colors."""

    foreground_luminance = relative_luminance(*foreground)
    background_luminance = relative_luminance(*background)
    lighter = max(foreground_luminance, background_luminance)
    darker = min(foreground_luminance, background_luminance)
    return (lighter + 0.05) / (darker + 0.05)


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
    ui_metrics: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Build a stable, human-readable metrics payload for one render."""

    metrics = {
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
    }
    if ui_metrics:
        metrics.update(ui_metrics)
    return metrics
