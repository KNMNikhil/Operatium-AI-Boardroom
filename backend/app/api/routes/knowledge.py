"""
knowledge.py — REST API routes for the Operatium Knowledge Management System.

Endpoints:
    POST   /api/knowledge/add              — Add text documents directly
    POST   /api/knowledge/bulk-import      — Upload a PDF / MD / TXT file
    DELETE /api/knowledge/delete/{source}  — Delete all chunks for a source
    POST   /api/knowledge/reindex/{source} — Re-embed all chunks for a source
    GET    /api/knowledge/sources          — List all indexed sources + counts
    GET    /api/knowledge/roles            — List valid executive role tags
"""

from __future__ import annotations

import asyncio
from typing import Optional

from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Query, Request, Response
from pydantic import BaseModel, Field
from app.dependencies import limiter
from app.logger import logger

router = APIRouter(prefix="/api/knowledge", tags=["Knowledge Management"])


# ── Valid executive roles ─────────────────────────────────────────────────────

VALID_ROLES = [
    "CEO",
    "CTO",
    "Product Manager",
    "Product Designer",
    "Growth & Marketing",
    "Finance & Operations",
    "Investor & Risk Advisor",
    "all",
]


# ── Request/Response schemas ──────────────────────────────────────────────────

class AddDocumentsRequest(BaseModel):
    texts: list[str] = Field(..., max_length=100) # max 100 texts at once
    role: str = Field(default="all", max_length=50)
    source: str = Field(default="", max_length=100)
    tags: list[str] = Field(default=[], max_length=20)
    doc_type: str = Field(default="general", max_length=20)
    startup_id: Optional[str] = Field(default=None, max_length=36)


class AddDocumentsResponse(BaseModel):
    chunks_inserted: int
    source: str
    role: str


class DeleteResponse(BaseModel):
    deleted: int
    source: str


class ReindexRequest(BaseModel):
    texts: list[str] = Field(..., max_length=100)
    role: str = Field(default="all", max_length=50)
    tags: list[str] = Field(default=[], max_length=20)
    doc_type: str = Field(default="general", max_length=20)
    startup_id: Optional[str] = Field(default=None, max_length=36)


class SourceSummary(BaseModel):
    source: str
    role: str
    doc_type: str
    chunk_count: int


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/roles")
@limiter.limit("60/minute")
async def get_valid_roles(request: Request, response: Response):
    """Return the list of valid executive roles for knowledge tagging."""
    response.headers["Cache-Control"] = "public, max-age=3600"
    return {"roles": VALID_ROLES}


@router.get("/sources", response_model=list[SourceSummary])
@limiter.limit("30/minute")
async def list_sources(request: Request):
    """List all indexed knowledge sources with their chunk counts.

    Returns a sorted list (highest chunk count first) of all sources
    currently in the knowledge_base table.
    """
    from app.db.vector_store import list_sources as _list_sources
    try:
        sources = await _list_sources()
        return sources
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list sources: {e}")


@router.post("/add", response_model=AddDocumentsResponse)
@limiter.limit("10/minute")
async def add_documents(request: Request, req: AddDocumentsRequest):
    """Add text documents to the knowledge base.

    Supports chunking of long documents (default: 700 tokens / 100 overlap).
    Each chunk is embedded with gemini-embedding-2 @ 768 dims and stored.

    - **role**: Executive role to associate ("CEO", "CTO", ... or "all")
    - **source**: A descriptive slug (e.g. "pg_essays_do_things_that_dont_scale")
    - **tags**: Topic tags for fine-grained filtering (e.g. ["yc_essays", "startup_frameworks"])
    - **doc_type**: "general" (frameworks/essays) or "startup" (company memory)
    - **startup_id**: Required when doc_type="startup"
    """
    if req.role not in VALID_ROLES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid role {req.role!r}. Valid roles: {VALID_ROLES}"
        )
    if req.doc_type == "startup" and not req.startup_id:
        raise HTTPException(
            status_code=400,
            detail="startup_id is required when doc_type='startup'"
        )
    if not req.texts:
        raise HTTPException(status_code=400, detail="texts list cannot be empty")

    from app.db.vector_store import add_documents as _add_docs
    try:
        n = await _add_docs(
            texts=req.texts,
            role=req.role,
            source=req.source,
            tags=req.tags,
            doc_type=req.doc_type,
            startup_id=req.startup_id,
            chunk=True,
        )
        return AddDocumentsResponse(chunks_inserted=n, source=req.source, role=req.role)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to add documents: {e}")


