import json
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request

from app.core.models import ProjectInfo
from app.security import verify_webhook_signature

logger = logging.getLogger(__name__)

router = APIRouter()

SUPPORTED_EVENTS = {"push", "star", "release", "issues"}


def _repo_key(payload: dict) -> str:
    repo = payload.get("repository", {})
    return repo.get("full_name", "")


def _make_project_from_repo(repo: dict) -> ProjectInfo:
    """Build a ProjectInfo from GitHub repository payload data."""
    return ProjectInfo(
        repo=repo.get("name", ""),
        owner=repo.get("owner", {}).get("login", ""),
        description=repo.get("description"),
        language=repo.get("language"),
        stars=repo.get("stargazers_count", 0),
        forks=repo.get("forks_count", 0),
        open_issues=repo.get("open_issues_count", 0),
        updated_at=datetime.now(timezone.utc).isoformat(),
    )


async def _process_push(payload: dict, store: dict) -> None:
    key = _repo_key(payload)
    if not key:
        return

    commits = payload.get("commits", [])
    head_commit = payload.get("head_commit") or (commits[-1] if commits else None)

    if key in store:
        project = store[key]
        if head_commit:
            project.last_commit_date = head_commit.get("timestamp")
            message = head_commit.get("message", "")
            project.last_commit_message = message.split("\n")[0] if message else None
        project.updated_at = datetime.now(timezone.utc).isoformat()
    else:
        repo = payload.get("repository", {})
        project = _make_project_from_repo(repo)
        if head_commit:
            project.last_commit_date = head_commit.get("timestamp")
            message = head_commit.get("message", "")
            project.last_commit_message = message.split("\n")[0] if message else None
        store[key] = project


async def _process_star(payload: dict, store: dict, request: Request) -> None:
    key = _repo_key(payload)
    if not key:
        return

    # Re-fetch full stats since star count changed
    try:
        owner, repo_name = key.split("/", 1)
        github_service = request.app.state.github_service
        stats = await github_service.get_repo_stats(owner, repo_name)
        store[key] = ProjectInfo(
            repo=stats.repo,
            owner=stats.owner,
            description=stats.description,
            language=stats.language,
            stars=stats.stars,
            forks=stats.forks,
            open_issues=stats.open_issues,
            latest_release=stats.latest_release,
            last_commit_date=stats.last_commit_date,
            last_commit_message=stats.last_commit_message,
            updated_at=datetime.now(timezone.utc).isoformat(),
        )
    except Exception:
        # Fallback: update from payload
        repo = payload.get("repository", {})
        if key in store:
            store[key].stars = repo.get("stargazers_count", store[key].stars)
            store[key].updated_at = datetime.now(timezone.utc).isoformat()
        else:
            store[key] = _make_project_from_repo(repo)


async def _process_release(payload: dict, store: dict) -> None:
    key = _repo_key(payload)
    if not key:
        return

    release = payload.get("release", {})

    if key in store:
        store[key].latest_release = release.get("tag_name")
        store[key].latest_release_date = release.get("published_at")
        store[key].updated_at = datetime.now(timezone.utc).isoformat()
    else:
        repo = payload.get("repository", {})
        project = _make_project_from_repo(repo)
        project.latest_release = release.get("tag_name")
        project.latest_release_date = release.get("published_at")
        store[key] = project


async def _process_issues(payload: dict, store: dict, request: Request) -> None:
    key = _repo_key(payload)
    if not key:
        return

    # Re-fetch to get accurate open_issues count
    try:
        owner, repo_name = key.split("/", 1)
        github_service = request.app.state.github_service
        stats = await github_service.get_repo_stats(owner, repo_name)
        if key in store:
            store[key].open_issues = stats.open_issues
            store[key].updated_at = datetime.now(timezone.utc).isoformat()
        else:
            store[key] = ProjectInfo(
                repo=stats.repo,
                owner=stats.owner,
                description=stats.description,
                language=stats.language,
                stars=stats.stars,
                forks=stats.forks,
                open_issues=stats.open_issues,
                latest_release=stats.latest_release,
                last_commit_date=stats.last_commit_date,
                last_commit_message=stats.last_commit_message,
                updated_at=datetime.now(timezone.utc).isoformat(),
            )
    except Exception:
        # Fallback: update from payload repository data
        repo = payload.get("repository", {})
        if key in store:
            store[key].open_issues = repo.get("open_issues_count", store[key].open_issues)
            store[key].updated_at = datetime.now(timezone.utc).isoformat()


async def _handle_event(
    event: str, payload: dict, store: dict, request: Request
) -> None:
    if event == "push":
        await _process_push(payload, store)
    elif event == "star":
        await _process_star(payload, store, request)
    elif event == "release":
        await _process_release(payload, store)
    elif event == "issues":
        await _process_issues(payload, store, request)

    logger.info("Processed %s event for %s", event, _repo_key(payload))


@router.post("/webhook")
async def github_webhook(
    request: Request,
    background_tasks: BackgroundTasks,
    body: bytes = Depends(verify_webhook_signature),
):
    event = request.headers.get("X-GitHub-Event", "")

    if event == "ping":
        return {"message": "pong"}

    if event not in SUPPORTED_EVENTS:
        return {"message": f"Event '{event}' ignored"}

    payload = json.loads(body)
    store = request.app.state.projects_store

    background_tasks.add_task(_handle_event, event, payload, store, request)

    return {"message": f"Event '{event}' accepted"}
