import json
import shutil
from pathlib import Path

from codepawl_harness.pawlbench_build_cli import main as build_main
from codepawl_harness.pawlbench_report_cli import main as report_main
from codepawl_harness.pawlbench_split_cli import main as split_main
from codepawl_harness.pawlbench_validate_cli import main as validate_main


ROOT = Path(__file__).resolve().parents[1]
EXAMPLES = ROOT / "examples"
SIMPLE_LANDING = EXAMPLES / "simple_landing.html"
SIMPLE_DASHBOARD = EXAMPLES / "simple_dashboard.html"


def _small_examples(tmp_path: Path) -> Path:
    source_dir = tmp_path / "examples"
    source_dir.mkdir()
    shutil.copyfile(SIMPLE_LANDING, source_dir / "simple_landing.html")
    shutil.copyfile(SIMPLE_DASHBOARD, source_dir / "simple_dashboard.html")
    return source_dir


def _build_dataset(tmp_path: Path) -> Path:
    source_dir = _small_examples(tmp_path)
    dataset_dir = tmp_path / "dataset"
    result = build_main([str(source_dir), "--out", str(dataset_dir), "--seed", "42"])
    assert result == 0
    return dataset_dir


def test_validate_success_on_generated_dataset(tmp_path: Path) -> None:
    dataset_dir = _build_dataset(tmp_path)
    output_dir = tmp_path / "validation"

    result = validate_main([str(dataset_dir), "--out", str(output_dir)])

    assert result == 0
    validation = json.loads((output_dir / "validation.json").read_text(encoding="utf-8"))
    assert validation["valid"] is True
    assert validation["errors"] == []
    assert validation["sample_count_actual"] == 2
    assert validation["variant_count_actual"] == 8
    assert validation["defect_type_counts"] == {
        "alignment": 2,
        "contrast": 2,
        "hierarchy": 2,
        "spacing": 2,
    }
    assert all(value == 10 for value in validation["metric_coverage"].values())


def test_validate_failure_when_required_artifact_is_missing(tmp_path: Path) -> None:
    dataset_dir = _build_dataset(tmp_path)
    missing_path = dataset_dir / "samples" / "simple_landing" / "jittered" / "spacing_bad" / "metrics.json"
    missing_path.unlink()
    output_dir = tmp_path / "validation"

    result = validate_main([str(dataset_dir), "--out", str(output_dir)])

    assert result == 1
    validation = json.loads((output_dir / "validation.json").read_text(encoding="utf-8"))
    assert validation["valid"] is False
    assert any("metrics.json" in error for error in validation["errors"])


def test_splits_are_deterministic_with_same_seed(tmp_path: Path) -> None:
    dataset_dir = _build_dataset(tmp_path)
    first_dir = tmp_path / "splits_first"
    second_dir = tmp_path / "splits_second"

    first_result = split_main([str(dataset_dir), "--out", str(first_dir), "--seed", "42"])
    second_result = split_main([str(dataset_dir), "--out", str(second_dir), "--seed", "42"])

    assert first_result == 0
    assert second_result == 0
    assert (second_dir / "splits.json").read_text(encoding="utf-8") == (
        first_dir / "splits.json"
    ).read_text(encoding="utf-8")
    for name in ("train.jsonl", "val.jsonl", "test.jsonl"):
        assert (second_dir / name).read_text(encoding="utf-8") == (
            first_dir / name
        ).read_text(encoding="utf-8")


def test_split_sample_ids_do_not_leak_between_splits(tmp_path: Path) -> None:
    dataset_dir = _build_dataset(tmp_path)
    output_dir = tmp_path / "splits"

    result = split_main([str(dataset_dir), "--out", str(output_dir), "--seed", "42"])

    assert result == 0
    splits = json.loads((output_dir / "splits.json").read_text(encoding="utf-8"))
    assert splits["leakage_check"]["valid"] is True
    seen: dict[str, str] = {}
    for split in ("train", "val", "test"):
        for sample_id in splits["sample_ids"][split]:
            assert sample_id not in seen
            seen[sample_id] = split
    assert set(seen) == {"simple_dashboard", "simple_landing"}

    for split in ("train", "val", "test"):
        path = output_dir / f"{split}.jsonl"
        for line in path.read_text(encoding="utf-8").splitlines():
            record = json.loads(line)
            assert record["split"] == split
            assert record["sample_id"] in splits["sample_ids"][split]
            assert record["expected_issue"]
            assert record["expected_fix_instruction"]
            assert set(record["metric_deltas"]) == {
                "contrast_issue_delta",
                "min_contrast_ratio_delta",
                "font_size_ratio_delta",
                "viewport_fill_ratio_delta",
                "horizontal_overflow_delta",
            }


def test_report_outputs_markdown_and_summary(tmp_path: Path) -> None:
    dataset_dir = _build_dataset(tmp_path)
    output_dir = tmp_path / "report"

    result = report_main([str(dataset_dir), "--out", str(output_dir)])

    assert result == 0
    report = (output_dir / "report.md").read_text(encoding="utf-8")
    summary = json.loads((output_dir / "summary.json").read_text(encoding="utf-8"))
    assert "# PawlBench Dataset Report" in report
    assert "optional DINOv2/SigLIP baseline" in report
    assert summary["dataset_id"] == "dataset"
    assert summary["sample_count"] == 2
    assert summary["variant_count"] == 8
    assert summary["validation"]["valid"] is True
