"""Notification API routes and helper for creating notifications."""

from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from app.api.community.auth import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/notifications")


def _get_db(request: Request):
    supabase = getattr(request.app.state, "supabase", None)
    if supabase is None:
        raise HTTPException(503, "Notifications not available")
    return supabase


class NotificationResponse(BaseModel):
    id: str
    user_id: str
    type: str
    actor_id: str | None = None
    actor_username: str | None = None
    actor_avatar_url: str | None = None
    post_id: str | None = None
    comment_id: str | None = None
    message: str
    is_read: bool
    created_at: str


class UnreadCountResponse(BaseModel):
    count: int


@router.get("")
async def list_notifications(
    request: Request,
    user_id: str = Depends(get_current_user),
    limit: int = 20,
    offset: int = 0,
) -> list[NotificationResponse]:
    db = _get_db(request)

    result = await db.from_("notifications").select(
        "*, actor:profiles!actor_id(username, avatar_url)"
    ).eq("user_id", user_id).order(
        "created_at", desc=True
    ).range(offset, offset + limit - 1).execute()

    notifications = []
    for row in result.data:
        actor_data = row.pop("actor", None) or {}
        notifications.append(NotificationResponse(
            id=row["id"],
            user_id=row["user_id"],
            type=row["type"],
            actor_id=row.get("actor_id"),
            actor_username=actor_data.get("username"),
            actor_avatar_url=actor_data.get("avatar_url"),
            post_id=row.get("post_id"),
            comment_id=row.get("comment_id"),
            message=row["message"],
            is_read=row["is_read"],
            created_at=row["created_at"],
        ))

    return notifications


@router.get("/unread-count")
async def unread_count(
    request: Request,
    user_id: str = Depends(get_current_user),
) -> UnreadCountResponse:
    db = _get_db(request)

    result = await db.from_("notifications").select(
        "id", count="exact"
    ).eq("user_id", user_id).eq("is_read", False).execute()

    return UnreadCountResponse(count=result.count or 0)


@router.post("/{notification_id}/read")
async def mark_as_read(
    notification_id: str,
    request: Request,
    user_id: str = Depends(get_current_user),
) -> dict:
    db = _get_db(request)

    await db.from_("notifications").update(
        {"is_read": True}
    ).eq("id", notification_id).eq("user_id", user_id).execute()

    return {"ok": True}


@router.post("/read-all")
async def mark_all_as_read(
    request: Request,
    user_id: str = Depends(get_current_user),
) -> dict:
    db = _get_db(request)

    await db.from_("notifications").update(
        {"is_read": True}
    ).eq("user_id", user_id).eq("is_read", False).execute()

    return {"ok": True}


# --- Helper: create notification (called from other routes) ---

async def create_notification(
    db,
    *,
    user_id: str,
    type: str,
    actor_id: str,
    message: str,
    post_id: Optional[str] = None,
    comment_id: Optional[str] = None,
) -> None:
    """Insert a notification. Silently fails on error to not break main flows."""
    if user_id == actor_id:
        return  # Don't notify yourself

    try:
        await db.from_("notifications").insert({
            "user_id": user_id,
            "type": type,
            "actor_id": actor_id,
            "post_id": post_id,
            "comment_id": comment_id,
            "message": message,
        }).execute()
    except Exception:
        logger.warning("Failed to create notification for user %s", user_id, exc_info=True)
