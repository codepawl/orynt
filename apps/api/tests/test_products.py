"""Tests for /api/v1/products."""

from __future__ import annotations

from fastapi.testclient import TestClient

from tests.conftest import FakeProductStatsRepo


def test_list_products_returns_two_seeded(client: TestClient) -> None:
    response = client.get("/api/v1/products")
    assert response.status_code == 200
    body = response.json()
    assert len(body["products"]) == 2
    assert body["products"][0]["slug"] == "openpawl"


def test_get_product_by_slug(client: TestClient) -> None:
    response = client.get("/api/v1/products/openpawl")
    assert response.status_code == 200
    assert response.json()["name"] == "OpenPawl"


def test_get_unknown_product_returns_404(client: TestClient) -> None:
    response = client.get("/api/v1/products/unknown")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"


def test_get_product_stats_404_without_row(client: TestClient) -> None:
    response = client.get("/api/v1/products/openpawl/stats")
    assert response.status_code == 404


def test_get_product_stats_returns_synced_row(
    client: TestClient, product_stats_repo: FakeProductStatsRepo
) -> None:
    product_stats_repo.upsert(
        product_id="openpawl",
        payload={
            "stars": 4200,
            "forks": 320,
            "open_issues": 27,
            "last_release_tag": "v0.4.1",
            "last_release_at": "2026-05-10T08:30:00+00:00",
            "synced_at": "2026-05-19T03:00:00+00:00",
        },
    )
    response = client.get("/api/v1/products/openpawl/stats")
    assert response.status_code == 200
    body = response.json()
    assert body["stars"] == 4200
    assert body["last_release_tag"] == "v0.4.1"
