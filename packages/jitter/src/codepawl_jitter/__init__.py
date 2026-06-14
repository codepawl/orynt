"""Controlled UI perturbation package for Pawl-JEPA data generation."""

from codepawl_jitter.generator import (
    JitterConfig,
    JitterResult,
    JitterVariant,
    generate_jitter_pair_files,
    validate_html_input,
)

__version__ = "0.1.0"

__all__ = [
    "JitterConfig",
    "JitterResult",
    "JitterVariant",
    "__version__",
    "generate_jitter_pair_files",
    "validate_html_input",
]
