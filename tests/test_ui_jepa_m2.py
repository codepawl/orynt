import json
from pathlib import Path

from pawl_jepa.m1 import M1ModelConfig, build_m1_model
from pawl_jepa.m2 import (
    M2MaskConfig,
    UiJepaM2Dataset,
    batch_semantic_masks,
    bbox_to_patch_ids,
    build_m2_comparison,
    m2_report_allows_dom_aware,
    sample_semantic_region_mask,
)


def _smoke_dataset() -> Path:
    return Path("data/processed/ui_jepa_v0_smoke").resolve()


def test_bbox_to_patch_ids_maps_normalized_coordinates_inside_bounds() -> None:
    normalization = {
        "scale": 0.25,
        "pad_left": 0,
        "pad_top": 25,
    }

    mapped = bbox_to_patch_ids([100, 50, 300, 150], normalization, image_size=100, patch_size=25)

    assert mapped["normalized_bbox_xyxy"] == [25.0, 37.5, 75.0, 62.5]
    assert mapped["patch_bbox"] == {"x1": 1, "y1": 1, "x2": 3, "y2": 3, "width": 2, "height": 2}
    assert mapped["patch_ids"] == [5, 6, 9, 10]


def test_semantic_region_masks_are_deterministic_valid_and_report_region_types() -> None:
    dataset = UiJepaM2Dataset(_smoke_dataset(), split="train", image_size=64, seed=42, shuffle=False, limit=1)
    item = dataset[0]
    config = M2MaskConfig(image_size=64, patch_size=16, target_regions=2, seed=123, min_context_ratio=0.25)

    first = sample_semantic_region_mask(
        config,
        screen_id=item["record"]["screen_id"],
        regions=item["regions"],
        normalization=item["normalization"],
        sample_index=9,
    )
    second = sample_semantic_region_mask(
        config,
        screen_id=item["record"]["screen_id"],
        regions=item["regions"],
        normalization=item["normalization"],
        sample_index=9,
    )

    assert first == second
    assert first["fallback"] is False
    assert first["target_patch_ids"]
    assert set(first["target_patch_ids"]).isdisjoint(first["context_patch_ids"])
    assert first["context_ratio"] >= 0.25
    assert first["target_region_type_counts"]
    assert all(0 <= patch_id < 16 for patch_id in first["target_patch_ids"])


def test_semantic_region_mask_fallback_is_explicit() -> None:
    config = M2MaskConfig(image_size=64, patch_size=16, target_regions=2, seed=123)

    mask = sample_semantic_region_mask(
        config,
        screen_id="missing_regions",
        regions=[],
        normalization={"scale": 1.0, "pad_left": 0, "pad_top": 0},
        sample_index=1,
    )

    assert mask["fallback"] is True
    assert mask["fallback_reason"] == "no_valid_regions"
    assert mask["target_patch_ids"]
    assert mask["context_patch_ids"]


def test_tiny_m2_forward_loss() -> None:
    torch = __import__("torch")
    smoke_dir = _smoke_dataset()
    model_config = M1ModelConfig(image_size=64, patch_size=16, embedding_dim=32, predictor_hidden_dim=64, transformer_layers=1, transformer_heads=4)
    mask_config = M2MaskConfig(image_size=64, patch_size=16, target_regions=1, seed=42, min_context_ratio=0.25)
    model = build_m1_model(model_config)
    dataset = UiJepaM2Dataset(smoke_dir, split="train", image_size=64, limit=2)
    items = [dataset[0], dataset[1]]
    images = torch.stack([item["image"] for item in items])
    target_mask, context_mask, metadata = batch_semantic_masks(
        torch,
        mask_config,
        [item["record"] for item in items],
        [item["regions"] for item in items],
        [item["normalization"] for item in items],
        start_index=0,
        device=torch.device("cpu"),
    )

    outputs = model(images, target_mask, context_mask)
    outputs["loss"].backward()

    assert outputs["loss"].item() >= 0
    assert len(metadata) == 2
    assert any(not item["fallback"] for item in metadata)


def test_m2_comparison_and_report_validity_logic() -> None:
    probe = {"splits": {"val": {"pairwise_accuracy": 0.55}, "test": {"pairwise_accuracy": 0.58}}}
    m1 = {"available": True, "valid_m1_baseline": True, "m1_val_accuracy": 0.50, "m1_test_accuracy": 0.49}
    b0 = {
        "available": True,
        "valid_for_model_selection": True,
        "b0_val_accuracy": 0.75,
        "b0_test_accuracy": 0.76,
        "metrics_only": {"available": True, "val_accuracy": 0.68, "test_accuracy": 0.86},
    }

    comparison = build_m2_comparison(probe, m1, b0, valid_m2=True)
    valid_report = {
        "valid_m2_baseline": True,
        "collapse_diagnostics": {"valid": True},
        "probe": {"available": True},
        "comparison": comparison,
    }
    invalid_report = valid_report | {"collapse_diagnostics": {"valid": False}}

    assert comparison["valid"] is True
    assert comparison["m2_improves_over_m1"] is True
    assert comparison["metrics_only_still_dominates"] is True
    assert m2_report_allows_dom_aware(valid_report) is True
    assert m2_report_allows_dom_aware(invalid_report) is False
