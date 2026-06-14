import json
from pathlib import Path

from codepawl_harness.cli import main
from codepawl_renderer import RenderConfig, render_html_file


ROOT = Path(__file__).resolve().parents[1]
EXAMPLE = ROOT / "examples" / "simple_landing.html"


def test_missing_input_file_behavior(tmp_path: Path) -> None:
    result = main([str(tmp_path / "missing.html"), "--out", str(tmp_path / "out")])

    assert result == 2
    assert not (tmp_path / "out").exists()


def test_rejects_non_html_input(tmp_path: Path) -> None:
    text_file = tmp_path / "fixture.txt"
    text_file.write_text("not html", encoding="utf-8")

    result = main([str(text_file), "--out", str(tmp_path / "out")])

    assert result == 2
    assert not (tmp_path / "out").exists()


def test_example_html_renders_expected_artifacts(tmp_path: Path) -> None:
    output_dir = tmp_path / "render"

    result = render_html_file(RenderConfig(input_path=EXAMPLE, output_dir=output_dir))

    assert result.screenshot_path.is_file()
    assert result.dom_path.is_file()
    assert result.accessibility_path.is_file()
    assert result.metrics_path.is_file()
    assert result.screenshot_path.stat().st_size > 0

    dom = json.loads(result.dom_path.read_text(encoding="utf-8"))
    accessibility = json.loads(result.accessibility_path.read_text(encoding="utf-8"))

    assert dom["tag_name"] == "html"
    assert "children" in dom
    assert accessibility["supported"] is True
    assert "nodes" in accessibility["snapshot"]


def test_metrics_include_basic_fields(tmp_path: Path) -> None:
    output_dir = tmp_path / "render"

    result = render_html_file(RenderConfig(input_path=EXAMPLE, output_dir=output_dir))
    metrics = json.loads(result.metrics_path.read_text(encoding="utf-8"))

    assert metrics["render_ok"] is True
    assert metrics["input_path"] == str(EXAMPLE.resolve())
    assert metrics["output_dir"] == str(output_dir.resolve())
    assert metrics["viewport_width"] == 1440
    assert metrics["viewport_height"] == 900
    assert metrics["screenshot_path"] == str((output_dir / "screenshot.png").resolve())
    assert metrics["dom_node_count"] > 0
    assert metrics["body_text_length"] > 0
    assert isinstance(metrics["has_horizontal_overflow"], bool)
    assert isinstance(metrics["has_vertical_overflow"], bool)
    assert metrics["contrast_issue_count"] == 0
    assert "contrast_issue_note" not in metrics
    assert metrics["contrast_checked_text_node_count"] > 0
    assert metrics["min_contrast_ratio"] >= 3
    assert metrics["average_contrast_ratio"] >= metrics["min_contrast_ratio"]
    assert isinstance(metrics["contrast_issues"], list)
    assert metrics["max_font_size"] > metrics["min_font_size"] > 0
    assert metrics["font_size_ratio"] > 1
    assert metrics["heading_count"] >= 1
    assert metrics["cta_like_element_count"] >= 1
    assert metrics["hierarchy_warning_count"] >= 0
    assert metrics["visible_element_count"] > 0
    assert metrics["average_element_area"] > 0
    assert metrics["median_element_area"] > 0
    assert 0 < metrics["viewport_fill_ratio"] <= 1
    assert metrics["horizontal_overflow_px"] >= 0
    assert metrics["vertical_scroll_height"] >= metrics["viewport_height"]
    assert metrics["max_right_overflow_px"] >= 0
