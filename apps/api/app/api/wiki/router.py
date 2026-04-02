"""Wiki API routes — project documentation pages."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Request

from app.api.community.auth import get_current_user
from app.api.community.models import AuthorInfo
from app.api.wiki.models import (
    ReorderRequest,
    WikiPageCreate,
    WikiPageResponse,
    WikiPageSummary,
    WikiPageUpdate,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/wiki")


def _get_db(request: Request):
    supabase = getattr(request.app.state, "supabase", None)
    if supabase is None:
        raise HTTPException(503, "Wiki not available (Supabase not configured)")
    return supabase


def _build_author(data: dict) -> AuthorInfo | None:
    if not data or not data.get("id"):
        return None
    return AuthorInfo(
        id=data["id"],
        username=data.get("username", ""),
        display_name=data.get("display_name"),
        avatar_url=data.get("avatar_url"),
    )


def _build_response(row: dict) -> WikiPageResponse:
    author_data = row.pop("author", None) or {}
    if isinstance(author_data, list):
        author_data = author_data[0] if author_data else {}
    return WikiPageResponse(
        id=row["id"],
        project_slug=row["project_slug"],
        slug=row["slug"],
        title=row["title"],
        content=row["content"],
        content_format=row.get("content_format", "markdown"),
        parent_id=row.get("parent_id"),
        sort_order=row.get("sort_order", 0),
        author=_build_author(author_data),
        is_published=row.get("is_published", True),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


# ── List pages ──────────────────────────────────────────────────────

@router.get("/{project_slug}")
async def list_wiki_pages(
    project_slug: str,
    request: Request,
) -> list[WikiPageSummary]:
    """List all wiki pages for a project as a flat list (sorted by sort_order)."""
    db = _get_db(request)

    result = await db.from_("wiki_pages").select(
        "id, slug, title, parent_id, sort_order"
    ).eq("project_slug", project_slug).eq(
        "is_published", True
    ).order("sort_order").execute()

    return [
        WikiPageSummary(
            id=row["id"],
            slug=row["slug"],
            title=row["title"],
            parent_id=row.get("parent_id"),
            sort_order=row.get("sort_order", 0),
        )
        for row in (result.data or [])
    ]


# ── Get single page ────────────────────────────────────────────────

@router.get("/{project_slug}/{page_slug}")
async def get_wiki_page(
    project_slug: str,
    page_slug: str,
    request: Request,
) -> WikiPageResponse:
    db = _get_db(request)

    result = await db.from_("wiki_pages").select(
        "*, author:profiles!author_id(id, username, display_name, avatar_url)"
    ).eq("project_slug", project_slug).eq(
        "slug", page_slug
    ).maybe_single().execute()

    row = getattr(result, "data", None)
    if not row:
        raise HTTPException(404, "Wiki page not found")

    return _build_response(row)


# ── Create page ─────────────────────────────────────────────────────

@router.post("/{project_slug}")
async def create_wiki_page(
    project_slug: str,
    data: WikiPageCreate,
    request: Request,
    user_id: str = Depends(get_current_user),
) -> WikiPageResponse:
    db = _get_db(request)

    insert_data = {
        "project_slug": project_slug,
        "slug": data.slug,
        "title": data.title,
        "content": data.content,
        "parent_id": data.parent_id,
        "sort_order": data.sort_order,
        "author_id": user_id,
    }

    try:
        result = await db.from_("wiki_pages").insert(insert_data).execute()
    except Exception as e:
        if "duplicate key" in str(e) or "unique" in str(e).lower():
            raise HTTPException(409, f"A page with slug '{data.slug}' already exists in this project")
        raise

    row = result.data[0]

    # Fetch with author info
    return await get_wiki_page(project_slug, row["slug"], request)


# ── Update page ─────────────────────────────────────────────────────

@router.put("/{project_slug}/{page_slug}")
async def update_wiki_page(
    project_slug: str,
    page_slug: str,
    data: WikiPageUpdate,
    request: Request,
    user_id: str = Depends(get_current_user),
) -> WikiPageResponse:
    db = _get_db(request)

    # Check page exists and user is author or admin
    existing = await db.from_("wiki_pages").select("author_id").eq(
        "project_slug", project_slug
    ).eq("slug", page_slug).maybe_single().execute()

    if not existing.data:
        raise HTTPException(404, "Wiki page not found")

    if existing.data["author_id"] != user_id:
        role_res = await db.from_("profiles").select("role").eq(
            "id", user_id
        ).single().execute()
        if (role_res.data or {}).get("role") != "admin":
            raise HTTPException(403, "Not authorized")

    updates = {k: v for k, v in data.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(422, "No fields to update")

    await db.from_("wiki_pages").update(updates).eq(
        "project_slug", project_slug
    ).eq("slug", page_slug).execute()

    return await get_wiki_page(project_slug, page_slug, request)


# ── Delete page ─────────────────────────────────────────────────────

@router.delete("/{project_slug}/{page_slug}")
async def delete_wiki_page(
    project_slug: str,
    page_slug: str,
    request: Request,
    user_id: str = Depends(get_current_user),
) -> dict:
    db = _get_db(request)

    # Admin only
    role_res = await db.from_("profiles").select("role").eq(
        "id", user_id
    ).single().execute()
    if (role_res.data or {}).get("role") != "admin":
        raise HTTPException(403, "Admin access required")

    result = await db.from_("wiki_pages").delete().eq(
        "project_slug", project_slug
    ).eq("slug", page_slug).execute()

    if not result.data:
        raise HTTPException(404, "Wiki page not found")

    return {"ok": True}


# ── Reorder pages ──────────────────────────────────────────────────

@router.patch("/{project_slug}/reorder")
async def reorder_wiki_pages(
    project_slug: str,
    data: ReorderRequest,
    request: Request,
    user_id: str = Depends(get_current_user),
) -> dict:
    db = _get_db(request)

    # Admin only
    role_res = await db.from_("profiles").select("role").eq(
        "id", user_id
    ).single().execute()
    if (role_res.data or {}).get("role") != "admin":
        raise HTTPException(403, "Admin access required")

    for item in data.items:
        await db.from_("wiki_pages").update({
            "sort_order": item.sort_order,
            "parent_id": item.parent_id,
        }).eq("id", item.id).execute()

    return {"ok": True}
