"""SEC EDGAR data source — fetch company filings and financial facts.

The SEC provides free, public APIs at data.sec.gov and efts.sec.gov.
No API key is required, but a descriptive User-Agent header is mandatory.
Rate limit: 10 requests/second.
"""

import logging
import re
import httpx
from html.parser import HTMLParser

from app.config import get_settings

logger = logging.getLogger(__name__)

_BASE_SUBMISSIONS = "https://data.sec.gov/submissions"
_BASE_XBRL = "https://data.sec.gov/api/xbrl"
_TICKER_URL = "https://www.sec.gov/files/company_tickers.json"
_EFTS_SEARCH = "https://efts.sec.gov/LATEST/search-index"

# In-memory CIK lookup (populated on first call)
_ticker_to_cik: dict[str, str] = {}


class _HTMLTextExtractor(HTMLParser):
    """Simple HTML-to-text converter for SEC filing documents."""

    def __init__(self):
        super().__init__()
        self._pieces: list[str] = []
        self._skip = False

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style", "head"):
            self._skip = True
        elif tag in ("p", "div", "br", "tr", "li", "h1", "h2", "h3", "h4", "h5", "h6"):
            self._pieces.append("\n")
        elif tag == "td":
            self._pieces.append("\t")

    def handle_endtag(self, tag):
        if tag in ("script", "style", "head"):
            self._skip = False
        elif tag in ("p", "div", "tr", "table", "h1", "h2", "h3", "h4", "h5", "h6"):
            self._pieces.append("\n")

    def handle_data(self, data):
        if not self._skip:
            self._pieces.append(data)

    def get_text(self) -> str:
        raw = "".join(self._pieces)
        # Collapse whitespace while preserving paragraph breaks
        raw = re.sub(r"[ \t]+", " ", raw)
        raw = re.sub(r"\n[ \t]+", "\n", raw)
        raw = re.sub(r"\n{3,}", "\n\n", raw)
        return raw.strip()


def _headers() -> dict[str, str]:
    settings = get_settings()
    return {
        "User-Agent": settings.SEC_EDGAR_USER_AGENT,
        "Accept-Encoding": "gzip, deflate",
    }


def _ensure_cik_map() -> None:
    """Load the SEC ticker-to-CIK mapping if not already cached."""
    global _ticker_to_cik
    if _ticker_to_cik:
        return
    try:
        resp = httpx.get(_TICKER_URL, headers=_headers(), timeout=15)
        resp.raise_for_status()
        data = resp.json()
        for entry in data.values():
            ticker = entry.get("ticker", "").upper()
            cik = str(entry.get("cik_str", ""))
            if ticker and cik:
                _ticker_to_cik[ticker] = cik.zfill(10)
    except Exception as e:
        logger.error("Failed to load SEC CIK map: %s", e)


def _get_cik(ticker: str) -> str | None:
    """Resolve ticker symbol to zero-padded 10-digit CIK."""
    _ensure_cik_map()
    return _ticker_to_cik.get(ticker.upper())


def fetch_recent_filings(
    ticker: str,
    filing_types: list[str] | None = None,
    limit: int = 10,
) -> dict:
    """Fetch recent SEC filings for a ticker.

    Returns dict with company info and list of recent filings.
    """
    cik = _get_cik(ticker)
    if not cik:
        return {"ticker": ticker, "error": f"CIK not found for {ticker}"}

    if filing_types is None:
        filing_types = ["10-K", "10-Q", "8-K"]

    try:
        url = f"{_BASE_SUBMISSIONS}/CIK{cik}.json"
        resp = httpx.get(url, headers=_headers(), timeout=15)
        resp.raise_for_status()
        data = resp.json()

        company_name = data.get("name", "")
        sic = data.get("sic", "")
        sic_desc = data.get("sicDescription", "")
        fiscal_year_end = data.get("fiscalYearEnd", "")

        recent = data.get("filings", {}).get("recent", {})
        forms = recent.get("form", [])
        dates = recent.get("filingDate", [])
        accessions = recent.get("accessionNumber", [])
        primary_docs = recent.get("primaryDocument", [])
        descriptions = recent.get("primaryDocDescription", [])

        filings = []
        for i, form in enumerate(forms):
            if form not in filing_types:
                continue
            if len(filings) >= limit:
                break

            accession_clean = accessions[i].replace("-", "")
            filing_url = (
                f"https://www.sec.gov/Archives/edgar/data/"
                f"{cik.lstrip('0')}/{accession_clean}/{primary_docs[i]}"
            )

            filings.append({
                "form": form,
                "filing_date": dates[i],
                "accession": accessions[i],
                "description": descriptions[i] if i < len(descriptions) else "",
                "url": filing_url,
            })

        return {
            "ticker": ticker,
            "cik": cik,
            "company_name": company_name,
            "sic": sic,
            "sic_description": sic_desc,
            "fiscal_year_end": fiscal_year_end,
            "filings": filings,
        }
    except Exception as e:
        logger.error("Failed to fetch EDGAR filings for %s: %s", ticker, e)
        return {"ticker": ticker, "error": str(e)}


