"""Idempotent seed of the CodePawl stack into public.products.

Mirrors apps/web/components/marketing/products.ts STACK_PRODUCTS.

Run with:

    cd apps/api && uv run python -m seed.products

Reads SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from the environment.
"""

from __future__ import annotations

import os
import sys
from dataclasses import dataclass

from supabase import Client, create_client


@dataclass(frozen=True)
class ProductSeed:
    id: str
    name: str
    slug: str
    github_repo: str
    tagline: str
    status: str
    display_order: int


PRODUCTS: tuple[ProductSeed, ...] = (
    ProductSeed(
        id="trace",
        name="TracePawl",
        slug="trace",
        github_repo="codepawl/tracepawl",
        tagline="Failure diagnosis and replay for coding agents.",
        status="pre-alpha",
        display_order=1,
    ),
    ProductSeed(
        id="mempawl",
        name="Mempawl",
        slug="mempawl",
        github_repo="codepawl/mempawl",
        tagline="Persistent memory for agentic systems.",
        status="pre-alpha",
        display_order=2,
    ),
    ProductSeed(
        id="openpawl",
        name="OpenPawl",
        slug="openpawl",
        github_repo="codepawl/codepawl",
        tagline="Dry-run-first AI code review workflow for GitHub.",
        status="beta",
        display_order=3,
    ),
    ProductSeed(
        id="cachepawl",
        name="CachePawl",
        slug="cachepawl",
        github_repo="codepawl/cachepawl",
        tagline="Optimization for long-horizon agent workloads.",
        status="beta",
        display_order=4,
    ),
)


def _client() -> Client:
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        sys.stderr.write("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.\n")
        sys.exit(2)
    return create_client(url, key)


def seed() -> None:
    """Upsert each product. Idempotent on id."""
    client = _client()
    rows = [p.__dict__ for p in PRODUCTS]
    client.table("products").upsert(rows, on_conflict="id").execute()
    sys.stdout.write(f"Seeded {len(rows)} products.\n")


if __name__ == "__main__":
    seed()
