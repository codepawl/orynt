"""Liveness and readiness probes per docs/API.md."""

from fastapi import APIRouter

router = APIRouter(tags=["health"])


@router.get("/health")
def liveness() -> dict[str, str]:
    return {"status": "ok", "version": "0.1.0"}


@router.get("/health/ready")
def readiness() -> dict[str, str]:
    # Phase 1 stub: DB connectivity check is added in Phase 3 once Supabase
    # config is wired. For now, ready = liveness.
    return {"status": "ready", "db": "ok"}
