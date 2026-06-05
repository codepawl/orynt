"""Admin endpoints (docs/API.md). All routes require X-Admin-Key."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, EmailStr, Field
from supabase import Client

from app.config import Settings, get_settings
from app.dependencies import get_supabase_client, require_admin
from app.jobs.sync_github_stats import sync as sync_stats_job
from app.repositories.product_repo import ProductRepo, SupabaseProductRepo
from app.repositories.product_stats_repo import ProductStatsRepo, SupabaseProductStatsRepo
from app.repositories.submission_repo import SubmissionRepo, SupabaseSubmissionRepo
from app.repositories.subscriber_repo import SubscriberRepo, SupabaseSubscriberRepo

router = APIRouter(
    prefix="/api/v1/admin",
    tags=["admin"],
    dependencies=[Depends(require_admin)],
)


def get_product_repo_admin(
    client: Annotated[Client, Depends(get_supabase_client)],
) -> ProductRepo:
    return SupabaseProductRepo(client)


def get_product_stats_repo_admin(
    client: Annotated[Client, Depends(get_supabase_client)],
) -> ProductStatsRepo:
    return SupabaseProductStatsRepo(client)


def get_subscriber_repo_admin(
    client: Annotated[Client, Depends(get_supabase_client)],
) -> SubscriberRepo:
    return SupabaseSubscriberRepo(client)


def get_submission_repo_admin(
    client: Annotated[Client, Depends(get_supabase_client)],
) -> SubmissionRepo:
    return SupabaseSubmissionRepo(client)


class SyncStatsRequest(BaseModel):
    product_ids: list[str] | None = None


class SyncStatsResponse(BaseModel):
    status: str
    tally: dict[str, int]


class NewsletterSubscriberAdmin(BaseModel):
    id: str
    email: EmailStr
    source: str
    confirmed_at: str | None = None
    unsubscribed_at: str | None = None
    created_at: str


class NewsletterSubscribersAdminResponse(BaseModel):
    subscribers: list[NewsletterSubscriberAdmin]
    total: int
    page: int
    per_page: int


class ContactReplyAdmin(BaseModel):
    id: str
    submission_id: str
    replied_by: str
    reply_summary: str | None = None
    created_at: str


class ContactSubmissionAdmin(BaseModel):
    id: str
    name: str
    email: EmailStr
    subject: str | None = None
    message: str
    created_at: str
    replied: bool
    reply: ContactReplyAdmin | None = None


class ContactSubmissionsAdminResponse(BaseModel):
    submissions: list[ContactSubmissionAdmin]
    total: int
    page: int
    per_page: int


class ContactReplyRequest(BaseModel):
    replied_by: str = Field(min_length=1, max_length=200)
    reply_summary: str | None = Field(default=None, max_length=2000)


@router.post("/products/sync-stats", status_code=202, response_model=SyncStatsResponse)
async def sync_stats(
    payload: SyncStatsRequest | None,
    products: Annotated[ProductRepo, Depends(get_product_repo_admin)],
    stats: Annotated[ProductStatsRepo, Depends(get_product_stats_repo_admin)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> SyncStatsResponse:
    only = payload.product_ids if payload else None
    tally = await sync_stats_job(
        products_repo=products,
        stats_repo=stats,
        settings=settings,
        only=only,
    )
    return SyncStatsResponse(status="queued", tally=tally)


@router.get("/newsletter/subscribers", response_model=NewsletterSubscribersAdminResponse)
async def list_newsletter_subscribers(
    repo: Annotated[SubscriberRepo, Depends(get_subscriber_repo_admin)],
    status: Annotated[str | None, Query(pattern="^(confirmed|pending|unsubscribed)$")] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    per_page: Annotated[int, Query(ge=1, le=100)] = 50,
) -> NewsletterSubscribersAdminResponse:
    rows, total = repo.list_admin(status=status, page=page, per_page=per_page)
    return NewsletterSubscribersAdminResponse(
        subscribers=[NewsletterSubscriberAdmin.model_validate(row) for row in rows],
        total=total,
        page=page,
        per_page=per_page,
    )


@router.get("/contact/submissions", response_model=ContactSubmissionsAdminResponse)
async def list_contact_submissions(
    repo: Annotated[SubmissionRepo, Depends(get_submission_repo_admin)],
    replied: bool | None = None,
    page: Annotated[int, Query(ge=1)] = 1,
    per_page: Annotated[int, Query(ge=1, le=100)] = 50,
) -> ContactSubmissionsAdminResponse:
    rows, total = repo.list_admin(replied=replied, page=page, per_page=per_page)
    return ContactSubmissionsAdminResponse(
        submissions=[_submission_admin(row) for row in rows],
        total=total,
        page=page,
        per_page=per_page,
    )


@router.post(
    "/contact/submissions/{submission_id}/reply",
    status_code=201,
    response_model=ContactReplyAdmin,
)
async def reply_to_contact_submission(
    submission_id: str,
    payload: ContactReplyRequest,
    repo: Annotated[SubmissionRepo, Depends(get_submission_repo_admin)],
) -> ContactReplyAdmin:
    row = repo.create_reply(
        submission_id=submission_id,
        replied_by=payload.replied_by,
        reply_summary=payload.reply_summary,
    )
    return ContactReplyAdmin.model_validate(row)


def _submission_admin(row: dict[str, object]) -> ContactSubmissionAdmin:
    reply = _first_reply(row)
    return ContactSubmissionAdmin(
        id=str(row["id"]),
        name=str(row["name"]),
        email=str(row["email"]),
        subject=str(row["subject"]) if row.get("subject") is not None else None,
        message=str(row["message"]),
        created_at=str(row["created_at"]),
        replied=reply is not None,
        reply=ContactReplyAdmin.model_validate(reply) if reply else None,
    )


def _first_reply(row: dict[str, object]) -> dict[str, object] | None:
    replies = row.get("contact_replies")
    if isinstance(replies, list) and replies:
        first = replies[0]
        return first if isinstance(first, dict) else None
    return None
