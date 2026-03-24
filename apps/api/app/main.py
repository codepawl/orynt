from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.projects import router as projects_router
from app.api.routes import router as stats_router
from app.api.webhook import router as webhook_router
from app.config import Settings
from app.core.cache import TTLCache
from app.services.github import GitHubService


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = Settings()
    app.state.settings = settings
    app.state.cache = TTLCache(ttl_seconds=settings.cache_ttl_seconds)
    app.state.github_service = GitHubService(settings)
    app.state.projects_store = {}
    yield
    app.state.cache.clear()
    app.state.projects_store.clear()


settings = Settings()

app = FastAPI(
    title="CodePawl GitHub API",
    description="Proxy API for GitHub repository statistics and webhooks",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

app.include_router(stats_router)
app.include_router(webhook_router)
app.include_router(projects_router)


@app.get("/health")
async def health():
    return {"status": "ok"}
