"""Evaluation runner for Pawl-JEPA microtraining."""

from __future__ import annotations

import json
import random
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from pawl_jepa.data import DEFECT_TYPES, PawlJepaDataset, collate_batch
from pawl_jepa.losses import LossWeights, compute_losses
from pawl_jepa.manifest import load_manifest_records, write_json, write_jsonl
from pawl_jepa.model import ModelConfig, build_model
from pawl_jepa.torch_utils import import_torch, resolve_device


@dataclass(frozen=True)
class EvalConfig:
    run_dir: Path
    manifest_dir: Path
    output_dir: Path
    batch_size: int = 8
    device: str = "auto"
    baseline_summary: Path | None = None
    random_seed: int = 42


@dataclass(frozen=True)
class EvalResult:
    output_dir: Path
    summary_path: Path
    pair_scores_path: Path
    summary: dict[str, Any]


def evaluate_micro_model(config: EvalConfig) -> EvalResult:
    torch = import_torch()
    output_dir = config.output_dir.expanduser().resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    run_dir = config.run_dir.expanduser().resolve()
    checkpoint_path = run_dir / "checkpoints" / "last.pt"
    if not checkpoint_path.is_file():
        raise ValueError(f"checkpoint is missing: {checkpoint_path}")
    checkpoint = torch.load(checkpoint_path, map_location="cpu")
    model_config = ModelConfig(**checkpoint["model_config"])
    train_config = checkpoint.get("train_config", {})
    image_size = int(train_config.get("image_size", model_config.image_size))
    device = resolve_device(config.device)
    model = build_model(model_config).to(device)
    model.load_state_dict(checkpoint["model_state_dict"])
    model.eval()

    weights = LossWeights(
        float(train_config.get("latent_weight", 1.0)),
        float(train_config.get("preference_weight", 0.25)),
        float(train_config.get("defect_weight", 0.1)),
    )
    pair_scores: list[dict[str, Any]] = []
    split_summaries: dict[str, Any] = {}
    for split in ("val", "test"):
        dataset = PawlJepaDataset(config.manifest_dir, split=split, image_size=image_size)
        loader = torch.utils.data.DataLoader(
            dataset,
            batch_size=config.batch_size,
            shuffle=False,
            collate_fn=collate_batch,
        )
        split_scores = score_split(torch, model, loader, device, weights)
        pair_scores.extend(split_scores)
        split_summaries[split] = summarize_scores(
            split_scores,
            load_manifest_records(config.manifest_dir, split),
            random_seed=config.random_seed,
        )

    summary = {
        "run_dir": str(run_dir),
        "manifest_dir": str(config.manifest_dir.expanduser().resolve()),
        "splits": split_summaries,
    }
    if config.baseline_summary is not None:
        baseline_path = config.baseline_summary.expanduser().resolve()
        summary["baseline_summary"] = json.loads(baseline_path.read_text(encoding="utf-8"))

    summary_path = output_dir / "eval_summary.json"
    pair_scores_path = output_dir / "pair_scores.jsonl"
    write_json(summary_path, summary)
    write_jsonl(pair_scores_path, [public_score(score) for score in pair_scores])
    return EvalResult(output_dir, summary_path, pair_scores_path, summary)


