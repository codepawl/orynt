"""Unit test for the GitHub stats sync job with mocked GitHub responses."""

import respx
from httpx import Response

from app.config import Settings
from app.jobs.sync_github_stats import sync as sync_stats_job
from tests.conftest import FakeProductRepo, FakeProductStatsRepo


def _seed() -> list[dict[str, object]]:
    return [
        {
            "id": "openpawl",
            "name": "OpenPawl",
            "slug": "openpawl",
            "tagline": "agents",
            "status": "beta",
            "github_repo": "codepawl/openpawl",
            "display_order": 1,
        },
        {
            "id": "ghost",
            "name": "Ghost",
            "slug": "ghost",
            "tagline": "missing",
            "status": "alpha",
            "github_repo": "codepawl/ghost",
            "display_order": 2,
        },
    ]


@respx.mock
async def test_sync_upserts_stats_and_skips_missing_repo() -> None:
    settings = Settings(testing=True, github_token="")
    products = FakeProductRepo(rows=_seed())
    stats = FakeProductStatsRepo()

    respx.get("https://api.github.com/repos/codepawl/openpawl").mock(
        return_value=Response(
            200,
            json={"stargazers_count": 4200, "forks_count": 320, "open_issues_count": 27},
        )
    )
    respx.get("https://api.github.com/repos/codepawl/openpawl/releases/latest").mock(
        return_value=Response(
            200, json={"tag_name": "v0.4.1", "published_at": "2026-05-10T08:30:00Z"}
        )
    )
    respx.get("https://api.github.com/repos/codepawl/ghost").mock(
        return_value=Response(404, json={"message": "Not Found"})
    )

    tally = await sync_stats_job(products_repo=products, stats_repo=stats, settings=settings)

    assert tally == {"ok": 1, "missing": 1, "errored": 0}
    openpawl = stats.get("openpawl")
    assert openpawl is not None
    assert openpawl["stars"] == 4200
    assert openpawl["last_release_tag"] == "v0.4.1"
    assert stats.get("ghost") is None


@respx.mock
async def test_sync_only_filter() -> None:
    settings = Settings(testing=True)
    products = FakeProductRepo(rows=_seed())
    stats = FakeProductStatsRepo()

    respx.get("https://api.github.com/repos/codepawl/openpawl").mock(
        return_value=Response(
            200, json={"stargazers_count": 1, "forks_count": 0, "open_issues_count": 0}
        )
    )
    respx.get("https://api.github.com/repos/codepawl/openpawl/releases/latest").mock(
        return_value=Response(404, json={})
    )

    tally = await sync_stats_job(
        products_repo=products, stats_repo=stats, settings=settings, only=["openpawl"]
    )

    assert tally == {"ok": 1, "missing": 0, "errored": 0}
    assert stats.get("ghost") is None
