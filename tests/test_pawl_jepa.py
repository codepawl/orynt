import importlib.util
import json
from pathlib import Path

import pytest
from PIL import Image

from codepawl_harness.pawl_jepa_prepare_cli import main as prepare_main
from codepawl_harness.pawl_jepa_prepare_hard_cli import main as prepare_hard_main
from pawl_jepa import prepare_hard_manifest, prepare_manifest, preferred_item_from_label
from pawl_jepa.manifest import PrepareConfig, PrepareHardConfig, load_manifest_records


torch_available = importlib.util.find_spec("torch") is not None
pytestmark_torch = pytest.mark.skipif(not torch_available, reason="requires pawl-jepa training extra")


def _write_png(path: Path, color: tuple[int, int, int]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.new("RGB", (16, 16), color).save(path)


def _split_record(tmp_path: Path, split: str, sample_id: str, variant_name: str, defect_type: str) -> dict:
    original = tmp_path / "images" / sample_id / "original.png"
    variant = tmp_path / "images" / sample_id / variant_name / "variant.png"
    _write_png(original, (0, 180, 80))
    _write_png(variant, (180, 0, 80))
    return {
        "dataset_id": "local_test",
        "split": split,
        "sample_id": sample_id,
        "variant_name": variant_name,
        "defect_type": defect_type,
        "original": {"screenshot_path": str(original)},
        "variant": {"screenshot_path": str(variant)},
        "metric_deltas": {"contrast_issue_delta": 1},
    }


def _write_jsonl(path: Path, records: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("".join(json.dumps(record, sort_keys=True) + "\n" for record in records), encoding="utf-8")


def _label(split: str, sample_id: str, variant_name: str, defect_type: str) -> dict:
    return {
        "label_id": f"local_test__{split}__{sample_id}__{variant_name}",
        "dataset_id": "local_test",
        "split": split,
        "sample_id": sample_id,
        "variant_name": variant_name,
        "defect_type": defect_type,
        "left_item": "original",
        "right_item": "variant",
        "preferred": "left",
        "severity": "medium",
        "defect_tags": [defect_type],
        "quality_tags": ["polished"],
        "confidence": 4,
        "review_status": "confirmed",
        "reviewed_by": "tester",
    }


def _hard_pair_record(tmp_path: Path, sample_id: str, *, left: str = "contrast_bad", right: str = "spacing_bad") -> dict:
    left_path = tmp_path / "hard" / sample_id / left / "screenshot.png"
    right_path = tmp_path / "hard" / sample_id / right / "screenshot.png"
    _write_png(left_path, (30, 120, 200))
    _write_png(right_path, (200, 80, 30))
    left_defect = left.replace("_bad", "")
    right_defect = right.replace("_bad", "")
    label_id = f"hard_pref_v1__{sample_id}__{left}__vs__{right}"
    return {
        "label_id": label_id,
        "pair_id": label_id,
        "pair_kind": "variant_vs_variant",
        "dataset_id": "local_test",
        "split": "hard_pref_v1",
        "sample_id": sample_id,
        "variant_name": f"{left}__vs__{right}",
        "defect_type": f"{left_defect}_vs_{right_defect}",
        "left_item": left,
        "right_item": right,
        "left_variant_name": left,
        "right_variant_name": right,
        "left_defect_type": left_defect,
        "right_defect_type": right_defect,
        "left": {"screenshot_path": str(left_path), "defect_type": left_defect, "variant_name": left},
        "right": {"screenshot_path": str(right_path), "defect_type": right_defect, "variant_name": right},
        "suggested_preferred": "right",
    }


def _hard_label(record: dict, preferred: str) -> dict:
    losing_side = "right" if preferred == "left" else "left"
    return {
        "label_id": record["label_id"],
        "dataset_id": record["dataset_id"],
        "split": "hard_pref_v1",
        "sample_id": record["sample_id"],
        "variant_name": record["variant_name"],
        "defect_type": record["defect_type"],
        "left_item": record["left_item"],
        "right_item": record["right_item"],
        "preferred": preferred,
        "severity": "high",
        "defect_tags": [record[f"{losing_side}_defect_type"]] if preferred in {"left", "right"} else [],
        "quality_tags": ["practical"],
        "confidence": 5,
        "review_status": "confirmed",
        "reviewed_by": "tester",
        "taste_profile_id": "codepawl_taste_v0",
        "suggested_preferred": record.get("suggested_preferred"),
    }


def _splits_dir(tmp_path: Path, records_by_split: dict[str, list[dict]] | None = None) -> Path:
    splits_dir = tmp_path / "splits"
    records_by_split = records_by_split or {
        "train": [_split_record(tmp_path, "train", "sample_a", "spacing_bad", "spacing")],
        "val": [_split_record(tmp_path, "val", "sample_b", "contrast_bad", "contrast")],
        "test": [_split_record(tmp_path, "test", "sample_c", "alignment_bad", "alignment")],
    }
    for split, records in records_by_split.items():
        _write_jsonl(splits_dir / f"{split}.jsonl", records)
    return splits_dir


def test_preferred_item_from_left_right_label() -> None:
    assert preferred_item_from_label({"preferred": "left", "left_item": "original"}) == "original"
    assert preferred_item_from_label({"preferred": "right", "right_item": "variant"}) == "variant"
    assert preferred_item_from_label({"preferred": "tie", "left_item": "original"}) == "tie"
    assert preferred_item_from_label({"preferred": "unclear", "left_item": "variant"}) == "unclear"


def test_prepare_manifest_joins_reviewed_labels(tmp_path: Path) -> None:
    splits_dir = _splits_dir(tmp_path)
    labels_path = tmp_path / "labels.reviewed.jsonl"
    label = {
        "label_id": "local_test__train__sample_a__spacing_bad",
        "dataset_id": "local_test",
        "split": "train",
        "sample_id": "sample_a",
        "variant_name": "spacing_bad",
        "defect_type": "spacing",
        "left_item": "variant",
        "right_item": "original",
        "preferred": "right",
        "severity": "medium",
        "defect_tags": ["spacing"],
        "quality_tags": ["polished"],
        "confidence": 4,
        "review_status": "confirmed",
        "reviewed_by": "tester",
    }
    _write_jsonl(labels_path, [label])

    result = prepare_manifest(
        PrepareConfig(splits_dir=splits_dir, labels_path=labels_path, output_dir=tmp_path / "manifest")
    )

    train = load_manifest_records(result.output_dir, "train")
    val = load_manifest_records(result.output_dir, "val")
    assert train[0]["preferred_item"] == "original"
    assert train[0]["label_source"] == "human_reviewed"
    assert train[0]["label_file"] == str(labels_path.resolve())
    assert train[0]["reviewed_by"] == "tester"
    assert train[0]["metric_deltas"] == {"contrast_issue_delta": 1}
    assert val[0]["preferred_item"] == "original"
    assert val[0]["label_source"] == "synthetic_fallback"
    assert result.summary["record_counts"] == {"test": 1, "train": 1, "val": 1}
    assert result.summary["label_file_count"] == 1
    assert result.summary["label_record_count"] == 1


def test_prepare_manifest_merges_multiple_label_files(tmp_path: Path) -> None:
    splits_dir = _splits_dir(tmp_path)
    train_labels = tmp_path / "train.labels.jsonl"
    val_labels = tmp_path / "val.labels.jsonl"
    test_labels = tmp_path / "test.labels.jsonl"
    _write_jsonl(train_labels, [_label("train", "sample_a", "spacing_bad", "spacing")])
    _write_jsonl(val_labels, [_label("val", "sample_b", "contrast_bad", "contrast")])
    _write_jsonl(test_labels, [_label("test", "sample_c", "alignment_bad", "alignment")])

    result = prepare_manifest(
        PrepareConfig(
            splits_dir=splits_dir,
            labels_paths=(train_labels, val_labels, test_labels),
            output_dir=tmp_path / "manifest",
        )
    )

    assert result.summary["label_file_count"] == 3
    assert result.summary["label_record_count"] == 3
    assert result.summary["reviewed_label_count"] == 3
    assert result.summary["label_coverage_by_split"] == {"test": 1.0, "train": 1.0, "val": 1.0}
    assert result.summary["missing_label_count_by_split"] == {"test": 0, "train": 0, "val": 0}
    assert result.summary["human_reviewed_count_by_split"] == {"test": 1, "train": 1, "val": 1}
    assert result.summary["synthetic_fallback_count_by_split"] == {"test": 0, "train": 0, "val": 0}

    assert load_manifest_records(result.output_dir, "val")[0]["label_source"] == "human_reviewed"
    assert load_manifest_records(result.output_dir, "test")[0]["label_file"] == str(test_labels.resolve())


def test_prepare_manifest_allows_identical_duplicate_label_id(tmp_path: Path) -> None:
    splits_dir = _splits_dir(tmp_path)
    label = _label("train", "sample_a", "spacing_bad", "spacing")
    first_labels = tmp_path / "first.labels.jsonl"
    second_labels = tmp_path / "second.labels.jsonl"
    _write_jsonl(first_labels, [label])
    _write_jsonl(second_labels, [label])

    result = prepare_manifest(
        PrepareConfig(
            splits_dir=splits_dir,
            labels_paths=(first_labels, second_labels),
            output_dir=tmp_path / "manifest",
        )
    )

    train = load_manifest_records(result.output_dir, "train")
    assert train[0]["label_source"] == "human_reviewed"
    assert train[0]["label_file"] == str(first_labels.resolve())
    assert result.summary["label_record_count"] == 2
    assert result.summary["reviewed_label_count"] == 1


def test_prepare_manifest_rejects_conflicting_duplicate_label_id(tmp_path: Path) -> None:
    splits_dir = _splits_dir(tmp_path)
    first_label = _label("train", "sample_a", "spacing_bad", "spacing")
    second_label = {**first_label, "preferred": "right"}
    first_labels = tmp_path / "first.labels.jsonl"
    second_labels = tmp_path / "second.labels.jsonl"
    _write_jsonl(first_labels, [first_label])
    _write_jsonl(second_labels, [second_label])

    with pytest.raises(ValueError, match="conflicting duplicate label_id"):
        prepare_manifest(
            PrepareConfig(
                splits_dir=splits_dir,
                labels_paths=(first_labels, second_labels),
                output_dir=tmp_path / "manifest",
            )
        )


def test_prepare_cli_writes_manifest_files(tmp_path: Path) -> None:
    splits_dir = _splits_dir(tmp_path)
    output_dir = tmp_path / "manifest"

    result = prepare_main([str(splits_dir), "--out", str(output_dir)])

    assert result == 0
    assert (output_dir / "manifest.json").is_file()
    assert (output_dir / "train.jsonl").is_file()
    assert (output_dir / "val.jsonl").is_file()
    assert (output_dir / "test.jsonl").is_file()


def test_prepare_cli_accepts_single_label_argument(tmp_path: Path) -> None:
    splits_dir = _splits_dir(tmp_path)
    labels_path = tmp_path / "labels.reviewed.jsonl"
    output_dir = tmp_path / "manifest"
    _write_jsonl(labels_path, [_label("train", "sample_a", "spacing_bad", "spacing")])

    result = prepare_main([str(splits_dir), "--labels", str(labels_path), "--out", str(output_dir)])

    assert result == 0
    train = load_manifest_records(output_dir, "train")
    assert train[0]["label_source"] == "human_reviewed"


def test_prepare_hard_manifest_assigns_splits_and_fields(tmp_path: Path) -> None:
    base_splits = _splits_dir(
        tmp_path,
        {
            "train": [_split_record(tmp_path, "train", "sample_a", "spacing_bad", "spacing")],
            "val": [_split_record(tmp_path, "val", "sample_b", "contrast_bad", "contrast")],
            "test": [_split_record(tmp_path, "test", "sample_c", "alignment_bad", "alignment")],
        },
    )
    hard_dir = tmp_path / "hard_pref_v1"
    records = [
        _hard_pair_record(tmp_path, "sample_a"),
        _hard_pair_record(tmp_path, "sample_b", left="alignment_bad", right="hierarchy_bad"),
        _hard_pair_record(tmp_path, "sample_c", left="hierarchy_bad", right="spacing_bad"),
    ]
    _write_jsonl(hard_dir / "hard_pairs.jsonl", records)
    labels_path = tmp_path / "hard.labels.jsonl"
    _write_jsonl(labels_path, [_hard_label(records[0], "left"), _hard_label(records[1], "right")])

    result = prepare_hard_manifest(
        PrepareHardConfig(
            hard_pairs_dir=hard_dir,
            labels_path=labels_path,
            base_splits_dir=base_splits,
            output_dir=tmp_path / "hard_manifest",
        )
    )

    train = load_manifest_records(result.output_dir, "train")
    val = load_manifest_records(result.output_dir, "val")
    test = load_manifest_records(result.output_dir, "test")
    assert len(train) == 1
    assert len(val) == 1
    assert test == []
    assert train[0]["pair_kind"] == "variant_vs_variant"
    assert train[0]["preferred_item"] == "left"
    assert train[0]["nonpreferred_side"] == "right"
    assert train[0]["defect_type"] == "spacing"
    assert train[0]["left_screenshot_path"].endswith("contrast_bad/screenshot.png")
    assert train[0]["right_screenshot_path"].endswith("spacing_bad/screenshot.png")
    assert train[0]["taste_profile_id"] == "codepawl_taste_v0"
    assert val[0]["split"] == "val"
    assert result.summary["record_counts"] == {"test": 0, "train": 1, "val": 1}
    assert result.summary["preferred_counts_by_split"]["train"] == {"left": 1}
    assert result.summary["pair_kind_counts"] == {"variant_vs_variant": 2}


def test_prepare_hard_manifest_accepts_auto_labeled_labels(tmp_path: Path) -> None:
    base_splits = _splits_dir(
        tmp_path,
        {
            "train": [_split_record(tmp_path, "train", "sample_a", "spacing_bad", "spacing")],
            "val": [_split_record(tmp_path, "val", "sample_b", "contrast_bad", "contrast")],
            "test": [_split_record(tmp_path, "test", "sample_c", "alignment_bad", "alignment")],
        },
    )
    hard_dir = tmp_path / "hard_pref_v2"
    records = [_hard_pair_record(tmp_path, "sample_a"), _hard_pair_record(tmp_path, "sample_b")]
    _write_jsonl(hard_dir / "hard_pairs.jsonl", records)
    labels = []
    for record in records:
        label = _hard_label(record, "left")
        label.update(
            {
                "review_status": "auto_labeled",
                "label_source": "auto_labeled",
                "reviewed_by": None,
                "reviewed_at": None,
                "auto_label": True,
                "auto_label_method": "codepawl_taste_v0",
                "suggestion_confidence": 5,
                "taste_decision_factors": [{"factor": "contrast"}],
            }
        )
        labels.append(label)
    labels_path = tmp_path / "hard.labels.auto.jsonl"
    _write_jsonl(labels_path, labels)

    result = prepare_hard_manifest(
        PrepareHardConfig(
            hard_pairs_dir=hard_dir,
            labels_path=labels_path,
            base_splits_dir=base_splits,
            output_dir=tmp_path / "hard_manifest",
        )
    )

    train = load_manifest_records(result.output_dir, "train")
    val = load_manifest_records(result.output_dir, "val")
    assert train[0]["label_source"] == "auto_labeled"
    assert train[0]["auto_label"] is True
    assert train[0]["auto_label_method"] == "codepawl_taste_v0"
    assert train[0]["reviewed_by"] is None
    assert val[0]["label_source"] == "auto_labeled"
    assert result.summary["human_reviewed_count_by_split"] == {"test": 0, "train": 0, "val": 0}
    assert result.summary["auto_labeled_count_by_split"] == {"test": 0, "train": 1, "val": 1}
    assert result.summary["label_source_counts"] == {"auto_labeled": 2}


def test_prepare_hard_cli_writes_manifest(tmp_path: Path) -> None:
    base_splits = _splits_dir(
        tmp_path,
        {
            "train": [
                _split_record(tmp_path, "train", "sample_a", "spacing_bad", "spacing"),
                _split_record(tmp_path, "train", "sample_b", "contrast_bad", "contrast"),
            ],
            "val": [_split_record(tmp_path, "val", "sample_c", "alignment_bad", "alignment")],
            "test": [_split_record(tmp_path, "test", "sample_d", "hierarchy_bad", "hierarchy")],
        },
    )
    hard_dir = tmp_path / "hard_pref_v1"
    record = _hard_pair_record(tmp_path, "sample_a")
    _write_jsonl(hard_dir / "hard_pairs.jsonl", [record])
    labels_path = tmp_path / "hard.labels.jsonl"
    _write_jsonl(labels_path, [_hard_label(record, "left")])
    out = tmp_path / "hard_manifest"

    result = prepare_hard_main(
        [str(hard_dir), "--labels", str(labels_path), "--base-splits", str(base_splits), "--out", str(out)]
    )

    assert result == 0
    assert (out / "manifest.json").is_file()
    assert load_manifest_records(out, "train")[0]["pair_kind"] == "variant_vs_variant"


@pytestmark_torch
def test_model_forward_shapes() -> None:
    import torch

    from pawl_jepa.model import ModelConfig, build_model

    model = build_model(ModelConfig(image_size=32, embedding_dim=16, hidden_dim=32))
    outputs = model(torch.randn(2, 3, 32, 32), torch.randn(2, 3, 32, 32))

    assert outputs["original_embedding"].shape == (2, 16)
    assert outputs["predicted_original"].shape == (2, 16)
    assert outputs["defect_logits"].shape == (2, 4)


@pytestmark_torch
def test_loss_calculation() -> None:
    import torch

    from pawl_jepa.losses import LossWeights, compute_losses

    outputs = {
        "predicted_original": torch.zeros(2, 4),
        "original_embedding": torch.ones(2, 4),
        "original_score": torch.tensor([1.0, 0.0]),
        "variant_score": torch.tensor([0.0, 1.0]),
        "defect_logits": torch.randn(2, 4),
    }
    batch = {
        "preference_target": torch.tensor([1.0, -1.0]),
        "pairwise_mask": torch.tensor([1.0, 1.0]),
        "defect_target": torch.tensor([0, 1]),
    }

    losses = compute_losses(outputs, batch, LossWeights())

    assert float(losses["total_loss"]) > 0
    assert float(losses["latent_loss"]) > 0


def test_eval_always_original_baseline_and_warning() -> None:
    from pawl_jepa.evaluate import summarize_scores

    scores = [
        {
            "label_id": "a",
            "preferred_item": "original",
            "pairwise_correct": True,
            "defect_type": "spacing",
            "defect_prediction": "spacing",
            "cosine_similarity": 0.9,
            "latent_loss": 0.2,
            "label_source": "human_reviewed",
            "metric_deltas": {"changed_pixel_ratio": 0.2},
            "_original_embedding": [1.0, 0.0],
            "_variant_embedding": [1.0, 0.0],
            "sample_id": "a",
        },
        {
            "label_id": "b",
            "preferred_item": "original",
            "pairwise_correct": False,
            "defect_type": "contrast",
            "defect_prediction": "spacing",
            "cosine_similarity": 0.7,
            "latent_loss": 0.4,
            "label_source": "human_reviewed",
            "metric_deltas": {"contrast_issue_delta": 1},
            "_original_embedding": [0.0, 1.0],
            "_variant_embedding": [0.0, 1.0],
            "sample_id": "b",
        },
    ]

    summary = summarize_scores(scores, [{"label_source": "human_reviewed"} for _ in scores])

    assert summary["always_prefer_original_accuracy"] == 1.0
    assert summary["pairwise_good_vs_bad_accuracy"] == 0.5
    assert summary["pairwise_lift_over_always_original"] == -0.5
    assert summary["metric_heuristic_accuracy"] == 1.0
    assert "All labels prefer original" in summary["warnings"][0]


def test_eval_defect_majority_and_confusion_metrics() -> None:
    from pawl_jepa.evaluate import summarize_scores

    scores = [
        {
            "label_id": "a",
            "preferred_item": "original",
            "pairwise_correct": True,
            "defect_type": "spacing",
            "defect_prediction": "spacing",
            "cosine_similarity": 0.9,
            "latent_loss": 0.2,
            "label_source": "human_reviewed",
            "metric_deltas": {},
            "_original_embedding": [1.0, 0.0],
            "_variant_embedding": [1.0, 0.0],
            "sample_id": "a",
        },
        {
            "label_id": "b",
            "preferred_item": "variant",
            "pairwise_correct": False,
            "defect_type": "spacing",
            "defect_prediction": "contrast",
            "cosine_similarity": 0.7,
            "latent_loss": 0.4,
            "label_source": "human_reviewed",
            "metric_deltas": {},
            "_original_embedding": [0.0, 1.0],
            "_variant_embedding": [0.0, 1.0],
            "sample_id": "b",
        },
        {
            "label_id": "c",
            "preferred_item": "original",
            "pairwise_correct": True,
            "defect_type": "contrast",
            "defect_prediction": "contrast",
            "cosine_similarity": 0.8,
            "latent_loss": 0.3,
            "label_source": "human_reviewed",
            "metric_deltas": {},
            "_original_embedding": [1.0, 1.0],
            "_variant_embedding": [1.0, 1.0],
            "sample_id": "c",
        },
    ]

    summary = summarize_scores(scores, [{"label_source": "human_reviewed"} for _ in scores])

    assert summary["defect_classification_accuracy"] == pytest.approx(2 / 3)
    assert summary["defect_majority_class_accuracy"] == pytest.approx(2 / 3)
    assert summary["defect_lift_over_majority"] == pytest.approx(0.0)
    assert summary["defect_confusion_matrix"]["spacing"]["spacing"] == 1
    assert summary["defect_confusion_matrix"]["spacing"]["contrast"] == 1
    assert summary["defect_per_class_metrics"]["spacing"]["recall"] == pytest.approx(0.5)
    assert summary["defect_per_class_metrics"]["contrast"]["precision"] == pytest.approx(0.5)


def test_eval_hard_pair_baselines() -> None:
    from pawl_jepa.evaluate import summarize_scores

    scores = [
        {
            "label_id": "a",
            "pair_kind": "variant_vs_variant",
            "preferred_item": "left",
            "pairwise_correct": True,
            "defect_type": "spacing",
            "defect_prediction": "spacing",
            "suggested_preferred": "left",
            "cosine_similarity": 0.9,
            "latent_loss": 0.2,
            "label_source": "human_reviewed",
            "_original_embedding": [1.0, 0.0],
            "_variant_embedding": [1.0, 0.0],
            "sample_id": "a",
        },
        {
            "label_id": "b",
            "pair_kind": "variant_vs_variant",
            "preferred_item": "right",
            "pairwise_correct": False,
            "defect_type": "alignment",
            "defect_prediction": "spacing",
            "suggested_preferred": "left",
            "cosine_similarity": 0.7,
            "latent_loss": 0.4,
            "label_source": "human_reviewed",
            "_original_embedding": [0.0, 1.0],
            "_variant_embedding": [0.0, 1.0],
            "sample_id": "b",
        },
    ]
    records = [
        {"pair_kind": "variant_vs_variant", "preferred": "left", "label_source": "human_reviewed"},
        {"pair_kind": "variant_vs_variant", "preferred": "right", "label_source": "human_reviewed"},
    ]

    summary = summarize_scores(scores, records)

    assert summary["pairwise_preference_accuracy"] == 0.5
    assert summary["always_left_accuracy"] == 0.5
    assert summary["always_right_accuracy"] == 0.5
    assert summary["suggestion_baseline_accuracy"] == 0.5
    assert summary["pairwise_lift_over_best_constant"] == 0.0
    assert summary["defect_accuracy_on_losing_side"] == 0.5
    assert "always_prefer_original_accuracy" not in summary


def test_eval_summarizes_auto_labeled_hard_pairs_separately() -> None:
    from pawl_jepa.evaluate import summarize_scores

    scores = [
        {
            "label_id": "a",
            "pair_kind": "variant_vs_variant",
            "preferred_item": "left",
            "pairwise_correct": True,
            "defect_type": "spacing",
            "defect_prediction": "spacing",
            "suggested_preferred": "left",
            "cosine_similarity": 0.9,
            "latent_loss": 0.2,
            "label_source": "auto_labeled",
            "_original_embedding": [1.0, 0.0],
            "_variant_embedding": [1.0, 0.0],
            "sample_id": "a",
        }
    ]
    records = [{"pair_kind": "variant_vs_variant", "preferred": "left", "label_source": "auto_labeled"}]

    summary = summarize_scores(scores, records)

    assert summary["label_coverage_used"] == 0
    assert summary["auto_labeled_count"] == 1
    assert summary["label_source_counts"] == {"auto_labeled": 1}
    assert any("weak labels" in warning for warning in summary["warnings"])


def _tiny_manifest(tmp_path: Path) -> Path:
    records_by_split = {
        "train": [
            _split_record(tmp_path, "train", "sample_a", "spacing_bad", "spacing"),
            _split_record(tmp_path, "train", "sample_b", "contrast_bad", "contrast"),
            _split_record(tmp_path, "train", "sample_c", "alignment_bad", "alignment"),
            _split_record(tmp_path, "train", "sample_d", "hierarchy_bad", "hierarchy"),
        ],
        "val": [_split_record(tmp_path, "val", "sample_e", "spacing_bad", "spacing")],
        "test": [_split_record(tmp_path, "test", "sample_f", "contrast_bad", "contrast")],
    }
    splits_dir = _splits_dir(tmp_path, records_by_split)
    return prepare_manifest(PrepareConfig(splits_dir=splits_dir, output_dir=tmp_path / "manifest")).output_dir


def _tiny_manifest_with_eval_labels(tmp_path: Path) -> Path:
    records_by_split = {
        "train": [
            _split_record(tmp_path, "train", "sample_a", "spacing_bad", "spacing"),
            _split_record(tmp_path, "train", "sample_b", "contrast_bad", "contrast"),
            _split_record(tmp_path, "train", "sample_c", "alignment_bad", "alignment"),
            _split_record(tmp_path, "train", "sample_d", "hierarchy_bad", "hierarchy"),
        ],
        "val": [_split_record(tmp_path, "val", "sample_e", "spacing_bad", "spacing")],
        "test": [_split_record(tmp_path, "test", "sample_f", "contrast_bad", "contrast")],
    }
    splits_dir = _splits_dir(tmp_path, records_by_split)
    val_labels = tmp_path / "val.labels.jsonl"
    test_labels = tmp_path / "test.labels.jsonl"
    _write_jsonl(val_labels, [_label("val", "sample_e", "spacing_bad", "spacing")])
    _write_jsonl(test_labels, [_label("test", "sample_f", "contrast_bad", "contrast")])
    return prepare_manifest(
        PrepareConfig(
            splits_dir=splits_dir,
            labels_paths=(val_labels, test_labels),
            output_dir=tmp_path / "manifest",
        )
    ).output_dir


def _tiny_hard_manifest(tmp_path: Path) -> Path:
    base_splits = _splits_dir(
        tmp_path,
        {
            "train": [
                _split_record(tmp_path, "train", "sample_a", "spacing_bad", "spacing"),
                _split_record(tmp_path, "train", "sample_b", "contrast_bad", "contrast"),
            ],
            "val": [_split_record(tmp_path, "val", "sample_c", "alignment_bad", "alignment")],
            "test": [_split_record(tmp_path, "test", "sample_d", "hierarchy_bad", "hierarchy")],
        },
    )
    hard_dir = tmp_path / "hard_pref_v1"
    records = [
        _hard_pair_record(tmp_path, "sample_a"),
        _hard_pair_record(tmp_path, "sample_b", left="alignment_bad", right="hierarchy_bad"),
        _hard_pair_record(tmp_path, "sample_c", left="contrast_bad", right="spacing_bad"),
        _hard_pair_record(tmp_path, "sample_d", left="hierarchy_bad", right="spacing_bad"),
    ]
    _write_jsonl(hard_dir / "hard_pairs.jsonl", records)
    labels_path = tmp_path / "hard.labels.jsonl"
    _write_jsonl(
        labels_path,
        [
            _hard_label(records[0], "left"),
            _hard_label(records[1], "right"),
            _hard_label(records[2], "left"),
            _hard_label(records[3], "right"),
        ],
    )
    return prepare_hard_manifest(
        PrepareHardConfig(
            hard_pairs_dir=hard_dir,
            labels_path=labels_path,
            base_splits_dir=base_splits,
            output_dir=tmp_path / "hard_manifest",
        )
    ).output_dir


@pytestmark_torch
def test_dataset_image_loading_with_tiny_images(tmp_path: Path) -> None:
    from pawl_jepa.data import PawlJepaDataset

    dataset = PawlJepaDataset(_tiny_manifest(tmp_path), split="train", image_size=32)
    item = dataset[0]

    assert item["original"].shape == (3, 32, 32)
    assert item["variant"].shape == (3, 32, 32)
    assert item["pairwise_mask"] == 1.0


@pytestmark_torch
def test_hard_dataset_maps_preferred_and_skips_tie(tmp_path: Path) -> None:
    from pawl_jepa.data import PawlJepaDataset

    base_splits = _splits_dir(
        tmp_path,
        {
            "train": [
                _split_record(tmp_path, "train", "sample_a", "spacing_bad", "spacing"),
                _split_record(tmp_path, "train", "sample_b", "contrast_bad", "contrast"),
            ],
            "val": [_split_record(tmp_path, "val", "sample_c", "alignment_bad", "alignment")],
            "test": [_split_record(tmp_path, "test", "sample_d", "hierarchy_bad", "hierarchy")],
        },
    )
    hard_dir = tmp_path / "hard_pref_v1"
    left_record = _hard_pair_record(tmp_path, "sample_a")
    tie_record = _hard_pair_record(tmp_path, "sample_b")
    _write_jsonl(hard_dir / "hard_pairs.jsonl", [left_record, tie_record])
    labels_path = tmp_path / "hard.labels.jsonl"
    _write_jsonl(labels_path, [_hard_label(left_record, "left"), _hard_label(tie_record, "tie")])
    manifest = prepare_hard_manifest(
        PrepareHardConfig(
            hard_pairs_dir=hard_dir,
            labels_path=labels_path,
            base_splits_dir=base_splits,
            output_dir=tmp_path / "hard_manifest",
        )
    ).output_dir

    items = PawlJepaDataset(manifest, split="train", image_size=32)

    assert items[0]["pairwise_mask"] == 1.0
    assert items[0]["preference_target"] == 1.0
    assert items[0]["defect_target"] >= 0
    assert items[1]["pairwise_mask"] == 0.0
    assert items[1]["defect_target"] == -1


@pytestmark_torch
def test_cpu_train_and_eval_smoke(tmp_path: Path) -> None:
    from pawl_jepa.evaluate import EvalConfig, evaluate_micro_model
    from pawl_jepa.train import TrainConfig, train_micro_model

    manifest_dir = _tiny_manifest_with_eval_labels(tmp_path)
    run = train_micro_model(
        TrainConfig(
            manifest_dir=manifest_dir,
            output_dir=tmp_path / "run",
            epochs=1,
            batch_size=2,
            image_size=32,
            embedding_dim=8,
            hidden_dim=16,
            device="cpu",
        )
    )
    eval_result = evaluate_micro_model(
        EvalConfig(
            run_dir=run.output_dir,
            manifest_dir=manifest_dir,
            output_dir=tmp_path / "eval",
            batch_size=2,
            device="cpu",
        )
    )

    assert run.checkpoint_path.is_file()
    assert run.summary["last_epoch_total_loss"] is not None
    assert eval_result.summary_path.is_file()
    assert eval_result.pair_scores_path.is_file()
    assert eval_result.summary["splits"]["val"]["label_coverage_used"] == 1.0
    assert eval_result.summary["splits"]["test"]["label_coverage_used"] == 1.0
    assert (
        eval_result.summary["splits"]["val"]["pairwise_good_vs_bad_accuracy_by_label_source"][
            "human_reviewed"
        ]
        is not None
    )


@pytestmark_torch
def test_hard_pair_train_and_eval_smoke(tmp_path: Path) -> None:
    from pawl_jepa.evaluate import EvalConfig, evaluate_micro_model
    from pawl_jepa.train import TrainConfig, train_micro_model

    manifest_dir = _tiny_hard_manifest(tmp_path)
    run = train_micro_model(
        TrainConfig(
            manifest_dir=manifest_dir,
            output_dir=tmp_path / "hard_run",
            epochs=1,
            batch_size=2,
            image_size=32,
            embedding_dim=8,
            hidden_dim=16,
            device="cpu",
        )
    )
    eval_result = evaluate_micro_model(
        EvalConfig(
            run_dir=run.output_dir,
            manifest_dir=manifest_dir,
            output_dir=tmp_path / "hard_eval",
            batch_size=2,
            device="cpu",
        )
    )

    val_summary = eval_result.summary["splits"]["val"]
    assert "pairwise_preference_accuracy" in val_summary
    assert "always_left_accuracy" in val_summary
    assert "always_right_accuracy" in val_summary
    assert "random_preference_accuracy" in val_summary
    assert "suggestion_baseline_accuracy" in val_summary
    assert "pairwise_lift_over_best_constant" in val_summary
    assert "defect_accuracy_on_losing_side" in val_summary
    assert "always_prefer_original_accuracy" not in val_summary


@pytestmark_torch
def test_seed_sweep_with_tiny_manifest(tmp_path: Path) -> None:
    from pawl_jepa.sweep import SweepConfig, run_seed_sweep

    manifest_dir = _tiny_manifest_with_eval_labels(tmp_path)
    result = run_seed_sweep(
        SweepConfig(
            manifest_dir=manifest_dir,
            output_dir=tmp_path / "sweep",
            seeds=(1, 2),
            epochs=1,
            batch_size=2,
            image_size=32,
            embedding_dim=8,
            hidden_dim=16,
            device="cpu",
        )
    )

    assert result.summary_path.is_file()
    assert result.summary["seeds"] == [1, 2]
    assert (result.output_dir / "runs" / "seed_1" / "run" / "checkpoints" / "last.pt").is_file()
    assert (result.output_dir / "runs" / "seed_2" / "eval" / "eval_summary.json").is_file()
    assert "pairwise_good_vs_bad_accuracy" in result.summary["splits"]["val"]
    assert result.summary["best_seed_by_metric"]["val"]["retrieval_top1"] in {1, 2}


def test_seed_sweep_aggregates_hard_pair_metrics_and_warnings() -> None:
    from pawl_jepa.sweep import aggregate_splits, aggregate_warnings

    run_summaries = [
        {
            "seed": 1,
            "splits": {
                "val": {
                    "pairwise_preference_accuracy": 0.5,
                    "pairwise_lift_over_best_constant": 0.0,
                    "always_left_accuracy": 0.5,
                    "always_right_accuracy": 0.5,
                    "random_preference_accuracy": 0.5,
                    "suggestion_baseline_accuracy": 1.0,
                    "defect_accuracy_on_losing_side": 0.4,
                    "defect_lift_over_majority": -0.1,
                    "defect_majority_class_accuracy": 0.5,
                    "average_latent_prediction_loss": 0.3,
                }
            },
        },
        {
            "seed": 2,
            "splits": {
                "val": {
                    "pairwise_preference_accuracy": 0.7,
                    "pairwise_lift_over_best_constant": 0.0,
                    "always_left_accuracy": 0.5,
                    "always_right_accuracy": 0.5,
                    "random_preference_accuracy": 0.5,
                    "suggestion_baseline_accuracy": 1.0,
                    "defect_accuracy_on_losing_side": 0.5,
                    "defect_lift_over_majority": 0.0,
                    "defect_majority_class_accuracy": 0.5,
                    "average_latent_prediction_loss": 0.1,
                }
            },
        },
    ]

    aggregates = aggregate_splits(run_summaries)

    val = aggregates["val"]
    assert val["pairwise_preference_accuracy"]["mean"] == pytest.approx(0.6)
    assert val["pairwise_lift_over_best_constant"]["mean"] == pytest.approx(0.0)
    assert val["always_left_accuracy"]["mean"] == pytest.approx(0.5)
    assert val["always_right_accuracy"]["mean"] == pytest.approx(0.5)
    assert val["random_preference_accuracy"]["mean"] == pytest.approx(0.5)
    assert val["suggestion_baseline_accuracy"]["mean"] == pytest.approx(1.0)
    assert val["defect_accuracy_on_losing_side"]["mean"] == pytest.approx(0.45)
    assert val["defect_lift_over_majority"]["mean"] == pytest.approx(-0.05)
    assert val["defect_majority_class_accuracy"]["mean"] == pytest.approx(0.5)
    assert val["average_latent_prediction_loss"]["mean"] == pytest.approx(0.2)

    warnings = aggregate_warnings(aggregates)
    assert any("suggestion_baseline_accuracy is 1.0" in warning for warning in warnings)
    assert any("constant side baseline" in warning for warning in warnings)
    assert any("majority class baseline" in warning for warning in warnings)


def test_seed_sweep_aggregates_original_variant_metrics_compatibly() -> None:
    from pawl_jepa.sweep import aggregate_splits

    aggregates = aggregate_splits(
        [
            {
                "seed": 1,
                "splits": {
                    "val": {
                        "pairwise_good_vs_bad_accuracy": 0.25,
                        "pairwise_lift_over_always_original": -0.75,
                        "always_prefer_original_accuracy": 1.0,
                        "metric_heuristic_accuracy": 0.5,
                        "defect_classification_accuracy": 0.25,
                        "defect_lift_over_majority": -0.5,
                        "defect_majority_class_accuracy": 0.75,
                        "retrieval_top1": 0.25,
                        "retrieval_top5": 1.0,
                        "average_latent_prediction_loss": 0.4,
                    }
                },
            }
        ]
    )

    val = aggregates["val"]
    assert val["pairwise_good_vs_bad_accuracy"]["mean"] == pytest.approx(0.25)
    assert val["pairwise_lift_over_always_original"]["mean"] == pytest.approx(-0.75)
    assert val["retrieval_top1"]["mean"] == pytest.approx(0.25)
    assert val["pairwise_preference_accuracy"] == {"mean": None, "std": None}


def test_report_generation(tmp_path: Path) -> None:
    from pawl_jepa.manifest import write_json
    from pawl_jepa.report import ReportConfig, export_experiment_report

    manifest_dir = tmp_path / "manifest"
    eval_dir = tmp_path / "eval"
    run_dir = tmp_path / "run"
    manifest_dir.mkdir()
    eval_dir.mkdir()
    run_dir.mkdir()
    write_json(
        manifest_dir / "manifest.json",
        {
            "record_counts": {"train": 4, "val": 1, "test": 1},
            "total_records": 6,
            "defect_types": ["spacing", "contrast"],
            "label_file_count": 2,
            "label_record_count": 2,
            "preferred_item_counts": {"original": 2},
            "label_coverage_by_split": {"train": 0.0, "val": 1.0, "test": 1.0},
            "human_reviewed_count_by_split": {"train": 0, "val": 1, "test": 1},
            "synthetic_fallback_count_by_split": {"train": 4, "val": 0, "test": 0},
        },
    )
    write_json(run_dir / "train_summary.json", {"epochs": 1, "last_epoch_total_loss": 0.5})
    write_json(
        eval_dir / "eval_summary.json",
        {
            "run_dir": str(run_dir),
            "splits": {
                "val": {
                    "pairwise_good_vs_bad_accuracy": 1.0,
                    "always_prefer_original_accuracy": 1.0,
                    "pairwise_lift_over_always_original": 0.0,
                    "metric_heuristic_accuracy": 1.0,
                    "defect_classification_accuracy": 0.5,
                    "defect_majority_class_accuracy": 1.0,
                    "defect_lift_over_majority": -0.5,
                    "retrieval_top1": 1.0,
                    "average_latent_prediction_loss": 0.2,
                    "warnings": [
                        "All labels prefer original; pairwise accuracy is not a discriminative metric."
                    ],
                }
            },
        },
    )

    result = export_experiment_report(
        ReportConfig(eval_dir=eval_dir, manifest_dir=manifest_dir, output_dir=tmp_path / "report")
    )

    report = result.report_path.read_text(encoding="utf-8")
    assert result.summary_path.is_file()
    assert "Pawl-JEPA v0 Experiment Report" in report
    assert "Always-original baseline" in report
    assert result.summary["label_coverage"] == {"train": 0.0, "val": 1.0, "test": 1.0}


def test_report_generation_supports_hard_pair_eval_and_sweep(tmp_path: Path) -> None:
    from pawl_jepa.manifest import write_json
    from pawl_jepa.report import ReportConfig, export_experiment_report

    manifest_dir = tmp_path / "hard_manifest"
    eval_dir = tmp_path / "hard_eval"
    sweep_dir = tmp_path / "hard_sweep"
    manifest_dir.mkdir()
    eval_dir.mkdir()
    sweep_dir.mkdir()
    write_json(
        manifest_dir / "manifest.json",
        {
            "record_counts": {"train": 144, "val": 18, "test": 18},
            "total_records": 180,
            "defect_types": ["alignment", "contrast", "hierarchy", "spacing"],
            "label_file_count": 1,
            "label_record_count": 180,
            "preferred_item_counts": {"left": 95, "right": 85},
            "preferred_counts": {"left": 95, "right": 85},
            "label_coverage_by_split": {"train": 1.0, "val": 1.0, "test": 1.0},
            "human_reviewed_count_by_split": {"train": 0, "val": 0, "test": 0},
            "auto_labeled_count_by_split": {"train": 144, "val": 18, "test": 18},
            "synthetic_fallback_count_by_split": {"train": 0, "val": 0, "test": 0},
            "label_source_counts": {"auto_labeled": 180},
        },
    )
    write_json(
        eval_dir / "eval_summary.json",
        {
            "splits": {
                "val": {
                    "pairwise_preference_accuracy": 0.5,
                    "always_left_accuracy": 0.55,
                    "always_right_accuracy": 0.45,
                    "random_preference_accuracy": 0.5,
                    "suggestion_baseline_accuracy": 1.0,
                    "pairwise_lift_over_best_constant": -0.05,
                    "defect_accuracy_on_losing_side": 0.4,
                    "defect_majority_class_accuracy": 0.6,
                    "defect_lift_over_majority": -0.2,
                    "average_latent_prediction_loss": 0.2,
                    "auto_labeled_count": 18,
                    "label_source_counts": {"auto_labeled": 18},
                    "warnings": [],
                }
            },
        },
    )
    write_json(
        sweep_dir / "sweep_summary.json",
        {
            "splits": {
                "val": {
                    "pairwise_preference_accuracy": {"mean": 0.5, "std": 0.1},
                    "pairwise_lift_over_best_constant": {"mean": -0.05, "std": 0.0},
                    "always_left_accuracy": {"mean": 0.55, "std": 0.0},
                    "always_right_accuracy": {"mean": 0.45, "std": 0.0},
                    "random_preference_accuracy": {"mean": 0.5, "std": 0.0},
                    "suggestion_baseline_accuracy": {"mean": 1.0, "std": 0.0},
                    "defect_accuracy_on_losing_side": {"mean": 0.4, "std": 0.0},
                    "defect_majority_class_accuracy": {"mean": 0.6, "std": 0.0},
                    "defect_lift_over_majority": {"mean": -0.2, "std": 0.0},
                    "average_latent_prediction_loss": {"mean": 0.2, "std": 0.01},
                }
            },
            "warnings": ["val: suggestion_baseline_accuracy is 1.0; labels may be suggestion-derived."],
        },
    )

    result = export_experiment_report(
        ReportConfig(
            eval_dir=eval_dir,
            manifest_dir=manifest_dir,
            output_dir=tmp_path / "hard_report",
            sweep_summary=sweep_dir / "sweep_summary.json",
        )
    )

    report = result.report_path.read_text(encoding="utf-8")
    assert "Pairwise preference accuracy" in report
    assert "Pairwise lift over best constant" in report
    assert "Defect majority baseline" in report
    assert "Sweep Summary" in report
    assert "suggestion_baseline_accuracy" in report
    assert "Auto labeled counts" in report
    assert "weak machine/rule labels" in report
    assert "Labels may be reviewed from taste-profile suggestions" in report
    assert "All current local_v1 labels prefer the original UI" not in report
    assert "mean 0.5000, std 0.1000" in report
    assert "themajority" not in report
    assert "Add generated UI candidate pairs" in report
    assert result.summary["sweep_summary"]["splits"]["val"]["pairwise_preference_accuracy"]["mean"] == 0.5
