"""Massive.com (formerly Polygon.io) — primary data source for stock quotes,
history, ticker details, and options chain data.

Paid plan provides generous rate limits and full history. Used as the primary
data source with yfinance/Alpha Vantage as fallbacks.
"""

import logging
from datetime import datetime, timedelta

from massive import RESTClient
from massive.rest.models import Agg, TickerSnapshot

from app.config import get_settings
from app.services.cache_service import cache

logger = logging.getLogger(__name__)

_client: RESTClient | None = None


def _get_client() -> RESTClient | None:
    """Lazy-init the Massive REST client."""
    global _client
    if _client is not None:
        return _client

    settings = get_settings()
    key = settings.MASSIVE_API_KEY
    if not key:
        logger.warning("MASSIVE_API_KEY not configured — Massive data source disabled")
        return None

    _client = RESTClient(api_key=key)
    return _client


# ─── Stock Quotes ────────────────────────────────────────────────────


def fetch_quotes(tickers: list[str]) -> dict:
    """Fetch current quotes for a list of tickers via snapshot endpoint.

    Returns dict keyed by ticker with standard quote fields.
    """
    client = _get_client()
    if not client:
        return {}

    result = {}
    for t in tickers:
        cached = cache.get(f"massive_quote:{t}")
        if cached:
            result[t] = cached
            continue

        try:
            snapshot = client.get_snapshot_ticker("stocks", t)
            if not snapshot:
                result[t] = {"current_price": None, "error": f"No snapshot for {t}"}
                continue

            day = snapshot.day
            prev = snapshot.prev_day

            current_price = day.close if day and day.close else None
            previous_close = prev.close if prev and prev.close else None

            day_change_pct = None
            if current_price and previous_close and previous_close != 0:
                day_change_pct = round(
                    ((current_price - previous_close) / previous_close) * 100, 2
                )

            quote = {
                "current_price": round(current_price, 2) if current_price else None,
                "previous_close": round(previous_close, 2) if previous_close else None,
                "day_change_pct": day_change_pct,
                "open": round(day.open, 2) if day and day.open else None,
                "high": round(day.high, 2) if day and day.high else None,
                "low": round(day.low, 2) if day and day.low else None,
                "volume": int(day.volume) if day and day.volume else None,
                "name": t,
            }

            settings = get_settings()
            cache.set(f"massive_quote:{t}", quote, settings.STOCK_CACHE_TTL)
            result[t] = quote

        except Exception as e:
            logger.error(f"Massive snapshot failed for {t}: {e}")
            result[t] = {"current_price": None, "error": str(e)}

    return result


# ─── Ticker Details (for fundamentals / company info) ────────────────


def fetch_ticker_details(ticker: str) -> dict:
    """Fetch ticker details (company info, market cap, etc.).

    Returns dict with yfinance-compatible field names for downstream compat.
    """
    cache_key = f"massive_details:{ticker}"
    cached = cache.get(cache_key)
    if cached:
        return cached

    client = _get_client()
    if not client:
        return {}

    try:
        details = client.get_ticker_details(ticker)
        if not details:
            return {}

        result = {
            "shortName": details.name or ticker,
            "longName": details.name or ticker,
            "sector": getattr(details, "sic_description", None),
            "industry": getattr(details, "sic_description", None),
            "marketCap": getattr(details, "market_cap", None),
            "sharesOutstanding": getattr(details, "share_class_shares_outstanding", None)
            or getattr(details, "weighted_shares_outstanding", None),
        }

        cache.set(cache_key, result, 3600)  # 1 hour cache
        return result

    except Exception as e:
        logger.error(f"Massive ticker details failed for {ticker}: {e}")
        return {}


# ─── Historical OHLCV ────────────────────────────────────────────────


