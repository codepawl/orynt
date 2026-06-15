import json
from pathlib import Path

from codepawl_harness.pawlbench_label_queue_cli import main as queue_main
from codepawl_harness.pawlbench_label_audit_cli import main as audit_main
from codepawl_harness.pawlbench_label_report_cli import main as report_main
from codepawl_harness.pawlbench_label_set_reviewer_cli import main as set_reviewer_main
from codepawl_harness.pawlbench_label_suggest_cli import main as suggest_main
from codepawl_harness.pawlbench_label_validate_cli import main as validate_main


def _split_path(tmp_path: Path) -> Path:
    path = tmp_path / "train.jsonl"
    records = [
        _split_record("sample_a", "spacing_bad", "spacing"),
        _split_record("sample_a", "contrast_bad", "contrast"),
        _split_record("sample_b", "alignment_bad", "alignment"),
    ]
    path.write_text(
        "".join(json.dumps(record, sort_keys=True) + "\n" for record in records),
        encoding="utf-8",
    )
    return path


def _split_record(sample_id: str, variant_name: str, defect_type: str) -> dict:
    base = f"/tmp/pawlbench/{sample_id}"
    return {
        "dataset_id": "local_test",
        "split": "train",
        "sample_id": sample_id,
        "variant_name": variant_name,
        "defect_type": defect_type,
        "expected_issue": f"{defect_type} issue",
        "expected_fix_instruction": f"Fix {defect_type}",
        "metric_deltas": {
            "contrast_issue_delta": 1,
            "min_contrast_ratio_delta": -1.2,
        },
        "original": {
            "screenshot_path": f"{base}/original/screenshot.png",
            "metrics_path": f"{base}/original/metrics.json",
            "html_path": f"{base}/original/index.html",
            "dom_path": f"{base}/original/dom.json",
            "accessibility_path": f"{base}/original/accessibility.json",
        },
        "variant": {
            "screenshot_path": f"{base}/jittered/{variant_name}/screenshot.png",
            "metrics_path": f"{base}/jittered/{variant_name}/metrics.json",
            "html_path": f"{base}/jittered/{variant_name}/index.html",
            "dom_path": f"{base}/jittered/{variant_name}/dom.json",
            "accessibility_path": f"{base}/jittered/{variant_name}/accessibility.json",
        },
    }


def _read_jsonl(path: Path) -> list[dict]:
    return [
        json.loads(line)
        for line in path.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]


def _valid_label(queue_record: dict) -> dict:
    return {
        "label_id": queue_record["label_id"],
        "dataset_id": queue_record["dataset_id"],
        "split": queue_record["split"],
        "sample_id": queue_record["sample_id"],
        "variant_name": queue_record["variant_name"],
        "defect_type": queue_record["defect_type"],
        "left_item": queue_record["left_item"],
        "right_item": queue_record["right_item"],
        "preferred": "left",
        "defect_tags": [queue_record["defect_type"]],
        "quality_tags": ["readable"],
        "severity": "medium",
        "fix_instruction": "Restore the intended visual treatment.",
        "reason": "The preferred side is clearer.",
        "confidence": 4,
        "labeler_id": "test_labeler",
        "created_at": "2026-06-15T00:00:00Z",
    }


def test_label_queue_generation_creates_expected_files(tmp_path: Path) -> None:
    split_path = _split_path(tmp_path)
    output_dir = tmp_path / "labels"

    result = queue_main([str(split_path), "--out", str(output_dir), "--seed", "42", "--limit", "2"])

    assert result == 0
    for name in ("queue.jsonl", "labels.empty.jsonl", "label_schema.json", "review.html", "README.md"):
        assert (output_dir / name).is_file()

    records = _read_jsonl(output_dir / "queue.jsonl")
    assert len(records) == 2
    assert records[0]["label_id"] == "local_test__train__sample_a__spacing_bad"
    assert records[0]["original"]["screenshot_path"].endswith("/original/screenshot.png")
    assert records[0]["variant"]["metrics_path"].endswith("/jittered/spacing_bad/metrics.json")
    assert records[0]["expected_issue"] == "spacing issue"
    assert "Copyable Label Template" in (output_dir / "review.html").read_text(encoding="utf-8")


