"""Supabase JWT verification for community endpoints using JWKS."""

from __future__ import annotations

import logging

import jwt
from jwt import PyJWKClient
from fastapi import HTTPException, Request

logger = logging.getLogger(__name__)

# Cache the JWKS client per Supabase URL
_jwks_clients: dict[str, PyJWKClient] = {}


def _get_jwks_client(supabase_url: str) -> PyJWKClient:
    if supabase_url not in _jwks_clients:
        jwks_url = f"{supabase_url}/auth/v1/.well-known/jwks.json"
        _jwks_clients[supabase_url] = PyJWKClient(jwks_url, cache_keys=True)
    return _jwks_clients[supabase_url]


async def get_current_user(request: Request) -> str:
    """Extract and verify Supabase JWT. Returns the user ID (sub claim)."""
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid authorization header")

    token = auth_header[7:]
    supabase_url = request.app.state.settings.supabase_url

    if not supabase_url:
        raise HTTPException(status_code=500, detail="Supabase URL not configured")

    try:
        jwks_client = _get_jwks_client(supabase_url)
        signing_key = jwks_client.get_signing_key_from_jwt(token)

        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=["ES256", "HS256"],
            audience="authenticated",
        )
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token: no sub claim")
        return user_id
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError as e:
        logger.error("JWT verification failed: %s", e)
        raise HTTPException(status_code=401, detail=f"Invalid token: {e}")
    except Exception as e:
        logger.error("JWT verification error: %s", e)
        raise HTTPException(status_code=401, detail="Authentication failed")
