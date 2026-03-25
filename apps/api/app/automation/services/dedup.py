"""Simhash-based deduplication using article titles."""

from __future__ import annotations

from typing import TYPE_CHECKING

from simhash import Simhash

if TYPE_CHECKING:
    from app.automation.services.supabase_client import AutomationDB

HAMMING_THRESHOLD = 3


def compute_title_hash(title: str) -> str:
    """Compute 64-bit simhash of title, return as hex string."""
    normalized = title.lower().strip()
    return format(Simhash(normalized).value, "016x")


def _hamming_distance(a: int, b: int) -> int:
    """Count differing bits between two 64-bit integers."""
    return bin(a ^ b).count("1")


async def is_duplicate(title_hash: str, url: str, db: AutomationDB) -> bool:
    """
    Check if an article is a duplicate.
    1. Fast path: exact URL match
    2. Near match: simhash hamming distance <= 3
    """
    # Fast path: exact URL
    existing = await db.get_article_by_url(url)
    if existing:
        return True

    # Near dedup via title simhash
    new_value = int(title_hash, 16)
    existing_hashes = await db.get_title_hashes()

    for existing_hash_hex in existing_hashes:
        existing_value = int(existing_hash_hex, 16)
        if _hamming_distance(new_value, existing_value) <= HAMMING_THRESHOLD:
            return True

    return False
