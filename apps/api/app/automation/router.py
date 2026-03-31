"""Automation API router — admin + public news endpoints."""

from __future__ import annotations

import math

from fastapi import APIRouter, Depends, HTTPException, Request

from app.automation.dependencies import verify_admin_key
from app.automation.models import (
    ArticleCreate,
    ArticleStatusUpdate,
    ArticleUpdate,
    BulkStatusUpdate,
    FeedCreate,
    FeedUpdate,
    NewsPaginatedResponse,
    PaginatedResponse,
)
from app.automation.services.dedup import is_duplicate
from app.automation.services.rss_collector import collect_feed
from app.automation.scheduler import _process_entry, collect_all_feeds_job


# ── Admin router (protected) ──────────────────────────────────────────

admin_router = APIRouter(
    prefix="/api/automation",
    dependencies=[Depends(verify_admin_key)],
)


def _get_db(request: Request):
    db = getattr(request.app.state, "automation_db", None)
    if db is None:
        raise HTTPException(503, "Automation not configured (Supabase credentials missing)")
    return db


# Dashboard
@admin_router.get("/stats")
async def get_stats(request: Request) -> dict:
    db = _get_db(request)
    return await db.get_dashboard_stats()


@admin_router.get("/recent")
async def get_recent(request: Request, limit: int = 20) -> list[dict]:
    db = _get_db(request)
    return await db.get_recent_articles(limit=limit)


# Feeds
@admin_router.get("/feeds")
async def list_feeds(request: Request) -> list[dict]:
    return await _get_db(request).get_feeds()


@admin_router.post("/feeds", status_code=201)
async def create_feed(data: FeedCreate, request: Request) -> dict:
    return await _get_db(request).create_feed(data.model_dump())


@admin_router.put("/feeds/{feed_id}")
async def update_feed(feed_id: str, data: FeedUpdate, request: Request) -> dict:
    db = _get_db(request)
    if not await db.get_feed(feed_id):
        raise HTTPException(404, "Feed not found")
    update_data = {k: v for k, v in data.model_dump().items() if v is not None}
    return await db.update_feed(feed_id, update_data)


@admin_router.delete("/feeds/{feed_id}")
async def delete_feed(feed_id: str, request: Request) -> dict:
    db = _get_db(request)
    if not await db.get_feed(feed_id):
        raise HTTPException(404, "Feed not found")
    await db.delete_feed(feed_id)
    return {"ok": True}


@admin_router.post("/feeds/{feed_id}/fetch")
async def fetch_single_feed(feed_id: str, request: Request) -> dict:
    db = _get_db(request)
    feed = await db.get_feed(feed_id)
    if not feed:
        raise HTTPException(404, "Feed not found")

    result = await collect_feed(
        feed_id=feed["id"],
        feed_name=feed["name"],
        feed_url=feed["url"],
        db=db,
        dedup_fn=is_duplicate,
        process_fn=_process_entry,
    )
    return {
        "feed": feed["name"],
        "new_articles": result.new_articles,
        "skipped_duplicates": result.skipped_duplicates,
        "errors": result.errors,
    }


# Articles
@admin_router.post("/articles", status_code=201)
async def create_article(data: ArticleCreate, request: Request) -> dict:
    db = _get_db(request)
    row = {
        "original_title": data.original_title,
        "original_url": data.original_url,
        "tags": data.tags or "",
        "status": data.status,
    }
    return await db.create_article(row)


@admin_router.get("/articles")
async def list_articles(
    request: Request,
    status: str | None = None,
    feed_id: str | None = None,
    tag: str | None = None,
    search: str | None = None,
    page: int = 1,
    per_page: int = 20,
) -> PaginatedResponse:
    db = _get_db(request)
    items, total = await db.get_articles(
        status=status, feed_id=feed_id, tag=tag, search=search,
        page=page, per_page=per_page,
    )
    return PaginatedResponse(
        items=items, total=total, page=page, page_size=per_page,
        total_pages=math.ceil(total / per_page) if total > 0 else 0,
    )


@admin_router.get("/articles/{article_id}")
async def get_article(article_id: str, request: Request) -> dict:
    db = _get_db(request)
    article = await db.get_article(article_id)
    if not article:
        raise HTTPException(404, "Article not found")
    return article


@admin_router.put("/articles/{article_id}")
async def update_article(article_id: str, data: ArticleUpdate, request: Request) -> dict:
    db = _get_db(request)
    if not await db.get_article(article_id):
        raise HTTPException(404, "Article not found")
    update_data = {k: v for k, v in data.model_dump().items() if v is not None}
    return await db.update_article(article_id, update_data)


@admin_router.patch("/articles/{article_id}/status")
async def change_status(article_id: str, data: ArticleStatusUpdate, request: Request) -> dict:
    db = _get_db(request)
    if not await db.get_article(article_id):
        raise HTTPException(404, "Article not found")
    return await db.update_article_status(article_id, data.status)


@admin_router.post("/articles/bulk-status")
async def bulk_status(data: BulkStatusUpdate, request: Request) -> dict:
    db = _get_db(request)
    count = await db.bulk_update_status(data.ids, data.status)
    return {"updated": count}


@admin_router.delete("/articles/{article_id}")
async def delete_article(article_id: str, request: Request) -> dict:
    db = _get_db(request)
    if not await db.get_article(article_id):
        raise HTTPException(404, "Article not found")
    await db.delete_article(article_id)
    return {"ok": True}


# Tags
@admin_router.get("/tags")
async def list_tags(request: Request) -> list[dict]:
    return await _get_db(request).get_tags()


# Manual worker trigger
@admin_router.post("/workers/collect")
async def trigger_collect(request: Request) -> dict:
    result = await collect_all_feeds_job(request.app)
    return result


# ── Public news router (no auth) ──────────────────────────────────────

news_router = APIRouter(prefix="/api/news")


@news_router.get("")
async def get_news(
    request: Request,
    page: int = 1,
    per_page: int = 12,
    tag: str | None = None,
) -> NewsPaginatedResponse:
    db = _get_db(request)
    articles, total = await db.get_published_articles(page=page, per_page=per_page, tag=tag)
    return NewsPaginatedResponse(
        articles=articles,
        total=total,
        page=page,
        total_pages=math.ceil(total / per_page) if total > 0 else 0,
    )


@news_router.get("/tags")
async def get_news_tags(request: Request) -> list[dict]:
    db = _get_db(request)
    return await db.get_published_tags()


@news_router.get("/{slug}")
async def get_news_article(slug: str, request: Request) -> dict:
    db = _get_db(request)
    article = await db.get_published_article_by_slug(slug)
    if not article:
        raise HTTPException(404, "Article not found")
    return article
