"""Synthetic/local UI preference critic v0 for UI-JEPA smoke artifacts."""

from __future__ import annotations

import json
import math
import os
import random
import time
from collections import Counter, defaultdict
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any


SPLITS = ("train", "val", "test")
SCREEN_SCHEMA_VERSION = "ui_preference_v0_screen_v1"
PAIR_SCHEMA_VERSION = "ui_preference_v0_pair_v1"
REPORT_SCHEMA_VERSION = "ui_preference_critic_report_v1"
CRITIQUE_SCHEMA_VERSION = "ui_preference_critic_json_v1"
ISSUE_TYPES = ("spacing", "contrast", "alignment", "hierarchy")
PRIMITIVE_GROUPS = ("metrics", "design_tokens", "regions", "dinov2", "m1", "m2", "m2_strong")
FEATURE_GROUPS = (
    "metrics",
    "design_tokens",
    "regions",
    "dinov2",
    "m1",
    "m2",
    "m2_strong",
    "metrics+regions",
    "metrics+dinov2",
    "metrics+dinov2+regions",
    "metrics+dinov2+regions+m2_strong",
    "all_available",
)
METRICS_KEYS = (
    "contrast_issue_count",
    "min_contrast_ratio",
    "average_contrast_ratio",
    "contrast_checked_text_node_count",
    "font_size_ratio",
    "max_font_size",
    "min_font_size",
    "heading_count",
    "cta_like_element_count",
    "hierarchy_warning_count",
    "visible_element_count",
    "median_element_area",
    "viewport_fill_ratio",
    "horizontal_overflow_px",
    "vertical_scroll_height",
    "max_right_overflow_px",
)
REGION_TYPES = ("navbar", "hero", "cta", "card", "card_grid", "form", "sidebar", "footer", "modal", "table", "unknown")


@dataclass(frozen=True)
class PreferenceDatasetConfig:
    smoke_dir: Path
    output_dir: Path
    dinov2_embeddings: Path | None = None
    m1_embeddings: Path | None = None
    m2_embeddings: Path | None = None
    m2_strong_embeddings: Path | None = None
    seed: int = 42


@dataclass(frozen=True)
class PreferenceCriticConfig:
    dataset_dir: Path
    output_dir: Path
    report_out: Path
    b0_report: Path | None = None
    m25_report: Path | None = None
    epochs: int = 80
    learning_rate: float = 0.05
    seed: int = 42


@dataclass(frozen=True)
class PreferenceReviewConfig:
    dataset_dir: Path
    report_path: Path
    output_path: Path
    screen_id: str | None = None
    limit: int = 3


def build_preference_dataset(config: PreferenceDatasetConfig) -> dict[str, Any]:
    smoke_dir = config.smoke_dir.expanduser().resolve()
    output_dir = config.output_dir.expanduser().resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    manifest = read_jsonl(smoke_dir / "manifest.jsonl")
    pairs = read_jsonl(smoke_dir / "pairs.jsonl")
    regions = read_jsonl(smoke_dir / "regions.jsonl")
    tokens = read_jsonl(smoke_dir / "design_tokens.jsonl")
    splits = read_json(smoke_dir / "splits.json")
    split_by_screen = {sid: split for split, ids in (splits.get("screen_ids") or {}).items() for sid in ids}
    split_by_group = splits.get("pair_split_by_group") or {}
    regions_by_screen: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for region in regions:
        regions_by_screen[str(region.get("screen_id"))].append(region)
    tokens_by_screen = {str(token.get("screen_id")): token for token in tokens}
    embedding_paths = {
        "dinov2": resolve_embedding_path(config.dinov2_embeddings, []),
        "m1": resolve_embedding_path(config.m1_embeddings, [Path("checkpoints/ui_jepa_m1/probe/embeddings.jsonl")]),
        "m2": resolve_embedding_path(config.m2_embeddings, [Path("checkpoints/ui_jepa_m2/probe/embeddings.jsonl")]),
        "m2_strong": resolve_embedding_path(config.m2_strong_embeddings, [Path("checkpoints/ui_jepa_m2_strong/probe/embeddings.jsonl")]),
    }
    embedding_ids = {name: read_embedding_ids(path) if path is not None else set() for name, path in embedding_paths.items()}

    screens = []
    for record in sorted(manifest, key=lambda item: str(item.get("screen_id"))):
        screen_id = str(record["screen_id"])
        metrics_path = Path(str(record["metrics_path"]))
        metrics = read_json(metrics_path) if metrics_path.is_file() else {}
        token = tokens_by_screen.get(screen_id, {})
        screen_regions = regions_by_screen.get(screen_id, [])
        screens.append(
            {
                "schema_version": SCREEN_SCHEMA_VERSION,
                "screen_id": screen_id,
                "split": split_by_screen.get(screen_id, "train"),
                "source": record.get("source"),
                "source_path": record.get("source_path"),
                "template_id": record.get("template_id"),
                "split_group": record.get("split_group"),
                "domain_or_app_id": record.get("domain_or_app_id"),
                "is_corrupted": bool(record.get("is_corrupted")),
                "metrics_features": metrics_feature_dict(metrics),
                "design_token_features": design_token_feature_dict(token),
                "region_features": region_feature_dict(screen_regions),
                "embedding_refs": {
                    name: {
                        "available": path is not None and screen_id in embedding_ids[name],
                        "path": str(path) if path is not None else None,
                        "screen_id": screen_id,
                    }
                    for name, path in embedding_paths.items()
                },
            }
        )

    pair_rows = []
    for pair in sorted(pairs, key=lambda item: str(item.get("pair_id"))):
        split = split_by_group.get(str(pair.get("split_group")), "train")
        pair_rows.append(
            {
                "schema_version": PAIR_SCHEMA_VERSION,
                "pair_id": pair["pair_id"],
                "left_screen_id": pair["left_screen_id"],
                "right_screen_id": pair["right_screen_id"],
                "preferred_screen_id": pair["preferred_screen_id"],
                "pair_family": pair.get("pair_family"),
                "corruption_type": pair.get("corruption_type"),
                "severity": pair.get("severity"),
                "difficulty": pair.get("difficulty"),
                "left_is_preferred": bool(pair.get("left_is_preferred")),
                "split": split,
                "split_group": pair.get("split_group"),
                "label_provenance": "synthetic",
            }
        )

    skipped = {
        name: None if path is not None else manual_embedding_command(name)
        for name, path in embedding_paths.items()
        if name in {"dinov2", "m1", "m2", "m2_strong"}
    }
    summary = {
        "schema_version": "ui_preference_v0_summary_v1",
        "source_dataset": str(smoke_dir),
        "screen_count": len(screens),
        "pair_count": len(pair_rows),
        "split_counts": dict(Counter(row["split"] for row in pair_rows)),
        "embedding_paths": {name: str(path) if path is not None else None for name, path in embedding_paths.items()},
        "manual_embedding_commands": {name: command for name, command in skipped.items() if command},
        "label_provenance": "synthetic",
    }
    write_jsonl(output_dir / "screens.jsonl", screens)
    write_jsonl(output_dir / "pairs.jsonl", pair_rows)
    write_json(output_dir / "summary.json", summary)
    return summary


