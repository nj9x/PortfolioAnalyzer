"""Company overview and financial statements via Massive.com REST API.

Previously used Alpha Vantage — now backed by Massive for all data.
Public function signatures are preserved for backward compatibility.
"""

import logging
from datetime import datetime, timedelta

from app.config import get_settings
from app.data_sources.massive_client import get_client
from app.services.cache_service import cache

logger = logging.getLogger(__name__)


# ─── Daily History ────────────────────────────────────────────────────


def fetch_history(ticker: str, days: int = 365) -> list[dict]:
    """Get historical OHLCV data. Returns last `days` trading days."""
    cache_key = f"massive_av_history:{ticker}:{days}"
    cached = cache.get(cache_key)
    if cached:
        return cached

    to_date = datetime.now()
    from_date = to_date - timedelta(days=days + 30)  # pad for trading days

    try:
        client = get_client()
        aggs = client.get_aggs(
            ticker=ticker,
            multiplier=1,
            timespan="day",
            from_=from_date.strftime("%Y-%m-%d"),
            to=to_date.strftime("%Y-%m-%d"),
            adjusted=True,
            limit=50000,
        )

        if not aggs:
            return []

        rows = []
        for agg in aggs:
            ts = agg.timestamp
            if ts:
                dt = datetime.fromtimestamp(ts / 1000)
                rows.append({
                    "date": dt.strftime("%Y-%m-%d"),
                    "open": float(agg.open) if agg.open else 0,
                    "high": float(agg.high) if agg.high else 0,
                    "low": float(agg.low) if agg.low else 0,
                    "close": float(agg.close) if agg.close else 0,
                    "volume": int(agg.volume) if agg.volume else 0,
                })

        rows = rows[-days:]
        ttl = 1800 if days >= 252 else 120  # shorter TTLs for fresher data
        cache.set(cache_key, rows, ttl)
        return rows

    except Exception as e:
        logger.error(f"Failed to fetch history for {ticker}: {e}")
        return []


# ─── Quote (from previous close) ─────────────────────────────────────


def fetch_quote(ticker: str) -> dict:
    """Get current quote using Massive previous close aggregate."""
    cache_key = f"massive_av_quote:{ticker}"
    cached = cache.get(cache_key)
    if cached:
        return cached

    try:
        client = get_client()

        # Get last 2 days of data for current + previous close
        to_date = datetime.now()
        from_date = to_date - timedelta(days=7)  # pad for weekends
        aggs = client.get_aggs(
            ticker=ticker,
            multiplier=1,
            timespan="day",
            from_=from_date.strftime("%Y-%m-%d"),
            to=to_date.strftime("%Y-%m-%d"),
            adjusted=True,
            limit=5,
        )

        if not aggs or len(aggs) == 0:
            return {}

        latest = aggs[-1]
        prev = aggs[-2] if len(aggs) >= 2 else None

        current_price = float(latest.close) if latest.close else None
        previous_close = float(prev.close) if prev and prev.close else None

        day_change_pct = None
        if current_price and previous_close and previous_close != 0:
            day_change_pct = round(
                ((current_price - previous_close) / previous_close) * 100, 2
            )

        result = {
            "current_price": round(current_price, 2) if current_price else None,
            "previous_close": round(previous_close, 2) if previous_close else None,
            "day_change_pct": day_change_pct,
            "open": float(latest.open) if latest.open else None,
            "high": float(latest.high) if latest.high else None,
            "low": float(latest.low) if latest.low else None,
            "volume": int(latest.volume) if latest.volume else None,
        }

        cache.set(cache_key, result, 60)  # quote refresh every 60s
        return result

    except Exception as e:
        logger.error(f"Failed to fetch quote for {ticker}: {e}")
        return {}


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


# ─── Company Overview ─────────────────────────────────────────────────


