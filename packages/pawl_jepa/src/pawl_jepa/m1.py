"""M1 random-block screenshot JEPA for the UI-JEPA smoke corpus."""

from __future__ import annotations

import json
import math
import os
import random
import subprocess
import time
from collections import Counter, defaultdict
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Callable

from pawl_jepa.data import load_image_tensor, normalize_image_padded
from pawl_jepa.manifest import write_json, write_jsonl
from pawl_jepa.torch_utils import import_torch, import_torch_nn, resolve_device


SPLITS = ("train", "val", "test")
M1_SCHEMA_VERSION = "ui_jepa_m1_report_v1"


@dataclass(frozen=True)
class M1MaskConfig:
    image_size: int = 224
    patch_size: int = 16
    target_blocks: int = 4
    target_area_min: float = 0.06
    target_area_max: float = 0.18
    aspect_min: float = 0.5
    aspect_max: float = 2.0
    min_context_ratio: float = 0.45
    seed: int = 42


@dataclass(frozen=True)
class M1ModelConfig:
    image_size: int = 224
    patch_size: int = 16
    embedding_dim: int = 128
    predictor_hidden_dim: int = 256
    transformer_layers: int = 2
    transformer_heads: int = 4
    dropout: float = 0.0


@dataclass(frozen=True)
class M1TrainConfig:
    dataset_dir: Path
    output_dir: Path
    report_out: Path
    b0_report: Path | None = None
    epochs: int = 2
    batch_size: int = 16
    lr: float = 1e-3
    weight_decay: float = 1e-4
    ema_decay: float = 0.99
    device: str = "auto"
    image_size: int = 224
    patch_size: int = 16
    embedding_dim: int = 128
    predictor_hidden_dim: int = 256
    transformer_layers: int = 2
    transformer_heads: int = 4
    target_blocks: int = 4
    target_area_min: float = 0.06
    target_area_max: float = 0.18
    min_context_ratio: float = 0.45
    seed: int = 42
    smoke: bool = False
    smoke_limit: int = 96
    probe_epochs: int = 60
    probe_lr: float = 0.05
    progress_callback: Callable[[dict[str, Any]], None] | None = None


@dataclass(frozen=True)
class M1ProbeConfig:
    dataset_dir: Path
    checkpoint: Path
    output_dir: Path
    report_out: Path
    b0_report: Path | None = None
    batch_size: int = 32
    device: str = "auto"
    seed: int = 42
    probe_epochs: int = 80
    probe_lr: float = 0.05


@dataclass(frozen=True)
class M1Result:
    output_dir: Path
    checkpoint_path: Path
    report_json_path: Path
    report_md_path: Path
    report: dict[str, Any]


class UiJepaM1Dataset:
    """Screenshot-only view of the canonical smoke corpus."""

    def __init__(
        self,
        dataset_dir: Path,
        *,
        split: str | None = None,
        image_size: int = 224,
        seed: int = 42,
        shuffle: bool = False,
        limit: int | None = None,
    ) -> None:
        self.dataset_dir = dataset_dir.expanduser().resolve()
        self.image_size = image_size
        self.records = load_m1_records(self.dataset_dir, split=split)
        if shuffle:
            rng = random.Random(seed)
            self.records = self.records[:]
            rng.shuffle(self.records)
        if limit is not None:
            self.records = self.records[:limit]

    def __len__(self) -> int:
        return len(self.records)

    def __getitem__(self, index: int) -> dict[str, Any]:
        record = self.records[index]
        path = Path(str(record["screenshot_path"]))
        tensor = load_image_tensor(path, self.image_size, preserve_aspect=True)
        metadata = m1_normalization_metadata(path, self.image_size)
        return {"record": record, "image": tensor, "normalization": metadata}


def load_m1_records(dataset_dir: Path, *, split: str | None = None) -> list[dict[str, Any]]:
    dataset_dir = dataset_dir.expanduser().resolve()
    manifest = _read_jsonl(dataset_dir / "manifest.jsonl")
    splits = _read_json(dataset_dir / "splits.json")
    split_by_screen = {
        screen_id: split_name
        for split_name, screen_ids in (splits.get("screen_ids") or {}).items()
        for screen_id in screen_ids
    }
    records = []
    for record in manifest:
        item = dict(record)
        item["split"] = split_by_screen.get(record.get("screen_id"), "train")
        item["region_manifest_path"] = str(dataset_dir / "regions.jsonl")
        item["design_tokens_manifest_path"] = str(dataset_dir / "design_tokens.jsonl")
        if split is None or item["split"] == split:
            records.append(item)
    return sorted(records, key=lambda item: str(item["screen_id"]))