@router.post("/bulk-import", response_model=AddDocumentsResponse)
@limiter.limit("5/minute")
async def bulk_import(
    request: Request,
    file: UploadFile = File(...),
    role: str = Form("all"),
    tags: str = Form(""),           # comma-separated
    doc_type: str = Form("general"),
    startup_id: Optional[str] = Form(None),
    source_override: Optional[str] = Form(None),
):
    """Upload a PDF, Markdown, or TXT file and ingest it into the knowledge base.

    The file is parsed, chunked (500-1000 tokens, 100 overlap), embedded,
    and stored with full source attribution.

    **Form fields:**
    - **file**: The file to upload (.pdf / .md / .txt)
    - **role**: Executive role (default: "all")
    - **tags**: Comma-separated topic tags (e.g. "yc_essays,startup_frameworks")
    - **doc_type**: "general" or "startup"
    - **startup_id**: Required if doc_type="startup"
    - **source_override**: Custom source slug (default: derived from filename)
    """
    from app.db.document_processor import extract_text_from_file, source_slug_from_filename
    from app.db.vector_store import add_documents as _add_docs

    if role not in VALID_ROLES:
        raise HTTPException(status_code=400, detail=f"Invalid role: {role!r}")
    if doc_type == "startup" and not startup_id:
        raise HTTPException(status_code=400, detail="startup_id required for doc_type='startup'")

    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    # Parse the file
    try:
        text = extract_text_from_file(file_bytes, file.filename or "upload")
    except ValueError as e:
        raise HTTPException(status_code=415, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to parse file: {e}")

    if not text.strip():
        raise HTTPException(status_code=422, detail="File parsed but contained no extractable text")

    # Derive source slug
    source = source_override or source_slug_from_filename(file.filename or "upload")
    tag_list = [t.strip() for t in tags.split(",") if t.strip()] if tags else []

    try:
        n = await _add_docs(
            texts=[text],
            role=role,
            source=source,
            tags=tag_list,
            doc_type=doc_type,
            startup_id=startup_id,
            chunk=True,
        )
        return AddDocumentsResponse(chunks_inserted=n, source=source, role=role)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to store document: {e}")


@router.delete("/delete/{source}", response_model=DeleteResponse)
@limiter.limit("10/minute")
async def delete_document(request: Request, source: str):
    """Delete all chunks associated with a given source slug.

    This permanently removes the document from the knowledge base.
    Use /reindex to replace it with updated content.
    """
    from app.db.vector_store import delete_document as _delete
    try:
        deleted = await _delete(source)
        return DeleteResponse(deleted=deleted, source=source)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete: {e}")


@router.post("/reindex/{source}", response_model=AddDocumentsResponse)
@limiter.limit("5/minute")
async def reindex_document(request: Request, source: str, req: ReindexRequest):
    """Delete existing chunks for a source and re-embed from new text.

    Use this when you want to update a document without changing its source slug.
    All existing embeddings are deleted and replaced.
    """
    from app.db.vector_store import reindex_document as _reindex
    try:
        n = await _reindex(
            source=source,
            texts=req.texts,
            role=req.role,
            tags=req.tags,
            doc_type=req.doc_type,
            startup_id=req.startup_id,
        )
        return AddDocumentsResponse(chunks_inserted=n, source=source, role=req.role)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to reindex: {e}")
