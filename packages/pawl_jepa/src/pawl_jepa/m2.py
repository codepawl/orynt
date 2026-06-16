"""M2 semantic-region screenshot JEPA for the UI-JEPA smoke corpus."""

from __future__ import annotations

import hashlib
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

from pawl_jepa.data import load_image_tensor, normalize_image_padded, transform_bbox_xyxy
from pawl_jepa.m1 import (
    M1MaskConfig,
    M1ModelConfig,
    M1Result,
    build_m1_model,
    collapse_diagnostics,
    grouped_accuracy,
    lift,
    load_b0_comparison,
    load_m1_records,
    probe_examples,
    seed_everything,
    severity_bucket,
    summarize_probe_scores,
    train_pairwise_probe,
)
from pawl_jepa.manifest import write_json, write_jsonl
from pawl_jepa.torch_utils import import_torch, resolve_device


SPLITS = ("train", "val", "test")
M2_SCHEMA_VERSION = "ui_jepa_m2_report_v1"
M2_MASK_SCHEMA_VERSION = "ui_jepa_m2_semantic_region_mask_v1"
SUPPORTED_REGION_TYPES = {
    "navbar",
    "hero",
    "cta",
    "card",
    "card_grid",
    "form",
    "sidebar",
    "footer",
    "modal",
    "table",
    "unknown",
}


@dataclass(frozen=True)
class M2MaskConfig:
    image_size: int = 224
    patch_size: int = 16
    target_regions: int = 2
    min_region_area_ratio: float = 0.001
    max_region_area_ratio: float = 0.80
    min_context_ratio: float = 0.45
    seed: int = 42


@dataclass(frozen=True)
class M2TrainConfig:
    dataset_dir: Path
    output_dir: Path
    report_out: Path
    b0_report: Path | None = None
    m1_report: Path | None = None
    regions_path: Path | None = None
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
    target_regions: int = 2
    min_region_area_ratio: float = 0.001
    max_region_area_ratio: float = 0.80
    min_context_ratio: float = 0.45
    seed: int = 42
    smoke: bool = False
    smoke_limit: int = 96
    probe_epochs: int = 60
    probe_lr: float = 0.05
    progress_callback: Callable[[dict[str, Any]], None] | None = None


@dataclass(frozen=True)
class M2ProbeConfig:
    dataset_dir: Path
    checkpoint: Path
    output_dir: Path
    report_out: Path
    b0_report: Path | None = None
    m1_report: Path | None = None
    batch_size: int = 32
    device: str = "auto"
    seed: int = 42
    probe_epochs: int = 80
    probe_lr: float = 0.05


