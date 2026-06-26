"""
vector_store.py — Production Role-Based RAG for Operatium.

Architecture:
    Documents (general knowledge / startup memory)
    → gemini-embedding-2 @ 768-dim MRL
    → Supabase pgvector (knowledge_base table)
    → match_knowledge_v2 RPC (role + startup_id native filters)
    → Priority-ranked, deduplicated, compressed context
    → Executive prompt (Gemini 2.5 Flash)

Memory priority order (highest → lowest):
    1. Current startup memory (startup_id exact match)
    2. Previous decisions    (doc_type='startup', tags contains 'decisions')
    3. Previous reports      (doc_type='startup', tags contains 'report')
    4. Timeline events       (doc_type='startup', tags contains 'timeline')
    5. Role documents        (role match, doc_type='general')
    6. General knowledge     (role='all', doc_type='general')
"""

from __future__ import annotations

import asyncio
import hashlib
import re
import time
from typing import Optional
from dataclasses import dataclass, field
from functools import lru_cache
from tenacity import retry, stop_after_attempt, wait_exponential

# ─── Token budget ─────────────────────────────────────────────────────────────
MAX_CONTEXT_TOKENS = 1800   # max tokens injected per executive prompt
CHUNK_SIZE = 700            # target tokens per chunk
CHUNK_OVERLAP = 100         # overlap tokens between chunks


# ─── Result dataclass ─────────────────────────────────────────────────────────

@dataclass(order=True)
class RAGResult:
    """A single retrieved document chunk with metadata."""
    similarity: float
    content: str = field(compare=False)
    source: str   = field(compare=False, default="")
    role: str     = field(compare=False, default="all")
    doc_type: str = field(compare=False, default="general")
    tags: list    = field(compare=False, default_factory=list)
    chunk_id: str = field(compare=False, default="")
    startup_id: str | None = field(compare=False, default=None)

    @property
    def source_label(self) -> str:
        """Short human-readable attribution string."""
        parts = []
        if self.source:
            parts.append(self.source)
        if self.tags:
            parts.append(", ".join(self.tags[:2]))
        return " | ".join(parts) if parts else "knowledge base"


# ─── Custom GeminiEmbeddings class (768-dim MRL via gemini-embedding-2) ───────

class GeminiEmbeddings:
    """LangChain-compatible embeddings using the google-genai SDK.

    Uses gemini-embedding-2 with Matryoshka Representation Learning (MRL)
    to output 768-dimensional vectors — within pgvector HNSW's 2000-dim limit.
    """

    def __init__(self, api_key: str, dimensions: int = 768):
        from google import genai as gai
        from google.genai import types
        self._client = gai.Client(
            api_key=api_key,
            http_options=types.HttpOptions(api_version="v1"),
        )
        self._model = "gemini-embedding-2"
        self._dimensions = dimensions
        self._EmbedConfig = types.EmbedContentConfig

    def embed_query(self, text: str) -> list[float]:
        r = self._client.models.embed_content(
            model=self._model,
            contents=text,
            config=self._EmbedConfig(output_dimensionality=self._dimensions),
        )
        return list(r.embeddings[0].values)

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        results = []
        for text in texts:
            r = self._client.models.embed_content(
                model=self._model,
                contents=text,
                config=self._EmbedConfig(output_dimensionality=self._dimensions),
            )
            results.append(list(r.embeddings[0].values))
        return results


@lru_cache(maxsize=1)
def _get_embeddings() -> GeminiEmbeddings:
    """Lazily initialise the embedder singleton."""
    from app.config import GOOGLE_API_KEY
    return GeminiEmbeddings(api_key=GOOGLE_API_KEY, dimensions=768)


# ─── Document Chunker ─────────────────────────────────────────────────────────

def chunk_text(
    text: str,
    chunk_size: int = CHUNK_SIZE,
    chunk_overlap: int = CHUNK_OVERLAP,
    source: str = "",
) -> list[dict]:
    """Split text into overlapping chunks with traceability metadata.

    Uses LangChain's RecursiveCharacterTextSplitter for natural boundaries.

    Returns:
        List of dicts: {text, chunk_id, chunk_index, total_chunks}
    """
    from langchain_text_splitters import RecursiveCharacterTextSplitter

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size * 4,       # approx chars (1 token ≈ 4 chars)
        chunk_overlap=chunk_overlap * 4,
        separators=["\n\n", "\n", ". ", "! ", "? ", " ", ""],
    )
    raw_chunks = splitter.split_text(text)

    source_slug = re.sub(r"[^a-z0-9_]", "_", source.lower())[:40] if source else "doc"
    source_hash = hashlib.md5(text[:200].encode()).hexdigest()[:6]
    base_id = f"{source_slug}_{source_hash}"

    chunks = []
    for i, chunk in enumerate(raw_chunks):
        chunks.append({
            "text": chunk,
            "chunk_id": f"{base_id}:{i}",
            "chunk_index": i,
            "total_chunks": len(raw_chunks),
        })
    return chunks


