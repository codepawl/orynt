"""/contact endpoint per docs/API.md."""

import hashlib
from typing import Annotated

from fastapi import APIRouter, Depends, Request
from supabase import Client

from app.config import Settings, get_settings
from app.dependencies import get_supabase_client
from app.middleware import limiter
from app.models.contact import ContactRequest, ContactResponse
from app.repositories.submission_repo import SubmissionRepo, SupabaseSubmissionRepo
from app.services.email_service import send_email
from app.services.turnstile_service import verify_turnstile

router = APIRouter(prefix="/api/v1/contact", tags=["contact"])


def get_submission_repo(
    client: Annotated[Client, Depends(get_supabase_client)],
) -> SubmissionRepo:
    return SupabaseSubmissionRepo(client)


def _hash_ip(ip: str | None) -> str | None:
    if not ip:
        return None
    return hashlib.sha256(ip.encode("utf-8")).hexdigest()


def _format_message(payload: ContactRequest) -> tuple[str, str]:
    subject = f"[contact] {payload.subject or '(no subject)'}"
    html = (
        f"<p><strong>From:</strong> {payload.name} &lt;{payload.email}&gt;</p>"
        f"<p><strong>Subject:</strong> {payload.subject or '(no subject)'}</p>"
        f'<hr /><pre style="white-space: pre-wrap; font-family: ui-monospace, Menlo, monospace;">'
        f"{payload.message}</pre>"
    )
    return subject, html


@router.post("", status_code=201, response_model=ContactResponse)
@limiter.limit("5/minute")
async def submit(
    request: Request,
    payload: ContactRequest,
    repo: Annotated[SubmissionRepo, Depends(get_submission_repo)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> ContactResponse:
    await verify_turnstile(payload.turnstile_token, settings)
    ip = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")
    row = repo.create(
        name=payload.name,
        email=str(payload.email),
        subject=payload.subject,
        message=payload.message,
        ip_hash=_hash_ip(ip),
        user_agent=user_agent,
    )
    submission_id = str(row.get("id") or "")

    subject, html = _format_message(payload)
    send_email(
        to=settings.resend_from_email,
        subject=subject,
        html=html,
        settings=settings,
    )

    return ContactResponse(status="received", id=submission_id)
