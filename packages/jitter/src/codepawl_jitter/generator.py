"""Deterministic CSS jitter generation for local HTML fixtures."""

from __future__ import annotations

import json
import random
import shutil
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class JitterConfig:
    input_path: Path
    output_dir: Path
    seed: int
    public_output_dir: Path | None = None


@dataclass(frozen=True)
class JitterVariant:
    variant_name: str
    defect_type: str
    severity: str
    html_path: Path
    screenshot_path: Path
    expected_issue: str
    expected_fix_instruction: str


@dataclass(frozen=True)
class JitterResult:
    output_dir: Path
    original_dir: Path
    jittered_dir: Path
    original_html_path: Path
    labels_path: Path
    variants: list[JitterVariant]


def generate_jitter_pair_files(config: JitterConfig) -> JitterResult:
    source_path = validate_html_input(config.input_path)
    output_dir = config.output_dir.resolve()
    public_output_dir = (
        config.public_output_dir.resolve()
        if config.public_output_dir is not None
        else output_dir
    )
    original_dir = output_dir / "original"
    jittered_dir = output_dir / "jittered"
    original_dir.mkdir(parents=True, exist_ok=True)
    jittered_dir.mkdir(parents=True, exist_ok=True)

    source_html = source_path.read_text(encoding="utf-8")
    original_html_path = original_dir / "index.html"
    shutil.copyfile(source_path, original_html_path)

    variants = _build_variants(source_html, source_path, jittered_dir, config.seed)
    labels = build_labels(
        source_path=source_path,
        seed=config.seed,
        variants=variants,
        public_output_dir=public_output_dir,
    )
    labels_path = output_dir / "labels.json"
    write_json(labels_path, labels)

    return JitterResult(
        output_dir=output_dir,
        original_dir=original_dir,
        jittered_dir=jittered_dir,
        original_html_path=original_html_path,
        labels_path=labels_path,
        variants=variants,
    )


def validate_html_input(input_path: Path) -> Path:
    resolved = input_path.expanduser().resolve()

    if not resolved.exists():
        raise ValueError(f"input file does not exist: {input_path}")
    if not resolved.is_file():
        raise ValueError(f"input path is not a file: {input_path}")
    if resolved.suffix.lower() != ".html":
        raise ValueError(f"input file must use the .html extension: {input_path}")

    return resolved


def build_labels(
    *,
    source_path: Path,
    seed: int,
    variants: list[JitterVariant],
    public_output_dir: Path,
) -> dict[str, Any]:
    return {
        "source_input_path": str(source_path),
        "seed": seed,
        "generated_at": _stable_generated_at(seed),
        "variants": [
            {
                "variant_name": variant.variant_name,
                "defect_type": variant.defect_type,
                "severity": variant.severity,
                "html_path": str(public_output_dir / "jittered" / f"{variant.variant_name}.html"),
                "screenshot_path": str(
                    public_output_dir / "jittered" / f"{variant.variant_name}.png"
                ),
                "expected_issue": variant.expected_issue,
                "expected_fix_instruction": variant.expected_fix_instruction,
            }
            for variant in variants
        ],
    }


def write_json(path: Path, payload: Any) -> None:
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def _build_variants(
    source_html: str,
    source_path: Path,
    jittered_dir: Path,
    seed: int,
) -> list[JitterVariant]:
    rng = random.Random(seed)
    variant_specs = [
        (
            "spacing_bad",
            "spacing",
            _spacing_css(rng),
            "Spacing is compressed and inconsistent, making content harder to scan.",
            "Restore consistent padding, margins, gaps, and comfortable line-height.",
        ),
        (
            "contrast_bad",
            "contrast",
            _contrast_css(rng),
            "Text and calls to action have weakened contrast against their backgrounds.",
            "Use accessible foreground/background color pairs and restore CTA contrast.",
        ),
        (
            "alignment_bad",
            "alignment",
            _alignment_css(rng),
            "Key layout blocks are misaligned and text alignment is inconsistent.",
            "Realign sections to a consistent grid and restore predictable text alignment.",
        ),
        (
            "hierarchy_bad",
            "hierarchy",
            _hierarchy_css(rng),
            "Heading and CTA prominence is flattened, reducing visual hierarchy.",
            "Rebuild heading scale, font-weight contrast, and primary action prominence.",
        ),
    ]

    variants: list[JitterVariant] = []
    for variant_name, defect_type, css, issue, fix in variant_specs:
        html_path = jittered_dir / f"{variant_name}.html"
        screenshot_path = jittered_dir / f"{variant_name}.png"
        html_path.write_text(
            inject_jitter_style(
                source_html,
                css=css,
                source_name=source_path.name,
                variant_name=variant_name,
                seed=seed,
            ),
            encoding="utf-8",
        )
        variants.append(
            JitterVariant(
                variant_name=variant_name,
                defect_type=defect_type,
                severity="medium",
                html_path=html_path,
                screenshot_path=screenshot_path,
                expected_issue=issue,
                expected_fix_instruction=fix,
            )
        )

    return variants