def test_label_queue_ab_randomization_is_deterministic(tmp_path: Path) -> None:
    split_path = _split_path(tmp_path)
    first_dir = tmp_path / "first"
    second_dir = tmp_path / "second"
    third_dir = tmp_path / "third"

    assert queue_main([str(split_path), "--out", str(first_dir), "--seed", "42"]) == 0
    assert queue_main([str(split_path), "--out", str(second_dir), "--seed", "42"]) == 0
    assert queue_main([str(split_path), "--out", str(third_dir), "--seed", "7"]) == 0

    first = (first_dir / "queue.jsonl").read_text(encoding="utf-8")
    second = (second_dir / "queue.jsonl").read_text(encoding="utf-8")
    third = (third_dir / "queue.jsonl").read_text(encoding="utf-8")
    assert first == second
    assert first != third


def test_label_validation_accepts_empty_labels_with_low_coverage_warning(tmp_path: Path) -> None:
    split_path = _split_path(tmp_path)
    queue_dir = tmp_path / "labels"
    validation_dir = tmp_path / "validation"
    assert queue_main([str(split_path), "--out", str(queue_dir), "--seed", "42"]) == 0

    result = validate_main(
        [
            str(queue_dir / "labels.empty.jsonl"),
            "--queue",
            str(queue_dir / "queue.jsonl"),
            "--out",
            str(validation_dir),
        ]
    )

    assert result == 0
    validation = json.loads((validation_dir / "validation.json").read_text(encoding="utf-8"))
    assert validation["valid"] is True
    assert validation["completed_labels"] == 0
    assert validation["coverage_ratio"] == 0
    assert validation["warnings"]


def test_label_validation_accepts_completed_label_fixture(tmp_path: Path) -> None:
    queue_dir = tmp_path / "labels"
    validation_dir = tmp_path / "validation"
    assert queue_main([str(_split_path(tmp_path)), "--out", str(queue_dir), "--seed", "42"]) == 0
    queue_record = _read_jsonl(queue_dir / "queue.jsonl")[0]
    labels_path = queue_dir / "labels.jsonl"
    labels_path.write_text(json.dumps(_valid_label(queue_record), sort_keys=True) + "\n", encoding="utf-8")

    result = validate_main(
        [str(labels_path), "--queue", str(queue_dir / "queue.jsonl"), "--out", str(validation_dir)]
    )

    assert result == 0
    validation = json.loads((validation_dir / "validation.json").read_text(encoding="utf-8"))
    assert validation["valid"] is True
    assert validation["completed_labels"] == 1
    assert validation["counts_by_preferred"]["left"] == 1
    assert validation["counts_by_severity"]["medium"] == 1


def test_label_validation_detects_duplicate_label_ids(tmp_path: Path) -> None:
    queue_dir = tmp_path / "labels"
    validation_dir = tmp_path / "validation"
    assert queue_main([str(_split_path(tmp_path)), "--out", str(queue_dir), "--seed", "42"]) == 0
    queue_record = _read_jsonl(queue_dir / "queue.jsonl")[0]
    label = _valid_label(queue_record)
    labels_path = queue_dir / "labels.jsonl"
    labels_path.write_text(
        json.dumps(label, sort_keys=True) + "\n" + json.dumps(label, sort_keys=True) + "\n",
        encoding="utf-8",
    )

    result = validate_main(
        [str(labels_path), "--queue", str(queue_dir / "queue.jsonl"), "--out", str(validation_dir)]
    )

    assert result == 1
    validation = json.loads((validation_dir / "validation.json").read_text(encoding="utf-8"))
    assert validation["valid"] is False
    assert any("duplicate label_id" in error for error in validation["errors"])


