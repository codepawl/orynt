"""Tests for /api/v1/contact."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.services.email_service import SentEmail
from app.services.turnstile_service import DEV_TOKEN_ALWAYS_PASS
from tests.conftest import FakeSubmissionRepo


def test_contact_submits_and_persists_and_emails(
    client: TestClient,
    submission_repo: FakeSubmissionRepo,
    sent_emails: list[SentEmail],
) -> None:
    response = client.post(
        "/api/v1/contact",
        json={
            "name": "Ada Lovelace",
            "email": "ada@example.com",
            "subject": "Partnership inquiry",
            "message": "Hello, this is a partnership inquiry of reasonable length.",
            "turnstile_token": DEV_TOKEN_ALWAYS_PASS,
        },
    )
    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "received"
    assert isinstance(body["id"], str) and body["id"]
    assert len(submission_repo.rows) == 1
    assert submission_repo.rows[0]["name"] == "Ada Lovelace"
    assert len(sent_emails) == 1


def test_contact_short_message_rejected(client: TestClient) -> None:
    response = client.post(
        "/api/v1/contact",
        json={
            "name": "Ada",
            "email": "ada@example.com",
            "message": "short",
            "turnstile_token": DEV_TOKEN_ALWAYS_PASS,
        },
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "validation_failed"