def fetch_history(ticker: str, period: str = "1y") -> list[dict]:
    """Fetch historical daily OHLCV bars via list_aggs.

    Args:
        ticker: Stock ticker symbol.
        period: One of "1mo", "3mo", "6mo", "1y", "2y", "5y".

    Returns list of dicts sorted oldest->newest:
    [{"date", "open", "high", "low", "close", "volume"}, ...]
    """
    cache_key = f"massive_history:{ticker}:{period}"
    cached = cache.get(cache_key)
    if cached:
        return cached

    client = _get_client()
    if not client:
        return []

    period_days = {
        "1mo": 30, "3mo": 90, "6mo": 180,
        "1y": 365, "2y": 730, "5y": 1825,
    }.get(period, 365)

    to_date = datetime.now().strftime("%Y-%m-%d")
    from_date = (datetime.now() - timedelta(days=period_days)).strftime("%Y-%m-%d")

    try:
        rows = []
        for agg in client.list_aggs(
            ticker=ticker,
            multiplier=1,
            timespan="day",
            from_=from_date,
            to=to_date,
            limit=50000,
        ):
            ts = datetime.fromtimestamp(agg.timestamp / 1000) if agg.timestamp else None
            rows.append({
                "date": ts.strftime("%Y-%m-%d") if ts else None,
                "open": float(agg.open) if agg.open else 0,
                "high": float(agg.high) if agg.high else 0,
                "low": float(agg.low) if agg.low else 0,
                "close": float(agg.close) if agg.close else 0,
                "volume": int(agg.volume) if agg.volume else 0,
            })

        # Cache based on period length
        ttl = 3600 if period in ("1y", "2y", "5y") else 300
        cache.set(cache_key, rows, ttl)
        return rows

    except Exception as e:
        logger.error(f"Massive history failed for {ticker}: {e}")
        return []


def fetch_history_days(ticker: str, days: int = 365) -> list[dict]:
    """Fetch historical data by number of days (for risk_service compat)."""
    if days <= 30:
        period = "1mo"
    elif days <= 90:
        period = "3mo"
    elif days <= 180:
        period = "6mo"
    elif days <= 365:
        period = "1y"
    elif days <= 730:
        period = "2y"
    else:
        period = "5y"

    rows = fetch_history(ticker, period)
    return rows[-days:] if rows else []


# ─── Options Chain ───────────────────────────────────────────────────


def fetch_options_chain(tickers: list[str]) -> dict:
    """Fetch options chain snapshots with Greeks for each ticker.

    Returns data in the same format as options_data.fetch_options_data().
    """
    client = _get_client()
    if not client:
        return {}

    results = {}
    for ticker_sym in tickers:
        cache_key = f"massive_options:{ticker_sym}"
        cached = cache.get(cache_key)
        if cached:
            results[ticker_sym] = cached
            continue

        try:
            # Get current price from quotes
            quote = fetch_quotes([ticker_sym]).get(ticker_sym, {})
            current_price = quote.get("current_price")
            if not current_price:
                results[ticker_sym] = {
                    "has_options": False, "ticker": ticker_sym, "error": "No price",
                }
                continue

            # Find nearest expiration 7-45 days out
            min_exp = (datetime.now() + timedelta(days=7)).strftime("%Y-%m-%d")
            max_exp = (datetime.now() + timedelta(days=45)).strftime("%Y-%m-%d")

            # Fetch options chain with strike near ATM
            strike_low = round(current_price * 0.95, 2)
            strike_high = round(current_price * 1.05, 2)

            chain = []
            try:
                for opt in client.list_snapshot_options_chain(
                    ticker_sym,
                    params={
                        "expiration_date.gte": min_exp,
                        "expiration_date.lte": max_exp,
                        "strike_price.gte": strike_low,
                        "strike_price.lte": strike_high,
                    },
                ):
                    chain.append(opt)
            except Exception as e:
                logger.warning(f"Massive options chain failed for {ticker_sym}: {e}")
                results[ticker_sym] = {
                    "has_options": False, "ticker": ticker_sym, "error": str(e),
                }
                continue

            if not chain:
                results[ticker_sym] = {"has_options": False, "ticker": ticker_sym}
                continue

            # Find the best expiration (nearest) and ATM strike
            atm_call, atm_put, best_exp, best_strike = _find_atm_options(
                chain, current_price,
            )

            # Extract Greeks and IV
            iv_call = _get_iv(atm_call)
            iv_put = _get_iv(atm_put)
            iv_avg = None
            if iv_call is not None and iv_put is not None:
                iv_avg = round((iv_call + iv_put) / 2, 4)
            elif iv_call is not None:
                iv_avg = iv_call
            elif iv_put is not None:
                iv_avg = iv_put

            days_to_exp = (
                datetime.strptime(best_exp, "%Y-%m-%d") - datetime.now()
            ).days if best_exp else 0

            result = {
                "ticker": ticker_sym,
                "has_options": True,
                "expiration": best_exp,
                "days_to_expiry": max(days_to_exp, 0),
                "atm_strike": best_strike,
                "call": _extract_option(atm_call),
                "put": _extract_option(atm_put),
                "volatility": {
                    "iv_call": iv_call,
                    "iv_put": iv_put,
                    "iv_avg": iv_avg,
                    "hv_30d": None,  # computed separately in options_data
                    "iv_hv_ratio": None,
                },
            }

            settings = get_settings()
            cache.set(cache_key, result, settings.OPTIONS_CACHE_TTL)
            results[ticker_sym] = result

        except Exception as e:
            logger.error(f"Massive options failed for {ticker_sym}: {e}")
            results[ticker_sym] = {
                "has_options": False, "ticker": ticker_sym, "error": str(e),
            }

    return results


