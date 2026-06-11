"""Shared test fixtures.

Each test gets its own FastAPI app instance with fresh in-memory repositories
injected via dependency overrides. This keeps the test suite hermetic — no
Supabase, no Turnstile, no Resend connection required.
"""

from __future__ import annotations

import secrets
from collections.abc import Iterator
from datetime import UTC, datetime

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.config import Settings, get_settings
from app.dependencies import get_supabase_client
from app.main import create_app
from app.repositories.product_repo import ProductRepo
from app.repositories.product_stats_repo import ProductStatsRepo
from app.repositories.submission_repo import SubmissionRepo
from app.repositories.subscriber_repo import SubscriberRepo
from app.routers.admin import (
    get_product_repo_admin,
    get_product_stats_repo_admin,
    get_submission_repo_admin,
    get_subscriber_repo_admin,
)
from app.routers.contact import get_submission_repo
from app.routers.newsletter import get_subscriber_repo
from app.routers.products import get_product_repo, get_product_stats_repo
from app.services.email_service import SENT_EMAILS, SentEmail, reset_sent_emails


class FakeSubscriberRepo:
    def __init__(self) -> None:
        self.rows: dict[str, dict[str, object]] = {}

    def upsert_pending(self, *, email: str, source: str, confirm_token: str) -> dict[str, object]:
        for row in self.rows.values():
            if row["email"] == email:
                row.update({"source": source, "confirm_token": confirm_token})
                return row
        sub_id = secrets.token_hex(8)
        row = {
            "id": sub_id,
            "email": email,
            "source": source,
            "confirm_token": confirm_token,
            "confirmed_at": None,
            "unsubscribed_at": None,
            "created_at": datetime.now(UTC).isoformat(),
        }
        self.rows[sub_id] = row
        return row

    def find_by_token(self, *, token: str) -> dict[str, object] | None:
        for row in self.rows.values():
            if row["confirm_token"] == token:
                return row
        return None

    def find_by_email(self, *, email: str) -> dict[str, object] | None:
        for row in self.rows.values():
            if row["email"] == email:
                return row
        return None

    def mark_confirmed(self, *, subscriber_id: str) -> dict[str, object]:
        row = self.rows[subscriber_id]
        row["confirmed_at"] = datetime.now(UTC).isoformat()
        return row

    def mark_unsubscribed(self, *, subscriber_id: str) -> dict[str, object]:
        row = self.rows[subscriber_id]
        row["unsubscribed_at"] = datetime.now(UTC).isoformat()
        return row

    def log_event(
        self,
        *,
        subscriber_id: str,
        event_type: str,
        metadata: dict[str, object] | None = None,
    ) -> None:
        return None

    def list_admin(
        self, *, status: str | None, page: int, per_page: int
    ) -> tuple[list[dict[str, object]], int]:
        rows = sorted(
            self.rows.values(),
            key=lambda row: str(row.get("created_at", "")),
            reverse=True,
        )
        if status == "confirmed":
            rows = [
                row for row in rows if row.get("confirmed_at") and not row.get("unsubscribed_at")
            ]
        elif status == "pending":
            rows = [row for row in rows if not row.get("confirmed_at")]
        elif status == "unsubscribed":
            rows = [row for row in rows if row.get("unsubscribed_at")]

        total = len(rows)
        start = (page - 1) * per_page
        return rows[start : start + per_page], total


class FakeSubmissionRepo:
    def __init__(self) -> None:
        self.rows: list[dict[str, object]] = []
        self.replies: list[dict[str, object]] = []

    def create(
        self,
        *,
        name: str,
        email: str,
        subject: str | None,
        message: str,
        ip_hash: str | None,
        user_agent: str | None,
    ) -> dict[str, object]:
        row: dict[str, object] = {
            "id": secrets.token_hex(8),
            "name": name,
            "email": email,
            "subject": subject,
            "message": message,
            "ip_hash": ip_hash,
            "user_agent": user_agent,
            "created_at": datetime.now(UTC).isoformat(),
        }
        self.rows.append(row)
        return row

    def list_admin(
        self, *, replied: bool | None, page: int, per_page: int
    ) -> tuple[list[dict[str, object]], int]:
        rows = [
            {
                **row,
                "contact_replies": [
                    reply for reply in self.replies if reply["submission_id"] == row["id"]
                ],
            }
            for row in self.rows
        ]
        rows = sorted(rows, key=lambda row: str(row.get("created_at", "")), reverse=True)
        if replied is not None:
            rows = [row for row in rows if bool(row.get("contact_replies")) is replied]

        total = len(rows)
        start = (page - 1) * per_page
        return rows[start : start + per_page], total

    def create_reply(
        self,
        *,
        submission_id: str,
        replied_by: str,
        reply_summary: str | None,
    ) -> dict[str, object]:
        row: dict[str, object] = {
            "id": secrets.token_hex(8),
            "submission_id": submission_id,
            "replied_by": replied_by,
            "reply_summary": reply_summary,
            "created_at": datetime.now(UTC).isoformat(),
        }
        self.replies.append(row)
        return row


