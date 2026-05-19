"""Application settings loaded from environment variables.

Mirrors `.env.example` at the repo root. See docs/OPS.md for the canonical
variable list. We tolerate empty values so unit tests and local dev can run
without provisioning Turnstile, Resend, Sentry, or Supabase.
"""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Supabase (server-side, service role)
    supabase_url: str = ""
    supabase_service_role_key: str = ""

    # Cloudflare Turnstile (server secret)
    turnstile_secret_key: str = ""

    # Resend (transactional email)
    resend_api_key: str = ""
    resend_from_email: str = "hello@codepawl.com"

    # Sentry (server DSN)
    sentry_dsn: str = ""

    # GitHub API (for product stats sync — Phase 5)
    github_token: str = ""
    github_org: str = "codepawl"

    # Admin API key for protected admin endpoints
    admin_api_key: str = ""

    # Front-end origin allowed by CORS
    site_url: str = "http://localhost:3000"

    # Token TTL for double opt-in (days) — per ADR-007
    confirm_token_ttl_days: int = 7

    # Internal flag flipped on by tests so verify_turnstile() short-circuits
    # for the Cloudflare dev token without needing a real secret.
    testing: bool = False


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
