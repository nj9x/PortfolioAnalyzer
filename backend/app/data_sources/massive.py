"""Massive (massive.com) — unified data source for stock quotes, history,
fundamentals, options, and ticker info.

Base URL: https://api.massive.com
Auth: apiKey query parameter

Replaces both yfinance and Alpha Vantage.
"""

import logging
from datetime import datetime, timedelta

import httpx
from app.config import get_settings
from app.services.cache_service import cache

logger = logging.getLogger(__name__)

BASE_URL = "https://api.massive.com"

# No client-side rate limiting — let the Massive API server enforce its own
# limits (429 status). Our _get() already handles HTTP errors gracefully.
# Client-side sleeping was causing thread starvation and pipeline hangs.


def _get(url: str, params: dict | None = None, timeout: int = 10) -> dict:
    """Make a GET request to the Massive API.

    Auth is via `apiKey` query parameter (required for raw HTTP).
    """
    key = get_settings().MASSIVE_API_KEY
    if not key:
        logger.warning("MASSIVE_API_KEY not configured")
        return {}

    if params is None:
        params = {}
    params["apiKey"] = key

    try:
        resp = httpx.get(url, params=params, timeout=timeout)
        resp.raise_for_status()
        return resp.json()
    except httpx.HTTPStatusError as e:
        body = ""
        try:
            body = e.response.text[:200]
        except Exception:
            pass
        logger.error(
            f"Massive API HTTP {e.response.status_code} for {url}: {body}"
        )
        return {}
    except Exception as e:
        logger.error(f"Massive API error for {url}: {e}")
        return {}


# ─── Snapshots / Quotes ──────────────────────────────────────────────


def fetch_snapshot(ticker: str) -> dict:
    """Single ticker snapshot — current price, day OHLC, prev day, change.

    GET /v2/snapshot/locale/us/markets/stocks/tickers/{ticker}
    """
    cache_key = f"massive_snap:{ticker}"
    cached = cache.get(cache_key)
    if cached:
        return cached

    url = f"{BASE_URL}/v2/snapshot/locale/us/markets/stocks/tickers/{ticker}"
    data = _get(url)
    t = data.get("ticker", {})
    if not t:
        return {}

    day = t.get("day", {})
    prev = t.get("prevDay", {})
    result = {
        "current_price": round(day.get("c", 0), 2) if day.get("c") else None,
        "open": day.get("o"),
        "high": day.get("h"),
        "low": day.get("l"),
        "volume": day.get("v"),
        "vwap": day.get("vw"),
        "previous_close": prev.get("c"),
        "day_change_pct": round(t.get("todaysChangePerc", 0), 2) if t.get("todaysChangePerc") is not None else None,
        "day_change": round(t.get("todaysChange", 0), 2) if t.get("todaysChange") is not None else None,
        "fmv": t.get("fmv"),
    }

    # Use fmv as current_price if day close isn't populated yet (pre-market)
    if not result["current_price"] and result["fmv"]:
        result["current_price"] = round(result["fmv"], 2)

    cache.set(cache_key, result, 60)  # 1 min cache for snapshots

    return result


def fetch_quotes(tickers: list[str]) -> dict:
    """Fetch current quotes for a list of tickers.

    Enriches each quote with company name from the ticker overview.
    """
    data = {}
    for t in tickers:
        snap = fetch_snapshot(t)
        if snap and snap.get("current_price"):
            # Add company name from overview (cached 24h, very cheap)
            overview = fetch_ticker_overview(t)
            snap["name"] = overview.get("name", t)
            data[t] = snap
        else:
            data[t] = {"current_price": None, "error": f"No data for {t}"}
    return data


# ─── Aggregates / Historical Bars ─────────────────────────────────────


