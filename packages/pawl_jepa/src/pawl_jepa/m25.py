"""M2.5 diagnostics and controlled M2 ablations for UI-JEPA smoke runs."""

from __future__ import annotations

import json
import math
import os
import re
import time
from collections import Counter, defaultdict
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

from pawl_jepa.m1 import (
    SPLITS,
    grouped_accuracy,
    lift,
    load_b0_comparison,
    seed_everything,
    severity_bucket,
)
from pawl_jepa.m2 import M2TrainConfig, train_m2
from pawl_jepa.manifest import write_json
from pawl_jepa.torch_utils import import_torch, resolve_device


M25_SCHEMA_VERSION = "ui_jepa_m25_diagnostics_report_v1"


@dataclass(frozen=True)
class M25Config:
    dataset_dir: Path
    output_dir: Path
    report_out: Path
    b0_report: Path | None = None
    m1_report: Path | None = None
    m2_report: Path | None = None
    m2_strong_report: Path | None = None
    run_stronger_m2: bool = True
    max_stronger_runs: int = 1
    stronger_epochs: int = 20
    batch_size: int = 32
    min_batch_size: int = 4
    probe_epochs: int = 80
    probe_lr: float = 0.05
    device: str = "auto"
    seed: int = 42
    smoke: bool = False
    smoke_limit: int = 96


def run_m25_ablation(config: M25Config) -> dict[str, Any]:
    start = time.perf_counter()
    torch = import_torch()
    seed_everything(torch, config.seed)
    dataset = load_dataset_metadata(config.dataset_dir)
    output_dir = config.output_dir.expanduser().resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    b0 = load_b0_comparison(config.b0_report)
    baseline_models = collect_existing_models(config)
    stronger_runs: list[dict[str, Any]] = []
    if config.run_stronger_m2:
        for stronger_config in stronger_m2_configs(config)[: max(0, config.max_stronger_runs)]:
            stronger_runs.append(run_stronger_m2_config(config, stronger_config))
    models = baseline_models + [model for run in stronger_runs for model in run.get("model_entries", [])]
    diagnostics = {}
    for model in models:
        embeddings_path = Path(str(model["embeddings_path"]))
        if not embeddings_path.is_file():
            diagnostics[model["name"]] = {"available": False, "skipped_reason": f"missing embeddings: {embeddings_path}"}
            continue
        embeddings = read_embeddings(embeddings_path)
        diagnostics[model["name"]] = diagnose_embedding_model(
            torch,
            dataset,
            embeddings,
            seed=config.seed,
            probe_epochs=config.probe_epochs,
            probe_lr=config.probe_lr,
        )
    metrics_features = build_metrics_features(dataset)
    diagnostics["metrics_only"] = diagnose_embedding_model(
        torch,
        dataset,
        metrics_features,
        seed=config.seed,
        probe_epochs=config.probe_epochs,
        probe_lr=config.probe_lr,
        feature_kind="metrics_only",
    )
    model_summary = summarize_model_evidence(diagnostics, models, b0)
    interpretation = interpret_m25(model_summary, stronger_runs)
    report = {
        "schema_version": M25_SCHEMA_VERSION,
        "dataset_dir": str(config.dataset_dir.expanduser().resolve()),
        "output_dir": str(output_dir),
        "config": public_config(config),
        "dataset_counts": {
            "screens": len(dataset["screens"]),
            "pairs": len(dataset["pairs"]),
            "regions": len(dataset["regions"]),
        },
        "baselines": {
            "b0_dinov2": b0,
            "metrics_only_preference": b0.get("metrics_only") if b0.get("available") else None,
        },
        "planned_stronger_m2_configs": stronger_m2_configs(config),
        "stronger_m2_runs": stronger_runs,
        "models": models + [{"name": "metrics_only", "kind": "metrics_only", "valid": True}],
        "diagnostics": diagnostics,
        "summary": model_summary,
        "interpretation": interpretation,
        "useful_representation_signal": bool(model_summary.get("best_m2_family_diagnostic_signal", {}).get("useful")),
        "dom_aware_recommended": bool(interpretation.get("dom_aware_recommended")),
        "recommended_decision": interpretation.get("decision"),
        "runtime_seconds": round(time.perf_counter() - start, 4),
        "commands": {"run": " ".join(os.sys.argv)},
    }
    write_json(config.report_out.expanduser().resolve(), report)
    config.report_out.with_suffix(".md").write_text(m25_markdown(report), encoding="utf-8")
    return report


def collect_existing_models(config: M25Config) -> list[dict[str, Any]]:
    models = []
    for name, kind, report_path in (
        ("m1_random_block_jepa", "m1", config.m1_report),
        ("m2_semantic_region_jepa", "m2", config.m2_report),
    ):
        if report_path is None or not report_path.expanduser().is_file():
            continue
        report = json.loads(report_path.expanduser().read_text(encoding="utf-8"))
        checkpoint = Path(str(report.get("checkpoint_path", ""))).expanduser()
        run_dir = checkpoint.parents[1] if len(checkpoint.parents) >= 2 else checkpoint.parent
        embeddings_path = run_dir / "probe" / "embeddings.jsonl"
        probe = report.get("probe") or {}
        models.append(
            {
                "name": name,
                "kind": kind,
                "report_path": str(report_path.expanduser().resolve()),
                "checkpoint_path": str(checkpoint),
                "embeddings_path": str(embeddings_path),
                "valid": bool(report.get(f"valid_{kind}_baseline")),
                "final_train_jepa_loss": report.get("final_train_jepa_loss"),
                "final_val_jepa_loss": report.get("final_val_jepa_loss"),
                "preference_probe": probe.get("splits") or {},
                "collapse_valid": (report.get("collapse_diagnostics") or {}).get("valid"),
                "strength": model_strength(report),
            }
        )
    m2_strong_report = resolve_m2_strong_report(config)
    if m2_strong_report is not None:
        report = json.loads(m2_strong_report.read_text(encoding="utf-8"))
        checkpoint = Path(str(report.get("checkpoint_path", ""))).expanduser()
        run_dir = checkpoint.parents[1] if len(checkpoint.parents) >= 2 else checkpoint.parent
        probe = report.get("probe") or {}
        models.append(
            {
                "name": "m2_strong_manual_cuda",
                "kind": "m2_strong_manual",
                "report_path": str(m2_strong_report.resolve()),
                "checkpoint_path": str(checkpoint),
                "embeddings_path": str(run_dir / "probe" / "embeddings.jsonl"),
                "valid": valid_m2_evidence(report),
                "final_train_jepa_loss": report.get("final_train_jepa_loss"),
                "final_val_jepa_loss": report.get("final_val_jepa_loss"),
                "preference_probe": probe.get("splits") or {},
                "collapse_valid": (report.get("collapse_diagnostics") or {}).get("valid"),
                "manual_external": True,
                "strength": model_strength(report),
            }
        )
    return models