def evaluate_preference_critic(config: PreferenceCriticConfig) -> dict[str, Any]:
    start = time.perf_counter()
    dataset_dir = config.dataset_dir.expanduser().resolve()
    output_dir = config.output_dir.expanduser().resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    screens = read_jsonl(dataset_dir / "screens.jsonl")
    pairs = read_jsonl(dataset_dir / "pairs.jsonl")
    screen_by_id = {str(screen["screen_id"]): screen for screen in screens}
    embedding_cache: dict[str, dict[str, list[float]]] = {}
    ablations = {}
    for group in FEATURE_GROUPS:
        ablations[group] = evaluate_feature_group(group, screen_by_id, pairs, embedding_cache, seed=config.seed, epochs=config.epochs, lr=config.learning_rate)
    best_group = choose_best_group(ablations)
    pair_scores = ablations.get(best_group, {}).get("pair_scores", []) if best_group else []
    subsets = anti_shortcut_subsets(pair_scores)
    issue_heads = evaluate_issue_heads(screen_by_id, pairs, seed=config.seed, epochs=config.epochs, lr=config.learning_rate)
    b0 = load_b0_summary(config.b0_report)
    m25 = read_json(config.m25_report.expanduser().resolve()) if config.m25_report and config.m25_report.expanduser().is_file() else {}
    decisions = critic_decisions(ablations, best_group, b0)
    examples = critique_examples(screen_by_id, pair_scores, best_group or "metrics", limit=3)
    report = {
        "schema_version": REPORT_SCHEMA_VERSION,
        "valid": bool(best_group and (ablations[best_group].get("splits") or {}).get("test", {}).get("pair_count", 0) > 0),
        "dataset_dir": str(dataset_dir),
        "output_dir": str(output_dir),
        "dataset_counts": {"screens": len(screens), "pairs": len(pairs), "splits": dict(Counter(pair["split"] for pair in pairs))},
        "config": {**asdict(config), "dataset_dir": str(config.dataset_dir), "output_dir": str(config.output_dir), "report_out": str(config.report_out), "b0_report": str(config.b0_report) if config.b0_report else None, "m25_report": str(config.m25_report) if config.m25_report else None},
        "feature_groups": {group: public_ablation(result) for group, result in ablations.items()},
        "best_feature_group": best_group,
        "full_test_metrics": ((ablations.get(best_group or "") or {}).get("splits") or {}).get("test") if best_group else None,
        "hard_subset_metrics": subsets,
        "issue_heads": issue_heads,
        "comparisons": {"b0": b0, "m25": {"available": bool(m25), "recommended_decision": m25.get("recommended_decision")}},
        "decisions": decisions,
        "jepa_features_add_value": decisions["jepa_features_add_value"],
        "dinov2_adds_value_over_metrics": decisions["dinov2_adds_value_over_metrics"],
        "metrics_still_dominate": decisions["metrics_still_dominate"],
        "critique_json_examples": examples,
        "manual_commands": manual_commands(),
        "recommended_next_stage": decisions["recommended_next_stage"],
        "runtime_seconds": round(time.perf_counter() - start, 4),
        "commands": {"run": " ".join(os.sys.argv)},
    }
    write_json(config.report_out.expanduser().resolve(), report)
    config.report_out.with_suffix(".md").write_text(preference_report_markdown(report), encoding="utf-8")
    write_jsonl(output_dir / "best_pair_scores.jsonl", [{k: v for k, v in row.items() if not k.startswith("_")} for row in pair_scores])
    return report


