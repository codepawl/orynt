"""Persistence for newsletter subscribers.

Defines a Protocol that the FastAPI dependency overrides can satisfy with a
fake during tests. The Supabase-backed implementation lives at the bottom.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Protocol, cast, runtime_checkable

from postgrest.types import JSON
from supabase import Client


@runtime_checkable
class SubscriberRepo(Protocol):
    def upsert_pending(
        self, *, email: str, source: str, confirm_token: str
    ) -> dict[str, object]: ...

    def find_by_token(self, *, token: str) -> dict[str, object] | None: ...

    def find_by_email(self, *, email: str) -> dict[str, object] | None: ...

    def mark_confirmed(self, *, subscriber_id: str) -> dict[str, object]: ...

    def mark_unsubscribed(self, *, subscriber_id: str) -> dict[str, object]: ...

    def log_event(
        self,
        *,
        subscriber_id: str,
        event_type: str,
        metadata: dict[str, object] | None = None,
    ) -> None: ...


class SupabaseSubscriberRepo:
    """Supabase-backed implementation. Used in production; tests inject fakes."""

    def __init__(self, client: Client) -> None:
        self._c = client

    def upsert_pending(self, *, email: str, source: str, confirm_token: str) -> dict[str, object]:
        result = (
            self._c.table("newsletter_subscribers")
            .upsert(
                {"email": email, "source": source, "confirm_token": confirm_token},
                on_conflict="email",
            )
            .execute()
        )
        rows = cast(list[dict[str, object]], result.data or [])
        return rows[0] if rows else {}

    def find_by_token(self, *, token: str) -> dict[str, object] | None:
        result = (
            self._c.table("newsletter_subscribers")
            .select("*")
            .eq("confirm_token", token)
            .limit(1)
            .execute()
        )
        rows = cast(list[dict[str, object]], result.data or [])
        return rows[0] if rows else None

    def find_by_email(self, *, email: str) -> dict[str, object] | None:
        result = (
            self._c.table("newsletter_subscribers")
            .select("*")
            .eq("email", email)
            .limit(1)
            .execute()
        )
        rows = cast(list[dict[str, object]], result.data or [])
        return rows[0] if rows else None

    def mark_confirmed(self, *, subscriber_id: str) -> dict[str, object]:
        now = datetime.now(UTC).isoformat()
        result = (
            self._c.table("newsletter_subscribers")
            .update({"confirmed_at": now})
            .eq("id", subscriber_id)
            .execute()
        )
        rows = cast(list[dict[str, object]], result.data or [])
        return rows[0] if rows else {}

    def mark_unsubscribed(self, *, subscriber_id: str) -> dict[str, object]:
        now = datetime.now(UTC).isoformat()
        result = (
            self._c.table("newsletter_subscribers")
            .update({"unsubscribed_at": now})
            .eq("id", subscriber_id)
            .execute()
        )
        rows = cast(list[dict[str, object]], result.data or [])
        return rows[0] if rows else {}

    def log_event(
        self,
        *,
        subscriber_id: str,
        event_type: str,
        metadata: dict[str, object] | None = None,
    ) -> None:
        self._c.table("newsletter_events").insert(
            cast(
                JSON,
                {
                    "subscriber_id": subscriber_id,
                    "event_type": event_type,
                    "metadata": metadata or {},
                },
            )
        ).execute()
