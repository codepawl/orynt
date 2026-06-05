"""Persistence for /contact submissions."""

from __future__ import annotations

from typing import Protocol, cast, runtime_checkable

from supabase import Client


@runtime_checkable
class SubmissionRepo(Protocol):
    def create(
        self,
        *,
        name: str,
        email: str,
        subject: str | None,
        message: str,
        ip_hash: str | None,
        user_agent: str | None,
    ) -> dict[str, object]: ...

    def list_admin(
        self, *, replied: bool | None, page: int, per_page: int
    ) -> tuple[list[dict[str, object]], int]: ...

    def create_reply(
        self,
        *,
        submission_id: str,
        replied_by: str,
        reply_summary: str | None,
    ) -> dict[str, object]: ...


class SupabaseSubmissionRepo:
    def __init__(self, client: Client) -> None:
        self._c = client

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
        result = (
            self._c.table("contact_submissions")
            .insert(
                {
                    "name": name,
                    "email": email,
                    "subject": subject,
                    "message": message,
                    "ip_hash": ip_hash,
                    "user_agent": user_agent,
                }
            )
            .execute()
        )
        rows = cast(list[dict[str, object]], result.data or [])
        return rows[0] if rows else {}

    def list_admin(
        self, *, replied: bool | None, page: int, per_page: int
    ) -> tuple[list[dict[str, object]], int]:
        result = (
            self._c.table("contact_submissions")
            .select("*, contact_replies(*)")
            .order("created_at", desc=True)
            .execute()
        )
        rows = cast(list[dict[str, object]], result.data or [])
        if replied is not None:
            rows = [row for row in rows if _has_reply(row) is replied]

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
        result = (
            self._c.table("contact_replies")
            .insert(
                {
                    "submission_id": submission_id,
                    "replied_by": replied_by,
                    "reply_summary": reply_summary,
                }
            )
            .execute()
        )
        rows = cast(list[dict[str, object]], result.data or [])
        return rows[0] if rows else {}


def _has_reply(row: dict[str, object]) -> bool:
    replies = row.get("contact_replies")
    return isinstance(replies, list) and len(replies) > 0