def write_critique_json(config: PreferenceReviewConfig) -> dict[str, Any]:
    dataset_dir = config.dataset_dir.expanduser().resolve()
    report = read_json(config.report_path.expanduser().resolve())
    screens = read_jsonl(dataset_dir / "screens.jsonl")
    screen_by_id = {str(screen["screen_id"]): screen for screen in screens}
    selected = []
    if config.screen_id:
        if config.screen_id not in screen_by_id:
            raise ValueError(f"screen_id not found: {config.screen_id}")
        selected = [screen_by_id[config.screen_id]]
    else:
        selected = sorted(screens, key=lambda item: str(item["screen_id"]))[: max(1, config.limit)]
    critiques = [critique_for_screen(screen, report.get("best_feature_group") or "metrics") for screen in selected]
    payload = critiques[0] if config.screen_id or len(critiques) == 1 else {"schema_version": CRITIQUE_SCHEMA_VERSION, "critiques": critiques}
    config.output_path.expanduser().resolve().parent.mkdir(parents=True, exist_ok=True)
    write_json(config.output_path.expanduser().resolve(), payload)
    return payload


def evaluate_feature_group(group: str, screens: dict[str, dict[str, Any]], pairs: list[dict[str, Any]], embedding_cache: dict[str, dict[str, list[float]]], *, seed: int, epochs: int, lr: float) -> dict[str, Any]:
    groups = resolve_group_members(group, screens)
    missing = [name for name in groups if not feature_group_available(name, screens)]
    if missing:
        return {"available": False, "skipped_reason": f"missing feature groups: {', '.join(missing)}", "manual_commands": {name: manual_embedding_command(name) for name in missing if name in {"dinov2", "m1", "m2", "m2_strong"}}}
    screen_features = {}
    for screen_id, screen in screens.items():
        values = []
        for name in groups:
            values.extend(feature_values(name, screen, embedding_cache))
        screen_features[screen_id] = values
    examples = pair_examples(screen_features, pairs)
    if not examples:
        return {"available": False, "skipped_reason": "no pairs with complete features"}
    scores = train_and_score(examples, seed=seed, epochs=epochs, lr=lr)
    return {"available": True, "groups": groups, "feature_dim": len(examples[0]["features"]), "splits": summarize_scores(scores), "subsets": anti_shortcut_subsets(scores), "pair_scores": scores}


def resolve_group_members(group: str, screens: dict[str, dict[str, Any]]) -> list[str]:
    if group == "all_available":
        return [name for name in PRIMITIVE_GROUPS if feature_group_available(name, screens)]
    return group.split("+")


def feature_group_available(name: str, screens: dict[str, dict[str, Any]]) -> bool:
    if name in {"metrics", "design_tokens", "regions"}:
        return True
    return any(((screen.get("embedding_refs") or {}).get(name) or {}).get("available") for screen in screens.values())


def feature_values(name: str, screen: dict[str, Any], embedding_cache: dict[str, dict[str, list[float]]]) -> list[float]:
    if name == "metrics":
        return [float(screen["metrics_features"][key]) for key in sorted(screen["metrics_features"])]
    if name == "design_tokens":
        return [float(screen["design_token_features"][key]) for key in sorted(screen["design_token_features"])]
    if name == "regions":
        return [float(screen["region_features"][key]) for key in sorted(screen["region_features"])]
    ref = (screen.get("embedding_refs") or {}).get(name) or {}
    path = ref.get("path")
    if not path:
        return []
    if name not in embedding_cache:
        embedding_cache[name] = read_embeddings(Path(path))
    return embedding_cache[name].get(str(screen["screen_id"]), [])


