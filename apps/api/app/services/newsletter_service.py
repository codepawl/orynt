"""Newsletter business logic.

Glues the subscriber repo, Turnstile verification, and Resend email send so
the router stays declarative. Double opt-in lifecycle per ADR-007.
"""

from __future__ import annotations

import secrets
from datetime import UTC, datetime, timedelta

from app.config import Settings
from app.email_templates.newsletter_confirm import render_confirm_email
from app.errors import ApiError
from app.repositories.subscriber_repo import SubscriberRepo
from app.services.email_service import send_email


def generate_confirm_token() -> str:
    return secrets.token_urlsafe(24)


def confirm_url(token: str, settings: Settings) -> str:
    return f"{settings.site_url.rstrip('/')}/newsletter/confirm?token={token}"


def subscribe(
    *,
    email: str,
    source: str,
    repo: SubscriberRepo,
    settings: Settings,
) -> None:
    """Insert a pending subscriber and send the confirm email.

    Raises ApiError(409, already_subscribed) if the email already has
    confirmed_at set. New pending subscribers (or replacements of stale
    pending rows) get a fresh confirm_token.
    """

    existing = repo.find_by_email(email=email)
    if existing and existing.get("confirmed_at"):
        raise ApiError(
            status_code=409,
            code="already_subscribed",
            message="This email is already subscribed.",
        )

    token = generate_confirm_token()
    row = repo.upsert_pending(email=email, source=source, confirm_token=token)
    subscriber_id = str(row.get("id") or "")
    if subscriber_id:
        repo.log_event(subscriber_id=subscriber_id, event_type="subscribed")

    subject, html = render_confirm_email(
        confirm_url=confirm_url(token, settings),
        ttl_days=settings.confirm_token_ttl_days,
    )
    send_email(to=email, subject=subject, html=html, settings=settings)


def confirm(*, token: str, repo: SubscriberRepo, settings: Settings) -> str:
    """Mark the subscriber confirmed and return their email.

    Raises ApiError(410, expired) if the token is unknown, already confirmed,
    or older than confirm_token_ttl_days.
    """

    row = repo.find_by_token(token=token)
    if not row:
        raise ApiError(
            status_code=410, code="invalid_token", message="Confirmation token is invalid."
        )

    if row.get("confirmed_at"):
        raise ApiError(status_code=410, code="expired", message="Token already used.")

    created_at = _parse_dt(row.get("created_at"))
    if created_at is not None:
        ttl = timedelta(days=settings.confirm_token_ttl_days)
        if datetime.now(UTC) - created_at > ttl:
            raise ApiError(status_code=410, code="expired", message="Token expired.")

    subscriber_id = str(row.get("id") or "")
    if not subscriber_id:
        raise ApiError(status_code=410, code="invalid_token", message="Subscriber record corrupt.")

    repo.mark_confirmed(subscriber_id=subscriber_id)
    repo.log_event(subscriber_id=subscriber_id, event_type="confirmed")
    return str(row.get("email") or "")


def unsubscribe(*, token: str, repo: SubscriberRepo) -> None:
    row = repo.find_by_token(token=token)
    if not row:
        raise ApiError(
            status_code=400, code="invalid_token", message="Unsubscribe token is invalid."
        )
    if row.get("unsubscribed_at"):
        raise ApiError(
            status_code=410,
            code="already_unsubscribed",
            message="Already unsubscribed.",
        )
    subscriber_id = str(row.get("id") or "")
    if subscriber_id:
        repo.mark_unsubscribed(subscriber_id=subscriber_id)
        repo.log_event(subscriber_id=subscriber_id, event_type="unsubscribed")


def _parse_dt(value: object) -> datetime | None:
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=UTC)
    if isinstance(value, str):
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)
    return None