def score_split(torch, model, loader, device, weights: LossWeights) -> list[dict[str, Any]]:
    scores: list[dict[str, Any]] = []
    with torch.no_grad():
        for batch in loader:
            original = batch["original"].to(device)
            variant = batch["variant"].to(device)
            outputs = model(original, variant)
            losses = compute_losses(outputs, batch, weights)
            cosines = torch.nn.functional.cosine_similarity(
                outputs["predicted_original"], outputs["original_embedding"], dim=1
            )
            defect_predictions = None
            if outputs.get("defect_logits") is not None:
                defect_predictions = outputs["defect_logits"].argmax(dim=1).detach().cpu().tolist()
            for index, record in enumerate(batch["records"]):
                original_score = float(outputs["original_score"][index].detach().cpu())
                variant_score = float(outputs["variant_score"][index].detach().cpu())
                pair_kind = str(record.get("pair_kind", "original_vs_variant"))
                preferred_item = record.get("preferred_item")
                comparable = preferred_item in {"left", "right"} if pair_kind == "variant_vs_variant" else preferred_item in {"original", "variant"}
                correct = None
                predicted_preferred = None
                left_score = None
                right_score = None
                if comparable:
                    if pair_kind == "variant_vs_variant":
                        target_side = record.get("training_target_side")
                        source_side = record.get("training_source_side")
                        predicted_preferred = target_side if original_score >= variant_score else source_side
                        correct = predicted_preferred == preferred_item
                        if target_side == "left":
                            left_score = original_score
                            right_score = variant_score
                        else:
                            left_score = variant_score
                            right_score = original_score
                    else:
                        correct = (
                            original_score >= variant_score
                            if preferred_item == "original"
                            else variant_score >= original_score
                        )
                        predicted_preferred = "original" if original_score >= variant_score else "variant"
                scores.append(
                    {
                        "split": record["split"],
                        "label_id": record["label_id"],
                        "sample_id": record["sample_id"],
                        "variant_name": record["variant_name"],
                        "pair_kind": pair_kind,
                        "defect_type": record.get("defect_type"),
                        "left_defect_type": record.get("left_defect_type"),
                        "right_defect_type": record.get("right_defect_type"),
                        "preferred_item": preferred_item,
                        "preferred_side": record.get("preferred_side"),
                        "predicted_preferred": predicted_preferred,
                        "suggested_preferred": record.get("suggested_preferred"),
                        "label_source": record.get("label_source"),
                        "label_file": record.get("label_file"),
                        "review_status": record.get("review_status"),
                        "reviewed_by": record.get("reviewed_by"),
                        "metric_deltas": record.get("metric_deltas", {}),
                        "original_score": original_score,
                        "variant_score": variant_score,
                        "left_score": left_score,
                        "right_score": right_score,
                        "pairwise_correct": correct,
                        "latent_loss": float(losses["latent_loss"].detach().cpu()),
                        "cosine_similarity": float(cosines[index].detach().cpu()),
                        "defect_prediction": (
                            DEFECT_TYPES[defect_predictions[index]]
                            if defect_predictions is not None
                            else None
                        ),
                        "_original_embedding": outputs["original_normalized"][index]
                        .detach()
                        .cpu()
                        .tolist(),
                        "_variant_embedding": outputs["variant_normalized"][index]
                        .detach()
                        .cpu()
                        .tolist(),
                    }
                )
    return scores


