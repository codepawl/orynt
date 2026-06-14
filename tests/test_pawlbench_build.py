import json
from pathlib import Path

from codepawl_harness.pawlbench_build_cli import main


ROOT = Path(__file__).resolve().parents[1]
EXAMPLES = ROOT / "examples"


def test_build_command_processes_multiple_html_files(tmp_path: Path) -> None:
    output_dir = tmp_path / "dataset"

    result = main([str(EXAMPLES), "--out", str(output_dir), "--seed", "42"])

    assert result == 0
    dataset = json.loads((output_dir / "dataset.json").read_text(encoding="utf-8"))
    assert dataset["dataset_id"] == "dataset"
    assert dataset["seed"] == 42
    assert dataset["generated_at"] == "1970-01-01T00:00:42Z"
    assert dataset["sample_count"] >= 2
    assert dataset["failed_count"] == 0
    assert dataset["variant_count"] == dataset["sample_count"] * 4
    assert len(dataset["samples"]) == dataset["sample_count"]
    assert set(dataset["aggregate_metrics"]) == {
        "average_contrast_issue_delta",
        "average_min_contrast_ratio_delta",
        "average_font_size_ratio_delta",
        "average_changed_pixel_ratio",
    }

    sample_ids = {sample["sample_id"] for sample in dataset["samples"]}
    assert {"simple_landing", "simple_dashboard"} <= sample_ids
    for sample in dataset["samples"]:
        assert sample["status"] == "ok"
        assert (Path(sample["labels_path"])).is_file()
        assert len(sample["variants"]) == 4
        assert (output_dir / "samples" / sample["sample_id"] / "original" / "metrics.json").is_file()
        for variant in sample["variants"]:
            assert variant["defect_type"] in {"spacing", "contrast", "alignment", "hierarchy"}
            assert Path(variant["metrics_path"]).is_file()


def test_build_command_is_deterministic_on_rerun(tmp_path: Path) -> None:
    output_dir = tmp_path / "dataset"

    first_result = main([str(EXAMPLES), "--out", str(output_dir), "--seed", "42"])
    first_dataset = (output_dir / "dataset.json").read_text(encoding="utf-8")

    second_result = main([str(EXAMPLES), "--out", str(output_dir), "--seed", "42"])
    second_dataset = (output_dir / "dataset.json").read_text(encoding="utf-8")

    assert first_result == 0
    assert second_result == 0
    assert second_dataset == first_dataset


def test_build_command_limit(tmp_path: Path) -> None:
    output_dir = tmp_path / "dataset"

    result = main([str(EXAMPLES), "--out", str(output_dir), "--seed", "42", "--limit", "1"])

    assert result == 0
    dataset = json.loads((output_dir / "dataset.json").read_text(encoding="utf-8"))
    assert dataset["sample_count"] == 1
    assert dataset["failed_count"] == 0
    assert dataset["variant_count"] == 4
    assert len(dataset["samples"]) == 1


def test_build_command_records_failure_and_continues(tmp_path: Path) -> None:
    source_dir = tmp_path / "fixtures"
    source_dir.mkdir()
    (source_dir / "valid.html").write_text(
        "<!doctype html><html><body><h1>Valid</h1><a href='#'>Start</a></body></html>",
        encoding="utf-8",
    )
    (source_dir / "broken.html").mkdir()

    output_dir = tmp_path / "dataset"
    result = main([str(source_dir), "--out", str(output_dir), "--seed", "42"])

    assert result == 0
    dataset = json.loads((output_dir / "dataset.json").read_text(encoding="utf-8"))
    assert dataset["sample_count"] == 1
    assert dataset["failed_count"] == 1
    assert dataset["variant_count"] == 4
    failed = next(sample for sample in dataset["samples"] if sample["status"] == "failed")
    assert failed["sample_id"] == "broken"
    assert failed["error"]


def test_build_command_fail_fast_stops_on_failure(tmp_path: Path) -> None:
    source_dir = tmp_path / "fixtures"
    source_dir.mkdir()
    (source_dir / "broken.html").mkdir()

    output_dir = tmp_path / "dataset"
    result = main([str(source_dir), "--out", str(output_dir), "--seed", "42", "--fail-fast"])

    assert result == 2
    assert not (output_dir / "dataset.json").exists()
