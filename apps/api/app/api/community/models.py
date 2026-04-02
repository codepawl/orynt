"""Pydantic models for community API."""

from __future__ import annotations

import re
from datetime import datetime

from urllib.parse import urlparse

from pydantic import BaseModel, Field, field_validator


class PostCreate(BaseModel):
    type: str = Field(..., pattern=r"^(link|text|show)$")
    title: str = Field(..., min_length=1, max_length=300)
    url: str | None = None
    content: str | None = None
    tags: str = ""

    @field_validator("tags")
    @classmethod
    def validate_tags(cls, v: str) -> str:
        if not v or not v.strip():
            return ""
        tags = [t.strip() for t in v.split(",") if t.strip()]
        if len(tags) > 3:
            raise ValueError("Maximum 3 tags allowed")
        for tag in tags:
            if not re.match(r"^[a-z0-9][a-z0-9-]{0,24}$", tag):
                raise ValueError(
                    f"Invalid tag '{tag}': use lowercase letters, numbers, hyphens, max 25 chars"
                )
        return ", ".join(tags)

    @field_validator("url")
    @classmethod
    def validate_url(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.strip()
        if not v:
            return None
        # Auto-prepend https:// if no scheme (once only)
        if not v.startswith(("http://", "https://")):
            v = "https://" + v
        parsed = urlparse(v)
        # Reject non-http(s) schemes
        if parsed.scheme not in ("http", "https"):
            raise ValueError("Only http and https URLs are allowed")
        if not parsed.hostname or "." not in parsed.hostname:
            raise ValueError(
                "Invalid URL — must be a valid web address with a domain "
                "(e.g. example.com or https://example.com)"
            )
        # Reject private/local addresses
        host = parsed.hostname.lower()
        if host in ("localhost", "127.0.0.1", "0.0.0.0") or host.endswith(".local"):
            raise ValueError("Private or local URLs are not allowed")
        if host.startswith(("192.168.", "10.", "172.16.")):
            raise ValueError("Private or local URLs are not allowed")
        return v


class CommentCreate(BaseModel):
    content: str = Field(..., min_length=1, max_length=10000)
    parent_id: str | None = None


class VoteRequest(BaseModel):
    target_id: str
    target_type: str = Field(..., pattern=r"^(post|comment|reproduction)$")
    value: int = Field(..., ge=-1, le=1)


class FlagCreate(BaseModel):
    target_id: str
    target_type: str = Field(..., pattern=r"^(post|comment|reproduction)$")
    reason: str | None = None


class AuthorInfo(BaseModel):
    id: str
    username: str
    display_name: str | None = None
    avatar_url: str | None = None


class TopComment(BaseModel):
    username: str
    avatar_url: str | None = None
    content: str


class PostResponse(BaseModel):
    id: str
    author: AuthorInfo
    type: str
    title: str
    url: str | None = None
    content: str | None = None
    score: int = 0
    comment_count: int = 0
    tags: str = ""
    is_auto: bool = False
    source_article_id: str | None = None
    created_at: datetime
    updated_at: datetime
    rank: float = 0.0
    user_vote: int = 0  # 1, -1, or 0 for current viewer
    top_comment: TopComment | None = None


class CommentResponse(BaseModel):
    id: str
    post_id: str
    parent_id: str | None = None
    author: AuthorInfo
    content: str
    score: int = 0
    created_at: datetime
    user_vote: int = 0


class PostListResponse(BaseModel):
    posts: list[PostResponse]
    total: int
    page: int
    total_pages: int


class FlagResponse(BaseModel):
    id: str
    reporter_id: str
    target_id: str
    target_type: str
    reason: str | None = None
    status: str
    created_at: datetime


class TagMerge(BaseModel):
    from_tag: str
    to_tag: str
