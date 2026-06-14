"""Benchmark package for frontend design evaluation."""

from pawlbench_design.embeddings import EmbeddingConfig, EmbeddingResult, build_encoder_baselines
from pawlbench_design.datasets import (
    ReportConfig,
    ReportResult,
    SplitConfig,
    SplitResult,
    ValidationConfig,
    ValidationResult,
    export_dataset_report,
    split_dataset,
    validate_dataset,
)
from pawlbench_design.evaluator import EvalConfig, EvalResult, evaluate_jitter_pairs

__version__ = "0.1.0"

__all__ = [
    "EmbeddingConfig",
    "EmbeddingResult",
    "EvalConfig",
    "EvalResult",
    "ReportConfig",
    "ReportResult",
    "SplitConfig",
    "SplitResult",
    "ValidationConfig",
    "ValidationResult",
    "__version__",
    "build_encoder_baselines",
    "export_dataset_report",
    "split_dataset",
    "validate_dataset",
    "evaluate_jitter_pairs",
]
