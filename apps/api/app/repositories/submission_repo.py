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
