"""Tests for the admin surface."""

import respx
from fastapi.testclient import TestClient
from httpx import Response


def test_sync_stats_requires_admin_key(client: TestClient) -> None:
    response = client.post("/api/v1/admin/products/sync-stats", json=None)
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "unauthorized"


@respx.mock
def test_sync_stats_with_admin_key_runs_job(client: TestClient) -> None:
    respx.get("https://api.github.com/repos/codepawl/openpawl").mock(
        return_value=Response(
            200, json={"stargazers_count": 5, "forks_count": 1, "open_issues_count": 0}
        )
    )
    respx.get("https://api.github.com/repos/codepawl/openpawl/releases/latest").mock(
        return_value=Response(404, json={})
    )
    respx.get("https://api.github.com/repos/codepawl/featcat").mock(
        return_value=Response(
            200, json={"stargazers_count": 2, "forks_count": 0, "open_issues_count": 0}
        )
    )
    respx.get("https://api.github.com/repos/codepawl/featcat/releases/latest").mock(
        return_value=Response(404, json={})
    )

    response = client.post(
        "/api/v1/admin/products/sync-stats",
        json={"product_ids": ["openpawl", "featcat"]},
        headers={"X-Admin-Key": "test-admin"},
    )
    assert response.status_code == 202
    body = response.json()
    assert body["status"] == "queued"
    assert body["tally"]["ok"] == 2