def get_company_overview(ticker: str) -> dict:
    """Fetch company overview via Massive ticker details + ratios, cached 24h."""
    cache_key = f"massive_overview:{ticker}"
    cached = cache.get(cache_key)
    if cached:
        return cached

    client = get_client()
    result = {}

    # Ticker details
    try:
        details = client.get_ticker_details(ticker)
        if details:
            result["name"] = details.name or ticker
            result["sector"] = details.sic_description
            result["industry"] = details.sic_description
            result["market_cap"] = int(details.market_cap) if details.market_cap else None
            result["shares_outstanding"] = (
                details.weighted_shares_outstanding
                or details.share_class_shares_outstanding
            )
    except Exception as e:
        logger.warning(f"Massive ticker details failed for {ticker}: {e}")

    # Financial ratios
    try:
        ratios = list(client.list_financials_ratios(ticker=ticker, limit=1))
        if ratios:
            r = ratios[0]
            result.update({
                "pe_ratio": _safe_float(r.price_to_earnings),
                "forward_pe": None,
                "peg_ratio": None,
                "beta": None,
                "eps": _safe_float(r.earnings_per_share),
                "book_value": None,
                "price_to_book": _safe_float(r.price_to_book),
                "dividend_yield": _safe_float(r.dividend_yield),
                "profit_margin": None,
                "operating_margin": None,
                "roe": _safe_float(r.return_on_equity),
                "roa": _safe_float(r.return_on_assets),
                "ev_to_ebitda": _safe_float(r.ev_to_ebitda),
                "ev_to_revenue": _safe_float(r.ev_to_sales),
                "debt_to_equity": _safe_float(r.debt_to_equity),
                "current_ratio": _safe_float(r.current),
                "quick_ratio": _safe_float(r.quick),
                "enterprise_value": int(r.enterprise_value) if r.enterprise_value else None,
            })
    except Exception as e:
        logger.warning(f"Massive financial ratios failed for {ticker}: {e}")

    # Income statement for revenue, EBITDA, growth metrics
    try:
        stmts = list(client.list_financials_income_statements(
            tickers=ticker, timeframe="annual", limit=2,
        ))
        if stmts:
            latest = stmts[0]
            result["revenue"] = int(latest.revenue) if latest.revenue else None
            result["ebitda"] = int(latest.ebitda) if latest.ebitda else None
            result["gross_profit"] = int(latest.gross_profit) if latest.gross_profit else None

            # Growth: compare latest vs prior year
            if len(stmts) >= 2 and stmts[1].revenue and latest.revenue:
                prior = stmts[1]
                if prior.revenue and prior.revenue != 0:
                    result["revenue_growth"] = round(
                        (latest.revenue - prior.revenue) / abs(prior.revenue), 4
                    )
                if (prior.net_income_loss_attributable_common_shareholders
                        and latest.net_income_loss_attributable_common_shareholders
                        and prior.net_income_loss_attributable_common_shareholders != 0):
                    result["earnings_growth"] = round(
                        (latest.net_income_loss_attributable_common_shareholders
                         - prior.net_income_loss_attributable_common_shareholders)
                        / abs(prior.net_income_loss_attributable_common_shareholders),
                        4,
                    )
    except Exception as e:
        logger.warning(f"Massive income stmt failed for {ticker}: {e}")

    # 52-week range
    try:
        from app.data_sources.yahoo_finance import fetch_history as yf_history
        history = yf_history(ticker, period="1y")
        if history:
            highs = [h["high"] for h in history if h["high"]]
            lows = [h["low"] for h in history if h["low"]]
            if highs:
                result["fifty_two_week_high"] = max(highs)
            if lows:
                result["fifty_two_week_low"] = min(lows)
    except Exception:
        pass

    settings = get_settings()
    cache.set(cache_key, result, settings.ALPHA_VANTAGE_CACHE_TTL)
    return result


def get_company_overview_as_info(ticker: str) -> dict:
    """Get overview mapped to yfinance .info field names (for backward compat)."""
    ov = get_company_overview(ticker)
    if not ov:
        return {}

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
        "freeCashflow": None,
        "netIncomeToCommon": None,
        "totalDebt": None,
        "totalCash": None,
        "previousClose": quote.get("previous_close") if quote else None,
        "currentPrice": quote.get("current_price") if quote else None,
    }


# ─── Financial Statements ────────────────────────────────────────────


def fetch_financial_statements(ticker: str) -> dict:
    """Fetch key financial statement items via Massive, cached 24 hours."""
    # Delegate to yahoo_finance.fetch_financials which already uses Massive
    from app.data_sources.yahoo_finance import fetch_financials
    return fetch_financials(ticker)


# ─── Helpers ──────────────────────────────────────────────────────────


def _safe_float(val) -> float | None:
    if val is None:
        return None
    try:
        f = float(val)
        return round(f, 4) if f != 0 else None
    except (ValueError, TypeError):
        return None
