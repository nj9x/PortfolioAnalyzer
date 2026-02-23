"""Stock data via Massive (formerly Polygon.io) REST API.

Massive provides quotes, history, company info, financials, and options data.
Authentication is via Bearer token in the Authorization header.
Base URL: https://api.massive.com

Endpoints used:
  - Ticker Snapshot:  GET /v2/snapshot/locale/us/markets/stocks/tickers/{ticker}
  - Custom Bars:      GET /v2/aggs/ticker/{ticker}/range/{mult}/{timespan}/{from}/{to}
  - Ticker Details:   GET /v3/reference/tickers/{ticker}
  - Stock Financials: GET /vX/reference/tickers/{ticker}/financials
"""

import logging
from datetime import datetime, timedelta

import httpx

from app.config import get_settings
from app.services.cache_service import cache
from app.utils.rate_limiter import RateLimiter

logger = logging.getLogger(__name__)

BASE_URL = "https://api.massive.com"

# Rate limiter — Massive free tier allows 5 requests/minute
_limiter = RateLimiter(max_requests=5, time_window_seconds=60)


def _headers() -> dict:
    settings = get_settings()
    return {"Authorization": f"Bearer {settings.MASSIVE_API_KEY}"}


def _get(path: str, params: dict | None = None) -> dict:
    """Make a GET request to the Massive REST API with rate limiting."""
    settings = get_settings()
    if not settings.MASSIVE_API_KEY:
        logger.warning("MASSIVE_API_KEY not configured")
        return {}

    _limiter.acquire_sync()

    url = f"{BASE_URL}{path}"
    try:
        resp = httpx.get(url, headers=_headers(), params=params, timeout=20)
        resp.raise_for_status()
        data = resp.json()

        if data.get("status") == "ERROR":
            logger.warning(f"Massive API error: {data.get('error', 'unknown')}")
            return {}

        return data
    except httpx.HTTPStatusError as e:
        logger.error(f"Massive API HTTP {e.response.status_code} for {path}: {e}")
        return {}
    except Exception as e:
        logger.error(f"Massive API error for {path}: {e}")
        return {}


# ─── Period helpers ────────────────────────────────────────────────────

_PERIOD_DAYS = {
    "1mo": 30,
    "3mo": 90,
    "6mo": 180,
    "1y": 365,
    "2y": 730,
    "5y": 1825,
}


def _period_to_dates(period: str) -> tuple[str, str]:
    """Convert a period string like '1y' to (from_date, to_date) YYYY-MM-DD."""
    days = _PERIOD_DAYS.get(period, 30)
    to_date = datetime.now().strftime("%Y-%m-%d")
    from_date = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")
    return from_date, to_date


# ─── Ticker Snapshot (current quotes) ─────────────────────────────────

def _get_ticker_snapshot(ticker: str) -> dict:
    """Fetch single ticker snapshot (current price, day/prevDay bars)."""
    cache_key = f"massive_snapshot:{ticker}"
    cached = cache.get(cache_key)
    if cached:
        return cached

    data = _get(f"/v2/snapshot/locale/us/markets/stocks/tickers/{ticker}")
    result = data.get("ticker", {})
    if result:
        cache.set(cache_key, result, 60)  # 1 min cache for snapshots
    return result


def fetch_quotes(tickers: list[str]) -> dict:
    """Fetch current quotes for a list of tickers via Massive Snapshot API."""
    data = {}
    for t in tickers:
        try:
            snap = _get_ticker_snapshot(t)
            if not snap:
                data[t] = {"current_price": None, "error": f"No data for {t}"}
                continue

            day = snap.get("day", {})
            prev = snap.get("prevDay", {})
            current_price = day.get("c")
            previous_close = prev.get("c")

            day_change_pct = None
            if current_price and previous_close and previous_close != 0:
                day_change_pct = round(
                    ((current_price - previous_close) / previous_close) * 100, 2
                )

            data[t] = {
                "current_price": round(current_price, 2) if current_price else None,
                "previous_close": round(previous_close, 2) if previous_close else None,
                "market_cap": None,  # populated by _get_ticker_details if needed
                "pe_ratio": None,
                "fifty_two_week_high": None,
                "fifty_two_week_low": None,
                "sector": None,
                "name": t,
                "day_change_pct": day_change_pct,
            }

            # Enrich with ticker details (name, sector, market cap)
            details = _get_ticker_details(t)
            if details:
                data[t]["name"] = details.get("name", t)
                data[t]["sector"] = details.get("sic_description")
                data[t]["market_cap"] = details.get("market_cap")

        except Exception as e:
            logger.error(f"Failed to fetch quote for {t}: {e}")
            data[t] = {"current_price": None, "error": f"Failed to fetch data for {t}"}

    return data


