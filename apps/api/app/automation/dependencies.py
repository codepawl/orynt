import hmac

from fastapi import HTTPException, Request


async def verify_admin_key(request: Request) -> None:
    """Verify the X-Admin-Key header matches the configured admin API key."""
    settings = request.app.state.settings
    if not settings.admin_api_key:
        raise HTTPException(status_code=500, detail="Admin API key not configured")

    provided = request.headers.get("X-Admin-Key", "")
    if not provided or not hmac.compare_digest(provided, settings.admin_api_key):
        raise HTTPException(status_code=401, detail="Invalid or missing admin key")
