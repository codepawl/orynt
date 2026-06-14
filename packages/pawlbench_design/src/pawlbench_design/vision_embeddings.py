"""Optional frozen vision encoder baselines for PawlBench datasets."""

from __future__ import annotations

import json
import math
import time
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol

from PIL import Image


VISION_DEPENDENCIES = ("torch", "torchvision", "transformers")
INSTALL_INSTRUCTIONS = (
    "Install vision dependencies with: uv sync --extra vision "
    "(requires torch, torchvision, transformers)"
)
MODEL_ALIASES = {
    "dinov2": "facebook/dinov2-small",
    "siglip": "google/siglip-base-patch16-224",
}


@dataclass(frozen=True)
class VisionEmbeddingConfig:
    input_dir: Path
    output_dir: Path
    models: tuple[str, ...] = ("dinov2", "siglip")
    batch_size: int = 8
    device: str = "auto"


@dataclass(frozen=True)
class VisionEmbeddingResult:
    output_dir: Path
    embeddings_path: Path
    similarities_path: Path
    retrieval_path: Path
    summary_path: Path
    summary: dict[str, Any]


@dataclass(frozen=True)
class ImageRecord:
    artifact_id: str
    artifact_kind: str
    sample_id: str
    screenshot_path: Path
    variant_name: str | None = None
    defect_type: str | None = None


class VisionEncoder(Protocol):
    model_name: str

    def encode(self, image_paths: list[Path], *, batch_size: int) -> list[list[float]]:
        """Return one vector per image path."""


def build_vision_baselines(
    config: VisionEmbeddingConfig,
    *,
    encoder_factory: Any | None = None,
) -> VisionEmbeddingResult:
    start = time.perf_counter()
    input_dir = config.input_dir.expanduser().resolve()
    output_dir = config.output_dir.expanduser().resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    if config.batch_size <= 0:
        raise ValueError("batch_size must be greater than 0")

    dataset = _load_dataset(input_dir)
    records = collect_image_records(input_dir, dataset)
    originals = [record for record in records if record.artifact_kind == "original"]
    variants = [record for record in records if record.artifact_kind == "variant"]
    requested_models = normalize_model_names(config.models)
    resolved_device = resolve_device(config.device) if encoder_factory is None else config.device
    factory = encoder_factory or HuggingFaceVisionEncoder
    warnings: list[str] = []
    errors: list[str] = []

    embeddings_by_model: dict[str, dict[str, list[float]]] = {}
    embedding_rows: list[dict[str, Any]] = []
    for model_name in requested_models:
        encoder = factory(model_name=model_name, device=resolved_device)
        image_paths = [record.screenshot_path for record in records]
        vectors = encoder.encode(image_paths, batch_size=config.batch_size)
        if len(vectors) != len(records):
            raise ValueError(
                f"{model_name} returned {len(vectors)} embeddings for {len(records)} images"
            )
        model_embeddings: dict[str, list[float]] = {}
        for record, vector in zip(records, vectors, strict=True):
            normalized = normalize_vector(vector)
            model_embeddings[record.artifact_id] = normalized
            embedding_rows.append(_embedding_row(model_name, record, normalized))
        embeddings_by_model[model_name] = model_embeddings

    similarities = build_similarity_records(
        models=requested_models,
        originals=originals,
        variants=variants,
        embeddings_by_model=embeddings_by_model,
    )
    retrieval = build_retrieval_records(
        models=requested_models,
        originals=originals,
        variants=variants,
        embeddings_by_model=embeddings_by_model,
    )
    summary = build_summary(
        dataset=dataset,
        models=requested_models,
        device=resolved_device,
        similarities=similarities,
        retrieval=retrieval,
        runtime_seconds=time.perf_counter() - start,
        warnings=warnings,
        errors=errors,
    )

    embeddings_path = output_dir / "embeddings.jsonl"
    similarities_path = output_dir / "similarities.json"
    retrieval_path = output_dir / "retrieval.json"
    summary_path = output_dir / "summary.json"
    _write_jsonl(embeddings_path, embedding_rows)
    _write_json(similarities_path, similarities)
    _write_json(retrieval_path, retrieval)
    _write_json(summary_path, summary)
    return VisionEmbeddingResult(
        output_dir=output_dir,
        embeddings_path=embeddings_path,
        similarities_path=similarities_path,
        retrieval_path=retrieval_path,
        summary_path=summary_path,
        summary=summary,
    )