# ─── Custom Bars (historical OHLCV) ───────────────────────────────────

def fetch_history(ticker: str, period: str = "1mo") -> list[dict]:
    """Fetch historical OHLCV data via Massive Custom Bars.

    Returns list of dicts sorted oldest→newest:
    [{"date", "open", "high", "low", "close", "volume"}, ...]
    """
    cache_key = f"massive_history:{ticker}:{period}"
    cached = cache.get(cache_key)
    if cached:
        return cached

    from_date, to_date = _period_to_dates(period)

    try:
        data = _get(
            f"/v2/aggs/ticker/{ticker}/range/1/day/{from_date}/{to_date}",
            params={"adjusted": "true", "sort": "asc", "limit": "50000"},
        )

        results = data.get("results", [])
        if not results:
            return []

        rows = []
        for bar in results:
            # "t" is Unix milliseconds timestamp
            ts = bar.get("t", 0)
            date_str = datetime.utcfromtimestamp(ts / 1000).strftime("%Y-%m-%d")
            rows.append({
                "date": date_str,
                "open": float(bar.get("o", 0)),
                "high": float(bar.get("h", 0)),
                "low": float(bar.get("l", 0)),
                "close": float(bar.get("c", 0)),
                "volume": int(bar.get("v", 0)),
            })

        ttl = 3600 if period in ("1y", "2y", "5y") else 300
        cache.set(cache_key, rows, ttl)
        return rows

    except Exception as e:
        logger.error(f"Failed to fetch history for {ticker}: {e}")
        return []


# ─── Ticker Details (company info) ────────────────────────────────────

def _get_ticker_details(ticker: str) -> dict:
    """Fetch company details from Massive Ticker Details v3, cached 24hr."""
    cache_key = f"massive_details:{ticker}"
    cached = cache.get(cache_key)
    if cached:
        return cached

    data = _get(f"/v3/reference/tickers/{ticker}")
    result = data.get("results", {})
    if result:
        cache.set(cache_key, result, 86400)  # 24hr cache
    return result


# ─── Stock Financials (SEC filings) ───────────────────────────────────

def _get_stock_financials(ticker: str) -> dict:
    """Fetch most recent annual financials from Massive, cached 24hr."""
    cache_key = f"massive_financials:{ticker}"
    cached = cache.get(cache_key)
    if cached:
        return cached

    data = _get(
        f"/vX/reference/tickers/{ticker}/financials",
        params={"timeframe": "annual", "limit": "1", "sort": "filing_date", "order": "desc"},
    )

    results_list = data.get("results", [])
    if not results_list:
        return {}

    result = results_list[0]
    cache.set(cache_key, result, 86400)
    return result


# ─── Composite info (yfinance-compatible field names) ──────────────────