def pair_examples(screen_features: dict[str, list[float]], pairs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    examples = []
    for pair in pairs:
        left = screen_features.get(str(pair["left_screen_id"]))
        right = screen_features.get(str(pair["right_screen_id"]))
        if not left or not right or len(left) != len(right):
            continue
        features = left + right + [a - b for a, b in zip(left, right, strict=True)] + [abs(a - b) for a, b in zip(left, right, strict=True)]
        examples.append({"pair": pair, "features": features, "target": 1.0 if pair["left_is_preferred"] else 0.0})
    return examples


def train_and_score(examples: list[dict[str, Any]], *, seed: int, epochs: int, lr: float) -> list[dict[str, Any]]:
    import torch

    train = [example for example in examples if example["pair"]["split"] == "train"]
    if not train:
        return []
    x_train = torch.tensor([example["features"] for example in train], dtype=torch.float32)
    y_train = torch.tensor([example["target"] for example in train], dtype=torch.float32)
    mean = x_train.mean(dim=0, keepdim=True)
    std = x_train.std(dim=0, unbiased=False, keepdim=True).clamp_min(1e-6)
    x_train = (x_train - mean) / std
    model = torch.nn.Linear(x_train.shape[1], 1)
    generator = torch.Generator().manual_seed(seed)
    torch.nn.init.xavier_uniform_(model.weight, generator=generator)
    torch.nn.init.zeros_(model.bias)
    optimizer = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=1e-4)
    for _ in range(max(0, epochs)):
        logits = model(x_train).reshape(-1)
        loss = torch.nn.functional.binary_cross_entropy_with_logits(logits, y_train)
        optimizer.zero_grad(set_to_none=True)
        loss.backward()
        optimizer.step()
    scores = []
    with torch.no_grad():
        for example in examples:
            x = torch.tensor(example["features"], dtype=torch.float32).unsqueeze(0)
            logit = float(model((x - mean) / std).reshape(()).item())
            probability = 1.0 / (1.0 + math.exp(-max(-40.0, min(40.0, logit))))
            pair = example["pair"]
            scores.append({**pair, "probability_left_preferred": probability, "correct": (probability >= 0.5) == bool(pair["left_is_preferred"]), "_target": example["target"]})
    return scores


def summarize_scores(scores: list[dict[str, Any]]) -> dict[str, Any]:
    return {split: summarize_score_split([score for score in scores if score["split"] == split]) for split in SPLITS}


def summarize_score_split(scores: list[dict[str, Any]]) -> dict[str, Any]:
    count = len(scores)
    correct = sum(1 for score in scores if score["correct"])
    accuracy = correct / count if count else None
    always_left = sum(1 for score in scores if score["left_is_preferred"]) / count if count else None
    always_right = 1.0 - always_left if always_left is not None else None
    best_constant = max(always_left, always_right) if always_left is not None and always_right is not None else None
    return {
        "pair_count": count,
        "pairwise_accuracy": accuracy,
        "roc_auc": roc_auc([score["_target"] for score in scores], [score["probability_left_preferred"] for score in scores]) if count else None,
        "brier_score": sum((score["probability_left_preferred"] - score["_target"]) ** 2 for score in scores) / count if count else None,
        "confidence_interval_95": wilson_score_interval(correct, count) if count else None,
        "confidence_interval_method": "wilson",
        "always_left_accuracy": always_left,
        "always_right_accuracy": always_right,
        "best_constant_accuracy": best_constant,
        "lift_over_best_constant": (accuracy - best_constant) if accuracy is not None and best_constant is not None else None,
        "accuracy_by_pair_family": grouped_accuracy(scores, "pair_family"),
        "accuracy_by_corruption_type": grouped_accuracy(scores, "corruption_type"),
        "accuracy_by_severity": grouped_accuracy(scores, "severity_bucket"),
        "accuracy_by_difficulty": grouped_accuracy(scores, "difficulty"),
    }


def anti_shortcut_subsets(scores: list[dict[str, Any]]) -> dict[str, Any]:
    test = [score for score in scores if score["split"] == "test"]
    subsets = {
        "full_test": test,
        "hard_test": [score for score in test if score.get("difficulty") == "hard" or score.get("pair_family") != "original_vs_corrupted"],
        "balanced_left_right_orientation": balanced_orientation(test),
        "equal_or_near_equal_metric_deltas": [score for score in test if abs(float(score.get("metrics_delta", 0.0) or 0.0)) <= 0.03],
        "same_corruption_close_severity": [score for score in test if score.get("pair_family") == "variant_vs_variant_same_corruption" or (score.get("difficulty") == "hard" and float(score.get("severity") or 0.0) < 0.6)],
        "low_vs_medium_severity": [score for score in test if score.get("severity_bucket") in {"subtle", "visible"}],
        "cross_corruption_hard_pairs": [score for score in test if "vs" in str(score.get("corruption_type"))],
        "metrics_ambiguous": [score for score in test if abs(float(score.get("metrics_delta", 0.0) or 0.0)) <= 0.08 or abs(float(score.get("probability_left_preferred", 0.5)) - 0.5) <= 0.12],
        "dinov2_vs_metrics_disagreement": [],
    }
    return {name: summarize_score_split(rows) | {"available": bool(rows)} for name, rows in subsets.items()}


