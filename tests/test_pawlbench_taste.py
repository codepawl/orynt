import json
from pathlib import Path

from codepawl_harness.pawlbench_label_diff_cli import main as diff_main
from codepawl_harness.pawlbench_label_resuggest_cli import main as resuggest_main
from codepawl_harness.pawlbench_label_suggest_cli import main as suggest_main
from pawlbench_design import load_taste_profile, score_pair_with_taste, suggest_label_with_taste


PROFILE = Path("configs/labeling/codepawl_taste_v0.yaml")


def _record(item: str, defect_type: str, metrics: dict | None = None) -> dict:
    return {
        "item": item,
        "defect_type": defect_type,
        "metrics": metrics or {},
        "metric_deltas": metrics or {},
    }


def _queue_record(label_id: str, defect_type: str, left_item: str = "original", right_item: str = "variant") -> dict:
    return {
        "label_id": label_id,
        "dataset_id": "local_test",
        "split": "train",
        "sample_id": "sample_a",
        "variant_name": f"{defect_type}_bad",
        "defect_type": defect_type,
        "left_item": left_item,
        "right_item": right_item,
        left_item: {"screenshot_path": "/tmp/left.png", "defect_type": "original"},
        right_item: {"screenshot_path": "/tmp/right.png", "defect_type": defect_type},
        "expected_fix_instruction": f"Fix {defect_type}",
        "metric_deltas": {"contrast_issue_delta": 2, "min_contrast_ratio_delta": -0.5},
    }


def _write_jsonl(path: Path, records: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("".join(json.dumps(record, sort_keys=True) + "\n" for record in records), encoding="utf-8")


def _read_jsonl(path: Path) -> list[dict]:
    return [
        json.loads(line)
        for line in path.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]


def _write_dom(path: Path, h1_height: float, h1_width: float = 400.0) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(
            {
                "tag_name": "body",
                "children": [
                    {
                        "tag_name": "h1",
                        "text_snippet": "Primary title",
                        "bounding_box": {"x": 160, "y": 80, "width": h1_width, "height": h1_height},
                    }
                ],
            }
        ),
        encoding="utf-8",
    )


def test_load_taste_profile() -> None:
    profile = load_taste_profile(PROFILE)

    assert profile.profile_id == "codepawl_taste_v0"
    assert profile.priority_order[0] == "readability"
    assert profile.defect_weights["spacing_tight"] == "high"


def test_weak_contrast_does_not_dominate_spacing() -> None:
    profile = load_taste_profile(PROFILE)

    score = score_pair_with_taste(
        _record("left", "contrast", {"min_contrast_ratio": 1.68, "contrast_issue_count": 3}),
        _record("right", "spacing", {}),
        profile,
    )

    assert score["preferred"] == "left"
    assert score["left_penalty"] < score["right_penalty"]


def test_unreadable_contrast_loses_to_tight_spacing() -> None:
    profile = load_taste_profile(PROFILE)

    score = score_pair_with_taste(
        _record("left", "contrast", {"min_contrast_ratio": 1.3, "contrast_issue_count": 12}),
        _record("right", "spacing", {}),
        profile,
    )

    assert score["preferred"] == "right"


def test_unreadable_contrast_becomes_high_severity(tmp_path: Path) -> None:
    queue = tmp_path / "queue.jsonl"
    out = tmp_path / "suggested.jsonl"
    record = _queue_record("a", "contrast")
    record["variant"]["metrics_path"] = str(tmp_path / "contrast_metrics.json")
    (tmp_path / "contrast_metrics.json").write_text(
        json.dumps({"min_contrast_ratio": 1.3, "contrast_issue_count": 12}),
        encoding="utf-8",
    )
    _write_jsonl(queue, [record])

    assert suggest_main([str(queue), "--out", str(out), "--taste-profile", str(PROFILE)]) == 0

    suggestion = _read_jsonl(out)[0]
    assert suggestion["severity"] == "high"
    assert suggestion["taste_profile_id"] == "codepawl_taste_v0"


