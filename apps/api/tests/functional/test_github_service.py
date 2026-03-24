import httpx
import pytest
import respx

from app.services.github import GitHubService, RepoNotFoundError
from tests.conftest import MOCK_REPO_JSON, MOCK_RELEASE_JSON, MOCK_COMMITS_JSON

BASE = "https://api.github.com"


@respx.mock
async def test_get_repo_stats_success(github_service):
    respx.get(f"{BASE}/repos/nxank4/loclean").mock(
        return_value=httpx.Response(200, json=MOCK_REPO_JSON)
    )
    respx.get(f"{BASE}/repos/nxank4/loclean/releases/latest").mock(
        return_value=httpx.Response(200, json=MOCK_RELEASE_JSON)
    )
    respx.get(f"{BASE}/repos/nxank4/loclean/commits").mock(
        return_value=httpx.Response(200, json=MOCK_COMMITS_JSON)
    )

    stats = await github_service.get_repo_stats("nxank4", "loclean")

    assert stats.repo == "loclean"
    assert stats.owner == "nxank4"
    assert stats.stars == 42
    assert stats.forks == 5
    assert stats.open_issues == 3
    assert stats.description == "A test repo"
    assert stats.language == "Python"
    assert stats.latest_release == "v1.0.0"
    assert stats.latest_release_date == "2025-01-15T10:00:00Z"
    assert stats.last_commit_date == "2025-03-20T12:00:00Z"
    assert stats.last_commit_message == "fix: something important"


@respx.mock
async def test_repo_not_found(github_service):
    respx.get(f"{BASE}/repos/nxank4/fake").mock(
        return_value=httpx.Response(404)
    )
    respx.get(f"{BASE}/repos/nxank4/fake/releases/latest").mock(
        return_value=httpx.Response(404)
    )
    respx.get(f"{BASE}/repos/nxank4/fake/commits").mock(
        return_value=httpx.Response(404)
    )

    with pytest.raises(RepoNotFoundError):
        await github_service.get_repo_stats("nxank4", "fake")


@respx.mock
async def test_no_releases(github_service):
    respx.get(f"{BASE}/repos/nxank4/loclean").mock(
        return_value=httpx.Response(200, json=MOCK_REPO_JSON)
    )
    respx.get(f"{BASE}/repos/nxank4/loclean/releases/latest").mock(
        return_value=httpx.Response(404)
    )
    respx.get(f"{BASE}/repos/nxank4/loclean/commits").mock(
        return_value=httpx.Response(200, json=MOCK_COMMITS_JSON)
    )

    stats = await github_service.get_repo_stats("nxank4", "loclean")

    assert stats.latest_release is None
    assert stats.latest_release_date is None
    assert stats.stars == 42


@respx.mock
async def test_no_commits(github_service):
    respx.get(f"{BASE}/repos/nxank4/loclean").mock(
        return_value=httpx.Response(200, json=MOCK_REPO_JSON)
    )
    respx.get(f"{BASE}/repos/nxank4/loclean/releases/latest").mock(
        return_value=httpx.Response(200, json=MOCK_RELEASE_JSON)
    )
    respx.get(f"{BASE}/repos/nxank4/loclean/commits").mock(
        return_value=httpx.Response(200, json=[])
    )

    stats = await github_service.get_repo_stats("nxank4", "loclean")

    assert stats.last_commit_date is None
    assert stats.last_commit_message is None


@respx.mock
async def test_network_timeout(github_service):
    respx.get(f"{BASE}/repos/nxank4/loclean").mock(
        side_effect=httpx.ConnectTimeout("timeout")
    )
    respx.get(f"{BASE}/repos/nxank4/loclean/releases/latest").mock(
        return_value=httpx.Response(200, json=MOCK_RELEASE_JSON)
    )
    respx.get(f"{BASE}/repos/nxank4/loclean/commits").mock(
        return_value=httpx.Response(200, json=MOCK_COMMITS_JSON)
    )

    with pytest.raises(httpx.ConnectTimeout):
        await github_service.get_repo_stats("nxank4", "loclean")


@respx.mock
async def test_partial_failure_release_error(github_service):
    respx.get(f"{BASE}/repos/nxank4/loclean").mock(
        return_value=httpx.Response(200, json=MOCK_REPO_JSON)
    )
    respx.get(f"{BASE}/repos/nxank4/loclean/releases/latest").mock(
        side_effect=httpx.ConnectError("connection failed")
    )
    respx.get(f"{BASE}/repos/nxank4/loclean/commits").mock(
        return_value=httpx.Response(200, json=MOCK_COMMITS_JSON)
    )

    stats = await github_service.get_repo_stats("nxank4", "loclean")

    assert stats.stars == 42
    assert stats.latest_release is None
    assert stats.last_commit_message == "fix: something important"
