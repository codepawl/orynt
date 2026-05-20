"""Read-only repository for the products catalog."""

from __future__ import annotations

from typing import Protocol, cast, runtime_checkable

from supabase import Client


@runtime_checkable
class ProductRepo(Protocol):
    def list(self) -> list[dict[str, object]]: ...

    def get_by_slug(self, slug: str) -> dict[str, object] | None: ...


class SupabaseProductRepo:
    def __init__(self, client: Client) -> None:
        self._c = client

    def list(self) -> list[dict[str, object]]:
        result = self._c.table("products").select("*").order("display_order", desc=False).execute()
        rows = cast(list[dict[str, object]], result.data or [])
        return rows

    def get_by_slug(self, slug: str) -> dict[str, object] | None:
        result = self._c.table("products").select("*").eq("slug", slug).limit(1).execute()
        rows = cast(list[dict[str, object]], result.data or [])
        return rows[0] if rows else None
