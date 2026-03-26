"""Community API routes — posts, comments, votes, flags."""

from __future__ import annotations

import math
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request

from app.api.community.auth import get_current_user
from app.api.community.models import (
    AuthorInfo,
    CommentCreate,
    CommentResponse,
    FlagCreate,
    PostCreate,
    PostListResponse,
    PostResponse,
    VoteRequest,
)

router = APIRouter(prefix="/api/community")


def _get_db(request: Request):
    """Get the Supabase client from app state."""
    supabase = getattr(request.app.state, "supabase", None)
    if supabase is None:
        raise HTTPException(503, "Community not available (Supabase not configured)")
    return supabase


def _build_author(profile: dict) -> AuthorInfo:
    return AuthorInfo(
        id=profile["id"],
        username=profile["username"],
        display_name=profile.get("display_name"),
        avatar_url=profile.get("avatar_url"),
    )


# ── Posts ────────────────────────────────────────────────────────────

@router.get("/posts")
async def list_posts(
    request: Request,
    sort: str = "ranked",
    type: Optional[str] = None,
    page: int = 1,
    per_page: int = 20,
) -> PostListResponse:
    db = _get_db(request)

    # Build query
    query = db.from_("posts").select(
        "*, author:profiles!author_id(id, username, display_name, avatar_url)",
        count="exact",
    )

    if type:
        query = query.eq("type", type)

    if sort == "new":
        query = query.order("created_at", desc=True)
    else:
        # Ranked: order by score desc, then created_at desc as tiebreaker
        # Real ranking computed client-side or via calculate_rank()
        query = query.order("score", desc=True).order("created_at", desc=True)

    offset = (page - 1) * per_page
    query = query.range(offset, offset + per_page - 1)

    result = query.execute()
    total = result.count or 0

    posts = []
    for row in result.data:
        author_data = row.pop("author", None) or {}
        age_hours = 0
        if row.get("created_at"):
            from datetime import datetime, timezone
            created = datetime.fromisoformat(row["created_at"].replace("Z", "+00:00"))
            age_hours = (datetime.now(timezone.utc) - created).total_seconds() / 3600

        rank = (max(row.get("score", 0), 0)) / ((age_hours + 2) ** 1.8)

        posts.append(PostResponse(
            id=row["id"],
            author=_build_author(author_data),
            type=row["type"],
            title=row["title"],
            url=row.get("url"),
            content=row.get("content"),
            score=row.get("score", 0),
            comment_count=row.get("comment_count", 0),
            is_auto=row.get("is_auto", False),
            source_article_id=row.get("source_article_id"),
            created_at=row["created_at"],
            updated_at=row["updated_at"],
            rank=rank,
        ))

    # Re-sort by rank if ranked view
    if sort == "ranked":
        posts.sort(key=lambda p: p.rank, reverse=True)

    return PostListResponse(
        posts=posts,
        total=total,
        page=page,
        total_pages=math.ceil(total / per_page) if total > 0 else 0,
    )


