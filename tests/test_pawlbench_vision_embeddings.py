import json
import builtins
from pathlib import Path

from PIL import Image

from codepawl_harness.pawlbench_vision_embed_cli import main as vision_main
from pawlbench_design import VisionEmbeddingConfig, build_vision_baselines
from pawlbench_design import vision_embeddings
from pawlbench_design.vision_embeddings import (
    INSTALL_INSTRUCTIONS,
    build_retrieval_records,
    collect_image_records,
    cosine_similarity,
    extract_image_embedding_tensor,
)


class FakeVisionEncoder:
    def __init__(self, *, model_name: str, device: str) -> None:
        self.model_name = model_name
        self.device = device

    def encode(self, image_paths: list[Path], *, batch_size: int) -> list[list[float]]:
        assert batch_size > 0
        vectors = []
        for path in image_paths:
            text = path.as_posix()
            if "/sample_a/" in text:
                vectors.append([1.0, 0.0, 0.0])
            elif "/sample_b/" in text:
                vectors.append([0.0, 1.0, 0.0])
            else:
                vectors.append([0.0, 0.0, 1.0])
        return vectors


class MissingOptionalEncoder:
    def __init__(self, *, model_name: str, device: str) -> None:
        raise RuntimeError(INSTALL_INSTRUCTIONS)


class FakeTensor:
    def __init__(self, name: str, shape: tuple[int, ...]) -> None:
        self.name = name
        self.shape = shape
        self.detached = False

    def __getitem__(self, item):
        assert item == (slice(None, None, None), 0, slice(None, None, None))
        return FakeTensor(f"{self.name}:cls", (self.shape[0], self.shape[2]))

    def mean(self, *, dim: int):
        assert dim == 1
        return FakeTensor(f"{self.name}:mean", (self.shape[0], self.shape[2]))

    def detach(self):
        self.detached = True
        return self


class FakeOutput:
    def __init__(
        self,
        *,
        image_embeds=None,
        pooler_output=None,
        last_hidden_state=None,
    ) -> None:
        self.image_embeds = image_embeds
        self.pooler_output = pooler_output
        self.last_hidden_state = last_hidden_state

    def keys(self):
        return ["image_embeds", "pooler_output", "last_hidden_state"]


class MeanOnlyTensor(FakeTensor):
    def __getitem__(self, item):
        raise TypeError("CLS indexing unavailable")


class UnsupportedOutput:
    def keys(self):
        return ["hidden_states", "attentions"]