# ─── Context compressor ───────────────────────────────────────────────────────

def _estimate_tokens(text: str) -> int:
    """Fast token estimate: ~4 chars per token."""
    return len(text) // 4


def _compress_results(
    results: list[RAGResult],
    max_tokens: int = MAX_CONTEXT_TOKENS,
) -> list[RAGResult]:
    """Truncate lowest-similarity results until we're within token budget."""
    # Sort descending by similarity so we keep the best ones
    sorted_r = sorted(results, key=lambda r: r.similarity, reverse=True)
    kept = []
    total = 0
    for r in sorted_r:
        t = _estimate_tokens(r.content)
        if total + t > max_tokens:
            break
        kept.append(r)
        total += t
    return kept


def _deduplicate(results: list[RAGResult]) -> list[RAGResult]:
    """Remove duplicate chunk_ids; keep the highest-similarity copy."""
    seen: dict[str, RAGResult] = {}
    for r in results:
        key = r.chunk_id or hashlib.md5(r.content[:100].encode()).hexdigest()
        if key not in seen or r.similarity > seen[key].similarity:
            seen[key] = r
    return list(seen.values())


# ─── Priority-Ranked Retrieval ────────────────────────────────────────────────

# Retrieve limits per priority tier
_TIER_LIMITS = {
    "startup_memory":   4,   # highest priority — company history
    "decisions":        2,
    "reports":          2,
    "timeline":         1,
    "role_docs":        3,   # role-specific frameworks
    "general":          2,   # general fallback
}


async def retrieve_docs(
    query: str,
    role: str,
    startup_id: Optional[str] = None,
    limit: int = 5,
) -> list[RAGResult]:
    """Main retrieval entry point — priority-ranked, deduplicated, compressed.

    Retrieval order:
        1. Startup memory (startup_id match)
        2. Past decisions
        3. Past reports
        4. Timeline events
        5. Role-specific documents
        6. General knowledge fallback

    Args:
        query:      The executive's current question / topic.
        role:       Executive role (e.g. "CEO", "CTO").
        startup_id: UUID of the current startup (None for non-startup queries).
        limit:      Max results to return after compression.

    Returns:
        Deduplicated, token-budget-compressed list of RAGResults.
    """
    from app.db.supabase_client import get_supabase

    supabase = get_supabase()
    emb = _get_embeddings()

    # Embed the query once
    loop = asyncio.get_event_loop()
    query_vector = await loop.run_in_executor(None, lambda: emb.embed_query(query))

    tasks = []

    # ── Tier 1-4: Startup memory (only if we have a startup_id) ──────────────
    if startup_id:
        tasks.append(_search_v2(
            supabase, query_vector,
            role=None, startup_id=startup_id, doc_type="startup",
            limit=_TIER_LIMITS["startup_memory"],
            tier="startup_memory",
        ))
        tasks.append(_search_v2(
            supabase, query_vector,
            role=None, startup_id=startup_id, doc_type="startup",
            tag_filter="decisions", limit=_TIER_LIMITS["decisions"],
            tier="decisions",
        ))
        tasks.append(_search_v2(
            supabase, query_vector,
            role=None, startup_id=startup_id, doc_type="startup",
            tag_filter="report", limit=_TIER_LIMITS["reports"],
            tier="reports",
        ))
        tasks.append(_search_v2(
            supabase, query_vector,
            role=None, startup_id=startup_id, doc_type="startup",
            tag_filter="timeline", limit=_TIER_LIMITS["timeline"],
            tier="timeline",
        ))

    # ── Tier 5: Role-specific general knowledge ───────────────────────────────
    tasks.append(_search_v2(
        supabase, query_vector,
        role=role, startup_id=None, doc_type="general",
        limit=_TIER_LIMITS["role_docs"],
        tier="role_docs",
    ))

    # ── Tier 6: General fallback (role='all') ─────────────────────────────────
    tasks.append(_search_v2(
        supabase, query_vector,
        role="all", startup_id=None, doc_type="general",
        limit=_TIER_LIMITS["general"],
        tier="general",
    ))

    # Run all tiers concurrently
    tier_results: list[list[RAGResult]] = await asyncio.gather(*tasks, return_exceptions=True)

    all_results: list[RAGResult] = []
    for batch in tier_results:
        if isinstance(batch, list):
            all_results.extend(batch)

    # Fallback: if role docs returned nothing, retry with no role filter
    if not any(
        isinstance(b, list) and len(b) > 0
        for b in tier_results[-2:]  # last two tiers = role_docs + general
    ):
        fallback = await _search_v2(
            supabase, query_vector,
            role=None, startup_id=None, doc_type="general",
            limit=limit, tier="general_fallback",
        )
        if isinstance(fallback, list):
            all_results.extend(fallback)

    # Deduplicate → compress → return top-limit
    deduped = _deduplicate(all_results)
    compressed = _compress_results(deduped, max_tokens=MAX_CONTEXT_TOKENS)
    return compressed[:limit]


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
async def _search_v2(
    supabase,
    query_vector: list[float],
    role: Optional[str],
    startup_id: Optional[str],
    doc_type: Optional[str],
    limit: int,
    tier: str,
    tag_filter: Optional[str] = None,
) -> list[RAGResult]:
    """Call match_knowledge_v2 RPC and return RAGResult objects."""
    try:
        loop = asyncio.get_event_loop()

        def _call():
            params: dict = {
                "query_embedding": query_vector,
                "match_count": limit,
                "similarity_threshold": 0.0,
            }
            if role is not None:
                params["p_role"] = role
            if startup_id is not None:
                params["p_startup_id"] = startup_id
            if doc_type is not None:
                params["p_doc_type"] = doc_type

            resp = supabase.rpc("match_knowledge_v2", params).execute()
            return resp.data or []

        rows = await loop.run_in_executor(None, _call)

        results = []
        for row in rows:
            # Optional tag filter (client-side post-filter)
            if tag_filter and tag_filter not in (row.get("tags") or []):
                continue
            results.append(RAGResult(
                similarity=float(row.get("similarity", 0.0)),
                content=row.get("content", ""),
                source=row.get("source") or "",
                role=row.get("role") or "all",
                doc_type=row.get("doc_type") or "general",
                tags=row.get("tags") or [],
                chunk_id=row.get("chunk_id") or "",
                startup_id=str(row.get("startup_id")) if row.get("startup_id") else None,
            ))
        return results

    except Exception as e:
        print(f"[RAG] Tier '{tier}' search error: {e}")
        return []


