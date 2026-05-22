"""Tests for the health router."""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.dependencies import get_supabase_client


class _FakeSupabaseOk:
    def table(self, _: str) -> _FakeSupabaseOk:
        return self

    def select(self, _: str) -> _FakeSupabaseOk:
        return self

    def limit(self, _: int) -> _FakeSupabaseOk:
        return self

    def execute(self) -> object:
        return object()


class _FakeSupabaseFail:
    def table(self, _: str) -> _FakeSupabaseFail:
        raise RuntimeError("db down")


def test_liveness(client: TestClient) -> None:
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["version"] == "0.1.0"


def test_readiness_returns_200_when_db_reachable(app: FastAPI, client: TestClient) -> None:
    app.dependency_overrides[get_supabase_client] = lambda: _FakeSupabaseOk()
    response = client.get("/health/ready")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ready"
    assert body["db"] == "ok"


def test_readiness_returns_503_when_db_errors(app: FastAPI, client: TestClient) -> None:
    app.dependency_overrides[get_supabase_client] = lambda: _FakeSupabaseFail()
    response = client.get("/health/ready")
    assert response.status_code == 503
    body = response.json()
    assert body["status"] == "not_ready"
    assert body["db"] == "error"