def collect_image_records(input_dir: Path, dataset: dict[str, Any]) -> list[ImageRecord]:
    records: list[ImageRecord] = []
    for sample in dataset.get("samples", []):
        if sample.get("status") != "ok":
            continue
        sample_id = sample["sample_id"]
        sample_dir = _sample_dir(input_dir, sample)
        original_path = _required_file(sample_dir / "original" / "screenshot.png")
        records.append(
            ImageRecord(
                artifact_id=f"{sample_id}:original",
                artifact_kind="original",
                sample_id=sample_id,
                screenshot_path=original_path,
            )
        )
        for variant in sample.get("variants", []):
            variant_name = variant["variant_name"]
            screenshot_path = _resolve_path(input_dir, variant["screenshot_path"])
            _required_file(screenshot_path)
            records.append(
                ImageRecord(
                    artifact_id=f"{sample_id}:variant:{variant_name}",
                    artifact_kind="variant",
                    sample_id=sample_id,
                    variant_name=variant_name,
                    defect_type=variant["defect_type"],
                    screenshot_path=screenshot_path,
                )
            )
    return records


def normalize_model_names(raw_models: tuple[str, ...]) -> tuple[str, ...]:
    models: list[str] = []
    for item in raw_models:
        for raw_model in item.split(","):
            model = raw_model.strip()
            if not model:
                continue
            if model not in MODEL_ALIASES:
                supported = ", ".join(sorted(MODEL_ALIASES))
                raise ValueError(f"unsupported model '{model}'. Supported models: {supported}")
            if model not in models:
                models.append(model)
    if not models:
        raise ValueError("at least one model must be requested")
    return tuple(models)


def normalize_vector(vector: list[float]) -> list[float]:
    values = [float(value) for value in vector]
    norm = math.sqrt(sum(value * value for value in values))
    if norm == 0:
        return [0.0 for _ in values]
    return [value / norm for value in values]


def cosine_similarity(left: list[float], right: list[float]) -> float:
    left_normalized = normalize_vector(left)
    right_normalized = normalize_vector(right)
    return sum(a * b for a, b in zip(left_normalized, right_normalized, strict=True))


def build_similarity_records(
    *,
    models: tuple[str, ...],
    originals: list[ImageRecord],
    variants: list[ImageRecord],
    embeddings_by_model: dict[str, dict[str, list[float]]],
) -> list[dict[str, Any]]:
    original_by_sample = {record.sample_id: record for record in originals}
    records: list[dict[str, Any]] = []
    for model_name in models:
        model_embeddings = embeddings_by_model[model_name]
        for variant in variants:
            original = original_by_sample[variant.sample_id]
            records.append(
                {
                    "model": model_name,
                    "sample_id": variant.sample_id,
                    "variant_name": variant.variant_name,
                    "defect_type": variant.defect_type,
                    "original_artifact_id": original.artifact_id,
                    "variant_artifact_id": variant.artifact_id,
                    "cosine_similarity": cosine_similarity(
                        model_embeddings[original.artifact_id],
                        model_embeddings[variant.artifact_id],
                    ),
                }
            )
    return records