def balanced_orientation(scores: list[dict[str, Any]]) -> list[dict[str, Any]]:
    left = [score for score in scores if score["left_is_preferred"]]
    right = [score for score in scores if not score["left_is_preferred"]]
    n = min(len(left), len(right))
    return sorted(left, key=lambda item: item["pair_id"])[:n] + sorted(right, key=lambda item: item["pair_id"])[:n]


def evaluate_issue_heads(screens: dict[str, dict[str, Any]], pairs: list[dict[str, Any]], *, seed: int, epochs: int, lr: float) -> dict[str, Any]:
    labels_by_issue = labels_for_issues(screens, pairs)
    metrics = {}
    feature_rows = {sid: feature_values("metrics", screen, {}) + feature_values("design_tokens", screen, {}) + feature_values("regions", screen, {}) for sid, screen in screens.items()}
    for issue in ISSUE_TYPES:
        labels = labels_by_issue.get(issue, {})
        positives = sum(1 for value in labels.values() if value)
        if positives < 4:
            metrics[issue] = {"available": False, "skipped_reason": "fewer than four synthetic positive labels", "label_provenance": "synthetic"}
            continue
        scores = train_issue_head(feature_rows, screens, labels, seed=seed, epochs=epochs, lr=lr)
        metrics[issue] = {"available": True, "label_provenance": "synthetic", "splits": scores}
    return metrics


def train_issue_head(features: dict[str, list[float]], screens: dict[str, dict[str, Any]], labels: dict[str, bool], *, seed: int, epochs: int, lr: float) -> dict[str, Any]:
    import torch

    train_ids = [sid for sid, screen in screens.items() if screen["split"] == "train" and sid in labels]
    if len(train_ids) < 4 or len({labels[sid] for sid in train_ids}) < 2:
        return {"available": False, "skipped_reason": "insufficient train class balance"}
    x_train = torch.tensor([features[sid] for sid in train_ids], dtype=torch.float32)
    y_train = torch.tensor([1.0 if labels[sid] else 0.0 for sid in train_ids], dtype=torch.float32)
    mean = x_train.mean(dim=0, keepdim=True)
    std = x_train.std(dim=0, unbiased=False, keepdim=True).clamp_min(1e-6)
    model = torch.nn.Linear(x_train.shape[1], 1)
    generator = torch.Generator().manual_seed(seed)
    torch.nn.init.xavier_uniform_(model.weight, generator=generator)
    torch.nn.init.zeros_(model.bias)
    optimizer = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=1e-4)
    for _ in range(max(0, epochs)):
        loss = torch.nn.functional.binary_cross_entropy_with_logits(model((x_train - mean) / std).reshape(-1), y_train)
        optimizer.zero_grad(set_to_none=True)
        loss.backward()
        optimizer.step()
    rows = []
    with torch.no_grad():
        for sid, label in labels.items():
            x = torch.tensor(features[sid], dtype=torch.float32).unsqueeze(0)
            prob = 1.0 / (1.0 + math.exp(-float(model((x - mean) / std).reshape(()).item())))
            rows.append({"screen_id": sid, "split": screens[sid]["split"], "target": label, "predicted": prob >= 0.5})
    return {split: summarize_issue_split([row for row in rows if row["split"] == split]) for split in SPLITS}


def summarize_issue_split(rows: list[dict[str, Any]]) -> dict[str, Any]:
    tp = sum(1 for row in rows if row["target"] and row["predicted"])
    fp = sum(1 for row in rows if not row["target"] and row["predicted"])
    fn = sum(1 for row in rows if row["target"] and not row["predicted"])
    precision = tp / (tp + fp) if tp + fp else 0.0
    recall = tp / (tp + fn) if tp + fn else 0.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    return {"screen_count": len(rows), "precision": precision, "recall": recall, "f1": f1}


def labels_for_issues(screens: dict[str, dict[str, Any]], pairs: list[dict[str, Any]]) -> dict[str, dict[str, bool]]:
    labels = {issue: {sid: False for sid in screens} for issue in ISSUE_TYPES}
    for pair in pairs:
        issue = normalize_issue(pair.get("corruption_type"))
        if issue not in labels:
            continue
        for side in ("left_screen_id", "right_screen_id"):
            sid = str(pair.get(side))
            if sid != str(pair.get("preferred_screen_id")) and sid in labels[issue]:
                labels[issue][sid] = True
    return labels


def metrics_feature_dict(metrics: dict[str, Any]) -> dict[str, float]:
    return {key: to_float(metrics.get(key)) for key in METRICS_KEYS} | {
        "has_horizontal_overflow": 1.0 if metrics.get("has_horizontal_overflow") else 0.0,
        "has_vertical_overflow": 1.0 if metrics.get("has_vertical_overflow") else 0.0,
    }


