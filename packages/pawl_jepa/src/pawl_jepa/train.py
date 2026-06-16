"""Training runner for Pawl-JEPA microtraining."""

from __future__ import annotations

import json
import random
import time
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Callable

from pawl_jepa.data import PawlJepaDataset, collate_batch
from pawl_jepa.losses import LossWeights, compute_losses
from pawl_jepa.manifest import write_json, write_jsonl
from pawl_jepa.model import ModelConfig, build_model
from pawl_jepa.torch_utils import import_torch, resolve_device


@dataclass(frozen=True)
class TrainConfig:
    manifest_dir: Path
    output_dir: Path
    epochs: int = 2
    batch_size: int = 8
    lr: float = 1e-3
    device: str = "auto"
    image_size: int = 224
    seed: int = 42
    latent_weight: float = 1.0
    preference_weight: float = 0.25
    defect_weight: float = 0.1
    embedding_dim: int = 64
    hidden_dim: int = 128
    defect_head: bool = True
    pretrained_checkpoint: Path | None = None
    progress_callback: Callable[[dict[str, Any]], None] | None = None


@dataclass(frozen=True)
class TrainResult:
    output_dir: Path
    config_path: Path
    checkpoint_path: Path
    metrics_path: Path
    summary_path: Path
    summary: dict[str, Any]


def train_micro_model(config: TrainConfig) -> TrainResult:
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
        key: value
        for key, value in asdict(config).items()
        if key not in {"progress_callback", "pretrained_checkpoint"}
    } | {
        "manifest_dir": str(config.manifest_dir.expanduser().resolve()),
        "output_dir": str(output_dir),
        "resolved_device": str(device),
        "pretrained_checkpoint": str(config.pretrained_checkpoint.expanduser().resolve()) if config.pretrained_checkpoint else None,
    }
    config_path = output_dir / "config.json"
    write_json(config_path, config_payload)

    dataset = PawlJepaDataset(config.manifest_dir, split="train", image_size=config.image_size)
    generator = torch.Generator()
    generator.manual_seed(config.seed)
    loader = torch.utils.data.DataLoader(
        dataset,
        batch_size=config.batch_size,
        shuffle=True,
        generator=generator,
        collate_fn=collate_batch,
    )
    model_config = ModelConfig(
        image_size=config.image_size,
        embedding_dim=config.embedding_dim,
        hidden_dim=config.hidden_dim,
        defect_head=config.defect_head,
    )
    model = build_model(model_config).to(device)
    preload_summary = load_pretrained_components(torch, model, config.pretrained_checkpoint)
    optimizer = torch.optim.AdamW(model.parameters(), lr=config.lr)
    weights = LossWeights(config.latent_weight, config.preference_weight, config.defect_weight)
    metric_rows: list[dict[str, Any]] = []
    start = time.perf_counter()
    total_batches = len(loader)
    emit_progress(
        config.progress_callback,
        {
            "event": "train_start",
            "epochs": config.epochs,
            "total_batches": total_batches,
            "record_count": len(dataset),
        },
    )

    for epoch in range(1, config.epochs + 1):
        model.train()
        totals = {"total_loss": 0.0, "latent_loss": 0.0, "preference_loss": 0.0, "defect_loss": 0.0}
        seen = 0
        for batch_index, batch in enumerate(loader, start=1):
            original = batch["original"].to(device)
            variant = batch["variant"].to(device)
            outputs = model(original, variant)
            losses = compute_losses(outputs, batch, weights)
            optimizer.zero_grad(set_to_none=True)
            losses["total_loss"].backward()
            optimizer.step()
            batch_size = int(original.shape[0])
            seen += batch_size
            for key in totals:
                totals[key] += float(losses[key].detach().cpu()) * batch_size
            emit_progress(
                config.progress_callback,
                {
                    "event": "train_batch",
                    "epoch": epoch,
                    "epochs": config.epochs,
                    "batch": batch_index,
                    "total_batches": total_batches,
                    "record_count": seen,
                    "total_loss": float(losses["total_loss"].detach().cpu()),
                    "latent_loss": float(losses["latent_loss"].detach().cpu()),
                    "preference_loss": float(losses["preference_loss"].detach().cpu()),
                    "defect_loss": float(losses["defect_loss"].detach().cpu()),
                    "elapsed_seconds": time.perf_counter() - start,
                },
            )
        row = {
            "epoch": epoch,
            "record_count": seen,
            **{key: value / max(seen, 1) for key, value in totals.items()},
        }
        metric_rows.append(row)
        emit_progress(
            config.progress_callback,
            {"event": "train_epoch_end", "epoch": epoch, "epochs": config.epochs, **row},
        )

    metrics_path = output_dir / "metrics.jsonl"
    write_jsonl(metrics_path, metric_rows)
    checkpoint_path = checkpoints_dir / "last.pt"
    torch.save(
        {
            "model_state_dict": model.state_dict(),
            "model_config": asdict(model_config),
            "train_config": config_payload,
            "defect_types": ["spacing", "contrast", "alignment", "hierarchy"],
        },
        checkpoint_path,
    )
    summary = {
        "epochs": config.epochs,
        "record_count": len(dataset),
        "runtime_seconds": time.perf_counter() - start,
        "first_epoch_total_loss": metric_rows[0]["total_loss"] if metric_rows else None,
        "last_epoch_total_loss": metric_rows[-1]["total_loss"] if metric_rows else None,
        "metrics": metric_rows,
        "pretrained_checkpoint": str(config.pretrained_checkpoint.expanduser().resolve()) if config.pretrained_checkpoint else None,
        "pretrained_load": preload_summary,
    }
    summary_path = output_dir / "train_summary.json"
    write_json(summary_path, summary)
    emit_progress(config.progress_callback, {"event": "train_done", "summary": summary})
    return TrainResult(output_dir, config_path, checkpoint_path, metrics_path, summary_path, summary)


def load_pretrained_components(torch, model, checkpoint_path: Path | None) -> dict[str, Any]:
    if checkpoint_path is None:
        return {"loaded_key_count": 0, "skipped_key_count": 0, "loaded_keys": [], "skipped_keys": []}
    resolved = checkpoint_path.expanduser().resolve()
    if not resolved.is_file():
        raise ValueError(f"pretrained checkpoint is missing: {resolved}")
    checkpoint = torch.load(resolved, map_location="cpu")
    pretrained_state = checkpoint.get("model_state_dict")
    if not isinstance(pretrained_state, dict):
        raise ValueError(f"pretrained checkpoint missing model_state_dict: {resolved}")
    model_state = model.state_dict()
    loadable: dict[str, Any] = {}
    skipped: list[str] = []
    for key, value in pretrained_state.items():
        if not (key.startswith("encoder.") or key.startswith("predictor.")):
            continue
        if key in model_state and tuple(model_state[key].shape) == tuple(value.shape):
            loadable[key] = value
        else:
            skipped.append(key)
    model_state.update(loadable)
    model.load_state_dict(model_state)
    return {
        "loaded_key_count": len(loadable),
        "skipped_key_count": len(skipped),
        "loaded_keys": sorted(loadable),
        "skipped_keys": sorted(skipped),
    }


def emit_progress(callback: Callable[[dict[str, Any]], None] | None, payload: dict[str, Any]) -> None:
    if callback is not None:
        callback(payload)


def seed_everything(torch, seed: int) -> None:
    random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)
    try:
        torch.use_deterministic_algorithms(True, warn_only=True)
    except TypeError:
        torch.use_deterministic_algorithms(True)
