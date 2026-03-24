import hashlib
import hmac

from fastapi import HTTPException, Request


async def verify_webhook_signature(request: Request) -> bytes:
    """Verify GitHub webhook HMAC-SHA256 signature."""
    body = await request.body()
    secret: str = request.app.state.settings.webhook_secret

    if not secret:
        raise HTTPException(
            status_code=500,
            detail="Webhook secret not configured",
        )

    signature = request.headers.get("X-Hub-Signature-256", "")
    expected = "sha256=" + hmac.new(
        secret.encode(), body, hashlib.sha256
    ).hexdigest()

    if not hmac.compare_digest(signature, expected):
        raise HTTPException(status_code=403, detail="Invalid signature")

    return body