def fetch_history(ticker: str, period: str = "1mo") -> list[dict]:
    """Fetch historical OHLCV bars.

    GET /v2/aggs/ticker/{ticker}/range/{multiplier}/{timespan}/{from}/{to}

    Returns list of dicts sorted oldest→newest:
    [{"date", "open", "high", "low", "close", "volume"}, ...]
    """
    period_days = {
        "1mo": 30, "3mo": 90, "6mo": 180, "1y": 365, "2y": 730, "5y": 1825,
    }.get(period, 30)

    cache_key = f"massive_history:{ticker}:{period}"
    cached = cache.get(cache_key)
    if cached:
        return cached

    to_date = datetime.now().strftime("%Y-%m-%d")
    from_date = (datetime.now() - timedelta(days=period_days)).strftime("%Y-%m-%d")

    url = f"{BASE_URL}/v2/aggs/ticker/{ticker}/range/1/day/{from_date}/{to_date}"
    data = _get(url, params={"adjusted": "true", "sort": "asc", "limit": "5000"})
    results = data.get("results", [])
    if not results:
        return []

    rows = []
    for bar in results:
        # timestamp is in milliseconds
        ts = bar.get("t", 0)
        date_str = datetime.fromtimestamp(ts / 1000).strftime("%Y-%m-%d") if ts else ""
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


def fetch_history_days(ticker: str, days: int = 365) -> list[dict]:
    """Fetch history by number of days (for backward compat with alpha_vantage)."""
    period_map = {30: "1mo", 90: "3mo", 180: "6mo", 365: "1y", 730: "2y"}
    # Find closest period
    period = "1y"
    for d, p in sorted(period_map.items()):
        if days <= d:
            period = p
            break
    rows = fetch_history(ticker, period=period)
    return rows[-days:] if rows else []


# ─── Ticker Overview (company info) ──────────────────────────────────


def fetch_ticker_overview(ticker: str) -> dict:
    """Company info: name, market cap, SIC, description, etc.

    GET /v3/reference/tickers/{ticker}
    """
    cache_key = f"massive_overview:{ticker}"
    cached = cache.get(cache_key)
    if cached:
        return cached

    url = f"{BASE_URL}/v3/reference/tickers/{ticker}"
    data = _get(url)
    r = data.get("results", {})
    if not r:
        return {}

    result = {
        "name": r.get("name", ticker),
        "ticker": r.get("ticker", ticker),
        "description": r.get("description"),
        "sic_code": r.get("sic_code"),
        "sic_description": r.get("sic_description"),
        "market_cap": r.get("market_cap"),
        "shares_outstanding": r.get("weighted_shares_outstanding") or r.get("share_class_shares_outstanding"),
        "homepage_url": r.get("homepage_url"),
        "total_employees": r.get("total_employees"),
        "primary_exchange": r.get("primary_exchange"),
        "type": r.get("type"),
        "active": r.get("active"),
        "list_date": r.get("list_date"),
    }

    cache.set(cache_key, result, 86400)  # 24h cache
    return result


# ─── Financials (unified endpoint) ────────────────────────────────────


def _fetch_financials_raw(ticker: str, timeframe: str = "annual") -> list[dict]:
    """Fetch financials via the unified endpoint.

    GET /vX/reference/financials?ticker={ticker}&timeframe={timeframe}

    Returns all financial data (income, balance sheet, cash flow) in one call.
    """
    cache_key = f"massive_fin_raw:{ticker}:{timeframe}"
    cached = cache.get(cache_key)
    if cached:
        return cached

    url = f"{BASE_URL}/vX/reference/financials"
    data = _get(url, params={
        "ticker": ticker,
        "timeframe": timeframe,
        "limit": "4",
        "include_sources": "true",
        "order": "desc",
        "sort": "period_of_report_date",
    })
    results = data.get("results", [])
    cache.set(cache_key, results, 86400)
    return results


