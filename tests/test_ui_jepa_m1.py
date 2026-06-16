import json
from pathlib import Path

from codepawl_harness.ui_jepa_scale_gate_cli import main as gate_main
from pawl_jepa.m1 import (
    M1MaskConfig,
    M1ModelConfig,
    UiJepaM1Dataset,
    batch_masks,
    build_m1_model,
    collapse_diagnostics,
    export_m1_embeddings,
    m1_report_allows_m2,
    sample_random_block_mask,
)


def _smoke_dataset() -> Path:
    return Path("data/processed/ui_jepa_v0_smoke").resolve()


def _write_json(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def test_m1_dataset_loads_padded_screens(tmp_path: Path) -> None:
    smoke_dir = _smoke_dataset()

    dataset = UiJepaM1Dataset(smoke_dir, split="train", image_size=64, seed=42, shuffle=True)
    item = dataset[0]

    assert len(dataset) > 0
    assert item["image"].shape == (3, 64, 64)
    assert item["normalization"]["schema_version"] == "ui_jepa_padded_normalization_v1"
    assert item["record"]["split"] == "train"
    assert item["record"]["region_manifest_path"].endswith("regions.jsonl")
    assert item["record"]["design_tokens_manifest_path"].endswith("design_tokens.jsonl")


def test_random_block_masks_are_deterministic_and_valid() -> None:
    config = M1MaskConfig(image_size=64, patch_size=16, target_blocks=2, seed=123, min_context_ratio=0.50)

    first = sample_random_block_mask(config, sample_index=7)
    second = sample_random_block_mask(config, sample_index=7)
    other = sample_random_block_mask(config, sample_index=8)

    assert first == second
    assert first != other
    assert first["target_patch_ids"]
    assert set(first["target_patch_ids"]).isdisjoint(first["context_patch_ids"])
    assert first["context_ratio"] >= 0.50
    assert 0 < first["target_ratio"] < 0.50


def test_tiny_m1_forward_loss_and_embedding_export(tmp_path: Path) -> None:
    smoke_dir = _smoke_dataset()
    torch = __import__("torch")
    config = M1ModelConfig(image_size=64, patch_size=16, embedding_dim=32, predictor_hidden_dim=64, transformer_layers=1, transformer_heads=4)
    mask_config = M1MaskConfig(image_size=64, patch_size=16, target_blocks=1, seed=42)
    model = build_m1_model(config)
    dataset = UiJepaM1Dataset(smoke_dir, split="train", image_size=64, limit=2)
    images = torch.stack([dataset[0]["image"], dataset[1]["image"]])
    target_mask, context_mask, metadata = batch_masks(torch, mask_config, 2, start_index=0, device=torch.device("cpu"))

    outputs = model(images, target_mask, context_mask)
    outputs["loss"].backward()
    embeddings = export_m1_embeddings(torch, model, smoke_dir, 64, 4, torch.device("cpu"))

    assert outputs["loss"].item() >= 0
    assert metadata[0]["blocks"]
    assert len(embeddings) == len(UiJepaM1Dataset(smoke_dir, split=None, image_size=64))
    assert len(next(iter(embeddings.values()))) == 32


def test_collapse_diagnostics_detect_collapsed_and_noncollapsed_embeddings() -> None:
    collapsed = {f"s{i}": [1.0, 0.0, 0.0] for i in range(24)}
    spread = {f"s{i}": [float(i), float(i % 3), float((i * 7) % 5)] for i in range(24)}

    assert collapse_diagnostics(collapsed)["valid"] is False
    assert collapse_diagnostics(spread)["valid"] is True


def test_m1_report_validity_logic() -> None:
    valid = {
        "valid_m1_baseline": True,
        "collapse_diagnostics": {"valid": True},
        "probe": {"available": True},
        "b0_comparison": {"available": True},
    }
    collapsed = valid | {"collapse_diagnostics": {"valid": False}}

    assert m1_report_allows_m2(valid) is True
    assert m1_report_allows_m2(collapsed) is False


def test_scale_gate_blocks_missing_or_collapsed_m1_and_requires_valid_m2_for_dom_aware(tmp_path: Path) -> None:
    smoke_dir = _smoke_dataset()
    b0_report = tmp_path / "b0_report.json"
    _write_json(
        b0_report,
        {
            "real_weights": True,
            "valid_for_model_selection": True,
            "metrics_baseline": {"available": True},
            "splits": {"val": {"lift_over_best_constant": 0.1}},
            "validity_checks": {"failed_conditions": []},
        },
    )
    missing_gate = tmp_path / "missing_gate.json"
    assert gate_main(["--dataset", str(smoke_dir), "--b0-report", str(b0_report), "--out", str(missing_gate)]) == 1
    assert "M1 report is missing" in missing_gate.read_text(encoding="utf-8")

    collapsed_report = tmp_path / "m1_collapsed.json"
    _write_json(
        collapsed_report,
        {
            "valid_m1_baseline": False,
            "collapse_diagnostics": {"valid": False},
            "probe": {"available": True},
            "b0_comparison": {"available": True},
        },
    )
    collapsed_gate = tmp_path / "collapsed_gate.json"
    assert gate_main(["--dataset", str(smoke_dir), "--b0-report", str(b0_report), "--m1-report", str(collapsed_report), "--out", str(collapsed_gate)]) == 1

    valid_report = tmp_path / "m1_valid.json"
    _write_json(
        valid_report,
        {
            "valid_m1_baseline": True,
            "collapse_diagnostics": {"valid": True},
            "probe": {"available": True},
            "b0_comparison": {"available": True},
        },
    )
    valid_gate = tmp_path / "valid_gate.json"
    assert gate_main(["--dataset", str(smoke_dir), "--b0-report", str(b0_report), "--m1-report", str(valid_report), "--out", str(valid_gate)]) == 1
    result = json.loads(valid_gate.read_text(encoding="utf-8"))
    assert result["m2_ready"] is True
    assert result["dom_aware_ready"] is False
    assert result["blocked_stages"] == ["DOM_aware_jepa"]

    collapsed_m2 = tmp_path / "m2_collapsed.json"
    _write_json(
        collapsed_m2,
        {
            "valid_m2_baseline": False,
            "collapse_diagnostics": {"valid": False},
            "probe": {"available": True},
            "comparison": {"valid": True},
        },
    )
    collapsed_m2_gate = tmp_path / "collapsed_m2_gate.json"
    assert gate_main(
        [
            "--dataset",
            str(smoke_dir),
            "--b0-report",
            str(b0_report),
            "--m1-report",
            str(valid_report),
            "--m2-report",
            str(collapsed_m2),
            "--out",
            str(collapsed_m2_gate),
        ]
    ) == 1

    valid_m2 = tmp_path / "m2_valid.json"
    _write_json(
        valid_m2,
        {
            "valid_m2_baseline": True,
            "collapse_diagnostics": {"valid": True},
            "probe": {"available": True},
            "comparison": {"valid": True},
        },
    )
    dom_gate = tmp_path / "dom_gate.json"
    assert gate_main(
        [
            "--dataset",
            str(smoke_dir),
            "--b0-report",
            str(b0_report),
            "--m1-report",
            str(valid_report),
            "--m2-report",
            str(valid_m2),
            "--out",
            str(dom_gate),
        ]
    ) == 1
    result = json.loads(dom_gate.read_text(encoding="utf-8"))
    assert result["m2_ready"] is True
    assert result["dom_aware_ready"] is False
    assert result["blocked_stages"] == ["DOM_aware_jepa"]
    assert "M2.5 diagnostics report is missing" in dom_gate.read_text(encoding="utf-8")

    weak_m25 = tmp_path / "m25_weak.json"
    _write_json(
        weak_m25,
        {
            "useful_representation_signal": False,
            "dom_aware_recommended": False,
            "recommended_decision": "change_objective_or_strengthen_training_before_dom_aware",
        },
    )
    weak_gate = tmp_path / "weak_m25_gate.json"
    assert gate_main(
        [
            "--dataset",
            str(smoke_dir),
            "--b0-report",
            str(b0_report),
            "--m1-report",
            str(valid_report),
            "--m2-report",
            str(valid_m2),
            "--m25-report",
            str(weak_m25),
            "--out",
            str(weak_gate),
        ]
    ) == 1
    assert "M2.5 did not find useful representation signal" in weak_gate.read_text(encoding="utf-8")

    strong_m25 = tmp_path / "m25_strong.json"
    _write_json(
        strong_m25,
        {
            "useful_representation_signal": True,
            "dom_aware_recommended": True,
            "recommended_decision": "continue_stronger_m2_before_dom_aware",
        },
    )
    ready_gate = tmp_path / "ready_m25_gate.json"
    assert gate_main(
        [
            "--dataset",
            str(smoke_dir),
            "--b0-report",
            str(b0_report),
            "--m1-report",
            str(valid_report),
            "--m2-report",
            str(valid_m2),
            "--m25-report",
            str(strong_m25),
            "--out",
            str(ready_gate),
        ]
    ) == 1
    result = json.loads(ready_gate.read_text(encoding="utf-8"))
    assert result["m2_ready"] is True
    assert result["dom_aware_ready"] is False
    assert result["blocked_stages"] == ["DOM_aware_jepa"]


def test_scale_gate_reads_manual_m2_strong_evidence_and_still_blocks_dom_aware(tmp_path: Path) -> None:
    smoke_dir = _smoke_dataset()
    b0_report = tmp_path / "b0_report.json"
    m1_report = tmp_path / "m1_report.json"
    m2_report = tmp_path / "m2_report.json"
    m2_strong_report = tmp_path / "m2_strong_report.json"
    m25_report = tmp_path / "m25_report.json"
    gate_out = tmp_path / "gate.json"

    _write_json(
        b0_report,
        {
            "real_weights": True,
            "valid_for_model_selection": True,
            "metrics_baseline": {"available": True},
            "splits": {"val": {"lift_over_best_constant": 0.1}},
            "validity_checks": {"failed_conditions": []},
        },
    )
    _write_json(
        m1_report,
        {
            "valid_m1_baseline": True,
            "collapse_diagnostics": {"valid": True},
            "probe": {"available": True},
            "b0_comparison": {"available": True},
        },
    )
    _write_json(
        m2_report,
        {
            "valid_m2_baseline": True,
            "collapse_diagnostics": {"valid": True},
            "probe": {"available": True, "splits": {"test": {"pairwise_accuracy": 0.5}}},
            "comparison": {"valid": True},
        },
    )
    _write_json(
        m2_strong_report,
        {
            "valid_m2_baseline": True,
            "collapse_diagnostics": {"valid": True},
            "probe": {"available": True, "splits": {"test": {"pairwise_accuracy": 0.49765258215962443}}},
            "comparison": {"valid": True, "metrics_only_still_dominates": True},
            "model_config": {"image_size": 128, "embedding_dim": 128},
            "commands": {"train": "ui-jepa-m2-train --epochs 20 --device cuda"},
        },
    )
    _write_json(
        m25_report,
        {
            "useful_representation_signal": False,
            "dom_aware_recommended": False,
            "recommended_decision": "harden_dataset_or_add_preference_aligned_objective",
        },
    )

    assert (
        gate_main(
            [
                "--dataset",
                str(smoke_dir),
                "--b0-report",
                str(b0_report),
                "--m1-report",
                str(m1_report),
                "--m2-report",
                str(m2_report),
                "--m25-report",
                str(m25_report),
                "--out",
                str(gate_out),
            ]
        )
        == 1
    )
    result = json.loads(gate_out.read_text(encoding="utf-8"))

    assert result["dom_aware_ready"] is False
    assert result["blocked_stages"] == ["DOM_aware_jepa"]
    assert result["m2_strong_report"] == str(m2_strong_report.resolve())
    assert result["m2_strong_evidence"]["valid"] is True
    assert result["m2_strong_evidence"]["config"] == {
        "image_size": 128,
        "embedding_dim": 128,
        "epochs": 20,
        "device": "cuda",
    }
    assert result["m2_strong_evidence"]["near_chance"] is True
    assert "Manual strong M2 evidence is valid and non-collapsed but remains near chance" in result["recommendation"]
    assert "preference-aligned critic/dataset hardening" in result["recommendation"]
