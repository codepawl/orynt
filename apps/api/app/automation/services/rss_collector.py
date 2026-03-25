"""RSS feed fetching and parsing."""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import TYPE_CHECKING

import feedparser
import httpx

if TYPE_CHECKING:
    from app.automation.services.supabase_client import AutomationDB

logger = logging.getLogger(__name__)

USER_AGENT = "CodePawl/1.0 (+https://codepawl.com)"
FETCH_TIMEOUT = 30


@dataclass
class CollectResult:
    feed_id: str
    feed_name: str
    new_articles: int = 0
    skipped_duplicates: int = 0
    errors: list[str] = field(default_factory=list)


@dataclass
class ParsedEntry:
    title: str
    url: str
    summary: str
    published_at: datetime | None
    content: str | None


def _parse_date(entry: dict) -> datetime | None:
    """Extract published date from a feedparser entry."""
    for key in ("published_parsed", "updated_parsed"):
        parsed = entry.get(key)
        if parsed:
            try:
                from time import mktime
                return datetime.fromtimestamp(mktime(parsed), tz=timezone.utc)
            except (ValueError, OverflowError, OSError):
                continue
    return None


def _extract_content(entry: dict) -> str | None:
    """Get the best available content from a feedparser entry."""
    # Try content array first (Atom feeds)
    if "content" in entry and entry["content"]:
        return entry["content"][0].get("value", "")
    # Fall back to summary_detail
    if "summary_detail" in entry:
        return entry["summary_detail"].get("value", "")
    return entry.get("summary")


def parse_feed(raw_xml: str) -> list[ParsedEntry]:
    """Parse raw XML/RSS into a list of entries."""
    feed = feedparser.parse(raw_xml)
    entries = []

    for entry in feed.entries:
        title = entry.get("title", "").strip()
        url = entry.get("link", "").strip()

        if not title or not url:
            continue

        entries.append(ParsedEntry(
            title=title,
            url=url,
            summary=entry.get("summary", "").strip()[:1000],
            published_at=_parse_date(entry),
            content=_extract_content(entry),
        ))

    return entries


async def fetch_feed(url: str) -> str:
    """Fetch raw feed XML from a URL."""
    async with httpx.AsyncClient(timeout=FETCH_TIMEOUT) as client:
        response = await client.get(url, headers={"User-Agent": USER_AGENT}, follow_redirects=True)
        response.raise_for_status()
        return response.text


async def collect_feed(
    feed_id: str,
    feed_name: str,
    feed_url: str,
    db: AutomationDB,
    dedup_fn,
    process_fn,
) -> CollectResult:
    """
    Fetch a single feed, dedup entries, process new ones.

    Args:
        dedup_fn: async (title, content, db) -> bool
        process_fn: async (entry: ParsedEntry, feed_id, db) -> None
    """
    result = CollectResult(feed_id=feed_id, feed_name=feed_name)

    try:
        raw = await fetch_feed(feed_url)
        entries = parse_feed(raw)

        for entry in entries:
            # Fast path: exact URL match
            existing = await db.get_article_by_url(entry.url)
            if existing:
                result.skipped_duplicates += 1
                continue

            # Near-dedup check
            is_dup = await dedup_fn(entry.title, entry.content or entry.summary, db)
            if is_dup:
                result.skipped_duplicates += 1
                continue

            # Process and insert
            await process_fn(entry, feed_id, db)
            result.new_articles += 1

        await db.update_feed_fetched(feed_id, error=None)

    except httpx.HTTPStatusError as e:
        error_msg = f"HTTP {e.response.status_code}"
        result.errors.append(error_msg)
        await db.update_feed_fetched(feed_id, error=error_msg)
        logger.warning("Feed %s returned %s", feed_name, error_msg)

    except Exception as e:
        error_msg = str(e)[:200]
        result.errors.append(error_msg)
        await db.update_feed_fetched(feed_id, error=error_msg)
        logger.exception("Failed to collect feed %s", feed_name)

    return result