def build_retrieval_records(
    *,
    models: tuple[str, ...],
    originals: list[ImageRecord],
    variants: list[ImageRecord],
    embeddings_by_model: dict[str, dict[str, list[float]]],
) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for model_name in models:
        model_embeddings = embeddings_by_model[model_name]
        for variant in variants:
            scores = [
                {
                    "sample_id": original.sample_id,
                    "artifact_id": original.artifact_id,
                    "score": cosine_similarity(
                        model_embeddings[variant.artifact_id],
                        model_embeddings[original.artifact_id],
                    ),
                }
                for original in originals
            ]
            ranked = sorted(scores, key=lambda item: (-item["score"], item["sample_id"]))
            ranked_sample_ids = [item["sample_id"] for item in ranked]
            own_rank = ranked_sample_ids.index(variant.sample_id) + 1
            records.append(
                {
                    "model": model_name,
                    "sample_id": variant.sample_id,
                    "variant_name": variant.variant_name,
                    "defect_type": variant.defect_type,
                    "ranked_sample_ids": ranked_sample_ids,
                    "own_original_rank": own_rank,
                    "top1_success": own_rank == 1,
                    "top5_success": own_rank <= 5,
                }
            )
    return records


def build_summary(
    *,
    dataset: dict[str, Any],
    models: tuple[str, ...],
    device: str,
    similarities: list[dict[str, Any]],
    retrieval: list[dict[str, Any]],
    runtime_seconds: float,
    warnings: list[str],
    errors: list[str],
) -> dict[str, Any]:
    return {
        "dataset_id": dataset["dataset_id"],
        "sample_count": dataset["sample_count"],
        "variant_count": dataset["variant_count"],
        "models": list(models),
        "device": device,
        "average_similarity_by_model": _average_by(similarities, ["model"], "cosine_similarity"),
        "average_similarity_by_model_and_defect_type": _average_by(
            similarities,
            ["model", "defect_type"],
            "cosine_similarity",
        ),
        "top1_retrieval_accuracy_by_model": _accuracy_by_model(retrieval, "top1_success"),
        "top5_retrieval_accuracy_by_model": _accuracy_by_model(retrieval, "top5_success"),
        "runtime_seconds": runtime_seconds,
        "warnings": warnings,
        "errors": errors,
    }


def resolve_device(device: str) -> str:
    if device != "auto":
        return device
    torch = _import_optional("torch")
    return "cuda" if torch.cuda.is_available() else "cpu"


class HuggingFaceVisionEncoder:
    def __init__(self, *, model_name: str, device: str) -> None:
        _ensure_vision_dependencies()
        torch = _import_optional("torch")
        transformers = _import_optional("transformers")
        self._torch = torch
        self.model_name = model_name
        self.device = device
        model_id = MODEL_ALIASES[model_name]
        self.processor = transformers.AutoImageProcessor.from_pretrained(model_id)
        self.model = transformers.AutoModel.from_pretrained(model_id).to(device)
        self.model.eval()

    def encode(self, image_paths: list[Path], *, batch_size: int) -> list[list[float]]:
        embeddings: list[list[float]] = []
        for index in range(0, len(image_paths), batch_size):
            batch_paths = image_paths[index : index + batch_size]
            images = []
            for path in batch_paths:
                with Image.open(path) as image:
                    images.append(image.convert("RGB"))
            inputs = self.processor(images=images, return_tensors="pt")
            inputs = {
                key: value.to(self.device) if hasattr(value, "to") else value
                for key, value in inputs.items()
            }
            with self._torch.no_grad():
                if self.model_name == "siglip" and hasattr(self.model, "get_image_features"):
                    output = self.model.get_image_features(**inputs)
                else:
                    output = self.model(**inputs)
                tensor = extract_image_embedding_tensor(output)
            embeddings.extend(tensor.detach().cpu().float().tolist())
        return embeddings


def extract_image_embedding_tensor(output: Any) -> Any:
    """Extract an image embedding tensor from common Hugging Face output shapes."""

    image_embeds = _tensor_attr(output, "image_embeds")
    if image_embeds is not None:
        return image_embeds

    pooler_output = _tensor_attr(output, "pooler_output")
    if pooler_output is not None:
        return pooler_output

    last_hidden_state = _tensor_attr(output, "last_hidden_state")
    if last_hidden_state is not None:
        if len(last_hidden_state.shape) == 3:
            try:
                return last_hidden_state[:, 0, :]
            except Exception:
                return last_hidden_state.mean(dim=1)
        return last_hidden_state

    if isinstance(output, tuple | list):
        for item in output:
            if _is_tensor_like(item):
                return item

    raise ValueError(
        "could not extract image embedding tensor from "
        f"{type(output).__name__}; available attributes: {_available_output_fields(output)}"
    )


