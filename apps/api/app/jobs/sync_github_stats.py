"""Background job that refreshes the cached GitHub stats per product.

Schedule: every 6 hours, with one run scheduled ~30 seconds after API boot.
Wired into APScheduler in app/main.py. Tests call sync() directly with
mocked respx routes so they never touch GitHub.
"""

from collections.abc import Iterable
from datetime import UTC, datetime

import structlog

from app.config import Settings
from app.repositories.product_repo import ProductRepo
from app.repositories.product_stats_repo import ProductStatsRepo
from app.services.github_service import fetch_latest_release, fetch_repo_stats

log = structlog.get_logger(__name__)


async def sync(
    *,
    products_repo: ProductRepo,
    stats_repo: ProductStatsRepo,
    settings: Settings,
    only: Iterable[str] | None = None,
) -> dict[str, int]:
    """Sync the products in `only` (or all of them) and return a {ok, missing, errored} tally."""

    products = products_repo.list()
    if only is not None:
        wanted = set(only)
        products = [p for p in products if str(p.get("id") or "") in wanted]

    tally = {"ok": 0, "missing": 0, "errored": 0}

    for product in products:
        product_id = str(product.get("id") or "")
        repo_slug = str(product.get("github_repo") or "")
        if not repo_slug:
            tally["missing"] += 1
            continue
        try:
            stats = await fetch_repo_stats(repo_slug, settings)
        except Exception as exc:
            log.warning(
                "github_sync_error",
                product_id=product_id,
                repo=repo_slug,
                err=str(exc),
            )
            tally["errored"] += 1
            continue

        if stats is None:
            log.warning("github_repo_missing", product_id=product_id, repo=repo_slug)
            tally["missing"] += 1
            continue

        try:
            release = await fetch_latest_release(repo_slug, settings)
        except Exception as exc:
            log.warning(
                "github_release_error",
                product_id=product_id,
                repo=repo_slug,
                err=str(exc),
            )
            release = None

        payload: dict[str, object] = {
            **stats,
            "synced_at": datetime.now(UTC).isoformat(),
        }
        if release:
            payload.update(release)

        stats_repo.upsert(product_id=product_id, payload=payload)
        tally["ok"] += 1

    log.info("github_sync_done", **tally)
    return tally
