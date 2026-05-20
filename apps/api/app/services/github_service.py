"""GitHub stats and release lookup used by the sync_github_stats job.

Pulls public repo metadata. Tests stub the underlying httpx client via respx
so the suite never touches api.github.com.
"""

import httpx

from app.config import Settings

GITHUB_API = "https://api.github.com"


def _headers(settings: Settings) -> dict[str, str]:
    headers = {"Accept": "application/vnd.github+json", "User-Agent": "codepawl-api"}
    if settings.github_token:
        headers["Authorization"] = f"Bearer {settings.github_token}"
    return headers


async def fetch_repo_stats(
    repo: str, settings: Settings, *, client: httpx.AsyncClient | None = None
) -> dict[str, object] | None:
    """Return {stars, forks, open_issues} for the repo, or None on 404."""

    owns_client = client is None
    if client is None:
        client = httpx.AsyncClient(timeout=10.0)
    try:
        response = await client.get(f"{GITHUB_API}/repos/{repo}", headers=_headers(settings))
    finally:
        if owns_client:
            await client.aclose()

    if response.status_code == 404:
        return None
    response.raise_for_status()
    body = response.json()
    return {
        "stars": int(body.get("stargazers_count", 0)),
        "forks": int(body.get("forks_count", 0)),
        "open_issues": int(body.get("open_issues_count", 0)),
    }


async def fetch_latest_release(
    repo: str, settings: Settings, *, client: httpx.AsyncClient | None = None
) -> dict[str, object] | None:
    """Return {last_release_tag, last_release_at} or None when there are no releases."""

    owns_client = client is None
    if client is None:
        client = httpx.AsyncClient(timeout=10.0)
    try:
        response = await client.get(
            f"{GITHUB_API}/repos/{repo}/releases/latest", headers=_headers(settings)
        )
    finally:
        if owns_client:
            await client.aclose()

    if response.status_code == 404:
        return None
    response.raise_for_status()
    body = response.json()
    return {
        "last_release_tag": body.get("tag_name"),
        "last_release_at": body.get("published_at"),
    }
