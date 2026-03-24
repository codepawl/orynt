import pytest
import httpx

from app.config import Settings
from app.core.cache import TTLCache
from app.services.github import GitHubService
from app.main import app


MOCK_REPO_JSON = {
    "stargazers_count": 42,
    "forks_count": 5,
    "open_issues_count": 3,
    "description": "A test repo",
    "language": "Python",
}

MOCK_RELEASE_JSON = {
    "tag_name": "v1.0.0",
    "published_at": "2025-01-15T10:00:00Z",
}

MOCK_COMMITS_JSON = [
    {
        "commit": {
            "committer": {"date": "2025-03-20T12:00:00Z"},
            "message": "fix: something important\n\ndetailed description",
        }
    }
]


@pytest.fixture
def settings():
    return Settings(github_token="test-token", cache_ttl_seconds=60)


@pytest.fixture
def cache():
    return TTLCache(ttl_seconds=60)


@pytest.fixture
def github_service(settings):
    return GitHubService(settings)


@pytest.fixture
async def client():
    # Manually init app state since ASGITransport doesn't trigger lifespan
    test_settings = Settings(github_token="test-token", cache_ttl_seconds=3600)
    app.state.cache = TTLCache(ttl_seconds=test_settings.cache_ttl_seconds)
    app.state.github_service = GitHubService(test_settings)

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c

    app.state.cache.clear()
