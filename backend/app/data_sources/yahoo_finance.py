"""Stock data via Massive.com REST API — the priority real-time data source.

Provides quotes, history, company info, and financial statement data.
All functions preserve their original signatures so callers do not need changes.
"""

import logging
from datetime import datetime, timedelta

from app.config import get_settings
from app.data_sources.massive_client import get_client
from app.services.cache_service import cache

logger = logging.getLogger(__name__)


def fetch_quotes(tickers: list[str]) -> dict:
    """Fetch current quotes for a list of tickers via Massive snapshot."""
    client = get_client()
    data = {}

    try:
        snapshots = client.get_snapshot_all("stocks", tickers=tickers)
    except Exception as e:
        logger.error(f"Massive snapshot_all failed: {e}")
        snapshots = []

    snapshot_map = {}
    for snap in snapshots:
        if snap.ticker:
            snapshot_map[snap.ticker] = snap

    for t in tickers:
        snap = snapshot_map.get(t)
        if not snap or not snap.day:
            data[t] = {"current_price": None, "error": f"No data for {t}"}
            continue

        try:
            current_price = snap.day.close
            previous_close = snap.prev_day.close if snap.prev_day else None

            day_change_pct = None
            if current_price and previous_close and previous_close != 0:
                day_change_pct = round(
                    ((current_price - previous_close) / previous_close) * 100, 2
                )

            # Get ticker details for sector/name (use cache to avoid repeated calls)
            details = _get_ticker_details_cached(t)

            data[t] = {
                "current_price": round(current_price, 2) if current_price else None,
                "previous_close": round(previous_close, 2) if previous_close else None,
                "market_cap": details.get("market_cap"),
                "pe_ratio": details.get("pe_ratio"),
                "fifty_two_week_high": details.get("fifty_two_week_high"),
                "fifty_two_week_low": details.get("fifty_two_week_low"),
                "sector": details.get("sector"),
                "name": details.get("name", t),
                "day_change_pct": day_change_pct,
            }
        except Exception as e:
            logger.error(f"Failed to process quote for {t}: {e}")
            data[t] = {"current_price": None, "error": f"Failed to fetch data for {t}"}

    return data


def fetch_history(ticker: str, period: str = "1mo") -> list[dict]:
    """Fetch historical OHLCV data via Massive aggregates.

    Returns list of dicts sorted oldest->newest:
    [{"date", "open", "high", "low", "close", "volume"}, ...]
    """
    cache_key = f"massive_history:{ticker}:{period}"
    cached = cache.get(cache_key)
    if cached:
        return cached

    period_days = {
        "1mo": 30, "3mo": 90, "6mo": 180, "1y": 365, "2y": 730, "5y": 1825,
    }.get(period, 30)

    to_date = datetime.now()
    from_date = to_date - timedelta(days=period_days)

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
                # Massive timestamps are in milliseconds
                dt = datetime.fromtimestamp(ts / 1000)
                rows.append({
                    "date": dt.strftime("%Y-%m-%d"),
                    "open": float(agg.open) if agg.open else 0,
                    "high": float(agg.high) if agg.high else 0,
                    "low": float(agg.low) if agg.low else 0,
                    "close": float(agg.close) if agg.close else 0,
                    "volume": int(agg.volume) if agg.volume else 0,
                })

        # Cache based on period length — shorter for recent data
        ttl = 1800 if period in ("1y", "2y", "5y") else 120
        cache.set(cache_key, rows, ttl)
        return rows

    except Exception as e:
        logger.error(f"Failed to fetch history for {ticker}: {e}")
        return []


def fetch_info_safe(ticker_symbol: str) -> dict:
    """Fetch company info via Massive ticker details + financial ratios.

    Returns dict with yfinance-compatible field names (trailingPE, marketCap,
    freeCashflow, etc.) so downstream code works without changes.
    """
    cache_key = f"massive_info:{ticker_symbol}"
    cached = cache.get(cache_key)
    if cached:
        return cached

    info = {}
    client = get_client()

    # Ticker details (company name, market cap, sector, etc.)
    try:
        details = client.get_ticker_details(ticker_symbol)
        if details:
            info["longName"] = details.name
            info["shortName"] = details.name
            info["sector"] = details.sic_description
            info["marketCap"] = int(details.market_cap) if details.market_cap else None
            info["sharesOutstanding"] = (
                details.weighted_shares_outstanding
                or details.share_class_shares_outstanding
            )
    except Exception as e:
        logger.warning(f"Massive ticker details failed for {ticker_symbol}: {e}")

    # Financial ratios (PE, ROE, D/E, etc.)
    try:
        ratios = list(client.list_financials_ratios(ticker=ticker_symbol, limit=1))
        if ratios:
            r = ratios[0]
            info["trailingPE"] = r.price_to_earnings
            info["forwardPE"] = None  # not in ratios endpoint
            info["beta"] = None  # will be sourced from snapshot/history
            info["priceToBook"] = r.price_to_book
            info["returnOnEquity"] = r.return_on_equity
            info["returnOnAssets"] = r.return_on_assets
            info["debtToEquity"] = (
                r.debt_to_equity * 100 if r.debt_to_equity else None
            )
            info["currentRatio"] = r.current
            info["quickRatio"] = r.quick
            info["freeCashflow"] = int(r.free_cash_flow) if r.free_cash_flow else None
            info["enterpriseValue"] = (
                int(r.enterprise_value) if r.enterprise_value else None
            )
            info["ebitda"] = None  # sourced from income statements
            info["currentPrice"] = r.price
            info["dividendYield"] = r.dividend_yield
            info["earningsPerShare"] = r.earnings_per_share
            info["profitMargins"] = None  # computed from income stmt
    except Exception as e:
        logger.warning(f"Massive financial ratios failed for {ticker_symbol}: {e}")

    # Snapshot for current price and 52-week range
    try:
        prev = client.get_previous_close_agg(ticker_symbol)
        if prev:
            info["previousClose"] = prev.close
            info["regularMarketPreviousClose"] = prev.close
            if not info.get("currentPrice"):
                info["currentPrice"] = prev.close
                info["regularMarketPrice"] = prev.close
    except Exception as e:
        logger.warning(f"Massive previous close failed for {ticker_symbol}: {e}")

    # 52-week high/low from 1-year history
    try:
        history = fetch_history(ticker_symbol, period="1y")
        if history:
            highs = [h["high"] for h in history if h["high"]]
            lows = [h["low"] for h in history if h["low"]]
            if highs:
                info["fiftyTwoWeekHigh"] = max(highs)
            if lows:
                info["fiftyTwoWeekLow"] = min(lows)
    except Exception:
        pass

    if info.get("currentPrice") or info.get("marketCap"):
        cache.set(cache_key, info, 120)  # refresh company info every 2 min

    return info