# ─── Context formatter ────────────────────────────────────────────────────────

def format_context(
    results: list[RAGResult],
    startup_name: str = "",
) -> str:
    """Format RAGResults into a structured prompt-injection string.

    Groups results by tier (startup memory first, then frameworks),
    includes source attribution for each chunk.
    """
    if not results:
        return ""

    startup_docs = [r for r in results if r.doc_type == "startup"]
    general_docs = [r for r in results if r.doc_type == "general"]

    sections = []

    if startup_docs:
        lines = []
        for r in sorted(startup_docs, key=lambda x: x.similarity, reverse=True):
            lines.append(f"• {r.content.strip()[:500]}")
            if r.source:
                lines[-1] += f"\n  [Source: {r.source_label}]"
        label = f"[{startup_name} Company Memory]" if startup_name else "[Startup Memory]"
        sections.append(f"{label}\n" + "\n".join(lines))

    if general_docs:
        lines = []
        for r in sorted(general_docs, key=lambda x: x.similarity, reverse=True):
            lines.append(f"• {r.content.strip()[:500]}")
            if r.source:
                lines[-1] += f"\n  [Source: {r.source_label}]"
        sections.append("[Role Knowledge & Frameworks]\n" + "\n".join(lines))

    return "\n\n".join(sections)


# ─── Backward-compatible wrapper (used by base_executive._retrieve_rag_context) ─

async def retrieve_context(
    query: str,
    role: str,
    startup_id: Optional[str] = None,
    k_general: int = 3,
    k_startup: int = 4,
    startup_name: str = "",
) -> str:
    """Backward-compatible wrapper — returns formatted string with Redis caching."""
    from app.cache import get_cached_or_fetch
    import hashlib

    query_hash = hashlib.md5(query.encode()).hexdigest()
    cache_key = f"rag:context:{query_hash}:role:{role}:startup:{startup_id}"

    async def fetch():
        try:
            results = await retrieve_docs(
                query=query,
                role=role,
                startup_id=startup_id,
                limit=k_general + k_startup,
            )
            return format_context(results, startup_name=startup_name)
        except Exception as e:
            print(f"[RAG] retrieve_context failed: {e}")
            return ""

    return await get_cached_or_fetch(cache_key, fetch, ttl_seconds=3600)


# ─── Knowledge ingestion ──────────────────────────────────────────────────────