def m1_normalization_metadata(path: Path, image_size: int) -> dict[str, Any]:
    from PIL import Image

    with Image.open(path) as image:
        _, metadata = normalize_image_padded(image, canvas_size=image_size)
    return metadata.as_dict()


def collate_m1(items: list[dict[str, Any]]) -> dict[str, Any]:
    torch = import_torch()
    return {
        "records": [item["record"] for item in items],
        "images": torch.stack([item["image"] for item in items]),
        "normalization": [item["normalization"] for item in items],
    }


def sample_random_block_mask(config: M1MaskConfig, *, sample_index: int = 0) -> dict[str, Any]:
    if config.image_size % config.patch_size != 0:
        raise ValueError("image_size must be divisible by patch_size")
    if config.target_blocks <= 0:
        raise ValueError("target_blocks must be greater than 0")
    grid = config.image_size // config.patch_size
    total = grid * grid
    rng = random.Random(config.seed + sample_index * 1_000_003)
    target: set[int] = set()
    blocks: list[dict[str, Any]] = []
    max_attempts = 200
    for block_index in range(config.target_blocks):
        for _ in range(max_attempts):
            area_ratio = rng.uniform(config.target_area_min, config.target_area_max)
            aspect = rng.uniform(config.aspect_min, config.aspect_max)
            block_area = max(1, round(area_ratio * total))
            h = max(1, min(grid, round(math.sqrt(block_area / aspect))))
            w = max(1, min(grid, round(block_area / h)))
            if w * h < block_area and w < grid:
                w += 1
            if w * h < block_area and h < grid:
                h += 1
            x = rng.randint(0, grid - w)
            y = rng.randint(0, grid - h)
            ids = {row * grid + col for row in range(y, y + h) for col in range(x, x + w)}
            candidate = target | ids
            context_ratio = (total - len(candidate)) / total
            if context_ratio >= config.min_context_ratio:
                target = candidate
                blocks.append(
                    {
                        "block_index": block_index,
                        "x": x,
                        "y": y,
                        "width": w,
                        "height": h,
                        "patch_ids": sorted(ids),
                        "area_ratio": len(ids) / total,
                    }
                )
                break
        else:
            break
    if not target:
        raise ValueError("failed to sample a non-empty target mask")
    context = sorted(set(range(total)) - target)
    return {
        "schema_version": "ui_jepa_m1_random_block_mask_v1",
        "seed": config.seed,
        "sample_index": sample_index,
        "image_size": config.image_size,
        "patch_size": config.patch_size,
        "grid_width": grid,
        "grid_height": grid,
        "target_patch_ids": sorted(target),
        "context_patch_ids": context,
        "target_ratio": len(target) / total,
        "context_ratio": len(context) / total,
        "blocks": blocks,
    }


