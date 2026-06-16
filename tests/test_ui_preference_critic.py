import json
from pathlib import Path

from pawlbench_design.preference_critic import (
    CRITIQUE_SCHEMA_VERSION,
    PreferenceCriticConfig,
    PreferenceDatasetConfig,
    PreferenceReviewConfig,
    anti_shortcut_subsets,
    build_preference_dataset,
    evaluate_preference_critic,
    pair_examples,
    wilson_score_interval,
    write_critique_json,
)
from pawlbench_design.ui_jepa_smoke import check_ui_jepa_scaling_gate


def _write_json(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def _write_jsonl(path: Path, rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("".join(json.dumps(row, sort_keys=True) + "\n" for row in rows), encoding="utf-8")


def _tiny_smoke(tmp_path: Path) -> Path:
    root = tmp_path / "smoke"
    screen_ids = [f"s{i}" for i in range(8)]
    manifest = []
    for index, sid in enumerate(screen_ids):
        metrics_path = root / "metrics" / f"{sid}.json"
        bad = index % 2 == 1
        issue = ("spacing", "contrast", "alignment", "hierarchy")[index % 4]
        _write_json(
            metrics_path,
            {
                "contrast_issue_count": 3 if issue == "contrast" and bad else 0,
                "min_contrast_ratio": 2.0 if issue == "contrast" and bad else 7.0,
                "average_contrast_ratio": 5.0,
                "font_size_ratio": 1.2 if issue == "hierarchy" and bad else 2.4,
                "hierarchy_warning_count": 1 if issue == "hierarchy" and bad else 0,
                "visible_element_count": 10,
                "viewport_fill_ratio": 0.3 if issue == "spacing" and bad else 0.8,
                "has_horizontal_overflow": issue == "alignment" and bad,
                "has_vertical_overflow": False,
                "max_right_overflow_px": 20 if issue == "alignment" and bad else 0,
            },
        )
        manifest.append(
            {
                "screen_id": sid,
                "source": "fixture",
                "source_path": str(root / f"{sid}.html"),
                "screenshot_path": str(root / f"{sid}.png"),
                "dom_path": str(root / f"{sid}.dom.json"),
                "accessibility_path": str(root / f"{sid}.a11y.json"),
                "metrics_path": str(metrics_path),
                "width": 100,
                "height": 100,
                "viewport": {"width": 100, "height": 100},
                "template_id": f"t{index // 2}",
                "split_group": f"g{index // 2}",
                "domain_or_app_id": "fixture",
                "render_hash": sid,
                "created_at": "1970-01-01T00:00:00Z",
                "schema_version": "ui_jepa_v0_smoke_manifest_v1",
                "is_corrupted": bad,
            }
        )
    pairs = []
    for i in range(0, 8, 2):
        split_group = f"g{i // 2}"
        split = "train" if i < 4 else "test"
        issue = ("spacing", "contrast", "alignment", "hierarchy")[i % 4]
        pairs.append(
            {
                "pair_id": f"p{i}",
                "left_screen_id": f"s{i}",
                "right_screen_id": f"s{i+1}",
                "preferred_screen_id": f"s{i}",
                "left_is_preferred": True,
                "pair_family": "original_vs_corrupted",
                "corruption_type": issue,
                "severity": 0.5,
                "difficulty": "medium" if split == "train" else "hard",
                "split_group": split_group,
            }
        )
    _write_jsonl(root / "manifest.jsonl", manifest)
    _write_jsonl(root / "pairs.jsonl", pairs)
    _write_jsonl(root / "regions.jsonl", [{"screen_id": sid, "region_id": f"{sid}_r1", "region_type": "card", "area_ratio": 0.2, "confidence": 0.8} for sid in screen_ids])
    _write_jsonl(root / "design_tokens.jsonl", [{"screen_id": sid, "colors": {"palette": ["#000"], "dominant_palette": ["#000"], "contrast_warnings": 0}, "typography": {}, "spacing": {"spacing_consistency_score": 0.8}, "shape": {"shadow_levels": 1}, "layout": {"grid_detected": True, "viewport_fill_ratio": 0.8, "visible_element_count": 10}} for sid in screen_ids])
    _write_json(root / "splits.json", {"screen_ids": {"train": screen_ids[:4], "val": [], "test": screen_ids[4:]}, "pair_split_by_group": {"g0": "train", "g1": "train", "g2": "test", "g3": "test"}})
    return root


def test_preference_dataset_export_and_missing_embedding_skip(tmp_path: Path) -> None:
    summary = build_preference_dataset(PreferenceDatasetConfig(smoke_dir=_tiny_smoke(tmp_path), output_dir=tmp_path / "pref"))
    screens = [json.loads(line) for line in (tmp_path / "pref" / "screens.jsonl").read_text(encoding="utf-8").splitlines()]
    pairs = [json.loads(line) for line in (tmp_path / "pref" / "pairs.jsonl").read_text(encoding="utf-8").splitlines()]

    assert summary["screen_count"] == 8
    assert summary["pair_count"] == 4
    assert screens[0]["schema_version"] == "ui_preference_v0_screen_v1"
    assert pairs[0]["schema_version"] == "ui_preference_v0_pair_v1"
    assert screens[0]["embedding_refs"]["dinov2"]["available"] is False
    assert "dinov2" in summary["manual_embedding_commands"]


def test_pair_features_and_wilson_interval_are_valid() -> None:
    features = {"a": [1.0, 2.0], "b": [3.0, 1.0]}
    examples = pair_examples(features, [{"pair_id": "p", "left_screen_id": "a", "right_screen_id": "b", "left_is_preferred": True, "split": "test"}])

    assert examples[0]["features"] == [1.0, 2.0, 3.0, 1.0, -2.0, 1.0, 2.0, 1.0]
    low, high = wilson_score_interval(3, 5)
    assert 0.0 <= low <= high <= 1.0


def test_critic_ablation_report_and_review_json(tmp_path: Path) -> None:
    pref = tmp_path / "pref"
    build_preference_dataset(PreferenceDatasetConfig(smoke_dir=_tiny_smoke(tmp_path), output_dir=pref))
    report = evaluate_preference_critic(PreferenceCriticConfig(dataset_dir=pref, output_dir=tmp_path / "run", report_out=tmp_path / "report.json", epochs=2))
    review = write_critique_json(PreferenceReviewConfig(dataset_dir=pref, report_path=tmp_path / "report.json", output_path=tmp_path / "review.json", screen_id="s5"))

    assert report["valid"] is True
    assert report["feature_groups"]["dinov2"]["available"] is False
    assert report["feature_groups"]["metrics"]["available"] is True
    assert report["hard_subset_metrics"]["hard_test"]["available"] is True
    assert report["issue_heads"]["contrast"]["available"] in {True, False}
    assert review["schema_version"] == CRITIQUE_SCHEMA_VERSION
    assert review["issues"]
    assert {"type", "severity", "region_id", "evidence", "instruction"} <= set(review["issues"][0])


def test_anti_shortcut_subset_construction() -> None:
    scores = [
        {"split": "test", "pair_id": "a", "correct": True, "left_is_preferred": True, "difficulty": "hard", "pair_family": "variant_vs_variant_mixed_corruption", "corruption_type": "spacing_vs_contrast", "severity": 0.4, "probability_left_preferred": 0.55, "_target": 1.0},
        {"split": "test", "pair_id": "b", "correct": False, "left_is_preferred": False, "difficulty": "medium", "pair_family": "original_vs_corrupted", "corruption_type": "spacing", "severity": 0.7, "probability_left_preferred": 0.45, "_target": 0.0},
    ]
    subsets = anti_shortcut_subsets(scores)

    assert subsets["balanced_left_right_orientation"]["pair_count"] == 2
    assert subsets["cross_corruption_hard_pairs"]["pair_count"] == 1


def test_gate_reads_preference_critic_and_keeps_dom_blocked(tmp_path: Path) -> None:
    def report(path: Path, payload: dict) -> Path:
        _write_json(path, payload)
        return path

    b0 = report(tmp_path / "b0.json", {"real_weights": True, "valid_for_model_selection": True, "metrics_baseline": {"available": True}, "splits": {"val": {"lift_over_best_constant": 0.1}}, "validity_checks": {"failed_conditions": []}})
    m1 = report(tmp_path / "m1.json", {"valid_m1_baseline": True, "collapse_diagnostics": {"valid": True}, "probe": {"available": True}, "b0_comparison": {"available": True}})
    m2 = report(tmp_path / "m2.json", {"valid_m2_baseline": True, "collapse_diagnostics": {"valid": True}, "probe": {"available": True}, "comparison": {"valid": True}})
    m25 = report(tmp_path / "m25.json", {"useful_representation_signal": False, "dom_aware_recommended": False, "recommended_decision": "change_objective_or_strengthen_training_before_dom_aware"})
    critic = report(tmp_path / "critic.json", {"valid": True, "critique_json_examples": [{"screen_id": "s"}], "hard_subset_metrics": {"hard_test": {"available": True, "pairwise_accuracy": 0.7}}, "full_test_metrics": {"best_constant_accuracy": 0.5}, "issue_heads": {"spacing": {"available": False, "skipped_reason": "fixture"}}, "jepa_features_add_value": False, "decisions": {"recommended_next_stage": "freeze_jepa_architecture_work_for_this_corpus"}})

    result = check_ui_jepa_scaling_gate(Path("data/processed/ui_jepa_v0_smoke"), b0, m1, m2, m25, None, critic)

    assert result["closed_loop_ready"] is True
    assert result["dom_aware_ready"] is False
    assert result["preference_critic_ready"] is True
    assert "DOM_aware_jepa" in result["blocked_stages"]
