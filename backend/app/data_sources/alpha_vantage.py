"""Alpha Vantage — primary data source for stock quotes, history, and fundamentals.

Key efficiency trick: TIME_SERIES_DAILY returns BOTH current price AND full history
in a single API call, so we cache it and reuse for quotes + technical analysis.

Free tier constraints:
  - ~25 requests/day, 1 request/second burst limit
  - outputsize=compact only (~100 trading days); full requires premium
  - SMA 200 and golden/death cross need premium for sufficient history
We mitigate with aggressive caching:
  - Daily prices: cached 1 hour
  - Company overview: cached 24 hours
  - Financial statements: cached 24 hours
"""

import time
import logging
import httpx
from app.config import get_settings
from app.services.cache_service import cache

logger = logging.getLogger(__name__)

BASE_URL = "https://www.alphavantage.co/query"

# Simple rate limiter: 5 calls per minute max
_call_timestamps: list[float] = []
_MAX_CALLS_PER_MINUTE = 5

# Daily call counter — warns when approaching free-tier limit
_daily_call_count = 0
_daily_count_date: str | None = None


def _rate_limit():
    """Enforce rate limiting: 1 request per 1.2s AND max 5 per minute."""
    global _call_timestamps
    now = time.time()
    _call_timestamps = [t for t in _call_timestamps if now - t < 60]

    # Free tier requires ~1 request/second; use 1.2s to be safe
    if _call_timestamps:
        since_last = now - _call_timestamps[-1]
        if since_last < 1.2:
            wait = 1.2 - since_last
            logger.debug(f"Alpha Vantage per-second throttle — waiting {wait:.1f}s")
            time.sleep(wait)

    # Also enforce 5 per minute cap
    if len(_call_timestamps) >= _MAX_CALLS_PER_MINUTE:
        sleep_time = 60 - (now - _call_timestamps[0])
        if sleep_time > 0:
            logger.info(f"Alpha Vantage rate limit — sleeping {sleep_time:.1f}s")
            time.sleep(sleep_time)
    _call_timestamps.append(time.time())


def _track_daily_calls():
    """Track daily API call count and warn when approaching free-tier limit."""
    global _daily_call_count, _daily_count_date
    today = time.strftime("%Y-%m-%d")
    if _daily_count_date != today:
        _daily_call_count = 0
        _daily_count_date = today
    _daily_call_count += 1
    if _daily_call_count == 20:
        logger.warning(
            f"Alpha Vantage: {_daily_call_count} API calls today "
            "— approaching free tier limit (~25/day)"
        )
    elif _daily_call_count >= 25:
        logger.warning(
            f"Alpha Vantage: {_daily_call_count} API calls today "
            "— free tier limit likely exceeded"
        )


def _api_call(function: str, symbol: str, extra_params: dict | None = None) -> dict:
    """Make a synchronous Alpha Vantage API call with rate limiting."""
    settings = get_settings()
    key = settings.ALPHA_VANTAGE_API_KEY
    if not key:
        logger.warning("ALPHA_VANTAGE_API_KEY not configured")
        return {}

    _rate_limit()
    _track_daily_calls()

    params = {
        "function": function,
        "symbol": symbol,
        "apikey": key,
    }
    if extra_params:
        params.update(extra_params)

    try:
        resp = httpx.get(BASE_URL, params=params, timeout=20)
        resp.raise_for_status()
        data = resp.json()

        # Check for rate limit / error messages
        if "Note" in data:
            logger.warning(f"Alpha Vantage rate limit: {data['Note']}")
            return {}
        if "Information" in data:
            info_msg = data.get("Information", "")
            if "API" in info_msg or "rate" in info_msg.lower() or "premium" in info_msg.lower():
                logger.warning(f"Alpha Vantage: {info_msg}")
                return {}

        return data
    except Exception as e:
        logger.error(f"Alpha Vantage API error for {function}/{symbol}: {e}")
        return {}


# ─── Daily Time Series (quotes + history in one call) ─────────────────

def _fetch_daily_raw(ticker: str) -> list[dict]:
    """Fetch daily OHLCV via TIME_SERIES_DAILY, cached 1 hour.

    Uses compact outputsize (~100 trading days) — free tier restriction.
    Returns list of dicts sorted oldest→newest:
    [{"date", "open", "high", "low", "close", "volume"}, ...]
    """
    cache_key = f"av_daily:{ticker}"
    cached_data = cache.get(cache_key)
    if cached_data:
        return cached_data

    data = _api_call("TIME_SERIES_DAILY", ticker, {"outputsize": "compact"})
    ts = data.get("Time Series (Daily)", {})
    if not ts:
        return []

    rows = []
    for date_str, vals in sorted(ts.items()):  # sorted = oldest first
        rows.append({
            "date": date_str,
            "open": float(vals.get("1. open", 0)),
            "high": float(vals.get("2. high", 0)),
            "low": float(vals.get("3. low", 0)),
            "close": float(vals.get("4. close", 0)),
            "volume": int(vals.get("5. volume", 0)),
        })

    # Cache for 1 hour — daily data doesn't change frequently
    cache.set(cache_key, rows, 3600)
    return rows


