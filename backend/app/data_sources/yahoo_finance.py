"""Stock data — primary source via yfinance, with Alpha Vantage as supplement.

yfinance provides quotes, history, company info, and options with no strict
daily rate limits. Alpha Vantage is used only for financial statement data
(INCOME_STATEMENT, BALANCE_SHEET, CASH_FLOW) which yfinance sometimes
returns inconsistently.
"""

import logging
import yfinance as yf
from app.services.cache_service import cache
from app.utils.rate_limiter import RateLimiter

logger = logging.getLogger(__name__)

# Rate limiter for yfinance (generous — no strict API limit)
_limiter = RateLimiter(max_requests=10, time_window_seconds=60)


def fetch_quotes(tickers: list[str]) -> dict:
    """Fetch current quotes for a list of tickers via yfinance."""
    data = {}
    for t in tickers:
        try:
            cached = cache.get(f"yf_info:{t}")
            if cached:
                info = cached
            else:
                ticker_obj = yf.Ticker(t)
                info = ticker_obj.info or {}
                if info.get("currentPrice") or info.get("regularMarketPrice"):
                    cache.set(f"yf_info:{t}", info, 300)  # 5 min cache

            current_price = info.get("currentPrice") or info.get("regularMarketPrice")
            previous_close = info.get("previousClose") or info.get("regularMarketPreviousClose")

            if not current_price:
                data[t] = {"current_price": None, "error": f"No data for {t}"}
                continue

            day_change_pct = None
            if current_price and previous_close and previous_close != 0:
                day_change_pct = round(
                    ((current_price - previous_close) / previous_close) * 100, 2
                )

            data[t] = {
                "current_price": round(current_price, 2),
                "previous_close": round(previous_close, 2) if previous_close else None,
                "market_cap": info.get("marketCap"),
                "pe_ratio": round(info["trailingPE"], 2) if info.get("trailingPE") else None,
                "fifty_two_week_high": info.get("fiftyTwoWeekHigh"),
                "fifty_two_week_low": info.get("fiftyTwoWeekLow"),
                "sector": info.get("sector"),
                "name": info.get("shortName") or info.get("longName") or t,
                "day_change_pct": day_change_pct,
            }

        except Exception as e:
            logger.error(f"Failed to fetch quote for {t}: {e}")
            data[t] = {"current_price": None, "error": f"Failed to fetch data for {t}"}

    return data


def fetch_history(ticker: str, period: str = "1mo") -> list[dict]:
    """Fetch historical OHLCV data via yfinance.

    Returns list of dicts sorted oldest→newest:
    [{"date", "open", "high", "low", "close", "volume"}, ...]
    """
    cache_key = f"yf_history:{ticker}:{period}"
    cached = cache.get(cache_key)
    if cached:
        return cached

    try:
        ticker_obj = yf.Ticker(ticker)
        hist = ticker_obj.history(period=period)

        if hist.empty:
            return []

        rows = []
        for date, row in hist.iterrows():
            rows.append({
                "date": date.strftime("%Y-%m-%d"),
                "open": float(row["Open"]),
                "high": float(row["High"]),
                "low": float(row["Low"]),
                "close": float(row["Close"]),
                "volume": int(row["Volume"]),
            })

        # Cache based on period length
        ttl = 3600 if period in ("1y", "2y", "5y") else 300
        cache.set(cache_key, rows, ttl)
        return rows

    except Exception as e:
        logger.error(f"Failed to fetch history for {ticker}: {e}")
        return []


def fetch_info_safe(ticker_symbol: str) -> dict:
    """Fetch company info via yfinance .info dict.

    Used by fundamentals.py and risk_service.py. Returns dict with
    yfinance field names (trailingPE, marketCap, freeCashflow, etc.).
    """
    cache_key = f"yf_info:{ticker_symbol}"
    cached = cache.get(cache_key)
    if cached:
        return cached

    try:
        ticker_obj = yf.Ticker(ticker_symbol)
        info = ticker_obj.info or {}
        if info.get("currentPrice") or info.get("regularMarketPrice"):
            cache.set(cache_key, info, 300)  # 5 min cache
        return info
    except Exception as e:
        logger.error(f"Failed to fetch info for {ticker_symbol}: {e}")
        return {}


def fetch_financials(ticker_symbol: str) -> dict:
    """Fetch financial statement data via yfinance.

    Returns dict with net_income, total_debt, total_cash, free_cashflow.
    Falls back to Alpha Vantage if yfinance data is incomplete.
    """
    info = fetch_info_safe(ticker_symbol)

    result = {
        "net_income": info.get("netIncomeToCommon"),
        "total_debt": info.get("totalDebt"),
        "total_cash": info.get("totalCash"),
        "free_cashflow": info.get("freeCashflow"),
    }

    # If yfinance has the data, return it
    if any(v is not None for v in result.values()):
        return result

    # Fallback to Alpha Vantage for financial statements
    try:
        from app.data_sources import alpha_vantage
        return alpha_vantage.fetch_financial_statements(ticker_symbol)
    except Exception as e:
        logger.warning(f"Alpha Vantage fallback failed for {ticker_symbol}: {e}")
        return result