def fetch_financial_facts(ticker: str) -> dict:
    """Fetch XBRL financial facts (revenue, net income, EPS, assets, etc.).

    Uses the XBRL companyfacts endpoint to pull standardized financial data
    from recent 10-K and 10-Q filings.
    """
    cik = _get_cik(ticker)
    if not cik:
        return {"ticker": ticker, "error": f"CIK not found for {ticker}"}

    try:
        url = f"{_BASE_XBRL}/companyfacts/CIK{cik}.json"
        resp = httpx.get(url, headers=_headers(), timeout=15)
        resp.raise_for_status()
        data = resp.json()

        facts = data.get("facts", {})
        us_gaap = facts.get("us-gaap", {})

        # Key financial concepts to extract
        concepts = {
            "Revenues": "revenue",
            "RevenueFromContractWithCustomerExcludingAssessedTax": "revenue",
            "NetIncomeLoss": "net_income",
            "EarningsPerShareBasic": "eps_basic",
            "EarningsPerShareDiluted": "eps_diluted",
            "Assets": "total_assets",
            "Liabilities": "total_liabilities",
            "StockholdersEquity": "stockholders_equity",
            "OperatingIncomeLoss": "operating_income",
            "CashAndCashEquivalentsAtCarryingValue": "cash",
            "LongTermDebt": "long_term_debt",
            "CommonStockSharesOutstanding": "shares_outstanding",
        }

        extracted = {}
        for gaap_name, friendly_name in concepts.items():
            if friendly_name in extracted:
                continue
            concept_data = us_gaap.get(gaap_name, {})
            units = concept_data.get("units", {})
            # Prefer USD for dollar amounts, shares for share counts
            values = units.get("USD", units.get("USD/shares", units.get("shares", [])))
            if not values:
                continue

            # Get the most recent annual (10-K) and quarterly (10-Q) values
            annual = [
                v for v in values
                if v.get("form") == "10-K" and v.get("val") is not None
            ]
            quarterly = [
                v for v in values
                if v.get("form") == "10-Q" and v.get("val") is not None
            ]

            annual.sort(key=lambda x: x.get("end", ""), reverse=True)
            quarterly.sort(key=lambda x: x.get("end", ""), reverse=True)

            entry = {}
            if annual:
                latest = annual[0]
                entry["annual"] = {
                    "value": latest["val"],
                    "period_end": latest.get("end", ""),
                    "filed": latest.get("filed", ""),
                }
                # Year-over-year growth if we have 2+ years
                if len(annual) >= 2 and annual[1]["val"] and annual[1]["val"] != 0:
                    yoy = ((annual[0]["val"] - annual[1]["val"]) / abs(annual[1]["val"])) * 100
                    entry["annual"]["yoy_growth_pct"] = round(yoy, 2)

            if quarterly:
                latest_q = quarterly[0]
                entry["quarterly"] = {
                    "value": latest_q["val"],
                    "period_end": latest_q.get("end", ""),
                    "filed": latest_q.get("filed", ""),
                }

            if entry:
                extracted[friendly_name] = entry

        return {
            "ticker": ticker,
            "cik": cik,
            "company_name": data.get("entityName", ""),
            "financials": extracted,
        }
    except Exception as e:
        logger.error("Failed to fetch EDGAR financial facts for %s: %s", ticker, e)
        return {"ticker": ticker, "error": str(e)}


