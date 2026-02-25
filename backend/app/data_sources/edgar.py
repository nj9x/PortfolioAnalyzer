"""SEC EDGAR data source — fetch company filings and financial facts.

The SEC provides free, public APIs at data.sec.gov and efts.sec.gov.
No API key is required, but a descriptive User-Agent header is mandatory.
Rate limit: 10 requests/second.
"""

import logging
import re
import time
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
_ticker_to_name: dict[str, str] = {}
_cik_load_attempted: bool = False

# Hardcoded CIK map for common tickers — used as fallback when SEC.gov
# blocks the full ticker map download (e.g. from certain cloud IPs).
_FALLBACK_CIK: dict[str, str] = {
    "AAPL": "0000320193", "MSFT": "0000789019", "GOOGL": "0001652044",
    "GOOG": "0001652044", "AMZN": "0001018724", "NVDA": "0001045810",
    "META": "0001326801", "TSLA": "0001318605", "BRK-B": "0001067983",
    "BRK.B": "0001067983", "JPM": "0000019617", "V": "0001403161",
    "JNJ": "0000200406", "UNH": "0000731766", "XOM": "0000034088",
    "WMT": "0000104169", "MA": "0001141391", "PG": "0000080424",
    "HD": "0000354950", "CVX": "0000093410", "LLY": "0000059478",
    "MRK": "0000310158", "ABBV": "0001551152", "PEP": "0000077476",
    "KO": "0000021344", "AVGO": "0001649338", "COST": "0000909832",
    "TMO": "0000097745", "MCD": "0000063908", "CSCO": "0000858877",
    "ABT": "0000001800", "ACN": "0001281761", "DHR": "0000313616",
    "ADBE": "0000796343", "NFLX": "0001065280", "CRM": "0001108524",
    "AMD": "0000002488", "INTC": "0000050863", "ORCL": "0001341439",
    "DIS": "0001744489", "NKE": "0000320187", "CMCSA": "0001166691",
    "VZ": "0000732712", "T": "0000732717", "PFE": "0000078003",
    "BAC": "0000070858", "WFC": "0000072971", "C": "0000831001",
    "GS": "0000886982", "MS": "0000895421", "SCHW": "0000316709",
    "PYPL": "0001633917", "SQ": "0001512673", "SHOP": "0001594805",
    "UBER": "0001543151", "ABNB": "0001559720", "COIN": "0001679788",
    "PLTR": "0001321655", "SNOW": "0001640147", "NET": "0001477333",
    "CRWD": "0001535527", "ZS": "0001713683", "BA": "0000012927",
    "CAT": "0000018230", "GE": "0000040545", "MMM": "0000066740",
    "IBM": "0000051143", "QCOM": "0000804328", "TXN": "0000097476",
    "AMAT": "0000006951", "LRCX": "0000707549", "MU": "0000723125",
    "NOW": "0001373715", "PANW": "0001327567", "SPOT": "0001639920",
    "SQ": "0001512673", "ROKU": "0001428439", "DDOG": "0001561550",
    "ZM": "0001585521", "DOCU": "0001261654", "SPY": "0000884394",
    "QQQ": "0001067839", "IWM": "0000728889", "VOO": "0001023581",
    "VTI": "0000862084", "BND": "0001014064",
}


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
    """Load the SEC ticker-to-CIK mapping if not already cached.

    Retries up to 3 times with backoff if the initial load fails.
    """
    global _ticker_to_cik, _ticker_to_name, _cik_load_attempted
    if _ticker_to_cik:
        return
    if _cik_load_attempted:
        # Already tried and failed recently — don't hammer SEC on every request
        return

    _cik_load_attempted = True
    last_err = None
    for attempt in range(3):
        try:
            resp = httpx.get(_TICKER_URL, headers=_headers(), timeout=20)
            resp.raise_for_status()
            data = resp.json()
            for entry in data.values():
                ticker = entry.get("ticker", "").upper()
                cik = str(entry.get("cik_str", ""))
                name = entry.get("title", "")
                if ticker and cik:
                    _ticker_to_cik[ticker] = cik.zfill(10)
                    if name:
                        _ticker_to_name[ticker] = name
            logger.info("Loaded SEC CIK map: %d tickers", len(_ticker_to_cik))
            return
        except Exception as e:
            last_err = e
            logger.warning(
                "CIK map load attempt %d/3 failed: %s", attempt + 1, e
            )
            if attempt < 2:
                time.sleep(1 * (attempt + 1))

    logger.error("Failed to load SEC CIK map after 3 attempts: %s", last_err)


