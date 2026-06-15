"""Loss calculation for Pawl-JEPA microtraining."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from pawl_jepa.torch_utils import import_torch


@dataclass(frozen=True)
class LossWeights:
    latent: float = 1.0
    preference: float = 0.25
    defect: float = 0.1


def compute_losses(outputs: dict[str, Any], batch: dict[str, Any], weights: LossWeights) -> dict[str, Any]:
    torch = import_torch()
    functional = torch.nn.functional
    latent_loss = functional.mse_loss(outputs["predicted_original"], outputs["original_embedding"].detach())

    margin = outputs["variant_score"] - outputs["original_score"]
    targets = batch["preference_target"].to(margin.device)
    mask = batch["pairwise_mask"].to(margin.device)
    raw_preference = functional.softplus(margin * targets)
    preference_loss = (raw_preference * mask).sum() / mask.sum().clamp_min(1.0)

    defect_logits = outputs.get("defect_logits")
    defect_target = batch["defect_target"].to(margin.device)
    valid_defects = defect_target >= 0
    if defect_logits is not None and valid_defects.any():
        defect_loss = functional.cross_entropy(defect_logits[valid_defects], defect_target[valid_defects])
    else:
        defect_loss = latent_loss.new_tensor(0.0)

    total = (
        weights.latent * latent_loss
        + weights.preference * preference_loss
        + weights.defect * defect_loss
    )
    return {
        "total_loss": total,
        "latent_loss": latent_loss,
        "preference_loss": preference_loss,
        "defect_loss": defect_loss,
    }
