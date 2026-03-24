from pydantic import BaseModel


class RepoStats(BaseModel):
    repo: str
    owner: str
    stars: int
    forks: int
    open_issues: int
    description: str | None = None
    language: str | None = None
    latest_release: str | None = None
    latest_release_date: str | None = None
    last_commit_date: str | None = None
    last_commit_message: str | None = None
    fetched_at: str