def test_tight_spacing_and_clear_alignment_beat_weak_contrast() -> None:
    profile = load_taste_profile(PROFILE)

    spacing_score = score_pair_with_taste(
        _record("left", "spacing", {}),
        _record("right", "contrast", {"min_contrast_ratio": 3.5, "contrast_issue_count": 1}),
        profile,
    )
    alignment_score = score_pair_with_taste(
        _record("left", "alignment", {"changed_pixel_ratio": 0.08}),
        _record("right", "contrast", {"min_contrast_ratio": 3.5, "contrast_issue_count": 1}),
        profile,
    )

    assert spacing_score["preferred"] == "right"
    assert alignment_score["preferred"] == "right"


def test_hard_pair_contrast_vs_spacing_uses_taste_exception() -> None:
    profile = load_taste_profile(PROFILE)
    record = _queue_record(
        "hard_pref_v1__app_empty_state__contrast_bad__vs__spacing_bad",
        "hard_pair",
        left_item="contrast_bad",
        right_item="spacing_bad",
    )
    record.update(
        {
            "sample_id": "app_empty_state",
            "variant_name": "contrast_bad__vs__spacing_bad",
            "left_defect_type": "contrast",
            "right_defect_type": "spacing",
            "contrast_bad": {
                "screenshot_path": "/tmp/contrast.png",
                "defect_type": "contrast",
                "metrics": {"min_contrast_ratio": 1.68, "contrast_issue_count": 3},
            },
            "spacing_bad": {
                "screenshot_path": "/tmp/spacing.png",
                "defect_type": "spacing",
                "metrics": {},
            },
        }
    )

    suggestion = suggest_label_with_taste(record, profile)

    assert suggestion["preferred"] == "left"
    assert "spacing" in suggestion["defect_tags"]
    assert "inconsistent_rhythm" in suggestion["defect_tags"]
    assert "left_penalty=" in suggestion["suggestion_reason_detail"]
    assert "right_penalty=" in suggestion["suggestion_reason_detail"]
    assert "left_score=" not in suggestion["suggestion_reason_detail"]
    assert "lower penalty is better" in suggestion["suggestion_reason_detail"]
    assert "contrast_exception=weak_readable" in suggestion["suggestion_reason_detail"]
    assert "spacing_rationale=crowded_scanability" in suggestion["suggestion_reason_detail"]
    assert "visual comfort and scannability" in suggestion["reason"]


def test_reviewed_dashboard_contrast_vs_spacing_prefers_readable_contrast() -> None:
    profile = load_taste_profile(PROFILE)
    cases = [
        ("hard_pref_v1__dashboard_ai_agent__contrast_bad__vs__spacing_bad", "dashboard_ai_agent", 1.58, 15),
        ("hard_pref_v1__dashboard_creator__contrast_bad__vs__spacing_bad", "dashboard_creator", 1.35, 13),
    ]

    for label_id, sample_id, min_contrast, contrast_issues in cases:
        record = _queue_record(label_id, "hard_pair", left_item="contrast_bad", right_item="spacing_bad")
        record.update(
            {
                "sample_id": sample_id,
                "variant_name": "contrast_bad__vs__spacing_bad",
                "defect_type": "contrast_vs_spacing",
                "left_defect_type": "contrast",
                "right_defect_type": "spacing",
                "contrast_bad": {
                    "screenshot_path": "/tmp/contrast.png",
                    "variant_name": "contrast_bad",
                    "defect_type": "contrast",
                    "metrics": {
                        "min_contrast_ratio": min_contrast,
                        "contrast_issue_count": contrast_issues,
                        "cta_like_element_count": 1,
                    },
                },
                "spacing_bad": {
                    "screenshot_path": "/tmp/spacing.png",
                    "variant_name": "spacing_bad",
                    "defect_type": "spacing",
                    "metrics": {
                        "visible_element_count": 24,
                        "median_element_area": 10500,
                        "average_element_area": 85000,
                    },
                },
            }
        )

        suggestion = suggest_label_with_taste(record, profile)

        assert suggestion["preferred"] == "left"
        assert "spacing" in suggestion["defect_tags"]
        assert "contrast_exception=weak_readable" in suggestion["suggestion_reason_detail"]
        assert "spacing_rationale=crowded_scanability" in suggestion["suggestion_reason_detail"]
        assert "Readable weak contrast" in suggestion["reason"]
        assert "crowded spacing" in suggestion["reason"]


