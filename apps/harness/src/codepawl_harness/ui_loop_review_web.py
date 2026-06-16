"""Local web review UI for UI loop manual batch labels."""

from __future__ import annotations

import argparse
import json
import mimetypes
import sys
import webbrowser
from dataclasses import dataclass
from datetime import datetime
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import unquote, urlparse

from pawlbench_design.ui_loop import (
    blank_manual_review_label,
    combine_manual_batch_reports,
    is_completed_manual_review_label,
    load_manual_patch_import_task_reports,
    load_selected_manual_review_tasks,
    manual_review_task_evidence,
    read_json,
    write_json,
)


VALID_PREFERENCES = {"before", "after", "tie"}
ARTIFACT_KINDS = {
    "before_screenshot",
    "after_screenshot",
    "patch_diff",
    "notes",
    "critic_json",
    "contract",
    "before_html",
    "patched_html",
}


@dataclass(frozen=True)
class ReviewWebConfig:
    selection_path: Path
    label_dir: Path
    mixed_report_path: Path
    hard_report_path: Path
    manual_patches_dir: Path
    reviewer_id: str
    host: str = "127.0.0.1"
    port: int = 8765
    open_browser: bool = False


class ReviewWebApp:
    def __init__(self, config: ReviewWebConfig):
        self.config = config
        self.selection_path = config.selection_path.expanduser().resolve()
        self.label_dir = config.label_dir.expanduser().resolve()
        self.mixed_report_path = config.mixed_report_path.expanduser().resolve()
        self.hard_report_path = config.hard_report_path.expanduser().resolve()
        self.manual_patches_dir = config.manual_patches_dir.expanduser().resolve()
        self.selection = read_json(self.selection_path)
        self.tasks = load_selected_manual_review_tasks(self.selection_path)
        self.task_by_id = {str(task.get("task_id")): task for task in self.tasks}
        self.reports = load_manual_patch_import_task_reports(self.mixed_report_path.parent, self.hard_report_path.parent)
        self.label_dir.mkdir(parents=True, exist_ok=True)
        self.allowed_roots = self._allowed_roots()

    def _allowed_roots(self) -> tuple[Path, ...]:
        roots = {
            self.selection_path.parent,
            self.label_dir,
            self.mixed_report_path.parent,
            self.hard_report_path.parent,
            self.manual_patches_dir,
        }
        for task in self.tasks:
            for key in ("before_screenshot_path", "before_html_path", "critic_json_path", "contract_path"):
                value = task.get(key)
                if value:
                    roots.add(Path(str(value)).expanduser().resolve().parent)
        return tuple(sorted(roots, key=lambda path: str(path)))

    def _ensure_known_task(self, task_id: str) -> dict[str, Any]:
        task = self.task_by_id.get(task_id)
        if task is None:
            raise KeyError(f"unknown task_id: {task_id}")
        return task

    def label_path(self, task_id: str) -> Path:
        self._ensure_known_task(task_id)
        return self.label_dir / f"{task_id}.json"

    def load_label(self, task_id: str) -> dict[str, Any]:
        path = self.label_path(task_id)
        if path.is_file():
            payload = read_json(path)
            if isinstance(payload, dict):
                return payload
        return blank_manual_review_label(task_id)

    def save_label(self, task_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        self._ensure_known_task(task_id)
        preferred = str(payload.get("preferred") or "").lower()
        if preferred not in VALID_PREFERENCES:
            raise ValueError("preferred must be before, after, or tie")
        issue_types_remaining = payload.get("issue_types_remaining") or []
        if not isinstance(issue_types_remaining, list):
            raise ValueError("issue_types_remaining must be a list")
        label = {
            "task_id": task_id,
            "preferred": preferred,
            "issue_types_remaining": [str(item) for item in issue_types_remaining],
            "visual_regression": _json_bool_or_none(payload.get("visual_regression")),
            "accessibility_concern": _json_bool_or_none(payload.get("accessibility_concern")),
            "notes": str(payload.get("notes") or ""),
            "reviewer_id": self.config.reviewer_id,
            "provenance": "manual_review",
            "created_at": datetime.now().astimezone().replace(microsecond=0).isoformat(),
        }
        write_json(self.label_path(task_id), label)
        return label

    def skip_label(self, task_id: str) -> dict[str, Any]:
        return self.load_label(task_id)

    def progress(self) -> dict[str, Any]:
        labels = [self.load_label(str(task["task_id"])) for task in self.tasks]
        reviewed = sum(1 for label in labels if is_completed_manual_review_label(label))
        return {"reviewed": reviewed, "total": len(self.tasks)}

    def task_summary(self, task: dict[str, Any]) -> dict[str, Any]:
        task_id = str(task["task_id"])
        label = self.load_label(task_id)
        return {
            "task_id": task_id,
            "source_loop_set": task.get("source_loop_set"),
            "difficulty": task.get("difficulty"),
            "corruption_type": task.get("corruption_type"),
            "known_issue_types": list(task.get("known_issue_types") or []),
            "preferred": label.get("preferred"),
            "visual_regression": label.get("visual_regression"),
            "accessibility_concern": label.get("accessibility_concern"),
            "completed": is_completed_manual_review_label(label),
        }

    def state(self) -> dict[str, Any]:
        return {
            "reviewer_id": self.config.reviewer_id,
            "progress": self.progress(),
            "tasks": [self.task_summary(task) for task in self.tasks],
            "recombine_command": self.recombine_command(),
        }

    def task_detail(self, task_id: str) -> dict[str, Any]:
        task = self._ensure_known_task(task_id)
        evidence = manual_review_task_evidence(task, self.reports.get(task_id), label_dir=self.label_dir, manual_patches_dir=self.manual_patches_dir)
        notes = self._read_artifact_json(task_id, "notes")
        patch_diff = self._read_artifact_text(task_id, "patch_diff", limit=60000)
        contract = self._read_artifact_text(task_id, "contract", limit=60000)
        critic = self._read_artifact_json(task_id, "critic_json")
        return {
            "task": task,
            "label": self.load_label(task_id),
            "evidence": evidence,
            "artifacts": {kind: f"/api/artifacts/{task_id}/{kind}" for kind in ARTIFACT_KINDS if self.artifact_path(task_id, kind, missing_ok=True) is not None},
            "notes_json": notes,
            "patch_diff": patch_diff,
            "contract_text": contract,
            "critic_json": critic,
            "progress": self.progress(),
        }

    def artifact_path(self, task_id: str, kind: str, *, missing_ok: bool = False) -> Path | None:
        task = self._ensure_known_task(task_id)
        if kind not in ARTIFACT_KINDS:
            raise KeyError(f"unknown artifact kind: {kind}")
        evidence = manual_review_task_evidence(task, self.reports.get(task_id), label_dir=self.label_dir, manual_patches_dir=self.manual_patches_dir)
        patch_dir = self.manual_patches_dir / task_id
        mapping = {
            "before_screenshot": evidence.get("before_screenshot_path"),
            "after_screenshot": evidence.get("after_screenshot_path"),
            "patch_diff": evidence.get("patch_diff_path"),
            "notes": str(patch_dir / "notes.json"),
            "critic_json": task.get("critic_json_path"),
            "contract": task.get("contract_path"),
            "before_html": task.get("before_html_path"),
            "patched_html": str(patch_dir / "patched.html"),
        }
        value = mapping.get(kind)
        if not value:
            if missing_ok:
                return None
            raise FileNotFoundError("Không tìm thấy artifact")
        path = Path(str(value)).expanduser().resolve()
        if not self.is_allowed_path(path):
            raise PermissionError("artifact path is outside allowed roots")
        if not path.is_file():
            if missing_ok:
                return None
            raise FileNotFoundError("Không tìm thấy artifact")
        return path

    def is_allowed_path(self, path: Path) -> bool:
        resolved = path.expanduser().resolve()
        return any(resolved == root or root in resolved.parents for root in self.allowed_roots)

    def recombine(self) -> dict[str, Any]:
        output_path = self.selection_path.parent / "combined_manual_patch_report.json"
        return combine_manual_batch_reports(
            [self.mixed_report_path, self.hard_report_path],
            selection=self.selection,
            output_path=output_path,
            label_dir=self.label_dir,
        )

    def recombine_command(self) -> str:
        return (
            "UV_NO_SYNC=1 UV_CACHE_DIR=/tmp/uv-cache uv run ui-loop-manual-batch combine "
            f"--selection {self.selection_path} "
            f"--mixed-report {self.mixed_report_path} "
            f"--hard-report {self.hard_report_path} "
            f"--labels {self.label_dir} "
            f"--out {self.selection_path.parent / 'combined_manual_patch_report.json'}"
        )

    def _read_artifact_text(self, task_id: str, kind: str, *, limit: int) -> str:
        try:
            path = self.artifact_path(task_id, kind)
        except (FileNotFoundError, KeyError, PermissionError):
            return ""
        return path.read_text(encoding="utf-8", errors="replace")[:limit]

    def _read_artifact_json(self, task_id: str, kind: str) -> dict[str, Any] | None:
        try:
            path = self.artifact_path(task_id, kind)
        except (FileNotFoundError, KeyError, PermissionError):
            return None
        payload = read_json(path)
        return payload if isinstance(payload, dict) else None


class ReviewRequestHandler(BaseHTTPRequestHandler):
    server: "ReviewHTTPServer"

    def log_message(self, format: str, *args: object) -> None:
        print(f"{self.address_string()} - {format % args}", file=sys.stderr)

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        try:
            if parsed.path == "/":
                self._send_html(REVIEW_HTML)
            elif parsed.path == "/api/state":
                self._send_json(self.server.app.state())
            elif parsed.path.startswith("/api/tasks/"):
                task_id = unquote(parsed.path.removeprefix("/api/tasks/"))
                self._send_json(self.server.app.task_detail(task_id))
            elif parsed.path.startswith("/api/artifacts/"):
                self._send_artifact(parsed.path)
            else:
                self._send_json({"error": "Không tìm thấy"}, status=HTTPStatus.NOT_FOUND)
        except KeyError:
            self._send_json({"error": "Không tìm thấy task"}, status=HTTPStatus.NOT_FOUND)
        except PermissionError:
            self._send_json({"error": "Không được phép truy cập artifact"}, status=HTTPStatus.FORBIDDEN)
        except FileNotFoundError:
            self._send_json({"error": "Không tìm thấy artifact"}, status=HTTPStatus.NOT_FOUND)
        except Exception as exc:
            self._send_json({"error": str(exc)}, status=HTTPStatus.INTERNAL_SERVER_ERROR)

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        try:
            if parsed.path.startswith("/api/tasks/") and parsed.path.endswith("/label"):
                task_id = unquote(parsed.path.removeprefix("/api/tasks/").removesuffix("/label"))
                payload = self._read_json_body()
                self._send_json({"label": self.server.app.save_label(task_id, payload), "progress": self.server.app.progress()})
            elif parsed.path.startswith("/api/tasks/") and parsed.path.endswith("/skip"):
                task_id = unquote(parsed.path.removeprefix("/api/tasks/").removesuffix("/skip"))
                self._send_json({"label": self.server.app.skip_label(task_id), "progress": self.server.app.progress()})
            elif parsed.path == "/api/recombine":
                self._send_json({"report": self.server.app.recombine(), "command": self.server.app.recombine_command()})
            else:
                self._send_json({"error": "Không tìm thấy"}, status=HTTPStatus.NOT_FOUND)
        except ValueError as exc:
            self._send_json({"error": str(exc)}, status=HTTPStatus.BAD_REQUEST)
        except KeyError:
            self._send_json({"error": "Không tìm thấy task"}, status=HTTPStatus.NOT_FOUND)
        except Exception as exc:
            self._send_json({"error": str(exc)}, status=HTTPStatus.INTERNAL_SERVER_ERROR)

    def _send_artifact(self, path: str) -> None:
        parts = [unquote(part) for part in path.split("/") if part]
        if len(parts) != 4 or parts[:2] != ["api", "artifacts"]:
            self._send_json({"error": "Không tìm thấy artifact"}, status=HTTPStatus.NOT_FOUND)
            return
        task_id, kind = parts[2], parts[3]
        artifact_path = self.server.app.artifact_path(task_id, kind)
        content_type = mimetypes.guess_type(str(artifact_path))[0] or "application/octet-stream"
        data = artifact_path.read_bytes()
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(data)

    def _read_json_body(self) -> dict[str, Any]:
        length = int(self.headers.get("Content-Length") or "0")
        if length <= 0:
            return {}
        raw = self.rfile.read(length)
        payload = json.loads(raw.decode("utf-8"))
        if not isinstance(payload, dict):
            raise ValueError("JSON body must be an object")
        return payload

    def _send_json(self, payload: dict[str, Any], *, status: HTTPStatus = HTTPStatus.OK) -> None:
        data = json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(data)

    def _send_html(self, html: str) -> None:
        data = html.encode("utf-8")
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(data)


class ReviewHTTPServer(ThreadingHTTPServer):
    def __init__(self, server_address: tuple[str, int], app: ReviewWebApp):
        super().__init__(server_address, ReviewRequestHandler)
        self.app = app


def _json_bool_or_none(value: Any) -> bool | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return value
    raise ValueError("boolean field must be true, false, or null")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="ui-loop-review-web", description="Run a local Vietnamese web UI for UI loop manual review labels.")
    parser.add_argument("--selection", default="reports/ui_loop_v0_manual_batch/task_selection.json")
    parser.add_argument("--labels", default="reports/ui_loop_v0_manual_batch/manual_review_labels")
    parser.add_argument("--mixed-report", default="reports/ui_loop_v0_manual_batch/mixed_manual_patch_import/closed_loop_report.json")
    parser.add_argument("--hard-report", default="reports/ui_loop_v0_manual_batch/hard_manual_patch_import/closed_loop_report.json")
    parser.add_argument("--manual-patches", default="data/manual_patches/ui_loop_v0")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--reviewer-id", required=True)
    parser.add_argument("--open-browser", action="store_true")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    config = ReviewWebConfig(
        selection_path=Path(args.selection),
        label_dir=Path(args.labels),
        mixed_report_path=Path(args.mixed_report),
        hard_report_path=Path(args.hard_report),
        manual_patches_dir=Path(args.manual_patches),
        reviewer_id=args.reviewer_id,
        host=args.host,
        port=args.port,
        open_browser=args.open_browser,
    )
    try:
        app = ReviewWebApp(config)
        server = ReviewHTTPServer((config.host, config.port), app)
    except Exception as exc:
        print(f"ui-loop-review-web: {exc}", file=sys.stderr)
        return 2
    url = f"http://{config.host}:{server.server_address[1]}"
    print(url, flush=True)
    if config.open_browser:
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.", file=sys.stderr)
    finally:
        server.server_close()
    return 0


