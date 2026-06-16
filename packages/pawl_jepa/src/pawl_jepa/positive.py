"""Positive-only Pawl-JEPA pretraining scaffold."""

from __future__ import annotations

import json
import random
import time
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Callable

from pawl_jepa.data import load_image_tensor
from pawl_jepa.manifest import write_json, write_jsonl
from pawl_jepa.model import ModelConfig, build_model
from pawl_jepa.torch_utils import import_torch, resolve_device
from pawl_jepa.train import seed_everything


POSITIVE_SPLITS = ("train", "val", "test")


@dataclass(frozen=True)
class PositivePrepareConfig:
    dataset_dir: Path
    output_dir: Path


@dataclass(frozen=True)
class PositivePrepareResult:
    output_dir: Path
    manifest_path: Path
    split_paths: dict[str, Path]
    all_path: Path
    summary: dict[str, Any]


@dataclass(frozen=True)
class PositiveTrainConfig:
    manifest_dir: Path
    output_dir: Path
    epochs: int = 2
    batch_size: int = 8
    lr: float = 1e-3
    device: str = "auto"
    image_size: int = 224
    seed: int = 42
    embedding_dim: int = 64
    hidden_dim: int = 128
    progress_callback: Callable[[dict[str, Any]], None] | None = None


@dataclass(frozen=True)
class PositiveTrainResult:
    output_dir: Path
    config_path: Path
    checkpoint_path: Path
    metrics_path: Path
    summary_path: Path
    summary: dict[str, Any]


@dataclass(frozen=True)
class PositiveEvalConfig:
    run_dir: Path
    manifest_dir: Path
    output_dir: Path
    batch_size: int = 8
    device: str = "auto"
    image_size: int | None = None
    seed: int = 42
    collapse_variance_threshold: float = 1e-4
    progress_callback: Callable[[dict[str, Any]], None] | None = None


@dataclass(frozen=True)
class PositiveEvalResult:
    output_dir: Path
    summary_path: Path
    summary: dict[str, Any]


def prepare_positive_manifest(config: PositivePrepareConfig) -> PositivePrepareResult:
    dataset_dir = config.dataset_dir.expanduser().resolve()
    output_dir = config.output_dir.expanduser().resolve()
    dataset_path = dataset_dir / "dataset.json"
    if not dataset_path.is_file():
        raise ValueError(f"dataset.json is missing: {dataset_path}")
    dataset = json.loads(dataset_path.read_text(encoding="utf-8"))
    samples = [
        sample
        for sample in dataset.get("samples", [])
        if isinstance(sample, dict) and sample.get("status") == "ok"
    ]
    records = [positive_record(dataset, dataset_dir, sample) for sample in sorted(samples, key=lambda item: str(item.get("sample_id")))]
    splits = split_positive_records(records)

    output_dir.mkdir(parents=True, exist_ok=True)
    split_paths = {split: output_dir / f"{split}.jsonl" for split in POSITIVE_SPLITS}
    for split, path in split_paths.items():
        write_jsonl(path, splits[split])
    all_path = output_dir / "all.jsonl"
    write_jsonl(all_path, records)
    summary = {
        "schema_version": "pawl_jepa_positive_manifest_v1",
        "dataset_dir": str(dataset_dir),
        "dataset_id": str(dataset.get("dataset_id", dataset_dir.name)),
        "record_counts": {split: len(splits[split]) for split in POSITIVE_SPLITS},
        "total_records": len(records),
        "all_records_path": str(all_path),
        "source_dataset": {
            "sample_count": dataset.get("sample_count"),
            "failed_count": dataset.get("failed_count"),
            "metrics_summary": dataset.get("metrics_summary", {}),
            "warnings": dataset.get("warnings", []),
        },
        "split_policy": "deterministic_sorted_80_10_10",
    }
    manifest_path = output_dir / "manifest.json"
    write_json(manifest_path, summary)
    return PositivePrepareResult(output_dir, manifest_path, split_paths, all_path, summary)


