import json
from pathlib import Path

import yaml
from PIL import Image

from codepawl_harness.ui_jepa_scale_gate_cli import main as scale_gate_main
from codepawl_harness.ui_pr_review_ci_cli import PrReviewCiConfig, build_scale_gate_args
from codepawl_harness.ui_pr_review_trial_cli import select_trial_gate_report
from pawlbench_design.ui_jepa_smoke import check_ui_jepa_scaling_gate
from pawlbench_design.ui_pr_review import (
    PR_REVIEW_INPUT_SCHEMA_VERSION,
    PR_REVIEW_PILOT_SCHEMA_VERSION,
    PR_REVIEW_TRIAL_CASE_SCHEMA_VERSION,
    PR_REVIEW_TRIAL_REVIEWER_LABEL_SCHEMA_VERSION,
    PrReviewConfig,
    PrReviewPilotConfig,
    PrReviewTrialConfig,
    aggregate_pr_review_pilot_reports,
    decide_pr_review_trial_readiness,
    load_pr_review_trial_cases,
    run_pr_review,
    run_pr_review_pilot,
    run_pr_review_trial,
    validate_pr_review_ci_artifacts,
    validate_pr_review_pilot_config,
    validate_pr_review_input,
    validate_pr_review_trial_case,
    validate_trial_reviewer_label,
)