def summarize_scores(
    scores: list[dict[str, Any]],
    records: list[dict[str, Any]],
    *,
    random_seed: int = 42,
) -> dict[str, Any]:
    if records and all(record.get("pair_kind") == "variant_vs_variant" for record in records):
        return summarize_hard_pair_scores(scores, records, random_seed=random_seed)
    comparable = [score for score in scores if score["pairwise_correct"] is not None]
    defect_correct = [
        score
        for score in scores
        if score["defect_prediction"] is not None and score.get("defect_type") in DEFECT_TYPES
    ]
    cosine_by_defect: dict[str, list[float]] = defaultdict(list)
    for score in scores:
        cosine_by_defect[str(score.get("defect_type"))].append(float(score["cosine_similarity"]))
    retrieval = retrieval_metrics(scores)
    label_sources = Counter(record.get("label_source") for record in records)
    pairwise_accuracy = accuracy_from_correct(comparable)
    always_original_accuracy = always_prefer_original_accuracy(comparable)
    random_preference = random_preference_accuracy(comparable, seed=random_seed)
    metric_heuristic = metric_heuristic_accuracy(comparable)
    defect_accuracy = defect_classification_accuracy(defect_correct)
    defect_majority = defect_majority_class_accuracy(defect_correct)
    random_defect = random_defect_accuracy(defect_correct, seed=random_seed)
    warnings = split_warnings(comparable, always_original_accuracy)
    pairwise_by_label_source: dict[str, float | None] = {}
    for label_source in ("human_reviewed", "auto_labeled", "synthetic_fallback"):
        source_scores = [
            score
            for score in comparable
            if normalize_label_source(score.get("label_source")) == label_source
        ]
        pairwise_by_label_source[label_source] = (
            sum(1 for score in source_scores if score["pairwise_correct"]) / len(source_scores)
            if source_scores
            else None
        )
    human_reviewed_count = sum(
        count
        for source, count in label_sources.items()
        if normalize_label_source(source) == "human_reviewed"
    )
    auto_labeled_count = sum(
        count
        for source, count in label_sources.items()
        if normalize_label_source(source) == "auto_labeled"
    )
    if auto_labeled_count:
        warnings.append(
            "This split uses auto_labeled weak labels; treat results as bootstrap signals, not human-reviewed evidence."
        )
    return {
        "record_count": len(scores),
        "pairwise_good_vs_bad_accuracy": pairwise_accuracy,
        "pairwise_good_vs_bad_accuracy_by_label_source": pairwise_by_label_source,
        "always_prefer_original_accuracy": always_original_accuracy,
        "random_preference_accuracy": random_preference,
        "metric_heuristic_accuracy": metric_heuristic,
        "pairwise_lift_over_always_original": lift(pairwise_accuracy, always_original_accuracy),
        "defect_classification_accuracy": defect_accuracy,
        "defect_majority_class_accuracy": defect_majority,
        "random_defect_accuracy": random_defect,
        "defect_lift_over_majority": lift(defect_accuracy, defect_majority),
        "defect_confusion_matrix": defect_confusion_matrix(defect_correct),
        "defect_per_class_metrics": defect_per_class_metrics(defect_correct),
        "average_latent_prediction_loss": (
            sum(float(score["latent_loss"]) for score in scores) / len(scores) if scores else None
        ),
        "average_cosine_similarity_by_defect_type": {
            defect_type: sum(values) / len(values)
            for defect_type, values in sorted(cosine_by_defect.items())
        },
        "retrieval_top1": retrieval["top1"],
        "retrieval_top5": retrieval["top5"],
        "label_coverage_used": human_reviewed_count / len(records) if records else 0,
        "auto_labeled_count": auto_labeled_count,
        "label_source_counts": sorted_counter(label_sources),
        "skipped_tie_unclear_count": len(scores) - len(comparable),
        "warnings": warnings,
    }


def summarize_hard_pair_scores(
    scores: list[dict[str, Any]],
    records: list[dict[str, Any]],
    *,
    random_seed: int = 42,
) -> dict[str, Any]:
    comparable = [score for score in scores if score["pairwise_correct"] is not None]
    defect_correct = [
        score
        for score in scores
        if score["defect_prediction"] is not None and score.get("defect_type") in DEFECT_TYPES
    ]
    pairwise_accuracy = accuracy_from_correct(comparable)
    always_left = always_prefer_side_accuracy(comparable, "left")
    always_right = always_prefer_side_accuracy(comparable, "right")
    best_constant = max(value for value in (always_left, always_right) if value is not None) if comparable else None
    human_reviewed_count = sum(
        1 for record in records if normalize_label_source(record.get("label_source")) == "human_reviewed"
    )
    auto_labeled_count = sum(
        1 for record in records if normalize_label_source(record.get("label_source")) == "auto_labeled"
    )
    label_source_counts = Counter(record.get("label_source") for record in records)
    preferred_counts = Counter(record.get("preferred") for record in records)
    warnings = hard_pair_warnings(comparable)
    if auto_labeled_count:
        warnings.append(
            "This split uses auto_labeled weak labels; treat results as bootstrap signals, not human-reviewed evidence."
        )
    return {
        "record_count": len(scores),
        "pairwise_preference_accuracy": pairwise_accuracy,
        "always_left_accuracy": always_left,
        "always_right_accuracy": always_right,
        "random_preference_accuracy": random_left_right_accuracy(comparable, seed=random_seed),
        "suggestion_baseline_accuracy": suggestion_baseline_accuracy(comparable),
        "pairwise_lift_over_best_constant": lift(pairwise_accuracy, best_constant),
        "defect_accuracy_on_losing_side": defect_classification_accuracy(defect_correct),
        "defect_majority_class_accuracy": defect_majority_class_accuracy(defect_correct),
        "random_defect_accuracy": random_defect_accuracy(defect_correct, seed=random_seed),
        "defect_lift_over_majority": lift(defect_classification_accuracy(defect_correct), defect_majority_class_accuracy(defect_correct)),
        "defect_confusion_matrix": defect_confusion_matrix(defect_correct),
        "defect_per_class_metrics": defect_per_class_metrics(defect_correct),
        "average_latent_prediction_loss": (
            sum(float(score["latent_loss"]) for score in scores) / len(scores) if scores else None
        ),
        "retrieval_top1": None,
        "retrieval_top5": None,
        "label_coverage_used": human_reviewed_count / len(records) if records else 0,
        "auto_labeled_count": auto_labeled_count,
        "label_source_counts": sorted_counter(label_source_counts),
        "preferred_counts": dict(sorted(preferred_counts.items())),
        "tie_unclear_count": sum(preferred_counts.get(key, 0) for key in ("tie", "unclear")),
        "warnings": warnings,
    }


