import json
from pathlib import Path

from codepawl_harness.ui_jepa_m25_ablation_cli import main as m25_main
from pawl_jepa.m25 import M25Config, collect_existing_models, diagnostic_signal, load_dataset_metadata, strongest_m2_evidence


def _smoke_dataset() -> Path:
    return Path("data/processed/ui_jepa_v0_smoke").resolve()


def _write_json(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def test_m25_cli_writes_offline_diagnostics_without_stronger_training(tmp_path: Path) -> None:
    report_out = tmp_path / "m25_report.json"

    assert (
        m25_main(
            [
                str(_smoke_dataset()),
                "--out",
                str(tmp_path / "m25"),
                "--report-out",
                str(report_out),
                "--b0-report",
                "reports/ui_jepa_v0_smoke/b0_report.json",
                "--m1-report",
                "reports/ui_jepa_v0_smoke/m1_report.json",
                "--m2-report",
                "reports/ui_jepa_v0_smoke/m2_report.json",
                "--skip-stronger-m2",
                "--probe-epochs",
                "2",
            ]
        )
        == 0
    )
    report = json.loads(report_out.read_text(encoding="utf-8"))

    assert report["schema_version"] == "ui_jepa_m25_diagnostics_report_v1"
    assert report["diagnostics"]["m1_random_block_jepa"]["available"] is True
    assert report["diagnostics"]["m2_semantic_region_jepa"]["screen_probes"]["original_vs_corrupted"]["available"] is True
    assert report["diagnostics"]["metrics_only"]["feature_kind"] == "metrics_only"
    assert report["stronger_m2_runs"] == []
    assert report["recommended_decision"] in {
        "harden_dataset_or_add_preference_aligned_objective",
        "change_objective_or_strengthen_training_before_dom_aware",
        "harden_dataset_labels_before_dom_aware",
        "continue_stronger_m2_before_dom_aware",
    }


def test_m25_dataset_metadata_derives_corruption_and_region_labels() -> None:
    dataset = load_dataset_metadata(_smoke_dataset())
    corrupted = [screen for screen in dataset["screens"].values() if screen["is_corrupted"]]

    assert corrupted
    assert {screen["corruption_type"] for screen in corrupted} >= {"spacing", "contrast", "alignment", "hierarchy"}
    assert all(screen["split"] in {"train", "val", "test"} for screen in dataset["screens"].values())
    assert any(screen["region_types"] for screen in dataset["screens"].values())


def test_m25_diagnostic_signal_requires_lift_and_absolute_score() -> None:
    weak = diagnostic_signal(
        {
            "original_vs_corrupted": {
                "available": True,
                "splits": {"test": {"accuracy": 0.54, "best_constant_accuracy": 0.50}},
            }
        },
        {},
        {"available": False},
    )
    useful = diagnostic_signal(
        {
            "original_vs_corrupted": {
                "available": True,
                "splits": {"test": {"accuracy": 0.66, "best_constant_accuracy": 0.50}},
            }
        },
        {},
        {"available": False},
    )

    assert weak["useful"] is False
    assert useful["useful"] is True


def test_m25_collects_manual_m2_strong_report_without_training(tmp_path: Path) -> None:
    m2_report = tmp_path / "m2_report.json"
    m2_strong_report = tmp_path / "m2_strong_report.json"
    _write_json(
        m2_report,
        {
            "checkpoint_path": str(tmp_path / "m2" / "checkpoints" / "m2_last.pt"),
            "valid_m2_baseline": True,
            "collapse_diagnostics": {"valid": True},
            "probe": {"available": True, "splits": {"test": {"pairwise_accuracy": 0.5}}},
            "comparison": {"valid": True},
            "model_config": {"image_size": 64, "embedding_dim": 32},
            "commands": {"train": "ui-jepa-m2-train --epochs 1 --device cpu"},
        },
    )
    _write_json(
        m2_strong_report,
        {
            "checkpoint_path": str(tmp_path / "m2_strong" / "checkpoints" / "m2_last.pt"),
            "valid_m2_baseline": True,
            "collapse_diagnostics": {"valid": True},
            "probe": {"available": True, "splits": {"test": {"pairwise_accuracy": 0.49765258215962443}}},
            "comparison": {"valid": True, "metrics_only_still_dominates": True},
            "model_config": {"image_size": 128, "embedding_dim": 128},
            "commands": {"train": "ui-jepa-m2-train --epochs 20 --device cuda"},
        },
    )

    models = collect_existing_models(
        M25Config(
            dataset_dir=_smoke_dataset(),
            output_dir=tmp_path / "out",
            report_out=tmp_path / "m25.json",
            m2_report=m2_report,
            run_stronger_m2=False,
        )
    )
    strongest = strongest_m2_evidence(models)

    assert [model["name"] for model in models] == ["m2_semantic_region_jepa", "m2_strong_manual_cuda"]
    assert strongest["name"] == "m2_strong_manual_cuda"
    assert strongest["manual_external"] is True
    assert strongest["valid"] is True
    assert strongest["strength"] == {
        "image_size": 128,
        "embedding_dim": 128,
        "epochs": 20,
        "device": "cuda",
        "test_accuracy": 0.49765258215962443,
        "near_chance": True,
        "metrics_only_still_dominates": True,
    }
