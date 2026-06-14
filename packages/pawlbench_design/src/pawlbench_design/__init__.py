"""Benchmark package for frontend design evaluation."""

from pawlbench_design.embeddings import EmbeddingConfig, EmbeddingResult, build_encoder_baselines
from pawlbench_design.evaluator import EvalConfig, EvalResult, evaluate_jitter_pairs

__version__ = "0.1.0"

__all__ = [
    "EmbeddingConfig",
    "EmbeddingResult",
    "EvalConfig",
    "EvalResult",
    "__version__",
    "build_encoder_baselines",
    "evaluate_jitter_pairs",
]
