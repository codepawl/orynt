from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
BEAUTIFUL_UI_V0 = ROOT / "examples" / "beautiful_ui_v0"


def test_beautiful_ui_v0_example_pack_exists() -> None:
    assert BEAUTIFUL_UI_V0.is_dir()
    assert (BEAUTIFUL_UI_V0 / "README.md").is_file()


def test_beautiful_ui_v0_has_exactly_forty_html_examples() -> None:
    assert len(list(BEAUTIFUL_UI_V0.glob("*.html"))) == 40


def test_beautiful_ui_v0_examples_are_standalone_static_html() -> None:
    forbidden = ("http://", "https://", "<script", "<img", "<link", "@import", "url(")
    for path in sorted(BEAUTIFUL_UI_V0.glob("*.html")):
        html = path.read_text(encoding="utf-8").lower()
        assert "<!doctype html>" in html
        assert "<html" in html
        assert "<head>" in html or "<head " in html
        assert "<body>" in html or "<body " in html
        assert "<main" in html
        assert "<style>" in html
        assert "</html>" in html
        for token in forbidden:
            assert token not in html, f"{path.name} contains forbidden token {token}"
