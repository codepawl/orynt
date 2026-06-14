import json
from pathlib import Path

import pytest

from pawlbench_design import LabelAppStore
from pawlbench_design.label_app import _app_html


PNG_BYTES = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
    b"\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\xff\xff?"
    b"\x00\x05\xfe\x02\xfeA\xe2&\x15\x00\x00\x00\x00IEND\xaeB`\x82"
)


def _queue_dir(tmp_path: Path) -> Path:
    queue_dir = tmp_path / "labels"
    queue_dir.mkdir()
    image_root = queue_dir / "images"
    for name in (
        "sample_a_original.png",
        "sample_a_variant.png",
        "sample_b_original.png",
        "sample_b_variant.png",
    ):
        (image_root / name).parent.mkdir(parents=True, exist_ok=True)
        (image_root / name).write_bytes(PNG_BYTES)

    records = [
        _queue_record(
            queue_dir,
            "local_test__train__sample_a__spacing_bad",
            "sample_a",
            "spacing_bad",
            "spacing",
        ),
        _queue_record(
            queue_dir,
            "local_test__train__sample_b__contrast_bad",
            "sample_b",
            "contrast_bad",
            "contrast",
        ),
    ]
    (queue_dir / "queue.jsonl").write_text(
        "".join(json.dumps(record, sort_keys=True) + "\n" for record in records),
        encoding="utf-8",
    )
    return queue_dir


def _queue_record(
    queue_dir: Path,
    label_id: str,
    sample_id: str,
    variant_name: str,
    defect_type: str,
) -> dict:
    return {
        "label_id": label_id,
        "dataset_id": "local_test",
        "split": "train",
        "sample_id": sample_id,
        "variant_name": variant_name,
        "defect_type": defect_type,
        "left_item": "original",
        "right_item": "variant",
        "original": {
            "screenshot_path": str(queue_dir / "images" / f"{sample_id}_original.png"),
            "metrics_path": str(queue_dir / "images" / f"{sample_id}_original_metrics.json"),
        },
        "variant": {
            "screenshot_path": str(queue_dir / "images" / f"{sample_id}_variant.png"),
            "metrics_path": str(queue_dir / "images" / f"{sample_id}_variant_metrics.json"),
        },
        "expected_issue": f"{defect_type} issue",
        "expected_fix_instruction": f"Fix {defect_type}",
        "metric_deltas": {"contrast_issue_delta": 1},
    }


def _payload(label_id: str, **overrides: object) -> dict:
    payload = {
        "label_id": label_id,
        "preferred": "left",
        "defect_tags": ["spacing"],
        "quality_tags": ["readable"],
        "severity": "medium",
        "confidence": 4,
        "fix_instruction": "Restore the intended layout.",
        "reason": "Left is clearer.",
        "labeler_id": "test_labeler",
    }
    payload.update(overrides)
    return payload


def _suggestion(record: dict) -> dict:
    return {
        "label_id": record["label_id"],
        "dataset_id": record["dataset_id"],
        "split": record["split"],
        "sample_id": record["sample_id"],
        "variant_name": record["variant_name"],
        "defect_type": record["defect_type"],
        "left_item": record["left_item"],
        "right_item": record["right_item"],
        "preferred": "left",
        "defect_tags": [record["defect_type"]],
        "quality_tags": ["readable"],
        "severity": "medium",
        "fix_instruction": "Use the suggested fix.",
        "reason": "Suggested from synthetic metadata.",
        "confidence": 4,
        "labeler_id": "codepawl_rule_v0",
        "created_at": "1970-01-01T00:00:00Z",
        "suggested_by": "codepawl_rule_v0",
        "suggestion_confidence": 4,
        "review_status": "suggested",
        "reviewed_by": None,
        "reviewed_at": None,
    }


def _write_suggestions(queue_dir: Path) -> None:
    records = _read_labels(queue_dir / "queue.jsonl")
    (queue_dir / "suggested_labels.jsonl").write_text(
        "".join(json.dumps(_suggestion(record), sort_keys=True) + "\n" for record in records),
        encoding="utf-8",
    )


def _read_labels(path: Path) -> list[dict]:
    return [
        json.loads(line)
        for line in path.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]


def test_label_app_loads_queue(tmp_path: Path) -> None:
    store = LabelAppStore(_queue_dir(tmp_path))

    summary = store.queue_summary()
    item = store.item(0)

    assert summary["total"] == 2
    assert summary["label_ids"][0] == "local_test__train__sample_a__spacing_bad"
    assert item["record"]["sample_id"] == "sample_a"
    assert item["left_image_url"].endswith("/left")
    assert item["right_image_url"].endswith("/right")


def test_label_app_prefills_suggestions(tmp_path: Path) -> None:
    queue_dir = _queue_dir(tmp_path)
    _write_suggestions(queue_dir)
    store = LabelAppStore(queue_dir)

    item = store.item(0)

    assert store.queue_summary()["has_suggestions"] is True
    assert item["label"] is None
    assert item["suggestion"]["review_status"] == "suggested"
    assert item["suggestion"]["fix_instruction"] == "Use the suggested fix."