def test_reviewed_dashboard_creator_prefers_mild_alignment_over_tiny_hierarchy(tmp_path: Path) -> None:
    profile = load_taste_profile(PROFILE)
    sample_dir = tmp_path / "dashboard_creator"
    _write_dom(sample_dir / "original" / "dom.json", h1_height=43, h1_width=406)
    _write_dom(sample_dir / "jittered" / "hierarchy_bad" / "dom.json", h1_height=28.06, h1_width=347)
    _write_dom(sample_dir / "jittered" / "alignment_bad" / "dom.json", h1_height=43, h1_width=406)
    alignment_html = sample_dir / "jittered" / "alignment_bad" / "index.html"
    alignment_html.write_text("<h1>Creator production board</h1><p class=\"muted\">Readable content.</p>", encoding="utf-8")
    record = _queue_record(
        "hard_pref_v1__dashboard_creator__alignment_bad__vs__hierarchy_bad",
        "hard_pair",
        left_item="hierarchy_bad",
        right_item="alignment_bad",
    )
    record.update(
        {
            "sample_id": "dashboard_creator",
            "variant_name": "alignment_bad__vs__hierarchy_bad",
            "defect_type": "hierarchy_vs_alignment",
            "left_defect_type": "hierarchy",
            "right_defect_type": "alignment",
            "hierarchy_bad": {
                "screenshot_path": "/tmp/hierarchy.png",
                "variant_name": "hierarchy_bad",
                "defect_type": "hierarchy",
                "dom_path": str(sample_dir / "jittered" / "hierarchy_bad" / "dom.json"),
                "metrics": {
                    "min_contrast_ratio": 6.77,
                    "contrast_issue_count": 0,
                    "min_font_size": 16,
                    "font_size_ratio": 2,
                    "hierarchy_warning_count": 0,
                    "cta_like_element_count": 1,
                    "visible_element_count": 24,
                },
            },
            "alignment_bad": {
                "screenshot_path": "/tmp/alignment.png",
                "variant_name": "alignment_bad",
                "defect_type": "alignment",
                "dom_path": str(sample_dir / "jittered" / "alignment_bad" / "dom.json"),
                "html_path": str(alignment_html),
                "metrics": {"min_contrast_ratio": 6.77, "contrast_issue_count": 0, "visible_element_count": 24},
            },
        }
    )

    suggestion = suggest_label_with_taste(record, profile)

    assert suggestion["preferred"] == "right"
    assert "hierarchy" in suggestion["defect_tags"]
    assert "hierarchy_rationale=too_small_or_unclear" in suggestion["suggestion_reason_detail"]
    assert "alignment_exception=mild_or_noop" in suggestion["suggestion_reason_detail"]
    assert "Hierarchy is too small or weak to scan" in suggestion["reason"]
    assert "mild alignment issues are preferable" in suggestion["reason"]


