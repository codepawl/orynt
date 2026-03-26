"""Pydantic models for community API."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class PostCreate(BaseModel):
    type: str = Field(..., pattern=r"^(link|text|show)$")
    title: str = Field(..., min_length=1, max_length=300)
    url: str | None = None
    content: str | None = None
    tags: str = ""


class CommentCreate(BaseModel):
    content: str = Field(..., min_length=1, max_length=10000)
    parent_id: str | None = None


class VoteRequest(BaseModel):
    target_id: str
    target_type: str = Field(..., pattern=r"^(post|comment)$")
    value: int = Field(..., ge=-1, le=1)


class FlagCreate(BaseModel):
    target_id: str
    target_type: str = Field(..., pattern=r"^(post|comment)$")
    reason: str | None = None


class AuthorInfo(BaseModel):
    id: str
    username: str
    display_name: str | None = None
    avatar_url: str | None = None


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
