"""Cloudflare Turnstile verification per docs/API.md.

In testing mode, accepts the Cloudflare dev token `1x00000000000000000000AA`
without hitting the network. The dev token is the documented always-passes
token from Cloudflare and is safe to short-circuit on.
"""

from __future__ import annotations

import httpx

from app.config import Settings
from app.errors import ApiError

VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"
DEV_TOKEN_ALWAYS_PASS = "1x00000000000000000000AA"
DEV_TOKEN_ALWAYS_FAIL = "2x00000000000000000000AA"


async def verify_turnstile(
    token: str,
    settings: Settings,
    *,
    remote_ip: str | None = None,
    client: httpx.AsyncClient | None = None,
) -> None:
    """Raise ApiError(turnstile_failed) if the token does not verify."""

    if settings.testing:
        if token == DEV_TOKEN_ALWAYS_PASS:
            return
        if token == DEV_TOKEN_ALWAYS_FAIL:
            raise ApiError(status_code=400, code="turnstile_failed", message="Turnstile rejected.")

    if not settings.turnstile_secret_key:
        # Without a configured secret we treat this as a configuration failure
        # rather than silently passing.
        raise ApiError(
            status_code=500,
            code="turnstile_misconfigured",
            message="Server has no Turnstile secret configured.",
        )

    payload = {"secret": settings.turnstile_secret_key, "response": token}
    if remote_ip:
        payload["remoteip"] = remote_ip

    owns_client = client is None
    if client is None:
        client = httpx.AsyncClient(timeout=5.0)
    try:
        response = await client.post(VERIFY_URL, data=payload)
        response.raise_for_status()
        body = response.json()
    finally:
        if owns_client:
            await client.aclose()

    if not body.get("success"):
        raise ApiError(status_code=400, code="turnstile_failed", message="Turnstile rejected.")
