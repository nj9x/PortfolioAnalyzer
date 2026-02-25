"""Router for the PDF Research tool.

Provides endpoints for:
- Uploading a PDF and extracting its text + page structure
- Keyword search within the extracted document
- AI-powered summarization of keyword-matched sections
"""

import hashlib
import json
import logging
import re
from typing import Optional

from fastapi import APIRouter, HTTPException, UploadFile, File, Query
from pydantic import BaseModel

from app.config import get_settings
from app.services.cache_service import cache

logger = logging.getLogger(__name__)

router = APIRouter()

# ─── PDF text extraction ─────────────────────────────────────────────

def _extract_pdf_pages(file_bytes: bytes) -> list[dict]:
    """Extract text from each page of a PDF, returning structured page data."""
    from pypdf import PdfReader
    from io import BytesIO

    reader = PdfReader(BytesIO(file_bytes))
    pages = []
    for i, page in enumerate(reader.pages):
        text = page.extract_text() or ""
        pages.append({
            "page": i + 1,
            "text": text,
            "char_count": len(text),
        })
    return pages


# ─── Upload endpoint ─────────────────────────────────────────────────

@router.post("/upload")
async def upload_pdf(file: UploadFile = File(...)):
    """Upload a PDF, extract text per page, and cache the result.

    Returns a document ID, page count, and a preview of each page.
    """
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")

    contents = await file.read()
    if len(contents) > 50 * 1024 * 1024:  # 50 MB limit
        raise HTTPException(status_code=400, detail="File too large (max 50 MB)")

    # Generate a stable document ID from content hash
    doc_id = hashlib.sha256(contents).hexdigest()[:16]

    try:
        pages = _extract_pdf_pages(contents)
    except Exception as e:
        logger.error("PDF extraction failed: %s", e)
        raise HTTPException(status_code=422, detail=f"Could not parse PDF: {e}")

    if not pages or all(p["char_count"] == 0 for p in pages):
        raise HTTPException(
            status_code=422,
            detail="PDF appears to be image-only or has no extractable text",
        )

    total_chars = sum(p["char_count"] for p in pages)
    doc_data = {
        "doc_id": doc_id,
        "filename": file.filename,
        "page_count": len(pages),
        "total_chars": total_chars,
        "pages": pages,
    }

    # Cache for 2 hours
    settings = get_settings()
    cache.set(f"pdf:{doc_id}", doc_data, 7200)

    # Return metadata + short previews (not full text) for initial response
    page_previews = [
        {"page": p["page"], "preview": p["text"][:200].strip(), "char_count": p["char_count"]}
        for p in pages
    ]

    return {
        "doc_id": doc_id,
        "filename": file.filename,
        "page_count": len(pages),
        "total_chars": total_chars,
        "pages": page_previews,
    }


# ─── Keyword search endpoint ─────────────────────────────────────────

@router.get("/search")
def search_pdf(
    doc_id: str = Query(..., description="Document ID from upload"),
    q: str = Query(..., min_length=1, description="Keyword or phrase to search for"),
    context_chars: int = Query(150, ge=50, le=500, description="Characters of context around each match"),
):
    """Search for keywords within the uploaded PDF and return matches with context."""
    doc_data = cache.get(f"pdf:{doc_id}")
    if not doc_data:
        raise HTTPException(status_code=404, detail="Document not found. Please re-upload the PDF.")

    q_lower = q.lower()
    # Escape regex special chars but allow basic wildcards
    pattern = re.escape(q)
    try:
        regex = re.compile(pattern, re.IGNORECASE)
    except re.error:
        regex = None

    matches = []
    for page_data in doc_data["pages"]:
        text = page_data["text"]
        page_num = page_data["page"]

        # Find all occurrences
        if regex:
            for m in regex.finditer(text):
                start = max(0, m.start() - context_chars)
                end = min(len(text), m.end() + context_chars)
                snippet = text[start:end].strip()
                # Add ellipsis indicators
                if start > 0:
                    snippet = "..." + snippet
                if end < len(text):
                    snippet = snippet + "..."

                matches.append({
                    "page": page_num,
                    "match": m.group(),
                    "snippet": snippet,
                    "position": m.start(),
                })

    return {
        "doc_id": doc_id,
        "query": q,
        "total_matches": len(matches),
        "matches": matches[:100],  # Cap at 100 results
    }


# ─── Get page content endpoint ───────────────────────────────────────

@router.get("/page")
def get_page_content(
    doc_id: str = Query(..., description="Document ID from upload"),
    page: int = Query(..., ge=1, description="Page number (1-indexed)"),
):
    """Return full text content of a specific page."""
    doc_data = cache.get(f"pdf:{doc_id}")
    if not doc_data:
        raise HTTPException(status_code=404, detail="Document not found. Please re-upload the PDF.")

    if page > len(doc_data["pages"]):
        raise HTTPException(status_code=404, detail=f"Page {page} not found (document has {len(doc_data['pages'])} pages)")

    page_data = doc_data["pages"][page - 1]
    return {
        "doc_id": doc_id,
        "page": page,
        "text": page_data["text"],
        "char_count": page_data["char_count"],
    }


