"""Pydantic models for Papers & Reproductions API."""

from __future__ import annotations

import re
from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from app.api.community.models import AuthorInfo


class PaperCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=500)
    authors: str = ""
    arxiv_url: str | None = None
    pdf_url: str | None = None
    venue: str | None = None
    year: int | None = None
    abstract: str | None = None
    tags: str = ""

    @field_validator("tags")
    @classmethod
    def validate_tags(cls, v: str) -> str:
        if not v or not v.strip():
            return ""
        tags = [t.strip() for t in v.split(",") if t.strip()]
        if len(tags) > 5:
            raise ValueError("Maximum 5 tags allowed")
        for tag in tags:
            if not re.match(r"^[a-z0-9][a-z0-9-]{0,24}$", tag):
                raise ValueError(
                    f"Invalid tag '{tag}': use lowercase letters, numbers, hyphens, max 25 chars"
                )
        return ", ".join(tags)


class PaperUpdate(BaseModel):
    title: str | None = None
    authors: str | None = None
    arxiv_url: str | None = None
    pdf_url: str | None = None
    venue: str | None = None
    year: int | None = None
    abstract: str | None = None
    tags: str | None = None


class ReproductionCreate(BaseModel):
    result: str = Field(..., pattern=r"^(confirmed|partially|failed|different_findings)$")
    hardware: str | None = None
    framework: str | None = None
    model_tested: str | None = None
    summary: str = Field(..., min_length=1, max_length=500)
    details: str | None = None
    code_url: str | None = None
    paper_claims: list[dict] = Field(default_factory=list)
    actual_results: list[dict] = Field(default_factory=list)


class ReproductionUpdate(BaseModel):
    result: str | None = Field(default=None, pattern=r"^(confirmed|partially|failed|different_findings)$")
    hardware: str | None = None
    framework: str | None = None
    model_tested: str | None = None
    summary: str | None = Field(default=None, max_length=500)
    details: str | None = None
    code_url: str | None = None
    paper_claims: list[dict] | None = None
    actual_results: list[dict] | None = None


class PaperResponse(BaseModel):
    id: str
    title: str
    authors: str
    arxiv_url: str | None = None
    pdf_url: str | None = None
    venue: str | None = None
    year: int | None = None
    abstract: str | None = None
    tags: str = ""
    submitted_by: AuthorInfo | None = None
    verification_status: str = "unverified"
    reproduction_count: int = 0
    created_at: datetime
    updated_at: datetime


class PaperListResponse(BaseModel):
    papers: list[PaperResponse]
    total: int
    page: int
    total_pages: int


class ReproductionResponse(BaseModel):
    id: str
    paper_id: str
    author: AuthorInfo
    result: str
    hardware: str | None = None
    framework: str | None = None
    model_tested: str | None = None
    summary: str
    details: str | None = None
    code_url: str | None = None
    paper_claims: list[dict] = Field(default_factory=list)
    actual_results: list[dict] = Field(default_factory=list)
    score: int = 0
    created_at: datetime
    updated_at: datetime


class ArxivMetadata(BaseModel):
    title: str
    authors: str
    abstract: str
    pdf_url: str
    year: int | None = None
