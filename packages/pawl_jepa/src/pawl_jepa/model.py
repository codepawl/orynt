"""Small PyTorch model for Pawl-JEPA microtraining."""

from __future__ import annotations

from dataclasses import dataclass

from pawl_jepa.data import DEFECT_TYPES
from pawl_jepa.torch_utils import import_torch_nn


@dataclass(frozen=True)
class ModelConfig:
    image_size: int = 224
    embedding_dim: int = 64
    hidden_dim: int = 128
    defect_head: bool = True


def build_model(config: ModelConfig):
    torch, nn = import_torch_nn()

    class SmallPawlJepaModel(nn.Module):
        def __init__(self) -> None:
            super().__init__()
            self.encoder = nn.Sequential(
                nn.Conv2d(3, 16, kernel_size=5, stride=2, padding=2),
                nn.BatchNorm2d(16),
                nn.ReLU(inplace=True),
                nn.Conv2d(16, 32, kernel_size=3, stride=2, padding=1),
                nn.BatchNorm2d(32),
                nn.ReLU(inplace=True),
                nn.Conv2d(32, 64, kernel_size=3, stride=2, padding=1),
                nn.BatchNorm2d(64),
                nn.ReLU(inplace=True),
                nn.AdaptiveAvgPool2d((1, 1)),
                nn.Flatten(),
                nn.Linear(64, config.embedding_dim),
            )
            self.predictor = nn.Sequential(
                nn.Linear(config.embedding_dim, config.hidden_dim),
                nn.ReLU(inplace=True),
                nn.Linear(config.hidden_dim, config.embedding_dim),
            )
            self.preference_head = nn.Linear(config.embedding_dim, 1)
            self.defect_head = (
                nn.Linear(config.embedding_dim, len(DEFECT_TYPES)) if config.defect_head else None
            )

        def encode(self, images):
            return self.encoder(images)

        def forward(self, original, variant):
            original_embedding = self.encode(original)
            variant_embedding = self.encode(variant)
            predicted_original = self.predictor(variant_embedding)
            original_normalized = torch.nn.functional.normalize(original_embedding, dim=1)
            variant_normalized = torch.nn.functional.normalize(variant_embedding, dim=1)
            predicted_normalized = torch.nn.functional.normalize(predicted_original, dim=1)
            original_score = self.preference_head(original_embedding).squeeze(1)
            variant_score = self.preference_head(variant_embedding).squeeze(1)
            defect_logits = (
                self.defect_head(variant_embedding) if self.defect_head is not None else None
            )
            return {
                "original_embedding": original_embedding,
                "variant_embedding": variant_embedding,
                "predicted_original": predicted_original,
                "original_normalized": original_normalized,
                "variant_normalized": variant_normalized,
                "predicted_normalized": predicted_normalized,
                "original_score": original_score,
                "variant_score": variant_score,
                "defect_logits": defect_logits,
            }

    return SmallPawlJepaModel()
