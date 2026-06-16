import json
from pathlib import Path

from codepawl_harness.pawlbench_positive_build_cli import main as build_main
from codepawl_harness.pawlbench_positive_report_cli import main as report_main
from codepawl_harness.pawlbench_positive_validate_cli import main as validate_main


def _fixture_source(tmp_path: Path) -> Path:
    source_dir = tmp_path / "positive_examples"
    source_dir.mkdir()
    (source_dir / "polished.html").write_text(
        """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Polished Fixture</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; font-family: system-ui, sans-serif; background: #f8fafc; color: #111827; }
    main { width: min(960px, calc(100vw - 48px)); margin: 0 auto; padding: 64px 0; }
    section { background: white; border: 1px solid #dbe3ef; border-radius: 12px; padding: 42px; }
    h1 { font-size: 52px; line-height: 1.05; margin: 0 0 18px; }
    p { color: #334155; font-size: 18px; line-height: 1.7; max-width: 680px; }
    a { display: inline-block; background: #2563eb; color: white; padding: 12px 16px; border-radius: 8px; }
  </style>
</head>
<body>
  <main>
    <section>
      <h1>Quiet operational clarity</h1>
      <p>A self-contained positive interface fixture with enough structure for rendering.</p>
      <a>Start review</a>
    </section>
  </main>
</body>
</html>
""",
        encoding="utf-8",
    )
    return source_dir


def test_positive_build_validate_and_report(tmp_path: Path) -> None:
    source_dir = _fixture_source(tmp_path)
    dataset_dir = tmp_path / "beautiful_ui_v0"
    validation_dir = tmp_path / "validation"
    report_dir = tmp_path / "report"

    result = build_main([str(source_dir), "--out", str(dataset_dir), "--seed", "42"])

    assert result == 0
    dataset = json.loads((dataset_dir / "dataset.json").read_text(encoding="utf-8"))
    assert dataset["schema_version"] == "pawlbench_positive_dataset_v1"
    assert dataset["dataset_id"] == "beautiful_ui_v0"
    assert dataset["sample_count"] == 1
    assert dataset["failed_count"] == 0
    assert dataset["manifest_path"].endswith("manifest.jsonl")
    assert (dataset_dir / "manifest.jsonl").is_file()
    assert set(dataset["metrics_summary"]) == {
        "average_contrast_issue_count",
        "average_font_size_ratio",
        "average_min_contrast_ratio",
        "average_viewport_fill_ratio",
        "overflow_count",
    }
    sample = dataset["samples"][0]
    assert sample["status"] == "ok"
    assert sample["source_dataset"] == "internal"
    assert sample["platform"] == "web_desktop"
    assert sample["page_type"] == "unknown"
    assert sample["width"] > 0
    assert sample["height"] > 0
    assert sample["viewport_width"] == 1440
    assert sample["viewport_height"] == 900
    assert sample["quality_filter_score"] >= 0
    assert sample["is_synthetic"] is False
    assert sample["is_corrupted"] is False
    manifest_records = [
        json.loads(line)
        for line in (dataset_dir / "manifest.jsonl").read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    assert manifest_records[0]["schema_version"] == "ui_jepa_local_positive_manifest_v1"
    assert manifest_records[0]["sample_id"] == sample["sample_id"]
    for filename in ("index.html", "screenshot.png", "dom.json", "accessibility.json", "metrics.json"):
        assert (dataset_dir / "samples" / sample["sample_id"] / filename).is_file()

    assert validate_main([str(dataset_dir), "--out", str(validation_dir)]) == 0
    validation = json.loads((validation_dir / "validation.json").read_text(encoding="utf-8"))
    assert validation["valid"] is True
    assert validation["sample_count_actual"] == 1

    assert report_main([str(dataset_dir), "--out", str(report_dir)]) == 0
    summary = json.loads((report_dir / "summary.json").read_text(encoding="utf-8"))
    assert summary["validation"]["valid"] is True
    assert summary["next_recommended_step"] == "Pawl-JEPA positive pretraining scaffold"
    assert "PawlBench Positive UI Corpus Report" in (report_dir / "report.md").read_text(encoding="utf-8")


def test_positive_validation_catches_missing_artifact(tmp_path: Path) -> None:
    source_dir = _fixture_source(tmp_path)
    dataset_dir = tmp_path / "beautiful_ui_v0"
    validation_dir = tmp_path / "validation"
    assert build_main([str(source_dir), "--out", str(dataset_dir), "--seed", "42"]) == 0
    sample_id = json.loads((dataset_dir / "dataset.json").read_text(encoding="utf-8"))["samples"][0]["sample_id"]
    (dataset_dir / "samples" / sample_id / "screenshot.png").unlink()

    result = validate_main([str(dataset_dir), "--out", str(validation_dir)])

    assert result == 1
    validation = json.loads((validation_dir / "validation.json").read_text(encoding="utf-8"))
    assert validation["valid"] is False
    assert any("missing screenshot.png" in error for error in validation["errors"])