def resolve_m2_strong_report(config: M25Config) -> Path | None:
    candidates = []
    if config.m2_strong_report is not None:
        candidates.append(config.m2_strong_report.expanduser())
    if config.m2_report is not None:
        candidates.append(config.m2_report.expanduser().parent / "m2_strong_report.json")
    candidates.append(config.report_out.expanduser().parent / "m2_strong_report.json")
    for candidate in candidates:
        if candidate.is_file():
            return candidate.resolve()
    return None


def valid_m2_evidence(report: dict[str, Any]) -> bool:
    return bool(
        report.get("valid_m2_baseline")
        and (report.get("collapse_diagnostics") or {}).get("valid")
        and (report.get("probe") or {}).get("available")
        and (report.get("comparison") or {}).get("valid")
    )


def model_strength(report: dict[str, Any]) -> dict[str, Any]:
    model_config = report.get("model_config") or {}
    command = str((report.get("commands") or {}).get("train") or "")
    epochs = None
    match = re.search(r"--epochs\s+(\d+)", command)
    if match:
        epochs = int(match.group(1))
    test_accuracy = ((((report.get("probe") or {}).get("splits") or {}).get("test") or {}).get("pairwise_accuracy"))
    comparison = report.get("comparison") or {}
    return {
        "image_size": model_config.get("image_size"),
        "embedding_dim": model_config.get("embedding_dim"),
        "epochs": epochs,
        "device": "cuda" if "device cuda" in command or "--device cuda" in command else None,
        "test_accuracy": test_accuracy,
        "near_chance": isinstance(test_accuracy, int | float) and abs(float(test_accuracy) - 0.5) <= 0.03,
        "metrics_only_still_dominates": comparison.get("metrics_only_still_dominates"),
    }


def stronger_m2_configs(config: M25Config) -> list[dict[str, Any]]:
    return [
        {
            "name": f"m2_stronger_128_d128_r2_e{config.stronger_epochs}",
            "image_size": 128,
            "embedding_dim": 128,
            "predictor_hidden_dim": 256,
            "transformer_layers": 2,
            "transformer_heads": 4,
            "target_regions": 2,
            "min_region_area_ratio": 0.003,
            "max_region_area_ratio": 0.60,
            "epochs": config.stronger_epochs,
        },
        {
            "name": f"m2_region_count_3_128_d128_e{config.stronger_epochs}",
            "image_size": 128,
            "embedding_dim": 128,
            "predictor_hidden_dim": 256,
            "transformer_layers": 2,
            "transformer_heads": 4,
            "target_regions": 3,
            "min_region_area_ratio": 0.003,
            "max_region_area_ratio": 0.55,
            "epochs": config.stronger_epochs,
        },
        {
            "name": f"m2_stronger_224_d256_r2_e{config.stronger_epochs}",
            "image_size": 224,
            "embedding_dim": 256,
            "predictor_hidden_dim": 512,
            "transformer_layers": 3,
            "transformer_heads": 8,
            "target_regions": 2,
            "min_region_area_ratio": 0.002,
            "max_region_area_ratio": 0.55,
            "epochs": config.stronger_epochs,
        },
    ]