class FakeProductRepo:
    def __init__(self, rows: list[dict[str, object]] | None = None) -> None:
        self.rows: list[dict[str, object]] = rows or _seed_products()

    def list(self) -> list[dict[str, object]]:
        def _order(row: dict[str, object]) -> int:
            value = row.get("display_order", 0)
            return value if isinstance(value, int) else 0

        return sorted(self.rows, key=_order)

    def get_by_slug(self, slug: str) -> dict[str, object] | None:
        for row in self.rows:
            if row["slug"] == slug:
                return row
        return None


class FakeProductStatsRepo:
    def __init__(self) -> None:
        self.rows: dict[str, dict[str, object]] = {}

    def get(self, product_id: str) -> dict[str, object] | None:
        return self.rows.get(product_id)

    def upsert(self, *, product_id: str, payload: dict[str, object]) -> None:
        self.rows[product_id] = {"product_id": product_id, **payload}


def _seed_products() -> list[dict[str, object]]:
    return [
        {
            "id": "openpawl",
            "name": "OpenPawl",
            "slug": "openpawl",
            "tagline": "Dry-run-first AI code review workflow for GitHub.",
            "status": "beta",
            "github_repo": "codepawl/codepawl",
            "display_order": 1,
        },
        {
            "id": "featcat",
            "name": "Featcat",
            "slug": "featcat",
            "tagline": "Feature flags and config for agent workflows.",
            "status": "alpha",
            "github_repo": "codepawl/featcat",
            "display_order": 2,
        },
    ]


@pytest.fixture
def settings() -> Settings:
    return Settings(testing=True, admin_api_key="test-admin", resend_api_key="")


@pytest.fixture
def subscriber_repo() -> FakeSubscriberRepo:
    return FakeSubscriberRepo()


@pytest.fixture
def submission_repo() -> FakeSubmissionRepo:
    return FakeSubmissionRepo()


@pytest.fixture
def product_repo() -> FakeProductRepo:
    return FakeProductRepo()


@pytest.fixture
def product_stats_repo() -> FakeProductStatsRepo:
    return FakeProductStatsRepo()


@pytest.fixture
def app(
    settings: Settings,
    subscriber_repo: SubscriberRepo,
    submission_repo: SubmissionRepo,
    product_repo: ProductRepo,
    product_stats_repo: ProductStatsRepo,
) -> Iterator[FastAPI]:
    reset_sent_emails()
    application = create_app()
    application.dependency_overrides[get_settings] = lambda: settings
    application.dependency_overrides[get_supabase_client] = lambda: object()
    application.dependency_overrides[get_subscriber_repo] = lambda: subscriber_repo
    application.dependency_overrides[get_submission_repo] = lambda: submission_repo
    application.dependency_overrides[get_product_repo] = lambda: product_repo
    application.dependency_overrides[get_product_stats_repo] = lambda: product_stats_repo
    application.dependency_overrides[get_product_repo_admin] = lambda: product_repo
    application.dependency_overrides[get_product_stats_repo_admin] = lambda: product_stats_repo
    application.dependency_overrides[get_subscriber_repo_admin] = lambda: subscriber_repo
    application.dependency_overrides[get_submission_repo_admin] = lambda: submission_repo
    yield application
    application.dependency_overrides.clear()


@pytest.fixture
def client(app: FastAPI) -> TestClient:
    return TestClient(app)


@pytest.fixture
def sent_emails() -> Iterator[list[SentEmail]]:
    reset_sent_emails()
    yield SENT_EMAILS
    reset_sent_emails()