def test_label_validation_rejects_bad_enums_and_confidence(tmp_path: Path) -> None:
    queue_dir = tmp_path / "labels"
    validation_dir = tmp_path / "validation"
    assert queue_main([str(_split_path(tmp_path)), "--out", str(queue_dir), "--seed", "42"]) == 0
    label = _valid_label(_read_jsonl(queue_dir / "queue.jsonl")[0])
    label["preferred"] = "original"
    label["severity"] = "critical"
    label["confidence"] = 6
    labels_path = queue_dir / "labels.jsonl"
    labels_path.write_text(json.dumps(label, sort_keys=True) + "\n", encoding="utf-8")

    result = validate_main(
        [str(labels_path), "--queue", str(queue_dir / "queue.jsonl"), "--out", str(validation_dir)]
    )

    assert result == 1
    validation = json.loads((validation_dir / "validation.json").read_text(encoding="utf-8"))
    assert any("preferred" in error for error in validation["errors"])
    assert any("severity" in error for error in validation["errors"])
    assert any("confidence" in error for error in validation["errors"])


def test_label_report_outputs_markdown_and_summary(tmp_path: Path) -> None:
    queue_dir = tmp_path / "labels"
    report_dir = tmp_path / "report"
    assert queue_main([str(_split_path(tmp_path)), "--out", str(queue_dir), "--seed", "42"]) == 0
    records = _read_jsonl(queue_dir / "queue.jsonl")
    labels = [_valid_label(records[0]), _valid_label(records[1])]
    labels[1]["preferred"] = "right"
    labels[1]["defect_tags"] = ["contrast", "accessibility"]
    labels[1]["blind_review"] = True
    labels[1]["suggestion_revealed"] = False
    labels_path = queue_dir / "labels.jsonl"
    labels_path.write_text(
        "".join(json.dumps(label, sort_keys=True) + "\n" for label in labels),
        encoding="utf-8",
    )

    result = report_main([str(labels_path), "--queue", str(queue_dir / "queue.jsonl"), "--out", str(report_dir)])

    assert result == 0
    report = (report_dir / "report.md").read_text(encoding="utf-8")
    summary = json.loads((report_dir / "summary.json").read_text(encoding="utf-8"))
    assert "# PawlBench Design Label Report" in report
    assert summary["completed_labels"] == 2
    assert summary["preference_counts"]["left"] == 1
    assert summary["preference_counts"]["right"] == 1
    assert summary["defect_tag_counts"]["accessibility"] == 1
    assert summary["blind_review_count"] == 1
    assert summary["suggestion_revealed_count"] == 0
    assert summary["blind_preference_distribution"] == {"right": 1}
    assert "Blind Review" in report


def test_label_suggestions_are_generated_from_queue(tmp_path: Path) -> None:
    queue_dir = tmp_path / "labels"
    assert queue_main([str(_split_path(tmp_path)), "--out", str(queue_dir), "--seed", "42"]) == 0
    output_path = queue_dir / "suggested_labels.jsonl"

    result = suggest_main([str(queue_dir / "queue.jsonl"), "--out", str(output_path)])

    assert result == 0
    queue = _read_jsonl(queue_dir / "queue.jsonl")
    suggestions = _read_jsonl(output_path)
    assert len(suggestions) == len(queue)
    assert suggestions[0]["review_status"] == "suggested"
    assert suggestions[0]["suggested_by"] == "codepawl_rule_v0"
    assert suggestions[0]["fix_instruction"] == queue[0]["expected_fix_instruction"]
    assert suggestions[0]["confidence"] in {3, 4, 5}


def test_label_suggestion_preferred_side_matches_original_position(tmp_path: Path) -> None:
    queue_dir = tmp_path / "labels"
    assert queue_main([str(_split_path(tmp_path)), "--out", str(queue_dir), "--seed", "7"]) == 0
    output_path = queue_dir / "suggested_labels.jsonl"
    assert suggest_main([str(queue_dir / "queue.jsonl"), "--out", str(output_path)]) == 0

    for queue_record, suggestion in zip(_read_jsonl(queue_dir / "queue.jsonl"), _read_jsonl(output_path)):
        expected = "left" if queue_record["left_item"] == "original" else "right"
        assert suggestion["preferred"] == expected