def run_stronger_m2_config(config: M25Config, m2_config: dict[str, Any]) -> dict[str, Any]:
    torch = import_torch()
    try:
        requested_device = str(resolve_device(config.device))
    except Exception as exc:
        return {
            "name": m2_config["name"],
            "status": "failed",
            "requested_device": config.device,
            "config": m2_config,
            "failures": [{"batch_size": config.batch_size, "error": str(exc)}],
            "failure_reason": str(exc),
            "model_entries": [],
        }
    batch_size = config.batch_size
    failures = []
    if requested_device == "cuda" and hasattr(torch.cuda, "empty_cache"):
        torch.cuda.empty_cache()
    while batch_size >= config.min_batch_size:
        run_dir = config.output_dir.expanduser().resolve() / "stronger_m2" / m2_config["name"] / f"bs{batch_size}"
        report_out = run_dir / "m2_report.json"
        try:
            result = train_m2(
                M2TrainConfig(
                    dataset_dir=config.dataset_dir,
                    output_dir=run_dir,
                    report_out=report_out,
                    b0_report=config.b0_report,
                    m1_report=config.m1_report,
                    epochs=int(m2_config["epochs"]),
                    batch_size=batch_size,
                    device=config.device,
                    image_size=int(m2_config["image_size"]),
                    patch_size=16,
                    embedding_dim=int(m2_config["embedding_dim"]),
                    predictor_hidden_dim=int(m2_config["predictor_hidden_dim"]),
                    transformer_layers=int(m2_config["transformer_layers"]),
                    transformer_heads=int(m2_config["transformer_heads"]),
                    target_regions=int(m2_config["target_regions"]),
                    min_region_area_ratio=float(m2_config["min_region_area_ratio"]),
                    max_region_area_ratio=float(m2_config["max_region_area_ratio"]),
                    seed=config.seed,
                    smoke=config.smoke,
                    smoke_limit=config.smoke_limit,
                    probe_epochs=config.probe_epochs,
                    probe_lr=config.probe_lr,
                )
            )
            return {
                "name": m2_config["name"],
                "status": "success",
                "requested_device": requested_device,
                "resolved_batch_size": batch_size,
                "config": m2_config,
                "report_path": str(result.report_json_path),
                "checkpoint_path": str(result.checkpoint_path),
                "model_entries": [
                    {
                        "name": m2_config["name"],
                        "kind": "m2_stronger",
                        "report_path": str(result.report_json_path),
                        "checkpoint_path": str(result.checkpoint_path),
                        "embeddings_path": str(run_dir / "probe" / "embeddings.jsonl"),
                        "valid": bool(result.report.get("valid_m2_baseline")),
                        "final_train_jepa_loss": result.report.get("final_train_jepa_loss"),
                        "final_val_jepa_loss": result.report.get("final_val_jepa_loss"),
                        "preference_probe": (result.report.get("probe") or {}).get("splits") or {},
                        "collapse_valid": (result.report.get("collapse_diagnostics") or {}).get("valid"),
                    }
                ],
            }
        except RuntimeError as exc:
            message = str(exc)
            failures.append({"batch_size": batch_size, "error": message})
            if "out of memory" not in message.lower() and "cuda" not in message.lower():
                break
            if requested_device == "cuda" and hasattr(torch.cuda, "empty_cache"):
                torch.cuda.empty_cache()
            batch_size //= 2
    return {
        "name": m2_config["name"],
        "status": "failed",
        "requested_device": requested_device,
        "config": m2_config,
        "failures": failures,
        "failure_reason": failures[-1]["error"] if failures else "not attempted",
        "model_entries": [],
    }


def load_dataset_metadata(dataset_dir: Path) -> dict[str, Any]:
    dataset_dir = dataset_dir.expanduser().resolve()
    manifest = read_jsonl(dataset_dir / "manifest.jsonl")
    pairs = read_jsonl(dataset_dir / "pairs.jsonl")
    regions = read_jsonl(dataset_dir / "regions.jsonl")
    tokens = read_jsonl(dataset_dir / "design_tokens.jsonl")
    splits = json.loads((dataset_dir / "splits.json").read_text(encoding="utf-8"))
    split_by_screen = {
        screen_id: split for split, values in (splits.get("screen_ids") or {}).items() for screen_id in values
    }
    corruption_by_screen: dict[str, dict[str, Any]] = {}
    for pair in pairs:
        for side in ("left_screen_id", "right_screen_id"):
            screen_id = str(pair.get(side))
            if screen_id == str(pair.get("preferred_screen_id")) and pair.get("pair_family") == "original_vs_corrupted":
                continue
            if not bool(next((m for m in manifest if str(m.get("screen_id")) == screen_id), {}).get("is_corrupted")):
                continue
            current = corruption_by_screen.setdefault(screen_id, {"severities": [], "corruption_types": []})
            current["severities"].append(float(pair.get("severity") or 0.0))
            current["corruption_types"].append(str(pair.get("corruption_type") or infer_corruption_type(screen_id)))
    regions_by_screen: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for region in regions:
        regions_by_screen[str(region.get("screen_id"))].append(region)
    screens = {}
    for record in manifest:
        screen_id = str(record["screen_id"])
        corruption = corruption_by_screen.get(screen_id, {})
        region_types = [str(region.get("region_type", "unknown")) for region in regions_by_screen.get(screen_id, [])]
        screens[screen_id] = {
            "screen_id": screen_id,
            "split": split_by_screen.get(screen_id, "train"),
            "split_group": str(record.get("split_group") or record.get("split_group_id") or ""),
            "template_id": str(record.get("template_id") or record.get("split_group") or ""),
            "is_corrupted": bool(record.get("is_corrupted")),
            "corruption_type": most_common(corruption.get("corruption_types")) if record.get("is_corrupted") else "original",
            "severity": max(corruption.get("severities") or [0.0]) if record.get("is_corrupted") else 0.0,
            "region_types": sorted(set(region_types)),
            "dominant_region_types": [name for name, _ in Counter(region_types).most_common(3)],
            "metrics_path": Path(str(record.get("metrics_path"))),
        }
    return {
        "dataset_dir": dataset_dir,
        "manifest": manifest,
        "pairs": pairs,
        "regions": regions,
        "tokens": {str(token.get("screen_id")): token for token in tokens},
        "splits": splits,
        "screens": screens,
    }


