"""Liveness and readiness probes per docs/API.md.

`/health` is a flat liveness probe (no I/O). `/health/ready` exercises the
Supabase round-trip so Fly's HTTP check pulls the machine out of rotation
when the DB is unreachable.
"""

from typing import Annotated

import structlog
from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from supabase import Client

from app.dependencies import get_supabase_client

router = APIRouter(tags=["health"])
log = structlog.get_logger(__name__)


@router.get("/health")
async def liveness() -> dict[str, str]:
    return {"status": "ok", "version": "0.1.0"}


@router.get("/health/ready")
async def readiness(
    client: Annotated[Client, Depends(get_supabase_client)],
) -> JSONResponse:
    try:
        client.table("products").select("id").limit(1).execute()
    except Exception as exc:
        log.warning("readiness_db_error", error=str(exc))
        return JSONResponse(status_code=503, content={"status": "not_ready", "db": "error"})
    return JSONResponse(status_code=200, content={"status": "ready", "db": "ok"})
