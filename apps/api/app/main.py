import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

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

limiter = Limiter(key_func=get_remote_address, default_limits=["60/minute"])

app = FastAPI(
    title="CodePawl API",
    description="GitHub stats, webhooks, and news automation",
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Content-Type", "Authorization", "X-Admin-Key"],
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


@app.post("/api/auth/login")
@limiter.limit("5/minute")
async def admin_login(request: Request):
    """Validate admin key and set httpOnly cookie."""
    import hmac as _hmac

    body = await request.json()
    key = body.get("key", "")
    expected = request.app.state.settings.admin_api_key

    if not expected:
        return JSONResponse({"error": "Admin key not configured"}, status_code=500)
    if not key or not _hmac.compare_digest(key, expected):
        return JSONResponse({"error": "Invalid key"}, status_code=401)

    response = JSONResponse({"ok": True})
    response.set_cookie(
        key="admin_session",
        value=key,
        httponly=True,
        samesite="strict",
        max_age=86400,
        path="/",
    )
    return response


@app.post("/api/auth/logout")
async def admin_logout():
    """Clear admin session cookie."""
    response = JSONResponse({"ok": True})
    response.delete_cookie(key="admin_session", path="/")
    return response