def normalize_label_source(label_source: Any) -> str | None:
    if label_source == "reviewed":
        return "human_reviewed"
    if label_source in {"human_reviewed", "auto_labeled", "synthetic_fallback"}:
        return str(label_source)
    return None


def sorted_counter(counter: Counter) -> dict[str, int]:
    return {
        str(key): count
        for key, count in sorted(counter.items(), key=lambda item: str(item[0]))
    }


def accuracy_from_correct(scores: list[dict[str, Any]]) -> float | None:
    if not scores:
        return None
    return sum(1 for score in scores if score["pairwise_correct"]) / len(scores)


def always_prefer_original_accuracy(scores: list[dict[str, Any]]) -> float | None:
    if not scores:
        return None
    return sum(1 for score in scores if score.get("preferred_item") == "original") / len(scores)


def always_prefer_side_accuracy(scores: list[dict[str, Any]], side: str) -> float | None:
    if not scores:
        return None
    return sum(1 for score in scores if score.get("preferred_item") == side) / len(scores)


def random_preference_accuracy(scores: list[dict[str, Any]], *, seed: int) -> float | None:
    if not scores:
        return None
    rng = random.Random(seed)
    correct = 0
    for score in sorted(scores, key=lambda item: str(item.get("label_id"))):
        correct += rng.choice(("original", "variant")) == score.get("preferred_item")
    return correct / len(scores)


def random_left_right_accuracy(scores: list[dict[str, Any]], *, seed: int) -> float | None:
    if not scores:
        return None
    rng = random.Random(seed)
    correct = 0
    for score in sorted(scores, key=lambda item: str(item.get("label_id"))):
        correct += rng.choice(("left", "right")) == score.get("preferred_item")
    return correct / len(scores)


def suggestion_baseline_accuracy(scores: list[dict[str, Any]]) -> float | None:
    usable = [
        score
        for score in scores
        if score.get("suggested_preferred") in {"left", "right"}
        and score.get("preferred_item") in {"left", "right"}
    ]
    if not usable:
        return None
    return sum(1 for score in usable if score["suggested_preferred"] == score["preferred_item"]) / len(usable)


def metric_heuristic_accuracy(scores: list[dict[str, Any]]) -> float | None:
    usable: list[dict[str, Any]] = []
    for score in scores:
        prediction = metric_heuristic_prediction(score)
        if prediction is None:
            continue
        usable.append({"prediction": prediction, "preferred_item": score.get("preferred_item")})
    if not usable:
        return None
    return sum(1 for item in usable if item["prediction"] == item["preferred_item"]) / len(usable)


def metric_heuristic_prediction(score: dict[str, Any]) -> str | None:
    deltas = score.get("metric_deltas") or {}
    defect_type = score.get("defect_type")
    if not isinstance(deltas, dict):
        return None
    if defect_type == "contrast":
        if numeric(deltas.get("contrast_issue_delta"), 0) > 0:
            return "original"
        if numeric(deltas.get("min_contrast_ratio_delta"), 0) < 0:
            return "original"
    elif defect_type == "hierarchy":
        if abs(numeric(deltas.get("font_size_ratio_delta"), 0)) > 0:
            return "original"
        if numeric(deltas.get("hierarchy_warning_count"), 0) > 0:
            return "original"
    elif defect_type in {"spacing", "alignment"}:
        if numeric(deltas.get("changed_pixel_ratio"), 0) > 0:
            return "original"
    return None


