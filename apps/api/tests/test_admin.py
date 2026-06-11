"""Tests for the admin surface."""

from typing import Any

import respx
from fastapi.testclient import TestClient
from httpx import Response


def test_sync_stats_requires_admin_key(client: TestClient) -> None:
    response = client.post("/api/v1/admin/products/sync-stats", json=None)
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "unauthorized"


@respx.mock
def test_sync_stats_with_admin_key_runs_job(client: TestClient) -> None:
    respx.get("https://api.github.com/repos/codepawl/codepawl").mock(
        return_value=Response(
            200, json={"stargazers_count": 5, "forks_count": 1, "open_issues_count": 0}
        )
    )
    respx.get("https://api.github.com/repos/codepawl/codepawl/releases/latest").mock(
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


def test_lists_newsletter_subscribers(
    client: TestClient,
    subscriber_repo: Any,
) -> None:
    first = subscriber_repo.upsert_pending(
        email="pending@example.com",
        source="footer",
        confirm_token="pending-token",
    )
    second = subscriber_repo.upsert_pending(
        email="confirmed@example.com",
        source="footer",
        confirm_token="confirmed-token",
    )
    subscriber_repo.mark_confirmed(subscriber_id=str(second["id"]))

    response = client.get(
        "/api/v1/admin/newsletter/subscribers?status=confirmed",
        headers={"X-Admin-Key": "test-admin"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 1
    assert body["subscribers"][0]["email"] == "confirmed@example.com"
    assert body["subscribers"][0]["confirmed_at"] is not None
    assert first["email"] == "pending@example.com"


def test_lists_contact_submissions_and_filters_replied(
    client: TestClient,
    submission_repo: Any,
) -> None:
    first = submission_repo.create(
        name="Ada",
        email="ada@example.com",
        subject="Hello",
        message="This is a long enough contact message.",
        ip_hash=None,
        user_agent=None,
    )
    submission_repo.create(
        name="Grace",
        email="grace@example.com",
        subject=None,
        message="Another long enough contact message.",
        ip_hash=None,
        user_agent=None,
    )
    submission_repo.create_reply(
        submission_id=str(first["id"]),
        replied_by="AN",
        reply_summary="Answered.",
    )

    response = client.get(
        "/api/v1/admin/contact/submissions?replied=true",
        headers={"X-Admin-Key": "test-admin"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 1
    assert body["submissions"][0]["email"] == "ada@example.com"
    assert body["submissions"][0]["replied"] is True
    assert body["submissions"][0]["reply"]["replied_by"] == "AN"


def test_records_contact_reply(
    client: TestClient,
    submission_repo: Any,
) -> None:
    submission = submission_repo.create(
        name="Ada",
        email="ada@example.com",
        subject="Hello",
        message="This is a long enough contact message.",
        ip_hash=None,
        user_agent=None,
    )

    response = client.post(
        f"/api/v1/admin/contact/submissions/{submission['id']}/reply",
        json={"replied_by": "AN", "reply_summary": "Sent deck."},
        headers={"X-Admin-Key": "test-admin"},
    )

    assert response.status_code == 201
    body = response.json()
    assert body["submission_id"] == submission["id"]
    assert body["replied_by"] == "AN"
    assert body["reply_summary"] == "Sent deck."
