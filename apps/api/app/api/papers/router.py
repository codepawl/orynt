"""Papers & Reproductions API routes."""

from __future__ import annotations

import logging
import math
import re
import xml.etree.ElementTree as ET

from fastapi import APIRouter, Depends, HTTPException, Request

from app.api.community.auth import get_current_user
from app.api.community.models import AuthorInfo
from app.api.papers.models import (
    ArxivMetadata,
    PaperCreate,
    PaperListResponse,
    PaperResponse,
    PaperUpdate,
    ReproductionCreate,
    ReproductionResponse,
    ReproductionUpdate,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/papers")


# ── Helpers ─────────────────────────────────────────────────────────

def _get_db(request: Request):
    """Get the Supabase client from app state."""
    supabase = getattr(request.app.state, "supabase", None)
    if supabase is None:
        raise HTTPException(503, "Papers not available (Supabase not configured)")
    return supabase


def _build_author(profile: dict) -> AuthorInfo:
    return AuthorInfo(
        id=profile.get("id", ""),
        username=profile.get("username", ""),
        display_name=profile.get("display_name"),
        avatar_url=profile.get("avatar_url"),
    )


async def _recalculate_verification(db, paper_id: str) -> None:
    """Recalculate paper verification_status based on reproduction results."""
    result = await db.from_("reproductions").select("result").eq(
        "paper_id", paper_id
    ).execute()
    repros = result.data or []
    count = len(repros)

    if count == 0:
        status = "unverified"
    else:
        confirmed = sum(1 for r in repros if r["result"] == "confirmed")
        failed = sum(1 for r in repros if r["result"] == "failed")
        if confirmed >= 3 and failed == 0:
            status = "verified"
        elif failed >= 3 or failed > confirmed:
            status = "disputed"
        elif count >= 2:
            status = "partially_reproduced"
        else:
            status = "unverified"

    await db.from_("papers").update({
        "verification_status": status,
        "reproduction_count": count,
    }).eq("id", paper_id).execute()


# ── ArXiv Metadata ──────────────────────────────────────────────────

_ARXIV_ID_RE = re.compile(r"(\d{4}\.\d{4,5})")
_ATOM_NS = {"atom": "http://www.w3.org/2005/Atom"}


@router.get("/arxiv-metadata")
async def get_arxiv_metadata(url: str) -> ArxivMetadata:
    """Fetch paper metadata from the arXiv API given an arXiv URL."""
    match = _ARXIV_ID_RE.search(url)
    if not match:
        raise HTTPException(400, "Could not extract arXiv ID from URL")

    arxiv_id = match.group(1)

    import httpx

    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(
            f"http://export.arxiv.org/api/query?id_list={arxiv_id}"
        )
        if resp.status_code != 200:
            raise HTTPException(502, "Failed to fetch from arXiv API")

    root = ET.fromstring(resp.text)
    entry = root.find("atom:entry", _ATOM_NS)
    if entry is None:
        raise HTTPException(404, "Paper not found on arXiv")

    title = (entry.findtext("atom:title", "", _ATOM_NS) or "").strip()
    title = re.sub(r"\s+", " ", title)  # collapse whitespace

    authors = ", ".join(
        (a.findtext("atom:name", "", _ATOM_NS) or "").strip()
        for a in entry.findall("atom:author", _ATOM_NS)
    )

    abstract = (entry.findtext("atom:summary", "", _ATOM_NS) or "").strip()
    abstract = re.sub(r"\s+", " ", abstract)

    pdf_url = f"https://arxiv.org/pdf/{arxiv_id}"

    published = entry.findtext("atom:published", "", _ATOM_NS)
    year = None
    if published:
        try:
            year = int(published[:4])
        except (ValueError, IndexError):
            pass

    return ArxivMetadata(
        title=title,
        authors=authors,
        abstract=abstract,
        pdf_url=pdf_url,
        year=year,
    )


# ── Papers CRUD ─────────────────────────────────────────────────────

@router.get("")
async def list_papers(
    request: Request,
    page: int = 1,
    per_page: int = 20,
    sort: str = "newest",
    status: str | None = None,
    tag: str | None = None,
    year: int | None = None,
    q: str | None = None,
) -> PaperListResponse:
    db = _get_db(request)

    query = db.from_("papers").select(
        "*, submitted_by_profile:profiles!submitted_by(id, username, display_name, avatar_url)",
        count="exact",
    )

    if status:
        query = query.eq("verification_status", status)
    if tag:
        query = query.ilike("tags", f"%{tag}%")
    if year:
        query = query.eq("year", year)
    if q:
        query = query.ilike("title", f"%{q}%")

    if sort == "reproductions":
        query = query.order("reproduction_count", desc=True)
    else:
        query = query.order("created_at", desc=True)

    offset = (page - 1) * per_page
    query = query.range(offset, offset + per_page - 1)

    result = await query.execute()
    total = result.count or 0

    papers = []
    for row in result.data:
        author_data = row.pop("submitted_by_profile", None) or {}
        if isinstance(author_data, list):
            author_data = author_data[0] if author_data else {}
        papers.append(PaperResponse(
            id=row["id"],
            title=row["title"],
            authors=row.get("authors", ""),
            arxiv_url=row.get("arxiv_url"),
            pdf_url=row.get("pdf_url"),
            venue=row.get("venue"),
            year=row.get("year"),
            abstract=row.get("abstract"),
            tags=row.get("tags", ""),
            submitted_by=_build_author(author_data) if author_data.get("id") else None,
            verification_status=row.get("verification_status", "unverified"),
            reproduction_count=row.get("reproduction_count", 0),
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        ))

    return PaperListResponse(
        papers=papers,
        total=total,
        page=page,
        total_pages=math.ceil(total / per_page) if total > 0 else 0,
    )


@router.get("/recently-verified")
async def recently_verified(
    request: Request,
    limit: int = 5,
) -> list[PaperResponse]:
    db = _get_db(request)

    result = await db.from_("papers").select(
        "*, submitted_by_profile:profiles!submitted_by(id, username, display_name, avatar_url)",
    ).eq(
        "verification_status", "verified"
    ).order("updated_at", desc=True).limit(limit).execute()

    papers = []
    for row in (result.data or []):
        author_data = row.pop("submitted_by_profile", None) or {}
        if isinstance(author_data, list):
            author_data = author_data[0] if author_data else {}
        papers.append(PaperResponse(
            id=row["id"],
            title=row["title"],
            authors=row.get("authors", ""),
            arxiv_url=row.get("arxiv_url"),
            pdf_url=row.get("pdf_url"),
            venue=row.get("venue"),
            year=row.get("year"),
            abstract=row.get("abstract"),
            tags=row.get("tags", ""),
            submitted_by=_build_author(author_data) if author_data.get("id") else None,
            verification_status=row.get("verification_status", "unverified"),
            reproduction_count=row.get("reproduction_count", 0),
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        ))

    return papers


@router.get("/{paper_id}")
async def get_paper(paper_id: str, request: Request) -> PaperResponse:
    db = _get_db(request)

    result = await db.from_("papers").select(
        "*, submitted_by_profile:profiles!submitted_by(id, username, display_name, avatar_url)",
    ).eq("id", paper_id).maybe_single().execute()

    row = getattr(result, "data", None)
    if not row:
        raise HTTPException(404, "Paper not found")

    author_data = row.pop("submitted_by_profile", None) or {}
    if isinstance(author_data, list):
        author_data = author_data[0] if author_data else {}

    return PaperResponse(
        id=row["id"],
        title=row["title"],
        authors=row.get("authors", ""),
        arxiv_url=row.get("arxiv_url"),
        pdf_url=row.get("pdf_url"),
        venue=row.get("venue"),
        year=row.get("year"),
        abstract=row.get("abstract"),
        tags=row.get("tags", ""),
        submitted_by=_build_author(author_data) if author_data.get("id") else None,
        verification_status=row.get("verification_status", "unverified"),
        reproduction_count=row.get("reproduction_count", 0),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


@router.post("")
async def create_paper(
    data: PaperCreate,
    request: Request,
    user_id: str = Depends(get_current_user),
) -> PaperResponse:
    db = _get_db(request)

    insert_data = {
        "title": data.title,
        "authors": data.authors,
        "arxiv_url": data.arxiv_url,
        "pdf_url": data.pdf_url,
        "venue": data.venue,
        "year": data.year,
        "abstract": data.abstract,
        "tags": data.tags,
        "submitted_by": user_id,
    }

    result = await db.from_("papers").insert(insert_data).execute()
    row = result.data[0]

    # Fetch with author info
    return await get_paper(row["id"], request)


@router.put("/{paper_id}")
async def update_paper(
    paper_id: str,
    data: PaperUpdate,
    request: Request,
    user_id: str = Depends(get_current_user),
) -> PaperResponse:
    db = _get_db(request)

    # Check ownership or admin
    existing = await db.from_("papers").select("submitted_by").eq(
        "id", paper_id
    ).maybe_single().execute()
    if not existing.data:
        raise HTTPException(404, "Paper not found")

    if existing.data["submitted_by"] != user_id:
        role_res = await db.from_("profiles").select("role").eq(
            "id", user_id
        ).single().execute()
        if (role_res.data or {}).get("role") != "admin":
            raise HTTPException(403, "Not authorized")

    updates = {k: v for k, v in data.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(422, "No fields to update")

    await db.from_("papers").update(updates).eq("id", paper_id).execute()
    return await get_paper(paper_id, request)


@router.delete("/{paper_id}")
async def delete_paper(
    paper_id: str,
    request: Request,
    user_id: str = Depends(get_current_user),
) -> dict:
    db = _get_db(request)

    existing = await db.from_("papers").select("submitted_by").eq(
        "id", paper_id
    ).maybe_single().execute()
    if not existing.data:
        raise HTTPException(404, "Paper not found")

    if existing.data["submitted_by"] != user_id:
        role_res = await db.from_("profiles").select("role").eq(
            "id", user_id
        ).single().execute()
        if (role_res.data or {}).get("role") != "admin":
            raise HTTPException(403, "Not authorized")

    await db.from_("papers").delete().eq("id", paper_id).execute()
    return {"ok": True}


# ── Reproductions CRUD ──────────────────────────────────────────────

@router.get("/{paper_id}/reproductions")
async def list_reproductions(
    paper_id: str,
    request: Request,
) -> list[ReproductionResponse]:
    db = _get_db(request)

    result = await db.from_("reproductions").select(
        "*, author:profiles!author_id(id, username, display_name, avatar_url)",
    ).eq("paper_id", paper_id).order("score", desc=True).order(
        "created_at", desc=True
    ).execute()

    reproductions = []
    for row in (result.data or []):
        author_data = row.pop("author", None) or {}
        if isinstance(author_data, list):
            author_data = author_data[0] if author_data else {}
        reproductions.append(ReproductionResponse(
            id=row["id"],
            paper_id=row["paper_id"],
            author=_build_author(author_data),
            result=row["result"],
            hardware=row.get("hardware"),
            framework=row.get("framework"),
            model_tested=row.get("model_tested"),
            summary=row["summary"],
            details=row.get("details"),
            code_url=row.get("code_url"),
            paper_claims=row.get("paper_claims", []),
            actual_results=row.get("actual_results", []),
            score=row.get("score", 0),
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        ))

    return reproductions


@router.post("/{paper_id}/reproductions")
async def create_reproduction(
    paper_id: str,
    data: ReproductionCreate,
    request: Request,
    user_id: str = Depends(get_current_user),
) -> ReproductionResponse:
    db = _get_db(request)

    # Verify paper exists
    paper = await db.from_("papers").select("id").eq(
        "id", paper_id
    ).maybe_single().execute()
    if not paper.data:
        raise HTTPException(404, "Paper not found")

    insert_data = {
        "paper_id": paper_id,
        "author_id": user_id,
        "result": data.result,
        "hardware": data.hardware,
        "framework": data.framework,
        "model_tested": data.model_tested,
        "summary": data.summary,
        "details": data.details,
        "code_url": data.code_url,
        "paper_claims": data.paper_claims,
        "actual_results": data.actual_results,
    }

    result = await db.from_("reproductions").insert(insert_data).execute()
    row = result.data[0]

    # Recalculate verification status
    await _recalculate_verification(db, paper_id)

    # Fetch author info
    author_res = await db.from_("profiles").select(
        "id, username, display_name, avatar_url"
    ).eq("id", user_id).single().execute()

    return ReproductionResponse(
        id=row["id"],
        paper_id=row["paper_id"],
        author=_build_author(author_res.data or {}),
        result=row["result"],
        hardware=row.get("hardware"),
        framework=row.get("framework"),
        model_tested=row.get("model_tested"),
        summary=row["summary"],
        details=row.get("details"),
        code_url=row.get("code_url"),
        paper_claims=row.get("paper_claims", []),
        actual_results=row.get("actual_results", []),
        score=row.get("score", 0),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


@router.put("/reproductions/{reproduction_id}")
async def update_reproduction(
    reproduction_id: str,
    data: ReproductionUpdate,
    request: Request,
    user_id: str = Depends(get_current_user),
) -> ReproductionResponse:
    db = _get_db(request)

    existing = await db.from_("reproductions").select(
        "author_id, paper_id"
    ).eq("id", reproduction_id).maybe_single().execute()
    if not existing.data:
        raise HTTPException(404, "Reproduction not found")
    if existing.data["author_id"] != user_id:
        raise HTTPException(403, "Not authorized")

    updates = {k: v for k, v in data.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(422, "No fields to update")

    await db.from_("reproductions").update(updates).eq(
        "id", reproduction_id
    ).execute()

    # Recalculate verification status
    await _recalculate_verification(db, existing.data["paper_id"])

    # Fetch updated reproduction
    result = await db.from_("reproductions").select(
        "*, author:profiles!author_id(id, username, display_name, avatar_url)",
    ).eq("id", reproduction_id).single().execute()
    row = result.data
    author_data = row.pop("author", None) or {}
    if isinstance(author_data, list):
        author_data = author_data[0] if author_data else {}

    return ReproductionResponse(
        id=row["id"],
        paper_id=row["paper_id"],
        author=_build_author(author_data),
        result=row["result"],
        hardware=row.get("hardware"),
        framework=row.get("framework"),
        model_tested=row.get("model_tested"),
        summary=row["summary"],
        details=row.get("details"),
        code_url=row.get("code_url"),
        paper_claims=row.get("paper_claims", []),
        actual_results=row.get("actual_results", []),
        score=row.get("score", 0),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


@router.delete("/reproductions/{reproduction_id}")
async def delete_reproduction(
    reproduction_id: str,
    request: Request,
    user_id: str = Depends(get_current_user),
) -> dict:
    db = _get_db(request)

    existing = await db.from_("reproductions").select(
        "author_id, paper_id"
    ).eq("id", reproduction_id).maybe_single().execute()
    if not existing.data:
        raise HTTPException(404, "Reproduction not found")

    if existing.data["author_id"] != user_id:
        role_res = await db.from_("profiles").select("role").eq(
            "id", user_id
        ).single().execute()
        if (role_res.data or {}).get("role") != "admin":
            raise HTTPException(403, "Not authorized")

    paper_id = existing.data["paper_id"]
    await db.from_("reproductions").delete().eq("id", reproduction_id).execute()

    # Recalculate verification status
    await _recalculate_verification(db, paper_id)

    return {"ok": True}
