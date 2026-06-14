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
            ui_metrics = extract_ui_metrics(page)

            metrics = build_render_metrics(
                input_path=input_path,
                output_dir=output_dir,
                viewport_width=config.viewport_width,
                viewport_height=config.viewport_height,
                screenshot_path=screenshot_path,
                dom_node_count=count_dom_nodes(dom),
                body_text_length=extract_body_text_length(page),
                overflow=overflow,
                ui_metrics=ui_metrics,
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


def extract_ui_metrics(page: Page) -> dict[str, Any]:
    return page.evaluate(
        """
        () => {
          const round = (value, places = 4) => {
            const scale = Math.pow(10, places);
            return Math.round(value * scale) / scale;
          };

          const textSnippet = (element) => (
            element.innerText || element.textContent || ""
          ).replace(/\\s+/g, " ").trim().slice(0, 80);

          const directText = (element) => Array.from(element.childNodes)
            .filter((node) => node.nodeType === Node.TEXT_NODE)
            .map((node) => node.textContent || "")
            .join(" ")
            .replace(/\\s+/g, " ")
            .trim();

          const isVisible = (element) => {
            const style = window.getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return style.display !== "none"
              && style.visibility !== "hidden"
              && Number(style.opacity || "1") > 0
              && rect.width > 0
              && rect.height > 0;
          };

          const parseRgb = (value) => {
            if (!value || value === "transparent") {
              return null;
            }
            const match = value.match(/rgba?\\(([^)]+)\\)/);
            if (!match) {
              return null;
            }
            const parts = match[1].split(",").map((part) => part.trim());
            const alpha = parts.length >= 4 ? Number(parts[3]) : 1;
            if (!Number.isFinite(alpha) || alpha <= 0) {
              return null;
            }
            const rgb = parts.slice(0, 3).map((part) => Number.parseFloat(part));
            if (rgb.some((part) => !Number.isFinite(part))) {
              return null;
            }
            return {
              r: Math.max(0, Math.min(255, Math.round(rgb[0]))),
              g: Math.max(0, Math.min(255, Math.round(rgb[1]))),
              b: Math.max(0, Math.min(255, Math.round(rgb[2]))),
              a: Math.max(0, Math.min(1, alpha))
            };
          };

          const composite = (foreground, background) => ({
            r: Math.round(foreground.r * foreground.a + background.r * (1 - foreground.a)),
            g: Math.round(foreground.g * foreground.a + background.g * (1 - foreground.a)),
            b: Math.round(foreground.b * foreground.a + background.b * (1 - foreground.a))
          });

          const effectiveBackground = (element) => {
            let current = element;
            let color = { r: 255, g: 255, b: 255 };
            while (current && current.nodeType === Node.ELEMENT_NODE) {
              const parsed = parseRgb(window.getComputedStyle(current).backgroundColor);
              if (parsed) {
                color = parsed.a < 1 ? composite(parsed, color) : parsed;
                if (parsed.a >= 1) {
                  return color;
                }
              }
              current = current.parentElement;
            }
            return color;
          };

          const luminance = (color) => {
            const channel = (value) => {
              const normalized = value / 255;
              return normalized <= 0.03928
                ? normalized / 12.92
                : Math.pow((normalized + 0.055) / 1.055, 2.4);
            };
            return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b);
          };

          const contrastRatio = (foreground, background) => {
            const lighter = Math.max(luminance(foreground), luminance(background));
            const darker = Math.min(luminance(foreground), luminance(background));
            return (lighter + 0.05) / (darker + 0.05);
          };

          const selectorFor = (element) => {
            if (element.id) {
              return `${element.tagName.toLowerCase()}#${CSS.escape(element.id)}`;
            }
            const classes = typeof element.className === "string"
              ? element.className.trim().split(/\\s+/).filter(Boolean).slice(0, 3)
              : [];
            if (classes.length > 0) {
              return `${element.tagName.toLowerCase()}.${classes.map((name) => CSS.escape(name)).join(".")}`;
            }
            let index = 1;
            let sibling = element.previousElementSibling;
            while (sibling) {
              if (sibling.tagName === element.tagName) {
                index += 1;
              }
              sibling = sibling.previousElementSibling;
            }
            return `${element.tagName.toLowerCase()}:nth-of-type(${index})`;
          };

          const elements = Array.from(document.body ? document.body.querySelectorAll("*") : []);
          const textElements = elements.filter((element) => {
            if (["SCRIPT", "STYLE", "NOSCRIPT", "SVG", "PATH"].includes(element.tagName)) {
              return false;
            }
            if (!isVisible(element)) {
              return false;
            }
            const text = textSnippet(element);
            if (!text) {
              return false;
            }
            const tag = element.tagName.toLowerCase();
            return directText(element) || ["a", "button", "label", "input", "textarea", "select"].includes(tag);
          });

          const contrastChecks = [];
          const fontSizes = [];
          let headingCount = 0;
          let ctaLikeElementCount = 0;

          for (const element of textElements) {
            const style = window.getComputedStyle(element);
            const foreground = parseRgb(style.color);
            const background = effectiveBackground(element);
            const fontSize = Number.parseFloat(style.fontSize);
            const fontWeight = Number.parseInt(style.fontWeight, 10) || 400;
            const tag = element.tagName.toLowerCase();
            const text = textSnippet(element);

            if (Number.isFinite(fontSize) && fontSize > 0) {
              fontSizes.push(fontSize);
            }
            if (/^h[1-6]$/.test(tag) || element.getAttribute("role") === "heading") {
              headingCount += 1;
            }
            if (
              tag === "button"
              || element.getAttribute("role") === "button"
              || (tag === "a" && (
                /button|btn|cta|primary|secondary|action/i.test(element.className || "")
                || /start|view|buy|sign|try|get|contact|review/i.test(text)
              ))
            ) {
              ctaLikeElementCount += 1;
            }

            if (foreground && background) {
              const ratio = contrastRatio(foreground, background);
              const isLarge = fontSize >= 24 || (fontSize >= 18.66 && fontWeight >= 700);
              const threshold = isLarge ? 3.0 : 4.5;
              contrastChecks.push({
                selector: selectorFor(element),
                tag,
                text_snippet: text,
                ratio,
                threshold
              });
            }
          }

          const ratios = contrastChecks.map((check) => check.ratio);
          const contrastIssues = contrastChecks
            .filter((check) => check.ratio < check.threshold)
            .slice(0, 12)
            .map((check) => ({
              selector: check.selector,
              tag: check.tag,
              text_snippet: check.text_snippet,
              ratio: round(check.ratio, 2),
              threshold: check.threshold
            }));

          const visibleElements = elements.filter(isVisible);
          const areas = visibleElements
            .map((element) => {
              const rect = element.getBoundingClientRect();
              return Math.max(0, rect.width) * Math.max(0, rect.height);
            })
            .filter((area) => area > 0)
            .sort((a, b) => a - b);
          const totalArea = areas.reduce((sum, area) => sum + area, 0);
          const medianArea = areas.length === 0
            ? 0
            : areas[Math.floor((areas.length - 1) / 2)];

          const root = document.documentElement;
          const viewportWidth = window.innerWidth || root.clientWidth;
          const viewportHeight = window.innerHeight || root.clientHeight;
          const maxRight = visibleElements.reduce((max, element) => {
            const rect = element.getBoundingClientRect();
            return Math.max(max, rect.right);
          }, 0);
          const horizontalOverflowPx = Math.max(0, root.scrollWidth - root.clientWidth);
          const maxRightOverflowPx = Math.max(0, maxRight - viewportWidth);
          const maxFontSize = fontSizes.length ? Math.max(...fontSizes) : 0;
          const minFontSize = fontSizes.length ? Math.min(...fontSizes) : 0;
          const fontSizeRatio = minFontSize > 0 ? maxFontSize / minFontSize : 0;
          const hierarchyWarnings = [
            headingCount === 0 && textElements.length > 0,
            ctaLikeElementCount === 0 && textElements.length > 0,
            fontSizeRatio > 0 && fontSizeRatio < 1.4,
            fontSizeRatio > 8
          ].filter(Boolean).length;

          return {
            contrast_issue_count: contrastChecks.filter((check) => check.ratio < check.threshold).length,
            min_contrast_ratio: ratios.length ? round(Math.min(...ratios), 2) : 0,
            average_contrast_ratio: ratios.length
              ? round(ratios.reduce((sum, ratio) => sum + ratio, 0) / ratios.length, 2)
              : 0,
            contrast_checked_text_node_count: contrastChecks.length,
            contrast_issues: contrastIssues,
            max_font_size: round(maxFontSize, 2),
            min_font_size: round(minFontSize, 2),
            font_size_ratio: round(fontSizeRatio, 4),
            heading_count: headingCount,
            cta_like_element_count: ctaLikeElementCount,
            hierarchy_warning_count: hierarchyWarnings,
            visible_element_count: visibleElements.length,
            average_element_area: areas.length ? round(totalArea / areas.length, 2) : 0,
            median_element_area: round(medianArea, 2),
            viewport_fill_ratio: viewportWidth > 0 && viewportHeight > 0
              ? round(Math.min(1, totalArea / (viewportWidth * viewportHeight)), 4)
              : 0,
            horizontal_overflow_px: round(horizontalOverflowPx, 2),
            vertical_scroll_height: round(root.scrollHeight, 2),
            max_right_overflow_px: round(maxRightOverflowPx, 2)
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