def fetch_financials(ticker_symbol: str) -> dict:
    """Fetch financial statement data via Massive.

    Returns dict with net_income, total_debt, total_cash, free_cashflow.
    """
    cache_key = f"massive_financials:{ticker_symbol}"
    cached = cache.get(cache_key)
    if cached:
        return cached

    result = {
        "net_income": None,
        "total_debt": None,
        "total_cash": None,
        "free_cashflow": None,
    }

    client = get_client()

    # Income Statement — net income
    try:
        income_stmts = list(client.list_financials_income_statements(
            tickers=ticker_symbol, timeframe="annual", limit=1,
        ))
        if income_stmts:
            stmt = income_stmts[0]
            result["net_income"] = (
                int(stmt.net_income_loss_attributable_common_shareholders)
                if stmt.net_income_loss_attributable_common_shareholders else None
            )
    except Exception as e:
        logger.warning(f"Massive income statement failed for {ticker_symbol}: {e}")

    # Balance Sheet — debt and cash
    try:
        balance_sheets = list(client.list_financials_balance_sheets(
            tickers=ticker_symbol, timeframe="annual", limit=1,
        ))
        if balance_sheets:
            bs = balance_sheets[0]
            short_debt = bs.debt_current or 0
            long_debt = bs.long_term_debt_and_capital_lease_obligations or 0
            result["total_debt"] = (
                int(short_debt + long_debt) if (short_debt or long_debt) else None
            )
            cash = bs.cash_and_equivalents or 0
            short_inv = bs.short_term_investments or 0
            result["total_cash"] = (
                int(cash + short_inv) if (cash or short_inv) else None
            )
    except Exception as e:
        logger.warning(f"Massive balance sheet failed for {ticker_symbol}: {e}")

    # Cash Flow — free cash flow
    try:
        cf_stmts = list(client.list_financials_cash_flow_statements(
            tickers=ticker_symbol, timeframe="annual", limit=1,
        ))
        if cf_stmts:
            cf = cf_stmts[0]
            operating_cf = cf.net_cash_from_operating_activities
            capex = cf.purchase_of_property_plant_and_equipment
            if operating_cf is not None:
                result["free_cashflow"] = int(
                    operating_cf - abs(capex or 0)
                )
    except Exception as e:
        logger.warning(f"Massive cash flow failed for {ticker_symbol}: {e}")

    cache.set(cache_key, result, 86400)
    return result


# ─── Internal helpers ─────────────────────────────────────────────────


def _get_ticker_details_cached(ticker: str) -> dict:
    """Fetch ticker details with caching — used to supplement quote data."""
    cache_key = f"massive_details:{ticker}"
    cached = cache.get(cache_key)
    if cached:
        return cached

    result = {"name": ticker, "sector": None, "market_cap": None,
              "pe_ratio": None, "fifty_two_week_high": None,
              "fifty_two_week_low": None}

    try:
        client = get_client()
        details = client.get_ticker_details(ticker)
        if details:
            result["name"] = details.name or ticker
            result["sector"] = details.sic_description
            result["market_cap"] = int(details.market_cap) if details.market_cap else None
    except Exception as e:
        logger.warning(f"Ticker details failed for {ticker}: {e}")

    # PE from financial ratios
    try:
        client = get_client()
        ratios = list(client.list_financials_ratios(ticker=ticker, limit=1))
        if ratios:
            result["pe_ratio"] = (
                round(ratios[0].price_to_earnings, 2)
                if ratios[0].price_to_earnings else None
            )
    except Exception:
        pass

    # 52-week range from history
    try:
        history = fetch_history(ticker, period="1y")
        if history:
            highs = [h["high"] for h in history if h["high"]]
            lows = [h["low"] for h in history if h["low"]]
            if highs:
                result["fifty_two_week_high"] = max(highs)
            if lows:
                result["fifty_two_week_low"] = min(lows)
    except Exception:
        pass

    cache.set(cache_key, result, 600)  # ticker details refresh every 10 min
    return result
