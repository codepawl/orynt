"""Pawl-JEPA microtraining scaffold."""

from pawl_jepa.manifest import (
    PrepareHardConfig,
    PrepareConfig,
    PrepareResult,
    build_manifest_record,
    load_manifest_records,
    prepare_hard_manifest,
    prepare_manifest,
    preferred_item_from_label,
)
from pawl_jepa.report import ReportConfig, ReportResult, export_experiment_report
from pawl_jepa.sweep import SweepConfig, SweepResult, run_seed_sweep
from pawl_jepa.positive import (
    PositiveEvalConfig,
    PositiveEvalResult,
    PositivePrepareConfig,
    PositivePrepareResult,
    PositiveTrainConfig,
    PositiveTrainResult,
    evaluate_positive_model,
    prepare_positive_manifest,
    train_positive_model,
)

__all__ = ["__version__"]

__version__ = "0.1.0"

__all__ = [
    "PrepareConfig",
    "PrepareHardConfig",
    "PrepareResult",
    "PositiveEvalConfig",
    "PositiveEvalResult",
    "PositivePrepareConfig",
    "PositivePrepareResult",
    "PositiveTrainConfig",
    "PositiveTrainResult",
    "ReportConfig",
    "ReportResult",
    "SweepConfig",
    "SweepResult",
    "__version__",
    "build_manifest_record",
    "export_experiment_report",
    "evaluate_positive_model",
    "load_manifest_records",
    "prepare_hard_manifest",
    "prepare_manifest",
    "prepare_positive_manifest",
    "preferred_item_from_label",
    "run_seed_sweep",
    "train_positive_model",
]