def test_label_app_upserts_labels_without_duplicates(tmp_path: Path) -> None:
    queue_dir = _queue_dir(tmp_path)
    store = LabelAppStore(queue_dir)
    label_id = store.queue[0]["label_id"]

    store.save_label(_payload(label_id, preferred="left", reason="First reason."))
    store.save_label(_payload(label_id, preferred="right", reason="Updated reason."))

    labels = _read_labels(queue_dir / "labels.jsonl")
    assert len(labels) == 1
    assert labels[0]["label_id"] == label_id
    assert labels[0]["preferred"] == "right"
    assert labels[0]["reason"] == "Updated reason."


def test_label_app_confirm_and_edit_update_review_status(tmp_path: Path) -> None:
    queue_dir = _queue_dir(tmp_path)
    _write_suggestions(queue_dir)
    store = LabelAppStore(queue_dir, labeler_id="an")
    first_id = store.queue[0]["label_id"]
    second_id = store.queue[1]["label_id"]

    store.save_label({"label_id": first_id, "review_status": "confirmed", "reviewed_by": "reviewer"})
    store.save_label(_payload(second_id, review_status="edited", preferred="right"))

    labels = _read_labels(queue_dir / "labels.jsonl")
    assert labels[0]["review_status"] == "confirmed"
    assert labels[0]["reviewed_by"] == "reviewer"
    assert labels[0]["suggested_preferred"] == "left"
    assert labels[1]["review_status"] == "edited"
    assert labels[1]["preferred"] == "right"


def test_label_app_default_reviewer_is_not_suggested_by(tmp_path: Path) -> None:
    queue_dir = _queue_dir(tmp_path)
    _write_suggestions(queue_dir)
    store = LabelAppStore(queue_dir, labeler_id="an")
    label_id = store.queue[0]["label_id"]

    store.save_label({"label_id": label_id, "review_status": "confirmed"})

    label = _read_labels(queue_dir / "labels.jsonl")[0]
    assert label["review_status"] == "confirmed"
    assert label["reviewed_by"] == "an"
    assert label["labeler_id"] == "an"
    assert label["suggested_by"] == "codepawl_rule_v0"
    assert label["reviewed_by"] != label["suggested_by"]


def test_label_app_unclear_and_skip_actions(tmp_path: Path) -> None:
    queue_dir = _queue_dir(tmp_path)
    store = LabelAppStore(queue_dir)
    first_id = store.queue[0]["label_id"]
    second_id = store.queue[1]["label_id"]

    store.save_label(_payload(first_id, review_status="unclear", preferred="unclear"))
    store.save_label({"label_id": second_id, "review_status": "skipped", "reviewed_by": "reviewer"})

    labels = _read_labels(queue_dir / "labels.jsonl")
    assert labels[0]["review_status"] == "unclear"
    assert labels[0]["preferred"] == "unclear"
    assert labels[1]["review_status"] == "skipped"
    assert labels[1]["preferred"] == "unclear"
    assert store.progress()["review_status_counts"] == {"skipped": 1, "unclear": 1}


def test_label_app_duplicate_label_prevention_on_load(tmp_path: Path) -> None:
    queue_dir = _queue_dir(tmp_path)
    store = LabelAppStore(queue_dir)
    label_id = store.queue[0]["label_id"]
    store.save_label(_payload(label_id))
    label = _read_labels(queue_dir / "labels.jsonl")[0]
    (queue_dir / "labels.jsonl").write_text(
        json.dumps(label, sort_keys=True) + "\n" + json.dumps(label, sort_keys=True) + "\n",
        encoding="utf-8",
    )

    with pytest.raises(ValueError, match="duplicate label_id"):
        LabelAppStore(queue_dir)


def test_label_app_rejects_invalid_enum(tmp_path: Path) -> None:
    store = LabelAppStore(_queue_dir(tmp_path))
    label_id = store.queue[0]["label_id"]

    with pytest.raises(ValueError, match="preferred"):
        store.save_label(_payload(label_id, preferred="original"))


def test_label_app_serves_images_only_for_known_queue_items(tmp_path: Path) -> None:
    store = LabelAppStore(_queue_dir(tmp_path))
    label_id = store.queue[0]["label_id"]

    assert store.screenshot_path(label_id, "left").is_file()
    assert store.screenshot_path(label_id, "right").is_file()
    with pytest.raises(ValueError, match="not present in queue"):
        store.screenshot_path("unknown", "left")
    with pytest.raises(ValueError, match="side must be left or right"):
        store.screenshot_path(label_id, "original")


def test_label_app_progress_summary(tmp_path: Path) -> None:
    store = LabelAppStore(_queue_dir(tmp_path))
    label_id = store.queue[0]["label_id"]

    empty = store.progress()
    store.save_label(_payload(label_id))
    progress = store.progress()

    assert empty["completed"] == 0
    assert empty["total"] == 2
    assert progress["completed"] == 1
    assert progress["coverage_ratio"] == 0.5
    assert progress["coverage_by_defect_type"]["spacing"] == {"completed": 1, "total": 1}
    assert progress["coverage_by_defect_type"]["contrast"] == {"completed": 0, "total": 1}
    assert (store.state_path).is_file()


def test_label_app_html_contains_shortcut_help() -> None:
    html = _app_html()

    assert "Keyboard Shortcuts" in html
    assert "Confirm suggestion" in html
    assert "Edit & save" in html
    assert "isTypingTarget" in html
    assert "event.key === \" \"" in html
