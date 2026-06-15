import io
import json
from pathlib import Path

from codepawl_harness.pawlbench_label_autofill_cli import main as autofill_main
from codepawl_harness.progress import ProgressReporter


class _TTYBuffer(io.StringIO):
    def isatty(self) -> bool:
        return True


def test_progress_disabled_for_non_tty() -> None:
    stream = io.StringIO()
    progress = ProgressReporter(stream=stream)

    progress.update("working")
    progress.done("done")

    assert stream.getvalue() == ""


def test_no_progress_suppresses_tty_progress() -> None:
    stream = _TTYBuffer()
    progress = ProgressReporter(stream=stream, no_progress=True)

    progress.update("working")
    progress.done("done")

    assert stream.getvalue() == ""


def test_quiet_suppresses_progress_and_logs(capsys) -> None:
    stream = _TTYBuffer()
    progress = ProgressReporter(stream=stream, quiet=True)

    progress.update("working")
    progress.log("Wrote something")

    captured = capsys.readouterr()
    assert stream.getvalue() == ""
    assert captured.out == ""


def test_progress_writes_for_tty() -> None:
    stream = _TTYBuffer()
    progress = ProgressReporter(stream=stream)

    progress.update("working")
    progress.done("done")

    output = stream.getvalue()
    assert "working" in output
    assert "done" in output
    assert "elapsed" in output


def test_autofill_quiet_and_no_progress_still_write_artifacts(tmp_path: Path, capsys) -> None:
    queue_path = tmp_path / "queue.jsonl"
    suggestions_path = tmp_path / "suggested_labels.jsonl"
    labels_path = tmp_path / "labels.auto.jsonl"
    queue_record = {
        "label_id": "local_test__train__sample_a__spacing_bad",
        "dataset_id": "local_test",
        "split": "train",
        "sample_id": "sample_a",
        "variant_name": "spacing_bad",
        "defect_type": "spacing",
        "left_item": "original",
        "right_item": "variant",
    }
    suggestion = {
        **queue_record,
        "preferred": "left",
        "defect_tags": ["spacing"],
        "quality_tags": ["practical"],
        "severity": "high",
        "fix_instruction": "Fix spacing.",
        "reason": "Left is clearer.",
        "confidence": 5,
        "suggested_by": "codepawl_taste_v0",
    }
    queue_path.write_text(json.dumps(queue_record) + "\n", encoding="utf-8")
    suggestions_path.write_text(json.dumps(suggestion) + "\n", encoding="utf-8")

    result = autofill_main(
        [
            str(queue_path),
            "--suggestions",
            str(suggestions_path),
            "--out",
            str(labels_path),
            "--labeler-id",
            "codepawl_taste_v0_auto",
            "--quiet",
        ]
    )

    captured = capsys.readouterr()
    assert result == 0
    assert captured.out == ""
    assert labels_path.is_file()
    label = json.loads(labels_path.read_text(encoding="utf-8").strip())
    assert label["review_status"] == "auto_labeled"

    second_path = tmp_path / "labels.auto.no_progress.jsonl"
    result = autofill_main(
        [
            str(queue_path),
            "--suggestions",
            str(suggestions_path),
            "--out",
            str(second_path),
            "--labeler-id",
            "codepawl_taste_v0_auto",
            "--no-progress",
        ]
    )

    captured = capsys.readouterr()
    assert result == 0
    assert "Wrote PawlBench Design auto labels" in captured.out
    assert second_path.is_file()