def _write_json(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def _png(path: Path, color: tuple[int, int, int]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.new("RGB", (24, 16), color=color).save(path)


def _metrics(path: Path, *, contrast: int = 0, min_contrast: float = 7.0, overflow: bool = False, fill: float = 0.8, hierarchy: int = 0) -> None:
    _write_json(
        path,
        {
            "contrast_issue_count": contrast,
            "min_contrast_ratio": min_contrast,
            "hierarchy_warning_count": hierarchy,
            "font_size_ratio": 2.0,
            "has_horizontal_overflow": overflow,
            "horizontal_overflow_px": 20 if overflow else 0,
            "max_right_overflow_px": 20 if overflow else 0,
            "viewport_fill_ratio": fill,
            "visible_element_count": 5,
        },
    )


def _review_fixture(tmp_path: Path, review_id: str = "fixture_pr") -> Path:
    root = tmp_path / "data" / "pr_review_v0" / review_id
    _png(root / "before.png", (240, 240, 240))
    _png(root / "after.png", (250, 250, 250))
    _metrics(root / "before_metrics.json", contrast=1, min_contrast=3.0, fill=0.35)
    _metrics(root / "after_metrics.json", contrast=0, min_contrast=7.0, fill=0.8)
    (root / "patch.diff").write_text("--- a/index.html\n+++ b/index.html\n- bad\n+ good\n", encoding="utf-8")
    _write_json(
        root / "metadata.json",
        {
            "schema_version": PR_REVIEW_INPUT_SCHEMA_VERSION,
            "review_id": review_id,
            "before": {
                "screenshot_path": "before.png",
                "metrics_path": "before_metrics.json",
            },
            "after": {
                "screenshot_path": "after.png",
                "metrics_path": "after_metrics.json",
            },
            "patch_diff_path": "patch.diff",
        },
    )
    return root


def _pilot_fixture(tmp_path: Path, *, include_skip: bool = False) -> Path:
    pilot_root = tmp_path / "data" / "pr_review_v0" / "codepawl_web_pilot"
    cases = []
    for index in range(3):
        review_id = f"pilot_case_{index}"
        root = pilot_root / review_id
        _png(root / "before.png", (220 + index, 220, 220))
        _png(root / "after.png", (235 + index, 235, 235))
        _metrics(root / "before_metrics.json", contrast=1, min_contrast=3.0, fill=0.35)
        _metrics(root / "after_metrics.json", contrast=0, min_contrast=7.0, fill=0.8)
        (root / "patch.diff").write_text("--- a/index.html\n+++ b/index.html\n- bad\n+ good\n", encoding="utf-8")
        _write_json(
            root / "metadata.json",
            {
                "schema_version": PR_REVIEW_INPUT_SCHEMA_VERSION,
                "review_id": review_id,
                "before": {
                    "screenshot_path": "before.png",
                    "metrics_path": "before_metrics.json",
                },
                "after": {
                    "screenshot_path": "after.png",
                    "metrics_path": "after_metrics.json",
                },
                "patch_diff_path": "patch.diff",
            },
        )
        case = {
            "schema_version": PR_REVIEW_PILOT_SCHEMA_VERSION,
            "review_id": review_id,
            "route": f"/pilot/{index}",
            "component_name": f"pilot_component_{index}",
            "mode": "screenshots-only",
            "before_screenshot_path": f"{review_id}/before.png",
            "after_screenshot_path": f"{review_id}/after.png",
            "before_metrics_path": f"{review_id}/before_metrics.json",
            "after_metrics_path": f"{review_id}/after_metrics.json",
            "patch_diff_path": f"{review_id}/patch.diff",
            "case_metadata_path": f"{review_id}/metadata.json",
            "viewport": {"width": 1440, "height": 900},
            "expected_artifact_paths": {
                "pr_review_report_json": f"reports/ui_pr_review_v0/codepawl_web_pilot/{review_id}/pr_review_report.json",
                "pr_review_report_md": f"reports/ui_pr_review_v0/codepawl_web_pilot/{review_id}/pr_review_report.md",
            },
        }
        cases.append(case)
    if include_skip:
        cases[-1] = {
            "schema_version": PR_REVIEW_PILOT_SCHEMA_VERSION,
            "review_id": "pilot_missing_route",
            "route": "/pilot/missing",
            "component_name": "missing_component",
            "mode": "screenshots-only",
            "skip": True,
            "skipped_reason": "no stable local screenshot artifact exists for this route",
            "viewport": {"width": 1440, "height": 900},
            "expected_artifact_paths": {
                "pr_review_report_json": "reports/ui_pr_review_v0/codepawl_web_pilot/pilot_missing_route/pr_review_report.json",
                "pr_review_report_md": "reports/ui_pr_review_v0/codepawl_web_pilot/pilot_missing_route/pr_review_report.md",
            },
        }
    _write_json(
        pilot_root / "metadata.json",
        {
            "schema_version": PR_REVIEW_PILOT_SCHEMA_VERSION,
            "pilot_id": "codepawl_web_pilot",
            "web_discovery": {
                "web_app_directory": "fixture",
                "local_dev_command": None,
                "local_build_command": None,
                "local_port": None,
                "route_list": [case["route"] for case in cases],
                "render_flow": "screenshots-only fixture",
            },
            "cases": cases,
        },
    )
    return pilot_root / "metadata.json"


def _trial_case_fixture(
    trial_root: Path,
    case_id: str,
    *,
    preferred: str = "after",
    critic_agree: bool = True,
    false_positive: bool = False,
    missed: bool = False,
    after_contrast: int = 0,
    after_min_contrast: float = 7.0,
    after_overflow: bool = False,
) -> Path:
    root = trial_root / case_id
    _png(root / "before.png", (220, 220, 220))
    _png(root / "after.png", (238, 238, 238))
    _metrics(root / "before_metrics.json", contrast=1, min_contrast=3.0, fill=0.35)
    _metrics(root / "after_metrics.json", contrast=after_contrast, min_contrast=after_min_contrast, overflow=after_overflow, fill=0.8)
    (root / "patch.diff").write_text("--- a/index.html\n+++ b/index.html\n- before\n+ after\n", encoding="utf-8")
    _write_json(
        root / "metadata.json",
        {
            "schema_version": PR_REVIEW_TRIAL_CASE_SCHEMA_VERSION,
            "case_id": case_id,
            "source_branch": "local-trial",
            "route_or_component": f"/trial/{case_id}",
            "mode": "screenshots-only",
            "before": {"screenshot_path": "before.png", "metrics_path": "before_metrics.json"},
            "after": {"screenshot_path": "after.png", "metrics_path": "after_metrics.json"},
            "patch_diff_path": "patch.diff",
            "reviewer_label_path": "reviewer_label.json",
        },
    )
    _write_json(
        root / "reviewer_label.json",
        {
            "schema_version": PR_REVIEW_TRIAL_REVIEWER_LABEL_SCHEMA_VERSION,
            "case_id": case_id,
            "preferred": preferred,
            "critic_decision_agree": critic_agree,
            "visual_regression_missed": missed,
            "false_positive": false_positive,
            "notes": "fixture label",
            "reviewer_id": "tester",
            "created_at": "2026-06-17T00:00:00Z",
        },
    )
    return root


def _trial_fixture(tmp_path: Path, count: int = 5) -> Path:
    trial_root = tmp_path / "data" / "pr_review_v0" / "real_pr_trial"
    for index in range(count):
        _trial_case_fixture(trial_root, f"trial_case_{index}")
    return trial_root


def test_pr_review_schema_validation_accepts_screenshots_only_fixture(tmp_path: Path) -> None:
    root = _review_fixture(tmp_path)
    payload = json.loads((root / "metadata.json").read_text(encoding="utf-8"))
    review_input = {
        "schema_version": PR_REVIEW_INPUT_SCHEMA_VERSION,
        "review_id": "fixture_pr",
        "mode": "screenshots-only",
        "before": {"screenshot_path": str(root / payload["before"]["screenshot_path"])},
        "after": {"screenshot_path": str(root / payload["after"]["screenshot_path"])},
    }

    assert validate_pr_review_input(review_input) == []


def test_pr_review_pilot_config_schema_validation_accepts_three_screenshots_only_cases(tmp_path: Path) -> None:
    config_path = _pilot_fixture(tmp_path)
    payload = json.loads(config_path.read_text(encoding="utf-8"))

    assert validate_pr_review_pilot_config(payload, config_path) == []


def test_checked_in_codepawl_web_pilot_config_links_route_files() -> None:
    config_path = Path("data/pr_review_v0/codepawl_web_pilot/metadata.json")
    payload = json.loads(config_path.read_text(encoding="utf-8"))

    assert validate_pr_review_pilot_config(payload, config_path) == []
    assert payload["web_discovery"]["web_app_directory"].startswith("apps/site/pilot_routes")
    for case in payload["cases"]:
        before_path = (config_path.parent / case["before_path"]).resolve()
        after_path = (config_path.parent / case["after_path"]).resolve()
        assert before_path.is_file()
        assert after_path.is_file()
        assert "apps/site/pilot_routes" in str(before_path)
        assert "apps/site/pilot_routes" in str(after_path)


def test_pr_review_pilot_screenshots_only_fixture_generates_aggregate(tmp_path: Path) -> None:
    config_path = _pilot_fixture(tmp_path)

    report = run_pr_review_pilot(
        PrReviewPilotConfig(
            config_path=config_path,
            output_dir=tmp_path / "reports" / "ui_pr_review_v0" / "codepawl_web_pilot",
            reviewer_id="tester",
        )
    )

    out = tmp_path / "reports" / "ui_pr_review_v0" / "codepawl_web_pilot"
    assert report["valid"] is True
    assert report["case_count"] == 3
    assert report["rendered_count"] == 3
    assert report["skipped_count"] == 0
    assert report["approve_visual_count"] == 3
    assert report["blocked_missing_artifacts_count"] == 0
    assert report["useful_enough_for_github_actions_artifact_integration"] is True
    assert (out / "pilot_report.json").is_file()
    assert (out / "pilot_report.md").is_file()
    assert (out / "pilot_case_0" / "pr_review_report.json").is_file()
    assert (out / "pilot_case_0" / "before.png").is_file()
    assert (out / "pilot_case_0" / "after.png").is_file()


def test_pr_review_pilot_skipped_route_behavior_records_reason(tmp_path: Path) -> None:
    config_path = _pilot_fixture(tmp_path, include_skip=True)

    report = run_pr_review_pilot(
        PrReviewPilotConfig(
            config_path=config_path,
            output_dir=tmp_path / "reports" / "ui_pr_review_v0" / "codepawl_web_pilot",
        )
    )

    out = tmp_path / "reports" / "ui_pr_review_v0" / "codepawl_web_pilot"
    skipped = json.loads((out / "pilot_missing_route" / "pr_review_report.json").read_text(encoding="utf-8"))
    assert report["case_count"] == 3
    assert report["rendered_count"] == 2
    assert report["skipped_count"] == 1
    assert report["blocked_missing_artifacts_count"] == 1
    assert report["useful_enough_for_github_actions_artifact_integration"] is False
    assert skipped["skipped"] is True
    assert skipped["recommended_decision"] == "blocked_missing_artifacts"
    assert skipped["skipped_reason"] == "no stable local screenshot artifact exists for this route"


def test_pr_review_pilot_aggregate_counts_regressions_and_decisions(tmp_path: Path) -> None:
    reports = [
        {"review_id": "a", "valid": True, "output_dir": str(tmp_path / "a"), "recommended_decision": "approve_visual", "critic_delta": 0.1, "regression_flags": {"visual_regression": False, "accessibility_regression": False, "responsive_regression": False}},
        {"review_id": "b", "valid": True, "output_dir": str(tmp_path / "b"), "recommended_decision": "request_changes", "critic_delta": -0.2, "regression_flags": {"visual_regression": True, "accessibility_regression": True, "responsive_regression": False}},
        {"review_id": "c", "valid": False, "output_dir": str(tmp_path / "c"), "recommended_decision": "blocked_missing_artifacts", "skipped": True, "skipped_reason": "missing", "regression_flags": {"visual_regression": False, "accessibility_regression": False, "responsive_regression": True}},
    ]

    aggregate = aggregate_pr_review_pilot_reports(
        reports,
        pilot_config={"pilot_id": "pilot", "web_discovery": {}},
        config_path=tmp_path / "metadata.json",
        output_dir=tmp_path / "reports",
        validation_errors=[],
    )

    assert aggregate["case_count"] == 3
    assert aggregate["rendered_count"] == 2
    assert aggregate["skipped_count"] == 1
    assert aggregate["approve_visual_count"] == 1
    assert aggregate["request_changes_count"] == 1
    assert aggregate["blocked_missing_artifacts_count"] == 1
    assert aggregate["mean_critic_delta"] == -0.05
    assert aggregate["visual_regression_count"] == 1
    assert aggregate["accessibility_regression_count"] == 1
    assert aggregate["responsive_regression_count"] == 1


def test_pr_review_schema_validation_accepts_render_html_paths(tmp_path: Path) -> None:
    before = tmp_path / "before.html"
    after_dir = tmp_path / "after_project"
    before.write_text("<html><body>before</body></html>", encoding="utf-8")
    after_dir.mkdir()
    (after_dir / "index.html").write_text("<html><body>after</body></html>", encoding="utf-8")
    review_input = {
        "schema_version": PR_REVIEW_INPUT_SCHEMA_VERSION,
        "review_id": "renderable",
        "mode": "render",
        "before": {"path": str(before)},
        "after": {"path": str(after_dir)},
    }

    assert validate_pr_review_input(review_input) == []


def test_pr_review_screenshots_only_generates_json_markdown_and_diff(tmp_path: Path) -> None:
    _review_fixture(tmp_path)

    report = run_pr_review(
        PrReviewConfig(
            review_id="fixture_pr",
            output_dir=tmp_path / "reports" / "ui_pr_review_v0",
            mode="screenshots-only",
            review_root=tmp_path / "data" / "pr_review_v0",
            reviewer_id="tester",
        )
    )

    out = tmp_path / "reports" / "ui_pr_review_v0" / "fixture_pr"
    assert report["valid"] is True
    assert report["recommended_decision"] == "approve_visual"
    assert report["regression_thresholds_pass"] is True
    assert report["critic_delta"] > 0
    assert (out / "pr_review_report.json").is_file()
    assert (out / "pr_review_report.md").is_file()
    assert (out / "before.png").is_file()
    assert (out / "after.png").is_file()
    assert (out / "screenshot_diff.png").is_file()
    assert (out / "critic_review.json").is_file()
    assert (out / "patch_summary.json").is_file()
    assert report["patch_summary"]["added_lines"] == 1
    assert report["manual_review"]["status"] == "pending"


def test_pr_review_missing_artifacts_blocks_without_failing_manual_pending(tmp_path: Path) -> None:
    root = tmp_path / "data" / "pr_review_v0" / "missing"
    root.mkdir(parents=True)
    _png(root / "before.png", (240, 240, 240))
    _write_json(
        root / "metadata.json",
        {
            "schema_version": PR_REVIEW_INPUT_SCHEMA_VERSION,
            "review_id": "missing",
            "before": {"screenshot_path": "before.png"},
            "after": {"screenshot_path": "after.png"},
        },
    )

    report = run_pr_review(
        PrReviewConfig(
            review_id="missing",
            output_dir=tmp_path / "reports" / "ui_pr_review_v0",
            mode="screenshots-only",
            review_root=tmp_path / "data" / "pr_review_v0",
        )
    )

    assert report["valid"] is False
    assert report["recommended_decision"] == "blocked_missing_artifacts"
    assert report["manual_review"]["status"] == "pending"
    assert report["severe_missing_artifacts"]


def test_pr_review_deterministic_metric_regression_requests_changes(tmp_path: Path) -> None:
    root = _review_fixture(tmp_path, "regression")
    _metrics(root / "after_metrics.json", contrast=2, min_contrast=2.0, overflow=True, fill=0.8)

    report = run_pr_review(
        PrReviewConfig(
            review_id="regression",
            output_dir=tmp_path / "reports" / "ui_pr_review_v0",
            mode="screenshots-only",
            review_root=tmp_path / "data" / "pr_review_v0",
        )
    )

    assert report["recommended_decision"] == "request_changes"
    assert report["regression_thresholds_pass"] is False
    assert report["regression_flags"]["accessibility_regression"] is True
    assert report["regression_flags"]["responsive_regression"] is True


def test_pr_review_manual_label_ingestion_and_agreement(tmp_path: Path) -> None:
    root = _review_fixture(tmp_path, "manual")
    _write_json(
        root / "manual_label.json",
        {
            "task_id": "manual",
            "preferred": "after",
            "visual_regression": False,
            "accessibility_concern": False,
            "notes": "looks better",
            "reviewer_id": "human",
            "provenance": "manual_pr_review",
        },
    )
    metadata = json.loads((root / "metadata.json").read_text(encoding="utf-8"))
    metadata["manual_label_path"] = "manual_label.json"
    _write_json(root / "metadata.json", metadata)

    report = run_pr_review(
        PrReviewConfig(
            review_id="manual",
            output_dir=tmp_path / "reports" / "ui_pr_review_v0",
            mode="screenshots-only",
            review_root=tmp_path / "data" / "pr_review_v0",
        )
    )

    assert report["manual_review"]["labels_available"] is True
    assert report["manual_review"]["preferred"] == "after"
    assert report["manual_review"]["critic_vs_human_agreement"] is True
    assert report["recommended_decision"] == "approve_visual"


def test_pr_review_cli_style_explicit_screenshot_paths(tmp_path: Path) -> None:
    root = _review_fixture(tmp_path, "explicit")
    report = run_pr_review(
        PrReviewConfig(
            review_id="explicit",
            before=root / "before.png",
            after=root / "after.png",
            patch_diff=root / "patch.diff",
            output_dir=tmp_path / "reports" / "ui_pr_review_v0",
            mode="screenshots-only",
            review_root=tmp_path / "data" / "pr_review_v0",
        )
    )

    assert report["valid"] is True
    assert report["artifact_paths"]["before_screenshot"].endswith("before.png")
    assert report["artifact_paths"]["after_screenshot"].endswith("after.png")


def _gate_fixture_reports(tmp_path: Path) -> dict[str, Path]:
    paths = {
        "b0": tmp_path / "b0.json",
        "m1": tmp_path / "m1.json",
        "m2": tmp_path / "m2.json",
        "m25": tmp_path / "m25.json",
        "critic": tmp_path / "critic.json",
        "loop": tmp_path / "closed_loop.json",
        "manual_batch": tmp_path / "manual_batch.json",
        "pr_review": tmp_path / "pr_review.json",
    }
    _write_json(paths["b0"], {"real_weights": True, "valid_for_model_selection": True, "metrics_baseline": {"available": True}, "splits": {"val": {"lift_over_best_constant": 0.1}}, "validity_checks": {"failed_conditions": []}})
    _write_json(paths["m1"], {"valid_m1_baseline": True, "collapse_diagnostics": {"valid": True}, "probe": {"available": True}, "b0_comparison": {"available": True}})
    _write_json(paths["m2"], {"valid_m2_baseline": True, "collapse_diagnostics": {"valid": True}, "probe": {"available": True}, "comparison": {"valid": True}})
    _write_json(paths["m25"], {"useful_representation_signal": False, "dom_aware_recommended": False, "recommended_decision": "change_objective_or_strengthen_training_before_dom_aware"})
    _write_json(paths["critic"], {"valid": True, "critique_json_examples": [{"screen_id": "s"}], "hard_subset_metrics": {"hard_test": {"available": True, "pairwise_accuracy": 0.7}}, "full_test_metrics": {"best_constant_accuracy": 0.5}, "issue_heads": {"spacing": {"available": False, "skipped_reason": "fixture"}}})
    _write_json(paths["loop"], {"valid": True, "passed_closed_loop_gate": True, "passed_closed_loop_gate_uses_non_oracle_only": True, "set_name": "loop_mixed_50", "noop_baseline": {"false_improvement_detected": False}, "patch_mode": "deterministic_patch", "difficulty_breakdown": {"easy": {"success_rate": 1.0}}, "deterministic_non_oracle_success_rate": 1.0, "accessibility_regression_rate_non_oracle": 0.0, "responsive_regression_rate_non_oracle": 0.0, "manual_review": {"labels_available": True, "matched_label_count": 1}})
    _write_json(paths["manual_batch"], {"valid": True, "evaluated_task_count": 1, "manual_patch_success_rate": 1.0, "accessibility_regression_rate": 0.0, "responsive_regression_rate": 0.0, "manual_patch_ready": True, "manual_review_ready": True, "blocked_reason": None, "thresholds": {"min_task_count": 1, "min_success_rate": 0.5, "max_regression_rate": 0.1}})
    _write_json(paths["pr_review"], {"valid": True, "recommended_decision": "approve_visual", "regression_thresholds_pass": True, "severe_missing_artifacts": []})
    return paths


def _gate_args(paths: dict[str, Path], *, target: str, pr_review: Path | None = None, out: Path | None = None) -> list[str]:
    args = [
        "--target",
        target,
        "--dataset",
        "data/processed/ui_jepa_v0_smoke",
        "--b0-report",
        str(paths["b0"]),
        "--m1-report",
        str(paths["m1"]),
        "--m2-report",
        str(paths["m2"]),
        "--m25-report",
        str(paths["m25"]),
        "--preference-critic-report",
        str(paths["critic"]),
        "--closed-loop-report",
        str(paths["loop"]),
        "--manual-batch-report",
        str(paths["manual_batch"]),
    ]
    if pr_review is not None:
        args.extend(["--pr-review-report", str(pr_review)])
    if out is not None:
        args.extend(["--out", str(out)])
    return args


def test_gate_target_fields_pr_review_ready_dom_aware_blocked(tmp_path: Path) -> None:
    paths = _gate_fixture_reports(tmp_path)

    result = check_ui_jepa_scaling_gate(
        Path("data/processed/ui_jepa_v0_smoke"),
        paths["b0"],
        paths["m1"],
        paths["m2"],
        paths["m25"],
        None,
        paths["critic"],
        paths["loop"],
        paths["manual_batch"],
        paths["pr_review"],
        target="pr-review",
    )

    assert result["target"] == "pr-review"
    assert result["target_ready"] is True
    assert result["allowed"] is True
    assert result["pr_review_ready"] is True
    assert result["dom_aware_ready"] is False
    assert result["blocked_reasons_by_target"]["dom-aware"]
    assert result["recommended_next_stage_by_target"]["pr-review"]
    assert result["exit_code_reason"] == "pr-review target passed"


def test_gate_pr_review_target_accepts_pilot_case_report(tmp_path: Path) -> None:
    paths = _gate_fixture_reports(tmp_path)
    config_path = _pilot_fixture(tmp_path)
    run_pr_review_pilot(
        PrReviewPilotConfig(
            config_path=config_path,
            output_dir=tmp_path / "reports" / "ui_pr_review_v0" / "codepawl_web_pilot",
        )
    )
    pilot_case_report = tmp_path / "reports" / "ui_pr_review_v0" / "codepawl_web_pilot" / "pilot_case_0" / "pr_review_report.json"

    result = check_ui_jepa_scaling_gate(
        Path("data/processed/ui_jepa_v0_smoke"),
        paths["b0"],
        paths["m1"],
        paths["m2"],
        paths["m25"],
        None,
        paths["critic"],
        paths["loop"],
        paths["manual_batch"],
        pilot_case_report,
        target="pr-review",
    )

    assert result["target_ready"] is True
    assert result["pr_review_ready"] is True
    assert result["dom_aware_ready"] is False


def test_scale_gate_cli_pr_review_target_exits_zero(tmp_path: Path, capsys) -> None:
    paths = _gate_fixture_reports(tmp_path)

    code = scale_gate_main(_gate_args(paths, target="pr-review", pr_review=paths["pr_review"], out=tmp_path / "gate.json"))

    captured = capsys.readouterr()
    gate = json.loads((tmp_path / "gate.json").read_text(encoding="utf-8"))
    assert code == 0
    assert "target: pr-review" in captured.out
    assert gate["target_ready"] is True
    assert gate["pr_review_ready"] is True
    assert gate["dom_aware_ready"] is False


def test_scale_gate_cli_dom_aware_target_stays_blocked(tmp_path: Path, capsys) -> None:
    paths = _gate_fixture_reports(tmp_path)

    code = scale_gate_main(_gate_args(paths, target="dom-aware", pr_review=paths["pr_review"], out=tmp_path / "gate.json"))

    captured = capsys.readouterr()
    gate = json.loads((tmp_path / "gate.json").read_text(encoding="utf-8"))
    assert code == 1
    assert gate["target"] == "dom-aware"
    assert gate["target_ready"] is False
    assert gate["pr_review_ready"] is True
    assert gate["dom_aware_ready"] is False
    assert "M2.5 did not find useful representation signal" in captured.err


def test_scale_gate_cli_all_target_preserves_strict_block(tmp_path: Path) -> None:
    paths = _gate_fixture_reports(tmp_path)

    code = scale_gate_main(_gate_args(paths, target="all", pr_review=paths["pr_review"], out=tmp_path / "gate.json"))
    gate = json.loads((tmp_path / "gate.json").read_text(encoding="utf-8"))

    assert code == 1
    assert gate["target"] == "all"
    assert gate["target_ready"] is False
    assert gate["pr_review_ready"] is True
    assert gate["dom_aware_ready"] is False


def test_scale_gate_cli_pr_review_target_blocks_missing_report(tmp_path: Path, capsys) -> None:
    paths = _gate_fixture_reports(tmp_path)

    code = scale_gate_main(_gate_args(paths, target="pr-review", pr_review=None, out=tmp_path / "gate.json"))

    captured = capsys.readouterr()
    gate = json.loads((tmp_path / "gate.json").read_text(encoding="utf-8"))
    assert code == 1
    assert gate["target_ready"] is False
    assert gate["blocked_reasons_by_target"]["pr-review"]
    assert "PR screenshot review report missing" in captured.err


def test_scale_gate_cli_pr_review_target_blocks_malformed_report(tmp_path: Path, capsys) -> None:
    paths = _gate_fixture_reports(tmp_path)
    malformed = tmp_path / "malformed_pr_review.json"
    malformed.write_text("{not json", encoding="utf-8")

    code = scale_gate_main(_gate_args(paths, target="pr-review", pr_review=malformed, out=tmp_path / "gate.json"))

    captured = capsys.readouterr()
    gate = json.loads((tmp_path / "gate.json").read_text(encoding="utf-8"))
    assert code == 1
    assert gate["target_ready"] is False
    assert "unreadable" in gate["pr_review_gate"]["blocked_reason"]
    assert "PR screenshot review report is unreadable" in captured.err


def test_pr_review_ci_artifact_validator_accepts_valid_fixture(tmp_path: Path) -> None:
    _review_fixture(tmp_path)
    report = run_pr_review(
        PrReviewConfig(
            review_id="fixture_pr",
            output_dir=tmp_path / "reports" / "ui_pr_review_v0",
            mode="screenshots-only",
            review_root=tmp_path / "data" / "pr_review_v0",
        )
    )
    gate_path = tmp_path / "reports" / "ui_jepa_v0_smoke" / "scale_gate_pr_review.json"
    _write_json(gate_path, {"target": "pr-review", "target_ready": True})

    validation = validate_pr_review_ci_artifacts(Path(report["output_dir"]), gate_path)

    assert validation["valid"] is True
    assert validation["errors"] == []
    assert validation["review_artifacts"][0]["valid"] is True
    assert (Path(report["output_dir"]) / "review_metadata.json").is_file()


def test_pr_review_ci_artifact_validator_blocks_missing_required_artifact(tmp_path: Path) -> None:
    _review_fixture(tmp_path)
    report = run_pr_review(
        PrReviewConfig(
            review_id="fixture_pr",
            output_dir=tmp_path / "reports" / "ui_pr_review_v0",
            mode="screenshots-only",
            review_root=tmp_path / "data" / "pr_review_v0",
        )
    )
    gate_path = tmp_path / "reports" / "ui_jepa_v0_smoke" / "scale_gate_pr_review.json"
    _write_json(gate_path, {"target": "pr-review", "target_ready": True})
    (Path(report["output_dir"]) / "after.png").unlink()

    validation = validate_pr_review_ci_artifacts(Path(report["output_dir"]), gate_path)

    assert validation["valid"] is False
    assert any("after_screenshot is missing" in error for error in validation["errors"])


def test_pr_review_ci_artifact_validator_blocks_wrong_gate_target(tmp_path: Path) -> None:
    _review_fixture(tmp_path)
    report = run_pr_review(
        PrReviewConfig(
            review_id="fixture_pr",
            output_dir=tmp_path / "reports" / "ui_pr_review_v0",
            mode="screenshots-only",
            review_root=tmp_path / "data" / "pr_review_v0",
        )
    )
    gate_path = tmp_path / "reports" / "ui_jepa_v0_smoke" / "scale_gate_dom_aware.json"
    _write_json(gate_path, {"target": "dom-aware", "target_ready": False})

    validation = validate_pr_review_ci_artifacts(Path(report["output_dir"]), gate_path)

    assert validation["valid"] is False
    assert any("target must be pr-review" in error for error in validation["errors"])
    assert any("target_ready must be true" in error for error in validation["errors"])


def test_pr_review_ci_scale_gate_args_are_target_specific(tmp_path: Path) -> None:
    config = PrReviewCiConfig(gate_out=tmp_path / "scale_gate_pr_review.json")

    args = build_scale_gate_args(config, tmp_path / "pr_review_report.json")

    assert "--target" in args
    assert args[args.index("--target") + 1] == "pr-review"
    assert "--pr-review-report" in args
    assert str(tmp_path / "pr_review_report.json") in args
    assert "dom-aware" not in args


def test_pr_review_ci_scale_gate_target_is_pr_review_only() -> None:
    config = PrReviewCiConfig(target="pr-review")

    args = build_scale_gate_args(config, Path("pr_review_report.json"))

    assert args[args.index("--target") + 1] == "pr-review"


def test_real_trial_case_schema_accepts_screenshots_only_case(tmp_path: Path) -> None:
    trial_root = _trial_fixture(tmp_path, count=1)
    cases, errors = load_pr_review_trial_cases(trial_root)

    assert errors == []
    assert len(cases) == 1
    assert validate_pr_review_trial_case(cases[0]) == []


def test_real_trial_loader_reads_multiple_cases(tmp_path: Path) -> None:
    trial_root = _trial_fixture(tmp_path, count=5)

    cases, errors = load_pr_review_trial_cases(trial_root)

    assert errors == []
    assert [case["case_id"] for case in cases] == [f"trial_case_{index}" for index in range(5)]


def test_real_trial_case_schema_reports_missing_artifact(tmp_path: Path) -> None:
    trial_root = _trial_fixture(tmp_path, count=1)
    missing = trial_root / "trial_case_0" / "after.png"
    missing.unlink()
    cases, _ = load_pr_review_trial_cases(trial_root)

    errors = validate_pr_review_trial_case(cases[0])

    assert any("after screenshot is missing" in error for error in errors)


def test_real_trial_reviewer_label_parsing_validates_required_fields() -> None:
    label = {
        "schema_version": PR_REVIEW_TRIAL_REVIEWER_LABEL_SCHEMA_VERSION,
        "case_id": "case_a",
        "preferred": "after",
        "critic_decision_agree": True,
        "visual_regression_missed": False,
        "false_positive": False,
        "notes": "",
        "reviewer_id": "tester",
        "created_at": "2026-06-17T00:00:00Z",
    }

    assert validate_trial_reviewer_label(label, expected_case_id="case_a") == []
    broken = dict(label)
    broken["false_positive"] = "no"
    assert any("false_positive must be boolean" in error for error in validate_trial_reviewer_label(broken, expected_case_id="case_a"))


def test_real_trial_runner_generates_aggregate_report_and_readiness(tmp_path: Path) -> None:
    trial_root = _trial_fixture(tmp_path, count=5)

    report = run_pr_review_trial(
        PrReviewTrialConfig(
            trial_root=trial_root,
            output_dir=tmp_path / "reports" / "ui_pr_review_v0" / "real_pr_trial",
            reviewer_id="tester",
        )
    )

    out = tmp_path / "reports" / "ui_pr_review_v0" / "real_pr_trial"
    assert report["valid"] is True
    assert report["case_count"] == 5
    assert report["reviewed_count"] == 5
    assert report["skipped_count"] == 0
    assert report["critic_vs_reviewer_agreement"] == 1.0
    assert report["false_positive_count"] == 0
    assert report["missed_regression_count"] == 0
    assert report["readiness_decision"] == "enable_artifact_only_workflow"
    assert report["artifact_only_github_workflow_ready"] is True
    assert (out / "trial_report.json").is_file()
    assert (out / "trial_report.md").is_file()
    assert (out / "trial_case_0" / "pr_review_report.json").is_file()


def test_real_trial_readiness_collects_more_cases_below_five() -> None:
    result = decide_pr_review_trial_readiness(
        reviewed_count=4,
        agreement_rate=1.0,
        false_positive_rate=0.0,
        missed_regression_count=0,
        accessibility_regression_rate=0.0,
        responsive_regression_rate=0.0,
        reviewer_errors=[],
    )

    assert result["decision"] == "collect_more_real_cases"


def test_real_trial_readiness_is_conservative_for_false_positives_and_missed_regressions() -> None:
    false_positive = decide_pr_review_trial_readiness(
        reviewed_count=5,
        agreement_rate=0.9,
        false_positive_rate=0.4,
        missed_regression_count=0,
        accessibility_regression_rate=0.0,
        responsive_regression_rate=0.0,
        reviewer_errors=[],
    )
    missed = decide_pr_review_trial_readiness(
        reviewed_count=5,
        agreement_rate=1.0,
        false_positive_rate=0.0,
        missed_regression_count=1,
        accessibility_regression_rate=0.0,
        responsive_regression_rate=0.0,
        reviewer_errors=[],
    )

    assert false_positive["decision"] == "tune_thresholds"
    assert missed["decision"] == "do_not_productize_yet"


def test_real_trial_gate_selection_uses_pr_review_case_report(tmp_path: Path) -> None:
    trial_root = _trial_fixture(tmp_path, count=2)
    report = run_pr_review_trial(
        PrReviewTrialConfig(
            trial_root=trial_root,
            output_dir=tmp_path / "reports" / "ui_pr_review_v0" / "real_pr_trial",
        )
    )

    gate_report = select_trial_gate_report(report, "trial_case_1")

    assert gate_report == tmp_path / "reports" / "ui_pr_review_v0" / "real_pr_trial" / "trial_case_1" / "pr_review_report.json"


def test_pr_visual_review_workflow_is_manual_artifact_only() -> None:
    path = Path(".github/workflows/pr-visual-review.yml")
    text = path.read_text(encoding="utf-8")
    workflow = yaml.safe_load(text)
    triggers = workflow["on"]
    jobs = workflow["jobs"]
    permissions = workflow["permissions"]

    assert path.is_file()
    assert "workflow_dispatch" in triggers
    assert "pull_request" not in triggers
    assert permissions == {"contents": "read"}
    assert "review" in jobs
    assert "ui-pr-review-ci" in text
    assert "--target pr-review" in text
    assert "actions/upload-artifact" in text
    assert "codepawl-pr-visual-review" in text
    assert "scale_gate_pr_review.json" in text
    assert "reports/ui_pr_review_v0/${{ inputs.review_id }}/" in text
    assert ".github/workflows/pr-visual-review.yml.disabled" not in text
    assert "dom-aware" not in text
    assert "github-script" not in text
    assert "gh pr comment" not in text
    assert "pull-requests: write" not in text
    assert "issues: write" not in text
    assert "comments: write" not in text
    assert "ui-jepa-train" not in text
    assert "cuda" not in text.lower()
