from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_key_directories_exist() -> None:
    expected_dirs = [
        "apps/site",
        "apps/design",
        "apps/harness",
        "packages/renderer/src/codepawl_renderer",
        "packages/metrics/src/codepawl_metrics",
        "packages/jitter/src/codepawl_jitter",
        "packages/generators/src/codepawl_generators",
        "packages/pawl_jepa/src/pawl_jepa",
        "packages/pawlbench_design/src/pawlbench_design",
        "experiments/001_render_baseline",
        "experiments/002_jitter_pairs",
        "experiments/003_encoder_baselines",
        "experiments/004_pawl_jepa_microtrain",
        "reports",
        "docs",
        "references",
        "references/style_notes",
        "examples",
        "artifacts",
    ]

    missing = [path for path in expected_dirs if not (ROOT / path).is_dir()]

    assert missing == []


def test_key_files_exist() -> None:
    expected_files = [
        "README.md",
        "pyproject.toml",
        ".gitignore",
        ".python-version",
        "reports/PAWL_JEPA_PLAN.md",
        "reports/PAWLBENCH_DESIGN.md",
        "reports/EXPERIMENT_LOG.md",
        "docs/DATA_POLICY.md",
        "docs/REFERENCES_POLICY.md",
        "docs/STYLE_TAXONOMY.md",
        "references/README.md",
        "references/style_notes/apple.md",
        "references/style_notes/claude.md",
        "references/style_notes/linear.md",
        "references/style_notes/vercel.md",
        "references/style_notes/stripe.md",
        "references/style_notes/behance.md",
        "examples/simple_landing.html",
        "examples/simple_dashboard.html",
        "artifacts/.gitkeep",
    ]

    missing = [path for path in expected_files if not (ROOT / path).is_file()]

    assert missing == []


def test_readme_points_to_next_render_command() -> None:
    readme = (ROOT / "README.md").read_text(encoding="utf-8")

    assert (
        "uv run codepawl-render examples/simple_landing.html --out artifacts/render_baseline"
        in readme
    )
