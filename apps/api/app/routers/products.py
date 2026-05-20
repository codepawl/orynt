"""/products endpoints per docs/API.md."""

from typing import Annotated

from fastapi import APIRouter, Depends, Request
from supabase import Client

from app.dependencies import get_supabase_client
from app.errors import ApiError
from app.middleware import limiter
from app.models.products import Product, ProductsList, ProductStats
from app.repositories.product_repo import ProductRepo, SupabaseProductRepo
from app.repositories.product_stats_repo import ProductStatsRepo, SupabaseProductStatsRepo

router = APIRouter(prefix="/api/v1/products", tags=["products"])


def get_product_repo(
    client: Annotated[Client, Depends(get_supabase_client)],
) -> ProductRepo:
    return SupabaseProductRepo(client)


def get_product_stats_repo(
    client: Annotated[Client, Depends(get_supabase_client)],
) -> ProductStatsRepo:
    return SupabaseProductStatsRepo(client)


@router.get("", response_model=ProductsList)
@limiter.limit("60/minute")
async def list_products(
    request: Request,
    repo: Annotated[ProductRepo, Depends(get_product_repo)],
) -> ProductsList:
    products = [Product.model_validate(row) for row in repo.list()]
    return ProductsList(products=products)


@router.get("/{slug}", response_model=Product)
@limiter.limit("60/minute")
async def get_product(
    request: Request,
    slug: str,
    repo: Annotated[ProductRepo, Depends(get_product_repo)],
) -> Product:
    row = repo.get_by_slug(slug)
    if row is None:
        raise ApiError(status_code=404, code="not_found", message=f"Unknown product '{slug}'.")
    return Product.model_validate(row)


@router.get("/{slug}/stats", response_model=ProductStats)
@limiter.limit("60/minute")
async def get_product_stats(
    request: Request,
    slug: str,
    repo: Annotated[ProductRepo, Depends(get_product_repo)],
    stats_repo: Annotated[ProductStatsRepo, Depends(get_product_stats_repo)],
) -> ProductStats:
    product = repo.get_by_slug(slug)
    if product is None:
        raise ApiError(status_code=404, code="not_found", message=f"Unknown product '{slug}'.")
    product_id = str(product.get("id") or slug)
    stats = stats_repo.get(product_id)
    if stats is None:
        raise ApiError(
            status_code=404,
            code="not_found",
            message=f"No stats yet for product '{slug}'.",
        )
    return ProductStats.model_validate(stats)