def _get_cik(ticker: str) -> str | None:
    """Resolve ticker symbol to zero-padded 10-digit CIK."""
    _ensure_cik_map()
    t = ticker.upper()
    cik = _ticker_to_cik.get(t)
    if cik:
        return cik

    # Fallback: use hardcoded map for common tickers
    cik = _FALLBACK_CIK.get(t)
    if cik:
        logger.info("Using hardcoded CIK for %s: %s", t, cik)
        return cik

    # Reset the attempt flag so next request retries the CIK map load
    # (in case the initial failure was transient)
    global _cik_load_attempted
    if not _ticker_to_cik:
        _cik_load_attempted = False
    return None


def search_tickers(query: str, limit: int = 8) -> list[dict]:
    """Search for tickers matching a query string.

    Matches against ticker symbols and company names from the SEC CIK map,
    falling back to the hardcoded map if the full map isn't loaded.
    """
    _ensure_cik_map()
    q = query.upper().strip()
    if not q:
        return []

    results: list[dict] = []
    seen: set[str] = set()

    source = _ticker_to_cik if _ticker_to_cik else _FALLBACK_CIK

    # Pass 1: exact ticker prefix matches (highest priority)
    for ticker in source:
        if ticker.startswith(q) and ticker not in seen:
            seen.add(ticker)
            results.append({
                "ticker": ticker,
                "name": _ticker_to_name.get(ticker, ""),
            })
            if len(results) >= limit:
                return results

    # Pass 2: company name substring matches
    q_lower = query.lower().strip()
    for ticker, name in _ticker_to_name.items():
        if ticker in seen:
            continue
        if q_lower in name.lower():
            seen.add(ticker)
            results.append({"ticker": ticker, "name": name})
            if len(results) >= limit:
                return results

    # Pass 3: fallback map matches (if full map not loaded)
    if not _ticker_to_cik:
        for ticker in _FALLBACK_CIK:
            if ticker in seen:
                continue
            if ticker.startswith(q):
                seen.add(ticker)
                results.append({"ticker": ticker, "name": ""})
                if len(results) >= limit:
                    return results

    return results


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
                "primary_doc": primary_docs[i] if i < len(primary_docs) else "",
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
        # If primary_doc is the full-submission .txt file or the filing
        # index page, ignore it and discover the actual document instead.
        if primary_doc and (
            primary_doc.endswith(".txt")
            or "-index." in primary_doc.lower()
        ):
            primary_doc = ""

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
            # Find the primary document (prefer .htm/.html, skip R-files
            # and the full-submission .txt that contains SGML headers)
            htm_candidates = []
            for item in items:
                name = item.get("name", "")
                size = int(item.get("size", 0) or 0)
                if not name.endswith((".htm", ".html")):
                    continue
                if name.startswith("R") or name.startswith("r"):
                    continue
                if "-index." in name.lower():
                    continue
                htm_candidates.append((name, size))
            if htm_candidates:
                # Pick the largest .htm file — the actual filing is almost
                # always the biggest HTML document in the directory.
                htm_candidates.sort(key=lambda x: x[1], reverse=True)
                primary_doc = htm_candidates[0][0]
            elif items:
                # Last resort: first item that isn't the accession .txt
                for item in items:
                    name = item.get("name", "")
                    if not name.endswith(".txt"):
                        primary_doc = name
                        break
                if not primary_doc:
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

        # Strip SEC SGML wrapper if present.  Full submission text files
        # contain <SEC-DOCUMENT>, <SEC-HEADER>, and embed the actual HTML
        # inside <DOCUMENT><TEXT>...</TEXT></DOCUMENT> blocks.
        stripped = raw_html.lstrip()
        if (stripped[:100].startswith("<SEC-DOCUMENT>")
                or stripped[:100].startswith("<SEC-HEADER>")
                or "ACCESSION NUMBER:" in raw_html[:2000]):
            # Try to extract from the first <TEXT>...</TEXT> block
            text_start = raw_html.find("<TEXT>")
            if text_start >= 0:
                text_start += len("<TEXT>")
                text_end = raw_html.find("</TEXT>", text_start)
                if text_end >= 0:
                    raw_html = raw_html[text_start:text_end].strip()
                else:
                    raw_html = raw_html[text_start:].strip()
            else:
                # Fallback: jump to the first <html tag
                html_start = raw_html.lower().find("<html")
                if html_start >= 0:
                    raw_html = raw_html[html_start:]
                    html_end = raw_html.lower().rfind("</html>")
                    if html_end > 0:
                        raw_html = raw_html[:html_end + 7]

        # Convert HTML to plain text
        if "html" in content_type or raw_html.strip()[:10].startswith(("<", "<!DOCTYPE")):
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