def batch_masks(torch, config: M1MaskConfig, batch_size: int, *, start_index: int, device) -> tuple[Any, Any, list[dict[str, Any]]]:
    total = (config.image_size // config.patch_size) ** 2
    target = torch.zeros((batch_size, total), dtype=torch.bool, device=device)
    context = torch.zeros((batch_size, total), dtype=torch.bool, device=device)
    metadata = []
    for row in range(batch_size):
        meta = sample_random_block_mask(config, sample_index=start_index + row)
        target[row, meta["target_patch_ids"]] = True
        context[row, meta["context_patch_ids"]] = True
        metadata.append(meta)
    return target, context, metadata


def build_m1_model(config: M1ModelConfig):
    torch, nn = import_torch_nn()
    grid = config.image_size // config.patch_size
    num_tokens = grid * grid

    class PatchEncoder(nn.Module):
        def __init__(self) -> None:
            super().__init__()
            patch_dim = 3 * config.patch_size * config.patch_size
            self.unfold = nn.Unfold(kernel_size=config.patch_size, stride=config.patch_size)
            self.proj = nn.Sequential(
                nn.LayerNorm(patch_dim),
                nn.Linear(patch_dim, config.embedding_dim),
                nn.GELU(),
                nn.Linear(config.embedding_dim, config.embedding_dim),
            )
            self.norm = nn.LayerNorm(config.embedding_dim)

        def forward(self, images):
            patches = self.unfold(images).transpose(1, 2)
            return self.norm(self.proj(patches))

    class M1JepaModel(nn.Module):
        def __init__(self) -> None:
            super().__init__()
            self.online_encoder = PatchEncoder()
            self.target_encoder = PatchEncoder()
            self.mask_token = nn.Parameter(torch.zeros(1, 1, config.embedding_dim))
            self.position = nn.Parameter(torch.randn(1, num_tokens, config.embedding_dim) * 0.02)
            layer = nn.TransformerEncoderLayer(
                d_model=config.embedding_dim,
                nhead=config.transformer_heads,
                dim_feedforward=config.predictor_hidden_dim,
                dropout=config.dropout,
                activation="gelu",
                batch_first=True,
            )
            self.context_encoder = nn.TransformerEncoder(layer, num_layers=config.transformer_layers)
            self.predictor = nn.Sequential(
                nn.LayerNorm(config.embedding_dim),
                nn.Linear(config.embedding_dim, config.predictor_hidden_dim),
                nn.GELU(),
                nn.Linear(config.predictor_hidden_dim, config.embedding_dim),
            )
            self.embedding_projector = nn.Sequential(
                nn.LayerNorm(num_tokens * config.embedding_dim),
                nn.Linear(num_tokens * config.embedding_dim, config.embedding_dim),
                nn.LayerNorm(config.embedding_dim),
            )
            self.reset_target()

        def reset_target(self) -> None:
            self.target_encoder.load_state_dict(self.online_encoder.state_dict())
            for parameter in self.target_encoder.parameters():
                parameter.requires_grad_(False)

        def update_target(self, decay: float) -> None:
            with torch.no_grad():
                for target_param, online_param in zip(self.target_encoder.parameters(), self.online_encoder.parameters(), strict=True):
                    target_param.data.mul_(decay).add_(online_param.data, alpha=1.0 - decay)

        def encode(self, images):
            tokens = self.online_encoder(images) + self.position
            projected = self.embedding_projector(tokens.flatten(1))
            return torch.nn.functional.normalize(projected, dim=1)

        def forward(self, images, target_mask, context_mask):
            online_tokens = self.online_encoder(images)
            masked = torch.where(context_mask.unsqueeze(-1), online_tokens, self.mask_token.expand_as(online_tokens))
            contextual = self.context_encoder(masked + self.position)
            predicted = self.predictor(contextual)
            with torch.no_grad():
                target_tokens = self.target_encoder(images)
            predicted_norm = torch.nn.functional.normalize(predicted, dim=-1)
            target_norm = torch.nn.functional.normalize(target_tokens, dim=-1)
            per_token = (predicted_norm - target_norm).pow(2).sum(dim=-1)
            loss = (per_token * target_mask.float()).sum() / target_mask.float().sum().clamp_min(1.0)
            return {
                "loss": loss,
                "predicted_tokens": predicted_norm,
                "target_tokens": target_norm,
                "target_mask": target_mask,
                "context_mask": context_mask,
            }

    return M1JepaModel()


def train_m1(config: M1TrainConfig) -> M1Result:
    if config.epochs <= 0:
        raise ValueError("epochs must be greater than 0")
    torch = import_torch()
    seed_everything(torch, config.seed)
    device = resolve_device(config.device)
    output_dir = config.output_dir.expanduser().resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    checkpoint_dir = output_dir / "checkpoints"
    checkpoint_dir.mkdir(parents=True, exist_ok=True)
    model_config = M1ModelConfig(
        image_size=config.image_size,
        patch_size=config.patch_size,
        embedding_dim=config.embedding_dim,
        predictor_hidden_dim=config.predictor_hidden_dim,
        transformer_layers=config.transformer_layers,
        transformer_heads=config.transformer_heads,
    )
    mask_config = M1MaskConfig(
        image_size=config.image_size,
        patch_size=config.patch_size,
        target_blocks=config.target_blocks,
        target_area_min=config.target_area_min,
        target_area_max=config.target_area_max,
        min_context_ratio=config.min_context_ratio,
        seed=config.seed,
    )
    write_json(output_dir / "config.json", public_config(config, device=str(device), model_config=model_config, mask_config=mask_config))
    model = build_m1_model(model_config).to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=config.lr, weight_decay=config.weight_decay)
    train_limit = config.smoke_limit if config.smoke else None
    val_limit = max(8, min(config.smoke_limit // 4, config.smoke_limit)) if config.smoke else None
    train_data = UiJepaM1Dataset(config.dataset_dir, split="train", image_size=config.image_size, seed=config.seed, shuffle=True, limit=train_limit)
    val_data = UiJepaM1Dataset(config.dataset_dir, split="val", image_size=config.image_size, seed=config.seed, shuffle=False, limit=val_limit)
    generator = torch.Generator()
    generator.manual_seed(config.seed)
    train_loader = torch.utils.data.DataLoader(train_data, batch_size=config.batch_size, shuffle=True, generator=generator, collate_fn=collate_m1)
    val_loader = torch.utils.data.DataLoader(val_data, batch_size=config.batch_size, shuffle=False, collate_fn=collate_m1)
    history: list[dict[str, Any]] = []
    start = time.perf_counter()
    global_index = 0
    for epoch in range(1, config.epochs + 1):
        model.train()
        train_loss = 0.0
        train_seen = 0
        for batch_index, batch in enumerate(train_loader, start=1):
            images = batch["images"].to(device)
            target_mask, context_mask, _ = batch_masks(torch, mask_config, int(images.shape[0]), start_index=global_index, device=device)
            global_index += int(images.shape[0])
            outputs = model(images, target_mask, context_mask)
            optimizer.zero_grad(set_to_none=True)
            outputs["loss"].backward()
            optimizer.step()
            model.update_target(config.ema_decay)
            batch_size = int(images.shape[0])
            train_seen += batch_size
            train_loss += float(outputs["loss"].detach().cpu()) * batch_size
            emit_progress(config.progress_callback, {"event": "m1_train_batch", "epoch": epoch, "batch": batch_index, "loss": float(outputs["loss"].detach().cpu())})
        val_loss = evaluate_m1_loss(torch, model, val_loader, mask_config, device, seed_offset=100_000 + epoch * 10_000)
        row = {
            "epoch": epoch,
            "train_loss": train_loss / max(train_seen, 1),
            "val_loss": val_loss,
            "train_record_count": train_seen,
        }
        history.append(row)
        emit_progress(config.progress_callback, {"event": "m1_epoch_end", **row})
    write_jsonl(output_dir / "metrics.jsonl", history)
    checkpoint_path = checkpoint_dir / "m1_last.pt"
    torch.save(
        {
            "model_state_dict": model.state_dict(),
            "model_config": asdict(model_config),
            "mask_config": asdict(mask_config),
            "train_config": public_config(config, device=str(device), model_config=model_config, mask_config=mask_config),
            "history": history,
        },
        checkpoint_path,
    )
    probe = run_m1_probe(
        M1ProbeConfig(
            dataset_dir=config.dataset_dir,
            checkpoint=checkpoint_path,
            output_dir=output_dir / "probe",
            report_out=config.report_out,
            b0_report=config.b0_report,
            batch_size=config.batch_size,
            device=config.device,
            seed=config.seed,
            probe_epochs=config.probe_epochs,
            probe_lr=config.probe_lr,
        ),
        training_history=history,
        runtime_seconds=time.perf_counter() - start,
    )
    return M1Result(output_dir, checkpoint_path, probe.report_json_path, probe.report_md_path, probe.report)


def evaluate_m1_loss(torch, model, loader, mask_config: M1MaskConfig, device, *, seed_offset: int) -> float | None:
    if len(loader.dataset) == 0:
        return None
    model.eval()
    total = 0.0
    seen = 0
    with torch.no_grad():
        for batch_index, batch in enumerate(loader):
            images = batch["images"].to(device)
            target_mask, context_mask, _ = batch_masks(torch, mask_config, int(images.shape[0]), start_index=seed_offset + batch_index * 10_000, device=device)
            outputs = model(images, target_mask, context_mask)
            batch_size = int(images.shape[0])
            total += float(outputs["loss"].detach().cpu()) * batch_size
            seen += batch_size
    return total / max(seen, 1)


def run_m1_probe(
    config: M1ProbeConfig,
    *,
    training_history: list[dict[str, Any]] | None = None,
    runtime_seconds: float | None = None,
) -> M1Result:
    torch = import_torch()
    seed_everything(torch, config.seed)
    device = resolve_device(config.device)
    checkpoint_path = config.checkpoint.expanduser().resolve()
    checkpoint = torch.load(checkpoint_path, map_location="cpu")
    model_config = M1ModelConfig(**checkpoint["model_config"])
    model = build_m1_model(model_config).to(device)
    model.load_state_dict(checkpoint["model_state_dict"])
    model.eval()
    output_dir = config.output_dir.expanduser().resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    embeddings = export_m1_embeddings(torch, model, config.dataset_dir, model_config.image_size, config.batch_size, device)
    write_jsonl(output_dir / "embeddings.jsonl", [{"screen_id": key, "embedding": value} for key, value in sorted(embeddings.items())])
    collapse = collapse_diagnostics(embeddings)
    pairs = _read_jsonl(config.dataset_dir / "pairs.jsonl")
    splits = _read_json(config.dataset_dir / "splits.json")
    probe = train_pairwise_probe(torch, embeddings, pairs, splits, seed=config.seed, epochs=config.probe_epochs, lr=config.probe_lr)
    b0 = load_b0_comparison(config.b0_report)
    previous_report = {}
    report_json_path = config.report_out.expanduser().resolve()
    if report_json_path.is_file():
        previous_report = json.loads(report_json_path.read_text(encoding="utf-8"))
    resolved_history = training_history if training_history is not None else checkpoint.get("history", previous_report.get("history", []))
    resolved_runtime = runtime_seconds if runtime_seconds is not None else previous_report.get("runtime_seconds")
    report = build_m1_report(
        dataset_dir=config.dataset_dir,
        checkpoint_path=checkpoint_path,
        model_config=model_config,
        mask_config=M1MaskConfig(**checkpoint["mask_config"]),
        train_config=checkpoint.get("train_config", {}),
        history=resolved_history,
        runtime_seconds=resolved_runtime,
        collapse=collapse,
        probe=probe,
        b0_comparison=b0,
    )
    report_json_path.parent.mkdir(parents=True, exist_ok=True)
    write_json(report_json_path, report)
    report_md_path = report_json_path.with_suffix(".md")
    report_md_path.write_text(m1_markdown(report), encoding="utf-8")
    return M1Result(output_dir, checkpoint_path, report_json_path, report_md_path, report)


def export_m1_embeddings(torch, model, dataset_dir: Path, image_size: int, batch_size: int, device) -> dict[str, list[float]]:
    dataset = UiJepaM1Dataset(dataset_dir, split=None, image_size=image_size, shuffle=False)
    loader = torch.utils.data.DataLoader(dataset, batch_size=batch_size, shuffle=False, collate_fn=collate_m1)
    embeddings: dict[str, list[float]] = {}
    with torch.no_grad():
        for batch in loader:
            images = batch["images"].to(device)
            values = model.encode(images).detach().cpu()
            for record, vector in zip(batch["records"], values, strict=True):
                embeddings[str(record["screen_id"])] = [float(value) for value in vector.tolist()]
    return embeddings


def train_pairwise_probe(torch, embeddings: dict[str, list[float]], pairs: list[dict[str, Any]], splits: dict[str, Any], *, seed: int, epochs: int, lr: float) -> dict[str, Any]:
    examples = probe_examples(torch, embeddings, pairs, splits)
    if not examples:
        return {"available": False, "skipped_reason": "no pairs with embeddings"}
    input_dim = int(examples[0]["features"].shape[0])
    model = torch.nn.Sequential(torch.nn.Linear(input_dim, 32), torch.nn.ReLU(), torch.nn.Linear(32, 1))
    generator = torch.Generator()
    generator.manual_seed(seed)
    for parameter in model.parameters():
        if parameter.dim() > 1:
            torch.nn.init.xavier_uniform_(parameter, generator=generator)
        else:
            torch.nn.init.zeros_(parameter)
    optimizer = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=1e-4)
    train = [example for example in examples if example["split"] == "train"]
    for _ in range(max(0, epochs)):
        for example in sorted(train, key=lambda item: item["pair_id"]):
            logit = model(example["features"]).reshape(())
            loss = torch.nn.functional.binary_cross_entropy_with_logits(logit, example["target"])
            optimizer.zero_grad(set_to_none=True)
            loss.backward()
            optimizer.step()
    scores = []
    with torch.no_grad():
        for example in examples:
            logit = float(model(example["features"]).reshape(()).detach().cpu())
            probability = 1.0 / (1.0 + math.exp(-max(-40.0, min(40.0, logit))))
            predicted_left = probability >= 0.5
            scores.append({**example["public"], "probability_left_preferred": probability, "correct": predicted_left == bool(example["target"].item())})
    return {"available": True, "splits": summarize_probe_scores(scores), "pair_scores": scores}


def probe_examples(torch, embeddings: dict[str, list[float]], pairs: list[dict[str, Any]], splits: dict[str, Any]) -> list[dict[str, Any]]:
    split_by_group = splits.get("pair_split_by_group") or {}
    examples = []
    for pair in pairs:
        left = embeddings.get(str(pair.get("left_screen_id")))
        right = embeddings.get(str(pair.get("right_screen_id")))
        if left is None or right is None:
            continue
        left_tensor = torch.tensor(left, dtype=torch.float32)
        right_tensor = torch.tensor(right, dtype=torch.float32)
        features = torch.cat([left_tensor, right_tensor, torch.abs(left_tensor - right_tensor), left_tensor * right_tensor])
        split = split_by_group.get(str(pair.get("split_group")), "train")
        examples.append(
            {
                "pair_id": str(pair["pair_id"]),
                "split": split,
                "features": features,
                "target": torch.tensor(1.0 if pair.get("left_is_preferred") else 0.0, dtype=torch.float32),
                "public": {
                    "pair_id": pair["pair_id"],
                    "split": split,
                    "pair_family": pair.get("pair_family"),
                    "corruption_type": pair.get("corruption_type"),
                    "difficulty": pair.get("difficulty"),
                    "severity_bucket": severity_bucket(pair.get("severity")),
                    "left_is_preferred": bool(pair.get("left_is_preferred")),
                },
            }
        )
    return examples


def summarize_probe_scores(scores: list[dict[str, Any]]) -> dict[str, Any]:
    return {split: summarize_split([score for score in scores if score["split"] == split]) for split in SPLITS}


def summarize_split(scores: list[dict[str, Any]]) -> dict[str, Any]:
    count = len(scores)
    always_left = sum(1 for score in scores if score["left_is_preferred"]) / count if count else None
    always_right = 1.0 - always_left if always_left is not None else None
    best_constant = max(always_left, always_right) if always_left is not None and always_right is not None else None
    accuracy = sum(1 for score in scores if score["correct"]) / count if count else None
    return {
        "pair_count": count,
        "pairwise_accuracy": accuracy,
        "always_left_accuracy": always_left,
        "always_right_accuracy": always_right,
        "best_constant_accuracy": best_constant,
        "lift_over_best_constant": lift(accuracy, best_constant),
        "accuracy_by_pair_family": grouped_accuracy(scores, "pair_family"),
        "accuracy_by_corruption_type": grouped_accuracy(scores, "corruption_type"),
        "accuracy_by_difficulty": grouped_accuracy(scores, "difficulty"),
        "accuracy_by_severity": grouped_accuracy(scores, "severity_bucket"),
    }


def collapse_diagnostics(embeddings: dict[str, list[float]]) -> dict[str, Any]:
    torch = import_torch()
    if not embeddings:
        return {"valid": False, "failed_conditions": ["no embeddings"], "screen_count": 0}
    ids = sorted(embeddings)
    matrix = torch.tensor([embeddings[key] for key in ids], dtype=torch.float32)
    normalized = torch.nn.functional.normalize(matrix, dim=1)
    mean = matrix.mean(dim=0)
    std = matrix.std(dim=0, unbiased=False)
    feature_std_mean = float(std.mean().item())
    feature_variance_mean = float(matrix.var(dim=0, unbiased=False).mean().item())
    cosine = normalized @ normalized.T
    n = cosine.shape[0]
    off_diag = cosine[~torch.eye(n, dtype=torch.bool)] if n > 1 else torch.tensor([])
    nn_indices = []
    duplicate_count = 0
    if n > 1:
        masked = cosine.clone()
        masked.fill_diagonal_(-2.0)
        nn_indices = [int(value) for value in masked.argmax(dim=1).tolist()]
        duplicate_count = n - len(set(nn_indices))
    quantiles = {}
    if off_diag.numel():
        for q in (0.05, 0.5, 0.95):
            quantiles[str(q)] = float(torch.quantile(off_diag, q).item())
    nearest_neighbor_diversity = len(set(nn_indices)) / n if n else 0.0
    duplicate_neighbor_rate = duplicate_count / n if n else 0.0
    failed = []
    if feature_std_mean <= 1e-4:
        failed.append("feature_std_mean <= 1e-4")
    if feature_variance_mean <= 1e-6:
        failed.append("feature_variance_mean <= 1e-6")
    if quantiles.get("0.95", 0.0) >= 0.999:
        failed.append("pairwise_cosine_p95 >= 0.999")
    if nearest_neighbor_diversity <= 0.05 and n >= 20:
        failed.append("nearest_neighbor_diversity <= 0.05")
    return {
        "schema_version": "ui_jepa_m1_collapse_diagnostics_v1",
        "valid": not failed,
        "failed_conditions": failed,
        "thresholds": {
            "feature_std_mean_min": 1e-4,
            "feature_variance_mean_min": 1e-6,
            "pairwise_cosine_p95_max": 0.999,
            "nearest_neighbor_diversity_min": 0.05,
        },
        "screen_count": len(ids),
        "embedding_dim": len(next(iter(embeddings.values()))),
        "embedding_mean_abs": float(mean.abs().mean().item()),
        "embedding_std_mean": feature_std_mean,
        "feature_variance_mean": feature_variance_mean,
        "pairwise_cosine": {
            "mean": float(off_diag.mean().item()) if off_diag.numel() else None,
            "min": float(off_diag.min().item()) if off_diag.numel() else None,
            "max": float(off_diag.max().item()) if off_diag.numel() else None,
            "quantiles": quantiles,
        },
        "nearest_neighbor_diversity": nearest_neighbor_diversity,
        "duplicate_neighbor_rate": duplicate_neighbor_rate,
        "retrieval_examples": [
            {"screen_id": ids[index], "nearest_neighbor_screen_id": ids[nn_indices[index]]}
            for index in range(min(10, len(nn_indices)))
        ],
    }


def build_m1_report(
    *,
    dataset_dir: Path,
    checkpoint_path: Path,
    model_config: M1ModelConfig,
    mask_config: M1MaskConfig,
    train_config: dict[str, Any],
    history: list[dict[str, Any]],
    runtime_seconds: float | None,
    collapse: dict[str, Any],
    probe: dict[str, Any],
    b0_comparison: dict[str, Any],
) -> dict[str, Any]:
    manifest = _read_jsonl(dataset_dir / "manifest.jsonl")
    pairs = _read_jsonl(dataset_dir / "pairs.jsonl")
    splits = _read_json(dataset_dir / "splits.json")
    pair_counts = {split: sum(1 for pair in pairs if (splits.get("pair_split_by_group") or {}).get(pair.get("split_group")) == split) for split in SPLITS}
    valid_probe = bool(probe.get("available")) and all((probe.get("splits") or {}).get(split, {}).get("pair_count", 0) > 0 for split in ("val", "test"))
    valid_m1 = bool(collapse.get("valid")) and valid_probe and bool(history)
    test_m1 = ((probe.get("splits") or {}).get("test") or {}).get("pairwise_accuracy")
    test_b0 = b0_comparison.get("b0_test_accuracy")
    if isinstance(test_m1, int | float) and isinstance(test_b0, int | float):
        outcome = "beats_b0" if test_m1 > test_b0 else "ties_b0" if abs(test_m1 - test_b0) <= 0.005 else "loses_to_b0"
    else:
        outcome = "not_comparable"
    warnings = []
    if not collapse.get("valid"):
        warnings.append("M1 embeddings failed collapse diagnostics.")
    if outcome == "loses_to_b0":
        warnings.append("M1 is a valid baseline candidate only if non-collapsed; it does not need to beat DINOv2 B0.")
    return {
        "schema_version": M1_SCHEMA_VERSION,
        "dataset_dir": str(dataset_dir.expanduser().resolve()),
        "dataset_counts": {
            "manifest": len(manifest),
            "pairs": len(pairs),
            "regions": len(_read_jsonl(dataset_dir / "regions.jsonl")),
        },
        "split_counts": {split: len((splits.get("screen_ids") or {}).get(split, [])) for split in SPLITS},
        "pair_counts": pair_counts,
        "checkpoint_path": str(checkpoint_path),
        "training_config": train_config,
        "model_config": asdict(model_config),
        "mask_config": asdict(mask_config),
        "runtime_seconds": round(runtime_seconds, 4) if runtime_seconds is not None else None,
        "history": history,
        "final_train_jepa_loss": history[-1]["train_loss"] if history else None,
        "final_val_jepa_loss": history[-1]["val_loss"] if history else None,
        "collapse_diagnostics": collapse,
        "probe": {key: value for key, value in probe.items() if key != "pair_scores"},
        "b0_comparison": b0_comparison,
        "metrics_only_comparison": b0_comparison.get("metrics_only"),
        "valid_m1_baseline": valid_m1,
        "m1_vs_b0": outcome,
        "recommended_next_stage": "M2_semantic_mask_jepa" if valid_m1 else "fix_M1_collapse_or_probe_before_M2",
        "warnings": warnings,
        "failed_or_skipped_reasons": ([] if valid_m1 else ["collapse diagnostics or frozen probe incomplete"]),
        "commands": {"train": " ".join(os.sys.argv)},
        "git": git_state(),
    }


def load_b0_comparison(path: Path | None) -> dict[str, Any]:
    if path is None:
        return {"available": False, "skipped_reason": "no B0 report supplied"}
    resolved = path.expanduser().resolve()
    if not resolved.is_file():
        return {"available": False, "skipped_reason": f"B0 report missing: {resolved}"}
    report = json.loads(resolved.read_text(encoding="utf-8"))
    splits = report.get("splits") or {}
    metrics = report.get("metrics_baseline") or {}
    return {
        "available": True,
        "b0_report": str(resolved),
        "real_weights": report.get("real_weights"),
        "valid_for_model_selection": report.get("valid_for_model_selection"),
        "b0_val_accuracy": (splits.get("val") or {}).get("pairwise_accuracy"),
        "b0_test_accuracy": (splits.get("test") or {}).get("pairwise_accuracy"),
        "b0_val_lift_over_best_constant": (splits.get("val") or {}).get("lift_over_best_constant"),
        "b0_test_lift_over_best_constant": (splits.get("test") or {}).get("lift_over_best_constant"),
        "metrics_only": {
            "available": metrics.get("available"),
            "val_accuracy": ((metrics.get("splits") or {}).get("val") or {}).get("pairwise_accuracy"),
            "test_accuracy": ((metrics.get("splits") or {}).get("test") or {}).get("pairwise_accuracy"),
        },
    }


def m1_report_allows_m2(report: dict[str, Any]) -> bool:
    if not report.get("valid_m1_baseline"):
        return False
    if not (report.get("collapse_diagnostics") or {}).get("valid"):
        return False
    probe = report.get("probe") or {}
    if not probe.get("available"):
        return False
    if not (report.get("b0_comparison") or {}).get("available"):
        return False
    return True


def m1_markdown(report: dict[str, Any]) -> str:
    probe = report.get("probe") or {}
    splits = probe.get("splits") or {}
    lines = [
        "# UI-JEPA M1 Random-Block Screenshot JEPA",
        "",
        f"- Valid M1 baseline: {report.get('valid_m1_baseline')}",
        f"- M1 vs B0: {report.get('m1_vs_b0')}",
        f"- Recommended next stage: {report.get('recommended_next_stage')}",
        f"- Final train JEPA loss: {report.get('final_train_jepa_loss')}",
        f"- Final val JEPA loss: {report.get('final_val_jepa_loss')}",
        f"- Collapse valid: {(report.get('collapse_diagnostics') or {}).get('valid')}",
        "",
        "## Frozen Probe",
        "",
    ]
    for split in SPLITS:
        summary = splits.get(split) or {}
        lines.append(f"- {split}: accuracy={summary.get('pairwise_accuracy')} pairs={summary.get('pair_count')} lift={summary.get('lift_over_best_constant')}")
    lines.extend(["", "## Comparison", ""])
    b0 = report.get("b0_comparison") or {}
    lines.append(f"- B0 test accuracy: {b0.get('b0_test_accuracy')}")
    lines.append(f"- Metrics-only test accuracy: {(b0.get('metrics_only') or {}).get('test_accuracy')}")
    lines.extend(["", "## Warnings", ""])
    lines.extend(f"- {warning}" for warning in report.get("warnings", []))
    return "\n".join(lines) + "\n"


def public_config(config: M1TrainConfig, *, device: str, model_config: M1ModelConfig, mask_config: M1MaskConfig) -> dict[str, Any]:
    payload = {key: value for key, value in asdict(config).items() if key != "progress_callback"}
    for key in ("dataset_dir", "output_dir", "report_out", "b0_report"):
        if payload.get(key) is not None:
            payload[key] = str(payload[key])
    payload["resolved_device"] = device
    payload["model_config"] = asdict(model_config)
    payload["mask_config"] = asdict(mask_config)
    return payload


def grouped_accuracy(scores: list[dict[str, Any]], key: str) -> dict[str, float]:
    groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for score in scores:
        groups[str(score.get(key))].append(score)
    return {name: sum(1 for item in values if item["correct"]) / len(values) for name, values in sorted(groups.items()) if values}


def severity_bucket(value: Any) -> str:
    try:
        severity = float(value)
    except (TypeError, ValueError):
        return "unknown"
    if severity < 0.30:
        return "subtle"
    if severity < 0.60:
        return "visible"
    return "obvious"


def lift(value: float | None, baseline: float | None) -> float | None:
    if value is None or baseline is None:
        return None
    return value - baseline


def seed_everything(torch, seed: int) -> None:
    random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)
    try:
        torch.use_deterministic_algorithms(True, warn_only=True)
    except TypeError:
        torch.use_deterministic_algorithms(True)


def emit_progress(callback: Callable[[dict[str, Any]], None] | None, payload: dict[str, Any]) -> None:
    if callback is not None:
        callback(payload)


def git_state() -> dict[str, Any]:
    try:
        commit = subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()
        dirty = bool(subprocess.check_output(["git", "status", "--porcelain"], text=True).strip())
        return {"commit": commit, "dirty": dirty}
    except Exception:
        return {"commit": None, "dirty": None}


def _read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _read_jsonl(path: Path) -> list[dict[str, Any]]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
