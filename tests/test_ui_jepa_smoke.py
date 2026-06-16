import json
import shutil
from pathlib import Path

from PIL import Image

from codepawl_harness.ui_jepa_scale_gate_cli import main as gate_main
from codepawl_harness.ui_jepa_smoke_b0_cli import main as b0_main
from codepawl_harness.ui_jepa_smoke_build_cli import main as build_main
from codepawl_harness.ui_jepa_smoke_validate_cli import main as validate_main
from pawlbench_design.ui_jepa_smoke import _orientation_seed, _wilson_score_interval
from pawl_jepa.data import normalize_image_padded, transform_bbox_xyxy


def _write_json(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def _write_artifact_group(path: Path, *, title: str, color: tuple[int, int, int], defect_type: str | None = None) -> None:
    path.mkdir(parents=True, exist_ok=True)
    Image.new("RGB", (320, 180), color).save(path / "screenshot.png")
    (path / "index.html").write_text(
        f"""<!doctype html>
<html>
<head>
  <style>
    body {{ margin: 0; color: #111827; background: #f8fafc; font-size: 16px; }}
    main {{ padding: 24px; display: grid; gap: 16px; }}
    section.card {{ border-radius: 12px; box-shadow: 0 12px 30px #d1d5db; padding: 20px; }}
    h1 {{ font-size: 32px; }}
  </style>
</head>
<body>
  <main>
    <section class="hero card"><h1>{title}</h1><a class="button">Start</a></section>
  </main>
</body>
</html>
""",
        encoding="utf-8",
    )
    _write_json(
        path / "dom.json",
        {
            "tag_name": "html",
            "class": "",
            "text_snippet": title,
            "bounding_box": {"x": 0, "y": 0, "width": 320, "height": 180},
            "children": [
                {
                    "tag_name": "body",
                    "class": "",
                    "text_snippet": title,
                    "bounding_box": {"x": 0, "y": 0, "width": 320, "height": 180},
                    "children": [
                        {
                            "tag_name": "main",
                            "class": "",
                            "text_snippet": title,
                            "bounding_box": {"x": 16, "y": 12, "width": 288, "height": 150},
                            "children": [
                                {
                                    "tag_name": "section",
                                    "class": "hero card",
                                    "text_snippet": f"{title} Start",
                                    "bounding_box": {"x": 24, "y": 22, "width": 272, "height": 120},
                                    "children": [
                                        {
                                            "tag_name": "h1",
                                            "class": "",
                                            "text_snippet": title,
                                            "bounding_box": {"x": 36, "y": 38, "width": 180, "height": 42},
                                            "children": [],
                                        },
                                        {
                                            "tag_name": "a",
                                            "class": "button",
                                            "text_snippet": "Start",
                                            "bounding_box": {"x": 36, "y": 94, "width": 64, "height": 32},
                                            "children": [],
                                        },
                                    ],
                                }
                            ],
                        }
                    ],
                }
            ],
        },
    )
    _write_json(path / "accessibility.json", {"supported": True, "snapshot": {"nodes": []}})
    metrics = {
        "viewport_width": 320,
        "viewport_height": 180,
        "contrast_issue_count": 0,
        "visible_element_count": 5,
        "font_size_ratio": 2,
        "min_font_size": 16,
        "max_font_size": 32,
        "min_contrast_ratio": 7.0,
        "median_element_area": 4000,
        "hierarchy_warning_count": 0,
        "viewport_fill_ratio": 0.9,
        "has_horizontal_overflow": False,
        "has_vertical_overflow": False,
    }
    if defect_type == "spacing":
        metrics.update({"median_element_area": 2300, "visible_element_count": 6})
    if defect_type == "contrast":
        metrics.update({"contrast_issue_count": 3, "min_contrast_ratio": 2.0})
    _write_json(path / "metrics.json", metrics)


def _local_dataset(tmp_path: Path) -> Path:
    dataset_dir = tmp_path / "local_v1"
    sample_ids = ["sample_a", "sample_b", "sample_c"]
    samples = []
    for index, sample_id in enumerate(sample_ids):
        sample_dir = dataset_dir / "samples" / sample_id
        _write_artifact_group(sample_dir / "original", title=f"Original {sample_id}", color=(40, 120 + index, 200))
        variants = []
        for variant_name, defect_type in (("spacing_bad", "spacing"), ("contrast_bad", "contrast")):
            variant_dir = sample_dir / "jittered" / variant_name
            _write_artifact_group(variant_dir, title=f"{variant_name} {sample_id}", color=(180, 80 + index, 40), defect_type=defect_type)
            variants.append(
                {
                    "variant_name": variant_name,
                    "defect_type": defect_type,
                    "severity": "medium",
                    "html_path": str(variant_dir / "index.html"),
                    "screenshot_path": str(variant_dir / "screenshot.png"),
                    "dom_path": str(variant_dir / "dom.json"),
                    "accessibility_path": str(variant_dir / "accessibility.json"),
                    "metrics_path": str(variant_dir / "metrics.json"),
                }
            )
        _write_json(dataset_dir / "samples" / sample_id / "labels.json", {"variants": variants})
        samples.append(
            {
                "sample_id": sample_id,
                "source_path": str(tmp_path / f"{sample_id}.html"),
                "output_dir": str(sample_dir),
                "labels_path": str(sample_dir / "labels.json"),
                "status": "ok",
                "variants": variants,
            }
        )
    _write_json(
        dataset_dir / "dataset.json",
        {
            "dataset_id": "local_v1",
            "source_dir": str(tmp_path),
            "output_dir": str(dataset_dir),
            "seed": 42,
            "generated_at": "1970-01-01T00:00:42Z",
            "sample_count": len(samples),
            "variant_count": 6,
            "failed_count": 0,
            "samples": samples,
        },
    )
    return dataset_dir


def _read_jsonl(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def test_ui_jepa_smoke_build_validate_and_dummy_b0(tmp_path: Path) -> None:
    local_dataset = _local_dataset(tmp_path)
    smoke_dir = tmp_path / "ui_jepa_v0_smoke"
    validation_dir = tmp_path / "validation"
    reports_dir = tmp_path / "reports"

    assert build_main(["--local-dataset", str(local_dataset), "--out", str(smoke_dir), "--seed", "42"]) == 0
    assert build_main(["--local-dataset", str(local_dataset), "--out", str(tmp_path / "ui_jepa_v0_smoke_again"), "--seed", "42"]) == 0

    manifest = _read_jsonl(smoke_dir / "manifest.jsonl")
    regions = _read_jsonl(smoke_dir / "regions.jsonl")
    regions_again = _read_jsonl(tmp_path / "ui_jepa_v0_smoke_again" / "regions.jsonl")
    pairs = _read_jsonl(smoke_dir / "pairs.jsonl")
    tokens = _read_jsonl(smoke_dir / "design_tokens.jsonl")
    splits = json.loads((smoke_dir / "splits.json").read_text(encoding="utf-8"))
    assert len(manifest) == 9
    assert len(pairs) == 9
    assert len(tokens) == len(manifest)
    assert regions
    assert regions_again == regions
    assert {pair["pair_family"] for pair in pairs} == {"original_vs_corrupted", "variant_vs_variant_mixed_corruption"}
    assert {pair["left_is_preferred"] for pair in pairs} == {False, True}
    assert all("orientation_seed" in pair for pair in pairs)
    assert all(record["schema_version"] == "ui_jepa_v0_smoke_manifest_v1" for record in manifest)
    assert set(splits["split_groups"]) == {"train", "val", "test"}
    assert "aspect-preserving padded 768x768" in (smoke_dir / "dataset_card.md").read_text(encoding="utf-8")

    assert validate_main([str(smoke_dir), "--out", str(validation_dir)]) == 0
    validation = json.loads((validation_dir / "validation.json").read_text(encoding="utf-8"))
    assert validation["valid"] is True
    assert validation["screens_with_regions"] > 0
    assert validation["orientation_sanity"]["valid"] is True
    assert validation["pair_family_counts"]["variant_vs_variant_mixed_corruption"] == 3

    assert b0_main([str(smoke_dir), "--out", str(reports_dir), "--backend", "dummy", "--epochs", "3"]) == 0
    report = json.loads((reports_dir / "b0_report.json").read_text(encoding="utf-8"))
    assert report["model_backend"] == "dummy"
    assert report["real_weights"] is False
    assert report["valid_for_model_selection"] is False
    assert report["dataset_counts"]["pairs"] == 9
    assert report["metrics_baseline"]["available"] is True
    assert report["splits"]["train"]["confidence_interval_method"] == "wilson"

    gate_out = tmp_path / "gate.json"
    assert gate_main(["--dataset", str(smoke_dir), "--b0-report", str(reports_dir / "b0_report.json"), "--out", str(gate_out)]) == 1
    gate = json.loads(gate_out.read_text(encoding="utf-8"))
    assert gate["allowed"] is False
    assert any("real frozen vision encoder" in error for error in gate["errors"])

    leaky_dir = tmp_path / "ui_jepa_v0_smoke_leaky"
    shutil.copytree(smoke_dir, leaky_dir)
    leaky_pairs = []
    for repeat in range(4):
        for source_pair in _read_jsonl(leaky_dir / "pairs.jsonl"):
            pair = dict(source_pair)
            pair["pair_id"] = f"{source_pair['pair_id']}__leak{repeat}"
            pair["orientation_seed"] = _orientation_seed(pair["pair_id"], 42)
            preferred = pair["preferred_screen_id"]
            other = pair["right_screen_id"] if pair["left_screen_id"] == preferred else pair["left_screen_id"]
            pair["left_screen_id"] = preferred
            pair["right_screen_id"] = other
            pair["left_is_preferred"] = True
            leaky_pairs.append(pair)
    (leaky_dir / "pairs.jsonl").write_text(
        "".join(json.dumps(pair, sort_keys=True) + "\n" for pair in sorted(leaky_pairs, key=lambda item: item["pair_id"])),
        encoding="utf-8",
    )
    leaky_gate_out = tmp_path / "leaky_gate.json"
    assert gate_main(["--dataset", str(leaky_dir), "--b0-report", str(reports_dir / "b0_report.json"), "--out", str(leaky_gate_out)]) == 1
    leaky_gate = json.loads(leaky_gate_out.read_text(encoding="utf-8"))
    assert any("orientation sanity failed" in error for error in leaky_gate["errors"])


def test_wilson_interval_is_not_degenerate() -> None:
    assert _wilson_score_interval(12, 12)[0] < 1.0
    assert _wilson_score_interval(100, 100)[0] < 1.0
    interval = _wilson_score_interval(50, 100)
    assert interval[0] < 0.5 < interval[1]


def test_padded_normalization_transforms_bbox() -> None:
    image = Image.new("RGB", (400, 200), (255, 255, 255))

    normalized, metadata = normalize_image_padded(image, canvas_size=100)
    bbox = transform_bbox_xyxy([100, 50, 300, 150], metadata)

    assert normalized.size == (100, 100)
    assert metadata.resized_width == 100
    assert metadata.resized_height == 50
    assert metadata.pad_left == 0
    assert metadata.pad_top == 25
    assert bbox == [25.0, 37.5, 75.0, 62.5]