def fetch_financial_statements(ticker: str) -> dict:
    """Fetch key financial items (net income, debt, cash, FCF).

    Uses the unified /vX/reference/financials endpoint.
    """
    cache_key = f"massive_financials:{ticker}"
    cached = cache.get(cache_key)
    if cached:
        return cached

    result = {
        "net_income": None,
        "total_debt": None,
        "total_cash": None,
        "free_cashflow": None,
    }

    filings = _fetch_financials_raw(ticker)
    if not filings:
        return result

    latest = filings[0]
    financials = latest.get("financials", {})

    # Income statement
    income = financials.get("income_statement", {})
    net_income_val = income.get("net_income_loss", {})
    result["net_income"] = net_income_val.get("value") if isinstance(net_income_val, dict) else net_income_val

    # Balance sheet
    balance = financials.get("balance_sheet", {})
    current_liabilities = balance.get("current_liabilities", {})
    noncurrent_liabilities = balance.get("noncurrent_liabilities", {})
    cl_val = current_liabilities.get("value", 0) if isinstance(current_liabilities, dict) else (current_liabilities or 0)
    ncl_val = noncurrent_liabilities.get("value", 0) if isinstance(noncurrent_liabilities, dict) else (noncurrent_liabilities or 0)
    result["total_debt"] = (cl_val + ncl_val) if (cl_val or ncl_val) else None

    # Cash
    assets = balance.get("current_assets", {})
    cash_field = assets if not isinstance(assets, dict) else None
    # Try specific cash fields
    for field_name in ("cash_and_equivalents", "cash", "cash_and_short_term_investments"):
        val = balance.get(field_name, {})
        if isinstance(val, dict) and val.get("value") is not None:
            result["total_cash"] = val["value"]
            break
        elif val and not isinstance(val, dict):
            result["total_cash"] = val
            break

    # Cash flow statement
    cashflow = financials.get("cash_flow_statement", {})
    operating_cf_val = cashflow.get("net_cash_flow_from_operating_activities", {})
    operating_cf = operating_cf_val.get("value") if isinstance(operating_cf_val, dict) else operating_cf_val
    capex_val = cashflow.get("net_cash_flow_from_investing_activities", {})
    capex = capex_val.get("value") if isinstance(capex_val, dict) else capex_val
    if operating_cf is not None:
        # Approximate FCF = operating CF + investing CF (investing is typically negative)
        result["free_cashflow"] = operating_cf + (capex or 0)

    cache.set(cache_key, result, 86400)
    return result


def fetch_ratios(ticker: str) -> dict:
    """Derive key ratios from financials and snapshot data.

    Uses the unified financials endpoint + snapshot for price-based ratios.
    """
    cache_key = f"massive_ratios:{ticker}"
    cached = cache.get(cache_key)
    if cached:
        return cached

    filings = _fetch_financials_raw(ticker)
    snap = fetch_snapshot(ticker)

    result = {
        "price_to_earnings": None,
        "price_to_book": None,
        "ev_to_ebitda": None,
        "return_on_equity": None,
        "return_on_assets": None,
        "earnings_per_share": None,
        "debt_to_equity": None,
        "enterprise_value": None,
        "current_ratio": None,
        "quick_ratio": None,
        "dividend_yield": None,
        "free_cash_flow": None,
        "market_cap": None,
        "price": snap.get("current_price") if snap else None,
    }

    if not filings:
        cache.set(cache_key, result, 3600)
        return result

    latest = filings[0]
    financials = latest.get("financials", {})
    income = financials.get("income_statement", {})
    balance = financials.get("balance_sheet", {})
    cashflow = financials.get("cash_flow_statement", {})

    def _val(d, key):
        """Extract numeric value from Massive financials field."""
        v = d.get(key, {})
        if isinstance(v, dict):
            return v.get("value")
        return v

    eps = _val(income, "basic_earnings_per_share") or _val(income, "diluted_earnings_per_share")
    result["earnings_per_share"] = eps

    price = snap.get("current_price") if snap else None
    if price and eps and eps != 0:
        result["price_to_earnings"] = round(price / eps, 2)

    equity = _val(balance, "equity") or _val(balance, "stockholders_equity")
    net_income = _val(income, "net_income_loss")
    total_assets = _val(balance, "assets")
    total_liabilities = _val(balance, "liabilities")
    current_assets = _val(balance, "current_assets")
    current_liabilities = _val(balance, "current_liabilities")

    shares = _val(income, "basic_average_shares") or _val(income, "diluted_average_shares")
    if price and equity and shares and shares > 0:
        book_per_share = equity / shares
        if book_per_share and book_per_share != 0:
            result["price_to_book"] = round(price / book_per_share, 2)

    if net_income and equity and equity != 0:
        result["return_on_equity"] = round(net_income / equity, 4)
    if net_income and total_assets and total_assets != 0:
        result["return_on_assets"] = round(net_income / total_assets, 4)
    if equity and total_liabilities:
        result["debt_to_equity"] = round(total_liabilities / equity, 4) if equity != 0 else None
    if current_assets and current_liabilities and current_liabilities != 0:
        result["current_ratio"] = round(current_assets / current_liabilities, 2)

    # FCF
    operating_cf = _val(cashflow, "net_cash_flow_from_operating_activities")
    investing_cf = _val(cashflow, "net_cash_flow_from_investing_activities")
    if operating_cf is not None:
        result["free_cash_flow"] = operating_cf + (investing_cf or 0)

    # Enterprise value (approximate)
    overview = fetch_ticker_overview(ticker)
    market_cap = overview.get("market_cap")
    result["market_cap"] = market_cap
    if market_cap:
        total_debt = (total_liabilities or 0) - (current_liabilities or 0)
        cash_val = _val(balance, "cash_and_equivalents") or 0
        result["enterprise_value"] = market_cap + total_debt - cash_val

    cache.set(cache_key, result, 3600)
    return result