def _tensor_attr(output: Any, name: str) -> Any | None:
    if not hasattr(output, name):
        return None
    value = getattr(output, name)
    return value if _is_tensor_like(value) else None


def _is_tensor_like(value: Any) -> bool:
    return (
        value is not None
        and hasattr(value, "detach")
        and hasattr(value, "shape")
    )


def _available_output_fields(output: Any) -> list[str]:
    fields: list[str] = []
    for name in ("image_embeds", "pooler_output", "last_hidden_state"):
        if hasattr(output, name):
            fields.append(name)
    if hasattr(output, "keys"):
        try:
            fields.extend(str(key) for key in output.keys())
        except Exception:
            pass
    return sorted(set(fields))


def _embedding_row(model_name: str, record: ImageRecord, embedding: list[float]) -> dict[str, Any]:
    row = {
        "model": model_name,
        "artifact_id": record.artifact_id,
        "artifact_kind": record.artifact_kind,
        "sample_id": record.sample_id,
        "screenshot_path": str(record.screenshot_path),
        "embedding": embedding,
    }
    if record.variant_name is not None:
        row["variant_name"] = record.variant_name
    if record.defect_type is not None:
        row["defect_type"] = record.defect_type
    return row


def _average_by(records: list[dict[str, Any]], keys: list[str], value_key: str) -> dict[str, Any]:
    grouped: dict[tuple[str, ...], list[float]] = defaultdict(list)
    for record in records:
        grouped[tuple(str(record[key]) for key in keys)].append(float(record[value_key]))
    result: dict[str, Any] = {}
    for key_tuple, values in sorted(grouped.items()):
        average = sum(values) / len(values)
        if len(keys) == 1:
            result[key_tuple[0]] = average
        else:
            parent, child = key_tuple
            result.setdefault(parent, {})[child] = average
    return result


def _accuracy_by_model(records: list[dict[str, Any]], field: str) -> dict[str, float]:
    grouped: dict[str, list[bool]] = defaultdict(list)
    for record in records:
        grouped[record["model"]].append(bool(record[field]))
    return {
        model_name: sum(1 for value in values if value) / len(values)
        for model_name, values in sorted(grouped.items())
        if values
    }


def _load_dataset(input_dir: Path) -> dict[str, Any]:
    dataset_path = input_dir / "dataset.json"
    if not dataset_path.is_file():
        raise ValueError(f"dataset.json is missing: {dataset_path}")
    return json.loads(dataset_path.read_text(encoding="utf-8"))


def _sample_dir(input_dir: Path, sample: dict[str, Any]) -> Path:
    output_dir = sample.get("output_dir")
    if isinstance(output_dir, str) and output_dir:
        return _resolve_path(input_dir, output_dir)
    return input_dir / "samples" / str(sample.get("sample_id", ""))


def _resolve_path(input_dir: Path, raw_path: str) -> Path:
    path = Path(raw_path).expanduser()
    return path.resolve() if path.is_absolute() else (input_dir / path).resolve()


def _required_file(path: Path) -> Path:
    if not path.is_file():
        raise ValueError(f"required file is missing: {path}")
    return path


def _import_optional(module_name: str) -> Any:
    try:
        return __import__(module_name)
    except ImportError as exc:
        raise RuntimeError(INSTALL_INSTRUCTIONS) from exc


def _ensure_vision_dependencies() -> None:
    for module_name in VISION_DEPENDENCIES:
        _import_optional(module_name)


def _write_json(path: Path, payload: Any) -> None:
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def _write_jsonl(path: Path, records: list[dict[str, Any]]) -> None:
    path.write_text(
        "".join(json.dumps(record, sort_keys=True) + "\n" for record in records),
        encoding="utf-8",
    )
