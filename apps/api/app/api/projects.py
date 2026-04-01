import asyncio
import logging
import re
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Request

from app.core.models import OrgRepo, ProjectInfo, ReadmeData

logger = logging.getLogger(__name__)

router = APIRouter()

_ORG_NAME = "codepawl"

# ── Existing tracked-repo stats ──────────────────────────────────────


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


# ── Org repos ────────────────────────────────────────────────────────


@router.get("/projects/org", response_model=list[OrgRepo])
async def get_org_repos(request: Request):
    """Fetch all public repos from the codepawl GitHub org (cached 1h)."""
    cache = request.app.state.cache
    cached = cache.get("org_repos")
    if cached is not None:
        return cached

    settings = request.app.state.settings
    headers = {
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    if settings.github_token:
        headers["Authorization"] = f"Bearer {settings.github_token}"

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                f"https://api.github.com/orgs/{_ORG_NAME}/repos",
                headers=headers,
                params={"per_page": 100, "sort": "stars", "direction": "desc", "type": "public"},
            )
            resp.raise_for_status()
            repos = []
            for r in resp.json():
                repos.append(OrgRepo(
                    name=r["name"],
                    full_name=r["full_name"],
                    description=r.get("description"),
                    language=r.get("language"),
                    stars=r.get("stargazers_count", 0),
                    forks=r.get("forks_count", 0),
                    license=(r.get("license") or {}).get("spdx_id"),
                    topics=r.get("topics", []),
                    homepage=r.get("homepage"),
                    created_at=r.get("created_at"),
                    updated_at=r.get("updated_at"),
                    default_branch=r.get("default_branch", "main"),
                ))
            cache.set("org_repos", repos)
            return repos
    except Exception:
        logger.exception("Failed to fetch org repos")
        return []


# ── README parser ────────────────────────────────────────────────────

_SECTION_KEYWORDS = {
    "installation": ["install", "getting started", "setup", "quick start"],
    "usage": ["usage", "example", "examples", "tutorial"],
    "api_reference": ["api", "api reference", "reference"],
    "benchmarks": ["benchmark", "benchmarks", "performance"],
    "citation": ["citation", "cite", "citing"],
    "features": ["features", "key features", "highlights"],
    "requirements": ["requirements", "prerequisites", "dependencies"],
    "license": ["license"],
}


def _parse_readme_sections(markdown: str) -> dict[str, str]:
    """Split markdown by ## headings and classify sections by keyword."""
    sections: dict[str, str] = {}
    # Split on ## headings (but not ### or #)
    parts = re.split(r"(?m)^##\s+(.+)$", markdown)
    # parts[0] = content before first heading, then alternating heading/content
    for i in range(1, len(parts), 2):
        heading = parts[i].strip().lower()
        content = parts[i + 1].strip() if i + 1 < len(parts) else ""
        if not content:
            continue
        for section_key, keywords in _SECTION_KEYWORDS.items():
            if any(kw in heading for kw in keywords):
                # If section already exists, append
                if section_key in sections:
                    sections[section_key] += "\n\n" + content
                else:
                    sections[section_key] = content
                break
    return sections


def _extract_badges(markdown: str) -> list[str]:
    """Extract badge image URLs from the first ~20 lines."""
    badges = []
    for line in markdown.split("\n")[:20]:
        for match in re.finditer(r"\[!\[.*?\]\((https?://[^)]+)\)", line):
            badges.append(match.group(1))
    return badges


def _extract_package_url(markdown: str, topics: list[str] | None = None) -> str | None:
    """Try to find PyPI or npm package URL."""
    # Check for pip install command
    pip_match = re.search(r"pip install\s+(\S+)", markdown)
    if pip_match:
        pkg = pip_match.group(1).strip().rstrip("`")
        return f"https://pypi.org/project/{pkg}/"
    # Check for PyPI badge link
    pypi_match = re.search(r"https://pypi\.org/project/([^/)]+)", markdown)
    if pypi_match:
        return f"https://pypi.org/project/{pypi_match.group(1)}/"
    # Check for npm install
    npm_match = re.search(r"npm install\s+(\S+)", markdown)
    if npm_match:
        pkg = npm_match.group(1).strip().rstrip("`")
        return f"https://www.npmjs.com/package/{pkg}"
    return None


def _extract_docs_url(markdown: str) -> str | None:
    """Try to find documentation URL."""
    docs_match = re.search(r"https?://[^\s)]+(?:docs|documentation|readthedocs)[^\s)]*", markdown, re.IGNORECASE)
    if docs_match:
        return docs_match.group(0)
    return None


@router.get("/projects/{owner}/{repo}/readme", response_model=ReadmeData)
async def get_readme(request: Request, owner: str, repo: str):
    """Fetch and parse README.md from a GitHub repo (cached 1h)."""
    cache = request.app.state.cache
    cache_key = f"readme:{owner}/{repo}"
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    settings = request.app.state.settings
    headers = {
        "Accept": "application/vnd.github.raw",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    if settings.github_token:
        headers["Authorization"] = f"Bearer {settings.github_token}"

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                f"https://api.github.com/repos/{owner}/{repo}/readme",
                headers=headers,
            )
            resp.raise_for_status()
            markdown = resp.text

        sections = _parse_readme_sections(markdown)
        badges = _extract_badges(markdown)
        package_url = _extract_package_url(markdown)
        docs_url = _extract_docs_url(markdown)

        result = ReadmeData(
            full_markdown=markdown,
            sections=sections,
            badges=badges,
            package_url=package_url,
            docs_url=docs_url,
        )
        cache.set(cache_key, result)
        return result
    except Exception:
        logger.exception("Failed to fetch README for %s/%s", owner, repo)
        return ReadmeData(full_markdown="")
