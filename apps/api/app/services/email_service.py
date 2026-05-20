"""Transactional email via Resend.

In testing mode (or when RESEND_API_KEY is empty) sends are captured in
`SENT_EMAILS` instead of hitting the network. Tests assert against that
list to verify mail was queued.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.config import Settings


@dataclass
class SentEmail:
    to: str
    from_address: str
    subject: str
    html: str


SENT_EMAILS: list[SentEmail] = []


def send_email(
    *,
    to: str,
    subject: str,
    html: str,
    settings: Settings,
) -> None:
    """Send an email through Resend or capture it in tests."""

    if settings.testing or not settings.resend_api_key:
        SENT_EMAILS.append(
            SentEmail(
                to=to,
                from_address=settings.resend_from_email,
                subject=subject,
                html=html,
            )
        )
        return

    import resend

    resend.api_key = settings.resend_api_key
    resend.Emails.send(
        {
            "from": settings.resend_from_email,
            "to": [to],
            "subject": subject,
            "html": html,
        }
    )


def reset_sent_emails() -> None:
    SENT_EMAILS.clear()
