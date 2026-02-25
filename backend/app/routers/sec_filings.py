"""Router for the dedicated SEC Filings explorer page.

Provides endpoints for:
- Searching/listing filings by ticker
- Fetching filing document content (HTML→text)
- AI-powered search within a filing document
"""

import logging
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.config import get_settings
from app.data_sources import edgar
from app.services.cache_service import cache

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/search")
def search_filings(
    ticker: str = Query(..., description="Ticker symbol (e.g. AAPL)"),
    filing_types: str = Query("10-K,10-Q,8-K", description="Comma-separated form types"),
    limit: int = Query(20, ge=1, le=50),
):
    """List recent SEC filings for a ticker."""
    types = [t.strip() for t in filing_types.split(",") if t.strip()]
    try:
        data = edgar.fetch_recent_filings(ticker.strip().upper(), filing_types=types, limit=limit)
    except Exception as e:
        logger.error("Unexpected error searching filings for %s: %s", ticker, e)
        raise HTTPException(status_code=502, detail=f"Failed to fetch filings from SEC: {e}")
    if data.get("error"):
        raise HTTPException(status_code=404, detail=data["error"])
    return data


@router.get("/content")
def get_filing_content(
    accession: str = Query(..., description="SEC accession number (e.g. 0000320193-24-000123)"),
    cik: str = Query(..., description="Zero-padded CIK"),
    doc: str = Query("", description="Primary document filename (optional)"),
):
    """Fetch the plain-text content of a specific SEC filing document."""
    settings = get_settings()
    cache_key = f"filing_content:{accession}"
    cached = cache.get(cache_key)
    if cached:
        return cached

    result = edgar.fetch_filing_content(accession, cik, primary_doc=doc)
    if result.get("error"):
        raise HTTPException(status_code=502, detail=result["error"])

    cache.set(cache_key, result, settings.SEC_FILINGS_CACHE_TTL)
    return result


class AiSearchRequest(BaseModel):
    accession: str
    cik: str
    query: str
    doc: str = ""


class AiAnalyzeRequest(BaseModel):
    accession: str
    cik: str
    doc: str = ""
    filing_type: str = ""


@router.post("/ai-search")
def ai_search_filing(req: AiSearchRequest):
    """Use AI to search within a filing document and return relevant excerpts."""
    settings = get_settings()
    if not settings.ANTHROPIC_API_KEY:
        raise HTTPException(status_code=503, detail="ANTHROPIC_API_KEY not configured")

    # Get the filing content (from cache or fresh)
    cache_key = f"filing_content:{req.accession}"
    cached = cache.get(cache_key)
    if cached and cached.get("content"):
        content = cached["content"]
    else:
        result = edgar.fetch_filing_content(req.accession, req.cik, primary_doc=req.doc)
        if result.get("error"):
            raise HTTPException(status_code=502, detail=result["error"])
        content = result["content"]
        cache.set(cache_key, result, settings.SEC_FILINGS_CACHE_TTL)

    # Truncate for AI context window — use first 100k chars
    max_context = 100_000
    content_for_ai = content[:max_context]

    try:
        import anthropic

        client = anthropic.Anthropic(
            api_key=settings.ANTHROPIC_API_KEY,
            timeout=60.0,
            max_retries=0,
        )

        system_prompt = (
            "You are a financial analyst assistant. The user has a question about an SEC filing document. "
            "Search through the document content provided and answer the question with specific excerpts "
            "and references. Format your response as structured JSON with these fields:\n"
            '- "answer": A clear, concise answer to the question (2-4 sentences)\n'
            '- "excerpts": An array of relevant excerpts from the document (max 5), each with:\n'
            '  - "text": The exact or near-exact quote from the document\n'
            '  - "context": Brief description of where this appears (e.g. "Risk Factors section")\n'
            '- "key_figures": An array of any specific numbers/metrics mentioned (max 5), each with:\n'
            '  - "label": What the number represents\n'
            '  - "value": The number/amount\n'
            "Respond with ONLY valid JSON."
        )

        message = client.messages.create(
            model=settings.CLAUDE_MODEL,
            max_tokens=2048,
            system=system_prompt,
            messages=[
                {
                    "role": "user",
                    "content": (
                        f"Question: {req.query}\n\n"
                        f"--- FILING DOCUMENT CONTENT ---\n{content_for_ai}"
                    ),
                }
            ],
        )

        raw = message.content[0].text

        # Try to parse as JSON; if that fails, return raw text
        import json

        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            # Try to extract JSON from markdown fences
            import re

            match = re.search(r"```(?:json)?\s*([\s\S]*?)```", raw)
            if match:
                try:
                    parsed = json.loads(match.group(1))
                except json.JSONDecodeError:
                    parsed = {"answer": raw, "excerpts": [], "key_figures": []}
            else:
                parsed = {"answer": raw, "excerpts": [], "key_figures": []}

        return {
            "query": req.query,
            "accession": req.accession,
            "result": parsed,
        }
    except Exception as e:
        logger.error("AI search failed for %s: %s", req.accession, e)
        raise HTTPException(status_code=500, detail=f"AI search failed: {e}")


