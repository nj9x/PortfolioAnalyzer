"""Stock data via Massive (formerly Polygon.io) REST API.

Massive provides quotes, history, company info, financials, and options data.
Authentication is via Bearer token in the Authorization header.
Base URL: https://api.massive.com

Endpoints used:
  - Ticker Snapshot:  GET /v2/snapshot/locale/us/markets/stocks/tickers/{ticker}
  - Custom Bars:      GET /v2/aggs/ticker/{ticker}/range/{mult}/{timespan}/{from}/{to}
  - Ticker Details:   GET /v3/reference/tickers/{ticker}
  - Stock Financials: GET /vX/reference/tickers/{ticker}/financials

When the API is unreachable (e.g. proxy/firewall), falls back to mock data
so the app remains functional for development and demo purposes.
"""

import logging
import random
from datetime import datetime, timedelta

import httpx

from app.config import get_settings
from app.services.cache_service import cache
from app.utils.rate_limiter import RateLimiter

logger = logging.getLogger(__name__)

BASE_URL = "https://api.massive.com"

# Rate limiter — Massive free tier allows 5 requests/minute
_limiter = RateLimiter(max_requests=5, time_window_seconds=60)

# Tracks whether the API is reachable; avoids repeated failed calls
_api_reachable: bool | None = None


def _headers() -> dict:
    settings = get_settings()
    return {"Authorization": f"Bearer {settings.MASSIVE_API_KEY}"}


def _get(path: str, params: dict | None = None) -> dict:
    """Make a GET request to the Massive REST API with rate limiting."""
    global _api_reachable

    settings = get_settings()
    if not settings.MASSIVE_API_KEY:
        logger.warning("MASSIVE_API_KEY not configured")
        return {}

    # Skip network calls if we already know the API is blocked
    if _api_reachable is False:
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

        _api_reachable = True
        return data
    except (httpx.ProxyError, httpx.ConnectError, httpx.ConnectTimeout) as e:
        if _api_reachable is None:
            logger.warning(
                f"Massive API unreachable (proxy/network blocked): {e}. "
                "Falling back to mock data for this session."
            )
        _api_reachable = False
        return {}
    except httpx.HTTPStatusError as e:
        logger.error(f"Massive API HTTP {e.response.status_code} for {path}: {e}")
        return {}
    except Exception as e:
        logger.error(f"Massive API error for {path}: {e}")
        return {}


# ─── Mock data (used when API is unreachable) ─────────────────────────

_MOCK_TICKERS = {
    "AAPL": {"name": "Apple Inc.", "sector": "Technology", "price": 227.63, "market_cap": 3440000000000, "pe": 37.2, "beta": 1.24, "eps": 6.12, "shares": 15115000000, "high52": 260.10, "low52": 164.08},
    "MSFT": {"name": "Microsoft Corp.", "sector": "Technology", "price": 415.20, "market_cap": 3090000000000, "pe": 35.8, "beta": 0.90, "eps": 11.60, "shares": 7430000000, "high52": 468.35, "low52": 362.90},
    "GOOGL": {"name": "Alphabet Inc.", "sector": "Technology", "price": 181.42, "market_cap": 2230000000000, "pe": 24.1, "beta": 1.06, "eps": 7.53, "shares": 12290000000, "high52": 208.70, "low52": 150.22},
    "AMZN": {"name": "Amazon.com Inc.", "sector": "Consumer Cyclical", "price": 214.20, "market_cap": 2270000000000, "pe": 42.5, "beta": 1.16, "eps": 5.04, "shares": 10600000000, "high52": 242.52, "low52": 171.00},
    "NVDA": {"name": "NVIDIA Corp.", "sector": "Technology", "price": 131.50, "market_cap": 3210000000000, "pe": 55.3, "beta": 1.70, "eps": 2.38, "shares": 24410000000, "high52": 153.13, "low52": 75.61},
    "META": {"name": "Meta Platforms Inc.", "sector": "Technology", "price": 612.77, "market_cap": 1550000000000, "pe": 26.9, "beta": 1.25, "eps": 22.78, "shares": 2530000000, "high52": 740.91, "low52": 442.55},
    "TSLA": {"name": "Tesla Inc.", "sector": "Consumer Cyclical", "price": 337.80, "market_cap": 1090000000000, "pe": 168.9, "beta": 2.31, "eps": 2.00, "shares": 3220000000, "high52": 488.54, "low52": 138.80},
    "BRK-B": {"name": "Berkshire Hathaway", "sector": "Financial Services", "price": 528.85, "market_cap": 1150000000000, "pe": 15.2, "beta": 0.55, "eps": 34.79, "shares": 2170000000, "high52": 542.10, "low52": 390.42},
    "JPM": {"name": "JPMorgan Chase & Co.", "sector": "Financial Services", "price": 265.50, "market_cap": 762000000000, "pe": 13.5, "beta": 1.08, "eps": 19.67, "shares": 2870000000, "high52": 280.25, "low52": 185.89},
    "V": {"name": "Visa Inc.", "sector": "Financial Services", "price": 340.15, "market_cap": 664000000000, "pe": 33.1, "beta": 0.96, "eps": 10.28, "shares": 1950000000, "high52": 356.89, "low52": 271.67},
}