# ─── Unified "info" dict (replaces yfinance .info) ───────────────────


def fetch_info(ticker: str) -> dict:
    """Build a unified info dict matching the field names that fundamentals.py,
    risk_service.py, and dcf_service.py expect (yfinance-style keys).

    Combines: ticker overview + ratios + snapshot + financial statements.
    """
    cache_key = f"massive_info:{ticker}"
    cached = cache.get(cache_key)
    if cached:
        return cached

    overview = fetch_ticker_overview(ticker)
    ratios = fetch_ratios(ticker)
    snap = fetch_snapshot(ticker)
    financials = fetch_financial_statements(ticker)

    info = {
        # Company info
        "longName": overview.get("name", ticker),
        "shortName": overview.get("name", ticker),
        "sector": overview.get("sic_description"),
        "industry": overview.get("sic_description"),
        # Market data
        "marketCap": ratios.get("market_cap") or overview.get("market_cap"),
        "currentPrice": snap.get("current_price"),
        "previousClose": snap.get("previous_close"),
        "regularMarketPrice": snap.get("current_price"),
        # Valuation ratios
        "trailingPE": ratios.get("price_to_earnings"),
        "forwardPE": None,  # Massive doesn't provide forward PE directly
        "priceToBook": ratios.get("price_to_book"),
        "enterpriseValue": ratios.get("enterprise_value"),
        "ebitda": None,  # populated from income statement below
        # Profitability
        "returnOnEquity": ratios.get("return_on_equity"),
        "returnOnAssets": ratios.get("return_on_assets"),
        "profitMargins": None,  # computed below
        "earningsPerShare": ratios.get("earnings_per_share"),
        # Leverage / liquidity
        "debtToEquity": (ratios["debt_to_equity"] * 100) if ratios.get("debt_to_equity") else None,
        "currentRatio": ratios.get("current_ratio"),
        "quickRatio": ratios.get("quick_ratio"),
        # Shares
        "sharesOutstanding": overview.get("shares_outstanding"),
        "bookValue": None,
        # Growth (will be None — Massive doesn't have these directly in ratios)
        "revenueGrowth": None,
        "earningsGrowth": None,
        "earningsQuarterlyGrowth": None,
        # Volatility
        "beta": None,  # Not in overview; computed from history if needed
        "fiftyTwoWeekHigh": None,
        "fiftyTwoWeekLow": None,
        # Dividends
        "dividendYield": ratios.get("dividend_yield"),
        # Financials
        "freeCashflow": ratios.get("free_cash_flow") or financials.get("free_cashflow"),
        "netIncomeToCommon": financials.get("net_income"),
        "totalDebt": financials.get("total_debt"),
        "totalCash": financials.get("total_cash"),
    }

    # Enrich from unified financials for ebitda, profit margin, growth
    filings = _fetch_financials_raw(ticker)
    if filings:
        latest_fin = filings[0].get("financials", {})
        inc = latest_fin.get("income_statement", {})

        def _val(d, key):
            v = d.get(key, {})
            return v.get("value") if isinstance(v, dict) else v

        ebitda = _val(inc, "ebitda")
        if ebitda:
            info["ebitda"] = ebitda

        revenue = _val(inc, "revenues")
        net_income = _val(inc, "net_income_loss")
        if revenue and net_income and revenue > 0:
            info["profitMargins"] = round(net_income / revenue, 4)

        # Revenue/earnings growth from two periods
        if len(filings) >= 2:
            prev_fin = filings[1].get("financials", {}).get("income_statement", {})
            prev_revenue = _val(prev_fin, "revenues")
            if revenue and prev_revenue and prev_revenue > 0:
                info["revenueGrowth"] = round((revenue - prev_revenue) / prev_revenue, 4)
            prev_net = _val(prev_fin, "net_income_loss")
            if net_income and prev_net and prev_net > 0:
                info["earningsGrowth"] = round((net_income - prev_net) / prev_net, 4)

    # 52-week high/low from 1y history
    history = fetch_history(ticker, period="1y")
    if history:
        highs = [h["high"] for h in history if h.get("high")]
        lows = [h["low"] for h in history if h.get("low")]
        if highs:
            info["fiftyTwoWeekHigh"] = round(max(highs), 2)
        if lows:
            info["fiftyTwoWeekLow"] = round(min(lows), 2)

        # Compute beta vs SPY
        info["beta"] = _compute_beta(history, ticker)

    cache.set(cache_key, info, 300)  # 5 min cache
    return info


