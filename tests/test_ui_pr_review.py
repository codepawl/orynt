import json
from pathlib import Path

from PIL import Image

from pawlbench_design.ui_pr_review import (
    PR_REVIEW_INPUT_SCHEMA_VERSION,
    PrReviewConfig,
    run_pr_review,
    validate_pr_review_input,
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