def fetch_info_safe(ticker_symbol: str) -> dict:
    """Fetch company info mapped to yfinance .info field names.

    Combines data from Massive Snapshot, Ticker Details, and Stock Financials
    so that downstream code (fundamentals.py, risk_service.py) can consume
    it without changes.
    """
    cache_key = f"massive_info:{ticker_symbol}"
    cached = cache.get(cache_key)
    if cached:
        return cached

    snapshot = _get_ticker_snapshot(ticker_symbol)
    details = _get_ticker_details(ticker_symbol)
    fin_raw = _get_stock_financials(ticker_symbol)

    # Extract price data from snapshot
    day = snapshot.get("day", {})
    prev = snapshot.get("prevDay", {})
    current_price = day.get("c")
    previous_close = prev.get("c")

    # Extract company data from ticker details
    name = details.get("name", ticker_symbol)
    market_cap = details.get("market_cap")
    shares = details.get("weighted_shares_outstanding") or details.get("share_class_shares_outstanding")

    # Extract financial data from SEC filings
    financials = fin_raw.get("financials", {})
    income = financials.get("income_statement", {})
    balance = financials.get("balance_sheet", {})
    cashflow = financials.get("cash_flow_statement", {})

    net_income = _fin_val(income, "net_income_loss")
    revenue = _fin_val(income, "revenues")
    operating_income = _fin_val(income, "operating_income_loss")
    ebitda = _fin_val(income, "income_loss_from_continuing_operations_before_income_taxes_minority_interest_and_income_loss_from_equity_method_investments")
    # Approximate EBITDA from operating income if the long XBRL field isn't available
    if ebitda is None:
        ebitda = operating_income

    eps = _fin_val(income, "basic_earnings_per_share") or _fin_val(income, "diluted_earnings_per_share")

    total_equity = _fin_val(balance, "equity")
    total_assets = _fin_val(balance, "assets")
    current_assets = _fin_val(balance, "current_assets")
    current_liabilities = _fin_val(balance, "current_liabilities")
    long_term_debt = _fin_val(balance, "long_term_debt") or _fin_val(balance, "noncurrent_liabilities")
    total_cash = _fin_val(balance, "cash") or _fin_val(balance, "cash_and_equivalents")

    operating_cf = _fin_val(cashflow, "net_cash_flow_from_operating_activities")
    capex = _fin_val(cashflow, "net_cash_flow_from_investing_activities")

    # Compute derived ratios
    trailing_pe = round(current_price / eps, 2) if current_price and eps and eps > 0 else None
    price_to_book = None
    book_value = None
    if total_equity and shares and shares > 0:
        book_value = round(total_equity / shares, 2)
        if current_price and book_value and book_value > 0:
            price_to_book = round(current_price / book_value, 2)

    roe = round(net_income / total_equity, 4) if net_income and total_equity and total_equity > 0 else None
    profit_margin = round(net_income / revenue, 4) if net_income and revenue and revenue > 0 else None

    debt_to_equity = None
    if long_term_debt and total_equity and total_equity > 0:
        debt_to_equity = round(long_term_debt / total_equity * 100, 2)

    current_ratio = round(current_assets / current_liabilities, 2) if current_assets and current_liabilities and current_liabilities > 0 else None

    free_cashflow = None
    if operating_cf is not None:
        free_cashflow = operating_cf - abs(capex or 0)

    enterprise_value = None
    if market_cap and long_term_debt and total_cash:
        enterprise_value = market_cap + long_term_debt - total_cash
    elif market_cap:
        enterprise_value = market_cap

    # Compute 52-week high/low from 1yr history
    history = fetch_history(ticker_symbol, period="1y")
    fifty_two_week_high = None
    fifty_two_week_low = None
    if history:
        highs = [h["high"] for h in history]
        lows = [h["low"] for h in history]
        fifty_two_week_high = max(highs)
        fifty_two_week_low = min(lows)

    info = {
        "shortName": name,
        "longName": name,
        "sector": details.get("sic_description"),
        "marketCap": market_cap,
        "sharesOutstanding": shares,
        "currentPrice": current_price,
        "regularMarketPrice": current_price,
        "previousClose": previous_close,
        "regularMarketPreviousClose": previous_close,
        "fiftyTwoWeekHigh": fifty_two_week_high,
        "fiftyTwoWeekLow": fifty_two_week_low,
        "trailingPE": trailing_pe,
        "forwardPE": None,
        "beta": None,  # Massive doesn't provide beta directly; computed from returns if needed
        "priceToBook": price_to_book,
        "bookValue": book_value,
        "enterpriseValue": enterprise_value,
        "ebitda": ebitda,
        "returnOnEquity": roe,
        "profitMargins": profit_margin,
        "debtToEquity": debt_to_equity,
        "currentRatio": current_ratio,
        "quickRatio": None,
        "revenueGrowth": None,
        "earningsGrowth": None,
        "earningsQuarterlyGrowth": None,
        "netIncomeToCommon": net_income,
        "totalDebt": long_term_debt,
        "totalCash": total_cash,
        "freeCashflow": free_cashflow,
    }

    if any(v is not None for v in [current_price, market_cap, net_income]):
        cache.set(cache_key, info, 300)  # 5 min cache

    return info


def fetch_financials(ticker_symbol: str) -> dict:
    """Fetch financial statement data via Massive Stock Financials.

    Returns dict with net_income, total_debt, total_cash, free_cashflow.
    Falls back to Alpha Vantage if Massive data is incomplete.
    """
    info = fetch_info_safe(ticker_symbol)

    result = {
        "net_income": info.get("netIncomeToCommon"),
        "total_debt": info.get("totalDebt"),
        "total_cash": info.get("totalCash"),
        "free_cashflow": info.get("freeCashflow"),
    }

    if any(v is not None for v in result.values()):
        return result

    # Fallback to Alpha Vantage for financial statements
    try:
        from app.data_sources import alpha_vantage
        return alpha_vantage.fetch_financial_statements(ticker_symbol)
    except Exception as e:
        logger.warning(f"Alpha Vantage fallback failed for {ticker_symbol}: {e}")
        return result


# ─── Helpers ───────────────────────────────────────────────────────────

def _fin_val(section: dict, field: str):
    """Extract numeric value from a Massive financials section entry.

    Each field is an object like {"value": 12345, "unit": "USD"}.
    """
    entry = section.get(field)
    if entry is None:
        return None
    if isinstance(entry, dict):
        val = entry.get("value")
        return val if val is not None else None
    return entry
