import json
from pathlib import Path

from codepawl_harness.jitter_cli import main as jitter_main
from codepawl_harness.pawlbench_embed_cli import main as embed_main


ROOT = Path(__file__).resolve().parents[1]
EXAMPLE = ROOT / "examples" / "simple_landing.html"
BASELINES = [
    "thumbnail_rgb_16x16",
    "color_histogram_rgb",
    "grayscale_edge_density",
    "dom_layout_stats",
]
VARIANTS = {
    "spacing_bad",
    "contrast_bad",
    "alignment_bad",
    "hierarchy_bad",
}


def _generate_pairs(tmp_path: Path) -> Path:
    pair_dir = tmp_path / "jitter_pairs"
    result = jitter_main([str(EXAMPLE), "--out", str(pair_dir), "--seed", "42"])

    assert result == 0
    return pair_dir


def test_embed_command_creates_output_files(tmp_path: Path) -> None:
    pair_dir = _generate_pairs(tmp_path)
    output_dir = tmp_path / "embeddings"

    result = embed_main([str(pair_dir), "--out", str(output_dir)])

    assert result == 0
    assert (output_dir / "embeddings.json").is_file()
    assert (output_dir / "similarities.json").is_file()
    assert (output_dir / "summary.json").is_file()


def test_embeddings_are_deterministic(tmp_path: Path) -> None:
    pair_dir = _generate_pairs(tmp_path)
    output_dir = tmp_path / "embeddings"

    first_result = embed_main([str(pair_dir), "--out", str(output_dir)])
    first_embeddings = (output_dir / "embeddings.json").read_text(encoding="utf-8")
    first_similarities = (output_dir / "similarities.json").read_text(encoding="utf-8")
    first_summary = (output_dir / "summary.json").read_text(encoding="utf-8")

    second_result = embed_main([str(pair_dir), "--out", str(output_dir)])
    second_embeddings = (output_dir / "embeddings.json").read_text(encoding="utf-8")
    second_similarities = (output_dir / "similarities.json").read_text(encoding="utf-8")
    second_summary = (output_dir / "summary.json").read_text(encoding="utf-8")

    assert first_result == 0
    assert second_result == 0
    assert second_embeddings == first_embeddings
    assert second_similarities == first_similarities
    assert second_summary == first_summary


def test_similarities_contain_all_variants_and_baselines(tmp_path: Path) -> None:
    pair_dir = _generate_pairs(tmp_path)
    output_dir = tmp_path / "embeddings"

    result = embed_main([str(pair_dir), "--out", str(output_dir)])

    assert result == 0
    similarities = json.loads((output_dir / "similarities.json").read_text(encoding="utf-8"))
    summary = json.loads((output_dir / "summary.json").read_text(encoding="utf-8"))

    assert summary["valid"] is True
    assert summary["errors"] == []
    assert summary["variant_count"] == 4
    assert summary["baseline_names"] == BASELINES
    assert set(summary["average_similarity_by_baseline"]) == set(BASELINES)
    assert set(summary["lowest_similarity_variant_by_baseline"]) == set(BASELINES)
    assert {record["variant_name"] for record in similarities} == VARIANTS

    for record in similarities:
        assert set(record["similarities"]) == set(BASELINES)
        for score in record["similarities"].values():
            assert isinstance(score, int | float)
            assert 0 <= score <= 1


def test_embeddings_have_sane_vector_shapes(tmp_path: Path) -> None:
    pair_dir = _generate_pairs(tmp_path)
    output_dir = tmp_path / "embeddings"

    result = embed_main([str(pair_dir), "--out", str(output_dir)])

    assert result == 0
    embeddings = json.loads((output_dir / "embeddings.json").read_text(encoding="utf-8"))
    original = embeddings["original"]["embeddings"]

    assert len(original["thumbnail_rgb_16x16"]) == 16 * 16 * 3
    assert len(original["color_histogram_rgb"]) == 24
    assert len(original["grayscale_edge_density"]) == 8
    assert len(original["dom_layout_stats"]) == 7
    for vector in original.values():
        assert all(isinstance(value, int | float) for value in vector)


def test_missing_labels_json_fails(tmp_path: Path) -> None:
    pair_dir = _generate_pairs(tmp_path)
    (pair_dir / "labels.json").unlink()

    result = embed_main([str(pair_dir), "--out", str(tmp_path / "embeddings")])

    assert result == 2
    assert not (tmp_path / "embeddings" / "summary.json").exists()


def test_missing_screenshot_reference_fails(tmp_path: Path) -> None:
    pair_dir = _generate_pairs(tmp_path)
    labels_path = pair_dir / "labels.json"
    labels = json.loads(labels_path.read_text(encoding="utf-8"))
    Path(labels["variants"][0]["screenshot_path"]).unlink()

    result = embed_main([str(pair_dir), "--out", str(tmp_path / "embeddings")])

    assert result == 2
    assert not (tmp_path / "embeddings" / "similarities.json").exists()