def test_hard_pair_readable_hierarchy_beats_alignment_bad(tmp_path: Path) -> None:
    profile = load_taste_profile(PROFILE)
    sample_dir = tmp_path / "app_empty_state"
    _write_dom(sample_dir / "original" / "dom.json", h1_height=48, h1_width=520)
    _write_dom(sample_dir / "jittered" / "hierarchy_bad" / "dom.json", h1_height=28.06, h1_width=520)
    _write_dom(sample_dir / "jittered" / "alignment_bad" / "dom.json", h1_height=48, h1_width=520)
    alignment_html = sample_dir / "jittered" / "alignment_bad" / "index.html"
    alignment_html.write_text("<h1>No checks yet.</h1><p class=\"lede\">Create your first check.</p>", encoding="utf-8")
    record = _queue_record(
        "hard_pref_v1__app_empty_state__alignment_bad__vs__hierarchy_bad",
        "hard_pair",
        left_item="hierarchy_bad",
        right_item="alignment_bad",
    )
    record.update(
        {
            "sample_id": "app_empty_state",
            "variant_name": "alignment_bad__vs__hierarchy_bad",
            "defect_type": "hierarchy_vs_alignment",
            "left_defect_type": "hierarchy",
            "right_defect_type": "alignment",
            "hierarchy_bad": {
                "screenshot_path": "/tmp/hierarchy.png",
                "variant_name": "hierarchy_bad",
                "defect_type": "hierarchy",
                "dom_path": str(sample_dir / "jittered" / "hierarchy_bad" / "dom.json"),
                "metrics": {
                    "min_contrast_ratio": 5.81,
                    "contrast_issue_count": 0,
                    "min_font_size": 16,
                    "font_size_ratio": 1.3,
                    "hierarchy_warning_count": 1,
                    "cta_like_element_count": 1,
                    "has_horizontal_overflow": False,
                    "has_vertical_overflow": False,
                },
            },
            "alignment_bad": {
                "screenshot_path": "/tmp/alignment.png",
                "variant_name": "alignment_bad",
                "defect_type": "alignment",
                "dom_path": str(sample_dir / "jittered" / "alignment_bad" / "dom.json"),
                "html_path": str(alignment_html),
                "metrics": {
                    "min_contrast_ratio": 5.81,
                    "contrast_issue_count": 0,
                    "font_size_ratio": 3.0,
                    "hierarchy_warning_count": 0,
                    "cta_like_element_count": 1,
                },
            },
        }
    )

    suggestion = suggest_label_with_taste(record, profile)

    assert suggestion["preferred"] == "left"
    assert suggestion["suggested_preferred"] == "left"
    assert "alignment" in suggestion["defect_tags"]
    assert "left_penalty=" in suggestion["suggestion_reason_detail"]
    assert "right_penalty=" in suggestion["suggestion_reason_detail"]
    assert "left_score=" not in suggestion["suggestion_reason_detail"]
    assert "lower penalty is better" in suggestion["suggestion_reason_detail"]
    assert "hierarchy_exception=weak_readable" in suggestion["suggestion_reason_detail"]
    assert "alignment_rationale=visible_off_grid_discomfort" in suggestion["suggestion_reason_detail"]
    assert "Readable weak hierarchy" in suggestion["reason"]
    assert "visible alignment discomfort" in suggestion["reason"]


def test_action_unclear_hierarchy_can_be_worse_than_alignment() -> None:
    profile = load_taste_profile(PROFILE)

    score = score_pair_with_taste(
        _record(
            "left",
            "hierarchy",
            {
                "hierarchy_action_unclear": True,
                "min_contrast_ratio": 5.8,
                "contrast_issue_count": 0,
                "min_font_size": 16,
                "cta_like_element_count": 0,
            },
        ),
        _record("alignment_bad", "alignment", {"min_contrast_ratio": 5.8, "contrast_issue_count": 0}),
        profile,
    )

    assert score["preferred"] == "right"
    assert score["left_penalty"] > score["right_penalty"]


def test_tie_remains_rare_for_different_defects() -> None:
    profile = load_taste_profile(PROFILE)

    score = score_pair_with_taste(
        _record("left", "hierarchy", {"font_size_ratio": 1.2}),
        _record("right", "spacing", {}),
        profile,
    )

    assert score["preferred"] in {"left", "right"}


def test_resuggest_does_not_overwrite_existing_and_diff_detects_changes(tmp_path: Path) -> None:
    queue = tmp_path / "queue.jsonl"
    old = tmp_path / "old.jsonl"
    new = tmp_path / "new.jsonl"
    diff_dir = tmp_path / "diff"
    records = [
        _queue_record("a", "spacing"),
        _queue_record("b", "contrast"),
    ]
    _write_jsonl(queue, records)
    assert suggest_main([str(queue), "--out", str(old)]) == 0
    old_text = old.read_text(encoding="utf-8")

    assert (
        resuggest_main(
            [
                str(queue),
                "--existing-labels",
                str(old),
                "--out",
                str(new),
                "--taste-profile",
                str(PROFILE),
            ]
        )
        == 0
    )
    assert old.read_text(encoding="utf-8") == old_text
    assert new.is_file()

    assert diff_main([str(old), str(new), "--out", str(diff_dir)]) == 0
    diff = json.loads((diff_dir / "diff.json").read_text(encoding="utf-8"))
    assert diff["changed_count"] >= 1
    assert diff["changed_severity"] >= 1 or diff["changed_defect_tags"] >= 1
    assert (diff_dir / "report.md").is_file()
