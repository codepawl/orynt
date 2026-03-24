from fastapi import APIRouter, HTTPException, Request

from app.core.models import RepoStats
from app.services.github import RepoNotFoundError, RateLimitError

router = APIRouter()


@router.get("/stats/{owner}/{repo_name}", response_model=RepoStats)
async def get_repo_stats(owner: str, repo_name: str, request: Request):
    cache = request.app.state.cache
    github_service = request.app.state.github_service

    cache_key = f"{owner}/{repo_name}"
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    try:
        stats = await github_service.get_repo_stats(owner, repo_name)
    except RepoNotFoundError:
        raise HTTPException(
            status_code=404,
            detail=f"Repository '{owner}/{repo_name}' not found",
        )
    except RateLimitError as e:
        raise HTTPException(
            status_code=429,
            detail="GitHub API rate limit exceeded",
            headers={"Retry-After": str(e.retry_after)},
        )
    except Exception:
        raise HTTPException(
            status_code=502,
            detail="Failed to fetch data from GitHub API",
        )

    cache.set(cache_key, stats)
    return stats
