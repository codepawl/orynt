"""Image-pair dataset helpers for Pawl-JEPA microtraining."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

from PIL import Image

from pawl_jepa.manifest import load_manifest_records
from pawl_jepa.torch_utils import import_torch


DEFECT_TYPES = ("spacing", "contrast", "alignment", "hierarchy")
DEFECT_TO_INDEX = {name: index for index, name in enumerate(DEFECT_TYPES)}


@dataclass(frozen=True)
class PaddedNormalization:
    original_width: int
    original_height: int
    canvas_width: int
    canvas_height: int
    resized_width: int
    resized_height: int
    scale: float
    pad_left: int
    pad_top: int

    def as_dict(self) -> dict[str, Any]:
        return {
            "schema_version": "ui_jepa_padded_normalization_v1",
            "original_width": self.original_width,
            "original_height": self.original_height,
            "canvas_width": self.canvas_width,
            "canvas_height": self.canvas_height,
            "resized_width": self.resized_width,
            "resized_height": self.resized_height,
            "scale": self.scale,
            "pad_left": self.pad_left,
            "pad_top": self.pad_top,
        }


def normalize_image_padded(
    image: Image.Image,
    *,
    canvas_size: int,
    pad_color: tuple[int, int, int] = (255, 255, 255),
) -> tuple[Image.Image, PaddedNormalization]:
    if canvas_size <= 0:
        raise ValueError("canvas_size must be greater than 0")
    original_width, original_height = image.size
    if original_width <= 0 or original_height <= 0:
        raise ValueError("image dimensions must be positive")
    scale = min(canvas_size / original_width, canvas_size / original_height)
    resized_width = max(1, round(original_width * scale))
    resized_height = max(1, round(original_height * scale))
    pad_left = (canvas_size - resized_width) // 2
    pad_top = (canvas_size - resized_height) // 2
    resized = image.convert("RGB").resize((resized_width, resized_height), Image.Resampling.BICUBIC)
    canvas = Image.new("RGB", (canvas_size, canvas_size), pad_color)
    canvas.paste(resized, (pad_left, pad_top))
    return canvas, PaddedNormalization(
        original_width=original_width,
        original_height=original_height,
        canvas_width=canvas_size,
        canvas_height=canvas_size,
        resized_width=resized_width,
        resized_height=resized_height,
        scale=scale,
        pad_left=pad_left,
        pad_top=pad_top,
    )


def transform_bbox_xyxy(
    bbox_xyxy: list[float] | tuple[float, float, float, float],
    normalization: PaddedNormalization | dict[str, Any],
) -> list[float]:
    if len(bbox_xyxy) != 4:
        raise ValueError("bbox_xyxy must contain four coordinates")
    if isinstance(normalization, PaddedNormalization):
        scale = normalization.scale
        pad_left = normalization.pad_left
        pad_top = normalization.pad_top
    else:
        scale = float(normalization["scale"])
        pad_left = int(normalization["pad_left"])
        pad_top = int(normalization["pad_top"])
    x1, y1, x2, y2 = [float(value) for value in bbox_xyxy]
    return [
        round(x1 * scale + pad_left, 4),
        round(y1 * scale + pad_top, 4),
        round(x2 * scale + pad_left, 4),
        round(y2 * scale + pad_top, 4),
    ]


def load_image_tensor(path: Path, image_size: int, *, preserve_aspect: bool = False):
    torch = import_torch()
    with Image.open(path) as image:
        if preserve_aspect:
            image, _ = normalize_image_padded(image, canvas_size=image_size)
        else:
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
        pair_kind = str(record.get("pair_kind", "original_vs_variant"))
        preferred_item = record.get("preferred_item")
        if pair_kind == "variant_vs_variant":
            target_path = record["training_target_screenshot_path"]
            source_path = record["training_source_screenshot_path"]
            comparable = preferred_item in {"left", "right"}
            preference_target = 1.0 if comparable else 0.0
            pairwise_mask = 1.0 if comparable else 0.0
            defect_type = str(record.get("defect_type")) if comparable else ""
        else:
            target_path = record.get("training_target_screenshot_path") or record["original_screenshot_path"]
            source_path = record.get("training_source_screenshot_path") or record["variant_screenshot_path"]
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
        if record.get("preferred") in {"tie", "unclear"}:
            defect_type = ""
        return {
            "record": record,
            "original": load_image_tensor(Path(target_path), self.image_size),
            "variant": load_image_tensor(Path(source_path), self.image_size),
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