@router.post("/ai-analyze")
def ai_analyze_filing(req: AiAnalyzeRequest):
    """Generate a comprehensive AI analysis of an SEC filing."""
    settings = get_settings()
    if not settings.ANTHROPIC_API_KEY:
        raise HTTPException(status_code=503, detail="ANTHROPIC_API_KEY not configured")

    # Get filing content (from cache or fresh)
    cache_key = f"filing_content:{req.accession}"
    cached = cache.get(cache_key)
    if cached and cached.get("content"):
        content = cached["content"]
    else:
        result = edgar.fetch_filing_content(req.accession, req.cik, primary_doc=req.doc)
        if result.get("error"):
            raise HTTPException(status_code=502, detail=result["error"])
        content = result["content"]
        cache.set(cache_key, result, settings.SEC_FILINGS_CACHE_TTL)

    # Truncate for AI context window
    max_context = 100_000
    content_for_ai = content[:max_context]

    try:
        import anthropic
        import json

        client = anthropic.Anthropic(
            api_key=settings.ANTHROPIC_API_KEY,
            timeout=120.0,
            max_retries=0,
        )

        filing_hint = f"This is a {req.filing_type} filing." if req.filing_type else ""

        system_prompt = (
            "You are a senior financial analyst reviewing an SEC filing. "
            f"{filing_hint} "
            "Provide a comprehensive analysis. Respond with ONLY valid JSON:\n"
            "{\n"
            '  "executive_summary": "3-5 sentence overview of the filing\'s most important points",\n'
            '  "key_financials": [\n'
            '    {"metric": "Revenue", "value": "$X.XB", "change": "+X% YoY", "assessment": "brief note"}\n'
            "  ],\n"
            '  "notable_items": [\n'
            '    {"category": "Risk Factor|Business Update|Legal|Accounting Change|etc", '
            '"title": "brief title", "detail": "1-2 sentence explanation", "severity": "high|medium|low"}\n'
            "  ],\n"
            '  "risk_assessment": {\n'
            '    "overall_risk": "high|medium|low",\n'
            '    "key_risks": ["risk 1", "risk 2"],\n'
            '    "risk_changes": "What has changed from prior periods"\n'
            "  },\n"
            '  "management_outlook": "Summary of management\'s forward-looking statements and guidance",\n'
            '  "red_flags": ["Any concerning items that investors should watch"],\n'
            '  "positive_signals": ["Any encouraging items for investors"]\n'
            "}"
        )

        message = client.messages.create(
            model=settings.CLAUDE_MODEL,
            max_tokens=4096,
            system=system_prompt,
            messages=[
                {
                    "role": "user",
                    "content": (
                        f"Analyze this SEC filing comprehensively:\n\n"
                        f"--- FILING DOCUMENT CONTENT ---\n{content_for_ai}"
                    ),
                }
            ],
        )

        raw = message.content[0].text

        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            import re

            match = re.search(r"```(?:json)?\s*([\s\S]*?)```", raw)
            if match:
                try:
                    parsed = json.loads(match.group(1))
                except json.JSONDecodeError:
                    parsed = {"executive_summary": raw, "key_financials": [], "notable_items": []}
            else:
                parsed = {"executive_summary": raw, "key_financials": [], "notable_items": []}

        return {
            "accession": req.accession,
            "filing_type": req.filing_type,
            "result": parsed,
        }
    except Exception as e:
        logger.error("AI analysis failed for %s: %s", req.accession, e)
        raise HTTPException(status_code=500, detail=f"AI analysis failed: {e}")
