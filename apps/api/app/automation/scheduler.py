"""APScheduler integration — RSS collection job only."""

from __future__ import annotations

import logging
import re
from typing import TYPE_CHECKING

from apscheduler.schedulers.asyncio import AsyncIOScheduler

from app.automation.services.dedup import compute_title_hash, is_duplicate
from app.automation.services.keyword_extractor import extract_tags, tags_to_string
from app.automation.services.rss_collector import ParsedEntry, collect_feed
from app.automation.services.seo_generator import (
    generate_meta_description,
    generate_meta_title,
    generate_slug,
    generate_summary,
)

if TYPE_CHECKING:
    from fastapi import FastAPI

logger = logging.getLogger(__name__)


def _strip_html(text: str) -> str:
    """Remove HTML tags from text."""
    return re.sub(r"<[^>]+>", "", text).strip() if text else ""


async def _process_entry(entry: ParsedEntry, feed_id: str, db) -> None:
    """Process a single RSS entry: extract tags, generate SEO, insert to DB."""
    summary_text = _strip_html(entry.summary) if entry.summary else ""
    tags = extract_tags(entry.title, summary_text)
    slug = generate_slug(entry.title)
    title_hash = compute_title_hash(entry.title)

    article_data = {
        "feed_id": feed_id,
        "original_url": entry.url,
        "original_title": entry.title,
        "original_summary": summary_text[:1000] if summary_text else None,
        "original_published_at": entry.published_at.isoformat() if entry.published_at else None,
        "slug": slug,
        "title": entry.title,
        "summary": generate_summary(summary_text) if summary_text else entry.title,
        "tags": tags_to_string(tags),
        "canonical_url": entry.url,
        "meta_title": generate_meta_title(entry.title),
        "meta_description": generate_meta_description(summary_text or entry.title),
        "title_hash": title_hash,
        "status": "draft",
    }

    article = await db.create_article(article_data)

    # Link tags
    for tag_name in tags:
        tag_slug = generate_slug(tag_name, max_length=40)
        tag = await db.get_or_create_tag(name=tag_name, slug=tag_slug)
        await db.link_article_tags(article["id"], [tag["id"]])


async def collect_all_feeds_job(app: "FastAPI") -> dict:
    """Scheduled job: fetch all active feeds and insert new articles."""
    db = app.state.automation_db
    feeds = await db.get_feeds(active_only=True)

    total_new = 0
    total_skipped = 0

    for feed in feeds:
        result = await collect_feed(
            feed_id=feed["id"],
            feed_name=feed["name"],
            feed_url=feed["url"],
            db=db,
            dedup_fn=is_duplicate,
            process_fn=_process_entry,
        )
        total_new += result.new_articles
        total_skipped += result.skipped_duplicates

    logger.info(
        "Collection complete: %d feeds, %d new, %d skipped",
        len(feeds), total_new, total_skipped,
    )

    return {
        "feeds_processed": len(feeds),
        "new_articles": total_new,
        "skipped_duplicates": total_skipped,
    }


def create_scheduler(app: "FastAPI") -> AsyncIOScheduler:
    """Create the APScheduler with RSS collection job."""
    scheduler = AsyncIOScheduler()
    settings = app.state.settings

    scheduler.add_job(
        collect_all_feeds_job,
        "interval",
        minutes=settings.rss_collect_interval_minutes,
        id="rss_collect",
        name="RSS Feed Collection",
        args=[app],
    )

    return scheduler
