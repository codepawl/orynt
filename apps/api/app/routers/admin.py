"""Admin endpoints (docs/API.md). All routes require X-Admin-Key."""

from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from supabase import Client

from app.config import Settings, get_settings
from app.dependencies import get_supabase_client, require_admin
from app.jobs.sync_github_stats import sync as sync_stats_job
from app.repositories.product_repo import ProductRepo, SupabaseProductRepo
from app.repositories.product_stats_repo import ProductStatsRepo, SupabaseProductStatsRepo

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


class SyncStatsRequest(BaseModel):
    product_ids: list[str] | None = None


class SyncStatsResponse(BaseModel):
    status: str
    tally: dict[str, int]


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
