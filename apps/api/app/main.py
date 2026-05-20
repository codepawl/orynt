"""FastAPI application factory.

Wires CORS, rate limiting (slowapi), structlog logging, Sentry (optional),
the public routers, the admin router, and the APScheduler cron that runs
sync_github_stats every 6 hours.
"""

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta

import structlog
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.date import DateTrigger
from apscheduler.triggers.interval import IntervalTrigger
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from starlette.responses import JSONResponse

from app.config import get_settings
from app.errors import register_exception_handlers
from app.jobs.sync_github_stats import sync as sync_stats_job
from app.middleware import limiter
from app.repositories.product_repo import SupabaseProductRepo
from app.repositories.product_stats_repo import SupabaseProductStatsRepo
from app.routers import admin, contact, health, newsletter, products

log = structlog.get_logger(__name__)


def _configure_logging() -> None:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    structlog.configure(
        processors=[
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.JSONRenderer(),
        ]
    )


def _maybe_init_sentry() -> None:
    settings = get_settings()
    if not settings.sentry_dsn:
        return
    import sentry_sdk

    sentry_sdk.init(dsn=settings.sentry_dsn, traces_sample_rate=0.1)


def _cors_origins() -> list[str]:
    return [
        "http://localhost:3000",
        "https://codepawl.com",
        "https://www.codepawl.com",
    ]


async def _run_sync_stats() -> None:
    settings = get_settings()
    if settings.testing or not settings.supabase_url or not settings.supabase_service_role_key:
        return
    from supabase import create_client

    client = create_client(settings.supabase_url, settings.supabase_service_role_key)
    await sync_stats_job(
        products_repo=SupabaseProductRepo(client),
        stats_repo=SupabaseProductStatsRepo(client),
        settings=settings,
    )


@asynccontextmanager
async def _lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    scheduler: AsyncIOScheduler | None = None
    if not settings.testing:
        scheduler = AsyncIOScheduler(timezone="UTC")
        # First run ~30s after boot per docs/ROADMAP.md.
        scheduler.add_job(
            _run_sync_stats,
            trigger=DateTrigger(run_date=datetime.now(UTC) + timedelta(seconds=30)),
            id="github_sync_boot",
            replace_existing=True,
        )
        scheduler.add_job(
            _run_sync_stats,
            trigger=IntervalTrigger(hours=6),
            id="github_sync_cron",
            replace_existing=True,
        )
        scheduler.start()
        log.info("scheduler_started")

    try:
        yield
    finally:
        if scheduler is not None:
            scheduler.shutdown(wait=False)
            log.info("scheduler_stopped")


def create_app() -> FastAPI:
    _configure_logging()
    _maybe_init_sentry()

    app = FastAPI(
        title="Codepawl API",
        version="0.1.0",
        docs_url="/docs",
        redoc_url="/redoc",
        openapi_url="/openapi.json",
        lifespan=_lifespan,
    )

    app.state.limiter = limiter

    @app.exception_handler(RateLimitExceeded)
    async def _rate_limit_handler(_: Request, exc: RateLimitExceeded) -> JSONResponse:
        return JSONResponse(
            status_code=429,
            content={
                "error": {
                    "code": "rate_limited",
                    "message": f"Rate limit exceeded: {exc.detail}",
                }
            },
        )

    app.add_middleware(SlowAPIMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_cors_origins(),
        allow_credentials=True,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["*"],
    )

    register_exception_handlers(app)

    app.include_router(health.router)
    app.include_router(newsletter.router)
    app.include_router(contact.router)
    app.include_router(products.router)
    app.include_router(admin.router)
    return app


app = create_app()
