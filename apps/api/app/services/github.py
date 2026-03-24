import asyncio
from datetime import datetime, timezone

import httpx

from app.config import Settings
from app.core.models import RepoStats


class RepoNotFoundError(Exception):
    pass


class RateLimitError(Exception):
    def __init__(self, retry_after: int):
        self.retry_after = retry_after
        super().__init__(f"Rate limited. Retry after {retry_after}s")


class GitHubService:
    BASE_URL = "https://api.github.com"

    def __init__(self, settings: Settings):
        self._headers = {
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        }
        if settings.github_token:
            self._headers["Authorization"] = f"Bearer {settings.github_token}"

    def _check_rate_limit(self, response: httpx.Response) -> None:
        if response.status_code == 403:
            remaining = response.headers.get("x-ratelimit-remaining")
            if remaining == "0":
                reset_ts = int(response.headers.get("x-ratelimit-reset", "0"))
                now_ts = int(datetime.now(timezone.utc).timestamp())
                retry_after = max(reset_ts - now_ts, 60)
                raise RateLimitError(retry_after)

    async def get_repo_stats(self, owner: str, repo_name: str) -> RepoStats:
        async with httpx.AsyncClient(
            base_url=self.BASE_URL,
            headers=self._headers,
            timeout=10.0,
        ) as client:
            repo_coro = client.get(f"/repos/{owner}/{repo_name}")
            release_coro = client.get(
                f"/repos/{owner}/{repo_name}/releases/latest"
            )
            commits_coro = client.get(
                f"/repos/{owner}/{repo_name}/commits",
                params={"per_page": 1},
            )

            results = await asyncio.gather(
                repo_coro, release_coro, commits_coro,
                return_exceptions=True,
            )

            repo_resp: httpx.Response | BaseException = results[0]
            release_resp: httpx.Response | BaseException = results[1]
            commits_resp: httpx.Response | BaseException = results[2]

            # --- Repo info (required) ---
            if isinstance(repo_resp, BaseException):
                raise repo_resp
            self._check_rate_limit(repo_resp)
            if repo_resp.status_code == 404:
                raise RepoNotFoundError(
                    f"Repository '{owner}/{repo_name}' not found"
                )
            repo_resp.raise_for_status()
            repo_data = repo_resp.json()

            # --- Latest release (optional) ---
            latest_release = None
            latest_release_date = None
            if isinstance(release_resp, httpx.Response):
                self._check_rate_limit(release_resp)
                if release_resp.status_code == 200:
                    release_data = release_resp.json()
                    latest_release = release_data.get("tag_name")
                    latest_release_date = release_data.get("published_at")

            # --- Latest commit (optional) ---
            last_commit_date = None
            last_commit_message = None
            if isinstance(commits_resp, httpx.Response):
                self._check_rate_limit(commits_resp)
                if commits_resp.status_code == 200:
                    commits_data = commits_resp.json()
                    if commits_data:
                        commit = commits_data[0]
                        commit_info = commit.get("commit", {})
                        last_commit_date = (
                            commit_info.get("committer", {}).get("date")
                        )
                        last_commit_message = commit_info.get("message", "")
                        if last_commit_message:
                            last_commit_message = (
                                last_commit_message.split("\n")[0]
                            )

            return RepoStats(
                repo=repo_name,
                owner=owner,
                stars=repo_data.get("stargazers_count", 0),
                forks=repo_data.get("forks_count", 0),
                open_issues=repo_data.get("open_issues_count", 0),
                description=repo_data.get("description"),
                language=repo_data.get("language"),
                latest_release=latest_release,
                latest_release_date=latest_release_date,
                last_commit_date=last_commit_date,
                last_commit_message=last_commit_message,
                fetched_at=datetime.now(timezone.utc).isoformat(),
            )