def diagnose_embedding_model(
    torch,
    dataset: dict[str, Any],
    embeddings: dict[str, list[float]],
    *,
    seed: int,
    probe_epochs: int,
    probe_lr: float,
    feature_kind: str = "embedding",
) -> dict[str, Any]:
    common_ids = sorted(set(dataset["screens"]) & set(embeddings))
    if not common_ids:
        return {"available": False, "skipped_reason": "no common screen ids"}
    screen_tasks = {
        "original_vs_corrupted": linear_classification_probe(
            torch,
            common_ids,
            embeddings,
            dataset,
            label_fn=lambda meta: "corrupted" if meta["is_corrupted"] else "original",
            seed=seed,
            epochs=probe_epochs,
            lr=probe_lr,
        ),
        "corruption_type_classification": linear_classification_probe(
            torch,
            [screen_id for screen_id in common_ids if dataset["screens"][screen_id]["is_corrupted"]],
            embeddings,
            dataset,
            label_fn=lambda meta: meta["corruption_type"],
            seed=seed,
            epochs=probe_epochs,
            lr=probe_lr,
        ),
        "severity_bucket_classification": linear_classification_probe(
            torch,
            [screen_id for screen_id in common_ids if dataset["screens"][screen_id]["is_corrupted"]],
            embeddings,
            dataset,
            label_fn=lambda meta: severity_bucket(meta["severity"]),
            seed=seed,
            epochs=probe_epochs,
            lr=probe_lr,
        ),
        "severity_regression": linear_regression_probe(
            torch,
            [screen_id for screen_id in common_ids if dataset["screens"][screen_id]["is_corrupted"]],
            embeddings,
            dataset,
            label_fn=lambda meta: float(meta["severity"]),
            seed=seed,
            epochs=probe_epochs,
            lr=probe_lr,
        ),
    }
    pair_tasks = {
        "original_side_detection": pair_original_side_probe(
            torch,
            embeddings,
            dataset,
            seed=seed,
            epochs=probe_epochs,
            lr=probe_lr,
        )
    }
    retrieval = nearest_neighbor_diagnostics(torch, common_ids, embeddings, dataset)
    signal = diagnostic_signal(screen_tasks, pair_tasks, retrieval)
    return {
        "available": True,
        "feature_kind": feature_kind,
        "screen_count": len(common_ids),
        "embedding_dim": len(next(iter(embeddings.values()))),
        "screen_probes": screen_tasks,
        "pair_probes": pair_tasks,
        "nearest_neighbor_metadata": retrieval,
        "diagnostic_signal": signal,
    }


def linear_classification_probe(torch, screen_ids, embeddings, dataset, *, label_fn, seed: int, epochs: int, lr: float) -> dict[str, Any]:
    rows = [(sid, label_fn(dataset["screens"][sid])) for sid in screen_ids if sid in embeddings]
    classes = sorted({label for _, label in rows})
    if len(classes) < 2:
        return {"available": False, "skipped_reason": "fewer than two classes"}
    class_to_index = {name: index for index, name in enumerate(classes)}
    train_ids = [sid for sid, _ in rows if dataset["screens"][sid]["split"] == "train"]
    if len(train_ids) < len(classes):
        return {"available": False, "skipped_reason": "too few train examples"}
    x_train, y_train, normalizer = screen_matrix(torch, train_ids, embeddings, dataset, label_fn, class_to_index=class_to_index)
    generator = torch.Generator().manual_seed(seed)
    model = torch.nn.Linear(x_train.shape[1], len(classes))
    torch.nn.init.xavier_uniform_(model.weight, generator=generator)
    torch.nn.init.zeros_(model.bias)
    optimizer = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=1e-4)
    for _ in range(max(0, epochs)):
        logits = model(x_train)
        loss_value = torch.nn.functional.cross_entropy(logits, y_train)
        optimizer.zero_grad(set_to_none=True)
        loss_value.backward()
        optimizer.step()
    scores = []
    with torch.no_grad():
        for sid, label in rows:
            x = normalize_vector(torch.tensor(embeddings[sid], dtype=torch.float32).unsqueeze(0), normalizer)
            pred = int(model(x).argmax(dim=1).item())
            meta = dataset["screens"][sid]
            scores.append(
                {
                    "screen_id": sid,
                    "split": meta["split"],
                    "target": label,
                    "prediction": classes[pred],
                    "correct": classes[pred] == label,
                    "corruption_type": meta["corruption_type"],
                    "severity_bucket": severity_bucket(meta["severity"]),
                }
            )
    return summarize_classification_scores(scores, classes)


def linear_regression_probe(torch, screen_ids, embeddings, dataset, *, label_fn, seed: int, epochs: int, lr: float) -> dict[str, Any]:
    rows = [(sid, float(label_fn(dataset["screens"][sid]))) for sid in screen_ids if sid in embeddings]
    train_ids = [sid for sid, _ in rows if dataset["screens"][sid]["split"] == "train"]
    if len(train_ids) < 4:
        return {"available": False, "skipped_reason": "too few train examples"}
    train_y_by_id = {sid: label for sid, label in rows}
    x_train, y_train, normalizer = regression_matrix(torch, train_ids, embeddings, train_y_by_id)
    generator = torch.Generator().manual_seed(seed)
    model = torch.nn.Linear(x_train.shape[1], 1)
    torch.nn.init.xavier_uniform_(model.weight, generator=generator)
    torch.nn.init.zeros_(model.bias)
    optimizer = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=1e-4)
    for _ in range(max(0, epochs)):
        pred = model(x_train).reshape(-1)
        loss_value = torch.nn.functional.mse_loss(pred, y_train)
        optimizer.zero_grad(set_to_none=True)
        loss_value.backward()
        optimizer.step()
    scores = []
    with torch.no_grad():
        for sid, target in rows:
            x = normalize_vector(torch.tensor(embeddings[sid], dtype=torch.float32).unsqueeze(0), normalizer)
            pred = float(model(x).reshape(()).item())
            meta = dataset["screens"][sid]
            scores.append({"screen_id": sid, "split": meta["split"], "target": target, "prediction": pred})
    return summarize_regression_scores(scores, train_mean=float(y_train.mean().item()))


