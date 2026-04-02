"""Pydantic models for Wiki API."""

from __future__ import annotations

import re
from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from app.api.community.models import AuthorInfo


class WikiPageCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    slug: str = Field(..., min_length=1, max_length=100)
    content: str = Field(..., min_length=1)
    parent_id: str | None = None
    sort_order: int = 0

    @field_validator("slug")
    @classmethod
    def validate_slug(cls, v: str) -> str:
        v = v.strip().lower()
        if not re.match(r"^[a-z0-9][a-z0-9-]{0,98}[a-z0-9]$", v) and len(v) > 1:
            raise ValueError("Slug must be lowercase alphanumeric with hyphens")
        return v


class WikiPageUpdate(BaseModel):
    title: str | None = Field(default=None, max_length=200)
    content: str | None = None
    parent_id: str | None = None
    sort_order: int | None = None
    is_published: bool | None = None


class WikiPageResponse(BaseModel):
    id: str
    project_slug: str
    slug: str
    title: str
    content: str
    content_format: str = "markdown"
    parent_id: str | None = None
    sort_order: int = 0
    author: AuthorInfo | None = None
    is_published: bool = True
    created_at: datetime
    updated_at: datetime


class WikiPageSummary(BaseModel):
    id: str
    slug: str
    title: str
    parent_id: str | None = None
    sort_order: int = 0


class ReorderItem(BaseModel):
    id: str
    sort_order: int
    parent_id: str | None = None


class ReorderRequest(BaseModel):
    items: list[ReorderItem]
