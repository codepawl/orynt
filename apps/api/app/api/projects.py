import asyncio
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Request

from app.core.models import ProjectInfo

logger = logging.getLogger(__name__)

router = APIRouter()


async def _populate_store(request: Request) -> None:
    """Cold-start: fetch stats for all tracked repos if store is empty."""
    store = request.app.state.projects_store
    settings = request.app.state.settings
    github_service = request.app.state.github_service

    if store or not settings.tracked_repos:
        return

    async def fetch_one(repo_full_name: str) -> None:
        try:
            owner, repo_name = repo_full_name.split("/", 1)
            stats = await github_service.get_repo_stats(owner, repo_name)
            store[repo_full_name] = ProjectInfo(
                repo=stats.repo,
                owner=stats.owner,
                description=stats.description,
                language=stats.language,
                stars=stats.stars,
                forks=stats.forks,
                open_issues=stats.open_issues,
                latest_release=stats.latest_release,
                latest_release_date=stats.latest_release_date,
                last_commit_date=stats.last_commit_date,
                last_commit_message=stats.last_commit_message,
                updated_at=datetime.now(timezone.utc).isoformat(),
            )
        except Exception:
            logger.warning("Failed to fetch stats for %s", repo_full_name)

    await asyncio.gather(
        *(fetch_one(repo) for repo in settings.tracked_repos)
    )


@router.get("/projects", response_model=list[ProjectInfo])
async def get_projects(request: Request):
    await _populate_store(request)
    store = request.app.state.projects_store
    return list(store.values())
