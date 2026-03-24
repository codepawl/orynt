import httpx
import respx

from tests.conftest import MOCK_REPO_JSON, MOCK_RELEASE_JSON, MOCK_COMMITS_JSON

BASE = "https://api.github.com"


async def test_health(client):
    resp = await client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


@respx.mock
async def test_stats_success(client):
    respx.get(f"{BASE}/repos/nxank4/loclean").mock(
        return_value=httpx.Response(200, json=MOCK_REPO_JSON)
    )
    respx.get(f"{BASE}/repos/nxank4/loclean/releases/latest").mock(
        return_value=httpx.Response(200, json=MOCK_RELEASE_JSON)
    )
    respx.get(f"{BASE}/repos/nxank4/loclean/commits").mock(
        return_value=httpx.Response(200, json=MOCK_COMMITS_JSON)
    )

    resp = await client.get("/stats/nxank4/loclean")

    assert resp.status_code == 200
    data = resp.json()
    assert data["repo"] == "loclean"
    assert data["owner"] == "nxank4"
    assert data["stars"] == 42
    assert data["forks"] == 5
    assert data["latest_release"] == "v1.0.0"
    assert "fetched_at" in data


@respx.mock
async def test_stats_not_found(client):
    respx.get(f"{BASE}/repos/nxank4/fake").mock(
        return_value=httpx.Response(404)
    )
    respx.get(f"{BASE}/repos/nxank4/fake/releases/latest").mock(
        return_value=httpx.Response(404)
    )
    respx.get(f"{BASE}/repos/nxank4/fake/commits").mock(
        return_value=httpx.Response(404)
    )

    resp = await client.get("/stats/nxank4/fake")

    assert resp.status_code == 404
    assert "not found" in resp.json()["detail"].lower()


@respx.mock
async def test_stats_rate_limited(client):
    from datetime import datetime, timezone
    future_ts = str(int(datetime.now(timezone.utc).timestamp()) + 300)

    respx.get(f"{BASE}/repos/nxank4/loclean").mock(
        return_value=httpx.Response(
            403,
            headers={
                "x-ratelimit-remaining": "0",
                "x-ratelimit-reset": future_ts,
            },
        )
    )
    respx.get(f"{BASE}/repos/nxank4/loclean/releases/latest").mock(
        return_value=httpx.Response(200, json=MOCK_RELEASE_JSON)
    )
    respx.get(f"{BASE}/repos/nxank4/loclean/commits").mock(
        return_value=httpx.Response(200, json=MOCK_COMMITS_JSON)
    )

    resp = await client.get("/stats/nxank4/loclean")

    assert resp.status_code == 429
    assert "retry-after" in resp.headers


@respx.mock
async def test_stats_github_down(client):
    respx.get(f"{BASE}/repos/nxank4/loclean").mock(
        side_effect=httpx.ConnectError("connection refused")
    )
    respx.get(f"{BASE}/repos/nxank4/loclean/releases/latest").mock(
        side_effect=httpx.ConnectError("connection refused")
    )
    respx.get(f"{BASE}/repos/nxank4/loclean/commits").mock(
        side_effect=httpx.ConnectError("connection refused")
    )

    resp = await client.get("/stats/nxank4/loclean")

    assert resp.status_code == 502
