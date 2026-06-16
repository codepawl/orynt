import json
from pathlib import Path

from PIL import Image

from pawlbench_design.ui_jepa_smoke import check_ui_jepa_scaling_gate
from pawlbench_design.ui_loop import (
    LOOP_REVIEW_FORM_SCHEMA_VERSION,
    LoopBuildConfig,
    ManualLabelReviewConfig,
    LoopRunConfig,
    ManualBatchConfig,
    aggregate_loop_reports,
    build_loop_dataset,
    build_manual_calibration_batch,
    combine_manual_batch_reports,
    critique_to_instruction,
    load_selected_manual_review_tasks,
    load_manual_review_labels,
    manual_review_agreement,
    remove_known_jitter_style,
    review_manual_labels,
    run_loop,
    validate_loop_task,
)
from codepawl_harness.ui_loop_review_web import ReviewWebApp, ReviewWebConfig


def _write_json(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def _write_jsonl(path: Path, rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("".join(json.dumps(row, sort_keys=True) + "\n" for row in rows), encoding="utf-8")


def _png(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.new("RGB", (24, 16), color=(255, 255, 255)).save(path)


def _html(path: Path, *, jitter: bool) -> None:
    style = ""
    if jitter:
        style = """
<!-- CodePawl jitter: spacing_bad from fixture.html, seed 42 -->
<style data-codepawl-jitter="true">
  :root body main { padding: 4px !important; }
</style>
"""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(f"<html><head>{style}</head><body><main><h1>Title</h1><a class='button primary'>Start</a></main></body></html>", encoding="utf-8")


def _tiny_smoke(tmp_path: Path) -> Path:
    root = tmp_path / "smoke"
    manifest = []
    pairs = []
    split_map = {}
    issues = ["spacing", "contrast", "alignment", "hierarchy"]
    for index, issue in enumerate(issues):
        group = f"screen_{issue}"
        original_id = f"{group}__original"
        bad_id = f"{group}__{issue}_bad_seed00"
        for sid, corrupted in [(original_id, False), (bad_id, True)]:
            sample_dir = root / "samples" / group / ("jittered" if corrupted else "original")
            if corrupted:
                sample_dir = sample_dir / f"{issue}_bad_seed00"
            html = sample_dir / "index.html"
            screenshot = sample_dir / "screenshot.png"
            dom = sample_dir / "dom.json"
            accessibility = sample_dir / "accessibility.json"
            metrics = sample_dir / "metrics.json"
            _html(html, jitter=corrupted)
            _png(screenshot)
            _write_json(dom, {"tag_name": "html", "children": []})
            _write_json(accessibility, {"supported": True, "snapshot": {"nodes": []}})
            _write_json(
                metrics,
                {
                    "contrast_issue_count": 2 if issue == "contrast" and corrupted else 0,
                    "min_contrast_ratio": 2.0 if issue == "contrast" and corrupted else 7.0,
                    "hierarchy_warning_count": 1 if issue == "hierarchy" and corrupted else 0,
                    "font_size_ratio": 1.2 if issue == "hierarchy" and corrupted else 2.2,
                    "has_horizontal_overflow": issue == "alignment" and corrupted,
                    "has_vertical_overflow": False,
                    "horizontal_overflow_px": 20 if issue == "alignment" and corrupted else 0,
                    "max_right_overflow_px": 20 if issue == "alignment" and corrupted else 0,
                    "viewport_fill_ratio": 0.3 if issue == "spacing" and corrupted else 0.8,
                    "visible_element_count": 5,
                },
            )
            manifest.append(
                {
                    "screen_id": sid,
                    "sample_id": sid,
                    "source_path": str(html),
                    "screenshot_path": str(screenshot),
                    "dom_path": str(dom),
                    "accessibility_path": str(accessibility),
                    "metrics_path": str(metrics),
                    "is_corrupted": corrupted,
                    "parent_screen_id": original_id if corrupted else None,
                    "split_group": group,
                    "schema_version": "ui_jepa_v0_smoke_manifest_v1",
                    "width": 24,
                    "height": 16,
                    "viewport": {"width": 1440, "height": 900, "dpr": 1.0},
                }
            )
        pairs.append(
            {
                "pair_id": f"{group}__original_vs_{issue}_bad_seed00",
                "left_screen_id": original_id,
                "right_screen_id": bad_id,
                "preferred_screen_id": original_id,
                "left_is_preferred": True,
                "pair_family": "original_vs_corrupted",
                "corruption_type": issue,
                "severity": 0.75,
                "difficulty": "easy",
                "split_group": group,
            }
        )
        split_map[group] = "test" if index >= 2 else "train"
    _write_jsonl(root / "manifest.jsonl", manifest)
    _write_jsonl(root / "pairs.jsonl", pairs)
    _write_json(root / "splits.json", {"pair_split_by_group": split_map})
    return root


def test_loop_dataset_builder_and_task_schema(tmp_path: Path) -> None:
    summary = build_loop_dataset(LoopBuildConfig(smoke_dir=_tiny_smoke(tmp_path), output_dir=tmp_path / "loop", set_name="loop_easy_20", limit=4))
    tasks = [json.loads(line) for line in (tmp_path / "loop" / "loop_easy_20" / "tasks.jsonl").read_text(encoding="utf-8").splitlines()]

    assert summary["task_count"] == 4
    assert tasks[0]["schema_version"] == "ui_loop_v0_task_v1"
    assert validate_loop_task(tasks[0]) == []
    assert {"task_id", "before_html_path", "before_metrics_path", "expected_patch_scope"} <= set(tasks[0])
    assert {"patch_mode_allowed", "is_oracle_eligible", "has_clean_original_reference", "provenance_safe_for_non_oracle"} <= set(tasks[0])
    assert {"train_template_overlap", "critic_train_overlap", "holdout_status", "expected_issue_types"} <= set(tasks[0])


def test_critique_to_instruction_and_patcher() -> None:
    html = "<head><!-- CodePawl jitter: spacing_bad from x --><style data-codepawl-jitter=\"true\">bad</style></head>"
    patched, removed = remove_known_jitter_style(html)

    assert removed is True
    assert "data-codepawl-jitter" not in patched


def test_loop_run_noop_and_deterministic_patch_offline(tmp_path: Path) -> None:
    smoke = _tiny_smoke(tmp_path)
    build_loop_dataset(LoopBuildConfig(smoke_dir=smoke, output_dir=tmp_path / "loop", set_name="loop_easy_20", limit=2))
    dataset = tmp_path / "loop" / "loop_easy_20"
    task = json.loads((dataset / "tasks.jsonl").read_text(encoding="utf-8").splitlines()[0])
    instruction = critique_to_instruction(task)

    assert instruction["schema_version"] == "ui_loop_v0_instruction_v1"
    assert instruction["work_contract"]["Goal"]

    report = run_loop(
        LoopRunConfig(
            dataset_dir=dataset,
            output_dir=tmp_path / "reports",
            patch_mode="deterministic_patch",
            limit=2,
            render=False,
            include_noop_baseline=True,
        )
    )

    assert report["task_count"] == 2
    assert report["noop_baseline"]["false_improvement_detected"] is False
    assert report["patch_mode_breakdown"]["deterministic_patch"] == 2
    assert report["passed_closed_loop_gate_uses_non_oracle_only"] is True
    assert "mean_critic_delta_non_oracle" in report
    assert report["passed_closed_loop_gate"] is False
    contracts = sorted((tmp_path / "reports" / "contracts").glob("*.md"))
    assert contracts
    contract = contracts[0].read_text(encoding="utf-8")
    assert "Goal:" in contract
    assert "Context:" in contract
    assert "Constraints:" in contract
    assert "Done when:" in contract
    assert "Do not use external services" in contract
    review_forms = sorted((tmp_path / "reports" / "manual_review_queue").glob("*.review.json"))
    assert review_forms
    review = json.loads(review_forms[0].read_text(encoding="utf-8"))
    assert review["schema_version"] == LOOP_REVIEW_FORM_SCHEMA_VERSION
    assert review["preferred"] is None
    assert review["visual_regression"] is False
    assert review["accessibility_concern"] is False
    assert set(review["provenance"]["allowed_values"]["preferred"]) == {"before", "after", "tie"}


def test_loop_run_noop_mode_stays_zero(tmp_path: Path) -> None:
    smoke = _tiny_smoke(tmp_path)
    build_loop_dataset(LoopBuildConfig(smoke_dir=smoke, output_dir=tmp_path / "loop", set_name="loop_easy_20", limit=2))
    report = run_loop(
        LoopRunConfig(
            dataset_dir=tmp_path / "loop" / "loop_easy_20",
            output_dir=tmp_path / "reports",
            patch_mode="no_op",
            limit=2,
            render=False,
            include_noop_baseline=True,
        )
    )

    assert report["patch_mode"] == "no_op"
    assert report["success_rate"] == 0.0
    assert report["mean_critic_delta"] == 0.0
    assert report["passed_closed_loop_gate"] is False


def test_report_aggregation_keeps_instruction_only_from_passing() -> None:
    report = aggregate_loop_reports(
        [
            {"task_id": "t1", "patch_mode": "instruction_only", "patch_success": True, "difficulty": "easy", "critic_delta": 0.0, "improvement_passes_local_threshold": True},
            {"task_id": "t1", "patch_mode": "no_op", "patch_success": True, "difficulty": "easy", "critic_delta": 0.0, "improvement_passes_local_threshold": True},
        ],
        dataset_dir=Path("data"),
        output_dir=Path("reports"),
        patch_mode="instruction_only",
        preference_report=None,
        runtime_seconds=0.0,
    )

    assert report["valid"] is True
    assert report["passed_closed_loop_gate"] is False
    assert report["noop_baseline"]["false_improvement_detected"] is False


def test_report_aggregation_passes_deterministic_easy_improvements() -> None:
    report = aggregate_loop_reports(
        [
            {"task_id": "t1", "patch_mode": "deterministic_patch", "patch_success": True, "difficulty": "easy", "critic_delta": 0.14, "improvement_passes_local_threshold": True, "accessibility_regression": False, "responsive_regression": False},
            {"task_id": "t2", "patch_mode": "deterministic_patch", "patch_success": True, "difficulty": "easy", "critic_delta": 0.14, "improvement_passes_local_threshold": True, "accessibility_regression": False, "responsive_regression": False},
            {"task_id": "t1", "patch_mode": "no_op", "patch_success": True, "difficulty": "easy", "critic_delta": 0.0, "improvement_passes_local_threshold": True},
            {"task_id": "t2", "patch_mode": "no_op", "patch_success": True, "difficulty": "easy", "critic_delta": 0.0, "improvement_passes_local_threshold": True},
        ],
        dataset_dir=Path("data"),
        output_dir=Path("reports"),
        patch_mode="deterministic_patch",
        preference_report=None,
        runtime_seconds=0.0,
    )

    assert report["success_rate"] == 1.0
    assert report["passed_closed_loop_gate"] is True
    assert report["noop_baseline"]["false_improvement_detected"] is False
    assert report["deterministic_non_oracle_success_rate"] == 1.0
    assert report["mean_critic_delta_non_oracle"] == 0.14


def test_oracle_report_is_excluded_from_non_oracle_gate() -> None:
    report = aggregate_loop_reports(
        [
            {"task_id": "t1", "patch_mode": "oracle_patch", "patch_success": True, "difficulty": "hard", "critic_delta": 0.2, "improvement_passes_local_threshold": True, "oracle_excluded_from_non_oracle_claims": True, "accessibility_regression": False, "responsive_regression": False},
            {"task_id": "t1", "patch_mode": "no_op", "patch_success": True, "difficulty": "hard", "critic_delta": 0.0, "improvement_passes_local_threshold": False},
        ],
        dataset_dir=Path("data/processed/ui_loop_v0/loop_hard_100"),
        output_dir=Path("reports"),
        patch_mode="oracle_patch",
        preference_report=None,
        runtime_seconds=0.0,
    )

    assert report["passed_closed_loop_gate"] is False
    assert report["oracle_upper_bound_success_rate"] == 1.0
    assert report["deterministic_non_oracle_success_rate"] == 0.0


def test_manual_patch_import_missing_is_skipped(tmp_path: Path) -> None:
    smoke = _tiny_smoke(tmp_path)
    build_loop_dataset(LoopBuildConfig(smoke_dir=smoke, output_dir=tmp_path / "loop", set_name="loop_easy_20", limit=1))
    report = run_loop(
        LoopRunConfig(
            dataset_dir=tmp_path / "loop" / "loop_easy_20",
            output_dir=tmp_path / "reports",
            patch_mode="manual_patch_import",
            manual_patches_dir=tmp_path / "manual_patches",
            limit=1,
            render=False,
            include_noop_baseline=False,
        )
    )

    assert report["task_count"] == 1
    assert report["evaluated_task_count"] == 0
    assert report["skipped_task_count"] == 1
    assert report["examples"]["skipped"][0]["skip_reason"]


def test_manual_batch_selection_patch_notes_and_review_templates(tmp_path: Path) -> None:
    smoke = _tiny_smoke(tmp_path)
    build_loop_dataset(LoopBuildConfig(smoke_dir=smoke, output_dir=tmp_path / "loop", set_name="loop_easy_20", limit=4))
    dataset = tmp_path / "loop" / "loop_easy_20"
    tasks = [json.loads(line) for line in (dataset / "tasks.jsonl").read_text(encoding="utf-8").splitlines()]
    contracts = tmp_path / "contracts"
    for task in tasks:
        _write_json(contracts / f"{task['task_id']}.critic.json", {"issues": [{"type": task["corruption_type"], "confidence": 0.64}]})
        (contracts / f"{task['task_id']}.md").write_text(f"# {task['task_id']}\n\nGoal:\nFix fixture.\n", encoding="utf-8")

    result = build_manual_calibration_batch(
        ManualBatchConfig(
            mixed_dataset_dir=dataset,
            hard_dataset_dir=dataset,
            output_dir=tmp_path / "manual_batch",
            contracts_dir=contracts,
            manual_patches_dir=tmp_path / "manual_patches",
            per_set_count=2,
            seed=7,
            created_at="2026-06-16T00:00:00Z",
        )
    )
    first_selection = json.loads((tmp_path / "manual_batch" / "task_selection.json").read_text(encoding="utf-8"))
    second = build_manual_calibration_batch(
        ManualBatchConfig(
            mixed_dataset_dir=dataset,
            hard_dataset_dir=dataset,
            output_dir=tmp_path / "manual_batch_2",
            contracts_dir=contracts,
            manual_patches_dir=tmp_path / "manual_patches_2",
            per_set_count=2,
            seed=7,
            created_at="2026-06-16T00:00:00Z",
        )
    )
    second_selection = json.loads(Path(second["task_selection_path"]).read_text(encoding="utf-8"))

    assert result["manual_patch_summary"]["patched_html_count"] == 4
    assert [row["task_id"] for row in first_selection["tasks"]] == [row["task_id"] for row in second_selection["tasks"]]
    selected_task = first_selection["tasks"][0]["task_id"]
    notes = json.loads((tmp_path / "manual_patches" / selected_task / "notes.json").read_text(encoding="utf-8"))
    assert notes["schema_version"] == "ui_loop_v0_manual_patch_notes_v1"
    assert notes["patch_author"] == "codex"
    assert notes["provenance"] == "manual_codex_patch"
    assert notes["oracle_used"] is False
    assert (tmp_path / "manual_patches" / selected_task / "patched.html").is_file()
    assert (tmp_path / "manual_patches" / selected_task / "patch.diff").read_text(encoding="utf-8")
    label = json.loads((tmp_path / "manual_batch" / "manual_review_labels" / f"{selected_task}.json").read_text(encoding="utf-8"))
    assert label == {
        "task_id": selected_task,
        "preferred": None,
        "issue_types_remaining": [],
        "visual_regression": None,
        "accessibility_concern": None,
        "notes": "",
        "reviewer_id": "",
        "provenance": "manual_review",
        "created_at": None,
    }
    assert "before screenshot" in (tmp_path / "manual_batch" / "manual_review_index.md").read_text(encoding="utf-8")


def test_manual_patch_import_for_fixture_patch(tmp_path: Path) -> None:
    smoke = _tiny_smoke(tmp_path)
    build_loop_dataset(LoopBuildConfig(smoke_dir=smoke, output_dir=tmp_path / "loop", set_name="loop_easy_20", limit=1))
    dataset = tmp_path / "loop" / "loop_easy_20"
    task = json.loads((dataset / "tasks.jsonl").read_text(encoding="utf-8").splitlines()[0])
    task_dir = tmp_path / "manual_patches" / task["task_id"]
    task_dir.mkdir(parents=True)
    before = Path(task["before_html_path"]).read_text(encoding="utf-8")
    patched, removed = remove_known_jitter_style(before)
    assert removed is True
    (task_dir / "patched.html").write_text(patched, encoding="utf-8")
    _write_json(task_dir / "notes.json", {"task_id": task["task_id"], "patch_author": "codex", "provenance": "manual_codex_patch", "created_at": "2026-06-16T00:00:00Z", "oracle_used": False})

    report = run_loop(
        LoopRunConfig(
            dataset_dir=dataset,
            output_dir=tmp_path / "reports",
            patch_mode="manual_patch_import",
            manual_patches_dir=tmp_path / "manual_patches",
            limit=1,
            render=False,
            include_noop_baseline=False,
        )
    )

    assert report["task_count"] == 1
    assert report["evaluated_task_count"] == 1
    assert report["skipped_task_count"] == 0
    task_reports = sorted((tmp_path / "reports" / "tasks").glob("*.json"))
    imported = json.loads(task_reports[0].read_text(encoding="utf-8"))
    assert imported["patch_details"]["manual_patch_record"]["provenance"] == "manual_codex_patch"


def test_manual_review_label_ingestion_and_agreement(tmp_path: Path) -> None:
    labels_path = tmp_path / "labels.jsonl"
    labels_path.write_text(
        json.dumps(
            {
                "task_id": "t1",
                "preferred": "after",
                "issue_types_remaining": ["spacing"],
                "visual_regression": False,
                "accessibility_concern": False,
                "notes": "better",
                "reviewer_id": "r1",
                "provenance": "unit",
                "created_at": "2026-06-16T00:00:00Z",
            }
        )
        + "\n",
        encoding="utf-8",
    )
    labels = load_manual_review_labels(labels_path)
    agreement = manual_review_agreement(
        [
            {
                "task_id": "t1",
                "critic_delta": 0.2,
                "deterministic_metric_deltas": {"quality_score_delta": 0.1},
            }
        ],
        labels,
    )

    assert labels[0]["schema_version"] == "ui_loop_v0_manual_review_label_v1"
    assert agreement["labels_available"] is True
    assert agreement["critic_vs_human_agreement"] == 1.0
    assert agreement["deterministic_metric_vs_human_agreement"] == 1.0
    assert agreement["patch_win_rate_by_human_preference"] == 1.0


def test_blank_manual_review_templates_are_not_ingested_as_ties(tmp_path: Path) -> None:
    labels_dir = tmp_path / "labels"
    labels_dir.mkdir()
    _write_json(labels_dir / "t1.json", {"task_id": "t1", "preferred": None, "provenance": "manual_review"})

    labels = load_manual_review_labels(labels_dir)
    agreement = manual_review_agreement([{"task_id": "t1", "critic_delta": 0.0}], labels)

    assert labels[0]["completed"] is False
    assert agreement["labels_available"] is False
    assert agreement["matched_label_count"] == 0


def _manual_review_fixture(tmp_path: Path) -> dict[str, Path]:
    selection = tmp_path / "task_selection.json"
    labels = tmp_path / "labels"
    mixed = tmp_path / "mixed_manual_patch_import"
    hard = tmp_path / "hard_manual_patch_import"
    patches = tmp_path / "manual_patches"
    before = tmp_path / "before.png"
    after = tmp_path / "after.png"
    patch_diff = patches / "t1" / "patch.diff"
    _png(before)
    _png(after)
    patch_diff.parent.mkdir(parents=True)
    patch_diff.write_text("--- before\n+++ after\n", encoding="utf-8")
    _write_json(
        selection,
        {
            "schema_version": "ui_loop_v0_manual_batch_v1",
            "tasks": [
                {
                    "task_id": "t1",
                    "source_loop_set": "loop_mixed_50",
                    "difficulty": "hard",
                    "corruption_type": "spacing",
                    "severity": 0.5,
                    "known_issue_types": ["spacing"],
                    "before_screenshot_path": str(before),
                },
                {
                    "task_id": "t2",
                    "source_loop_set": "loop_hard_100",
                    "difficulty": "hard",
                    "corruption_type": "contrast",
                    "severity": 0.8,
                    "known_issue_types": ["contrast"],
                    "before_screenshot_path": str(before),
                },
            ],
        },
    )
    _write_json(
        mixed / "tasks" / "t1__manual_patch_import.json",
        {
            "task_id": "t1",
            "before": {"screenshot_path": str(before)},
            "after": {"screenshot_path": str(after)},
            "patch_diff_path": str(patch_diff),
            "critic_delta": 0.2,
            "deterministic_metric_deltas": {"quality_score_delta": 0.1},
        },
    )
    _write_json(
        hard / "tasks" / "t2__manual_patch_import.json",
        {
            "task_id": "t2",
            "before": {"screenshot_path": str(before)},
            "after": {"screenshot_path": str(after)},
            "patch_diff_path": str(patches / "t2" / "patch.diff"),
        },
    )
    labels.mkdir()
    _write_json(labels / "t1.json", {"task_id": "t1", "preferred": None, "issue_types_remaining": [], "visual_regression": None, "accessibility_concern": None, "notes": "", "reviewer_id": "", "provenance": "manual_review", "created_at": None})
    _write_json(labels / "t2.json", {"task_id": "t2", "preferred": None, "issue_types_remaining": [], "visual_regression": None, "accessibility_concern": None, "notes": "", "reviewer_id": "", "provenance": "manual_review", "created_at": None})
    return {"selection": selection, "labels": labels, "mixed": mixed, "hard": hard, "patches": patches}


def _review_config(paths: dict[str, Path], **overrides: object) -> ManualLabelReviewConfig:
    values = {
        "selection_path": paths["selection"],
        "label_dir": paths["labels"],
        "mixed_report_dir": paths["mixed"],
        "hard_report_dir": paths["hard"],
        "manual_patches_dir": paths["patches"],
        "reviewer_id": "reviewer-1",
    }
    values.update(overrides)
    return ManualLabelReviewConfig(**values)


def _input(values: list[str]):
    iterator = iter(values)
    return lambda _prompt: next(iterator)


def test_manual_label_review_loads_selected_tasks(tmp_path: Path) -> None:
    paths = _manual_review_fixture(tmp_path)
    tasks = load_selected_manual_review_tasks(paths["selection"])

    assert [task["task_id"] for task in tasks] == ["t1", "t2"]
    assert tasks[0]["source_loop_set"] == "loop_mixed_50"


def test_manual_label_review_writes_label_from_simulated_input(tmp_path: Path) -> None:
    paths = _manual_review_fixture(tmp_path)
    result = review_manual_labels(_review_config(paths, limit=1), input_func=_input(["a", "false", "true", "better after"]))
    label = json.loads((paths["labels"] / "t1.json").read_text(encoding="utf-8"))
    labels = load_manual_review_labels(paths["labels"])

    assert result["written"] == 1
    assert label["preferred"] == "after"
    assert label["visual_regression"] is False
    assert label["accessibility_concern"] is True
    assert label["notes"] == "better after"
    assert label["reviewer_id"] == "reviewer-1"
    assert label["provenance"] == "manual_review"
    assert label["created_at"]
    assert labels[0]["schema_version"] == "ui_loop_v0_manual_review_label_v1"
    assert labels[0]["completed"] is True


def test_manual_label_review_skip_does_not_write(tmp_path: Path) -> None:
    paths = _manual_review_fixture(tmp_path)
    before = (paths["labels"] / "t1.json").read_text(encoding="utf-8")
    result = review_manual_labels(_review_config(paths, limit=1), input_func=_input(["s"]))

    assert result["written"] == 0
    assert result["skipped"] == 1
    assert (paths["labels"] / "t1.json").read_text(encoding="utf-8") == before


def test_manual_label_review_only_empty_skips_partial_labels(tmp_path: Path) -> None:
    paths = _manual_review_fixture(tmp_path)
    _write_json(paths["labels"] / "t1.json", {"task_id": "t1", "preferred": None, "issue_types_remaining": [], "visual_regression": None, "accessibility_concern": None, "notes": "already started", "reviewer_id": "", "provenance": "manual_review", "created_at": None})
    result = review_manual_labels(_review_config(paths, limit=1, only_empty=True), input_func=_input([]))

    assert result["visited"] == 0
    assert result["skipped"] == 1
    label = json.loads((paths["labels"] / "t1.json").read_text(encoding="utf-8"))
    assert label["notes"] == "already started"


def test_manual_label_review_preserves_completed_label_without_overwrite(tmp_path: Path) -> None:
    paths = _manual_review_fixture(tmp_path)
    _write_json(paths["labels"] / "t1.json", {"task_id": "t1", "preferred": "before", "issue_types_remaining": [], "visual_regression": False, "accessibility_concern": False, "notes": "keep me", "reviewer_id": "r0", "provenance": "manual_review", "created_at": "2026-06-16T00:00:00+07:00"})
    result = review_manual_labels(_review_config(paths, limit=1), input_func=_input([]))

    assert result["visited"] == 0
    assert result["skipped"] == 1
    label = json.loads((paths["labels"] / "t1.json").read_text(encoding="utf-8"))
    assert label["preferred"] == "before"
    assert label["notes"] == "keep me"


def test_manual_label_review_overwrite_completed_label_when_explicit(tmp_path: Path) -> None:
    paths = _manual_review_fixture(tmp_path)
    _write_json(paths["labels"] / "t1.json", {"task_id": "t1", "preferred": "before", "issue_types_remaining": [], "visual_regression": False, "accessibility_concern": False, "notes": "old", "reviewer_id": "r0", "provenance": "manual_review", "created_at": "2026-06-16T00:00:00+07:00"})
    result = review_manual_labels(_review_config(paths, limit=1, overwrite=True), input_func=_input(["t", "false", "false", "tie now"]))
    label = json.loads((paths["labels"] / "t1.json").read_text(encoding="utf-8"))

    assert result["visited"] == 1
    assert label["preferred"] == "tie"
    assert label["notes"] == "tie now"


def test_combined_manual_batch_report_aggregation(tmp_path: Path) -> None:
    mixed = tmp_path / "mixed.json"
    hard = tmp_path / "hard.json"
    _write_json(mixed, {"patch_mode": "manual_patch_import", "task_count": 3, "evaluated_task_count": 3, "skipped_task_count": 0, "manual_patch_success_rate": 1.0, "accessibility_regression_rate_non_oracle": 0.0, "responsive_regression_rate_non_oracle": 0.0})
    _write_json(hard, {"patch_mode": "manual_patch_import", "task_count": 2, "evaluated_task_count": 2, "skipped_task_count": 0, "manual_patch_success_rate": 0.5, "accessibility_regression_rate_non_oracle": 0.0, "responsive_regression_rate_non_oracle": 0.0})
    labels = tmp_path / "labels"
    labels.mkdir()
    for index in range(5):
        _write_json(labels / f"t{index}.json", {"task_id": f"t{index}", "preferred": "after", "provenance": "manual_review"})

    combined = combine_manual_batch_reports(
        [mixed, hard],
        selection={"tasks": [{"task_id": f"t{index}"} for index in range(5)]},
        output_path=tmp_path / "combined.json",
        label_dir=labels,
        min_task_count=5,
        min_success_rate=0.7,
    )

    assert combined["evaluated_task_count"] == 5
    assert combined["manual_patch_success_rate"] == 0.8
    assert combined["manual_patch_ready"] is True
    assert combined["manual_review_ready"] is True
    assert combined["pr_review_ready"] is True


def _review_web_app(paths: dict[str, Path], reviewer_id: str = "web-reviewer") -> ReviewWebApp:
    return ReviewWebApp(
        ReviewWebConfig(
            selection_path=paths["selection"],
            label_dir=paths["labels"],
            mixed_report_path=paths["mixed"] / "closed_loop_report.json",
            hard_report_path=paths["hard"] / "closed_loop_report.json",
            manual_patches_dir=paths["patches"],
            reviewer_id=reviewer_id,
        )
    )


def test_review_web_loads_task_selection_and_existing_label(tmp_path: Path) -> None:
    paths = _manual_review_fixture(tmp_path)
    _write_json(
        paths["labels"] / "t1.json",
        {
            "task_id": "t1",
            "preferred": "after",
            "issue_types_remaining": ["spacing"],
            "visual_regression": False,
            "accessibility_concern": True,
            "notes": "loaded",
            "reviewer_id": "r0",
            "provenance": "manual_review",
            "created_at": "2026-06-16T00:00:00+07:00",
        },
    )
    app = _review_web_app(paths)

    assert app.progress() == {"reviewed": 1, "total": 2}
    detail = app.task_detail("t1")
    assert detail["task"]["source_loop_set"] == "loop_mixed_50"
    assert detail["label"]["preferred"] == "after"
    assert detail["label"]["notes"] == "loaded"
    assert detail["patch_diff"] == "--- before\n+++ after\n"


def test_review_web_writes_valid_label_json(tmp_path: Path) -> None:
    paths = _manual_review_fixture(tmp_path)
    app = _review_web_app(paths, reviewer_id="an")
    label = app.save_label(
        "t1",
        {
            "preferred": "after",
            "issue_types_remaining": ["spacing"],
            "visual_regression": True,
            "accessibility_concern": False,
            "notes": "sau rõ hơn",
        },
    )
    saved = json.loads((paths["labels"] / "t1.json").read_text(encoding="utf-8"))

    assert label == saved
    assert saved["task_id"] == "t1"
    assert saved["preferred"] == "after"
    assert saved["visual_regression"] is True
    assert saved["accessibility_concern"] is False
    assert saved["reviewer_id"] == "an"
    assert saved["provenance"] == "manual_review"
    assert saved["created_at"]


def test_review_web_rejects_invalid_preferred(tmp_path: Path) -> None:
    paths = _manual_review_fixture(tmp_path)
    app = _review_web_app(paths)

    try:
        app.save_label("t1", {"preferred": "sau"})
    except ValueError as exc:
        assert "preferred" in str(exc)
    else:
        raise AssertionError("invalid preferred should fail")


def test_review_web_skip_does_not_write_label(tmp_path: Path) -> None:
    paths = _manual_review_fixture(tmp_path)
    app = _review_web_app(paths)
    before = (paths["labels"] / "t1.json").read_text(encoding="utf-8")

    skipped = app.skip_label("t1")

    assert skipped["preferred"] is None
    assert (paths["labels"] / "t1.json").read_text(encoding="utf-8") == before


def test_review_web_preserves_existing_label_until_explicit_save(tmp_path: Path) -> None:
    paths = _manual_review_fixture(tmp_path)
    _write_json(
        paths["labels"] / "t1.json",
        {
            "task_id": "t1",
            "preferred": "before",
            "issue_types_remaining": [],
            "visual_regression": False,
            "accessibility_concern": False,
            "notes": "keep",
            "reviewer_id": "r0",
            "provenance": "manual_review",
            "created_at": "2026-06-16T00:00:00+07:00",
        },
    )
    app = _review_web_app(paths)

    assert app.state()["progress"] == {"reviewed": 1, "total": 2}
    saved = json.loads((paths["labels"] / "t1.json").read_text(encoding="utf-8"))
    assert saved["preferred"] == "before"
    assert saved["notes"] == "keep"


def test_review_web_prevents_path_traversal(tmp_path: Path) -> None:
    paths = _manual_review_fixture(tmp_path)
    app = _review_web_app(paths)

    assert app.is_allowed_path(Path("/etc/passwd")) is False
    try:
        app.artifact_path("t1", "../before_screenshot")
    except KeyError:
        pass
    else:
        raise AssertionError("artifact kind traversal should fail")


def test_review_web_task_metadata_api_shape(tmp_path: Path) -> None:
    paths = _manual_review_fixture(tmp_path)
    app = _review_web_app(paths)
    detail = app.task_detail("t1")

    assert detail["task"]["task_id"] == "t1"
    assert detail["task"]["known_issue_types"] == ["spacing"]
    assert detail["evidence"]["before_screenshot_path"] == str(tmp_path / "before.png")
    assert detail["artifacts"]["before_screenshot"] == "/api/artifacts/t1/before_screenshot"
    assert detail["artifacts"]["after_screenshot"] == "/api/artifacts/t1/after_screenshot"


def test_review_web_recombine_helper_with_fixture_reports(tmp_path: Path) -> None:
    paths = _manual_review_fixture(tmp_path)
    _write_json(paths["mixed"] / "closed_loop_report.json", {"patch_mode": "manual_patch_import", "task_count": 1, "evaluated_task_count": 1, "skipped_task_count": 0, "manual_patch_success_rate": 1.0, "accessibility_regression_rate_non_oracle": 0.0, "responsive_regression_rate_non_oracle": 0.0})
    _write_json(paths["hard"] / "closed_loop_report.json", {"patch_mode": "manual_patch_import", "task_count": 1, "evaluated_task_count": 1, "skipped_task_count": 0, "manual_patch_success_rate": 1.0, "accessibility_regression_rate_non_oracle": 0.0, "responsive_regression_rate_non_oracle": 0.0})
    app = _review_web_app(paths)
    app.save_label("t1", {"preferred": "after", "visual_regression": False, "accessibility_concern": False})
    app.save_label("t2", {"preferred": "tie", "visual_regression": False, "accessibility_concern": False})

    report = app.recombine()

    assert report["manual_review"]["label_count"] == 2
    assert report["manual_patch_ready"] is False
    assert report["manual_review_ready"] is False
    assert (paths["selection"].parent / "combined_manual_patch_report.json").is_file()


def test_gate_closed_loop_missing_failed_and_passed(tmp_path: Path) -> None:
    def report(path: Path, payload: dict) -> Path:
        _write_json(path, payload)
        return path

    b0 = report(tmp_path / "b0.json", {"real_weights": True, "valid_for_model_selection": True, "metrics_baseline": {"available": True}, "splits": {"val": {"lift_over_best_constant": 0.1}}, "validity_checks": {"failed_conditions": []}})
    m1 = report(tmp_path / "m1.json", {"valid_m1_baseline": True, "collapse_diagnostics": {"valid": True}, "probe": {"available": True}, "b0_comparison": {"available": True}})
    m2 = report(tmp_path / "m2.json", {"valid_m2_baseline": True, "collapse_diagnostics": {"valid": True}, "probe": {"available": True}, "comparison": {"valid": True}})
    m25 = report(tmp_path / "m25.json", {"useful_representation_signal": False, "dom_aware_recommended": False, "recommended_decision": "change_objective_or_strengthen_training_before_dom_aware"})
    critic = report(tmp_path / "critic.json", {"valid": True, "critique_json_examples": [{"screen_id": "s"}], "hard_subset_metrics": {"hard_test": {"available": True, "pairwise_accuracy": 0.7}}, "full_test_metrics": {"best_constant_accuracy": 0.5}, "issue_heads": {"spacing": {"available": False, "skipped_reason": "fixture"}}, "jepa_features_add_value": False, "decisions": {"recommended_next_stage": "freeze_jepa_architecture_work_for_this_corpus"}})
    failed_loop = report(tmp_path / "failed_loop.json", {"valid": True, "passed_closed_loop_gate": False, "passed_closed_loop_gate_uses_non_oracle_only": True, "noop_baseline": {"false_improvement_detected": False}, "patch_mode": "deterministic_patch", "difficulty_breakdown": {"easy": {"success_rate": 0.0}}, "deterministic_non_oracle_success_rate": 0.0, "accessibility_regression_rate_non_oracle": 0.0, "responsive_regression_rate_non_oracle": 0.0})
    passed_loop = report(tmp_path / "passed_loop.json", {"valid": True, "passed_closed_loop_gate": True, "passed_closed_loop_gate_uses_non_oracle_only": True, "set_name": "loop_mixed_50", "noop_baseline": {"false_improvement_detected": False}, "patch_mode": "deterministic_patch", "difficulty_breakdown": {"easy": {"success_rate": 1.0}}, "deterministic_non_oracle_success_rate": 1.0, "accessibility_regression_rate_non_oracle": 0.0, "responsive_regression_rate_non_oracle": 0.0, "manual_review": {"labels_available": True, "matched_label_count": 1}, "recommended_next_stage": "run_manual_codex_patch_workflow_on_selected_mixed_and_hard_tasks"})
    manual_batch_unlabeled = report(tmp_path / "manual_batch_unlabeled.json", {"valid": True, "evaluated_task_count": 1, "manual_patch_success_rate": 1.0, "accessibility_regression_rate": 0.0, "responsive_regression_rate": 0.0, "manual_patch_ready": True, "manual_review_ready": False, "blocked_reason": "manual review labels are missing", "thresholds": {"min_task_count": 1, "min_success_rate": 0.5, "max_regression_rate": 0.1}})
    manual_batch_ready = report(tmp_path / "manual_batch_ready.json", {"valid": True, "evaluated_task_count": 1, "manual_patch_success_rate": 1.0, "accessibility_regression_rate": 0.0, "responsive_regression_rate": 0.0, "manual_patch_ready": True, "manual_review_ready": True, "blocked_reason": None, "thresholds": {"min_task_count": 1, "min_success_rate": 0.5, "max_regression_rate": 0.1}})

    missing = check_ui_jepa_scaling_gate(Path("data/processed/ui_jepa_v0_smoke"), b0, m1, m2, m25, None, critic, tmp_path / "missing.json")
    failed = check_ui_jepa_scaling_gate(Path("data/processed/ui_jepa_v0_smoke"), b0, m1, m2, m25, None, critic, failed_loop)
    passed = check_ui_jepa_scaling_gate(Path("data/processed/ui_jepa_v0_smoke"), b0, m1, m2, m25, None, critic, passed_loop)
    blocked_pr = check_ui_jepa_scaling_gate(Path("data/processed/ui_jepa_v0_smoke"), b0, m1, m2, m25, None, critic, passed_loop, manual_batch_unlabeled)
    ready_pr = check_ui_jepa_scaling_gate(Path("data/processed/ui_jepa_v0_smoke"), b0, m1, m2, m25, None, critic, passed_loop, manual_batch_ready)

    assert missing["closed_loop_passed"] is False
    assert missing["closed_loop_gate_errors"]
    assert failed["closed_loop_passed"] is False
    assert passed["closed_loop_passed"] is True
    assert passed["closed_loop_mixed_passed"] is True
    assert passed["closed_loop_non_oracle_ready"] is True
    assert passed["manual_review_ready"] is True
    assert passed["manual_patch_ready"] is False
    assert passed["pr_review_ready"] is False
    assert blocked_pr["manual_patch_ready"] is True
    assert blocked_pr["manual_review_ready"] is True
    assert blocked_pr["pr_review_ready"] is False
    assert blocked_pr["pr_review_blocked_reason"] == "manual review labels are missing or below agreement threshold"
    assert ready_pr["manual_patch_ready"] is True
    assert ready_pr["pr_review_ready"] is True
    assert passed["dom_aware_ready"] is False