def pair_original_side_probe(torch, embeddings, dataset, *, seed: int, epochs: int, lr: float) -> dict[str, Any]:
    examples = []
    for pair in dataset["pairs"]:
        left = str(pair.get("left_screen_id"))
        right = str(pair.get("right_screen_id"))
        if left not in embeddings or right not in embeddings:
            continue
        left_original = not dataset["screens"].get(left, {}).get("is_corrupted", True)
        right_original = not dataset["screens"].get(right, {}).get("is_corrupted", True)
        if left_original == right_original:
            continue
        split = pair_split(pair, dataset["splits"])
        examples.append(
            {
                "pair_id": str(pair.get("pair_id")),
                "split": split,
                "features": pair_features(torch, embeddings[left], embeddings[right]),
                "target": torch.tensor(1 if left_original else 0, dtype=torch.long),
                "public": {
                    "pair_id": pair.get("pair_id"),
                    "split": split,
                    "pair_family": pair.get("pair_family"),
                    "corruption_type": pair.get("corruption_type"),
                    "difficulty": pair.get("difficulty"),
                    "severity_bucket": severity_bucket(pair.get("severity")),
                    "left_is_preferred": bool(pair.get("left_is_preferred")),
                    "left_is_original": left_original,
                },
            }
        )
    train = [item for item in examples if item["split"] == "train"]
    if len(train) < 4:
        return {"available": False, "skipped_reason": "too few train original/corrupted pairs"}
    x_train = torch.stack([item["features"] for item in train])
    mean = x_train.mean(dim=0, keepdim=True)
    std = x_train.std(dim=0, unbiased=False, keepdim=True).clamp_min(1e-6)
    x_train = (x_train - mean) / std
    y_train = torch.stack([item["target"] for item in train])
    model = torch.nn.Linear(x_train.shape[1], 2)
    generator = torch.Generator().manual_seed(seed)
    torch.nn.init.xavier_uniform_(model.weight, generator=generator)
    torch.nn.init.zeros_(model.bias)
    optimizer = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=1e-4)
    for _ in range(max(0, epochs)):
        loss_value = torch.nn.functional.cross_entropy(model(x_train), y_train)
        optimizer.zero_grad(set_to_none=True)
        loss_value.backward()
        optimizer.step()
    scores = []
    with torch.no_grad():
        for item in examples:
            pred = int(model(((item["features"].unsqueeze(0) - mean) / std)).argmax(dim=1).item())
            scores.append({**item["public"], "prediction_left_is_original": pred == 1, "correct": pred == int(item["target"].item())})
    return {"available": True, "splits": summarize_pair_scores(scores), "score_count": len(scores)}


def nearest_neighbor_diagnostics(torch, screen_ids, embeddings, dataset) -> dict[str, Any]:
    if len(screen_ids) < 2:
        return {"available": False, "skipped_reason": "fewer than two screens"}
    matrix = torch.tensor([embeddings[sid] for sid in screen_ids], dtype=torch.float32)
    matrix = torch.nn.functional.normalize(matrix, dim=1)
    cosine = matrix @ matrix.T
    cosine.fill_diagonal_(-2.0)
    topk = torch.topk(cosine, k=min(5, len(screen_ids) - 1), dim=1).indices.tolist()
    rows = []
    for index, sid in enumerate(screen_ids):
        meta = dataset["screens"][sid]
        nn_ids = [screen_ids[nn_index] for nn_index in topk[index]]
        first = dataset["screens"][nn_ids[0]]
        region_jaccard = jaccard(meta["region_types"], first["region_types"])
        rows.append(
            {
                "screen_id": sid,
                "nearest_neighbor_screen_id": nn_ids[0],
                "split": meta["split"],
                "same_template_at_1": meta["template_id"] == first["template_id"],
                "same_corruption_type_at_1": meta["corruption_type"] == first["corruption_type"],
                "same_originalness_at_1": meta["is_corrupted"] == first["is_corrupted"],
                "region_type_jaccard_at_1": region_jaccard,
                "region_types": meta["dominant_region_types"],
                "neighbor_region_types": first["dominant_region_types"],
                "top5_screen_ids": nn_ids,
            }
        )
    by_region = {}
    all_types = sorted({region_type for sid in screen_ids for region_type in dataset["screens"][sid]["region_types"]})
    for region_type in all_types:
        carriers = [row for row in rows if region_type in dataset["screens"][row["screen_id"]]["region_types"]]
        if not carriers:
            continue
        by_region[region_type] = {
            "screen_count": len(carriers),
            "recall_at_1": sum(1 for row in carriers if region_type in dataset["screens"][row["nearest_neighbor_screen_id"]]["region_types"]) / len(carriers),
            "recall_at_5": sum(
                1
                for row in carriers
                if any(region_type in dataset["screens"][candidate]["region_types"] for candidate in row["top5_screen_ids"])
            )
            / len(carriers),
        }
    return {
        "available": True,
        "same_template_recall_at_1": sum(1 for row in rows if row["same_template_at_1"]) / len(rows),
        "same_corruption_type_recall_at_1": sum(1 for row in rows if row["same_corruption_type_at_1"]) / len(rows),
        "same_originalness_recall_at_1": sum(1 for row in rows if row["same_originalness_at_1"]) / len(rows),
        "mean_region_type_jaccard_at_1": sum(row["region_type_jaccard_at_1"] for row in rows) / len(rows),
        "region_type_retrieval": by_region,
        "examples": rows[:12],
    }