def positive_record(dataset: dict[str, Any], dataset_dir: Path, sample: dict[str, Any]) -> dict[str, Any]:
    sample_id = str(sample["sample_id"])
    sample_dir = resolve_record_path(dataset_dir, sample.get("output_dir")) or (dataset_dir / "samples" / sample_id)
    return {
        "schema_version": "pawl_jepa_positive_record_v1",
        "dataset_id": str(dataset.get("dataset_id", dataset_dir.name)),
        "sample_id": sample_id,
        "source_path": str(sample.get("source_path")),
        "html_path": str(resolve_record_path(dataset_dir, sample.get("html_path")) or (sample_dir / "index.html")),
        "screenshot_path": str(resolve_record_path(dataset_dir, sample.get("screenshot_path")) or (sample_dir / "screenshot.png")),
        "dom_path": str(resolve_record_path(dataset_dir, sample.get("dom_path")) or (sample_dir / "dom.json")),
        "accessibility_path": str(resolve_record_path(dataset_dir, sample.get("accessibility_path")) or (sample_dir / "accessibility.json")),
        "metrics_path": str(resolve_record_path(dataset_dir, sample.get("metrics_path")) or (sample_dir / "metrics.json")),
    }


def split_positive_records(records: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    total = len(records)
    if total == 0:
        split_records = {"train": [], "val": [], "test": []}
        return {
            split: [{**record, "split": split} for record in split_records[split]]
            for split in POSITIVE_SPLITS
        }
    if total == 1:
        split_records = {"train": records, "val": [], "test": []}
        return {
            split: [{**record, "split": split} for record in split_records[split]]
            for split in POSITIVE_SPLITS
        }
    train_count = int(total * 0.8)
    val_count = int(total * 0.1)
    if total >= 3:
        train_count = max(1, min(train_count, total - 2))
        val_count = max(1, min(val_count, total - train_count - 1))
    test_start = train_count + val_count
    split_records = {
        "train": records[:train_count],
        "val": records[train_count:test_start],
        "test": records[test_start:],
    }
    return {
        split: [{**record, "split": split} for record in split_records[split]]
        for split in POSITIVE_SPLITS
    }


def resolve_record_path(base_dir: Path, raw_path: Any) -> Path | None:
    if not isinstance(raw_path, str) or not raw_path:
        return None
    path = Path(raw_path).expanduser()
    return path.resolve() if path.is_absolute() else (base_dir / path).resolve()


def load_positive_records(manifest_dir: Path, split: str = "all") -> list[dict[str, Any]]:
    manifest_dir = manifest_dir.expanduser().resolve()
    if split != "all" and split not in POSITIVE_SPLITS:
        raise ValueError(f"unsupported positive split: {split}")
    path = manifest_dir / ("all.jsonl" if split == "all" else f"{split}.jsonl")
    if not path.is_file():
        raise ValueError(f"positive manifest split is missing: {path}")
    return [
        json.loads(line)
        for line in path.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]


class PositivePawlJepaDataset:
    def __init__(self, manifest_dir: Path, *, split: str, image_size: int, seed: int = 42) -> None:
        self.records = load_positive_records(manifest_dir, split)
        self.image_size = image_size
        self.seed = seed

    def __len__(self) -> int:
        return len(self.records)

    def __getitem__(self, index: int) -> dict[str, Any]:
        record = self.records[index]
        path = Path(record["screenshot_path"])
        base = load_image_tensor(path, self.image_size + 8)
        return {
            "record": record,
            "view_a": augment_positive_tensor(base, self.image_size, seed=self.seed + index * 17, view_index=0),
            "view_b": augment_positive_tensor(base, self.image_size, seed=self.seed + index * 17, view_index=1),
        }


def augment_positive_tensor(tensor, image_size: int, *, seed: int, view_index: int):
    torch = import_torch()
    _, height, width = tensor.shape
    rng = random.Random(seed + view_index * 1009)
    max_y = max(0, height - image_size)
    max_x = max(0, width - image_size)
    y = rng.randint(0, max_y) if max_y else 0
    x = rng.randint(0, max_x) if max_x else 0
    cropped = tensor[:, y : y + image_size, x : x + image_size].clone()
    brightness = 0.98 + rng.random() * 0.04
    contrast = 0.98 + rng.random() * 0.04
    adjusted = (cropped * contrast) + (brightness - 1.0)
    return torch.clamp(adjusted, -1.0, 1.0)


def collate_positive_batch(items: list[dict[str, Any]]) -> dict[str, Any]:
    torch = import_torch()
    return {
        "records": [item["record"] for item in items],
        "view_a": torch.stack([item["view_a"] for item in items]),
        "view_b": torch.stack([item["view_b"] for item in items]),
    }


def train_positive_model(config: PositiveTrainConfig) -> PositiveTrainResult:
    if config.epochs <= 0:
        raise ValueError("epochs must be greater than 0")
    if config.batch_size <= 0:
        raise ValueError("batch_size must be greater than 0")
    torch = import_torch()
    seed_everything(torch, config.seed)
    device = resolve_device(config.device)
    output_dir = config.output_dir.expanduser().resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    checkpoints_dir = output_dir / "checkpoints"
    checkpoints_dir.mkdir(parents=True, exist_ok=True)

    config_payload = {
        key: value for key, value in asdict(config).items() if key != "progress_callback"
    } | {
        "manifest_dir": str(config.manifest_dir.expanduser().resolve()),
        "output_dir": str(output_dir),
        "resolved_device": str(device),
        "training_kind": "positive_pretraining",
    }
    config_path = output_dir / "config.json"
    write_json(config_path, config_payload)

    dataset = PositivePawlJepaDataset(
        config.manifest_dir,
        split="train",
        image_size=config.image_size,
        seed=config.seed,
    )
    if len(dataset) == 0:
        raise ValueError("positive train split is empty; prepare a manifest with at least one ok sample")
    generator = torch.Generator()
    generator.manual_seed(config.seed)
    loader = torch.utils.data.DataLoader(
        dataset,
        batch_size=config.batch_size,
        shuffle=True,
        generator=generator,
        collate_fn=collate_positive_batch,
    )
    model_config = ModelConfig(
        image_size=config.image_size,
        embedding_dim=config.embedding_dim,
        hidden_dim=config.hidden_dim,
        defect_head=True,
    )
    model = build_model(model_config).to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=config.lr)
    metric_rows: list[dict[str, Any]] = []
    start = time.perf_counter()
    total_batches = len(loader)

    for epoch in range(1, config.epochs + 1):
        model.train()
        total_loss = 0.0
        total_consistency = 0.0
        seen = 0
        for batch_index, batch in enumerate(loader, start=1):
            view_a = batch["view_a"].to(device)
            view_b = batch["view_b"].to(device)
            embedding_a = model.encode(view_a)
            with torch.no_grad():
                embedding_b = model.encode(view_b)
            predicted_b = model.predictor(embedding_a)
            predicted_norm = torch.nn.functional.normalize(predicted_b, dim=1)
            target_norm = torch.nn.functional.normalize(embedding_b, dim=1)
            loss = torch.nn.functional.mse_loss(predicted_norm, target_norm)
            consistency = torch.nn.functional.cosine_similarity(predicted_norm, target_norm, dim=1).mean()
            optimizer.zero_grad(set_to_none=True)
            loss.backward()
            optimizer.step()
            batch_size = int(view_a.shape[0])
            seen += batch_size
            total_loss += float(loss.detach().cpu()) * batch_size
            total_consistency += float(consistency.detach().cpu()) * batch_size
            emit_progress(
                config.progress_callback,
                {
                    "event": "positive_train_batch",
                    "epoch": epoch,
                    "epochs": config.epochs,
                    "batch": batch_index,
                    "total_batches": total_batches,
                    "record_count": seen,
                    "loss": float(loss.detach().cpu()),
                    "consistency": float(consistency.detach().cpu()),
                    "elapsed_seconds": time.perf_counter() - start,
                },
            )
        row = {
            "epoch": epoch,
            "record_count": seen,
            "loss": total_loss / max(seen, 1),
            "consistency": total_consistency / max(seen, 1),
        }
        metric_rows.append(row)

    metrics_path = output_dir / "metrics.jsonl"
    write_jsonl(metrics_path, metric_rows)
    checkpoint_path = checkpoints_dir / "last.pt"
    torch.save(
        {
            "model_state_dict": model.state_dict(),
            "model_config": asdict(model_config),
            "train_config": config_payload,
            "pretrain_type": "positive_two_view_scaffold",
        },
        checkpoint_path,
    )
    summary = {
        "epochs": config.epochs,
        "record_count": len(dataset),
        "runtime_seconds": time.perf_counter() - start,
        "first_epoch_loss": metric_rows[0]["loss"] if metric_rows else None,
        "last_epoch_loss": metric_rows[-1]["loss"] if metric_rows else None,
        "last_epoch_consistency": metric_rows[-1]["consistency"] if metric_rows else None,
        "metrics": metric_rows,
    }
    summary_path = output_dir / "train_summary.json"
    write_json(summary_path, summary)
    return PositiveTrainResult(output_dir, config_path, checkpoint_path, metrics_path, summary_path, summary)


