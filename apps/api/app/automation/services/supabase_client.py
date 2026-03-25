"""Async Supabase wrapper for automation tables."""

from __future__ import annotations

import math
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from supabase._async.client import AsyncClient


class AutomationDB:
    """Typed methods for feeds/articles/tags tables."""

    def __init__(self, client: AsyncClient):
        self.client = client

    # ── Feeds ──────────────────────────────────────────────────────────

    async def get_feeds(self, active_only: bool = False) -> list[dict]:
        query = self.client.table("feeds").select("*").order("created_at", desc=True)
        if active_only:
            query = query.eq("is_active", True)
        result = await query.execute()
        return result.data

    async def get_feed(self, feed_id: str) -> dict | None:
        result = await self.client.table("feeds").select("*").eq("id", feed_id).maybe_single().execute()
        return result.data

    async def create_feed(self, data: dict) -> dict:
        result = await self.client.table("feeds").insert(data).execute()
        return result.data[0]

    async def update_feed(self, feed_id: str, data: dict) -> dict:
        result = await self.client.table("feeds").update(data).eq("id", feed_id).execute()
        return result.data[0] if result.data else {}

    async def delete_feed(self, feed_id: str) -> None:
        await self.client.table("feeds").delete().eq("id", feed_id).execute()

    async def update_feed_fetched(self, feed_id: str, error: str | None = None) -> None:
        if error:
            feed = await self.get_feed(feed_id)
            if feed:
                await self.client.table("feeds").update({
                    "error_count": feed["error_count"] + 1,
                    "last_fetched_at": "now()",
                }).eq("id", feed_id).execute()
        else:
            await self.client.table("feeds").update({
                "error_count": 0,
                "last_fetched_at": "now()",
            }).eq("id", feed_id).execute()

    # ── Articles (Admin) ───────────────────────────────────────────────

    async def get_articles(
        self,
        status: str | None = None,
        feed_id: str | None = None,
        search: str | None = None,
        tag: str | None = None,
        page: int = 1,
        per_page: int = 20,
    ) -> tuple[list[dict], int]:
        query = self.client.table("articles").select("*", count="exact")

        if status:
            query = query.eq("status", status)
        if feed_id:
            query = query.eq("feed_id", feed_id)
        if search:
            query = query.or_(f"title.ilike.%{search}%,original_title.ilike.%{search}%")
        if tag:
            query = query.ilike("tags", f"%{tag}%")

        offset = (page - 1) * per_page
        query = query.order("created_at", desc=True).range(offset, offset + per_page - 1)

        result = await query.execute()
        return result.data, result.count or 0

    async def get_article(self, article_id: str) -> dict | None:
        result = await self.client.table("articles").select("*").eq("id", article_id).maybe_single().execute()
        return result.data

    async def get_article_by_url(self, url: str) -> dict | None:
        result = await self.client.table("articles").select("id").eq("original_url", url).maybe_single().execute()
        return result.data

    async def create_article(self, data: dict) -> dict:
        result = await self.client.table("articles").insert(data).execute()
        return result.data[0]

    async def update_article(self, article_id: str, data: dict) -> dict:
        result = await self.client.table("articles").update(data).eq("id", article_id).execute()
        return result.data[0] if result.data else {}

    async def update_article_status(self, article_id: str, status: str) -> dict:
        data: dict[str, Any] = {"status": status}
        if status == "published":
            data["published_at"] = "now()"
        result = await self.client.table("articles").update(data).eq("id", article_id).execute()
        return result.data[0] if result.data else {}

    async def bulk_update_status(self, ids: list[str], status: str) -> int:
        data: dict[str, Any] = {"status": status}
        if status == "published":
            data["published_at"] = "now()"
        result = await self.client.table("articles").update(data).in_("id", ids).execute()
        return len(result.data)

    async def delete_article(self, article_id: str) -> None:
        await self.client.table("articles").delete().eq("id", article_id).execute()

    # ── Articles (Public — /api/news) ──────────────────────────────────

    async def get_published_articles(
        self, page: int = 1, per_page: int = 12, tag: str | None = None
    ) -> tuple[list[dict], int]:
        query = self.client.table("articles").select("*", count="exact").eq("status", "published")

        if tag:
            query = query.ilike("tags", f"%{tag}%")

        offset = (page - 1) * per_page
        query = query.order("published_at", desc=True).range(offset, offset + per_page - 1)

        result = await query.execute()
        return result.data, result.count or 0

    async def get_published_article_by_slug(self, slug: str) -> dict | None:
        result = (
            await self.client.table("articles")
            .select("*")
            .eq("slug", slug)
            .eq("status", "published")
            .maybe_single()
            .execute()
        )
        return result.data

    async def get_published_tags(self) -> list[dict]:
        """Return tags that have at least 1 published article."""
        result = await self.client.table("tags").select("*").gt("article_count", 0).order("article_count", desc=True).execute()
        return result.data

    # ── Dedup ──────────────────────────────────────────────────────────

    async def get_title_hashes(self) -> list[str]:
        result = await self.client.table("articles").select("title_hash").execute()
        return [r["title_hash"] for r in result.data if r.get("title_hash")]

    # ── Tags ───────────────────────────────────────────────────────────

    async def get_tags(self) -> list[dict]:
        result = await self.client.table("tags").select("*").order("article_count", desc=True).execute()
        return result.data

    async def get_or_create_tag(self, name: str, slug: str) -> dict:
        existing = await self.client.table("tags").select("*").eq("slug", slug).maybe_single().execute()
        if existing.data:
            return existing.data
        result = await self.client.table("tags").insert({"name": name, "slug": slug}).execute()
        return result.data[0]

    async def link_article_tags(self, article_id: str, tag_ids: list[str]) -> None:
        rows = [{"article_id": article_id, "tag_id": tid} for tid in tag_ids]
        if rows:
            await self.client.table("article_tags").upsert(rows).execute()

    async def refresh_tag_counts(self) -> None:
        tags = await self.get_tags()
        for tag in tags:
            count_result = (
                await self.client.table("article_tags")
                .select("article_id", count="exact")
                .eq("tag_id", tag["id"])
                .execute()
            )
            await self.client.table("tags").update(
                {"article_count": count_result.count or 0}
            ).eq("id", tag["id"]).execute()

    # ── Dashboard ──────────────────────────────────────────────────────

    async def get_dashboard_stats(self) -> dict:
        status_counts = {}
        for status_name in ("draft", "review", "published", "rejected", "archived"):
            result = await self.client.table("articles").select("id", count="exact").eq("status", status_name).execute()
            status_counts[status_name] = result.count or 0

        total = sum(status_counts.values())

        feeds = await self.client.table("feeds").select("is_active,error_count").execute()
        active_feeds = sum(1 for f in feeds.data if f["is_active"])

        return {
            "total_articles": total,
            "draft_count": status_counts["draft"],
            "review_count": status_counts["review"],
            "published_count": status_counts["published"],
            "rejected_count": status_counts["rejected"],
            "active_feeds": active_feeds,
        }

    async def get_recent_articles(self, limit: int = 20) -> list[dict]:
        result = (
            await self.client.table("articles")
            .select("*")
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        return result.data
