"""
document_processor.py — File parsing utilities for the Operatium Knowledge Management System.

Supports:
    - PDF    (via pypdf)
    - Markdown (.md)
    - Plain text (.txt)

Each parser returns raw text, which is then passed to vector_store.add_documents()
for chunking + embedding + storage.
"""

from __future__ import annotations

import io
import re
from pathlib import Path


def extract_text_from_file(file_bytes: bytes, filename: str) -> str:
    """Dispatch to the appropriate parser based on file extension.

    Args:
        file_bytes: Raw bytes of the uploaded file.
        filename:   Original filename including extension.

    Returns:
        Extracted plain text, ready for chunking.

    Raises:
        ValueError: If the file type is not supported.
    """
    ext = Path(filename).suffix.lower()

    if ext == ".pdf":
        return _extract_pdf(file_bytes)
    elif ext in {".md", ".markdown"}:
        return _extract_markdown(file_bytes)
    elif ext == ".txt":
        return _extract_txt(file_bytes)
    else:
        raise ValueError(
            f"Unsupported file type: {ext!r}. "
            "Supported: .pdf, .md, .markdown, .txt"
        )


def _extract_pdf(file_bytes: bytes) -> str:
    """Extract text from a PDF using pypdf."""
    try:
        from pypdf import PdfReader
    except ImportError:
        raise ImportError(
            "pypdf is required to parse PDFs. Run: pip install pypdf"
        )

    reader = PdfReader(io.BytesIO(file_bytes))
    pages = []
    for i, page in enumerate(reader.pages):
        text = page.extract_text() or ""
        if text.strip():
            pages.append(f"[Page {i + 1}]\n{text.strip()}")

    return "\n\n".join(pages)


def _extract_markdown(file_bytes: bytes) -> str:
    """Extract plain text from Markdown, stripping frontmatter and formatting."""
    text = file_bytes.decode("utf-8", errors="replace")

    # Strip YAML frontmatter (--- ... ---)
    text = re.sub(r"^---\n.*?\n---\n", "", text, flags=re.DOTALL)

    # Strip HTML comments
    text = re.sub(r"<!--.*?-->", "", text, flags=re.DOTALL)

    # Convert headers to plain text (keep the text, remove # prefix)
    text = re.sub(r"^#{1,6}\s+", "", text, flags=re.MULTILINE)

    # Strip inline code backticks (keep content)
    text = re.sub(r"`([^`]+)`", r"\1", text)

    # Strip bold/italic markers
    text = re.sub(r"\*{1,3}([^*]+)\*{1,3}", r"\1", text)
    text = re.sub(r"_{1,3}([^_]+)_{1,3}", r"\1", text)

    # Strip markdown links — keep the display text
    text = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", text)

    # Collapse multiple blank lines
    text = re.sub(r"\n{3,}", "\n\n", text)

    return text.strip()


def _extract_txt(file_bytes: bytes) -> str:
    """Decode a plain text file."""
    return file_bytes.decode("utf-8", errors="replace").strip()


def source_slug_from_filename(filename: str) -> str:
    """Convert a filename to a clean source slug for the knowledge_base."""
    stem = Path(filename).stem
    slug = re.sub(r"[^a-z0-9_]", "_", stem.lower())
    slug = re.sub(r"_+", "_", slug).strip("_")
    return slug[:80]