# ─── AI summarize endpoint ───────────────────────────────────────────

class SummarizeRequest(BaseModel):
    doc_id: str
    keywords: list[str]
    focus: str = ""  # Optional user-provided focus/question


@router.post("/summarize")
def summarize_pdf(req: SummarizeRequest):
    """Use AI to summarize the PDF content focused on the given keywords.

    Extracts the most relevant sections based on keywords and sends them
    to Claude for a structured summary.
    """
    settings = get_settings()
    if not settings.ANTHROPIC_API_KEY:
        raise HTTPException(status_code=503, detail="ANTHROPIC_API_KEY not configured")

    doc_data = cache.get(f"pdf:{req.doc_id}")
    if not doc_data:
        raise HTTPException(status_code=404, detail="Document not found. Please re-upload the PDF.")

    # Build context: gather relevant sections around keyword matches
    relevant_sections = []
    full_text_parts = []

    for page_data in doc_data["pages"]:
        text = page_data["text"]
        page_num = page_data["page"]
        full_text_parts.append(f"[Page {page_num}]\n{text}")

        # Check if page contains any keywords
        text_lower = text.lower()
        matched_keywords = [kw for kw in req.keywords if kw.lower() in text_lower]
        if matched_keywords:
            relevant_sections.append({
                "page": page_num,
                "keywords_found": matched_keywords,
                "text": text,
            })

    # Build the content for AI — prioritize relevant sections but include broader context
    if relevant_sections:
        context_parts = []
        for sec in relevant_sections[:20]:  # Cap at 20 most relevant pages
            context_parts.append(
                f"--- PAGE {sec['page']} (matches: {', '.join(sec['keywords_found'])}) ---\n"
                f"{sec['text']}"
            )
        ai_content = "\n\n".join(context_parts)
    else:
        # No keyword matches — use full document (truncated)
        ai_content = "\n\n".join(full_text_parts)

    # Truncate for AI context window
    max_context = 100_000
    ai_content = ai_content[:max_context]

    keywords_str = ", ".join(req.keywords)
    focus_str = req.focus or f"information related to: {keywords_str}"

    try:
        import anthropic

        client = anthropic.Anthropic(
            api_key=settings.ANTHROPIC_API_KEY,
            timeout=90.0,
            max_retries=0,
        )

        system_prompt = (
            "You are a document research assistant. The user has uploaded a PDF document and wants to "
            "find and understand specific information within it. Analyze the document content provided "
            "and create a focused summary based on the user's keywords and interests.\n\n"
            "Format your response as valid JSON with these fields:\n"
            '- "summary": A clear, comprehensive summary of the relevant findings (3-8 sentences)\n'
            '- "key_findings": An array of the most important data points found (max 8), each with:\n'
            '  - "finding": A concise statement of the finding\n'
            '  - "page": The page number where this was found\n'
            '  - "relevance": Brief note on why this matters for the user\'s query\n'
            '- "data_points": An array of specific numbers, dates, or facts extracted (max 10), each with:\n'
            '  - "label": What the data point represents\n'
            '  - "value": The extracted value\n'
            '  - "page": Page number\n'
            '- "sections_overview": Brief description of which parts of the document are most relevant\n'
            "Respond with ONLY valid JSON."
        )

        message = client.messages.create(
            model=settings.CLAUDE_MODEL,
            max_tokens=3000,
            system=system_prompt,
            messages=[
                {
                    "role": "user",
                    "content": (
                        f"Keywords to focus on: {keywords_str}\n"
                        f"User's research focus: {focus_str}\n\n"
                        f"--- DOCUMENT CONTENT ---\n{ai_content}"
                    ),
                }
            ],
        )

        raw = message.content[0].text

        # Parse JSON response
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            match = re.search(r"```(?:json)?\s*([\s\S]*?)```", raw)
            if match:
                try:
                    parsed = json.loads(match.group(1))
                except json.JSONDecodeError:
                    parsed = {"summary": raw, "key_findings": [], "data_points": [], "sections_overview": ""}
            else:
                parsed = {"summary": raw, "key_findings": [], "data_points": [], "sections_overview": ""}

        return {
            "doc_id": req.doc_id,
            "keywords": req.keywords,
            "pages_analyzed": len(relevant_sections) if relevant_sections else len(doc_data["pages"]),
            "result": parsed,
        }
    except Exception as e:
        logger.error("PDF AI summarize failed for %s: %s", req.doc_id, e)
        raise HTTPException(status_code=500, detail=f"AI summarization failed: {e}")