def summarize_model_evidence(diagnostics: dict[str, Any], models: list[dict[str, Any]], b0: dict[str, Any]) -> dict[str, Any]:
    model_by_name = {model["name"]: model for model in models}
    rows = []
    for name, diag in diagnostics.items():
        if name == "metrics_only" or not diag.get("available"):
            continue
        signal = diag.get("diagnostic_signal") or {}
        model = model_by_name.get(name, {})
        pref_test = (((model.get("preference_probe") or {}).get("test") or {}).get("pairwise_accuracy"))
        rows.append(
            {
                "name": name,
                "kind": model.get("kind"),
                "valid": model.get("valid"),
                "preference_test_accuracy": pref_test,
                "final_val_jepa_loss": model.get("final_val_jepa_loss"),
                "best_diagnostic_task": signal.get("best_task"),
                "best_diagnostic_lift": signal.get("best_lift"),
                "useful": signal.get("useful"),
                "manual_external": model.get("manual_external", False),
                "strength": model.get("strength") or {},
            }
        )
    best = max(rows, key=lambda item: float(item.get("best_diagnostic_lift") or -999.0), default={})
    m2_rows = [row for row in rows if is_m2_family_kind(row.get("kind"))]
    best_m2_family = max(m2_rows, key=lambda item: float(item.get("best_diagnostic_lift") or -999.0), default={})
    best_pref = max(rows, key=lambda item: float(item.get("preference_test_accuracy") or -999.0), default={})
    metrics_diag = diagnostics.get("metrics_only", {})
    strongest_m2 = strongest_m2_evidence(models)
    return {
        "models": rows,
        "best_jepa_diagnostic_signal": best,
        "best_m2_family_diagnostic_signal": best_m2_family,
        "best_jepa_preference_signal": best_pref,
        "strongest_m2_evidence": strongest_m2,
        "b0_test_accuracy": b0.get("b0_test_accuracy"),
        "metrics_only_test_accuracy": (b0.get("metrics_only") or {}).get("test_accuracy"),
        "metrics_only_diagnostic_signal": (metrics_diag.get("diagnostic_signal") or {}),
    }


def is_m2_family_kind(kind: Any) -> bool:
    return str(kind) in {"m2", "m2_stronger", "m2_strong_manual"}


def strongest_m2_evidence(models: list[dict[str, Any]]) -> dict[str, Any]:
    candidates = [model for model in models if is_m2_family_kind(model.get("kind")) and model.get("valid")]
    if not candidates:
        return {"available": False}

    def sort_key(model: dict[str, Any]) -> tuple[int, int, int, int]:
        strength = model.get("strength") or {}
        return (
            1 if model.get("manual_external") else 0,
            int(strength.get("epochs") or 0),
            int(strength.get("image_size") or 0),
            int(strength.get("embedding_dim") or 0),
        )

    strongest = max(candidates, key=sort_key)
    return {
        "available": True,
        "name": strongest.get("name"),
        "kind": strongest.get("kind"),
        "report_path": strongest.get("report_path"),
        "valid": bool(strongest.get("valid")),
        "manual_external": bool(strongest.get("manual_external")),
        "collapse_valid": strongest.get("collapse_valid"),
        "preference_test_accuracy": (((strongest.get("preference_probe") or {}).get("test") or {}).get("pairwise_accuracy")),
        "strength": strongest.get("strength") or {},
    }


def interpret_m25(summary: dict[str, Any], stronger_runs: list[dict[str, Any]]) -> dict[str, Any]:
    best_diag = summary.get("best_m2_family_diagnostic_signal") or {}
    best_pref = summary.get("best_jepa_preference_signal") or {}
    metrics_test = summary.get("metrics_only_test_accuracy")
    b0_test = summary.get("b0_test_accuracy")
    best_pref_acc = best_pref.get("preference_test_accuracy")
    useful_diag = bool(best_diag.get("useful"))
    strong_success = any(run.get("status") == "success" for run in stronger_runs)
    strong_failed = any(run.get("status") == "failed" for run in stronger_runs)
    metrics_dominates = isinstance(metrics_test, int | float) and isinstance(best_pref_acc, int | float) and float(metrics_test) > float(best_pref_acc)
    near_chance_pref = not isinstance(best_pref_acc, int | float) or abs(float(best_pref_acc) - 0.5) <= 0.03
    rules = {
        "jepa_loss_improves_but_probes_chance": "objective_not_aligned",
        "diagnostic_probes_work_but_preference_probe_fails": "preference_labels_are_metrics_or_style_specific",
        "all_probes_fail": "model_masking_or_training_insufficient",
        "stronger_m2_improves_over_m1": "continue_stronger_m2_or_dom_aware_probe",
        "metrics_only_dominates_all": "benchmark_is_synthetic_or_low_level_for_taste_research",
    }
    if useful_diag and near_chance_pref:
        decision = "harden_dataset_or_add_preference_aligned_objective"
        primary = rules["diagnostic_probes_work_but_preference_probe_fails"]
        dom_aware = False
    elif not useful_diag:
        decision = "change_objective_or_strengthen_training_before_dom_aware"
        primary = rules["all_probes_fail"]
        dom_aware = False
    elif metrics_dominates:
        decision = "harden_dataset_labels_before_dom_aware"
        primary = rules["metrics_only_dominates_all"]
        dom_aware = False
    elif useful_diag and isinstance(best_pref_acc, int | float) and isinstance(b0_test, int | float) and float(best_pref_acc) > float(b0_test):
        decision = "audit_benchmark_then_continue_jepa"
        primary = "jepa_beats_b0_audit_required"
        dom_aware = False
    else:
        decision = "continue_stronger_m2_before_dom_aware"
        primary = rules["stronger_m2_improves_over_m1"] if strong_success else "useful_representation_signal_without_clear_preference_lift"
        dom_aware = useful_diag and not near_chance_pref
    return {
        "rules": rules,
        "primary_interpretation": primary,
        "decision": decision,
        "dom_aware_recommended": dom_aware,
        "metrics_only_dominates_best_jepa_preference": metrics_dominates,
        "best_preference_near_chance": near_chance_pref,
        "stronger_m2_attempted": bool(stronger_runs),
        "stronger_m2_success": strong_success,
        "stronger_m2_failed": strong_failed,
        "stronger_m2_failure_requires_cuda_rerun": strong_failed and not strong_success,
    }


