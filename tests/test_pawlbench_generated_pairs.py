import json
from pathlib import Path

from codepawl_harness.pawlbench_generated_pairs_cli import main as generated_pairs_main


def _read_jsonl(path: Path) -> list[dict]:
    return [
        json.loads(line)
        for line in path.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]


def test_generated_pref_scaffold_creates_expected_files(tmp_path: Path) -> None:
    source_dir = tmp_path / "examples"
    source_dir.mkdir()
    for name in ("alpha.html", "beta.html", "gamma.html"):
        (source_dir / name).write_text("<!doctype html><title>Example</title>", encoding="utf-8")
    output_dir = tmp_path / "generated_pref_v0"

    result = generated_pairs_main(
        [str(source_dir), "--out", str(output_dir), "--seed", "42", "--limit", "2"]
    )

    assert result == 0
    assert (output_dir / "candidates").is_dir()
    assert (output_dir / "review" / "queue.jsonl").is_file()
    assert (output_dir / "summary.json").is_file()
    assert (output_dir / "README.md").is_file()
    records = _read_jsonl(output_dir / "review" / "queue.jsonl")
    summary = json.loads((output_dir / "summary.json").read_text(encoding="utf-8"))
    assert len(records) == 2
    assert summary["total_records"] == 2
    assert summary["source"] == "manual_or_future_generator"
    assert {record["source_type"] for record in records} == {"manual_or_future_generator"}
    assert {record["pair_kind"] for record in records} == {"generated_candidate_placeholder"}
    assert all(record["placeholder"] is True for record in records)
