import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.projects import router as projects_router
from app.api.routes import router as stats_router
from app.api.webhook import router as webhook_router
from app.config import Settings
from app.core.cache import TTLCache
from app.services.github import GitHubService

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = Settings()
    app.state.settings = settings
    app.state.cache = TTLCache(ttl_seconds=settings.cache_ttl_seconds)
    app.state.github_service = GitHubService(settings)
    app.state.projects_store = {}

    # Initialize automation (Supabase + scheduler) if configured
    scheduler = None
    if settings.supabase_url and settings.supabase_service_key:
        try:
            from supabase import acreate_client
            from app.automation.services.supabase_client import AutomationDB
            from app.automation.scheduler import create_scheduler

            supabase_client = await acreate_client(settings.supabase_url, settings.supabase_service_key)
            app.state.supabase = supabase_client
            app.state.automation_db = AutomationDB(supabase_client)

            scheduler = create_scheduler(app)
            app.state.scheduler = scheduler
            scheduler.start()
            logger.info("Automation scheduler started")
        except Exception:
            logger.exception("Failed to initialize automation — continuing without it")

    yield

    # Shutdown
    if scheduler:
        scheduler.shutdown(wait=False)
    app.state.cache.clear()
    app.state.projects_store.clear()


settings = Settings()

app = FastAPI(
    title="CodePawl API",
    description="GitHub stats, webhooks, and news automation",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["*"],
)

app.include_router(stats_router)
app.include_router(webhook_router)
app.include_router(projects_router)

# Automation routers
try:
    from app.automation.router import admin_router, news_router
    app.include_router(admin_router)
    app.include_router(news_router)
except ImportError:
    pass


@app.get("/health")
async def health():
    return {"status": "ok"}