def diagnostic_signal(screen_tasks: dict[str, Any], pair_tasks: dict[str, Any], retrieval: dict[str, Any]) -> dict[str, Any]:
    candidates = []
    supervised = []
    for name, task in screen_tasks.items():
        if not task.get("available"):
            continue
        test = (task.get("splits") or {}).get("test") or {}
        if "accuracy" in test:
            supervised.append({"task": name, "lift": lift(test.get("accuracy"), test.get("best_constant_accuracy")), "score": test.get("accuracy")})
        elif "r2" in test:
            supervised.append({"task": name, "lift": test.get("r2"), "score": test.get("r2")})
    pair = (pair_tasks.get("original_side_detection") or {})
    if pair.get("available"):
        test = (pair.get("splits") or {}).get("test") or {}
        supervised.append({"task": "original_side_detection", "lift": lift(test.get("pairwise_accuracy"), test.get("best_constant_accuracy")), "score": test.get("pairwise_accuracy")})
    candidates.extend(supervised)
    if retrieval.get("available"):
        candidates.append({"task": "nearest_neighbor_same_corruption_type", "lift": float(retrieval.get("same_corruption_type_recall_at_1") or 0.0) - 0.25, "score": retrieval.get("same_corruption_type_recall_at_1")})
    best = max(supervised or candidates, key=lambda item: float(item.get("lift") or -999.0), default={})
    useful = isinstance(best.get("lift"), int | float) and float(best["lift"]) >= 0.08 and float(best.get("score") or 0.0) >= 0.58
    return {"useful": useful, "best_task": best.get("task"), "best_lift": best.get("lift"), "best_score": best.get("score"), "candidates": candidates}


def screen_matrix(torch, screen_ids, embeddings, dataset, label_fn, *, class_to_index):
    x = torch.tensor([embeddings[sid] for sid in screen_ids], dtype=torch.float32)
    y = torch.tensor([class_to_index[label_fn(dataset["screens"][sid])] for sid in screen_ids], dtype=torch.long)
    mean = x.mean(dim=0, keepdim=True)
    std = x.std(dim=0, unbiased=False, keepdim=True).clamp_min(1e-6)
    return (x - mean) / std, y, (mean, std)


def regression_matrix(torch, screen_ids, embeddings, labels_by_id):
    x = torch.tensor([embeddings[sid] for sid in screen_ids], dtype=torch.float32)
    y = torch.tensor([labels_by_id[sid] for sid in screen_ids], dtype=torch.float32)
    mean = x.mean(dim=0, keepdim=True)
    std = x.std(dim=0, unbiased=False, keepdim=True).clamp_min(1e-6)
    return (x - mean) / std, y, (mean, std)


def normalize_vector(vector, normalizer):
    mean, std = normalizer
    return (vector - mean) / std


def pair_features(torch, left, right):
    left_tensor = torch.tensor(left, dtype=torch.float32)
    right_tensor = torch.tensor(right, dtype=torch.float32)
    return torch.cat([left_tensor, right_tensor, torch.abs(left_tensor - right_tensor), left_tensor * right_tensor])


def summarize_classification_scores(scores: list[dict[str, Any]], classes: list[str]) -> dict[str, Any]:
    return {
        "available": True,
        "classes": classes,
        "splits": {split: summarize_classification_split([score for score in scores if score["split"] == split], classes) for split in SPLITS},
        "accuracy_by_corruption_type": grouped_accuracy(scores, "corruption_type"),
        "accuracy_by_severity": grouped_accuracy(scores, "severity_bucket"),
    }


def summarize_classification_split(scores: list[dict[str, Any]], classes: list[str]) -> dict[str, Any]:
    count = len(scores)
    accuracy = sum(1 for score in scores if score["correct"]) / count if count else None
    counts = Counter(score["target"] for score in scores)
    best_constant = max(counts.values()) / count if count else None
    f1s = []
    for cls in classes:
        tp = sum(1 for score in scores if score["target"] == cls and score["prediction"] == cls)
        fp = sum(1 for score in scores if score["target"] != cls and score["prediction"] == cls)
        fn = sum(1 for score in scores if score["target"] == cls and score["prediction"] != cls)
        precision = tp / (tp + fp) if tp + fp else 0.0
        recall = tp / (tp + fn) if tp + fn else 0.0
        f1s.append((2 * precision * recall / (precision + recall)) if precision + recall else 0.0)
    return {
        "screen_count": count,
        "accuracy": accuracy,
        "best_constant_accuracy": best_constant,
        "lift_over_best_constant": lift(accuracy, best_constant),
        "macro_f1": sum(f1s) / len(f1s) if f1s else None,
    }


def summarize_regression_scores(scores: list[dict[str, Any]], *, train_mean: float) -> dict[str, Any]:
    return {"available": True, "splits": {split: summarize_regression_split([score for score in scores if score["split"] == split], train_mean) for split in SPLITS}}


def summarize_regression_split(scores: list[dict[str, Any]], train_mean: float) -> dict[str, Any]:
    if not scores:
        return {"screen_count": 0, "mae": None, "mse": None, "r2": None, "mean_baseline_mae": None}
    targets = [float(score["target"]) for score in scores]
    preds = [float(score["prediction"]) for score in scores]
    mae = sum(abs(pred - target) for pred, target in zip(preds, targets, strict=True)) / len(scores)
    mse = sum((pred - target) ** 2 for pred, target in zip(preds, targets, strict=True)) / len(scores)
    baseline_mae = sum(abs(train_mean - target) for target in targets) / len(scores)
    mean_target = sum(targets) / len(targets)
    ss_res = sum((pred - target) ** 2 for pred, target in zip(preds, targets, strict=True))
    ss_tot = sum((target - mean_target) ** 2 for target in targets)
    return {"screen_count": len(scores), "mae": mae, "mse": mse, "r2": 1.0 - ss_res / ss_tot if ss_tot else None, "mean_baseline_mae": baseline_mae}


def summarize_pair_scores(scores: list[dict[str, Any]]) -> dict[str, Any]:
    return {split: summarize_pair_split([score for score in scores if score["split"] == split]) for split in SPLITS}


