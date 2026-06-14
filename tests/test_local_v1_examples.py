from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
LOCAL_V1 = ROOT / "examples" / "local_v1"
EXPECTED_FILES = {
    "landing_ai_saas.html",
    "landing_devtool.html",
    "landing_fintech.html",
    "landing_healthtech.html",
    "landing_education.html",
    "landing_creator_tool.html",
    "landing_data_platform.html",
    "landing_security.html",
    "landing_productivity.html",
    "landing_design_tool.html",
    "pricing_saas.html",
    "pricing_usage_based.html",
    "pricing_team_plan.html",
    "dashboard_analytics.html",
    "dashboard_finance.html",
    "dashboard_ops.html",
    "dashboard_security.html",
    "dashboard_creator.html",
    "dashboard_project.html",
    "dashboard_ai_agent.html",
    "docs_homepage.html",
    "docs_api_reference.html",
    "waitlist_minimal.html",
    "waitlist_premium.html",
    "portfolio_designer.html",
    "portfolio_engineer.html",
    "settings_account.html",
    "settings_billing.html",
    "onboarding_checklist.html",
    "app_empty_state.html",
}


def test_local_v1_example_pack_exists() -> None:
    assert LOCAL_V1.is_dir()
    assert (LOCAL_V1 / "README.md").is_file()


def test_local_v1_has_exactly_thirty_html_examples() -> None:
    html_files = {path.name for path in LOCAL_V1.glob("*.html")}

    assert len(html_files) == 30
    assert html_files == EXPECTED_FILES


def test_local_v1_examples_are_standalone_html_documents() -> None:
    for path in sorted(LOCAL_V1.glob("*.html")):
        html = path.read_text(encoding="utf-8").lower()

        assert "<!doctype html>" in html
        assert "<html" in html
        assert "<head>" in html or "<head " in html
        assert "<body>" in html or "<body " in html
        assert "<main" in html
        assert "<style>" in html
        assert "</html>" in html
        assert "http://" not in html
        assert "https://" not in html
        assert "<script" not in html