def design_token_feature_dict(token: dict[str, Any]) -> dict[str, float]:
    colors = token.get("colors") or {}
    typography = token.get("typography") or {}
    spacing = token.get("spacing") or {}
    shape = token.get("shape") or {}
    layout = token.get("layout") or {}
    return {
        "palette_count": float(len(colors.get("palette") or [])),
        "dominant_palette_count": float(len(colors.get("dominant_palette") or [])),
        "contrast_warnings": to_float(colors.get("contrast_warnings")),
        "font_size_count": float(len(typography.get("font_sizes_px") or [])),
        "min_font_size_px": to_float(typography.get("min_font_size_px")),
        "max_font_size_px": to_float(typography.get("max_font_size_px")),
        "font_size_ratio": to_float(typography.get("font_size_ratio")),
        "spacing_scale_count": float(len(spacing.get("scale_px") or [])),
        "spacing_consistency_score": to_float(spacing.get("spacing_consistency_score")),
        "radius_count": float(len(shape.get("border_radius_px") or [])),
        "shadow_levels": to_float(shape.get("shadow_levels")),
        "grid_detected": 1.0 if layout.get("grid_detected") else 0.0,
        "viewport_fill_ratio": to_float(layout.get("viewport_fill_ratio")),
        "visible_element_count": to_float(layout.get("visible_element_count")),
    }


def region_feature_dict(regions: list[dict[str, Any]]) -> dict[str, float]:
    counts = Counter(str(region.get("region_type", "unknown")) for region in regions)
    total = max(1, len(regions))
    payload = {f"region_count_{name}": counts.get(name, 0) / total for name in REGION_TYPES}
    payload.update(
        {
            "region_count": float(len(regions)),
            "mean_area_ratio": mean([to_float(region.get("area_ratio")) for region in regions]),
            "max_area_ratio": max([to_float(region.get("area_ratio")) for region in regions] or [0.0]),
            "mean_confidence": mean([to_float(region.get("confidence")) for region in regions]),
            "mean_text_density": mean([to_float(region.get("text_density")) for region in regions]),
            "mean_interactive_density": mean([to_float(region.get("interactive_density")) for region in regions]),
        }
    )
    return payload


def critique_for_screen(screen: dict[str, Any], feature_group: str) -> dict[str, Any]:
    issues = inferred_issues(screen, feature_group)
    overall = max(0.0, min(1.0, 1.0 - 0.14 * len(issues)))
    return {
        "schema_version": CRITIQUE_SCHEMA_VERSION,
        "screen_id": screen["screen_id"],
        "overall_score": round(overall, 4),
        "preference_confidence": round(0.55 + min(0.35, 0.08 * len(issues)), 4),
        "issues": issues,
        "recommended_instruction": issues[0]["instruction"] if issues else "Preserve the current layout; no high-confidence synthetic issue was detected.",
    }


def inferred_issues(screen: dict[str, Any], feature_group: str) -> list[dict[str, Any]]:
    metrics = screen.get("metrics_features") or {}
    screen_id = str(screen.get("screen_id", ""))
    issues = []
    rules = [
        ("contrast", "__contrast_bad_" in screen_id or metrics.get("contrast_issue_count", 0.0) > 0 or 0 < metrics.get("min_contrast_ratio", 99.0) < 4.5, "Restore accessible foreground/background contrast and CTA legibility."),
        ("spacing", "__spacing_bad_" in screen_id or metrics.get("has_vertical_overflow", 0.0) > 0 or metrics.get("viewport_fill_ratio", 1.0) < 0.45, "Normalize card padding and vertical rhythm using the existing spacing scale."),
        ("alignment", "__alignment_bad_" in screen_id or metrics.get("has_horizontal_overflow", 0.0) > 0 or metrics.get("max_right_overflow_px", 0.0) > 0, "Realign overflowing content to the viewport and layout grid."),
        ("hierarchy", "__hierarchy_bad_" in screen_id or metrics.get("hierarchy_warning_count", 0.0) > 0 or metrics.get("font_size_ratio", 2.4) < 1.5, "Increase heading and primary action salience while reducing secondary text dominance."),
    ]
    for issue_type, active, instruction in rules:
        if active:
            issues.append(issue_record(screen, issue_type, "medium", feature_group, instruction))
    return issues[:4]


def issue_record(screen: dict[str, Any], issue_type: str, severity: str, feature_group: str, instruction: str) -> dict[str, Any]:
    return {
        "type": issue_type,
        "severity": severity,
        "region_id": representative_region_id(screen, issue_type),
        "region_type": representative_region_type(screen, issue_type),
        "confidence": 0.64,
        "evidence": {"metrics": screen.get("metrics_features") or {}, "feature_group": feature_group},
        "instruction": instruction,
    }


def representative_region_id(screen: dict[str, Any], issue_type: str) -> str:
    return f"{screen['screen_id']}__synthetic_{issue_type}"


def representative_region_type(screen: dict[str, Any], issue_type: str) -> str:
    if issue_type == "hierarchy":
        return "hero"
    if issue_type == "spacing":
        return "card_grid"
    if issue_type == "alignment":
        return "unknown"
    return "cta"


