from app.config import Settings


def test_default_values(monkeypatch):
    monkeypatch.delenv("CODEPAWL_GITHUB_TOKEN", raising=False)
    monkeypatch.delenv("CODEPAWL_CACHE_TTL_SECONDS", raising=False)
    monkeypatch.delenv("CODEPAWL_ALLOWED_ORIGINS", raising=False)

    s = Settings()
    assert s.github_token == ""
    assert s.cache_ttl_seconds == 3600
    assert "https://codepawl.com" in s.allowed_origins
    assert "http://localhost:3000" in s.allowed_origins


def test_env_override(monkeypatch):
    monkeypatch.setenv("CODEPAWL_GITHUB_TOKEN", "ghp_test123")
    monkeypatch.setenv("CODEPAWL_CACHE_TTL_SECONDS", "120")

    s = Settings()
    assert s.github_token == "ghp_test123"
    assert s.cache_ttl_seconds == 120