REVIEW_HTML = r"""<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Duyệt UI Loop</title>
  <style>
    :root{color-scheme:light;--bg:#f6f7f9;--panel:#ffffff;--text:#16202a;--muted:#5d6875;--line:#d9dee5;--blue:#155eef;--green:#087443;--red:#b42318;--amber:#b54708}
    *{box-sizing:border-box}body{margin:0;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:var(--bg);color:var(--text)}
    button,input,textarea{font:inherit}button{border:1px solid var(--line);background:#fff;color:var(--text);border-radius:6px;padding:8px 10px;cursor:pointer}button:hover{border-color:#9aa4b2}button.primary{background:var(--blue);border-color:var(--blue);color:#fff}button.selected{border-color:var(--blue);box-shadow:0 0 0 2px rgba(21,94,239,.18)}
    .app{display:grid;grid-template-columns:320px 1fr;min-height:100vh}.sidebar{border-right:1px solid var(--line);background:#fff;padding:14px;position:sticky;top:0;height:100vh;overflow:auto}.brand{font-weight:800;margin:0 0 8px}.progress{color:var(--muted);margin-bottom:12px}.filters{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px}.filters button{font-size:13px;padding:6px 8px}.task-list{display:grid;gap:6px}.task-item{text-align:left;display:block;width:100%;padding:8px}.task-item.active{border-color:var(--blue);background:#eef4ff}.task-title{font-weight:700;font-size:13px;word-break:break-word}.task-meta{font-size:12px;color:var(--muted);margin-top:3px}.done{color:var(--green);font-weight:700}.main{padding:16px;min-width:0}.topbar{display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:12px}.topbar h1{font-size:20px;margin:0;word-break:break-word}.nav-actions{display:flex;gap:8px;flex-wrap:wrap}.screens{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px}.shot{background:#fff;border:1px solid var(--line);border-radius:8px;overflow:hidden}.shot h2,.panel h2{font-size:16px;margin:0;padding:10px 12px;border-bottom:1px solid var(--line)}.shot-frame{background:#eef1f5;min-height:360px;display:grid;place-items:center}.shot img{display:block;max-width:100%;height:auto}.missing{color:var(--muted);padding:20px;text-align:center}.grid{display:grid;grid-template-columns:minmax(260px,390px) 1fr;gap:12px}.panel{background:#fff;border:1px solid var(--line);border-radius:8px;min-width:0}.panel-body{padding:12px}.kv{display:grid;grid-template-columns:130px 1fr;gap:6px 10px;font-size:14px}.kv div:nth-child(odd){color:var(--muted)}.chips{display:flex;flex-wrap:wrap;gap:6px}.chip{border:1px solid var(--line);border-radius:999px;padding:3px 8px;font-size:12px;background:#fafafa}.choice-row{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px}.check-row{display:grid;gap:10px;margin:12px 0}.check-row label,.issue-box label{display:flex;gap:8px;align-items:flex-start}.help{color:var(--muted);font-size:13px;line-height:1.45;margin:5px 0 0 24px}.issue-box{border:1px solid var(--line);border-radius:6px;padding:10px;margin:12px 0}.issue-box legend{font-weight:700}textarea{width:100%;min-height:92px;border:1px solid var(--line);border-radius:6px;padding:8px;resize:vertical}.save-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.status{font-size:13px;color:var(--muted)}pre{white-space:pre-wrap;overflow:auto;margin:0;font-size:12px;line-height:1.45;max-height:320px}.tabs{display:flex;gap:6px;margin-bottom:8px}.tab{font-size:13px}.tab-content{display:none}.tab-content.active{display:block}.recombine{margin-top:12px}.report-grid{display:grid;grid-template-columns:220px 1fr;gap:6px;font-size:14px;margin-top:10px}.kbd{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;border:1px solid var(--line);border-radius:4px;padding:1px 5px;background:#f8fafc}
    @media(max-width:1050px){.app{grid-template-columns:1fr}.sidebar{position:relative;height:auto}.screens,.grid{grid-template-columns:1fr}.shot-frame{min-height:220px}}
  </style>
</head>
<body>
  <div class="app">
    <aside class="sidebar">
      <p class="brand">Duyệt UI Loop</p>
      <div id="progress" class="progress">Đã review 0 / 0</div>
      <div id="filters" class="filters"></div>
      <div id="taskList" class="task-list"></div>
    </aside>
    <main class="main">
      <div class="topbar">
        <h1 id="taskTitle">Đang tải...</h1>
        <div class="nav-actions">
          <button id="prevBtn">Task trước</button>
          <button id="nextBtn">Task tiếp theo</button>
        </div>
      </div>
      <section class="screens">
        <div class="shot"><h2>Trước khi sửa</h2><div id="beforeShot" class="shot-frame"></div></div>
        <div class="shot"><h2>Sau khi sửa</h2><div id="afterShot" class="shot-frame"></div></div>
      </section>
      <section class="grid">
        <div class="panel">
          <h2>Thông tin task</h2>
          <div class="panel-body">
            <div id="metadata" class="kv"></div>
            <h3>Loại issue đã biết</h3>
            <div id="knownIssues" class="chips"></div>
          </div>
        </div>
        <div class="panel">
          <h2>Đánh giá</h2>
          <div class="panel-body">
            <div class="choice-row">
              <button data-pref="after">Sau tốt hơn</button>
              <button data-pref="before">Trước tốt hơn</button>
              <button data-pref="tie">Ngang nhau</button>
              <button id="skipBtn">Bỏ qua</button>
            </div>
            <div class="check-row">
              <label><input id="visualRegression" type="checkbox"> Có lỗi thị giác mới</label>
              <p class="help">Lỗi thị giác mới nghĩa là bản sau khi sửa tạo ra vấn đề nhìn thấy được, ví dụ: text bị cắt, element bị lệch, layout bị vỡ, spacing xấu hơn, màu xấu hơn, mất thành phần quan trọng, overflow, hoặc tổng thể nhìn tệ hơn bản trước.</p>
              <label><input id="accessibilityConcern" type="checkbox"> Có vấn đề accessibility</label>
              <p class="help">Vấn đề accessibility nghĩa là bản sau có thể làm giảm khả năng đọc hoặc sử dụng, ví dụ: contrast thấp, chữ khó đọc, label/focus/semantic tệ hơn, hoặc CTA/input khó nhận biết hơn.</p>
            </div>
            <fieldset id="remainingIssues" class="issue-box">
              <legend>Issue còn lại</legend>
            </fieldset>
            <label for="notes">Ghi chú ngắn</label>
            <textarea id="notes"></textarea>
            <div class="save-row">
              <button id="saveBtn" class="primary">Lưu</button>
              <button id="recombineBtn">Recombine report</button>
              <span id="status" class="status"></span>
            </div>
            <div id="recombineReport" class="recombine"></div>
          </div>
        </div>
      </section>
      <section class="panel" style="margin-top:12px">
        <h2>Patch và contract</h2>
        <div class="panel-body">
          <div class="tabs">
            <button class="tab selected" data-tab="summary">Tóm tắt patch</button>
            <button class="tab" data-tab="diff">Diff patch</button>
            <button class="tab" data-tab="contract">Contract của critic</button>
            <button class="tab" data-tab="critic">Critic JSON</button>
          </div>
          <div id="tab-summary" class="tab-content active"></div>
          <pre id="tab-diff" class="tab-content"></pre>
          <pre id="tab-contract" class="tab-content"></pre>
          <pre id="tab-critic" class="tab-content"></pre>
        </div>
      </section>
    </main>
  </div>
<script>
const filters = [
  ["all","Tất cả"],["empty","Chưa review"],["after","Sau tốt hơn"],["before","Trước tốt hơn"],["tie","Ngang nhau"],
  ["visual","Có lỗi thị giác mới"],["access","Có vấn đề accessibility"],["loop_mixed_50","Mixed"],["loop_hard_100","Hard"],
  ["spacing","spacing"],["contrast","contrast"],["alignment","alignment"],["hierarchy","hierarchy"]
];
let state = null, currentId = null, currentDetail = null, filter = "all", selectedPreferred = null;
const $ = (id) => document.getElementById(id);

async function api(path, options={}) {
  const res = await fetch(path, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Có lỗi xảy ra");
  return data;
}

function setStatus(text) { $("status").textContent = text || ""; }

function taskMatches(task) {
  if (filter === "all") return true;
  if (filter === "empty") return !task.completed;
  if (["after","before","tie"].includes(filter)) return task.preferred === filter;
  if (filter === "visual") return task.visual_regression === true;
  if (filter === "access") return task.accessibility_concern === true;
  if (filter === "loop_mixed_50" || filter === "loop_hard_100") return task.source_loop_set === filter;
  return (task.known_issue_types || []).includes(filter) || task.corruption_type === filter;
}

function filteredTasks() { return state.tasks.filter(taskMatches); }

function renderFilters() {
  $("filters").innerHTML = "";
  filters.forEach(([key,label]) => {
    const btn = document.createElement("button");
    btn.textContent = label;
    btn.className = key === filter ? "selected" : "";
    btn.onclick = () => { filter = key; renderFilters(); renderTaskList(); };
    $("filters").appendChild(btn);
  });
}

function renderTaskList() {
  $("progress").textContent = `Đã review ${state.progress.reviewed} / ${state.progress.total}`;
  const list = $("taskList");
  list.innerHTML = "";
  filteredTasks().forEach((task) => {
    const btn = document.createElement("button");
    btn.className = `task-item ${task.task_id === currentId ? "active" : ""}`;
    btn.innerHTML = `<div class="task-title">${task.completed ? "<span class='done'>✓</span> " : ""}${task.task_id}</div><div class="task-meta">${task.source_loop_set} · ${task.corruption_type} · ${task.preferred || "chưa review"}</div>`;
    btn.onclick = () => loadTask(task.task_id);
    list.appendChild(btn);
  });
}

function artifactImage(url) {
  if (!url) return `<div class="missing">Không tìm thấy artifact</div>`;
  return `<img src="${url}" alt="">`;
}

function renderDetail(detail) {
  currentDetail = detail;
  currentId = detail.task.task_id;
  $("taskTitle").textContent = currentId;
  $("beforeShot").innerHTML = artifactImage(detail.artifacts.before_screenshot);
  $("afterShot").innerHTML = artifactImage(detail.artifacts.after_screenshot);
  const task = detail.task;
  $("metadata").innerHTML = [
    ["Bộ dữ liệu", task.source_loop_set],["Độ khó", task.difficulty],["Loại lỗi", task.corruption_type],["Mức độ", task.severity],
    ["Độ tin critic", task.critic_confidence],["Trạng thái holdout", task.holdout_status],["Lý do chọn", task.selection_reason]
  ].map(([k,v]) => `<div>${k}</div><div>${v ?? ""}</div>`).join("");
  $("knownIssues").innerHTML = (task.known_issue_types || []).map(x => `<span class="chip">${x}</span>`).join("") || `<span class="missing">Không có</span>`;
  selectedPreferred = detail.label.preferred || null;
  document.querySelectorAll("[data-pref]").forEach(btn => btn.classList.toggle("selected", btn.dataset.pref === selectedPreferred));
  $("visualRegression").checked = detail.label.visual_regression === true;
  $("accessibilityConcern").checked = detail.label.accessibility_concern === true;
  $("notes").value = detail.label.notes || "";
  renderRemainingIssues(task.known_issue_types || [], detail.label.issue_types_remaining || []);
  $("tab-summary").innerHTML = notesSummary(detail.notes_json);
  $("tab-diff").textContent = detail.patch_diff || "Không tìm thấy artifact";
  $("tab-contract").textContent = detail.contract_text || "Không tìm thấy artifact";
  $("tab-critic").textContent = detail.critic_json ? JSON.stringify(detail.critic_json, null, 2) : "Không tìm thấy artifact";
  setStatus(detail.label.preferred ? "Đã tải label hiện có" : "");
  renderTaskList();
}

function notesSummary(notes) {
  if (!notes) return `<div class="missing">Không tìm thấy artifact</div>`;
  const rows = [["Tóm tắt", notes.patch_summary],["Tác giả", notes.patch_author],["Nguồn", notes.provenance],["Có dùng oracle", notes.oracle_used],["Giới hạn", (notes.known_limitations || []).join(", ")]];
  return `<div class="kv">${rows.map(([k,v]) => `<div>${k}</div><div>${v ?? ""}</div>`).join("")}</div>`;
}

function renderRemainingIssues(issues, selected) {
  const box = $("remainingIssues");
  box.innerHTML = "<legend>Issue còn lại</legend>";
  if (!issues.length) {
    const p = document.createElement("p");
    p.className = "missing";
    p.textContent = "Không có issue đã biết";
    box.appendChild(p);
    return;
  }
  issues.forEach(issue => {
    const label = document.createElement("label");
    label.innerHTML = `<input type="checkbox" value="${issue}" ${selected.includes(issue) ? "checked" : ""}> ${issue}`;
    box.appendChild(label);
  });
}

async function loadState() {
  state = await api("/api/state");
  renderFilters();
  currentId = currentId || (state.tasks[0] && state.tasks[0].task_id);
  renderTaskList();
  if (currentId) await loadTask(currentId);
}

async function loadTask(taskId) {
  const detail = await api(`/api/tasks/${encodeURIComponent(taskId)}`);
  renderDetail(detail);
}

function moveTask(delta) {
  const tasks = filteredTasks();
  const index = tasks.findIndex(t => t.task_id === currentId);
  const next = tasks[index + delta];
  if (next) loadTask(next.task_id);
}

async function saveLabel() {
  if (!selectedPreferred) { setStatus("Chọn Sau tốt hơn, Trước tốt hơn, hoặc Ngang nhau trước khi lưu"); return; }
  const issueTypes = Array.from($("remainingIssues").querySelectorAll("input:checked")).map(input => input.value);
  const payload = {
    preferred: selectedPreferred,
    issue_types_remaining: issueTypes,
    visual_regression: $("visualRegression").checked,
    accessibility_concern: $("accessibilityConcern").checked,
    notes: $("notes").value
  };
  const result = await api(`/api/tasks/${encodeURIComponent(currentId)}/label`, {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(payload)});
  state.progress = result.progress;
  const task = state.tasks.find(t => t.task_id === currentId);
  if (task) {
    task.preferred = result.label.preferred;
    task.visual_regression = result.label.visual_regression;
    task.accessibility_concern = result.label.accessibility_concern;
    task.completed = true;
  }
  setStatus("Đã lưu");
  renderTaskList();
}

async function skipTask() {
  await api(`/api/tasks/${encodeURIComponent(currentId)}/skip`, {method:"POST"});
  setStatus("Đã bỏ qua, không ghi label");
  moveTask(1);
}

async function recombine() {
  const result = await api("/api/recombine", {method:"POST"});
  const report = result.report;
  $("recombineReport").innerHTML = `<div class="report-grid">
    <div>Số label đã có</div><div>${report.manual_review.label_count}</div>
    <div>Manual review đã sẵn sàng</div><div>${report.manual_review_ready}</div>
    <div>PR review đã sẵn sàng</div><div>${report.pr_review_ready}</div>
    <div>Độ đồng thuận critic vs người review</div><div>${report.manual_review.critic_vs_human_agreement ?? ""}</div>
    <div>Lý do còn bị block</div><div>${report.blocked_reason || ""}</div>
  </div><pre>${result.command}</pre>`;
}

document.addEventListener("click", (event) => {
  const pref = event.target.closest("[data-pref]");
  if (pref) {
    selectedPreferred = pref.dataset.pref;
    document.querySelectorAll("[data-pref]").forEach(btn => btn.classList.toggle("selected", btn.dataset.pref === selectedPreferred));
  }
  const tab = event.target.closest("[data-tab]");
  if (tab) {
    document.querySelectorAll(".tab").forEach(btn => btn.classList.toggle("selected", btn === tab));
    document.querySelectorAll(".tab-content").forEach(panel => panel.classList.toggle("active", panel.id === `tab-${tab.dataset.tab}`));
  }
});
$("prevBtn").onclick = () => moveTask(-1);
$("nextBtn").onclick = () => moveTask(1);
$("saveBtn").onclick = saveLabel;
$("skipBtn").onclick = skipTask;
$("recombineBtn").onclick = recombine;
document.addEventListener("keydown", (event) => {
  const tag = event.target.tagName.toLowerCase();
  if (tag === "textarea" || tag === "input") return;
  const key = event.key.toLowerCase();
  if (key === "a") selectedPreferred = "after";
  else if (key === "b") selectedPreferred = "before";
  else if (key === "t") selectedPreferred = "tie";
  else if (key === "r") $("visualRegression").checked = !$("visualRegression").checked;
  else if (key === "c") $("accessibilityConcern").checked = !$("accessibilityConcern").checked;
  else if (key === "n") moveTask(1);
  else if (key === "p") moveTask(-1);
  else if (key === "s" || ((event.ctrlKey || event.metaKey) && key === "s")) { event.preventDefault(); saveLabel(); }
  else return;
  document.querySelectorAll("[data-pref]").forEach(btn => btn.classList.toggle("selected", btn.dataset.pref === selectedPreferred));
});
loadState().catch(err => setStatus(err.message));
</script>
</body>
</html>
"""


if __name__ == "__main__":
    raise SystemExit(main())