class UiJepaM2Dataset:
    """Screenshot view plus semantic regions for M2 masking."""

    def __init__(
        self,
        dataset_dir: Path,
        *,
        split: str | None = None,
        image_size: int = 224,
        seed: int = 42,
        shuffle: bool = False,
        limit: int | None = None,
        regions_path: Path | None = None,
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
        self.regions_by_screen = load_regions_by_screen(regions_path or self.dataset_dir / "regions.jsonl")

    def __len__(self) -> int:
        return len(self.records)

    def __getitem__(self, index: int) -> dict[str, Any]:
        record = self.records[index]
        path = Path(str(record["screenshot_path"]))
        tensor = load_image_tensor(path, self.image_size, preserve_aspect=True)
        metadata = m2_normalization_metadata(path, self.image_size)
        screen_id = str(record["screen_id"])
        return {
            "record": record,
            "image": tensor,
            "normalization": metadata,
            "regions": self.regions_by_screen.get(screen_id, []),
        }


def load_regions_by_screen(path: Path) -> dict[str, list[dict[str, Any]]]:
    if not path.expanduser().is_file():
        raise FileNotFoundError(f"regions.jsonl is missing: {path}")
    regions: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for line in path.expanduser().read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        region = json.loads(line)
        region_type = str(region.get("region_type", "unknown"))
        if region_type not in SUPPORTED_REGION_TYPES:
            region = dict(region)
            region["region_type"] = "unknown"
        regions[str(region.get("screen_id"))].append(region)
    return {screen_id: sorted(values, key=lambda item: str(item.get("region_id"))) for screen_id, values in regions.items()}


def m2_normalization_metadata(path: Path, image_size: int) -> dict[str, Any]:
    from PIL import Image

    with Image.open(path) as image:
        _, metadata = normalize_image_padded(image, canvas_size=image_size)
    return metadata.as_dict()


def collate_m2(items: list[dict[str, Any]]) -> dict[str, Any]:
    torch = import_torch()
    return {
        "records": [item["record"] for item in items],
        "images": torch.stack([item["image"] for item in items]),
        "normalization": [item["normalization"] for item in items],
        "regions": [item["regions"] for item in items],
    }


def bbox_to_patch_ids(
    bbox_xyxy: list[float] | tuple[float, float, float, float],
    normalization: dict[str, Any],
    *,
    image_size: int,
    patch_size: int,
) -> dict[str, Any]:
    if image_size % patch_size != 0:
        raise ValueError("image_size must be divisible by patch_size")
    grid = image_size // patch_size
    x1, y1, x2, y2 = transform_bbox_xyxy(bbox_xyxy, normalization)
    x1 = max(0.0, min(float(image_size), x1))
    y1 = max(0.0, min(float(image_size), y1))
    x2 = max(0.0, min(float(image_size), x2))
    y2 = max(0.0, min(float(image_size), y2))
    if x2 <= x1 or y2 <= y1:
        return {
            "patch_ids": [],
            "normalized_bbox_xyxy": [round(x1, 4), round(y1, 4), round(x2, 4), round(y2, 4)],
            "patch_bbox": None,
        }
    px1 = max(0, min(grid - 1, int(math.floor(x1 / patch_size))))
    py1 = max(0, min(grid - 1, int(math.floor(y1 / patch_size))))
    px2 = max(px1 + 1, min(grid, int(math.ceil(x2 / patch_size))))
    py2 = max(py1 + 1, min(grid, int(math.ceil(y2 / patch_size))))
    patch_ids = [row * grid + col for row in range(py1, py2) for col in range(px1, px2)]
    return {
        "patch_ids": patch_ids,
        "normalized_bbox_xyxy": [round(x1, 4), round(y1, 4), round(x2, 4), round(y2, 4)],
        "patch_bbox": {"x1": px1, "y1": py1, "x2": px2, "y2": py2, "width": px2 - px1, "height": py2 - py1},
    }


def sample_semantic_region_mask(
    config: M2MaskConfig,
    *,
    screen_id: str,
    regions: list[dict[str, Any]],
    normalization: dict[str, Any],
    sample_index: int = 0,
) -> dict[str, Any]:
    if config.target_regions <= 0:
        raise ValueError("target_regions must be greater than 0")
    if config.image_size % config.patch_size != 0:
        raise ValueError("image_size must be divisible by patch_size")
    grid = config.image_size // config.patch_size
    total = grid * grid
    rng = random.Random(config.seed + sample_index * 1_000_003 + _stable_int(screen_id))
    candidates = []
    for region in regions:
        bbox = region.get("bbox_xyxy")
        if not isinstance(bbox, list | tuple) or len(bbox) != 4:
            continue
        mapped = bbox_to_patch_ids(bbox, normalization, image_size=config.image_size, patch_size=config.patch_size)
        patch_ids = sorted(set(int(value) for value in mapped["patch_ids"] if 0 <= int(value) < total))
        area_ratio = len(patch_ids) / total if total else 0.0
        if not patch_ids or area_ratio < config.min_region_area_ratio or area_ratio > config.max_region_area_ratio:
            continue
        region_type = str(region.get("region_type", "unknown"))
        if region_type not in SUPPORTED_REGION_TYPES:
            region_type = "unknown"
        candidates.append(
            {
                "region_id": str(region.get("region_id")),
                "region_type": region_type,
                "source_area_ratio": region.get("area_ratio"),
                "target_area_ratio": area_ratio,
                "bbox_xyxy": [float(value) for value in bbox],
                "normalized_bbox_xyxy": mapped["normalized_bbox_xyxy"],
                "patch_bbox": mapped["patch_bbox"],
                "patch_ids": patch_ids,
            }
        )
    if not candidates:
        return _fallback_mask(config, sample_index=sample_index, reason="no_valid_regions")
    shuffled = candidates[:]
    rng.shuffle(shuffled)
    target: set[int] = set()
    selected = []
    for candidate in shuffled:
        merged = target | set(candidate["patch_ids"])
        context_ratio = (total - len(merged)) / total
        if context_ratio < config.min_context_ratio and selected:
            continue
        if context_ratio < config.min_context_ratio and len(candidate["patch_ids"]) < total:
            continue
        target = merged
        selected.append(candidate)
        if len(selected) >= config.target_regions:
            break
    if not selected:
        return _fallback_mask(config, sample_index=sample_index, reason="regions_exceed_context_budget")
    context = sorted(set(range(total)) - target)
    if len(context) / total < config.min_context_ratio:
        return _fallback_mask(config, sample_index=sample_index, reason="insufficient_context_after_region_selection")
    return {
        "schema_version": M2_MASK_SCHEMA_VERSION,
        "seed": config.seed,
        "sample_index": sample_index,
        "screen_id": screen_id,
        "image_size": config.image_size,
        "patch_size": config.patch_size,
        "grid_width": grid,
        "grid_height": grid,
        "target_patch_ids": sorted(target),
        "context_patch_ids": context,
        "target_ratio": len(target) / total,
        "context_ratio": len(context) / total,
        "fallback": False,
        "fallback_reason": None,
        "target_regions": selected,
        "candidate_region_count": len(candidates),
        "target_region_type_counts": dict(sorted(Counter(item["region_type"] for item in selected).items())),
    }


def batch_semantic_masks(
    torch,
    config: M2MaskConfig,
    records: list[dict[str, Any]],
    regions: list[list[dict[str, Any]]],
    normalizations: list[dict[str, Any]],
    *,
    start_index: int,
    device,
) -> tuple[Any, Any, list[dict[str, Any]]]:
    total = (config.image_size // config.patch_size) ** 2
    target = torch.zeros((len(records), total), dtype=torch.bool, device=device)
    context = torch.zeros((len(records), total), dtype=torch.bool, device=device)
    metadata = []
    for row, record in enumerate(records):
        meta = sample_semantic_region_mask(
            config,
            screen_id=str(record["screen_id"]),
            regions=regions[row],
            normalization=normalizations[row],
            sample_index=start_index + row,
        )
        target[row, meta["target_patch_ids"]] = True
        context[row, meta["context_patch_ids"]] = True
        metadata.append(meta)
    return target, context, metadata


def train_m2(config: M2TrainConfig) -> M1Result:
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
    mask_config = M2MaskConfig(
        image_size=config.image_size,
        patch_size=config.patch_size,
        target_regions=config.target_regions,
        min_region_area_ratio=config.min_region_area_ratio,
        max_region_area_ratio=config.max_region_area_ratio,
        min_context_ratio=config.min_context_ratio,
        seed=config.seed,
    )
    write_json(output_dir / "config.json", public_m2_config(config, device=str(device), model_config=model_config, mask_config=mask_config))
    model = build_m1_model(model_config).to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=config.lr, weight_decay=config.weight_decay)
    train_limit = config.smoke_limit if config.smoke else None
    val_limit = max(8, min(config.smoke_limit // 4, config.smoke_limit)) if config.smoke else None
    train_data = UiJepaM2Dataset(
        config.dataset_dir,
        split="train",
        image_size=config.image_size,
        seed=config.seed,
        shuffle=True,
        limit=train_limit,
        regions_path=config.regions_path,
    )
    val_data = UiJepaM2Dataset(
        config.dataset_dir,
        split="val",
        image_size=config.image_size,
        seed=config.seed,
        shuffle=False,
        limit=val_limit,
        regions_path=config.regions_path,
    )
    generator = torch.Generator()
    generator.manual_seed(config.seed)
    train_loader = torch.utils.data.DataLoader(train_data, batch_size=config.batch_size, shuffle=True, generator=generator, collate_fn=collate_m2)
    val_loader = torch.utils.data.DataLoader(val_data, batch_size=config.batch_size, shuffle=False, collate_fn=collate_m2)
    history: list[dict[str, Any]] = []
    mask_stats = new_mask_stats()
    start = time.perf_counter()
    global_index = 0
    for epoch in range(1, config.epochs + 1):
        model.train()
        train_loss = 0.0
        train_seen = 0
        epoch_region_loss = new_region_loss_accumulator()
        for batch_index, batch in enumerate(train_loader, start=1):
            images = batch["images"].to(device)
            target_mask, context_mask, metadata = batch_semantic_masks(
                torch,
                mask_config,
                batch["records"],
                batch["regions"],
                batch["normalization"],
                start_index=global_index,
                device=device,
            )
            global_index += int(images.shape[0])
            update_mask_stats(mask_stats, metadata, split="train")
            outputs = model(images, target_mask, context_mask)
            update_region_losses(torch, epoch_region_loss, outputs, metadata)
            optimizer.zero_grad(set_to_none=True)
            outputs["loss"].backward()
            optimizer.step()
            model.update_target(config.ema_decay)
            batch_size = int(images.shape[0])
            train_seen += batch_size
            train_loss += float(outputs["loss"].detach().cpu()) * batch_size
            emit_progress(config.progress_callback, {"event": "m2_train_batch", "epoch": epoch, "batch": batch_index, "loss": float(outputs["loss"].detach().cpu())})
        val_loss, val_metadata = evaluate_m2_loss(torch, model, val_loader, mask_config, device, seed_offset=100_000 + epoch * 10_000)
        update_mask_stats(mask_stats, val_metadata, split="val")
        row = {
            "epoch": epoch,
            "train_loss": train_loss / max(train_seen, 1),
            "val_loss": val_loss,
            "train_record_count": train_seen,
            "train_loss_by_region_type": summarize_region_loss_accumulator(epoch_region_loss),
        }
        history.append(row)
        emit_progress(config.progress_callback, {"event": "m2_epoch_end", **row})
    write_jsonl(output_dir / "metrics.jsonl", history)
    checkpoint_path = checkpoint_dir / "m2_last.pt"
    torch.save(
        {
            "model_state_dict": model.state_dict(),
            "model_config": asdict(model_config),
            "mask_config": asdict(mask_config),
            "train_config": public_m2_config(config, device=str(device), model_config=model_config, mask_config=mask_config),
            "history": history,
            "mask_diagnostics": summarize_mask_stats(mask_stats),
        },
        checkpoint_path,
    )
    probe = run_m2_probe(
        M2ProbeConfig(
            dataset_dir=config.dataset_dir,
            checkpoint=checkpoint_path,
            output_dir=output_dir / "probe",
            report_out=config.report_out,
            b0_report=config.b0_report,
            m1_report=config.m1_report,
            batch_size=config.batch_size,
            device=config.device,
            seed=config.seed,
            probe_epochs=config.probe_epochs,
            probe_lr=config.probe_lr,
        ),
        training_history=history,
        runtime_seconds=time.perf_counter() - start,
        mask_diagnostics=summarize_mask_stats(mask_stats),
    )
    return probe


def evaluate_m2_loss(torch, model, loader, mask_config: M2MaskConfig, device, *, seed_offset: int) -> tuple[float | None, list[dict[str, Any]]]:
    if len(loader.dataset) == 0:
        return None, []
    model.eval()
    total = 0.0
    seen = 0
    all_metadata = []
    with torch.no_grad():
        for batch_index, batch in enumerate(loader):
            images = batch["images"].to(device)
            target_mask, context_mask, metadata = batch_semantic_masks(
                torch,
                mask_config,
                batch["records"],
                batch["regions"],
                batch["normalization"],
                start_index=seed_offset + batch_index * 10_000,
                device=device,
            )
            outputs = model(images, target_mask, context_mask)
            batch_size = int(images.shape[0])
            total += float(outputs["loss"].detach().cpu()) * batch_size
            seen += batch_size
            all_metadata.extend(metadata)
    return total / max(seen, 1), all_metadata


def run_m2_probe(
    config: M2ProbeConfig,
    *,
    training_history: list[dict[str, Any]] | None = None,
    runtime_seconds: float | None = None,
    mask_diagnostics: dict[str, Any] | None = None,
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
    embeddings = export_m2_embeddings(torch, model, config.dataset_dir, model_config.image_size, config.batch_size, device)
    write_jsonl(output_dir / "embeddings.jsonl", [{"screen_id": key, "embedding": value} for key, value in sorted(embeddings.items())])
    collapse = collapse_diagnostics(embeddings)
    pairs = _read_jsonl(config.dataset_dir / "pairs.jsonl")
    splits = _read_json(config.dataset_dir / "splits.json")
    probe = train_pairwise_probe(torch, embeddings, pairs, splits, seed=config.seed, epochs=config.probe_epochs, lr=config.probe_lr)
    b0 = load_b0_comparison(config.b0_report)
    m1 = load_m1_comparison(config.m1_report)
    previous_report = {}
    report_json_path = config.report_out.expanduser().resolve()
    if report_json_path.is_file():
        previous_report = json.loads(report_json_path.read_text(encoding="utf-8"))
    resolved_history = training_history if training_history is not None else checkpoint.get("history", previous_report.get("history", []))
    resolved_runtime = runtime_seconds if runtime_seconds is not None else previous_report.get("runtime_seconds")
    resolved_masks = mask_diagnostics or checkpoint.get("mask_diagnostics", previous_report.get("mask_diagnostics", {}))
    report = build_m2_report(
        dataset_dir=config.dataset_dir,
        checkpoint_path=checkpoint_path,
        model_config=model_config,
        mask_config=M2MaskConfig(**checkpoint["mask_config"]),
        train_config=checkpoint.get("train_config", {}),
        history=resolved_history,
        runtime_seconds=resolved_runtime,
        collapse=collapse,
        probe=probe,
        b0_comparison=b0,
        m1_comparison=m1,
        mask_diagnostics=resolved_masks,
    )
    report_json_path.parent.mkdir(parents=True, exist_ok=True)
    write_json(report_json_path, report)
    report_md_path = report_json_path.with_suffix(".md")
    report_md_path.write_text(m2_markdown(report), encoding="utf-8")
    comparison_path = report_json_path.with_name("m2_comparison.json")
    write_json(comparison_path, report["comparison"])
    return M1Result(output_dir, checkpoint_path, report_json_path, report_md_path, report)


def export_m2_embeddings(torch, model, dataset_dir: Path, image_size: int, batch_size: int, device) -> dict[str, list[float]]:
    dataset = UiJepaM2Dataset(dataset_dir, split=None, image_size=image_size, shuffle=False)
    loader = torch.utils.data.DataLoader(dataset, batch_size=batch_size, shuffle=False, collate_fn=collate_m2)
    embeddings: dict[str, list[float]] = {}
    with torch.no_grad():
        for batch in loader:
            images = batch["images"].to(device)
            values = model.encode(images).detach().cpu()
            for record, vector in zip(batch["records"], values, strict=True):
                embeddings[str(record["screen_id"])] = [float(value) for value in vector.tolist()]
    return embeddings


def build_m2_report(
    *,
    dataset_dir: Path,
    checkpoint_path: Path,
    model_config: M1ModelConfig,
    mask_config: M2MaskConfig,
    train_config: dict[str, Any],
    history: list[dict[str, Any]],
    runtime_seconds: float | None,
    collapse: dict[str, Any],
    probe: dict[str, Any],
    b0_comparison: dict[str, Any],
    m1_comparison: dict[str, Any],
    mask_diagnostics: dict[str, Any],
) -> dict[str, Any]:
    manifest = _read_jsonl(dataset_dir / "manifest.jsonl")
    regions = _read_jsonl(dataset_dir / "regions.jsonl")
    pairs = _read_jsonl(dataset_dir / "pairs.jsonl")
    splits = _read_json(dataset_dir / "splits.json")
    pair_counts = {split: sum(1 for pair in pairs if (splits.get("pair_split_by_group") or {}).get(pair.get("split_group")) == split) for split in SPLITS}
    valid_probe = bool(probe.get("available")) and all((probe.get("splits") or {}).get(split, {}).get("pair_count", 0) > 0 for split in ("val", "test"))
    valid_m2 = bool(collapse.get("valid")) and valid_probe and bool(history) and bool(mask_diagnostics)
    comparison = build_m2_comparison(probe, m1_comparison, b0_comparison, valid_m2=valid_m2)
    warnings = []
    if not collapse.get("valid"):
        warnings.append("M2 embeddings failed collapse diagnostics.")
    test_acc = ((probe.get("splits") or {}).get("test") or {}).get("pairwise_accuracy")
    if isinstance(test_acc, int | float) and abs(test_acc - 0.5) <= 0.03 and collapse.get("valid"):
        warnings.append("M2 is non-collapsed but near chance on the frozen preference probe; semantic masking alone may be insufficient.")
    if comparison.get("metrics_only_still_dominates"):
        warnings.append("The deterministic metrics-only baseline still beats the learned screenshot embeddings on test accuracy.")
    return {
        "schema_version": M2_SCHEMA_VERSION,
        "dataset_dir": str(dataset_dir.expanduser().resolve()),
        "dataset_counts": {"manifest": len(manifest), "pairs": len(pairs), "regions": len(regions)},
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
        "mask_diagnostics": mask_diagnostics,
        "collapse_diagnostics": collapse,
        "probe": {key: value for key, value in probe.items() if key != "pair_scores"},
        "m1_comparison": m1_comparison,
        "b0_comparison": b0_comparison,
        "metrics_only_comparison": b0_comparison.get("metrics_only"),
        "comparison": comparison,
        "valid_m2_baseline": valid_m2,
        "recommended_next_stage": recommend_next_stage(valid_m2, collapse, comparison),
        "warnings": warnings,
        "failed_or_skipped_reasons": ([] if valid_m2 else ["collapse diagnostics, semantic masks, or frozen probe incomplete"]),
        "commands": {"train": " ".join(os.sys.argv)},
        "git": git_state(),
    }


def build_m2_comparison(
    probe: dict[str, Any],
    m1_comparison: dict[str, Any],
    b0_comparison: dict[str, Any],
    *,
    valid_m2: bool,
) -> dict[str, Any]:
    m2_test = ((probe.get("splits") or {}).get("test") or {}).get("pairwise_accuracy")
    m2_val = ((probe.get("splits") or {}).get("val") or {}).get("pairwise_accuracy")
    m1_test = m1_comparison.get("m1_test_accuracy")
    m1_val = m1_comparison.get("m1_val_accuracy")
    b0_test = b0_comparison.get("b0_test_accuracy")
    b0_val = b0_comparison.get("b0_val_accuracy")
    metrics_test = (b0_comparison.get("metrics_only") or {}).get("test_accuracy")
    metrics_val = (b0_comparison.get("metrics_only") or {}).get("val_accuracy")
    improves_m1 = _gt(m2_test, m1_test)
    closes_b0 = None
    if all(isinstance(value, int | float) for value in (m1_test, m2_test, b0_test)):
        closes_b0 = abs(float(b0_test) - float(m2_test)) < abs(float(b0_test) - float(m1_test))
    return {
        "schema_version": "ui_jepa_m2_comparison_v1",
        "valid": valid_m2 and bool(m1_comparison.get("available")) and bool(b0_comparison.get("available")),
        "same_pairs": True,
        "models": {
            "m1_random_block_jepa": {"val_accuracy": m1_val, "test_accuracy": m1_test, "valid": m1_comparison.get("valid_m1_baseline")},
            "m2_semantic_region_jepa": {"val_accuracy": m2_val, "test_accuracy": m2_test, "valid": valid_m2},
            "b0_frozen_dinov2": {"val_accuracy": b0_val, "test_accuracy": b0_test, "valid": b0_comparison.get("valid_for_model_selection")},
            "metrics_only": {"val_accuracy": metrics_val, "test_accuracy": metrics_test, "valid": (b0_comparison.get("metrics_only") or {}).get("available")},
        },
        "m2_improves_over_m1": improves_m1,
        "m2_test_lift_over_m1": lift(m2_test, m1_test),
        "m2_closes_gap_to_b0": closes_b0,
        "m2_test_gap_to_b0": lift(m2_test, b0_test),
        "metrics_only_still_dominates": _gt(metrics_test, max_numeric([m1_test, m2_test, b0_test])),
    }


def m2_report_allows_dom_aware(report: dict[str, Any]) -> bool:
    if not report.get("valid_m2_baseline"):
        return False
    if not (report.get("collapse_diagnostics") or {}).get("valid"):
        return False
    if not (report.get("probe") or {}).get("available"):
        return False
    comparison = report.get("comparison") or {}
    if not comparison.get("valid"):
        return False
    return True


def load_m1_comparison(path: Path | None) -> dict[str, Any]:
    if path is None:
        return {"available": False, "skipped_reason": "no M1 report supplied"}
    resolved = path.expanduser().resolve()
    if not resolved.is_file():
        return {"available": False, "skipped_reason": f"M1 report missing: {resolved}"}
    report = json.loads(resolved.read_text(encoding="utf-8"))
    splits = (report.get("probe") or {}).get("splits") or {}
    return {
        "available": True,
        "m1_report": str(resolved),
        "valid_m1_baseline": report.get("valid_m1_baseline"),
        "m1_val_accuracy": (splits.get("val") or {}).get("pairwise_accuracy"),
        "m1_test_accuracy": (splits.get("test") or {}).get("pairwise_accuracy"),
        "m1_val_lift_over_best_constant": (splits.get("val") or {}).get("lift_over_best_constant"),
        "m1_test_lift_over_best_constant": (splits.get("test") or {}).get("lift_over_best_constant"),
    }


def new_mask_stats() -> dict[str, Any]:
    return {
        "sample_count_by_split": Counter(),
        "fallback_count_by_split": Counter(),
        "target_region_type_counts": Counter(),
        "target_area_ratio_sum": 0.0,
        "target_area_ratio_count": 0,
        "region_coverage_by_split": defaultdict(Counter),
        "fallback_reasons": Counter(),
        "examples_by_region_type": defaultdict(list),
    }


def update_mask_stats(stats: dict[str, Any], metadata: list[dict[str, Any]], *, split: str) -> None:
    for meta in metadata:
        stats["sample_count_by_split"][split] += 1
        stats["target_area_ratio_sum"] += float(meta.get("target_ratio") or 0.0)
        stats["target_area_ratio_count"] += 1
        if meta.get("fallback"):
            stats["fallback_count_by_split"][split] += 1
            stats["fallback_reasons"][str(meta.get("fallback_reason"))] += 1
            continue
        seen_types = set()
        for region in meta.get("target_regions") or []:
            region_type = str(region.get("region_type", "unknown"))
            stats["target_region_type_counts"][region_type] += 1
            seen_types.add(region_type)
            examples = stats["examples_by_region_type"][region_type]
            if len(examples) < 5:
                examples.append(
                    {
                        "screen_id": meta.get("screen_id"),
                        "region_id": region.get("region_id"),
                        "target_area_ratio": region.get("target_area_ratio"),
                        "patch_bbox": region.get("patch_bbox"),
                    }
                )
        for region_type in seen_types:
            stats["region_coverage_by_split"][split][region_type] += 1


def summarize_mask_stats(stats: dict[str, Any]) -> dict[str, Any]:
    sample_counts = dict(sorted(stats["sample_count_by_split"].items()))
    fallback_counts = dict(sorted(stats["fallback_count_by_split"].items()))
    total = sum(sample_counts.values())
    fallback_total = sum(fallback_counts.values())
    return {
        "schema_version": "ui_jepa_m2_mask_diagnostics_v1",
        "sample_count": total,
        "sample_count_by_split": sample_counts,
        "target_region_type_counts": dict(sorted(stats["target_region_type_counts"].items())),
        "fallback_random_mask_count": fallback_total,
        "fallback_random_mask_rate": fallback_total / total if total else None,
        "fallback_random_mask_rate_by_split": {
            split: fallback_counts.get(split, 0) / count if count else None
            for split, count in sample_counts.items()
        },
        "fallback_reasons": dict(sorted(stats["fallback_reasons"].items())),
        "average_target_area_ratio": stats["target_area_ratio_sum"] / stats["target_area_ratio_count"] if stats["target_area_ratio_count"] else None,
        "region_coverage_by_split": {
            split: dict(sorted(counter.items())) for split, counter in sorted(stats["region_coverage_by_split"].items())
        },
        "nearest_neighbor_examples_by_region_type": {
            region_type: examples for region_type, examples in sorted(stats["examples_by_region_type"].items())
        },
    }


def new_region_loss_accumulator() -> dict[str, dict[str, float]]:
    return defaultdict(lambda: {"sum": 0.0, "count": 0.0})


def update_region_losses(torch, accumulator: dict[str, dict[str, float]], outputs: dict[str, Any], metadata: list[dict[str, Any]]) -> None:
    with torch.no_grad():
        per_token = (outputs["predicted_tokens"] - outputs["target_tokens"]).pow(2).sum(dim=-1).detach().cpu()
        for row, meta in enumerate(metadata):
            if meta.get("fallback"):
                continue
            for region in meta.get("target_regions") or []:
                ids = region.get("patch_ids") or []
                if not ids:
                    continue
                values = per_token[row, ids]
                bucket = accumulator[str(region.get("region_type", "unknown"))]
                bucket["sum"] += float(values.sum().item())
                bucket["count"] += float(values.numel())


def summarize_region_loss_accumulator(accumulator: dict[str, dict[str, float]]) -> dict[str, float]:
    return {
        region_type: values["sum"] / values["count"]
        for region_type, values in sorted(accumulator.items())
        if values["count"] > 0
    }


def public_m2_config(config: M2TrainConfig, *, device: str, model_config: M1ModelConfig, mask_config: M2MaskConfig) -> dict[str, Any]:
    payload = {key: value for key, value in asdict(config).items() if key != "progress_callback"}
    for key in ("dataset_dir", "output_dir", "report_out", "b0_report", "m1_report", "regions_path"):
        if payload.get(key) is not None:
            payload[key] = str(payload[key])
    payload["resolved_device"] = device
    payload["model_config"] = asdict(model_config)
    payload["mask_config"] = asdict(mask_config)
    return payload


def recommend_next_stage(valid_m2: bool, collapse: dict[str, Any], comparison: dict[str, Any]) -> str:
    if not valid_m2 or not collapse.get("valid"):
        return "fix_M2_collapse_or_probe_before_DOM_aware"
    m2_acc = ((comparison.get("models") or {}).get("m2_semantic_region_jepa") or {}).get("test_accuracy")
    m1_acc = ((comparison.get("models") or {}).get("m1_random_block_jepa") or {}).get("test_accuracy")
    b0_acc = ((comparison.get("models") or {}).get("b0_frozen_dinov2") or {}).get("test_accuracy")
    if isinstance(m2_acc, int | float) and abs(float(m2_acc) - 0.5) <= 0.03:
        return "improve_M2_masking_or_model_scale_before_DOM_aware"
    if _gt(m2_acc, b0_acc):
        return "audit_benchmark_for_shortcuts_before_trusting_M2"
    if _gt(m2_acc, m1_acc):
        return "consider_stronger_M2_or_DOM_aware_probe"
    return "improve_semantic_masking_before_DOM_aware"


def m2_markdown(report: dict[str, Any]) -> str:
    probe = report.get("probe") or {}
    splits = probe.get("splits") or {}
    comparison = report.get("comparison") or {}
    lines = [
        "# UI-JEPA M2 Semantic-Region Screenshot JEPA",
        "",
        f"- Valid M2 baseline: {report.get('valid_m2_baseline')}",
        f"- Recommended next stage: {report.get('recommended_next_stage')}",
        f"- Final train JEPA loss: {report.get('final_train_jepa_loss')}",
        f"- Final val JEPA loss: {report.get('final_val_jepa_loss')}",
        f"- Collapse valid: {(report.get('collapse_diagnostics') or {}).get('valid')}",
        f"- Fallback random-mask rate: {(report.get('mask_diagnostics') or {}).get('fallback_random_mask_rate')}",
        "",
        "## Frozen Probe",
        "",
    ]
    for split in SPLITS:
        summary = splits.get(split) or {}
        lines.append(f"- {split}: accuracy={summary.get('pairwise_accuracy')} pairs={summary.get('pair_count')} lift={summary.get('lift_over_best_constant')}")
    lines.extend(["", "## Comparison", ""])
    models = comparison.get("models") or {}
    for name, values in models.items():
        lines.append(f"- {name}: test_accuracy={values.get('test_accuracy')} valid={values.get('valid')}")
    lines.append(f"- M2 improves over M1: {comparison.get('m2_improves_over_m1')}")
    lines.append(f"- M2 closes gap to B0: {comparison.get('m2_closes_gap_to_b0')}")
    lines.append(f"- Metrics-only still dominates: {comparison.get('metrics_only_still_dominates')}")
    lines.extend(["", "## Warnings", ""])
    lines.extend(f"- {warning}" for warning in report.get("warnings", []))
    return "\n".join(lines) + "\n"


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


def _fallback_mask(config: M2MaskConfig, *, sample_index: int, reason: str) -> dict[str, Any]:
    fallback = M1MaskConfig(
        image_size=config.image_size,
        patch_size=config.patch_size,
        target_blocks=max(1, config.target_regions),
        min_context_ratio=config.min_context_ratio,
        seed=config.seed,
    )
    from pawl_jepa.m1 import sample_random_block_mask

    meta = sample_random_block_mask(fallback, sample_index=sample_index)
    return {
        **meta,
        "schema_version": M2_MASK_SCHEMA_VERSION,
        "fallback": True,
        "fallback_reason": reason,
        "target_regions": [],
        "candidate_region_count": 0,
        "target_region_type_counts": {},
    }


def _stable_int(value: str) -> int:
    digest = hashlib.sha256(value.encode("utf-8")).hexdigest()
    return int(digest[:8], 16)


def _gt(left: Any, right: Any) -> bool | None:
    if not isinstance(left, int | float) or not isinstance(right, int | float):
        return None
    return float(left) > float(right)


def max_numeric(values: list[Any]) -> float | None:
    numeric = [float(value) for value in values if isinstance(value, int | float)]
    return max(numeric) if numeric else None


def _read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _read_jsonl(path: Path) -> list[dict[str, Any]]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