def test_label_validation_reports_suggestions_separately(tmp_path: Path) -> None:
    queue_dir = tmp_path / "labels"
    validation_dir = tmp_path / "validation"
    assert queue_main([str(_split_path(tmp_path)), "--out", str(queue_dir), "--seed", "42"]) == 0
    suggestions_path = queue_dir / "suggested_labels.jsonl"
    assert suggest_main([str(queue_dir / "queue.jsonl"), "--out", str(suggestions_path)]) == 0

    result = validate_main(
        [str(suggestions_path), "--queue", str(queue_dir / "queue.jsonl"), "--out", str(validation_dir)]
    )

    assert result == 0
    validation = json.loads((validation_dir / "validation.json").read_text(encoding="utf-8"))
    assert validation["suggested_count"] == 3
    assert validation["confirmed_count"] == 0
    assert validation["edited_count"] == 0
    assert validation["counts_by_review_status"]["suggested"] == 3
    assert any("no confirmed or edited human labels" in warning for warning in validation["warnings"])


def test_label_report_includes_embedded_suggestion_agreement(tmp_path: Path) -> None:
    queue_dir = tmp_path / "labels"
    report_dir = tmp_path / "report"
    assert queue_main([str(_split_path(tmp_path)), "--out", str(queue_dir), "--seed", "42"]) == 0
    assert suggest_main(
        [str(queue_dir / "queue.jsonl"), "--out", str(queue_dir / "suggested_labels.jsonl")]
    ) == 0
    suggestion = _read_jsonl(queue_dir / "suggested_labels.jsonl")[0]
    label = {
        **suggestion,
        "review_status": "confirmed",
        "reviewed_by": "test_labeler",
        "reviewed_at": "2026-06-15T00:00:00Z",
        "labeler_id": "test_labeler",
        "created_at": "2026-06-15T00:00:00Z",
        "suggested_preferred": suggestion["preferred"],
        "suggested_severity": suggestion["severity"],
        "suggested_defect_tags": suggestion["defect_tags"],
    }
    labels_path = queue_dir / "labels.jsonl"
    labels_path.write_text(json.dumps(label, sort_keys=True) + "\n", encoding="utf-8")

    result = report_main([str(labels_path), "--queue", str(queue_dir / "queue.jsonl"), "--out", str(report_dir)])

    assert result == 0
    summary = json.loads((report_dir / "summary.json").read_text(encoding="utf-8"))
    assert summary["confirmed_count"] == 1
    assert summary["suggested_count"] == 0
    assert summary["agreement"]["compared_count"] == 1
    assert summary["agreement"]["preferred_agreement"] == 1


def test_label_audit_flags_rule_confirmed_labels(tmp_path: Path) -> None:
    queue_dir = tmp_path / "labels"
    audit_dir = tmp_path / "audit"
    assert queue_main([str(_split_path(tmp_path)), "--out", str(queue_dir), "--seed", "42"]) == 0
    assert suggest_main(
        [str(queue_dir / "queue.jsonl"), "--out", str(queue_dir / "suggested_labels.jsonl")]
    ) == 0
    suggestion = _read_jsonl(queue_dir / "suggested_labels.jsonl")[0]
    label = {
        **suggestion,
        "review_status": "confirmed",
        "reviewed_by": "codepawl_rule_v0",
        "reviewed_at": "2026-06-15T00:00:00Z",
    }
    labels_path = queue_dir / "labels.jsonl"
    labels_path.write_text(json.dumps(label, sort_keys=True) + "\n", encoding="utf-8")

    result = audit_main([str(labels_path), "--queue", str(queue_dir / "queue.jsonl"), "--out", str(audit_dir)])

    assert result == 1
    audit = json.loads((audit_dir / "audit.json").read_text(encoding="utf-8"))
    assert audit["suspicious_confirmed_count"] == 1
    assert audit["human_reviewed_count"] == 1
    assert audit["rule_reviewed_count"] == 1
    assert audit["flagged_labels"][0]["issues"] == [
        "reviewed_by_matches_suggested_by",
        "labeler_id_is_rule",
    ]
    assert "Suspicious confirmed: 1" in (audit_dir / "report.md").read_text(encoding="utf-8")