def _find_atm_options(chain: list, current_price: float) -> tuple:
    """Find the nearest-expiration ATM call and put from the chain."""
    # Group by expiration
    by_expiry: dict[str, list] = {}
    for opt in chain:
        details = opt.details if hasattr(opt, "details") else None
        if not details:
            continue
        exp = getattr(details, "expiration_date", None)
        if exp:
            by_expiry.setdefault(exp, []).append(opt)

    if not by_expiry:
        return None, None, None, None

    # Pick the nearest expiration
    best_exp = min(by_expiry.keys())
    contracts = by_expiry[best_exp]

    # Split into calls and puts
    calls = []
    puts = []
    for c in contracts:
        details = c.details
        ct = getattr(details, "contract_type", "")
        if ct == "call":
            calls.append(c)
        elif ct == "put":
            puts.append(c)

    # Find the strike nearest to current price
    best_strike = None
    best_dist = float("inf")
    for c in contracts:
        strike = getattr(c.details, "strike_price", None)
        if strike is not None:
            dist = abs(strike - current_price)
            if dist < best_dist:
                best_dist = dist
                best_strike = strike

    # Find the ATM call and put at that strike
    atm_call = None
    atm_put = None
    for c in calls:
        if getattr(c.details, "strike_price", None) == best_strike:
            atm_call = c
            break
    for p in puts:
        if getattr(p.details, "strike_price", None) == best_strike:
            atm_put = p
            break

    return atm_call, atm_put, best_exp, best_strike


def _extract_option(opt) -> dict:
    """Extract option data from a Massive option snapshot object."""
    if opt is None:
        return {}

    details = getattr(opt, "details", None)
    greeks = getattr(opt, "greeks", None)
    day = getattr(opt, "day", None)
    last_quote = getattr(opt, "last_quote", None)

    return {
        "strike": getattr(details, "strike_price", None) if details else None,
        "last_price": day.close if day and hasattr(day, "close") else None,
        "bid": getattr(last_quote, "bid", None) if last_quote else None,
        "ask": getattr(last_quote, "ask", None) if last_quote else None,
        "implied_volatility": getattr(opt, "implied_volatility", None),
        "open_interest": getattr(opt, "open_interest", None),
        "volume": day.volume if day and hasattr(day, "volume") else None,
        "delta": getattr(greeks, "delta", None) if greeks else None,
        "gamma": getattr(greeks, "gamma", None) if greeks else None,
        "theta": getattr(greeks, "theta", None) if greeks else None,
        "vega": getattr(greeks, "vega", None) if greeks else None,
    }


def _get_iv(opt) -> float | None:
    """Get implied volatility from a Massive option snapshot."""
    if opt is None:
        return None
    iv = getattr(opt, "implied_volatility", None)
    return round(float(iv), 4) if iv is not None else None