def _write_png(path: Path, color: tuple[int, int, int]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.new("RGB", (8, 8), color).save(path)


def _tiny_dataset(tmp_path: Path) -> Path:
    dataset_dir = tmp_path / "dataset"
    samples = []
    for sample_id, color in (("sample_a", (255, 0, 0)), ("sample_b", (0, 255, 0))):
        sample_dir = dataset_dir / "samples" / sample_id
        original = sample_dir / "original" / "screenshot.png"
        variant = sample_dir / "jittered" / "contrast_bad" / "screenshot.png"
        _write_png(original, color)
        _write_png(variant, color)
        samples.append(
            {
                "sample_id": sample_id,
                "source_path": str(tmp_path / f"{sample_id}.html"),
                "output_dir": str(sample_dir),
                "labels_path": str(sample_dir / "labels.json"),
                "status": "ok",
                "variants": [
                    {
                        "variant_name": "contrast_bad",
                        "defect_type": "contrast",
                        "html_path": str(sample_dir / "jittered" / "contrast_bad" / "index.html"),
                        "screenshot_path": str(variant),
                        "dom_path": str(sample_dir / "jittered" / "contrast_bad" / "dom.json"),
                        "accessibility_path": str(
                            sample_dir / "jittered" / "contrast_bad" / "accessibility.json"
                        ),
                        "metrics_path": str(
                            sample_dir / "jittered" / "contrast_bad" / "metrics.json"
                        ),
                    }
                ],
            }
        )
    dataset = {
        "dataset_id": "tiny",
        "source_dir": str(tmp_path),
        "output_dir": str(dataset_dir),
        "seed": 42,
        "generated_at": "1970-01-01T00:00:42Z",
        "sample_count": 2,
        "variant_count": 2,
        "failed_count": 0,
        "samples": samples,
        "aggregate_metrics": {},
    }
    dataset_dir.mkdir(parents=True, exist_ok=True)
    (dataset_dir / "dataset.json").write_text(
        json.dumps(dataset, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    return dataset_dir


def test_missing_optional_dependency_message() -> None:
    try:
        vision_embeddings._import_optional("__missing_optional_for_test__")
    except RuntimeError as exc:
        assert INSTALL_INSTRUCTIONS in str(exc)
    else:
        raise AssertionError("expected missing optional dependency error")


def test_missing_torchvision_dependency_message(monkeypatch) -> None:
    real_import = builtins.__import__

    def fake_import(name, *args, **kwargs):
        if name == "torchvision":
            raise ImportError("No module named torchvision")
        return real_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", fake_import)

    try:
        vision_embeddings._ensure_vision_dependencies()
    except RuntimeError as exc:
        message = str(exc)
        assert "torch" in message
        assert "torchvision" in message
        assert "transformers" in message
        assert "uv sync --extra vision" in message
    else:
        raise AssertionError("expected missing torchvision dependency error")


def test_collect_image_records_from_dataset(tmp_path: Path) -> None:
    dataset_dir = _tiny_dataset(tmp_path)
    dataset = json.loads((dataset_dir / "dataset.json").read_text(encoding="utf-8"))

    records = collect_image_records(dataset_dir, dataset)

    assert len(records) == 4
    assert [record.artifact_kind for record in records] == [
        "original",
        "variant",
        "original",
        "variant",
    ]
    assert {record.sample_id for record in records} == {"sample_a", "sample_b"}


def test_cosine_similarity() -> None:
    assert cosine_similarity([1, 0], [1, 0]) == 1.0
    assert cosine_similarity([1, 0], [0, 1]) == 0.0
    assert cosine_similarity([1, 0], [-1, 0]) == -1.0


def test_extract_image_embedding_tensor_prefers_image_embeds() -> None:
    image_embeds = FakeTensor("image", (2, 4))
    pooler = FakeTensor("pooler", (2, 4))

    tensor = extract_image_embedding_tensor(
        FakeOutput(image_embeds=image_embeds, pooler_output=pooler)
    )

    assert tensor is image_embeds


def test_extract_image_embedding_tensor_uses_pooler_output() -> None:
    pooler = FakeTensor("pooler", (2, 4))

    tensor = extract_image_embedding_tensor(FakeOutput(pooler_output=pooler))

    assert tensor is pooler


def test_extract_image_embedding_tensor_uses_cls_from_last_hidden_state() -> None:
    hidden = FakeTensor("hidden", (2, 5, 4))

    tensor = extract_image_embedding_tensor(FakeOutput(last_hidden_state=hidden))

    assert tensor.name == "hidden:cls"
    assert tensor.shape == (2, 4)


def test_extract_image_embedding_tensor_mean_fallback_for_last_hidden_state() -> None:
    hidden = MeanOnlyTensor("hidden", (2, 5, 4))

    tensor = extract_image_embedding_tensor(FakeOutput(last_hidden_state=hidden))

    assert tensor.name == "hidden:mean"
    assert tensor.shape == (2, 4)


def test_extract_image_embedding_tensor_uses_first_tensor_in_tuple() -> None:
    tensor = FakeTensor("tuple", (2, 4))

    extracted = extract_image_embedding_tensor(("metadata", tensor))

    assert extracted is tensor


def test_extract_image_embedding_tensor_error_includes_output_details() -> None:
    try:
        extract_image_embedding_tensor(UnsupportedOutput())
    except ValueError as exc:
        message = str(exc)
        assert "UnsupportedOutput" in message
        assert "hidden_states" in message
        assert "attentions" in message
    else:
        raise AssertionError("expected unsupported output error")


def test_retrieval_metric_calculation(tmp_path: Path) -> None:
    dataset_dir = _tiny_dataset(tmp_path)
    dataset = json.loads((dataset_dir / "dataset.json").read_text(encoding="utf-8"))
    records = collect_image_records(dataset_dir, dataset)
    originals = [record for record in records if record.artifact_kind == "original"]
    variants = [record for record in records if record.artifact_kind == "variant"]
    embeddings = {
        "dinov2": {
            "sample_a:original": [1.0, 0.0],
            "sample_a:variant:contrast_bad": [1.0, 0.0],
            "sample_b:original": [0.0, 1.0],
            "sample_b:variant:contrast_bad": [0.0, 1.0],
        }
    }

    retrieval = build_retrieval_records(
        models=("dinov2",),
        originals=originals,
        variants=variants,
        embeddings_by_model=embeddings,
    )

    assert len(retrieval) == 2
    assert all(record["top1_success"] is True for record in retrieval)
    assert all(record["top5_success"] is True for record in retrieval)
    assert all(record["own_original_rank"] == 1 for record in retrieval)


def test_vision_baseline_outputs_with_fake_embeddings(tmp_path: Path) -> None:
    dataset_dir = _tiny_dataset(tmp_path)
    output_dir = tmp_path / "vision"

    result = build_vision_baselines(
        VisionEmbeddingConfig(
            input_dir=dataset_dir,
            output_dir=output_dir,
            models=("dinov2", "siglip"),
            batch_size=2,
            device="cpu",
        ),
        encoder_factory=FakeVisionEncoder,
    )

    assert result.embeddings_path.is_file()
    assert result.similarities_path.is_file()
    assert result.retrieval_path.is_file()
    assert result.summary_path.is_file()
    embeddings = [
        json.loads(line)
        for line in result.embeddings_path.read_text(encoding="utf-8").splitlines()
    ]
    similarities = json.loads(result.similarities_path.read_text(encoding="utf-8"))
    retrieval = json.loads(result.retrieval_path.read_text(encoding="utf-8"))
    summary = json.loads(result.summary_path.read_text(encoding="utf-8"))

    assert len(embeddings) == 8
    assert len(similarities) == 4
    assert len(retrieval) == 4
    assert summary["dataset_id"] == "tiny"
    assert summary["sample_count"] == 2
    assert summary["variant_count"] == 2
    assert summary["models"] == ["dinov2", "siglip"]
    assert summary["device"] == "cpu"
    assert summary["errors"] == []
    assert set(summary["average_similarity_by_model"]) == {"dinov2", "siglip"}
    assert summary["top1_retrieval_accuracy_by_model"] == {"dinov2": 1.0, "siglip": 1.0}
    assert summary["top5_retrieval_accuracy_by_model"] == {"dinov2": 1.0, "siglip": 1.0}


def test_cli_reports_missing_optional_dependencies(tmp_path: Path, monkeypatch, capsys) -> None:
    dataset_dir = _tiny_dataset(tmp_path)
    monkeypatch.setattr(vision_embeddings, "HuggingFaceVisionEncoder", MissingOptionalEncoder)

    result = vision_main(
        [
            str(dataset_dir),
            "--out",
            str(tmp_path / "vision"),
            "--models",
            "dinov2",
            "--device",
            "cpu",
        ]
    )

    captured = capsys.readouterr()
    assert result == 2
    assert INSTALL_INSTRUCTIONS in captured.err
