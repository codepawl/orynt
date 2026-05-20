"""Read-only repository for the cached GitHub stats per product."""

from __future__ import annotations

from typing import Protocol, cast, runtime_checkable

from postgrest.types import JSON
from supabase import Client


@runtime_checkable
class ProductStatsRepo(Protocol):
    def get(self, product_id: str) -> dict[str, object] | None: ...

    def upsert(self, *, product_id: str, payload: dict[str, object]) -> None: ...


class SupabaseProductStatsRepo:
    def __init__(self, client: Client) -> None:
        self._c = client

    def get(self, product_id: str) -> dict[str, object] | None:
        result = (
            self._c.table("product_stats")
            .select("*")
            .eq("product_id", product_id)
            .limit(1)
            .execute()
        )
        rows = cast(list[dict[str, object]], result.data or [])
        return rows[0] if rows else None

    def upsert(self, *, product_id: str, payload: dict[str, object]) -> None:
        record = cast(JSON, {"product_id": product_id, **payload})
        self._c.table("product_stats").upsert(record, on_conflict="product_id").execute()