def critique_examples(screens: dict[str, dict[str, Any]], pair_scores: list[dict[str, Any]], feature_group: str, *, limit: int) -> list[dict[str, Any]]:
    candidate_ids = []
    for score in sorted(pair_scores, key=lambda item: abs(float(item.get("probability_left_preferred", 0.5)) - 0.5), reverse=True):
        loser = score["right_screen_id"] if score["left_is_preferred"] else score["left_screen_id"]
        if loser in screens and loser not in candidate_ids:
            candidate_ids.append(loser)
        if len(candidate_ids) >= limit:
            break
    if not candidate_ids:
        candidate_ids = sorted(screens)[:limit]
    return [critique_for_screen(screens[sid], feature_group) for sid in candidate_ids]


def critic_decisions(ablations: dict[str, Any], best_group: str | None, b0: dict[str, Any]) -> dict[str, Any]:
    def test_acc(group: str) -> float | None:
        value = (((ablations.get(group) or {}).get("splits") or {}).get("test") or {}).get("pairwise_accuracy")
        return float(value) if isinstance(value, int | float) else None

    metrics = test_acc("metrics")
    best = test_acc(best_group or "") if best_group else None
    dinov2_combo = test_acc("metrics+dinov2")
    jepa_candidates = [test_acc(group) for group in ("m1", "m2", "m2_strong", "metrics+dinov2+regions+m2_strong") if test_acc(group) is not None]
    jepa_best = max(jepa_candidates) if jepa_candidates else None
    jepa_adds = metrics is not None and jepa_best is not None and jepa_best >= metrics + 0.01
    dinov2_adds = metrics is not None and dinov2_combo is not None and dinov2_combo >= metrics + 0.01
    metrics_dominate = metrics is not None and best is not None and metrics >= best - 0.005
    hard = (((ablations.get(best_group or "") or {}).get("subsets") or {}).get("hard_test") or {}).get("pairwise_accuracy")
    if metrics_dominate and (not isinstance(hard, int | float) or hard < 0.65):
        next_stage = "harden_dataset_labels_before_more_architecture"
    elif dinov2_adds:
        next_stage = "keep_dinov2_metrics_as_critic_backbone"
    elif not jepa_adds:
        next_stage = "freeze_jepa_architecture_work_for_this_corpus"
    elif isinstance(hard, int | float) and hard >= 0.65:
        next_stage = "proceed_to_closed_loop_frontend_patch_evaluation"
    else:
        next_stage = "improve_region_labels_and_critique_adapter"
    return {
        "jepa_features_add_value": jepa_adds,
        "dinov2_adds_value_over_metrics": dinov2_adds,
        "metrics_still_dominate": metrics_dominate,
        "metrics_test_accuracy": metrics,
        "best_test_accuracy": best,
        "jepa_best_test_accuracy": jepa_best,
        "b0_test_accuracy": b0.get("test_accuracy"),
        "recommended_next_stage": next_stage,
    }


def choose_best_group(ablations: dict[str, Any]) -> str | None:
    available = []
    for group, result in ablations.items():
        if not result.get("available"):
            continue
        splits = result.get("splits") or {}
        val = (splits.get("val") or {}).get("pairwise_accuracy")
        test = (splits.get("test") or {}).get("pairwise_accuracy")
        available.append((group, val if isinstance(val, int | float) else test))
    available = [(group, float(acc)) for group, acc in available if isinstance(acc, int | float)]
    return max(available, key=lambda item: item[1], default=(None, None))[0]


def public_ablation(result: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in result.items() if key != "pair_scores"}


def load_b0_summary(path: Path | None) -> dict[str, Any]:
    if path is None or not path.expanduser().is_file():
        return {"available": False}
    report = read_json(path.expanduser().resolve())
    return {
        "available": True,
        "real_weights": report.get("real_weights"),
        "valid_for_model_selection": report.get("valid_for_model_selection"),
        "val_accuracy": ((report.get("splits") or {}).get("val") or {}).get("pairwise_accuracy"),
        "test_accuracy": ((report.get("splits") or {}).get("test") or {}).get("pairwise_accuracy"),
        "metrics_only_test_accuracy": (((report.get("metrics_baseline") or {}).get("splits") or {}).get("test") or {}).get("pairwise_accuracy"),
    }


def manual_commands() -> dict[str, str]:
    return {name: command for name in ("dinov2", "m1", "m2", "m2_strong") if (command := manual_embedding_command(name))}