@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
async def add_documents(
    texts: list[str],
    role: str = "all",
    source: str = "",
    tags: Optional[list[str]] = None,
    doc_type: str = "general",
    startup_id: Optional[str] = None,
    chunk: bool = True,
) -> int:
    """Embed and store documents with full metadata.

    Performs chunking if chunk=True (recommended for long documents).

    Returns:
        Number of chunks inserted.
    """
    from app.db.supabase_client import get_supabase
    supabase = get_supabase()
    emb = _get_embeddings()
    loop = asyncio.get_event_loop()

    rows_to_insert = []
    for text in texts:
        if chunk:
            chunks = chunk_text(text, source=source)
        else:
            base_id = f"{source or 'doc'}:{hashlib.md5(text[:100].encode()).hexdigest()[:8]}"
            chunks = [{"text": text, "chunk_id": f"{base_id}:0", "chunk_index": 0, "total_chunks": 1}]

        for c in chunks:
            vector = await loop.run_in_executor(None, lambda t=c["text"]: emb.embed_query(t))
            rows_to_insert.append({
                "content":    c["text"],
                "embedding":  vector,
                "metadata":   {"chunk_index": c["chunk_index"], "total_chunks": c["total_chunks"]},
                "role":       role,
                "source":     source or None,
                "tags":       tags or [],
                "doc_type":   doc_type,
                "startup_id": startup_id,
                "chunk_id":   c["chunk_id"],
            })

    if rows_to_insert:
        await loop.run_in_executor(
            None,
            lambda: supabase.table("knowledge_base").insert(rows_to_insert).execute()
        )
        from app.cache import invalidate_cache
        if startup_id:
            await invalidate_cache(f"rag:context:*:startup:{startup_id}")
        else:
            await invalidate_cache(f"rag:context:*:role:{role}:startup:*")

    print(f"[RAG] Inserted {len(rows_to_insert)} chunks (source={source!r}, role={role!r})")
    return len(rows_to_insert)


async def delete_document(source: str) -> int:
    """Delete all chunks from a given source."""
    from app.db.supabase_client import get_supabase
    supabase = get_supabase()
    loop = asyncio.get_event_loop()

    resp = await loop.run_in_executor(
        None,
        lambda: supabase.table("knowledge_base").delete().eq("source", source).execute()
    )
    deleted = len(resp.data) if resp.data else 0
    from app.cache import invalidate_cache
    await invalidate_cache("rag:context:*")
    print(f"[RAG] Deleted {deleted} chunks for source={source!r}")
    return deleted


async def reindex_document(
    source: str,
    texts: list[str],
    role: str = "all",
    tags: Optional[list[str]] = None,
    doc_type: str = "general",
    startup_id: Optional[str] = None,
) -> int:
    """Delete existing chunks for a source and re-embed from scratch."""
    await delete_document(source)
    return await add_documents(
        texts=texts, role=role, source=source,
        tags=tags, doc_type=doc_type, startup_id=startup_id,
    )


async def list_sources() -> list[dict]:
    """Return all indexed sources with chunk counts."""
    from app.db.supabase_client import get_supabase
    supabase = get_supabase()
    loop = asyncio.get_event_loop()

    resp = await loop.run_in_executor(
        None,
        lambda: supabase.table("knowledge_base")
            .select("source, role, doc_type, tags")
            .execute()
    )
    rows = resp.data or []

    # Aggregate by source
    agg: dict[str, dict] = {}
    for row in rows:
        src = row.get("source") or "(unset)"
        if src not in agg:
            agg[src] = {"source": src, "role": row.get("role"), "doc_type": row.get("doc_type"), "chunk_count": 0}
        agg[src]["chunk_count"] += 1
    return sorted(agg.values(), key=lambda x: x["chunk_count"], reverse=True)


# ─── Backward-compat: startup memory persistence (called from graph.py) ───────

async def add_startup_memory(
    startup_id: str,
    texts: list[str],
    metadatas: Optional[list[dict]] = None,
    startup_name: str = "",
) -> int:
    """Store startup-specific memory after a meeting.

    Called automatically from graph.py after each meeting completes.
    """
    if not texts:
        return 0

    results = []
    for i, text in enumerate(texts):
        meta = metadatas[i] if metadatas and i < len(metadatas) else {}
        category = meta.get("category", "memory")
        executive = meta.get("executive", "")
        tags = [category]
        if executive:
            tags.append(executive.lower().replace(" ", "_"))

        source_label = f"{startup_name or startup_id}/{category}"
        if executive:
            source_label += f"/{executive}"

        n = await add_documents(
            texts=[text],
            role=executive if executive else "all",
            source=source_label,
            tags=tags,
            doc_type="startup",
            startup_id=startup_id,
            chunk=False,  # startup memory entries are already short
        )
        results.append(n)

    total = sum(results)
    print(f"[RAG] Persisted {total} startup memory entries for startup_id={startup_id!r}")
    return total


# ─── Legacy add_general_knowledge (kept for compatibility) ────────────────────

async def add_general_knowledge(
    texts: list[str],
    metadatas: Optional[list[dict]] = None,
    role: str = "all",
    source: str = "",
    tags: Optional[list[str]] = None,
) -> int:
    """Embed and store general knowledge documents."""
    return await add_documents(
        texts=texts,
        role=role,
        source=source,
        tags=tags,
        doc_type="general",
    )
