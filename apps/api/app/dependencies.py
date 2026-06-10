"""FastAPI dependencies shared across routers.

The `get_supabase_client` dependency is the gateway's single point of contact
with Supabase. Tests override it via `app.dependency_overrides` to inject a
fake repository implementation, so route handlers stay async/await even
though the underlying supabase-py client is synchronous.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Annotated, cast

from fastapi import Depends, Header
from supabase import Client, create_client

from app.config import Settings, get_settings
from app.errors import ApiError


@lru_cache(maxsize=1)
def _build_client() -> Client:
    settings = get_settings()
    if not settings.supabase_url or not settings.supabase_service_role_key:
        # Tests stub this dependency, so missing creds locally is fine; we
        # return a placeholder whose attribute access raises if the caller
        # forgot to override the dep.
        return cast(Client, _MissingSupabase())
    return create_client(settings.supabase_url, settings.supabase_service_role_key)


class _MissingSupabase:
    """Marker raised on access when SUPABASE_* env vars are not configured."""

    def __getattr__(self, name: str) -> object:  # pragma: no cover - safety net
        raise RuntimeError(
            "Supabase client is not configured. Set SUPABASE_URL and "
            "SUPABASE_SERVICE_ROLE_KEY, or override the dependency in tests."
        )


async def get_supabase_client() -> Client:
    return _build_client()


async def get_settings_dep() -> Settings:
    return get_settings()


SettingsDep = Annotated[Settings, Depends(get_settings_dep)]


def require_admin(
    settings: SettingsDep,
    x_admin_key: Annotated[str | None, Header(alias="X-Admin-Key")] = None,
) -> None:
    """Reject requests missing or with the wrong admin key."""

    if not settings.admin_api_key or x_admin_key != settings.admin_api_key:
        raise ApiError(status_code=401, code="unauthorized", message="Invalid admin key.")