def test_label_set_reviewer_rewrites_only_matching_status(tmp_path: Path) -> None:
    queue_dir = tmp_path / "labels"
    assert queue_main([str(_split_path(tmp_path)), "--out", str(queue_dir), "--seed", "42"]) == 0
    queue = _read_jsonl(queue_dir / "queue.jsonl")
    confirmed = _valid_label(queue[0])
    confirmed.update(
        {
            "review_status": "confirmed",
            "reviewed_by": "codepawl_rule_v0",
            "reviewed_at": "2026-06-15T00:00:00Z",
            "suggested_by": "codepawl_rule_v0",
            "suggested_preferred": confirmed["preferred"],
            "suggested_severity": confirmed["severity"],
            "suggested_defect_tags": confirmed["defect_tags"],
            "suggestion_confidence": 4,
        }
    )
    edited = _valid_label(queue[1])
    edited.update({"review_status": "edited", "reviewed_by": "someone"})
    labels_path = queue_dir / "labels.jsonl"
    output_path = queue_dir / "labels.reviewed.jsonl"
    labels_path.write_text(
        json.dumps(confirmed, sort_keys=True) + "\n" + json.dumps(edited, sort_keys=True) + "\n",
        encoding="utf-8",
    )

    result = set_reviewer_main(
        [
            str(labels_path),
            "--out",
            str(output_path),
            "--reviewed-by",
            "an",
            "--only-status",
            "confirmed",
        ]
    )

    assert result == 0
    original = _read_jsonl(labels_path)
    rewritten = _read_jsonl(output_path)
    assert original[0]["reviewed_by"] == "codepawl_rule_v0"
    assert rewritten[0]["reviewed_by"] == "an"
    assert rewritten[0]["labeler_id"] == "an"
    assert rewritten[0]["suggested_by"] == "codepawl_rule_v0"
    assert rewritten[0]["preferred"] == confirmed["preferred"]
    assert rewritten[1]["reviewed_by"] == "someone"


def test_label_validation_warns_on_rule_confirmed_labels(tmp_path: Path) -> None:
    queue_dir = tmp_path / "labels"
    validation_dir = tmp_path / "validation"
    assert queue_main([str(_split_path(tmp_path)), "--out", str(queue_dir), "--seed", "42"]) == 0
    assert suggest_main(
        [str(queue_dir / "queue.jsonl"), "--out", str(queue_dir / "suggested_labels.jsonl")]
    ) == 0
    suggestion = _read_jsonl(queue_dir / "suggested_labels.jsonl")[0]
    label = {
        **suggestion,
        "review_status": "confirmed",
        "reviewed_by": "codepawl_rule_v0",
        "reviewed_at": "2026-06-15T00:00:00Z",
    }
    labels_path = queue_dir / "labels.jsonl"
    labels_path.write_text(json.dumps(label, sort_keys=True) + "\n", encoding="utf-8")

    result = validate_main(
        [str(labels_path), "--queue", str(queue_dir / "queue.jsonl"), "--out", str(validation_dir)]
    )

    assert result == 0
    validation = json.loads((validation_dir / "validation.json").read_text(encoding="utf-8"))
    assert validation["human_reviewed_count"] == 1
    assert validation["rule_reviewed_count"] == 1
    assert validation["suspicious_confirmed_count"] == 1
    assert any("suspicious rule provenance" in warning for warning in validation["warnings"])