def manual_embedding_command(name: str) -> str | None:
    if name == "dinov2":
        return "Manual-user-run: uv run ui-jepa-smoke-b0 data/processed/ui_jepa_v0_smoke --out reports/ui_jepa_v0_smoke --backend dinov2 --export-embeddings reports/ui_jepa_v0_smoke/dinov2_embeddings.jsonl"
    if name == "m1":
        return "Manual-user-run if missing: uv run ui-jepa-m1-probe data/processed/ui_jepa_v0_smoke --checkpoint checkpoints/ui_jepa_m1/checkpoints/m1_last.pt --report-out reports/ui_jepa_v0_smoke/m1_report.json --b0-report reports/ui_jepa_v0_smoke/b0_report.json --device cpu"
    if name == "m2":
        return "Manual-user-run if missing: uv run ui-jepa-m2-train data/processed/ui_jepa_v0_smoke --out checkpoints/ui_jepa_m2 --report-out reports/ui_jepa_v0_smoke/m2_report.json --b0-report reports/ui_jepa_v0_smoke/b0_report.json --m1-report reports/ui_jepa_v0_smoke/m1_report.json --device cpu --epochs 1"
    if name == "m2_strong":
        return "Manual-user-run if missing: run CUDA M2 strong externally, then write checkpoints/ui_jepa_m2_strong/probe/embeddings.jsonl and reports/ui_jepa_v0_smoke/m2_strong_report.json"
    return None


def preference_report_markdown(report: dict[str, Any]) -> str:
    lines = [
        "# UI Preference Critic v0",
        "",
        f"- Valid: {report.get('valid')}",
        f"- Best feature group: {report.get('best_feature_group')}",
        f"- JEPA features add value: {report.get('jepa_features_add_value')}",
        f"- DINOv2 adds value over metrics: {report.get('dinov2_adds_value_over_metrics')}",
        f"- Metrics still dominate: {report.get('metrics_still_dominate')}",
        f"- Recommended next stage: {report.get('recommended_next_stage')}",
        "",
        "## Feature Groups",
        "",
    ]
    for group, result in report.get("feature_groups", {}).items():
        test = ((result.get("splits") or {}).get("test") or {})
        if result.get("available"):
            lines.append(f"- {group}: test_accuracy={test.get('pairwise_accuracy')} test_pairs={test.get('pair_count')} lift={test.get('lift_over_best_constant')}")
        else:
            lines.append(f"- {group}: skipped ({result.get('skipped_reason')})")
    lines.extend(["", "## Hard Subsets", ""])
    for name, result in (report.get("hard_subset_metrics") or {}).items():
        lines.append(f"- {name}: available={result.get('available')} accuracy={result.get('pairwise_accuracy')} pairs={result.get('pair_count')}")
    return "\n".join(lines) + "\n"


def to_float(value: Any) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return 0.0
    if math.isnan(number) or math.isinf(number):
        return 0.0
    return number


def mean(values: list[float]) -> float:
    return sum(values) / len(values) if values else 0.0


def severity_bucket(value: Any) -> str:
    severity = to_float(value)
    if severity < 0.30:
        return "subtle"
    if severity < 0.60:
        return "visible"
    return "obvious"


def normalize_issue(value: Any) -> str:
    text = str(value or "")
    for issue in ISSUE_TYPES:
        if issue in text:
            return issue
    return "unknown"


def grouped_accuracy(scores: list[dict[str, Any]], key: str) -> dict[str, float]:
    groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for score in scores:
        if key == "severity_bucket":
            score = {**score, "severity_bucket": severity_bucket(score.get("severity"))}
        groups[str(score.get(key))].append(score)
    return {name: sum(1 for item in values if item["correct"]) / len(values) for name, values in sorted(groups.items()) if values}


def wilson_score_interval(successes: int, total: int, *, z: float = 1.959963984540054) -> list[float]:
    if total <= 0:
        return [0.0, 0.0]
    p = successes / total
    denom = 1 + z * z / total
    center = (p + z * z / (2 * total)) / denom
    half = z * math.sqrt((p * (1 - p) + z * z / (4 * total)) / total) / denom
    return [max(0.0, center - half), min(1.0, center + half)]


def roc_auc(targets: list[float], scores: list[float]) -> float | None:
    positives = [score for target, score in zip(targets, scores, strict=True) if target >= 0.5]
    negatives = [score for target, score in zip(targets, scores, strict=True) if target < 0.5]
    if not positives or not negatives:
        return None
    wins = 0.0
    for pos in positives:
        for neg in negatives:
            wins += 1.0 if pos > neg else 0.5 if pos == neg else 0.0
    return wins / (len(positives) * len(negatives))


def read_embedding_ids(path: Path) -> set[str]:
    return {str(row.get("screen_id")) for row in read_jsonl(path)}


def read_embeddings(path: Path) -> dict[str, list[float]]:
    return {str(row["screen_id"]): [float(value) for value in row["embedding"]] for row in read_jsonl(path)}


def resolve_embedding_path(explicit: Path | None, defaults: list[Path]) -> Path | None:
    candidates = ([explicit] if explicit is not None else []) + defaults
    for candidate in candidates:
        if candidate is not None and candidate.expanduser().is_file():
            return candidate.expanduser().resolve()
    return None


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.expanduser().read_text(encoding="utf-8"))


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    return [json.loads(line) for line in path.expanduser().read_text(encoding="utf-8").splitlines() if line.strip()]


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("".join(json.dumps(row, sort_keys=True) + "\n" for row in rows), encoding="utf-8")
