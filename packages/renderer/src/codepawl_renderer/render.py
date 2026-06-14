"""Playwright-backed local HTML rendering."""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from codepawl_metrics import build_render_metrics
from playwright.sync_api import Error as PlaywrightError
from playwright.sync_api import Page, sync_playwright


@dataclass(frozen=True)
class RenderConfig:
    input_path: Path
    output_dir: Path
    viewport_width: int = 1440
    viewport_height: int = 900


@dataclass(frozen=True)
class RenderResult:
    output_dir: Path
    screenshot_path: Path
    dom_path: Path
    accessibility_path: Path
    metrics_path: Path


def render_html_file(config: RenderConfig) -> RenderResult:
    input_path = _validate_input_path(config.input_path)
    output_dir = config.output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    _prefer_repo_local_playwright_browsers()

    screenshot_path = output_dir / "screenshot.png"
    dom_path = output_dir / "dom.json"
    accessibility_path = output_dir / "accessibility.json"
    metrics_path = output_dir / "metrics.json"

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            headless=True,
            chromium_sandbox=False,
            args=[
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-gpu",
            ],
        )
        context = None
        try:
            context = browser.new_context(
                viewport={
                    "width": config.viewport_width,
                    "height": config.viewport_height,
                },
                device_scale_factor=1,
                java_script_enabled=True,
            )
            context.route("http://*/*", lambda route: route.abort())
            context.route("https://*/*", lambda route: route.abort())
            page = context.new_page()
            page.goto(input_path.as_uri(), wait_until="load")

            capture_screenshot(page, screenshot_path)
            dom = extract_dom_snapshot(page)
            accessibility = extract_accessibility_snapshot(page)
            overflow = extract_overflow_metrics(page)

            metrics = build_render_metrics(
                input_path=input_path,
                output_dir=output_dir,
                viewport_width=config.viewport_width,
                viewport_height=config.viewport_height,
                screenshot_path=screenshot_path,
                dom_node_count=count_dom_nodes(dom),
                body_text_length=extract_body_text_length(page),
                overflow=overflow,
            )
        finally:
            try:
                if context is not None:
                    context.close()
            finally:
                browser.close()

    write_json(dom_path, dom)
    write_json(accessibility_path, accessibility)
    write_json(metrics_path, metrics)

    return RenderResult(
        output_dir=output_dir,
        screenshot_path=screenshot_path,
        dom_path=dom_path,
        accessibility_path=accessibility_path,
        metrics_path=metrics_path,
    )


def _validate_input_path(input_path: Path) -> Path:
    resolved = input_path.expanduser().resolve()

    if not resolved.exists():
        raise ValueError(f"input file does not exist: {input_path}")
    if not resolved.is_file():
        raise ValueError(f"input path is not a file: {input_path}")
    if resolved.suffix.lower() != ".html":
        raise ValueError(f"input file must use the .html extension: {input_path}")

    return resolved


def _prefer_repo_local_playwright_browsers() -> None:
    local_browser_dir = Path.cwd() / ".playwright"
    if local_browser_dir.exists() and "PLAYWRIGHT_BROWSERS_PATH" not in os.environ:
        os.environ["PLAYWRIGHT_BROWSERS_PATH"] = str(local_browser_dir)


def extract_dom_snapshot(page: Page) -> dict[str, Any]:
    return page.evaluate(
        """
        () => {
          const textSnippet = (node) => {
            const text = (node.innerText || node.textContent || "").replace(/\\s+/g, " ").trim();
            return text.slice(0, 160);
          };

          const serializeElement = (element) => {
            const rect = element.getBoundingClientRect();
            return {
              tag_name: element.tagName.toLowerCase(),
              text_snippet: textSnippet(element),
              id: element.id || "",
              class: element.className && typeof element.className === "string"
                ? element.className
                : "",
              bounding_box: {
                x: Math.round(rect.x * 100) / 100,
                y: Math.round(rect.y * 100) / 100,
                width: Math.round(rect.width * 100) / 100,
                height: Math.round(rect.height * 100) / 100
              },
              children: Array.from(element.children).map(serializeElement)
            };
          };

          return serializeElement(document.documentElement);
        }
        """
    )


def capture_screenshot(page: Page, screenshot_path: Path) -> None:
    last_error: PlaywrightError | None = None
    for _ in range(3):
        try:
            page.screenshot(path=screenshot_path, full_page=True)
            return
        except PlaywrightError as exc:
            last_error = exc
            page.wait_for_timeout(100)

    if last_error is not None:
        raise last_error


def extract_accessibility_snapshot(page: Page) -> dict[str, Any]:
    try:
        session = page.context.new_cdp_session(page)
        snapshot = session.send("Accessibility.getFullAXTree")
    except Exception as exc:
        return {
            "supported": False,
            "reason": f"Chromium accessibility snapshot failed: {exc}",
        }

    return {
        "supported": True,
        "snapshot": snapshot,
    }


def extract_overflow_metrics(page: Page) -> dict[str, bool]:
    return page.evaluate(
        """
        () => {
          const root = document.documentElement;
          return {
            has_horizontal_overflow: root.scrollWidth > root.clientWidth,
            has_vertical_overflow: root.scrollHeight > root.clientHeight
          };
        }
        """
    )


def extract_body_text_length(page: Page) -> int:
    return page.evaluate(
        """
        () => (document.body && document.body.innerText
          ? document.body.innerText.replace(/\\s+/g, " ").trim().length
          : 0)
        """
    )


def count_dom_nodes(node: dict[str, Any]) -> int:
    children = node.get("children", [])
    return 1 + sum(count_dom_nodes(child) for child in children)


def write_json(path: Path, payload: Any) -> None:
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
