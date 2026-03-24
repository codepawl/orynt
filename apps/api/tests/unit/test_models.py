import pytest
from pydantic import ValidationError

from app.core.models import RepoStats


def test_repo_stats_all_fields():
    stats = RepoStats(
        repo="loclean",
        owner="nxank4",
        stars=42,
        forks=5,
        open_issues=3,
        description="A library",
        language="Python",
        latest_release="v1.0.0",
        latest_release_date="2025-01-15T10:00:00Z",
        last_commit_date="2025-03-20T12:00:00Z",
        last_commit_message="fix: something",
        fetched_at="2025-03-24T00:00:00Z",
    )
    assert stats.repo == "loclean"
    assert stats.stars == 42
    assert stats.latest_release == "v1.0.0"


def test_repo_stats_optional_none():
    stats = RepoStats(
        repo="test",
        owner="nxank4",
        stars=0,
        forks=0,
        open_issues=0,
        fetched_at="2025-03-24T00:00:00Z",
    )
    assert stats.description is None
    assert stats.language is None
    assert stats.latest_release is None
    assert stats.last_commit_date is None


def test_repo_stats_missing_required():
    with pytest.raises(ValidationError):
        RepoStats(repo="test", owner="nxank4")
