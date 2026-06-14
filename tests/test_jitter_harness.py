import json
from pathlib import Path

from codepawl_harness.jitter_cli import main


ROOT = Path(__file__).resolve().parents[1]
EXAMPLE = ROOT / "examples" / "simple_landing.html"
VARIANTS = [
    "spacing_bad",
    "contrast_bad",
    "alignment_bad",
    "hierarchy_bad",
]


def test_jitter_does_not_modify_source_html(tmp_path: Path) -> None:
    before = EXAMPLE.read_text(encoding="utf-8")

    result = main([str(EXAMPLE), "--out", str(tmp_path / "pairs"), "--seed", "42"])

    assert result == 0
    assert EXAMPLE.read_text(encoding="utf-8") == before


def test_jitter_command_creates_expected_files(tmp_path: Path) -> None:
    output_dir = tmp_path / "pairs"

    result = main([str(EXAMPLE), "--out", str(output_dir), "--seed", "42"])

    assert result == 0
    assert (output_dir / "original" / "index.html").is_file()
    assert (output_dir / "original" / "screenshot.png").is_file()
    assert (output_dir / "original" / "dom.json").is_file()
    assert (output_dir / "original" / "accessibility.json").is_file()
    assert (output_dir / "original" / "metrics.json").is_file()
    assert (output_dir / "labels.json").is_file()

    for variant_name in VARIANTS:
        variant_dir = output_dir / "jittered" / variant_name
        assert (variant_dir / "index.html").is_file()
        assert (variant_dir / "screenshot.png").is_file()
        assert (variant_dir / "dom.json").is_file()
        assert (variant_dir / "accessibility.json").is_file()
        assert (variant_dir / "metrics.json").is_file()
        assert (variant_dir / "screenshot.png").stat().st_size > 0


def test_labels_json_has_expected_schema(tmp_path: Path) -> None:
    output_dir = tmp_path / "pairs"

    result = main([str(EXAMPLE), "--out", str(output_dir), "--seed", "42"])

    assert result == 0
    labels = json.loads((output_dir / "labels.json").read_text(encoding="utf-8"))

    assert labels["source_input_path"] == str(EXAMPLE.resolve())
    assert labels["seed"] == 42
    assert labels["generated_at"] == "1970-01-01T00:00:42Z"
    assert [variant["variant_name"] for variant in labels["variants"]] == VARIANTS

    for variant in labels["variants"]:
        assert variant["defect_type"] in {"spacing", "contrast", "alignment", "hierarchy"}
        assert variant["severity"] == "medium"
        assert variant["html_path"].endswith(f"{variant['variant_name']}/index.html")
        assert variant["screenshot_path"].endswith(f"{variant['variant_name']}/screenshot.png")
        assert variant["dom_path"].endswith(f"{variant['variant_name']}/dom.json")
        assert variant["accessibility_path"].endswith(
            f"{variant['variant_name']}/accessibility.json"
        )
        assert variant["metrics_path"].endswith(f"{variant['variant_name']}/metrics.json")
        assert variant["expected_issue"]
        assert variant["expected_fix_instruction"]


def test_same_seed_produces_stable_labels_and_html(tmp_path: Path) -> None:
    output_dir = tmp_path / "pairs"

    first_result = main([str(EXAMPLE), "--out", str(output_dir), "--seed", "42"])
    first_labels = (output_dir / "labels.json").read_text(encoding="utf-8")
    first_html = {
        variant_name: (output_dir / "jittered" / variant_name / "index.html").read_text(
            encoding="utf-8"
        )
        for variant_name in VARIANTS
    }

    second_result = main([str(EXAMPLE), "--out", str(output_dir), "--seed", "42"])
    second_labels = (output_dir / "labels.json").read_text(encoding="utf-8")
    second_html = {
        variant_name: (output_dir / "jittered" / variant_name / "index.html").read_text(
            encoding="utf-8"
        )
        for variant_name in VARIANTS
    }

    assert first_result == 0
    assert second_result == 0
    assert second_labels == first_labels
    assert second_html == first_html