def summarize_pair_split(scores: list[dict[str, Any]]) -> dict[str, Any]:
    count = len(scores)
    accuracy = sum(1 for score in scores if score["correct"]) / count if count else None
    left_original_rate = sum(1 for score in scores if score["prediction_left_is_original"]) / count if count else None
    true_left_original = sum(1 for score in scores if score["left_is_original"]) / count if count else None
    best_constant = max(true_left_original or 0.0, 1.0 - (true_left_original or 0.0)) if count else None
    return {
        "pair_count": count,
        "pairwise_accuracy": accuracy,
        "best_constant_accuracy": best_constant,
        "lift_over_best_constant": lift(accuracy, best_constant),
        "predicted_left_original_rate": left_original_rate,
        "accuracy_by_pair_family": grouped_accuracy(scores, "pair_family"),
        "accuracy_by_corruption_type": grouped_accuracy(scores, "corruption_type"),
        "accuracy_by_difficulty": grouped_accuracy(scores, "difficulty"),
        "accuracy_by_severity": grouped_accuracy(scores, "severity_bucket"),
    }


def build_metrics_features(dataset: dict[str, Any]) -> dict[str, list[float]]:
    features = {}
    for screen_id, meta in dataset["screens"].items():
        metrics = json.loads(meta["metrics_path"].read_text(encoding="utf-8")) if meta["metrics_path"].is_file() else {}
        tokens = dataset["tokens"].get(screen_id) or {}
        features[screen_id] = [
            float(metrics.get("contrast_issue_count") or 0.0),
            float(metrics.get("visible_element_count") or 0.0),
            float(metrics.get("font_size_ratio") or 0.0),
            float(metrics.get("min_font_size") or 0.0),
            float(metrics.get("max_font_size") or 0.0),
            float(metrics.get("min_contrast_ratio") or 0.0),
            float(metrics.get("median_element_area") or 0.0),
            float(metrics.get("hierarchy_warning_count") or 0.0),
            float(metrics.get("viewport_fill_ratio") or 0.0),
            1.0 if metrics.get("has_horizontal_overflow") else 0.0,
            1.0 if metrics.get("has_vertical_overflow") else 0.0,
            float(((tokens.get("spacing") or {}).get("spacing_consistency_score")) or 0.0),
            float(((tokens.get("layout") or {}).get("visible_element_count")) or 0.0),
            float(((tokens.get("shape") or {}).get("shadow_levels")) or 0.0),
            float(tokens.get("shadow_elevation_hints") or 0.0),
        ]
    return features


def read_embeddings(path: Path) -> dict[str, list[float]]:
    rows = read_jsonl(path)
    return {str(row["screen_id"]): [float(value) for value in row["embedding"]] for row in rows}


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    return [json.loads(line) for line in path.expanduser().read_text(encoding="utf-8").splitlines() if line.strip()]


def pair_split(pair: dict[str, Any], splits: dict[str, Any]) -> str:
    return (splits.get("pair_split_by_group") or {}).get(str(pair.get("split_group")), "train")


def infer_corruption_type(screen_id: str) -> str:
    match = re.search(r"__([a-z_]+)_bad_seed\d+", screen_id)
    return match.group(1) if match else "unknown"


def most_common(values) -> str:
    if not values:
        return "unknown"
    return Counter(values).most_common(1)[0][0]


def jaccard(left, right) -> float:
    left_set = set(left)
    right_set = set(right)
    if not left_set and not right_set:
        return 1.0
    return len(left_set & right_set) / len(left_set | right_set)


def public_config(config: M25Config) -> dict[str, Any]:
    payload = asdict(config)
    for key in ("dataset_dir", "output_dir", "report_out", "b0_report", "m1_report", "m2_report", "m2_strong_report"):
        if payload.get(key) is not None:
            payload[key] = str(payload[key])
    return payload


def m25_markdown(report: dict[str, Any]) -> str:
    summary = report.get("summary") or {}
    interp = report.get("interpretation") or {}
    lines = [
        "# UI-JEPA M2.5 Diagnostics",
        "",
        f"- Useful representation signal: {report.get('useful_representation_signal')}",
        f"- DOM-aware recommended: {report.get('dom_aware_recommended')}",
        f"- Decision: {report.get('recommended_decision')}",
        f"- Primary interpretation: {interp.get('primary_interpretation')}",
        f"- B0 test accuracy: {summary.get('b0_test_accuracy')}",
        f"- Metrics-only test accuracy: {summary.get('metrics_only_test_accuracy')}",
    ]
    strongest = summary.get("strongest_m2_evidence") or {}
    if strongest.get("available"):
        strength = strongest.get("strength") or {}
        lines.extend(
            [
                f"- Strongest M2 evidence: {strongest.get('name')} valid={strongest.get('valid')} manual={strongest.get('manual_external')}",
                f"- Strongest M2 config: image_size={strength.get('image_size')} embedding_dim={strength.get('embedding_dim')} epochs={strength.get('epochs')} device={strength.get('device')}",
                f"- Strongest M2 preference test accuracy: {strongest.get('preference_test_accuracy')}",
            ]
        )
    lines.extend(["", "## JEPA Models", ""])
    for model in summary.get("models") or []:
        lines.append(
            f"- {model.get('name')}: preference_test={model.get('preference_test_accuracy')} "
            f"best_diag={model.get('best_diagnostic_task')} diag_lift={model.get('best_diagnostic_lift')} "
            f"useful={model.get('useful')}"
        )
    lines.extend(["", "## Stronger M2 Runs", ""])
    for run in report.get("stronger_m2_runs") or []:
        lines.append(f"- {run.get('name')}: {run.get('status')} batch={run.get('resolved_batch_size')} reason={run.get('failure_reason')}")
    return "\n".join(lines) + "\n"
