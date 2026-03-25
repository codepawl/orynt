"""Rule-based SEO metadata generation."""

from __future__ import annotations

import re

from slugify import slugify


def generate_slug(title: str, max_length: int = 60) -> str:
    """Generate a URL-friendly slug from a title."""
    return slugify(title, max_length=max_length, word_boundary=True)


def generate_meta_title(title: str, max_length: int = 60) -> str:
    """Generate an SEO-friendly meta title, max 60 chars."""
    suffix = " | CodePawl"
    available = max_length - len(suffix)

    if len(title) <= available:
        return title + suffix

    # Truncate at word boundary
    truncated = title[:available].rsplit(" ", 1)[0]
    return truncated + suffix


def generate_meta_description(summary: str, max_length: int = 155) -> str:
    """Generate meta description from summary, max 155 chars."""
    if not summary:
        return ""

    # Strip HTML tags if any
    clean = re.sub(r"<[^>]+>", "", summary).strip()

    if len(clean) <= max_length:
        return clean

    # Truncate at word boundary, add ellipsis
    truncated = clean[:max_length - 1].rsplit(" ", 1)[0]
    return truncated + "…"


def generate_summary(content: str, max_length: int = 200) -> str:
    """Extract a summary from content — first 1-2 meaningful sentences."""
    if not content:
        return ""

    # Strip HTML
    clean = re.sub(r"<[^>]+>", "", content).strip()
    # Strip markdown headers/links
    clean = re.sub(r"#{1,6}\s*", "", clean)
    clean = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", clean)

    # Split into sentences
    sentences = re.split(r"(?<=[.!?])\s+", clean)
    result = ""
    for sentence in sentences:
        sentence = sentence.strip()
        if not sentence:
            continue
        if not result:
            result = sentence
        elif len(result) + len(sentence) + 1 <= max_length:
            result += " " + sentence
        else:
            break

    if len(result) > max_length:
        result = result[:max_length - 1].rsplit(" ", 1)[0] + "…"

    return result