@router.get("/posts/{post_id}")
async def get_post(post_id: str, request: Request) -> PostResponse:
    db = _get_db(request)

    result = db.from_("posts").select(
        "*, author:profiles!author_id(id, username, display_name, avatar_url)"
    ).eq("id", post_id).single().execute()

    if not result.data:
        raise HTTPException(404, "Post not found")

    row = result.data
    author_data = row.pop("author", None) or {}

    return PostResponse(
        id=row["id"],
        author=_build_author(author_data),
        type=row["type"],
        title=row["title"],
        url=row.get("url"),
        content=row.get("content"),
        score=row.get("score", 0),
        comment_count=row.get("comment_count", 0),
        is_auto=row.get("is_auto", False),
        source_article_id=row.get("source_article_id"),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


@router.post("/posts", status_code=201)
async def create_post(
    data: PostCreate,
    request: Request,
    user_id: str = Depends(get_current_user),
) -> PostResponse:
    db = _get_db(request)

    # Validate: link posts need url, text/show posts need content
    if data.type == "link" and not data.url:
        raise HTTPException(400, "Link posts require a URL")
    if data.type in ("text", "show") and not data.content:
        raise HTTPException(400, "Text/show posts require content")

    insert_data = {
        "author_id": user_id,
        "type": data.type,
        "title": data.title,
        "url": data.url,
        "content": data.content,
    }

    result = db.from_("posts").insert(insert_data).execute()
    if not result.data:
        raise HTTPException(500, "Failed to create post")

    row = result.data[0]

    # Fetch author profile
    profile = db.from_("profiles").select(
        "id, username, display_name, avatar_url"
    ).eq("id", user_id).single().execute()

    return PostResponse(
        id=row["id"],
        author=_build_author(profile.data),
        type=row["type"],
        title=row["title"],
        url=row.get("url"),
        content=row.get("content"),
        score=0,
        comment_count=0,
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


# ── Comments ─────────────────────────────────────────────────────────

@router.get("/posts/{post_id}/comments")
async def list_comments(post_id: str, request: Request) -> list[CommentResponse]:
    db = _get_db(request)

    result = db.from_("comments").select(
        "*, author:profiles!author_id(id, username, display_name, avatar_url)"
    ).eq("post_id", post_id).order("created_at").execute()

    comments = []
    for row in result.data:
        author_data = row.pop("author", None) or {}
        comments.append(CommentResponse(
            id=row["id"],
            post_id=row["post_id"],
            parent_id=row.get("parent_id"),
            author=_build_author(author_data),
            content=row["content"],
            score=row.get("score", 0),
            created_at=row["created_at"],
        ))

    return comments


@router.post("/posts/{post_id}/comments", status_code=201)
async def create_comment(
    post_id: str,
    data: CommentCreate,
    request: Request,
    user_id: str = Depends(get_current_user),
) -> CommentResponse:
    db = _get_db(request)

    # Verify post exists
    post = db.from_("posts").select("id").eq("id", post_id).single().execute()
    if not post.data:
        raise HTTPException(404, "Post not found")

    # If replying, verify parent comment exists
    if data.parent_id:
        parent = db.from_("comments").select("id").eq("id", data.parent_id).eq("post_id", post_id).single().execute()
        if not parent.data:
            raise HTTPException(404, "Parent comment not found")

    insert_data = {
        "post_id": post_id,
        "parent_id": data.parent_id,
        "author_id": user_id,
        "content": data.content,
    }

    result = db.from_("comments").insert(insert_data).execute()
    if not result.data:
        raise HTTPException(500, "Failed to create comment")

    # Increment comment_count on post
    db.rpc("increment_comment_count", {"post_id_input": post_id}).execute()

    row = result.data[0]
    profile = db.from_("profiles").select(
        "id, username, display_name, avatar_url"
    ).eq("id", user_id).single().execute()

    return CommentResponse(
        id=row["id"],
        post_id=row["post_id"],
        parent_id=row.get("parent_id"),
        author=_build_author(profile.data),
        content=row["content"],
        score=0,
        created_at=row["created_at"],
    )


# ── Votes ────────────────────────────────────────────────────────────

@router.post("/vote")
async def vote(
    data: VoteRequest,
    request: Request,
    user_id: str = Depends(get_current_user),
) -> dict:
    db = _get_db(request)

    if data.value == 0:
        # Remove vote
        db.from_("votes").delete().match({
            "user_id": user_id,
            "target_id": data.target_id,
            "target_type": data.target_type,
        }).execute()
    else:
        # Upsert vote
        db.from_("votes").upsert({
            "user_id": user_id,
            "target_id": data.target_id,
            "target_type": data.target_type,
            "value": data.value,
        }).execute()

    # Recalculate score on the target
    score_result = db.from_("votes").select(
        "value"
    ).eq("target_id", data.target_id).eq("target_type", data.target_type).execute()

    new_score = sum(v["value"] for v in score_result.data)

    # Update score on the target table
    target_table = "posts" if data.target_type == "post" else "comments"
    db.from_(target_table).update({"score": new_score}).eq("id", data.target_id).execute()

    return {"score": new_score, "user_vote": data.value}


# ── Flags ────────────────────────────────────────────────────────────

@router.post("/flag", status_code=201)
async def flag_content(
    data: FlagCreate,
    request: Request,
    user_id: str = Depends(get_current_user),
) -> dict:
    db = _get_db(request)

    try:
        db.from_("flags").insert({
            "reporter_id": user_id,
            "target_id": data.target_id,
            "target_type": data.target_type,
            "reason": data.reason,
        }).execute()
    except Exception:
        raise HTTPException(400, "Already flagged this content")

    return {"ok": True}