def _compute_beta(ticker_history: list[dict], ticker: str, benchmark: str = "SPY") -> float | None:
    """Compute beta from daily returns vs SPY."""
    try:
        import numpy as np
        spy_history = fetch_history(benchmark, period="1y")
        if len(ticker_history) < 30 or len(spy_history) < 30:
            return None

        # Align dates
        spy_map = {h["date"]: h["close"] for h in spy_history}
        aligned_ticker = []
        aligned_spy = []
        for h in ticker_history:
            if h["date"] in spy_map:
                aligned_ticker.append(h["close"])
                aligned_spy.append(spy_map[h["date"]])

        if len(aligned_ticker) < 30:
            return None

        t_arr = np.array(aligned_ticker)
        s_arr = np.array(aligned_spy)
        t_ret = np.diff(t_arr) / t_arr[:-1]
        s_ret = np.diff(s_arr) / s_arr[:-1]

        cov = np.cov(t_ret, s_ret)[0][1]
        var = np.var(s_ret)
        if var == 0:
            return None
        return round(cov / var, 2)
    except Exception:
        return None


# ─── Options Chain ────────────────────────────────────────────────────


def fetch_options_chain(ticker: str) -> dict:
    """Fetch options chain snapshot.

    GET /v3/snapshot/options/{ticker}
    """
    cache_key = f"massive_options:{ticker}"
    cached = cache.get(cache_key)
    if cached:
        return cached

    url = f"{BASE_URL}/v3/snapshot/options/{ticker}"
    data = _get(url, params={"limit": "250"})
    results = data.get("results", [])
    if not results:
        return {"has_options": False, "contracts": []}

    contracts = []
    for c in results:
        details = c.get("details", {})
        greeks = c.get("greeks", {})
        day = c.get("day", {})
        last_quote = c.get("last_quote", {})

        contracts.append({
            "contract_type": details.get("contract_type"),
            "strike_price": details.get("strike_price"),
            "expiration_date": details.get("expiration_date"),
            "shares_per_contract": details.get("shares_per_contract", 100),
            # Greeks
            "delta": greeks.get("delta"),
            "gamma": greeks.get("gamma"),
            "theta": greeks.get("theta"),
            "vega": greeks.get("vega"),
            # Pricing
            "last_price": day.get("close") or day.get("last_updated"),
            "open": day.get("open"),
            "high": day.get("high"),
            "low": day.get("low"),
            "volume": day.get("volume"),
            "open_interest": c.get("open_interest"),
            "implied_volatility": c.get("implied_volatility"),
            # Quote
            "bid": last_quote.get("bid"),
            "ask": last_quote.get("ask"),
            "bid_size": last_quote.get("bid_size"),
            "ask_size": last_quote.get("ask_size"),
        })

    result = {"has_options": True, "contracts": contracts}
    cache.set(cache_key, result, 300)
    return result
