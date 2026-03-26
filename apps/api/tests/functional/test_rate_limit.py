import httpx
import pytest
from datetime import datetime, timezone

from app.services.github import GitHubService, RateLimitError
from app.config import Settings


@pytest.fixture
def service():
    return GitHubService(Settings(github_token="test"))


def test_check_rate_limit_ok(service):
    response = httpx.Response(200)
    service._check_rate_limit(response)


def test_check_rate_limit_403_with_remaining(service):
    response = httpx.Response(
        403,
        headers={"x-ratelimit-remaining": "10"},
    )
    service._check_rate_limit(response)


def test_check_rate_limit_exceeded(service):
    future_ts = str(int(datetime.now(timezone.utc).timestamp()) + 300)
    response = httpx.Response(
        403,
        headers={
            "x-ratelimit-remaining": "0",
            "x-ratelimit-reset": future_ts,
        },
    )

    with pytest.raises(RateLimitError) as exc_info:
        service._check_rate_limit(response)
    assert exc_info.value.retry_after >= 60


def test_retry_after_minimum_floor(service):
    past_ts = str(int(datetime.now(timezone.utc).timestamp()) - 100)
    response = httpx.Response(
        403,
        headers={
            "x-ratelimit-remaining": "0",
            "x-ratelimit-reset": past_ts,
        },
    )

    with pytest.raises(RateLimitError) as exc_info:
        service._check_rate_limit(response)
    assert exc_info.value.retry_after == 60
