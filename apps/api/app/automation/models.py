from datetime import datetime
from pydantic import BaseModel, Field, field_validator


# --- Feed models ---

class FeedCreate(BaseModel):
    name: str
    url: str
    category: str = "general"
    is_active: bool = True
    fetch_interval_minutes: int = 60


class FeedUpdate(BaseModel):
    name: str | None = None
    url: str | None = None
    category: str | None = None
    is_active: bool | None = None
    fetch_interval_minutes: int | None = None


class FeedResponse(BaseModel):
    id: str
    name: str
    url: str
    category: str
    is_active: bool
    fetch_interval_minutes: int
    last_fetched_at: datetime | None = None
    error_count: int = 0
    created_at: datetime


# --- Article models (admin) ---

class ArticleUpdate(BaseModel):
    title: str | None = None
    slug: str | None = None
    summary: str | None = None
    tags: str | None = None
    image_url: str | None = None
    meta_title: str | None = None
    meta_description: str | None = None

    @field_validator("slug")
    @classmethod
    def validate_slug(cls, v: str | None) -> str | None:
        if v is None:
            return v
        import re
        if not re.match(r"^[a-z0-9]+(?:-[a-z0-9]+)*$", v):
            raise ValueError("Slug must contain only lowercase letters, numbers, and hyphens")
        if len(v) > 200:
            raise ValueError("Slug must be 200 characters or fewer")
        return v


class ArticleStatusUpdate(BaseModel):
    status: str = Field(..., pattern=r"^(draft|review|published|rejected|archived)$")


class BulkStatusUpdate(BaseModel):
    ids: list[str]
    status: str = Field(..., pattern=r"^(draft|review|published|rejected|archived)$")


class ArticleResponse(BaseModel):
    id: str
    feed_id: str | None = None
    original_url: str
    original_title: str
    original_summary: str | None = None
    original_author: str | None = None
    original_published_at: datetime | None = None
    slug: str | None = None
    title: str
    summary: str | None = None
    tags: str = ""
    image_url: str | None = None
    canonical_url: str | None = None
    meta_title: str | None = None
    meta_description: str | None = None
    status: str = "draft"
    published_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


# --- News models (public) ---

class NewsArticle(BaseModel):
    slug: str
    title: str
    summary: str | None = None
    tags: str = ""
    image_url: str | None = None
    canonical_url: str | None = None
    meta_title: str | None = None
    meta_description: str | None = None
    published_at: datetime | None = None


class NewsPaginatedResponse(BaseModel):
    articles: list[dict] = []
    total: int = 0
    page: int = 1
    total_pages: int = 0


# --- Tag models ---

class TagResponse(BaseModel):
    id: str
    name: str
    slug: str
    article_count: int = 0


# --- Dashboard models ---

class DashboardStats(BaseModel):
    total_articles: int = 0
    draft_count: int = 0
    review_count: int = 0
    published_count: int = 0
    rejected_count: int = 0
    active_feeds: int = 0


class PaginatedResponse(BaseModel):
    items: list = []
    total: int = 0
    page: int = 1
    page_size: int = 20
    total_pages: int = 0