def inject_jitter_style(source_html: str, *, css: str, source_name: str, variant_name: str, seed: int) -> str:
    style_block = (
        "\n"
        f"    <!-- CodePawl jitter: {variant_name} from {source_name}, seed {seed} -->\n"
        "    <style data-codepawl-jitter=\"true\">\n"
        f"{css.rstrip()}\n"
        "    </style>\n"
    )
    lower_html = source_html.lower()
    head_close_index = lower_html.find("</head>")

    if head_close_index != -1:
        return source_html[:head_close_index] + style_block + source_html[head_close_index:]

    return style_block + source_html


def _spacing_css(rng: random.Random) -> str:
    padding = rng.choice([3, 4, 5, 6])
    margin = rng.choice([0, 2, 4])
    gap = rng.choice([1, 2, 3])
    line_height = rng.choice(["0.86", "0.9", "0.94"])
    return f"""
      :root body main {{
        padding: {padding}px !important;
      }}

      :root body * {{
        margin-top: {margin}px !important;
        margin-bottom: {margin}px !important;
        line-height: {line_height} !important;
      }}

      :root body .hero,
      :root body .actions {{
        gap: {gap}px !important;
      }}

      :root body .panel {{
        padding: {padding}px !important;
      }}
    """


def _contrast_css(rng: random.Random) -> str:
    foreground = rng.choice(["#9ca3af", "#a5adb8", "#b0b7c3"])
    muted = rng.choice(["#c2c8d0", "#c8ced6", "#d0d5dc"])
    button = rng.choice(["#b8c0ca", "#c0c6cf", "#c7ccd4"])
    return f"""
      :root body {{
        color: {foreground} !important;
        background: #f7f8fb !important;
      }}

      :root body p,
      :root body span,
      :root body .lede,
      :root body .metric span {{
        color: {muted} !important;
      }}

      :root body .button.primary {{
        color: #eef1f5 !important;
        background: {button} !important;
      }}
    """


def _alignment_css(rng: random.Random) -> str:
    shift = rng.choice([18, 24, 32])
    panel_shift = rng.choice([-22, -16, 20])
    return f"""
      :root body .hero {{
        align-items: start !important;
        transform: translateX({shift}px) !important;
      }}

      :root body h1,
      :root body .lede {{
        text-align: right !important;
      }}

      :root body .actions {{
        justify-content: flex-end !important;
        transform: translateX(-{shift // 2}px) !important;
      }}

      :root body .panel {{
        transform: translateY({panel_shift}px) !important;
      }}
    """


def _hierarchy_css(rng: random.Random) -> str:
    heading_size = rng.choice(["1.18rem", "1.24rem", "1.3rem"])
    button_weight = rng.choice([400, 500])
    return f"""
      :root body h1 {{
        font-size: {heading_size} !important;
        line-height: 1.35 !important;
        font-weight: 500 !important;
      }}

      :root body .eyebrow,
      :root body .lede,
      :root body .button,
      :root body .metric strong {{
        font-size: 1rem !important;
        font-weight: {button_weight} !important;
      }}

      :root body .button.primary {{
        background: #eef1f5 !important;
        color: #4b5563 !important;
        border: 1px solid #d5dbe3 !important;
      }}
    """


def _stable_generated_at(seed: int) -> str:
    timestamp = datetime.fromtimestamp(max(seed, 0), tz=timezone.utc)
    return timestamp.isoformat().replace("+00:00", "Z")
