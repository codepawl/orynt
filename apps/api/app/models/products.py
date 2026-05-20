"""Pydantic models for /products (docs/API.md and docs/DATA.md)."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel

ProductStatus = Literal["stable", "beta", "alpha", "pre-alpha", "private"]


class Product(BaseModel):
    id: str
    name: str
    slug: str
    tagline: str
    status: ProductStatus
    github_repo: str
    display_order: int


class ProductsList(BaseModel):
    products: list[Product]


class ProductStats(BaseModel):
    product_id: str
    stars: int
    forks: int
    open_issues: int
    last_release_tag: str | None
    last_release_at: datetime | None
    synced_at: datetime
