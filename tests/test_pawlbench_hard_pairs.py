import json
from pathlib import Path

from pawlbench_design import HardPairConfig, LabelAppStore, build_hard_pairs
from pawlbench_design.labels import build_label_validation


PNG_BYTES = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
    b"\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\xff\xff?"
    b"\x00\x05\xfe\x02\xfeA\xe2&\x15\x00\x00\x00\x00IEND\xaeB`\x82"
)


def _write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def _read_jsonl(path: Path) -> list[dict]:
    return [
        json.loads(line)
        for line in path.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]


def _tiny_dataset(tmp_path: Path) -> Path:
    dataset_dir = tmp_path / "local_v1"
    sample_dir = dataset_dir / "samples" / "sample_a"
    variants = []
    specs = {
        "contrast_bad": ("contrast", {"contrast_issue_count": 8, "min_contrast_ratio": 1.5, "font_size_ratio": 2.0, "hierarchy_warning_count": 0}),
        "spacing_bad": ("spacing", {"contrast_issue_count": 0, "min_contrast_ratio": 6.0, "font_size_ratio": 2.0, "hierarchy_warning_count": 0}),
        "hierarchy_bad": ("hierarchy", {"contrast_issue_count": 0, "min_contrast_ratio": 6.0, "font_size_ratio": 1.1, "hierarchy_warning_count": 2}),
        "alignment_bad": ("alignment", {"contrast_issue_count": 0, "min_contrast_ratio": 6.0, "font_size_ratio": 2.0, "hierarchy_warning_count": 0}),
    }
    for variant_name, (defect_type, metrics) in specs.items():
        variant_dir = sample_dir / "jittered" / variant_name
        screenshot_path = variant_dir / "screenshot.png"
        metrics_path = variant_dir / "metrics.json"
        screenshot_path.parent.mkdir(parents=True, exist_ok=True)
        screenshot_path.write_bytes(PNG_BYTES)
        _write_json(metrics_path, metrics)
        variants.append(
            {
                "variant_name": variant_name,
                "defect_type": defect_type,
                "screenshot_path": str(screenshot_path),
                "metrics_path": str(metrics_path),
                "html_path": str(variant_dir / "index.html"),
                "dom_path": str(variant_dir / "dom.json"),
                "accessibility_path": str(variant_dir / "accessibility.json"),
            }
        )
    _write_json(
        dataset_dir / "dataset.json",
        {
            "dataset_id": "local_test",
            "sample_count": 1,
            "variant_count": 4,
            "samples": [
                {
                    "sample_id": "sample_a",
                    "status": "ok",
                    "output_dir": str(sample_dir),
                    "variants": variants,
                }
            ],
        },
    )
    return dataset_dir


def test_hard_pair_generation_is_deterministic_and_excludes_original(tmp_path: Path) -> None:
    dataset_dir = _tiny_dataset(tmp_path)

    first = build_hard_pairs(HardPairConfig(dataset_dir, tmp_path / "first", seed=42))
    second = build_hard_pairs(HardPairConfig(dataset_dir, tmp_path / "second", seed=42))

    assert first.records == second.records
    assert first.summary["pair_count"] == 3
    assert all(record["left_item"] != "original" for record in first.records)
    assert all(record["right_item"] != "original" for record in first.records)
    assert {record["pair_kind"] for record in first.records} == {"variant_vs_variant"}


def test_hard_pair_left_right_randomization_stable_for_seed(tmp_path: Path) -> None:
    dataset_dir = _tiny_dataset(tmp_path)

    result = build_hard_pairs(HardPairConfig(dataset_dir, tmp_path / "hard", seed=42))

    left_right = [(record["left_item"], record["right_item"]) for record in result.records]
    assert left_right == [
        ("contrast_bad", "spacing_bad"),
        ("hierarchy_bad", "alignment_bad"),
        ("hierarchy_bad", "spacing_bad"),
    ]


def test_hard_pair_suggestions_validate_but_are_not_human_reviewed(tmp_path: Path) -> None:
    dataset_dir = _tiny_dataset(tmp_path)
    result = build_hard_pairs(HardPairConfig(dataset_dir, tmp_path / "hard", seed=42))

    validation = build_label_validation(
        labels_path=result.suggested_labels_path,
        queue_path=result.review_queue_path,
    )

    assert validation["valid"]
    assert validation["suggested_count"] == 3
    assert validation["human_reviewed_count"] == 0
    assert "suggestions but no confirmed or edited human labels" in validation["warnings"][0]
    assert all(label["review_status"] == "suggested" for label in result.suggested_labels)


def test_label_app_loads_and_saves_hard_pair_queue(tmp_path: Path) -> None:
    dataset_dir = _tiny_dataset(tmp_path)
    result = build_hard_pairs(HardPairConfig(dataset_dir, tmp_path / "hard", seed=42))
    store = LabelAppStore(result.output_dir / "review", labeler_id="reviewer")
    item = store.item(0)

    assert item["record"]["left_item"] != "original"
    assert store.screenshot_path(item["record"]["label_id"], "left").is_file()
    store.save_label(
        {
            "label_id": item["record"]["label_id"],
            "review_status": "confirmed",
            "reviewed_by": "reviewer",
        }
    )

    labels = _read_jsonl(result.output_dir / "review" / "labels.jsonl")
    assert labels[0]["review_status"] == "confirmed"
    assert labels[0]["reviewed_by"] == "reviewer"
    assert labels[0]["pair_kind"] == "variant_vs_variant"
    assert labels[0]["left_variant_name"] == item["record"]["left_variant_name"]
