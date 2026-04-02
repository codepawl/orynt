"""Community API routes — posts, comments, votes, flags."""

from __future__ import annotations

import logging
import math
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, Request, Response, UploadFile

from app.api.community.auth import get_current_user
from app.api.community.notifications import create_notification
from app.api.community.models import (
    AuthorInfo,
    CommentCreate,
    CommentResponse,
    FlagCreate,
    PostCreate,
    PostListResponse,
    PostResponse,
    TagMerge,
    TopComment,
    VoteRequest,
)

logger = logging.getLogger(__name__)

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
    tag: Optional[str] = None,
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
    if tag:
        query = query.ilike("tags", f"%{tag}%")

    if sort == "new":
        query = query.order("created_at", desc=True)
    else:
        query = query.order("score", desc=True).order("created_at", desc=True)

    offset = (page - 1) * per_page
    query = query.range(offset, offset + per_page - 1)

    result = await query.execute()
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
            tags=row.get("tags", ""),
            is_auto=row.get("is_auto", False),
            source_article_id=row.get("source_article_id"),
            created_at=row["created_at"],
            updated_at=row["updated_at"],
            rank=rank,
        ))

    # Re-sort by rank if ranked view
    if sort == "ranked":
        posts.sort(key=lambda p: p.rank, reverse=True)

    # Batch-fetch top comment for each post (non-fatal)
    post_ids = [p.id for p in posts if p.comment_count > 0]
    if post_ids:
        try:
            comments_result = await db.from_("comments").select(
                "post_id, content, score, author:profiles!author_id(username, avatar_url)"
            ).in_("post_id", post_ids).order("score", desc=True).execute()
            # Group by post_id, take first (highest score) per post
            top_by_post: dict[str, TopComment] = {}
            for c in (comments_result.data or []):
                pid = c["post_id"]
                if pid not in top_by_post:
                    author = c.get("author") or {}
                    if isinstance(author, list):
                        author = author[0] if author else {}
                    top_by_post[pid] = TopComment(
                        username=author.get("username", ""),
                        avatar_url=author.get("avatar_url"),
                        content=c["content"][:120],
                    )
            for p in posts:
                if p.id in top_by_post:
                    p.top_comment = top_by_post[p.id]
        except Exception:
            logger.debug("Failed to fetch top comments, skipping", exc_info=True)

    return PostListResponse(
        posts=posts,
        total=total,
        page=page,
        total_pages=math.ceil(total / per_page) if total > 0 else 0,
    )


@router.get("/posts/trending")
async def trending_posts(
    request: Request,
    days: int = 7,
    limit: int = 5,
) -> list[PostResponse]:
    """Top posts by score from the last N days."""
    from datetime import datetime, timezone, timedelta
    db = _get_db(request)
    since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    result = await db.from_("posts").select(
        "*, author:profiles!author_id(id, username, display_name, avatar_url)"
    ).gte("created_at", since).order("score", desc=True).limit(limit).execute()

    posts = []
    for row in (result.data or []):
        author_data = row.pop("author", None) or {}
        posts.append(PostResponse(
            id=row["id"],
            author=_build_author(author_data),
            type=row["type"],
            title=row["title"],
            url=row.get("url"),
            content=row.get("content"),
            score=row.get("score", 0),
            comment_count=row.get("comment_count", 0),
            tags=row.get("tags", ""),
            is_auto=row.get("is_auto", False),
            source_article_id=row.get("source_article_id"),
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        ))
    return posts


