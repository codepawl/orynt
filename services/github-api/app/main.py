from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router
from app.config import Settings
from app.core.cache import TTLCache
from app.services.github import GitHubService


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = Settings()
    app.state.cache = TTLCache(ttl_seconds=settings.cache_ttl_seconds)
    app.state.github_service = GitHubService(settings)
    yield
    app.state.cache.clear()


settings = Settings()

app = FastAPI(
    title="CodePawl GitHub API",
    description="Proxy API for GitHub repository statistics",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_methods=["GET"],
    allow_headers=["*"],
)

app.include_router(router)


@app.get("/health")
async def health():
    return {"status": "ok"}
