"""Lazy optional training dependency helpers."""

from __future__ import annotations


INSTALL_INSTRUCTIONS = "Install Pawl-JEPA training dependencies with: uv sync --extra jepa"


def import_torch():
    try:
        import torch
    except ImportError as exc:
        raise RuntimeError(INSTALL_INSTRUCTIONS) from exc
    return torch


def import_torch_nn():
    torch = import_torch()
    return torch, torch.nn


def resolve_device(raw_device: str):
    torch = import_torch()
    if raw_device == "auto":
        return torch.device("cuda" if torch.cuda.is_available() else "cpu")
    if raw_device == "cuda" and not torch.cuda.is_available():
        raise ValueError("CUDA requested but torch.cuda.is_available() is false")
    return torch.device(raw_device)
