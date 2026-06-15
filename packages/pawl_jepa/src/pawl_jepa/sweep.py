"""Seed sweep orchestration for Pawl-JEPA microtraining."""

from __future__ import annotations

import math
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from pawl_jepa.evaluate import EvalConfig, evaluate_micro_model
from pawl_jepa.manifest import write_json
from pawl_jepa.train import TrainConfig, train_micro_model


SUMMARY_METRICS = (
    "pairwise_good_vs_bad_accuracy",
    "pairwise_lift_over_always_original",
    "defect_classification_accuracy",
    "defect_lift_over_majority",
    "retrieval_top1",
    "average_latent_prediction_loss",
)


@dataclass(frozen=True)
class SweepConfig:
    manifest_dir: Path
    output_dir: Path
    seeds: tuple[int, ...]
    epochs: int = 2
    batch_size: int = 8
    lr: float = 1e-3
    device: str = "auto"
    image_size: int = 224
    latent_weight: float = 1.0
    preference_weight: float = 0.25
    defect_weight: float = 0.1
    embedding_dim: int = 64
    hidden_dim: int = 128
    defect_head: bool = True


@dataclass(frozen=True)
class SweepResult:
    output_dir: Path
    summary_path: Path
    summary: dict[str, Any]


def run_seed_sweep(config: SweepConfig) -> SweepResult:
    if not config.seeds:
        raise ValueError("at least one seed is required")

    output_dir = config.output_dir.expanduser().resolve()
    runs_dir = output_dir / "runs"
    runs_dir.mkdir(parents=True, exist_ok=True)

    run_summaries: list[dict[str, Any]] = []
    warnings: list[str] = []
    for seed in config.seeds:
        seed_dir = runs_dir / f"seed_{seed}"
        train_result = train_micro_model(
            TrainConfig(
                manifest_dir=config.manifest_dir,
                output_dir=seed_dir / "run",
                epochs=config.epochs,
                batch_size=config.batch_size,
                lr=config.lr,
                device=config.device,
                image_size=config.image_size,
                seed=seed,
                latent_weight=config.latent_weight,
                preference_weight=config.preference_weight,
                defect_weight=config.defect_weight,
                embedding_dim=config.embedding_dim,
                hidden_dim=config.hidden_dim,
                defect_head=config.defect_head,
            )
        )
        eval_result = evaluate_micro_model(
            EvalConfig(
                run_dir=train_result.output_dir,
                manifest_dir=config.manifest_dir,
                output_dir=seed_dir / "eval",
                batch_size=config.batch_size,
                device=config.device,
                random_seed=seed,
            )
        )
        for split_summary in eval_result.summary.get("splits", {}).values():
            warnings.extend(str(warning) for warning in split_summary.get("warnings", []))
        run_summaries.append(
            {
                "seed": seed,
                "run_dir": str(train_result.output_dir),
                "eval_dir": str(eval_result.output_dir),
                "splits": eval_result.summary["splits"],
            }
        )

    summary = {
        "manifest_dir": str(config.manifest_dir.expanduser().resolve()),
        "seeds": list(config.seeds),
        "runs": run_summaries,
        "splits": aggregate_splits(run_summaries),
        "best_seed_by_metric": best_seed_by_metric(run_summaries),
        "warnings": sorted(set(warnings)),
    }
    summary_path = output_dir / "sweep_summary.json"
    write_json(summary_path, summary)
    return SweepResult(output_dir, summary_path, summary)


def aggregate_splits(run_summaries: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    split_names = sorted(
        {
            split
            for run_summary in run_summaries
            for split in run_summary.get("splits", {})
        }
    )
    aggregates: dict[str, dict[str, Any]] = {}
    for split in split_names:
        aggregates[split] = {}
        for metric in SUMMARY_METRICS:
            values = [
                run_summary["splits"][split].get(metric)
                for run_summary in run_summaries
                if split in run_summary.get("splits", {})
                and run_summary["splits"][split].get(metric) is not None
            ]
            aggregates[split][metric] = mean_std([float(value) for value in values])
    return aggregates


def mean_std(values: list[float]) -> dict[str, float | None]:
    if not values:
        return {"mean": None, "std": None}
    mean = sum(values) / len(values)
    variance = sum((value - mean) ** 2 for value in values) / len(values)
    return {"mean": mean, "std": math.sqrt(variance)}


def best_seed_by_metric(run_summaries: list[dict[str, Any]]) -> dict[str, dict[str, int | float | None]]:
    best: dict[str, dict[str, int | float | None]] = {}
    for split in ("val", "test"):
        best[split] = {}
        for metric in SUMMARY_METRICS:
            candidates = [
                (run_summary["seed"], run_summary.get("splits", {}).get(split, {}).get(metric))
                for run_summary in run_summaries
            ]
            candidates = [(seed, value) for seed, value in candidates if value is not None]
            if not candidates:
                best[split][metric] = None
                continue
            reverse = metric != "average_latent_prediction_loss"
            seed, _ = sorted(candidates, key=lambda item: (float(item[1]), -item[0]), reverse=reverse)[0]
            best[split][metric] = seed
    return best