def numeric(value: Any, default: float) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def lift(score: float | None, baseline: float | None) -> float | None:
    if score is None or baseline is None:
        return None
    return score - baseline


def defect_classification_accuracy(scores: list[dict[str, Any]]) -> float | None:
    if not scores:
        return None
    return sum(1 for score in scores if score["defect_prediction"] == score["defect_type"]) / len(scores)


def defect_majority_class_accuracy(scores: list[dict[str, Any]]) -> float | None:
    if not scores:
        return None
    counts = Counter(str(score.get("defect_type")) for score in scores)
    return max(counts.values()) / len(scores)


def random_defect_accuracy(scores: list[dict[str, Any]], *, seed: int) -> float | None:
    if not scores:
        return None
    rng = random.Random(seed)
    correct = 0
    for score in sorted(scores, key=lambda item: str(item.get("label_id"))):
        correct += rng.choice(DEFECT_TYPES) == score.get("defect_type")
    return correct / len(scores)


def defect_confusion_matrix(scores: list[dict[str, Any]]) -> dict[str, dict[str, int]]:
    matrix = {
        actual: {predicted: 0 for predicted in DEFECT_TYPES}
        for actual in DEFECT_TYPES
    }
    for score in scores:
        actual = score.get("defect_type")
        predicted = score.get("defect_prediction")
        if actual in DEFECT_TYPES and predicted in DEFECT_TYPES:
            matrix[str(actual)][str(predicted)] += 1
    return matrix


def defect_per_class_metrics(scores: list[dict[str, Any]]) -> dict[str, dict[str, float | int | None]]:
    metrics: dict[str, dict[str, float | int | None]] = {}
    for defect_type in DEFECT_TYPES:
        true_positive = sum(
            1
            for score in scores
            if score.get("defect_type") == defect_type and score.get("defect_prediction") == defect_type
        )
        predicted_positive = sum(1 for score in scores if score.get("defect_prediction") == defect_type)
        actual_positive = sum(1 for score in scores if score.get("defect_type") == defect_type)
        metrics[defect_type] = {
            "precision": true_positive / predicted_positive if predicted_positive else None,
            "recall": true_positive / actual_positive if actual_positive else None,
            "support": actual_positive,
        }
    return metrics


def split_warnings(
    comparable: list[dict[str, Any]],
    always_original_accuracy: float | None,
) -> list[str]:
    warnings: list[str] = []
    if comparable and always_original_accuracy == 1.0:
        warnings.append("All labels prefer original; pairwise accuracy is not a discriminative metric.")
    return warnings


def hard_pair_warnings(comparable: list[dict[str, Any]]) -> list[str]:
    if not comparable:
        return []
    counts = Counter(score.get("preferred_item") for score in comparable)
    dominant_side, dominant_count = counts.most_common(1)[0]
    share = dominant_count / len(comparable)
    if dominant_side in {"left", "right"} and share >= 0.8:
        return [f"Preferred side is dominated by {dominant_side}: {share:.1%}."]
    return []


def retrieval_metrics(scores: list[dict[str, Any]]) -> dict[str, float | None]:
    if not scores:
        return {"top1": None, "top5": None}
    originals_by_sample = {
        score["sample_id"]: score["_original_embedding"]
        for score in sorted(scores, key=lambda item: item["sample_id"])
    }
    top1 = 0
    top5 = 0
    for score in scores:
        variant_embedding = score["_variant_embedding"]
        ranked = sorted(
            (
                {
                    "sample_id": sample_id,
                    "score": dot_product(variant_embedding, original_embedding),
                }
                for sample_id, original_embedding in originals_by_sample.items()
            ),
            key=lambda item: (-item["score"], item["sample_id"]),
        )
        ids = [item["sample_id"] for item in ranked]
        top1 += ids[0] == score["sample_id"]
        top5 += score["sample_id"] in ids[:5]
    return {"top1": top1 / len(scores), "top5": top5 / len(scores)}


def dot_product(left: list[float], right: list[float]) -> float:
    return sum(a * b for a, b in zip(left, right, strict=True))


def public_score(score: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in score.items() if not key.startswith("_")}
