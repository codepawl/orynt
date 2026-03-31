import hmac
import logging

from fastapi import HTTPException, Request

from app.api.community.auth import get_current_user

logger = logging.getLogger(__name__)


async def verify_admin(request: Request) -> None:
    """Accept either:
    - API key via X-Admin-Key header or admin_session cookie (for cron/automation)
    - Supabase JWT (Bearer token) belonging to a user with role='admin'
    """
    settings = request.app.state.settings

    # 1. Try API key first (cron jobs, direct curl, etc.)
    api_key = (
        request.headers.get("X-Admin-Key", "")
        or request.cookies.get("admin_session", "")
    )
    if api_key and settings.admin_api_key and hmac.compare_digest(api_key, settings.admin_api_key):
        return

    # 2. Try Supabase JWT with admin role
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        try:
            user_id = await get_current_user(request)
            db = getattr(request.app.state, "supabase", None)
            if db:
                result = await db.from_("profiles").select("role").eq("id", user_id).single().execute()
                if (result.data or {}).get("role") == "admin":
                    return
        except Exception:
            pass  # Fall through to 401

    raise HTTPException(status_code=401, detail="Unauthorized")


# Keep old name as alias so existing imports don't break
verify_admin_key = verify_admin
