"""Image-pair dataset helpers for Pawl-JEPA microtraining."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from PIL import Image

from pawl_jepa.manifest import load_manifest_records
from pawl_jepa.torch_utils import import_torch


DEFECT_TYPES = ("spacing", "contrast", "alignment", "hierarchy")
DEFECT_TO_INDEX = {name: index for index, name in enumerate(DEFECT_TYPES)}


def load_image_tensor(path: Path, image_size: int):
    torch = import_torch()
    with Image.open(path) as image:
        image = image.convert("RGB").resize((image_size, image_size), Image.Resampling.BICUBIC)
    data = torch.tensor(list(image.tobytes()), dtype=torch.uint8)
    tensor = data.reshape(image_size, image_size, 3).permute(2, 0, 1).float().div(255.0)
    return (tensor - 0.5) / 0.5


class PawlJepaDataset:
    def __init__(self, manifest_dir: Path, *, split: str, image_size: int) -> None:
        self.records = load_manifest_records(manifest_dir, split)
        self.image_size = image_size

    def __len__(self) -> int:
        return len(self.records)

    def __getitem__(self, index: int) -> dict[str, Any]:
        record = self.records[index]
        preferred_item = record.get("preferred_item")
        if preferred_item == "original":
            preference_target = 1.0
            pairwise_mask = 1.0
        elif preferred_item == "variant":
            preference_target = -1.0
            pairwise_mask = 1.0
        else:
            preference_target = 0.0
            pairwise_mask = 0.0
        defect_type = str(record.get("defect_type"))
        return {
            "record": record,
            "original": load_image_tensor(Path(record["original_screenshot_path"]), self.image_size),
            "variant": load_image_tensor(Path(record["variant_screenshot_path"]), self.image_size),
            "defect_target": DEFECT_TO_INDEX.get(defect_type, -1),
            "preference_target": preference_target,
            "pairwise_mask": pairwise_mask,
        }


def collate_batch(items: list[dict[str, Any]]) -> dict[str, Any]:
    torch = import_torch()
    return {
        "records": [item["record"] for item in items],
        "original": torch.stack([item["original"] for item in items]),
        "variant": torch.stack([item["variant"] for item in items]),
        "defect_target": torch.tensor([item["defect_target"] for item in items], dtype=torch.long),
        "preference_target": torch.tensor(
            [item["preference_target"] for item in items], dtype=torch.float32
        ),
        "pairwise_mask": torch.tensor([item["pairwise_mask"] for item in items], dtype=torch.float32),
    }
