"""Pawl-JEPA microtraining scaffold."""

from pawl_jepa.manifest import (
    PrepareConfig,
    PrepareResult,
    build_manifest_record,
    load_manifest_records,
    prepare_manifest,
    preferred_item_from_label,
)
from pawl_jepa.report import ReportConfig, ReportResult, export_experiment_report
from pawl_jepa.sweep import SweepConfig, SweepResult, run_seed_sweep

__all__ = ["__version__"]

__version__ = "0.1.0"

__all__ = [
    "PrepareConfig",
    "PrepareResult",
    "ReportConfig",
    "ReportResult",
    "SweepConfig",
    "SweepResult",
    "__version__",
    "build_manifest_record",
    "export_experiment_report",
    "load_manifest_records",
    "prepare_manifest",
    "preferred_item_from_label",
    "run_seed_sweep",
]