def evaluate_positive_model(config: PositiveEvalConfig) -> PositiveEvalResult:
    torch = import_torch()
    output_dir = config.output_dir.expanduser().resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    checkpoint_path = config.run_dir.expanduser().resolve() / "checkpoints" / "last.pt"
    if not checkpoint_path.is_file():
        raise ValueError(f"checkpoint is missing: {checkpoint_path}")
    checkpoint = torch.load(checkpoint_path, map_location="cpu")
    model_config = ModelConfig(**checkpoint["model_config"])
    train_config = checkpoint.get("train_config", {})
    image_size = int(config.image_size or train_config.get("image_size", model_config.image_size))
    device = resolve_device(config.device)
    model = build_model(model_config).to(device)
    model.load_state_dict(checkpoint["model_state_dict"])
    model.eval()

    dataset = PositivePawlJepaDataset(config.manifest_dir, split="all", image_size=image_size, seed=config.seed)
    loader = torch.utils.data.DataLoader(
        dataset,
        batch_size=config.batch_size,
        shuffle=False,
        collate_fn=collate_positive_batch,
    )
    query_embeddings = []
    target_embeddings = []
    consistencies: list[float] = []
    with torch.no_grad():
        for batch_index, batch in enumerate(loader, start=1):
            view_a = batch["view_a"].to(device)
            view_b = batch["view_b"].to(device)
            query = torch.nn.functional.normalize(model.encode(view_a), dim=1)
            target = torch.nn.functional.normalize(model.encode(view_b), dim=1)
            query_embeddings.append(query.cpu())
            target_embeddings.append(target.cpu())
            consistencies.extend(torch.nn.functional.cosine_similarity(query, target, dim=1).cpu().tolist())
            emit_progress(
                config.progress_callback,
                {
                    "event": "positive_eval_batch",
                    "batch": batch_index,
                    "total_batches": len(loader),
                    "record_count": min(batch_index * config.batch_size, len(dataset)),
                },
            )
    query_matrix = torch.cat(query_embeddings, dim=0) if query_embeddings else torch.empty((0, model_config.embedding_dim))
    target_matrix = torch.cat(target_embeddings, dim=0) if target_embeddings else torch.empty((0, model_config.embedding_dim))
    retrieval = positive_retrieval_metrics(query_matrix, target_matrix)
    variance = float(target_matrix.var(dim=0, unbiased=False).mean()) if len(target_matrix) else None
    warnings = []
    if variance is not None and variance < config.collapse_variance_threshold:
        warnings.append(
            f"average_embedding_variance {variance:.8f} is below collapse threshold {config.collapse_variance_threshold}"
        )
    summary = {
        "run_dir": str(config.run_dir.expanduser().resolve()),
        "manifest_dir": str(config.manifest_dir.expanduser().resolve()),
        "record_count": len(dataset),
        "average_augmented_view_consistency": (
            sum(consistencies) / len(consistencies) if consistencies else None
        ),
        "retrieval_top1": retrieval["top1"],
        "retrieval_top5": retrieval["top5"],
        "average_embedding_variance": variance,
        "collapse_variance_threshold": config.collapse_variance_threshold,
        "warnings": warnings,
    }
    summary_path = output_dir / "eval_summary.json"
    write_json(summary_path, summary)
    return PositiveEvalResult(output_dir, summary_path, summary)


def positive_retrieval_metrics(query_matrix, target_matrix) -> dict[str, float | None]:
    if len(query_matrix) == 0:
        return {"top1": None, "top5": None}
    scores = query_matrix @ target_matrix.T
    topk = min(5, scores.shape[1])
    ranked = scores.argsort(dim=1, descending=True)
    top1 = 0
    top5 = 0
    for index in range(scores.shape[0]):
        if int(ranked[index, 0]) == index:
            top1 += 1
        if index in [int(item) for item in ranked[index, :topk]]:
            top5 += 1
    total = scores.shape[0]
    return {"top1": top1 / total, "top5": top5 / total}


def emit_progress(callback: Callable[[dict[str, Any]], None] | None, payload: dict[str, Any]) -> None:
    if callback is not None:
        callback(payload)