# Default mock for unknown tickers
_MOCK_DEFAULT = {"name": None, "sector": "Unknown", "price": 100.00, "market_cap": 50000000000, "pe": 20.0, "beta": 1.0, "eps": 5.0, "shares": 500000000, "high52": 120.0, "low52": 80.0}


def _is_mock_mode() -> bool:
    """True when the Massive API has been detected as unreachable."""
    return _api_reachable is False


def _mock_quote(ticker: str) -> dict:
    m = _MOCK_TICKERS.get(ticker, {**_MOCK_DEFAULT, "name": ticker})
    drift = random.uniform(-0.015, 0.015)
    price = round(m["price"] * (1 + drift), 2)
    prev = round(m["price"] * (1 + random.uniform(-0.01, 0.01)), 2)
    change = round(((price - prev) / prev) * 100, 2) if prev else 0
    return {
        "current_price": price,
        "previous_close": prev,
        "market_cap": m["market_cap"],
        "pe_ratio": m["pe"],
        "fifty_two_week_high": m["high52"],
        "fifty_two_week_low": m["low52"],
        "sector": m["sector"],
        "name": m["name"] or ticker,
        "day_change_pct": change,
    }


def _mock_history(ticker: str, period: str) -> list[dict]:
    m = _MOCK_TICKERS.get(ticker, _MOCK_DEFAULT)
    days = _PERIOD_DAYS.get(period, 30)
    rows = []
    price = m["price"] * 0.85  # start lower and trend up
    for i in range(days):
        date = (datetime.now() - timedelta(days=days - i)).strftime("%Y-%m-%d")
        daily_return = random.gauss(0.0004, 0.015)
        price = max(price * (1 + daily_return), 1.0)
        high = round(price * (1 + random.uniform(0, 0.02)), 2)
        low = round(price * (1 - random.uniform(0, 0.02)), 2)
        rows.append({
            "date": date,
            "open": round(price * (1 + random.uniform(-0.005, 0.005)), 2),
            "high": high,
            "low": low,
            "close": round(price, 2),
            "volume": random.randint(20_000_000, 120_000_000),
        })
    return rows


def _mock_info(ticker: str) -> dict:
    m = _MOCK_TICKERS.get(ticker, {**_MOCK_DEFAULT, "name": ticker})
    price = m["price"]
    return {
        "shortName": m["name"] or ticker,
        "longName": m["name"] or ticker,
        "sector": m["sector"],
        "marketCap": m["market_cap"],
        "sharesOutstanding": m["shares"],
        "currentPrice": price,
        "regularMarketPrice": price,
        "previousClose": round(price * 0.998, 2),
        "regularMarketPreviousClose": round(price * 0.998, 2),
        "fiftyTwoWeekHigh": m["high52"],
        "fiftyTwoWeekLow": m["low52"],
        "trailingPE": m["pe"],
        "forwardPE": round(m["pe"] * 0.9, 2),
        "beta": m["beta"],
        "priceToBook": round(random.uniform(3, 15), 2),
        "bookValue": round(price / random.uniform(3, 15), 2),
        "enterpriseValue": int(m["market_cap"] * 1.05),
        "ebitda": int(m["market_cap"] / m["pe"] * 1.3),
        "returnOnEquity": round(random.uniform(0.10, 0.40), 4),
        "profitMargins": round(random.uniform(0.08, 0.35), 4),
        "debtToEquity": round(random.uniform(30, 150), 2),
        "currentRatio": round(random.uniform(0.8, 2.5), 2),
        "quickRatio": round(random.uniform(0.6, 2.0), 2),
        "revenueGrowth": round(random.uniform(-0.05, 0.25), 4),
        "earningsGrowth": round(random.uniform(-0.10, 0.30), 4),
        "earningsQuarterlyGrowth": round(random.uniform(-0.10, 0.30), 4),
        "netIncomeToCommon": int(m["market_cap"] / m["pe"]),
        "totalDebt": int(m["market_cap"] * random.uniform(0.05, 0.30)),
        "totalCash": int(m["market_cap"] * random.uniform(0.02, 0.15)),
        "freeCashflow": int(m["market_cap"] / m["pe"] * random.uniform(0.7, 1.2)),
    }


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
    """Fetch current quotes for a list of tickers via Massive Snapshot API.

    Falls back to mock data when the API is unreachable.
    """
    data = {}
    for t in tickers:
        try:
            snap = _get_ticker_snapshot(t)

            # Fall back to mock if API returned nothing
            if not snap and _is_mock_mode():
                data[t] = _mock_quote(t)
                continue
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
                "market_cap": None,
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
            # Fall back to mock history when API is unreachable
            if _is_mock_mode():
                rows = _mock_history(ticker, period)
                cache.set(cache_key, rows, 300)
                return rows
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

    # Fall back to mock data when API is unreachable
    if not snapshot and not details and _is_mock_mode():
        info = _mock_info(ticker_symbol)
        cache.set(cache_key, info, 300)
        return info

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
