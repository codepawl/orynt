import httpx
import respx
from unittest.mock import patch

from tests.conftest import MOCK_REPO_JSON, MOCK_RELEASE_JSON, MOCK_COMMITS_JSON

BASE = "https://api.github.com"


def _mock_github_routes():
    respx.get(f"{BASE}/repos/nxank4/loclean").mock(
        return_value=httpx.Response(200, json=MOCK_REPO_JSON)
    )
    respx.get(f"{BASE}/repos/nxank4/loclean/releases/latest").mock(
        return_value=httpx.Response(200, json=MOCK_RELEASE_JSON)
    )
    respx.get(f"{BASE}/repos/nxank4/loclean/commits").mock(
        return_value=httpx.Response(200, json=MOCK_COMMITS_JSON)
    )


@respx.mock
async def test_cache_miss_then_hit(client):
    _mock_github_routes()

    resp1 = await client.get("/stats/nxank4/loclean")
    assert resp1.status_code == 200

    resp2 = await client.get("/stats/nxank4/loclean")
    assert resp2.status_code == 200

    # GitHub API should only be called once (3 routes × 1 call each)
    assert respx.calls.call_count == 3


@respx.mock
async def test_cache_expiry_refetch(client):
    _mock_github_routes()

    # First call — cache miss
    with patch("app.core.cache.time.monotonic", return_value=1000.0):
        resp1 = await client.get("/stats/nxank4/loclean")
    assert resp1.status_code == 200
    assert respx.calls.call_count == 3

    # Second call — cache expired (TTL default 3600s)
    with patch("app.core.cache.time.monotonic", return_value=5000.0):
        resp2 = await client.get("/stats/nxank4/loclean")
    assert resp2.status_code == 200
    assert respx.calls.call_count == 6  # 3 more calls after cache expiry
