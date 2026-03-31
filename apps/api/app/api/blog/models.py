"""Pydantic models for blog API."""

from __future__ import annotations

import re
from datetime import datetime

from pydantic import BaseModel, Field, field_validator


def _slugify(text: str) -> str:
    text = text.lower().strip()
    text = re.sub(r"[^\w\s-]", "", text)
    text = re.sub(r"[\s_]+", "-", text)
    text = re.sub(r"-+", "-", text)
    return text.strip("-")


def _reading_time(html: str) -> int:
    """Estimate reading time in minutes (word count / 200, minimum 1)."""
    text = re.sub(r"<[^>]+>", " ", html)
    words = len(text.split())
    return max(1, round(words / 200))


class BlogPostCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=300)
    content: str = Field(default="")
    content_markdown: str | None = None
    summary: str | None = Field(default=None, max_length=500)
    cover_image_url: str | None = None
    tags: str = ""
    status: str = Field(default="draft", pattern=r"^(draft|review)$")

    @field_validator("title")
    @classmethod
    def strip_title(cls, v: str) -> str:
        return v.strip()


class BlogPostUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=300)
    content: str | None = None
    content_markdown: str | None = None
    summary: str | None = Field(default=None, max_length=500)
    cover_image_url: str | None = None
    tags: str | None = None

    @field_validator("title")
    @classmethod
    def strip_title(cls, v: str | None) -> str | None:
        return v.strip() if v else v


class BlogPostStatusUpdate(BaseModel):
    status: str = Field(..., pattern=r"^(draft|review|published)$")


class AuthorInfo(BaseModel):
    id: str
    username: str
    display_name: str | None = None
    avatar_url: str | None = None


class BlogPostResponse(BaseModel):
    id: str
    author: AuthorInfo
    title: str
    slug: str
    content: str
    content_markdown: str | None = None
    summary: str | None = None
    cover_image_url: str | None = None
    tags: str = ""
    status: str
    reading_time_minutes: int | None = None
    published_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class BlogPostListResponse(BaseModel):
    posts: list[BlogPostResponse]
    total: int
    page: int
    total_pages: int


class ImageUploadResponse(BaseModel):
    url: str
