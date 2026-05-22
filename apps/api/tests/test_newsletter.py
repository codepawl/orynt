"""Integration tests for newsletter subscribe → confirm flow."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.services.turnstile_service import DEV_TOKEN_ALWAYS_PASS
from tests.conftest import FakeSubscriberRepo

PENDING = "pending_confirmation"


def test_subscribe_inserts_pending_and_sends_email(
    client: TestClient, sent_emails: list[object]
) -> None:
    response = client.post(
        "/api/v1/newsletter/subscribe",
        json={
            "email": "ada@example.com",
            "source": "landing_footer",
            "turnstile_token": DEV_TOKEN_ALWAYS_PASS,
        },
    )
    assert response.status_code == 202
    assert response.json() == {"status": PENDING}
    assert len(sent_emails) == 1


def test_confirm_marks_confirmed(client: TestClient, subscriber_repo: FakeSubscriberRepo) -> None:
    client.post(
        "/api/v1/newsletter/subscribe",
        json={
            "email": "ada@example.com",
            "source": "landing_footer",
            "turnstile_token": DEV_TOKEN_ALWAYS_PASS,
        },
    )
    token = next(iter(subscriber_repo.rows.values()))["confirm_token"]
    confirm = client.get(f"/api/v1/newsletter/confirm?token={token}")
    assert confirm.status_code == 200
    body = confirm.json()
    assert body["status"] == "confirmed"
    assert body["email"] == "ada@example.com"
    assert next(iter(subscriber_repo.rows.values()))["confirmed_at"] is not None


def test_confirm_with_invalid_token_returns_400(client: TestClient) -> None:
    response = client.get("/api/v1/newsletter/confirm?token=nope")
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "invalid_token"


def test_subscribe_already_confirmed_returns_409(
    client: TestClient, subscriber_repo: FakeSubscriberRepo
) -> None:
    client.post(
        "/api/v1/newsletter/subscribe",
        json={
            "email": "ada@example.com",
            "source": "landing_footer",
            "turnstile_token": DEV_TOKEN_ALWAYS_PASS,
        },
    )
    row = next(iter(subscriber_repo.rows.values()))
    row["confirmed_at"] = "2026-05-19T00:00:00+00:00"
    second = client.post(
        "/api/v1/newsletter/subscribe",
        json={
            "email": "ada@example.com",
            "source": "landing_footer",
            "turnstile_token": DEV_TOKEN_ALWAYS_PASS,
        },
    )
    assert second.status_code == 409
    assert second.json()["error"]["code"] == "already_subscribed"