def fetch_history(ticker: str, days: int = 365) -> list[dict]:
    """Get historical OHLCV data. Returns last `days` trading days."""
    rows = _fetch_daily_raw(ticker)
    if not rows:
        return []
    return rows[-days:]  # last N days


def fetch_quote(ticker: str) -> dict:
    """Get current quote by extracting latest day from daily time series.

    This avoids a separate GLOBAL_QUOTE API call — reuses cached daily data.
    """
    rows = _fetch_daily_raw(ticker)
    if not rows:
        return {}

    latest = rows[-1]
    prev = rows[-2] if len(rows) >= 2 else None

    current_price = latest["close"]
    previous_close = prev["close"] if prev else None

    day_change_pct = None
    if current_price and previous_close and previous_close != 0:
        day_change_pct = round(
            ((current_price - previous_close) / previous_close) * 100, 2
        )

    return {
        "current_price": round(current_price, 2),
        "previous_close": round(previous_close, 2) if previous_close else None,
        "day_change_pct": day_change_pct,
        "open": latest["open"],
        "high": latest["high"],
        "low": latest["low"],
        "volume": latest["volume"],
    }


def fetch_quotes_batch(tickers: list[str]) -> dict:
    """Fetch quotes for multiple tickers."""
    result = {}
    for t in tickers:
        quote = fetch_quote(t)
        if quote and quote.get("current_price"):
            result[t] = quote
        else:
            result[t] = {"current_price": None, "error": f"No data for {t}"}
    return result


# ─── Company Overview (fundamentals + company info) ───────────────────

def get_company_overview(ticker: str) -> dict:
    """Fetch company overview, cached for 24 hours.

    Returns a normalized dict with all fundamental data.
    """
    cache_key = f"av_overview:{ticker}"
    cached_data = cache.get(cache_key)
    if cached_data:
        return cached_data

    data = _api_call("OVERVIEW", ticker)
    if not data or "Symbol" not in data:
        return {}

    result = {
        "name": data.get("Name", ticker),
        "sector": data.get("Sector"),
        "industry": data.get("Industry"),
        "market_cap": _safe_int(data.get("MarketCapitalization")),
        "pe_ratio": _safe_float(data.get("TrailingPE")),
        "forward_pe": _safe_float(data.get("ForwardPE")),
        "peg_ratio": _safe_float(data.get("PEGRatio")),
        "beta": _safe_float(data.get("Beta")),
        "fifty_two_week_high": _safe_float(data.get("52WeekHigh")),
        "fifty_two_week_low": _safe_float(data.get("52WeekLow")),
        "eps": _safe_float(data.get("EPS")),
        "book_value": _safe_float(data.get("BookValue")),
        "price_to_book": _safe_float(data.get("PriceToBookRatio")),
        "dividend_yield": _safe_float(data.get("DividendYield")),
        "profit_margin": _safe_float(data.get("ProfitMargin")),
        "operating_margin": _safe_float(data.get("OperatingMarginTTM")),
        "roe": _safe_float(data.get("ReturnOnEquityTTM")),
        "roa": _safe_float(data.get("ReturnOnAssetsTTM")),
        "ev_to_ebitda": _safe_float(data.get("EVToEBITDA")),
        "ev_to_revenue": _safe_float(data.get("EVToRevenue")),
        "debt_to_equity": _safe_float(data.get("DebtToEquityRatio")),
        "current_ratio": _safe_float(data.get("CurrentRatio")),
        "quick_ratio": _safe_float(data.get("QuickRatio")),
        "revenue_growth": _safe_float(data.get("QuarterlyRevenueGrowthYOY")),
        "earnings_growth": _safe_float(data.get("QuarterlyEarningsGrowthYOY")),
        "shares_outstanding": _safe_int(data.get("SharesOutstanding")),
        "revenue": _safe_int(data.get("RevenueTTM")),
        "ebitda": _safe_int(data.get("EBITDA")),
        "gross_profit": _safe_int(data.get("GrossProfitTTM")),
        "enterprise_value": _safe_int(data.get("MarketCapitalization")),  # approximate; true EV computed in fundamentals.py
    }

    settings = get_settings()
    cache.set(cache_key, result, settings.ALPHA_VANTAGE_CACHE_TTL)
    return result