@router.get("/posts/{post_id}")
async def get_post(post_id: str, request: Request) -> PostResponse:
    db = _get_db(request)

    result = await db.from_("posts").select(
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
        "tags": data.tags,
    }

    result = await db.from_("posts").insert(insert_data).execute()
    if not result.data:
        raise HTTPException(500, "Failed to create post")

    row = result.data[0]

    # Fetch author profile
    profile = await db.from_("profiles").select(
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
        tags=row.get("tags", ""),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


@router.delete("/posts/{post_id}")
async def delete_post(
    post_id: str,
    request: Request,
    user_id: str = Depends(get_current_user),
):
    db = _get_db(request)

    result = await db.from_("posts").select("author_id").eq("id", post_id).single().execute()
    if not result.data:
        raise HTTPException(404, "Post not found")

    role_result = await db.from_("profiles").select("role").eq("id", user_id).single().execute()
    role = (role_result.data or {}).get("role", "user")
    if result.data["author_id"] != user_id and role != "admin":
        raise HTTPException(403, "You can only delete your own posts")

    await db.from_("posts").delete().eq("id", post_id).execute()
    return Response(status_code=204)


# ── Tags ─────────────────────────────────────────────────────────────

@router.get("/tags/stats")
async def get_tag_stats(request: Request) -> list[dict]:
    """Return all tags with usage counts, sorted by count descending."""
    cache = getattr(request.app.state, "cache", None)
    cache_key = "community:tag_stats"
    if cache:
        cached = cache.get(cache_key)
        if cached is not None:
            return cached

    db = _get_db(request)
    result = await db.from_("posts").select("tags").neq("tags", "").execute()
    counts: dict[str, int] = {}
    for row in (result.data or []):
        for tag in row["tags"].split(","):
            t = tag.strip()
            if t:
                counts[t] = counts.get(t, 0) + 1
    stats = sorted(
        [{"name": k, "count": v} for k, v in counts.items()],
        key=lambda x: x["count"],
        reverse=True,
    )

    if cache:
        cache.set(cache_key, stats)

    return stats


@router.delete("/tags/{tag_name}")
async def delete_tag(
    tag_name: str,
    request: Request,
    user_id: str = Depends(get_current_user),
) -> dict:
    """Remove a tag from all posts (admin only)."""
    db = _get_db(request)
    role_res = await db.from_("profiles").select("role").eq("id", user_id).single().execute()
    if (role_res.data or {}).get("role") != "admin":
        raise HTTPException(403, "Admin role required")
    result = await db.from_("posts").select("id, tags").ilike("tags", f"%{tag_name}%").execute()
    for row in (result.data or []):
        tags = [t.strip() for t in row["tags"].split(",") if t.strip() and t.strip() != tag_name]
        await db.from_("posts").update({"tags": ", ".join(tags)}).eq("id", row["id"]).execute()
    return {"ok": True}


@router.post("/tags/merge")
async def merge_tags(
    data: TagMerge,
    request: Request,
    user_id: str = Depends(get_current_user),
) -> dict:
    """Replace all occurrences of from_tag with to_tag across all posts (admin only)."""
    db = _get_db(request)
    role_res = await db.from_("profiles").select("role").eq("id", user_id).single().execute()
    if (role_res.data or {}).get("role") != "admin":
        raise HTTPException(403, "Admin role required")
    result = await db.from_("posts").select("id, tags").ilike("tags", f"%{data.from_tag}%").execute()
    for row in (result.data or []):
        tags = [t.strip() for t in row["tags"].split(",") if t.strip()]
        tags = list(dict.fromkeys([data.to_tag if t == data.from_tag else t for t in tags]))
        await db.from_("posts").update({"tags": ", ".join(tags)}).eq("id", row["id"]).execute()
    return {"ok": True}


@router.delete("/comments/{comment_id}")
async def delete_comment(
    comment_id: str,
    request: Request,
    user_id: str = Depends(get_current_user),
):
    db = _get_db(request)

    result = await db.from_("comments").select("author_id").eq("id", comment_id).single().execute()
    if not result.data:
        raise HTTPException(404, "Comment not found")

    role_result = await db.from_("profiles").select("role").eq("id", user_id).single().execute()
    role = (role_result.data or {}).get("role", "user")
    if result.data["author_id"] != user_id and role != "admin":
        raise HTTPException(403, "You can only delete your own comments")

    await db.from_("comments").delete().eq("id", comment_id).execute()
    return Response(status_code=204)


@router.patch("/users/{target_user_id}/ban")
async def ban_user(
    target_user_id: str,
    request: Request,
    user_id: str = Depends(get_current_user),
):
    db = _get_db(request)

    role_result = await db.from_("profiles").select("role").eq("id", user_id).single().execute()
    role = (role_result.data or {}).get("role", "user")
    if role != "admin":
        raise HTTPException(403, "Admin role required")

    target = await db.from_("profiles").select("id, role").eq("id", target_user_id).maybe_single().execute()
    if not getattr(target, "data", None):
        raise HTTPException(404, "User not found")
    if target.data.get("role") == "admin":
        raise HTTPException(403, "Cannot ban another admin")

    await db.from_("profiles").update({"role": "banned"}).eq("id", target_user_id).execute()
    return {"ok": True}


# ── Comments ─────────────────────────────────────────────────────────

@router.get("/posts/{post_id}/comments")
async def list_comments(post_id: str, request: Request) -> list[CommentResponse]:
    db = _get_db(request)

    result = await db.from_("comments").select(
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
    post = await db.from_("posts").select("id").eq("id", post_id).single().execute()
    if not post.data:
        raise HTTPException(404, "Post not found")

    # If replying, verify parent comment exists
    if data.parent_id:
        parent = await db.from_("comments").select("id").eq("id", data.parent_id).eq("post_id", post_id).single().execute()
        if not parent.data:
            raise HTTPException(404, "Parent comment not found")

    insert_data = {
        "post_id": post_id,
        "parent_id": data.parent_id,
        "author_id": user_id,
        "content": data.content,
    }

    result = await db.from_("comments").insert(insert_data).execute()
    if not result.data:
        raise HTTPException(500, "Failed to create comment")

    # Increment comment_count on post
    await db.rpc("increment_comment_count", {"post_id_input": post_id}).execute()

    row = result.data[0]
    profile = await db.from_("profiles").select(
        "id, username, display_name, avatar_url"
    ).eq("id", user_id).single().execute()

    commenter_name = profile.data.get("username", "Someone") if profile.data else "Someone"

    # Notify: if replying to a comment, notify the parent comment author
    if data.parent_id:
        parent_comment = await db.from_("comments").select("author_id").eq(
            "id", data.parent_id
        ).single().execute()
        if parent_comment.data:
            await create_notification(
                db,
                user_id=parent_comment.data["author_id"],
                type="comment_reply",
                actor_id=user_id,
                message=f"{commenter_name} replied to your comment",
                post_id=post_id,
                comment_id=row["id"],
            )
    else:
        # Top-level comment: notify the post author
        post_data = await db.from_("posts").select("author_id").eq(
            "id", post_id
        ).single().execute()
        if post_data.data:
            await create_notification(
                db,
                user_id=post_data.data["author_id"],
                type="post_comment",
                actor_id=user_id,
                message=f"{commenter_name} commented on your post",
                post_id=post_id,
                comment_id=row["id"],
            )

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

    # Karma thresholds: downvote requires 50+, flag checked elsewhere
    if data.value == -1:
        profile_result = await db.from_("profiles").select("karma").eq("id", user_id).single().execute()
        user_karma = (profile_result.data or {}).get("karma", 0)
        if user_karma < 50:
            raise HTTPException(403, "You need at least 50 karma to downvote")

    # Fetch previous vote (for karma delta calculation)
    old_vote_result = await db.from_("votes").select("value").match({
        "user_id": user_id,
        "target_id": data.target_id,
        "target_type": data.target_type,
    }).maybe_single().execute()
    old_data = getattr(old_vote_result, "data", None)
    old_value = (old_data or {}).get("value", 0)

    if data.value == 0:
        # Remove vote
        await db.from_("votes").delete().match({
            "user_id": user_id,
            "target_id": data.target_id,
            "target_type": data.target_type,
        }).execute()
    else:
        # Upsert vote
        await db.from_("votes").upsert({
            "user_id": user_id,
            "target_id": data.target_id,
            "target_type": data.target_type,
            "value": data.value,
        }).execute()

    # Recalculate score on the target
    score_result = await db.from_("votes").select(
        "value"
    ).eq("target_id", data.target_id).eq("target_type", data.target_type).execute()

    new_score = sum(v["value"] for v in score_result.data)

    # Update score on the target table
    target_table = {"post": "posts", "comment": "comments", "reproduction": "reproductions"}[data.target_type]
    await db.from_(target_table).update({"score": new_score}).eq("id", data.target_id).execute()

    # Update karma on the target author's profile (non-fatal)
    karma_delta = data.value - old_value  # e.g. 0->1 = +1, 1->-1 = -2, 1->0 = -1
    if karma_delta != 0:
        try:
            target_result = await db.from_(target_table).select("author_id").eq("id", data.target_id).single().execute()
            if target_result.data:
                author_id = target_result.data["author_id"]
                if author_id != user_id:
                    await db.rpc("increment_karma", {
                        "user_id_input": author_id,
                        "delta": karma_delta,
                    }).execute()
        except Exception:
            logger.warning("Karma update failed (RPC may not exist yet)", exc_info=True)

    return {"score": new_score, "user_vote": data.value}


@router.get("/votes/mine")
async def get_my_votes(
    request: Request,
    target_type: str = "post",
    target_ids: str = "",
    user_id: str = Depends(get_current_user),
) -> dict:
    """Return the current user's votes for given target IDs.

    Query params:
        target_type: "post" or "comment"
        target_ids: comma-separated UUIDs
    Returns:
        {"votes": {"<target_id>": <value>, ...}}
    """
    db = _get_db(request)

    ids = [tid.strip() for tid in target_ids.split(",") if tid.strip()]
    if not ids or len(ids) > 100:
        return {"votes": {}}

    result = await db.from_("votes").select("target_id, value").eq(
        "user_id", user_id
    ).eq("target_type", target_type).in_("target_id", ids).execute()

    votes = {row["target_id"]: row["value"] for row in result.data}
    return {"votes": votes}


# ── Flags ────────────────────────────────────────────────────────────

@router.post("/flag", status_code=201)
async def flag_content(
    data: FlagCreate,
    request: Request,
    user_id: str = Depends(get_current_user),
) -> dict:
    db = _get_db(request)

    # Karma threshold: flagging requires 100+
    profile_result = await db.from_("profiles").select("karma").eq("id", user_id).single().execute()
    user_karma = (profile_result.data or {}).get("karma", 0)
    if user_karma < 100:
        raise HTTPException(403, "You need at least 100 karma to flag content")

    try:
        await db.from_("flags").insert({
            "reporter_id": user_id,
            "target_id": data.target_id,
            "target_type": data.target_type,
            "reason": data.reason,
        }).execute()
    except Exception:
        raise HTTPException(400, "Already flagged this content")

    return {"ok": True}


# ── Current user ─────────────────────────────────────────────────────

@router.get("/me")
async def get_me(
    request: Request,
    user_id: str = Depends(get_current_user),
) -> dict:
    """Return the authenticated user's profile (id, username, role)."""
    db = _get_db(request)
    result = await db.from_("profiles").select(
        "id, username, display_name, bio, avatar_url, role, karma"
    ).eq("id", user_id).maybe_single().execute()

    profile = getattr(result, "data", None)
    if not profile:
        raise HTTPException(404, "Profile not found")
    return profile


@router.patch("/me")
async def update_me(
    request: Request,
    user_id: str = Depends(get_current_user),
) -> dict:
    """Update the authenticated user's own profile (display_name, bio, avatar_url)."""
    db = _get_db(request)
    body = await request.json()
    allowed = {"display_name", "bio", "avatar_url"}
    updates = {k: v for k, v in body.items() if k in allowed}
    if not updates:
        raise HTTPException(422, "No valid fields to update")

    # Validate field lengths
    if "display_name" in updates and updates["display_name"]:
        updates["display_name"] = updates["display_name"].strip()
        if len(updates["display_name"]) > 50:
            raise HTTPException(422, "Display name must be 50 characters or fewer")
    if "bio" in updates and updates["bio"]:
        updates["bio"] = updates["bio"].strip()
        if len(updates["bio"]) > 300:
            raise HTTPException(422, "Bio must be 300 characters or fewer")

    await db.from_("profiles").update(updates).eq("id", user_id).execute()
    result = await db.from_("profiles").select(
        "id, username, display_name, avatar_url, role, karma, bio"
    ).eq("id", user_id).maybe_single().execute()
    profile = getattr(result, "data", None)
    if not profile:
        raise HTTPException(404, "Profile not found")
    return profile


# ── Avatar upload ───────────────────────────────────────────────────

_ALLOWED_AVATAR_TYPES = {"image/jpeg", "image/png", "image/gif", "image/webp"}
_MAX_AVATAR_BYTES = 2 * 1024 * 1024  # 2 MB


@router.post("/upload-avatar")
async def upload_avatar(
    request: Request,
    file: UploadFile = File(...),
    user_id: str = Depends(get_current_user),
) -> dict:
    """Upload an avatar image to Supabase Storage and update the profile."""
    db = _get_db(request)

    if file.content_type not in _ALLOWED_AVATAR_TYPES:
        raise HTTPException(
            400,
            f"Unsupported image type: {file.content_type}. Allowed: jpg, png, gif, webp",
        )

    data = await file.read()
    if len(data) > _MAX_AVATAR_BYTES:
        raise HTTPException(400, "Image exceeds 2 MB limit")

    ext = file.content_type.split("/")[-1]
    if ext == "jpeg":
        ext = "jpg"

    timestamp = int(datetime.now(timezone.utc).timestamp())
    path = f"{user_id}/{timestamp}.{ext}"

    # Delete old avatar files for this user
    try:
        existing = db.storage.from_("avatars").list(user_id)
        if existing:
            old_paths = [f"{user_id}/{f['name']}" for f in existing]
            if old_paths:
                db.storage.from_("avatars").remove(old_paths)
    except Exception:
        logger.warning("Failed to clean old avatars", exc_info=True)

    # Upload new avatar
    try:
        db.storage.from_("avatars").upload(
            path,
            data,
            {"content-type": file.content_type, "upsert": "false"},
        )
    except Exception as e:
        logger.error("Avatar upload failed: %s", e)
        raise HTTPException(500, "Avatar upload failed")

    public_url = db.storage.from_("avatars").get_public_url(path)

    # Update profile with new avatar URL
    await db.from_("profiles").update({"avatar_url": public_url}).eq(
        "id", user_id
    ).execute()

    return {"url": public_url}


@router.delete("/avatar")
async def delete_avatar(
    request: Request,
    user_id: str = Depends(get_current_user),
) -> dict:
    """Remove the user's avatar from storage and clear the profile URL."""
    db = _get_db(request)

    # Remove all files in user's avatar folder
    try:
        existing = db.storage.from_("avatars").list(user_id)
        if existing:
            old_paths = [f"{user_id}/{f['name']}" for f in existing]
            db.storage.from_("avatars").remove(old_paths)
    except Exception:
        logger.warning("Failed to remove avatar files", exc_info=True)

    # Clear avatar_url in profile
    await db.from_("profiles").update({"avatar_url": None}).eq(
        "id", user_id
    ).execute()
    return {"ok": True}


# ── URL preview ──────────────────────────────────────────────────────

@router.get("/url-preview")
async def url_preview(url: str) -> dict:
    """Lightweight HEAD check for a URL — returns {valid, error?}."""
    import httpx
    from urllib.parse import urlparse

    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        return {"valid": False, "error": "Only http/https URLs are supported"}
    hostname = (parsed.hostname or "").lower()
    if hostname in ("localhost", "127.0.0.1", "0.0.0.0") or hostname.startswith("192.168.") or hostname.startswith("10.") or hostname.endswith(".local"):
        return {"valid": False, "error": "Private/local URLs are not allowed"}

    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=5.0) as client:
            resp = await client.head(url, headers={"User-Agent": "CodePawl Link Checker/1.0"})
            if resp.status_code < 400:
                return {"valid": True}
            return {"valid": False, "error": f"Page returned status {resp.status_code}"}
    except httpx.TimeoutException:
        return {"valid": False, "error": "Could not reach URL (timeout)"}
    except httpx.ConnectError:
        return {"valid": False, "error": "Could not reach URL"}
    except Exception:
        return {"valid": False, "error": "Could not verify URL"}


# ── Cross-linking ────────────────────────────────────────────────────

@router.get("/by-article/{article_id}")
async def get_post_by_article(article_id: str, request: Request) -> dict:
    """Find community post for a given news article ID (for cross-linking)."""
    db = _get_db(request)
    result = await db.from_("posts").select("id").eq(
        "source_article_id", article_id
    ).maybe_single().execute()

    if not result.data:
        raise HTTPException(404, "No community post for this article")

    return {"post_id": result.data["id"]}
