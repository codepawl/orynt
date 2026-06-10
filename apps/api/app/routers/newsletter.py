"""Newsletter endpoints per docs/API.md."""

from typing import Annotated

from fastapi import APIRouter, Depends, Request
from supabase import Client

from app.dependencies import SettingsDep, get_supabase_client
from app.middleware import limiter
from app.models.newsletter import (
    ConfirmResponse,
    SubscribeRequest,
    SubscribeResponse,
    UnsubscribeRequest,
    UnsubscribeResponse,
)
from app.repositories.subscriber_repo import SubscriberRepo, SupabaseSubscriberRepo
from app.services import newsletter_service
from app.services.turnstile_service import verify_turnstile

router = APIRouter(prefix="/api/v1/newsletter", tags=["newsletter"])


async def get_subscriber_repo(
    client: Annotated[Client, Depends(get_supabase_client)],
) -> SubscriberRepo:
    return SupabaseSubscriberRepo(client)


RepoDep = Annotated[SubscriberRepo, Depends(get_subscriber_repo)]


@router.post("/subscribe", status_code=202, response_model=SubscribeResponse)
@limiter.limit("5/minute")
async def subscribe(
    request: Request,
    payload: SubscribeRequest,
    repo: RepoDep,
    settings: SettingsDep,
) -> SubscribeResponse:
    await verify_turnstile(payload.turnstile_token, settings)
    newsletter_service.subscribe(
        email=str(payload.email),
        source=payload.source,
        repo=repo,
        settings=settings,
    )
    return SubscribeResponse(status="pending_confirmation")


@router.get("/confirm", response_model=ConfirmResponse)
@limiter.limit("30/minute")
async def confirm(
    request: Request,
    token: str,
    repo: RepoDep,
    settings: SettingsDep,
) -> ConfirmResponse:
    email = newsletter_service.confirm(token=token, repo=repo, settings=settings)
    return ConfirmResponse(status="confirmed", email=email)


@router.post("/unsubscribe", response_model=UnsubscribeResponse)
@limiter.limit("30/minute")
async def unsubscribe(
    request: Request,
    payload: UnsubscribeRequest,
    repo: RepoDep,
) -> UnsubscribeResponse:
    newsletter_service.unsubscribe(token=payload.token, repo=repo)
    return UnsubscribeResponse(status="unsubscribed")