def get_company_overview_as_info(ticker: str) -> dict:
    """Get overview mapped to yfinance .info field names (for backward compat)."""
    ov = get_company_overview(ticker)
    if not ov:
        return {}

    # Pull current/previous price from daily time series (reuses cached data)
    quote = fetch_quote(ticker)

    pe = ov.get("pe_ratio")
    return {
        "longName": ov.get("name", ticker),
        "shortName": ov.get("name", ticker),
        "sector": ov.get("sector"),
        "industry": ov.get("industry"),
        "marketCap": ov.get("market_cap"),
        "trailingPE": pe,
        "forwardPE": ov.get("forward_pe"),
        "beta": ov.get("beta"),
        "fiftyTwoWeekHigh": ov.get("fifty_two_week_high"),
        "fiftyTwoWeekLow": ov.get("fifty_two_week_low"),
        "returnOnEquity": ov.get("roe"),
        "profitMargins": ov.get("profit_margin"),
        "debtToEquity": (ov["debt_to_equity"] * 100) if ov.get("debt_to_equity") else None,
        "currentRatio": ov.get("current_ratio"),
        "quickRatio": ov.get("quick_ratio"),
        "revenueGrowth": ov.get("revenue_growth"),
        "earningsGrowth": ov.get("earnings_growth"),
        "earningsQuarterlyGrowth": ov.get("earnings_growth"),
        "bookValue": ov.get("book_value"),
        "sharesOutstanding": ov.get("shares_outstanding"),
        "priceToBook": ov.get("price_to_book"),
        "enterpriseValue": ov.get("enterprise_value"),
        "ebitda": ov.get("ebitda"),
        "freeCashflow": None,          # populated by fetch_financial_statements()
        "netIncomeToCommon": None,      # populated by fetch_financial_statements()
        "totalDebt": None,              # populated by fetch_financial_statements()
        "totalCash": None,              # populated by fetch_financial_statements()
        "previousClose": quote.get("previous_close") if quote else None,
        "currentPrice": quote.get("current_price") if quote else None,
    }


# ─── Financial Statements (income, balance sheet, cash flow) ─────────

def fetch_financial_statements(ticker: str) -> dict:
    """Fetch key financial statement items, cached 24 hours.

    Makes up to 3 API calls (INCOME_STATEMENT, BALANCE_SHEET, CASH_FLOW)
    but caches the combined result so subsequent calls are free.
    Only called when fundamental analysis is requested — not on every page load.
    """
    cache_key = f"av_financials:{ticker}"
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    result = {
        "net_income": None,
        "total_debt": None,
        "total_cash": None,
        "free_cashflow": None,
    }

    # Income Statement — net income (most recent annual report)
    income_data = _api_call("INCOME_STATEMENT", ticker)
    annual_income = (income_data.get("annualReports") or [])
    if annual_income:
        result["net_income"] = _safe_number(annual_income[0].get("netIncome"))

    # Balance Sheet — debt and cash
    balance_data = _api_call("BALANCE_SHEET", ticker)
    annual_balance = (balance_data.get("annualReports") or [])
    if annual_balance:
        latest = annual_balance[0]
        short_debt = _safe_number(latest.get("shortTermDebt")) or 0
        long_debt = _safe_number(latest.get("longTermDebt")) or 0
        if long_debt == 0:
            long_debt = _safe_number(latest.get("longTermDebtNoncurrent")) or 0
        result["total_debt"] = (short_debt + long_debt) if (short_debt or long_debt) else None

        cash = _safe_number(
            latest.get("cashAndCashEquivalentsAtCarryingValue")
        ) or 0
        short_inv = _safe_number(latest.get("shortTermInvestments")) or 0
        result["total_cash"] = (cash + short_inv) if (cash or short_inv) else None

    # Cash Flow — free cash flow = operating cash flow - capex
    cashflow_data = _api_call("CASH_FLOW", ticker)
    cf_reports = (cashflow_data.get("annualReports") or [])
    if cf_reports:
        operating_cf = _safe_number(cf_reports[0].get("operatingCashflow"))
        capex = _safe_number(cf_reports[0].get("capitalExpenditures"))
        if operating_cf is not None:
            # capex can be reported positive or negative; always subtract its magnitude
            result["free_cashflow"] = operating_cf - abs(capex or 0)

    settings = get_settings()
    cache.set(cache_key, result, settings.ALPHA_VANTAGE_CACHE_TTL)
    return result


# ─── Helpers ──────────────────────────────────────────────────────────

def _safe_float(val) -> float | None:
    if val is None or val == "None" or val == "-":
        return None
    try:
        f = float(val)
        return round(f, 4) if f != 0 else None
    except (ValueError, TypeError):
        return None


def _safe_int(val) -> int | None:
    if val is None or val == "None" or val == "-":
        return None
    try:
        i = int(val)
        return i if i > 0 else None
    except (ValueError, TypeError):
        return None


def _safe_number(val) -> int | None:
    """Parse an integer value, allowing zero and negative numbers.

    Unlike _safe_int, this does not reject zero/negative values —
    needed for financial statement items like net income or FCF.
    """
    if val is None or val == "None" or val == "-" or val == "":
        return None
    try:
        return int(val)
    except (ValueError, TypeError):
        return None