def fetch_sec_data(tickers: list[str]) -> dict:
    """Fetch both filings and financial facts for multiple tickers.

    Returns: { "AAPL": { "filings": {...}, "financials": {...} }, ... }
    """
    results = {}
    for ticker in tickers:
        filings = fetch_recent_filings(ticker, limit=5)
        financials = fetch_financial_facts(ticker)

        results[ticker] = {
            "company_name": filings.get("company_name", financials.get("company_name", "")),
            "cik": filings.get("cik", financials.get("cik", "")),
            "sic_description": filings.get("sic_description", ""),
            "fiscal_year_end": filings.get("fiscal_year_end", ""),
            "recent_filings": filings.get("filings", []),
            "financials": financials.get("financials", {}),
        }
        if filings.get("error") and financials.get("error"):
            results[ticker] = {"error": filings["error"]}

    return results


def fetch_filing_content(accession: str, cik: str, primary_doc: str = "") -> dict:
    """Fetch the text content of a specific SEC filing.

    If primary_doc is not given, fetches the filing index to find it.
    Returns parsed plain text suitable for display and AI search.
    """
    cik_clean = cik.lstrip("0") or "0"
    accession_clean = accession.replace("-", "")

    try:
        # If no primary doc specified, get the filing index
        if not primary_doc:
            index_url = (
                f"https://www.sec.gov/Archives/edgar/data/"
                f"{cik_clean}/{accession_clean}/index.json"
            )
            resp = httpx.get(index_url, headers=_headers(), timeout=15, follow_redirects=True)
            resp.raise_for_status()
            index_data = resp.json()
            items = index_data.get("directory", {}).get("item", [])
            # Find the primary document (prefer .htm/.html)
            for item in items:
                name = item.get("name", "")
                if name.endswith((".htm", ".html")) and not name.startswith("R"):
                    primary_doc = name
                    break
            if not primary_doc and items:
                primary_doc = items[0].get("name", "")

        if not primary_doc:
            return {"error": "Could not determine primary document"}

        # Fetch the actual filing document
        doc_url = (
            f"https://www.sec.gov/Archives/edgar/data/"
            f"{cik_clean}/{accession_clean}/{primary_doc}"
        )
        resp = httpx.get(doc_url, headers=_headers(), timeout=30, follow_redirects=True)
        resp.raise_for_status()

        content_type = resp.headers.get("content-type", "")
        raw_html = resp.text

        # Convert HTML to plain text
        if "html" in content_type or raw_html.strip().startswith(("<", "<!DOCTYPE")):
            parser = _HTMLTextExtractor()
            parser.feed(raw_html)
            text = parser.get_text()
        else:
            text = raw_html

        # Truncate if extremely large (some 10-Ks can be 1MB+ text)
        max_chars = 500_000
        truncated = len(text) > max_chars
        if truncated:
            text = text[:max_chars]

        return {
            "accession": accession,
            "document": primary_doc,
            "url": doc_url,
            "content": text,
            "char_count": len(text),
            "truncated": truncated,
        }
    except Exception as e:
        logger.error("Failed to fetch filing content %s: %s", accession, e)
        return {"accession": accession, "error": str(e)}


def search_company_filings(
    query: str,
    ticker: str | None = None,
    filing_types: list[str] | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    limit: int = 20,
) -> dict:
    """Search EDGAR full-text search for filings matching a query.

    Uses the EFTS (EDGAR Full-Text Search) endpoint.
    """
    try:
        params: dict = {
            "q": query,
            "dateRange": "custom",
            "startdt": date_from or "2020-01-01",
            "enddt": date_to or "2026-12-31",
        }

        if ticker:
            cik = _get_cik(ticker)
            if cik:
                params["dateRange"] = "custom"

        if filing_types:
            params["forms"] = ",".join(filing_types)

        # Use the EDGAR full-text search API
        search_url = "https://efts.sec.gov/LATEST/search-index"
        resp = httpx.get(
            search_url,
            params=params,
            headers=_headers(),
            timeout=15,
            follow_redirects=True,
        )
        resp.raise_for_status()
        data = resp.json()

        hits = data.get("hits", {}).get("hits", [])
        results = []
        for hit in hits[:limit]:
            source = hit.get("_source", {})
            results.append({
                "entity_name": source.get("entity_name", ""),
                "file_num": source.get("file_num", ""),
                "form_type": source.get("form_type", ""),
                "file_date": source.get("file_date", ""),
                "period_of_report": source.get("period_of_report", ""),
                "file_description": source.get("file_description", ""),
            })

        return {"query": query, "total": data.get("hits", {}).get("total", {}).get("value", 0), "results": results}
    except Exception as e:
        logger.error("EDGAR search failed for '%s': %s", query, e)
        return {"query": query, "error": str(e)}
