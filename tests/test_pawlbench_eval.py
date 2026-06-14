import json
from pathlib import Path

from codepawl_harness.jitter_cli import main as jitter_main
from codepawl_harness.pawlbench_eval_cli import main as eval_main


ROOT = Path(__file__).resolve().parents[1]
EXAMPLE = ROOT / "examples" / "simple_landing.html"


def _generate_pairs(tmp_path: Path) -> Path:
    pair_dir = tmp_path / "jitter_pairs"
    result = jitter_main([str(EXAMPLE), "--out", str(pair_dir), "--seed", "42"])

    assert result == 0
    return pair_dir


def test_valid_generated_jitter_pair_evaluates(tmp_path: Path) -> None:
    pair_dir = _generate_pairs(tmp_path)
    output_dir = tmp_path / "eval"

    result = eval_main([str(pair_dir), "--out", str(output_dir)])

    assert result == 0
    assert (output_dir / "summary.json").is_file()
    assert (output_dir / "pairs.json").is_file()

    summary = json.loads((output_dir / "summary.json").read_text(encoding="utf-8"))
    pairs = json.loads((output_dir / "pairs.json").read_text(encoding="utf-8"))

    assert summary["valid"] is True
    assert summary["errors"] == []
    assert summary["variant_count"] == 4
    assert len(pairs) == 4
    assert summary["variants_by_defect_type"] == {
        "alignment": 1,
        "contrast": 1,
        "hierarchy": 1,
        "spacing": 1,
    }


def test_missing_labels_json_fails(tmp_path: Path) -> None:
    pair_dir = _generate_pairs(tmp_path)
    (pair_dir / "labels.json").unlink()

    result = eval_main([str(pair_dir), "--out", str(tmp_path / "eval")])

    assert result == 2
    assert not (tmp_path / "eval" / "summary.json").exists()


def test_missing_screenshot_reference_fails(tmp_path: Path) -> None:
    pair_dir = _generate_pairs(tmp_path)
    labels_path = pair_dir / "labels.json"
    labels = json.loads(labels_path.read_text(encoding="utf-8"))
    Path(labels["variants"][0]["screenshot_path"]).unlink()

    result = eval_main([str(pair_dir), "--out", str(tmp_path / "eval")])

    assert result == 2
    assert not (tmp_path / "eval" / "pairs.json").exists()


def test_metric_fields_are_numeric(tmp_path: Path) -> None:
    pair_dir = _generate_pairs(tmp_path)
    output_dir = tmp_path / "eval"

    result = eval_main([str(pair_dir), "--out", str(output_dir)])

    assert result == 0
    pairs = json.loads((output_dir / "pairs.json").read_text(encoding="utf-8"))
    summary = json.loads((output_dir / "summary.json").read_text(encoding="utf-8"))

    assert isinstance(summary["average_mean_absolute_pixel_delta"], int | float)
    assert isinstance(summary["average_changed_pixel_ratio"], int | float)
    assert summary["average_mean_absolute_pixel_delta"] >= 0
    assert 0 <= summary["average_changed_pixel_ratio"] <= 1

    for pair in pairs:
        assert isinstance(pair["image_width"], int)
        assert isinstance(pair["image_height"], int)
        assert isinstance(pair["mean_absolute_pixel_delta"], int | float)
        assert isinstance(pair["rms_pixel_delta"], int | float)
        assert isinstance(pair["changed_pixel_ratio"], int | float)
        assert isinstance(pair["original_file_size_bytes"], int)
        assert isinstance(pair["variant_file_size_bytes"], int)
        assert pair["image_width"] > 0
        assert pair["image_height"] > 0
        assert pair["mean_absolute_pixel_delta"] >= 0
        assert pair["rms_pixel_delta"] >= 0
        assert 0 <= pair["changed_pixel_ratio"] <= 1
        assert pair["original_file_size_bytes"] > 0
        assert pair["variant_file_size_bytes"] > 0
