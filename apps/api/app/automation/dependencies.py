import hmac

from fastapi import HTTPException, Request


async def verify_admin_key(request: Request) -> None:
    """Verify admin key from X-Admin-Key header or admin_session httpOnly cookie."""
    settings = request.app.state.settings
    if not settings.admin_api_key:
        raise HTTPException(status_code=500, detail="Admin API key not configured")

    # Check header first, then httpOnly cookie
    provided = request.headers.get("X-Admin-Key", "") or request.cookies.get("admin_session", "")
    if not provided or not hmac.compare_digest(provided, settings.admin_api_key):
        raise HTTPException(status_code=401, detail="Invalid or missing admin key")
