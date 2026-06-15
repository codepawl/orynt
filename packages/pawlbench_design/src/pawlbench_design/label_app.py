"""Local web app for PawlBench Design human labeling."""

from __future__ import annotations

import json
import mimetypes
import os
import tempfile
from collections import Counter
from dataclasses import dataclass
from datetime import datetime, timezone
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from pawlbench_design.labels import (
    DEFECT_TAGS,
    PREFERRED_VALUES,
    QUALITY_TAGS,
    REVIEW_STATUS_VALUES,
    SEVERITY_VALUES,
    _read_jsonl,
    queue_item_values,
)


@dataclass(frozen=True)
class LabelAppConfig:
    queue_dir: Path
    host: str = "127.0.0.1"
    port: int = 8765
    labeler_id: str | None = None


@dataclass(frozen=True)
class LabelAppResult:
    queue_dir: Path
    host: str
    port: int


class LabelAppStore:
    """Disk-backed queue, label, and state store for the local labeling app."""

    def __init__(self, queue_dir: Path, labeler_id: str | None = None):
        self.queue_dir = queue_dir.expanduser().resolve()
        self.default_labeler_id = labeler_id or os.environ.get("USER") or "an"
        self.queue_path = self.queue_dir / "queue.jsonl"
        self.labels_path = self.queue_dir / "labels.jsonl"
        self.suggested_labels_path = self.queue_dir / "suggested_labels.jsonl"
        self.state_path = self.queue_dir / "labeling_state.json"
        self.queue = _read_jsonl(self.queue_path)
        self.queue_by_id = {str(record["label_id"]): record for record in self.queue}
        if len(self.queue_by_id) != len(self.queue):
            raise ValueError("queue.jsonl contains duplicate label_id records")
        self.suggestions = self._load_suggestions()
        self.labels = self._load_labels()

    def queue_summary(self) -> dict[str, Any]:
        return {
            "queue_dir": str(self.queue_dir),
            "total": len(self.queue),
            "label_ids": [record["label_id"] for record in self.queue],
            "defect_tags": list(DEFECT_TAGS),
            "quality_tags": list(QUALITY_TAGS),
            "preferred_values": list(PREFERRED_VALUES),
            "severity_values": list(SEVERITY_VALUES),
            "review_status_values": list(REVIEW_STATUS_VALUES),
            "default_labeler_id": self.default_labeler_id,
            "has_suggestions": bool(self.suggestions),
        }

    def item(self, index: int) -> dict[str, Any]:
        if index < 0 or index >= len(self.queue):
            raise IndexError(f"queue index out of range: {index}")
        record = self.queue[index]
        label = self.labels.get(record["label_id"])
        suggestion = self.suggestions.get(record["label_id"])
        return {
            "index": index,
            "total": len(self.queue),
            "record": record,
            "label": label,
            "suggestion": suggestion,
            "left_image_url": f"/image/{record['label_id']}/left",
            "right_image_url": f"/image/{record['label_id']}/right",
        }

    def progress(self) -> dict[str, Any]:
        completed_ids = set(self.labels)
        defect_total: Counter[str] = Counter()
        defect_completed: Counter[str] = Counter()
        review_status_counts: Counter[str] = Counter()
        for record in self.queue:
            defect_type = str(record.get("defect_type"))
            defect_total[defect_type] += 1
            label = self.labels.get(record["label_id"])
            if label:
                defect_completed[defect_type] += 1
                review_status_counts[str(label.get("review_status", "confirmed"))] += 1
        total = len(self.queue)
        completed = len(completed_ids)
        state = self._load_state()
        return {
            "completed": completed,
            "total": total,
            "coverage_ratio": completed / total if total else 0.0,
            "current_index": state.get("current_index", 0),
            "review_status_counts": dict(sorted(review_status_counts.items())),
            "coverage_by_defect_type": {
                defect_type: {
                    "completed": defect_completed.get(defect_type, 0),
                    "total": count,
                }
                for defect_type, count in sorted(defect_total.items())
            },
        }

    def save_label(self, payload: dict[str, Any]) -> dict[str, Any]:
        label_id = str(payload.get("label_id", ""))
        if label_id not in self.queue_by_id:
            raise ValueError(f"label_id is not present in queue: {label_id}")
        queue_record = self.queue_by_id[label_id]
        label = self._normalized_label(payload, queue_record)
        self._validate_label(label, queue_record)
        self.labels[label_id] = label
        self._write_labels()
        index = self._index_for_label_id(label_id)
        self.write_state(index)
        return {
            "saved": True,
            "label": label,
            "progress": self.progress(),
        }

    def write_state(self, current_index: int) -> None:
        state = {
            "current_index": current_index,
            "updated_at": _now_iso(),
        }
        _write_json_atomic(self.state_path, state)

    def screenshot_path(self, label_id: str, side: str) -> Path:
        if side not in ("left", "right"):
            raise ValueError("side must be left or right")
        if label_id not in self.queue_by_id:
            raise ValueError(f"label_id is not present in queue: {label_id}")
        record = self.queue_by_id[label_id]
        item = record[f"{side}_item"]
        side_record = record.get(item)
        if not isinstance(side_record, dict):
            side_record = record.get(side)
        if not isinstance(side_record, dict):
            raise ValueError(f"{side} item is missing")
        raw_path = side_record.get("screenshot_path")
        if not isinstance(raw_path, str) or not raw_path:
            raise ValueError(f"{side} screenshot path is missing")
        path = Path(raw_path).expanduser()
        return path.resolve() if path.is_absolute() else (self.queue_dir / path).resolve()

    def _load_labels(self) -> dict[str, dict[str, Any]]:
        if not self.labels_path.is_file():
            return {}
        labels: dict[str, dict[str, Any]] = {}
        for label in _read_jsonl(self.labels_path):
            label_id = str(label.get("label_id", ""))
            if label_id in labels:
                raise ValueError(f"labels.jsonl contains duplicate label_id: {label_id}")
            if label_id not in self.queue_by_id:
                raise ValueError(f"labels.jsonl includes label_id not present in queue: {label_id}")
            self._validate_label(label, self.queue_by_id[label_id])
            labels[label_id] = label
        return labels

    def _load_suggestions(self) -> dict[str, dict[str, Any]]:
        if not self.suggested_labels_path.is_file():
            return {}
        suggestions: dict[str, dict[str, Any]] = {}
        for label in _read_jsonl(self.suggested_labels_path):
            label_id = str(label.get("label_id", ""))
            if label_id in suggestions:
                raise ValueError(f"suggested_labels.jsonl contains duplicate label_id: {label_id}")
            if label_id not in self.queue_by_id:
                raise ValueError(
                    f"suggested_labels.jsonl includes label_id not present in queue: {label_id}"
                )
            self._validate_label(label, self.queue_by_id[label_id], allow_suggested=True)
            suggestions[label_id] = label
        return suggestions

    def _load_state(self) -> dict[str, Any]:
        if not self.state_path.is_file():
            return {}
        try:
            state = json.loads(self.state_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            return {}
        return state if isinstance(state, dict) else {}

    def _normalized_label(self, payload: dict[str, Any], queue_record: dict[str, Any]) -> dict[str, Any]:
        label_id = queue_record["label_id"]
        review_status = str(payload.get("review_status") or "edited")
        base = self.suggestions.get(label_id, {}) if review_status == "confirmed" else {}
        if review_status == "skipped":
            base = {
                "preferred": "unclear",
                "defect_tags": [],
                "quality_tags": [],
                "severity": "none",
                "fix_instruction": "",
                "reason": "Skipped during review.",
                "confidence": 1,
            }
        if review_status == "unclear":
            base = {
                **base,
                "preferred": "unclear",
                "severity": payload.get("severity") or base.get("severity") or "none",
                "confidence": payload.get("confidence") or base.get("confidence") or 2,
            }
        reviewer = payload.get("reviewed_by") or payload.get("labeler_id") or self.default_labeler_id
        label = {
            "label_id": label_id,
            "dataset_id": queue_record["dataset_id"],
            "split": queue_record["split"],
            "sample_id": queue_record["sample_id"],
            "variant_name": queue_record["variant_name"],
            "defect_type": queue_record["defect_type"],
            "left_item": queue_record["left_item"],
            "right_item": queue_record["right_item"],
            "preferred": payload.get("preferred", base.get("preferred")),
            "defect_tags": payload.get("defect_tags", base.get("defect_tags", [])),
            "quality_tags": payload.get("quality_tags", base.get("quality_tags", [])),
            "severity": payload.get("severity", base.get("severity")),
            "fix_instruction": payload.get("fix_instruction", base.get("fix_instruction", "")),
            "reason": payload.get("reason", base.get("reason", "")),
            "confidence": payload.get("confidence", base.get("confidence")),
            "labeler_id": reviewer,
            "created_at": _now_iso(),
            "suggested_by": base.get("suggested_by"),
            "suggestion_confidence": base.get("suggestion_confidence"),
            "suggested_preferred": base.get("preferred"),
            "suggested_severity": base.get("severity"),
            "suggested_defect_tags": base.get("defect_tags"),
            "review_status": review_status,
            "reviewed_by": reviewer,
            "reviewed_at": _now_iso(),
        }
        for field in (
            "pair_id",
            "pair_kind",
            "left_variant_name",
            "right_variant_name",
            "left_defect_type",
            "right_defect_type",
            "heuristic_signals",
        ):
            if field in queue_record:
                label[field] = queue_record[field]
        if "suggestion_reason" in base:
            label["suggestion_reason"] = base.get("suggestion_reason")
        return label

    def _validate_label(
        self,
        label: dict[str, Any],
        queue_record: dict[str, Any],
        *,
        allow_suggested: bool = False,
    ) -> None:
        errors: list[str] = []
        for field in ("label_id", "dataset_id", "split", "sample_id", "variant_name", "defect_type"):
            if label.get(field) != queue_record.get(field):
                errors.append(f"{field} does not match queue")
        allowed_items = queue_item_values(queue_record)
        if label.get("left_item") not in allowed_items:
            errors.append("left_item does not match queue")
        elif label.get("left_item") != queue_record.get("left_item"):
            errors.append("left_item does not match queue")
        if label.get("right_item") not in allowed_items:
            errors.append("right_item does not match queue")
        elif label.get("right_item") != queue_record.get("right_item"):
            errors.append("right_item does not match queue")
        for field in (
            "pair_id",
            "pair_kind",
            "left_variant_name",
            "right_variant_name",
            "left_defect_type",
            "right_defect_type",
        ):
            if field in label and field in queue_record and label[field] != queue_record[field]:
                errors.append(f"{field} does not match queue")
        if label.get("preferred") not in PREFERRED_VALUES:
            errors.append(f"preferred must be one of: {', '.join(PREFERRED_VALUES)}")
        if label.get("severity") not in SEVERITY_VALUES:
            errors.append(f"severity must be one of: {', '.join(SEVERITY_VALUES)}")
        review_status = label.get("review_status")
        if review_status is not None and review_status not in REVIEW_STATUS_VALUES:
            errors.append(f"review_status must be one of: {', '.join(REVIEW_STATUS_VALUES)}")
        if review_status == "suggested" and not allow_suggested:
            errors.append("suggested labels must be reviewed before saving to labels.jsonl")
        _validate_tags(errors, label.get("defect_tags"), "defect_tags", DEFECT_TAGS)
        _validate_tags(errors, label.get("quality_tags"), "quality_tags", QUALITY_TAGS)
        confidence = label.get("confidence")
        if not isinstance(confidence, int) or isinstance(confidence, bool) or confidence < 1 or confidence > 5:
            errors.append("confidence must be an integer from 1 to 5")
        for field in ("fix_instruction", "reason", "labeler_id", "created_at"):
            if not isinstance(label.get(field), str):
                errors.append(f"{field} must be a string")
        if errors:
            raise ValueError("; ".join(errors))

    def _write_labels(self) -> None:
        records = [
            self.labels[record["label_id"]]
            for record in self.queue
            if record["label_id"] in self.labels
        ]
        _write_jsonl_atomic(self.labels_path, records)

    def _index_for_label_id(self, label_id: str) -> int:
        for index, record in enumerate(self.queue):
            if record["label_id"] == label_id:
                return index
        return 0


def run_label_app(config: LabelAppConfig) -> LabelAppResult:
    host = config.host
    if host not in ("127.0.0.1", "localhost", "::1"):
        raise ValueError("label app may only bind to localhost by default")
    store = LabelAppStore(config.queue_dir, labeler_id=config.labeler_id)
    handler_class = _handler_class(store)
    server = ThreadingHTTPServer((host, config.port), handler_class)
    print(f"PawlBench Design label app: http://{host}:{config.port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return LabelAppResult(queue_dir=store.queue_dir, host=host, port=config.port)


def _handler_class(store: LabelAppStore) -> type[BaseHTTPRequestHandler]:
    class LabelAppHandler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:
            parsed = urlparse(self.path)
            try:
                if parsed.path == "/":
                    self._send_html(_app_html())
                elif parsed.path == "/api/queue":
                    self._send_json(store.queue_summary())
                elif parsed.path.startswith("/api/item/"):
                    index = int(parsed.path.rsplit("/", 1)[1])
                    store.write_state(index)
                    self._send_json(store.item(index))
                elif parsed.path == "/api/progress":
                    self._send_json(store.progress())
                elif parsed.path.startswith("/image/"):
                    self._send_image(parsed.path)
                else:
                    self._send_error(HTTPStatus.NOT_FOUND, "not found")
            except (ValueError, IndexError) as exc:
                self._send_error(HTTPStatus.BAD_REQUEST, str(exc))

        def do_POST(self) -> None:
            parsed = urlparse(self.path)
            if parsed.path != "/api/label":
                self._send_error(HTTPStatus.NOT_FOUND, "not found")
                return
            try:
                length = int(self.headers.get("content-length", "0"))
                payload = json.loads(self.rfile.read(length).decode("utf-8"))
                if not isinstance(payload, dict):
                    raise ValueError("request body must be a JSON object")
                self._send_json(store.save_label(payload))
            except json.JSONDecodeError as exc:
                self._send_error(HTTPStatus.BAD_REQUEST, f"invalid JSON: {exc}")
            except ValueError as exc:
                self._send_error(HTTPStatus.BAD_REQUEST, str(exc))

        def log_message(self, format: str, *args: Any) -> None:
            return

        def _send_image(self, path: str) -> None:
            parts = path.strip("/").split("/")
            if len(parts) != 3:
                self._send_error(HTTPStatus.NOT_FOUND, "not found")
                return
            _, label_id, side = parts
            image_path = store.screenshot_path(label_id, side)
            if not image_path.is_file():
                self._send_error(HTTPStatus.NOT_FOUND, "image not found")
                return
            content_type = mimetypes.guess_type(image_path.name)[0] or "application/octet-stream"
            data = image_path.read_bytes()
            self.send_response(HTTPStatus.OK)
            self.send_header("content-type", content_type)
            self.send_header("content-length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def _send_html(self, body: str) -> None:
            data = body.encode("utf-8")
            self.send_response(HTTPStatus.OK)
            self.send_header("content-type", "text/html; charset=utf-8")
            self.send_header("content-length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def _send_json(self, value: Any) -> None:
            data = json.dumps(value, indent=2, sort_keys=True).encode("utf-8")
            self.send_response(HTTPStatus.OK)
            self.send_header("content-type", "application/json; charset=utf-8")
            self.send_header("content-length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def _send_error(self, status: HTTPStatus, message: str) -> None:
            data = json.dumps({"error": message}, indent=2, sort_keys=True).encode("utf-8")
            self.send_response(status)
            self.send_header("content-type", "application/json; charset=utf-8")
            self.send_header("content-length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

    return LabelAppHandler


def _validate_tags(
    errors: list[str],
    value: Any,
    field: str,
    allowed: tuple[str, ...],
) -> None:
    if not isinstance(value, list):
        errors.append(f"{field} must be a list")
        return
    for tag in value:
        if tag not in allowed:
            errors.append(f"unsupported {field} tag: {tag}")


def _write_jsonl_atomic(path: Path, records: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as file:
        temp_path = Path(file.name)
        for record in records:
            file.write(json.dumps(record, sort_keys=True) + "\n")
    temp_path.replace(path)


def _write_json_atomic(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as file:
        temp_path = Path(file.name)
        file.write(json.dumps(value, indent=2, sort_keys=True) + "\n")
    temp_path.replace(path)


def _now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _app_html() -> str:
    defect_tags = json.dumps(list(DEFECT_TAGS))
    quality_tags = json.dumps(list(QUALITY_TAGS))
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>PawlBench Design Label App</title>
  <style>
    * {{ box-sizing: border-box; }}
    body {{ margin: 0; font: 14px/1.45 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f4f6f8; color: #172026; }}
    header {{ height: 56px; display: flex; align-items: center; justify-content: space-between; padding: 0 18px; border-bottom: 1px solid #d8dee4; background: #fff; }}
    main {{ display: grid; grid-template-columns: minmax(0, 1fr) 360px; min-height: calc(100vh - 56px); }}
    .viewer {{ padding: 16px; min-width: 0; }}
    .meta {{ display: grid; gap: 8px; margin-bottom: 14px; }}
    .meta-row {{ display: flex; flex-wrap: wrap; gap: 8px 16px; color: #53616b; }}
    .screens {{ display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }}
    .shot {{ min-width: 0; background: #fff; border: 1px solid #d8dee4; border-radius: 8px; overflow: hidden; }}
    .shot h2 {{ margin: 0; padding: 10px 12px; font-size: 14px; border-bottom: 1px solid #d8dee4; }}
    .shot img {{ display: block; width: 100%; height: auto; background: #fff; }}
    aside {{ border-left: 1px solid #d8dee4; background: #fff; padding: 16px; overflow: auto; }}
    fieldset {{ border: 1px solid #d8dee4; border-radius: 8px; margin: 0 0 12px; padding: 12px; }}
    legend {{ font-weight: 650; }}
    label {{ display: block; margin: 7px 0; }}
    input[type="text"], select, textarea {{ width: 100%; border: 1px solid #bcc6d0; border-radius: 6px; padding: 8px; font: inherit; }}
    textarea {{ min-height: 72px; resize: vertical; }}
    button {{ border: 1px solid #172026; background: #172026; color: #fff; border-radius: 6px; padding: 8px 10px; font: inherit; cursor: pointer; }}
    button.secondary {{ background: #fff; color: #172026; }}
    button.warn {{ border-color: #8a4b00; background: #fff; color: #8a4b00; }}
    .actions {{ display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }}
    .shortcuts {{ margin: 0 0 12px; color: #53616b; }}
    .dirty {{ color: #8a4b00; font-weight: 650; }}
    .overlay {{ position: fixed; inset: 0; display: none; place-items: center; background: rgba(23, 32, 38, 0.35); z-index: 10; }}
    .overlay.open {{ display: grid; }}
    .help {{ width: min(640px, calc(100vw - 24px)); background: #fff; border-radius: 8px; padding: 18px; box-shadow: 0 20px 50px rgba(0,0,0,0.2); }}
    .help table {{ width: 100%; border-collapse: collapse; }}
    .help td {{ padding: 6px; border-top: 1px solid #e2e8ee; }}
    pre {{ white-space: pre-wrap; overflow-wrap: anywhere; background: #f4f6f8; padding: 10px; border-radius: 6px; }}
    @media (max-width: 1000px) {{ main, .screens {{ grid-template-columns: 1fr; }} aside {{ border-left: 0; border-top: 1px solid #d8dee4; }} }}
  </style>
</head>
<body>
  <header>
    <strong>PawlBench Design Label App</strong>
    <span id="progress">Loading...</span>
  </header>
  <main>
    <section class="viewer">
      <div class="meta">
        <div><strong id="label-id"></strong></div>
        <div class="meta-row">
          <span id="sample"></span>
          <span id="variant"></span>
          <span id="defect"></span>
        </div>
        <div id="issue"></div>
        <div id="fix"></div>
        <div id="suggestion"></div>
        <pre id="deltas"></pre>
      </div>
      <div class="screens">
        <div class="shot"><h2 id="left-title">Left</h2><img id="left-img" alt="Left screenshot"></div>
        <div class="shot"><h2 id="right-title">Right</h2><img id="right-img" alt="Right screenshot"></div>
      </div>
    </section>
    <aside>
      <p class="shortcuts">Shortcuts: Space confirm, Enter save, 1/2/3/4 preference, j/k next/previous, ? help.</p>
      <fieldset>
        <legend>Preferred</legend>
        <label><input type="radio" name="preferred" value="left"> Left</label>
        <label><input type="radio" name="preferred" value="right"> Right</label>
        <label><input type="radio" name="preferred" value="tie"> Tie</label>
        <label><input type="radio" name="preferred" value="unclear"> Unclear</label>
      </fieldset>
      <fieldset><legend>Defect Tags</legend><div id="defect-tags"></div></fieldset>
      <fieldset><legend>Quality Tags</legend><div id="quality-tags"></div></fieldset>
      <label>Severity<select id="severity"><option>none</option><option>low</option><option selected>medium</option><option>high</option></select></label>
      <label>Confidence<select id="confidence"><option>1</option><option>2</option><option selected>3</option><option>4</option><option>5</option></select></label>
      <label>Labeler ID<input id="labeler-id" type="text"></label>
      <label>Fix Instruction<textarea id="fix-instruction"></textarea></label>
      <label>Reason<textarea id="reason"></textarea></label>
      <div class="actions">
        <button id="confirm">Confirm suggestion</button>
        <button class="secondary" id="edit-save">Edit & save</button>
        <button class="warn" id="unclear">Mark unclear</button>
        <button class="secondary" id="prev">Previous</button>
        <button class="secondary" id="skip">Skip</button>
        <button class="secondary" id="next">Next</button>
      </div>
      <p id="status"></p>
    </aside>
  </main>
  <div class="overlay" id="help-overlay">
    <div class="help">
      <h2>Keyboard Shortcuts</h2>
      <table>
        <tr><td>Space</td><td>Confirm current suggestion and go next</td></tr>
        <tr><td>Enter</td><td>Save edited form and go next</td></tr>
        <tr><td>ArrowRight or j</td><td>Next item</td></tr>
        <tr><td>ArrowLeft or k</td><td>Previous item</td></tr>
        <tr><td>1 / 2 / 3 / 4</td><td>Select Left / Right / Tie / Unclear</td></tr>
        <tr><td>u</td><td>Mark unclear and go next</td></tr>
        <tr><td>s</td><td>Skip current item</td></tr>
        <tr><td>e</td><td>Focus reason/fix edit area</td></tr>
        <tr><td>?</td><td>Show or hide this help</td></tr>
        <tr><td>Escape</td><td>Close help or blur current control</td></tr>
      </table>
    </div>
  </div>
  <script>
    const defectTags = {defect_tags};
    const qualityTags = {quality_tags};
    let currentIndex = 0;
    let total = 0;
    let current = null;
    let dirty = false;

    function checkboxList(target, name, values) {{
      document.getElementById(target).innerHTML = values.map(v =>
        `<label><input type="checkbox" name="${{name}}" value="${{v}}"> ${{v}}</label>`
      ).join("");
    }}

    async function api(path, options) {{
      const response = await fetch(path, options);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || response.statusText);
      return data;
    }}

    async function loadQueue() {{
      checkboxList("defect-tags", "defect_tags", defectTags);
      checkboxList("quality-tags", "quality_tags", qualityTags);
      const queue = await api("/api/queue");
      total = queue.total;
      document.getElementById("labeler-id").value = queue.default_labeler_id;
      await loadItem(0);
      document.querySelectorAll("input, textarea, select").forEach(el => {{
        el.addEventListener("input", markDirty);
        el.addEventListener("change", markDirty);
      }});
    }}

    async function loadItem(index) {{
      if (index < 0 || index >= total) return;
      current = await api(`/api/item/${{index}}`);
      currentIndex = index;
      const record = current.record;
      document.getElementById("label-id").textContent = record.label_id;
      document.getElementById("sample").textContent = `sample: ${{record.sample_id}}`;
      document.getElementById("variant").textContent = `variant: ${{record.variant_name}}`;
      document.getElementById("defect").textContent = `defect: ${{record.defect_type}}`;
      document.getElementById("issue").textContent = `Expected issue: ${{record.expected_issue || ""}}`;
      document.getElementById("fix").textContent = `Expected fix: ${{record.expected_fix_instruction || ""}}`;
      document.getElementById("suggestion").textContent = current.suggestion ? `Suggestion: ${{current.suggestion.preferred}} · ${{current.suggestion.severity}} · confidence ${{current.suggestion.suggestion_confidence}}` : "Suggestion: none";
      document.getElementById("deltas").textContent = JSON.stringify(record.metric_deltas || {{}}, null, 2);
      document.getElementById("left-title").textContent = `Left: ${{record.left_item}}`;
      document.getElementById("right-title").textContent = `Right: ${{record.right_item}}`;
      document.getElementById("left-img").src = current.left_image_url;
      document.getElementById("right-img").src = current.right_image_url;
      fillForm(current.label || current.suggestion, record);
      dirty = false;
      await refreshProgress();
    }}

    function fillForm(label, record) {{
      const preferred = label?.preferred || "left";
      document.querySelectorAll("input[name='preferred']").forEach(el => el.checked = el.value === preferred);
      document.querySelectorAll("input[name='defect_tags']").forEach(el => el.checked = (label?.defect_tags || []).includes(el.value));
      document.querySelectorAll("input[name='quality_tags']").forEach(el => el.checked = (label?.quality_tags || []).includes(el.value));
      document.getElementById("severity").value = label?.severity || "medium";
      document.getElementById("confidence").value = String(label?.confidence || 3);
      document.getElementById("fix-instruction").value = label?.fix_instruction || record.expected_fix_instruction || "";
      document.getElementById("reason").value = label?.reason || "";
      if (label?.labeler_id) document.getElementById("labeler-id").value = label.labeler_id;
      document.getElementById("status").textContent = "";
      updateDirty();
    }}

    function checked(name) {{
      return Array.from(document.querySelectorAll(`input[name='${{name}}']:checked`)).map(el => el.value);
    }}

    function formPayload(reviewStatus) {{
      const labelerId = document.getElementById("labeler-id").value;
      return {{
        review_status: reviewStatus,
        label_id: current.record.label_id,
        preferred: document.querySelector("input[name='preferred']:checked")?.value,
        defect_tags: checked("defect_tags"),
        quality_tags: checked("quality_tags"),
        severity: document.getElementById("severity").value,
        confidence: Number(document.getElementById("confidence").value),
        labeler_id: labelerId,
        reviewed_by: labelerId,
        fix_instruction: document.getElementById("fix-instruction").value,
        reason: document.getElementById("reason").value
      }};
    }}

    async function postLabel(payload, message) {{
      await api("/api/label", {{
        method: "POST",
        headers: {{"content-type": "application/json"}},
        body: JSON.stringify(payload)
      }});
      dirty = false;
      document.getElementById("status").textContent = message;
      await loadItem(Math.min(currentIndex + 1, total - 1));
    }}

    async function confirmSuggestion() {{
      const labelerId = document.getElementById("labeler-id").value;
      const payload = dirty ? formPayload("edited") : {{label_id: current.record.label_id, review_status: "confirmed", labeler_id: labelerId, reviewed_by: labelerId}};
      await postLabel(payload, dirty ? "Saved edited label." : "Confirmed.");
    }}

    async function saveEdited() {{
      await postLabel(formPayload("edited"), "Saved.");
    }}

    async function markUnclear() {{
      selectPreferred("unclear");
      await postLabel(formPayload("unclear"), "Marked unclear.");
    }}

    async function skipCurrent() {{
      await postLabel({{label_id: current.record.label_id, review_status: "skipped", reviewed_by: document.getElementById("labeler-id").value}}, "Skipped.");
    }}

    async function refreshProgress() {{
      const progress = await api("/api/progress");
      document.getElementById("progress").textContent = `${{progress.completed}} / ${{progress.total}} complete · item ${{currentIndex + 1}} / ${{total}}`;
    }}

    function markDirty() {{
      dirty = true;
      updateDirty();
    }}

    function updateDirty() {{
      if (dirty) document.getElementById("status").innerHTML = '<span class="dirty">Unsaved changes</span>';
    }}

    function selectPreferred(value) {{
      document.querySelectorAll("input[name='preferred']").forEach(el => el.checked = el.value === value);
      markDirty();
    }}

    function isTypingTarget(target) {{
      return target && (target.closest("input, textarea, select") || target.isContentEditable);
    }}

    function toggleHelp(force) {{
      const overlay = document.getElementById("help-overlay");
      overlay.classList.toggle("open", force ?? !overlay.classList.contains("open"));
    }}

    function showError(err) {{
      document.getElementById("status").textContent = err.message;
    }}

    document.addEventListener("keydown", event => {{
      if (event.key === "Escape") {{
        if (document.getElementById("help-overlay").classList.contains("open")) {{
          toggleHelp(false);
          event.preventDefault();
        }} else if (isTypingTarget(document.activeElement)) {{
          document.activeElement.blur();
        }}
        return;
      }}
      if (isTypingTarget(event.target)) return;
      if (event.key === " ") {{ event.preventDefault(); confirmSuggestion().catch(showError); }}
      else if (event.key === "Enter") {{ event.preventDefault(); saveEdited().catch(showError); }}
      else if (event.key === "ArrowRight" || event.key === "j") loadItem(currentIndex + 1);
      else if (event.key === "ArrowLeft" || event.key === "k") loadItem(currentIndex - 1);
      else if (event.key === "1") selectPreferred("left");
      else if (event.key === "2") selectPreferred("right");
      else if (event.key === "3") selectPreferred("tie");
      else if (event.key === "4") selectPreferred("unclear");
      else if (event.key === "u") markUnclear().catch(showError);
      else if (event.key === "s") skipCurrent().catch(showError);
      else if (event.key === "e") document.getElementById("reason").focus();
      else if (event.key === "?") toggleHelp();
    }});

    document.getElementById("prev").onclick = () => loadItem(currentIndex - 1);
    document.getElementById("next").onclick = () => loadItem(currentIndex + 1);
    document.getElementById("skip").onclick = () => skipCurrent().catch(showError);
    document.getElementById("confirm").onclick = () => confirmSuggestion().catch(showError);
    document.getElementById("edit-save").onclick = () => saveEdited().catch(showError);
    document.getElementById("unclear").onclick = () => markUnclear().catch(showError);
    document.getElementById("help-overlay").onclick = event => {{ if (event.target.id === "help-overlay") toggleHelp(false); }};
    loadQueue().catch(showError);
  </script>
</body>
</html>
"""
