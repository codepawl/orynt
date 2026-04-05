"""Blog API routes — posts, drafts, image upload."""

from __future__ import annotations

import logging
import math
import re
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response, UploadFile, File

from app.api.community.auth import get_current_user
from app.api.blog.models import (
    AuthorInfo,
    BlogPostCreate,
    BlogPostListResponse,
    BlogPostResponse,
    BlogPostStatusUpdate,
    BlogPostUpdate,
    ImageUploadResponse,
    _reading_time,
    _slugify,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/blog")

_ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/gif", "image/webp"}
_MAX_IMAGE_BYTES = 5 * 1024 * 1024  # 5 MB


def _get_db(request: Request):
    supabase = getattr(request.app.state, "supabase", None)
    if supabase is None:
        raise HTTPException(503, "Blog not available (Supabase not configured)")
    return supabase


def _build_author(profile: dict) -> AuthorInfo:
    return AuthorInfo(
        id=profile["id"],
        username=profile["username"],
        display_name=profile.get("display_name"),
        avatar_url=profile.get("avatar_url"),
    )


def _build_post(row: dict) -> BlogPostResponse:
    author_data = row.get("author") or {}
    if isinstance(author_data, list):
        author_data = author_data[0] if author_data else {}
    return BlogPostResponse(
        id=row["id"],
        author=_build_author(author_data),
        title=row["title"],
        slug=row["slug"],
        content=row["content"],
        content_markdown=row.get("content_markdown"),
        summary=row.get("summary"),
        cover_image_url=row.get("cover_image_url"),
        tags=row.get("tags") or "",
        status=row["status"],
        reading_time_minutes=row.get("reading_time_minutes"),
        published_at=row.get("published_at"),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


async def _get_user_role(db, user_id: str) -> str:
    result = await db.from_("profiles").select("role").eq("id", user_id).single().execute()
    return (result.data or {}).get("role", "user")


async def _unique_slug(db, base: str) -> str:
    slug = base
    counter = 1
    while True:
        result = await db.from_("blog_posts").select("id").eq("slug", slug).execute()
        if not result.data:
            return slug
        slug = f"{base}-{counter}"
        counter += 1


# ── Public endpoints ─────────────────────────────────────────────────

@router.get("/posts")
async def list_posts(
    request: Request,
    page: int = 1,
    per_page: int = 20,
    tag: Optional[str] = None,
) -> BlogPostListResponse:
    db = _get_db(request)

    query = db.from_("blog_posts").select(
        "*, author:profiles!author_id(id, username, display_name, avatar_url)",
        count="exact",
    ).eq("status", "published").order("published_at", desc=True)

    if tag:
        query = query.ilike("tags", f"%{tag}%")

    offset = (page - 1) * per_page
    query = query.range(offset, offset + per_page - 1)

    result = await query.execute()
    total = result.count or 0
    posts = [_build_post(row) for row in (result.data or [])]

    return BlogPostListResponse(
        posts=posts,
        total=total,
        page=page,
        total_pages=math.ceil(total / per_page) if per_page else 1,
    )


@router.get("/posts/{slug}")
async def get_post(request: Request, slug: str) -> BlogPostResponse:
    db = _get_db(request)

    result = await db.from_("blog_posts").select(
        "*, author:profiles!author_id(id, username, display_name, avatar_url)"
    ).eq("slug", slug).eq("status", "published").maybe_single().execute()

    post_data = getattr(result, "data", None)
    if not post_data:
        raise HTTPException(404, "Post not found")
    return _build_post(post_data)


# ── Auth-required endpoints ──────────────────────────────────────────

@router.get("/my-posts")
async def my_posts(
    request: Request,
    user_id: str = Depends(get_current_user),
) -> BlogPostListResponse:
    db = _get_db(request)

    result = await db.from_("blog_posts").select(
        "*, author:profiles!author_id(id, username, display_name, avatar_url)",
        count="exact",
    ).eq("author_id", user_id).order("updated_at", desc=True).execute()

    total = result.count or 0
    posts = [_build_post(row) for row in (result.data or [])]

    return BlogPostListResponse(
        posts=posts,
        total=total,
        page=1,
        total_pages=1,
    )


@router.post("/posts", status_code=201)
async def create_post(
    request: Request,
    body: BlogPostCreate,
    user_id: str = Depends(get_current_user),
) -> BlogPostResponse:
    db = _get_db(request)

    base_slug = _slugify(body.title) or f"post-{uuid.uuid4().hex[:8]}"
    slug = await _unique_slug(db, base_slug)
    reading_time = _reading_time(body.content) if body.content else 1

    row = {
        "author_id": user_id,
        "title": body.title,
        "slug": slug,
        "content": body.content,
        "content_markdown": body.content_markdown,
        "summary": body.summary,
        "cover_image_url": body.cover_image_url,
        "tags": body.tags,
        "status": body.status,
        "reading_time_minutes": reading_time,
    }

    insert_result = await db.from_("blog_posts").insert(row).execute()
    if not insert_result.data:
        raise HTTPException(500, "Failed to create post")
    new_id = insert_result.data[0]["id"]
    result = await db.from_("blog_posts").select(
        "*, author:profiles!author_id(id, username, display_name, avatar_url)"
    ).eq("id", new_id).single().execute()

    if not result.data:
        raise HTTPException(500, "Failed to create post")
    return _build_post(result.data)


@router.put("/posts/{post_id}")
async def update_post(
    request: Request,
    post_id: str,
    body: BlogPostUpdate,
    user_id: str = Depends(get_current_user),
) -> BlogPostResponse:
    db = _get_db(request)

    # Fetch post to check ownership
    existing = await db.from_("blog_posts").select("author_id, status").eq("id", post_id).maybe_single().execute()
    existing_data = getattr(existing, "data", None)
    if not existing_data:
        raise HTTPException(404, "Post not found")

    role = await _get_user_role(db, user_id)
    is_owner = existing_data["author_id"] == user_id
    if not is_owner and role != "admin":
        raise HTTPException(403, "Not authorized to edit this post")

    updates: dict = {}
    if body.title is not None:
        updates["title"] = body.title
    if body.content is not None:
        updates["content"] = body.content
        updates["reading_time_minutes"] = _reading_time(body.content)
    if body.content_markdown is not None:
        updates["content_markdown"] = body.content_markdown
    if body.summary is not None:
        updates["summary"] = body.summary
    if body.cover_image_url is not None:
        updates["cover_image_url"] = body.cover_image_url
    if body.tags is not None:
        updates["tags"] = body.tags

    if not updates:
        raise HTTPException(422, "No fields to update")

    await db.from_("blog_posts").update(updates).eq("id", post_id).execute()
    result = await db.from_("blog_posts").select(
        "*, author:profiles!author_id(id, username, display_name, avatar_url)"
    ).eq("id", post_id).single().execute()

    if not result.data:
        raise HTTPException(500, "Failed to update post")
    return _build_post(result.data)


@router.patch("/posts/{post_id}/status")
async def update_status(
    request: Request,
    post_id: str,
    body: BlogPostStatusUpdate,
    user_id: str = Depends(get_current_user),
) -> BlogPostResponse:
    db = _get_db(request)

    existing = await db.from_("blog_posts").select("author_id, status").eq("id", post_id).maybe_single().execute()
    existing_data = getattr(existing, "data", None)
    if not existing_data:
        raise HTTPException(404, "Post not found")

    role = await _get_user_role(db, user_id)
    is_owner = existing_data["author_id"] == user_id

    # Only admin can publish; authors can submit for review or retract to draft
    if body.status == "published" and role != "admin":
        raise HTTPException(403, "Only admins can publish posts")
    if body.status in ("draft", "review") and not is_owner and role != "admin":
        raise HTTPException(403, "Not authorized to change status of this post")

    updates: dict = {"status": body.status}
    if body.status == "published":
        updates["published_at"] = datetime.now(timezone.utc).isoformat()

    await db.from_("blog_posts").update(updates).eq("id", post_id).execute()
    result = await db.from_("blog_posts").select(
        "*, author:profiles!author_id(id, username, display_name, avatar_url)"
    ).eq("id", post_id).single().execute()

    if not result.data:
        raise HTTPException(500, "Failed to update status")

    post = _build_post(result.data)

    if body.status == "published":
        await _auto_share_blog_post(db, post)

    return post


async def _auto_share_blog_post(db, post: "BlogPostResponse") -> None:
    """Create a community link post for a newly published blog post (non-fatal)."""
    try:
        url = f"/blog/{post.slug}"
        existing = await db.from_("posts").select("id").eq("url", url).maybe_single().execute()
        if getattr(existing, "data", None):
            return

        post_data = {
            "author_id": post.author.id,
            "type": "link",
            "title": post.title,
            "url": url,
            "tags": post.tags or "",
            "is_auto": True,
        }
        await db.from_("posts").insert(post_data).execute()
        logger.info("Auto-shared blog post %s to community", post.slug)
    except Exception:
        logger.exception("Failed to auto-share blog post %s", post.slug)


@router.delete("/posts/{post_id}", status_code=204)
async def delete_post(
    request: Request,
    post_id: str,
    user_id: str = Depends(get_current_user),
):
    db = _get_db(request)

    existing = await db.from_("blog_posts").select("author_id").eq("id", post_id).maybe_single().execute()
    existing_data = getattr(existing, "data", None)
    if not existing_data:
        raise HTTPException(404, "Post not found")

    role = await _get_user_role(db, user_id)
    is_owner = existing_data["author_id"] == user_id
    if not is_owner and role != "admin":
        raise HTTPException(403, "Not authorized to delete this post")

    await db.from_("blog_posts").delete().eq("id", post_id).execute()
    return Response(status_code=204)


@router.get("/admin/posts")
async def admin_list_posts(
    request: Request,
    page: int = 1,
    per_page: int = 20,
    status: Optional[str] = None,
    user_id: str = Depends(get_current_user),
) -> BlogPostListResponse:
    """Admin-only: list all posts across all authors, optionally filtered by status."""
    db = _get_db(request)

    role = await _get_user_role(db, user_id)
    if role != "admin":
        raise HTTPException(403, "Admin role required")

    query = db.from_("blog_posts").select(
        "*, author:profiles!author_id(id, username, display_name, avatar_url)",
        count="exact",
    ).order("updated_at", desc=True)

    if status:
        query = query.eq("status", status)

    offset = (page - 1) * per_page
    query = query.range(offset, offset + per_page - 1)

    result = await query.execute()
    total = result.count or 0
    posts = [_build_post(row) for row in (result.data or [])]

    return BlogPostListResponse(
        posts=posts,
        total=total,
        page=page,
        total_pages=math.ceil(total / per_page) if per_page else 1,
    )


@router.post("/upload-image")
async def upload_image(
    request: Request,
    file: UploadFile = File(...),
    user_id: str = Depends(get_current_user),
) -> ImageUploadResponse:
    db = _get_db(request)

    if file.content_type not in _ALLOWED_IMAGE_TYPES:
        raise HTTPException(400, f"Unsupported image type: {file.content_type}. Allowed: jpg, png, gif, webp")

    data = await file.read()
    if len(data) > _MAX_IMAGE_BYTES:
        raise HTTPException(400, "Image exceeds 5 MB limit")

    timestamp = int(datetime.now(timezone.utc).timestamp())
    safe_name = re.sub(r"[^\w.-]", "_", file.filename or "image")
    path = f"{user_id}/{timestamp}_{safe_name}"

    try:
        await db.storage.from_("blog-images").upload(
            path,
            data,
            {"content-type": file.content_type, "upsert": "false"},
        )
    except Exception as e:
        logger.error("Storage upload failed: %s", e)
        raise HTTPException(500, "Image upload failed")

    public_url = db.storage.from_("blog-images").get_public_url(path)
    return ImageUploadResponse(url=public_url)
