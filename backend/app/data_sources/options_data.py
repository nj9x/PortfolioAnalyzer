"""Options chain data and Greeks from yfinance."""

import logging
import numpy as np
import yfinance as yf
from datetime import datetime, timedelta
from app.data_sources.yahoo_finance import _limiter

logger = logging.getLogger(__name__)


def fetch_options_data(tickers: list[str]) -> dict:
    """Fetch ATM options with Greeks for each ticker."""
    results = {}
    for ticker_sym in tickers:
        _limiter.acquire_sync()
        try:
            ticker_obj = yf.Ticker(ticker_sym)
            try:
                expirations = ticker_obj.options
            except Exception:
                results[ticker_sym] = {"has_options": False, "ticker": ticker_sym}
                continue

            if not expirations:
                results[ticker_sym] = {"has_options": False, "ticker": ticker_sym}
                continue

            # Get price from Alpha Vantage (cached)
            current_price = None
            try:
                from app.data_sources import alpha_vantage
                av_quote = alpha_vantage.fetch_quote(ticker_sym)
                if av_quote:
                    current_price = av_quote.get("current_price")
            except Exception:
                pass

            if not current_price:
                results[ticker_sym] = {"has_options": False, "ticker": ticker_sym, "error": "No price"}
                continue

            # Find nearest expiration 7-45 days out
            expiry = _find_nearest_expiration(expirations)
            if not expiry:
                results[ticker_sym] = {"has_options": False, "ticker": ticker_sym}
                continue

            _limiter.acquire_sync()
            chain = ticker_obj.option_chain(expiry)
            atm = _find_atm_options(chain, current_price)

            # Historical volatility
            hv = _compute_historical_volatility(ticker_sym)

            # IV from ATM options
            iv_call = atm.get("call", {}).get("implied_volatility")
            iv_put = atm.get("put", {}).get("implied_volatility")
            iv_avg = None
            if iv_call is not None and iv_put is not None:
                iv_avg = round((iv_call + iv_put) / 2, 4)
            elif iv_call is not None:
                iv_avg = iv_call
            elif iv_put is not None:
                iv_avg = iv_put

            vol_comparison = _compare_iv_hv(iv_avg, hv)

            days_to_expiry = (datetime.strptime(expiry, "%Y-%m-%d") - datetime.now()).days

            results[ticker_sym] = {
                "ticker": ticker_sym,
                "has_options": True,
                "expiration": expiry,
                "days_to_expiry": max(days_to_expiry, 0),
                "atm_strike": atm.get("strike"),
                "call": atm.get("call", {}),
                "put": atm.get("put", {}),
                "volatility": {
                    "iv_call": iv_call,
                    "iv_put": iv_put,
                    "iv_avg": iv_avg,
                    "hv_30d": hv,
                    "iv_hv_ratio": round(iv_avg / hv, 2) if iv_avg and hv and hv > 0 else None,
                    **vol_comparison,
                },
            }
        except Exception as e:
            results[ticker_sym] = {"has_options": False, "ticker": ticker_sym, "error": str(e)}
    return results


def _find_nearest_expiration(expirations: tuple, min_days: int = 7, max_days: int = 45) -> str | None:
    """Find nearest expiration in the 7-45 day window."""
    now = datetime.now()
    best = None
    best_diff = float("inf")

    for exp_str in expirations:
        exp_date = datetime.strptime(exp_str, "%Y-%m-%d")
        days = (exp_date - now).days
        if min_days <= days <= max_days and days < best_diff:
            best = exp_str
            best_diff = days

    # If nothing in window, take the nearest future expiration
    if best is None:
        for exp_str in expirations:
            exp_date = datetime.strptime(exp_str, "%Y-%m-%d")
            days = (exp_date - now).days
            if days > 0 and days < best_diff:
                best = exp_str
                best_diff = days

    return best


def _find_atm_options(chain, current_price: float) -> dict:
    """Find nearest ATM call and put, extract data."""
    calls = chain.calls
    puts = chain.puts

    if calls.empty or puts.empty:
        return {"strike": None, "call": {}, "put": {}}

    # Find strike closest to current price
    strikes = calls["strike"].values
    atm_idx = int(np.argmin(np.abs(strikes - current_price)))
    strike = float(strikes[atm_idx])

    call_row = calls.iloc[atm_idx]
    put_row = puts.iloc[atm_idx] if atm_idx < len(puts) else None

    def _extract(row) -> dict:
        if row is None:
            return {}
        return {
            "strike": float(row.get("strike", 0)),
            "last_price": _safe(row.get("lastPrice")),
            "bid": _safe(row.get("bid")),
            "ask": _safe(row.get("ask")),
            "implied_volatility": _safe(row.get("impliedVolatility")),
            "open_interest": int(row.get("openInterest", 0)) if not _is_nan(row.get("openInterest")) else 0,
            "volume": int(row.get("volume", 0)) if not _is_nan(row.get("volume")) else 0,
            # Greeks if available (yfinance may not always provide these)
            "delta": _safe(row.get("delta")),
            "gamma": _safe(row.get("gamma")),
            "theta": _safe(row.get("theta")),
            "vega": _safe(row.get("vega")),
        }

    return {
        "strike": strike,
        "call": _extract(call_row),
        "put": _extract(put_row),
    }


def _compute_historical_volatility(ticker_sym: str, period: int = 30) -> float | None:
    """Compute 30-day annualized historical volatility."""
    try:
        # Try Massive first, fall back to yfinance
        from app.config import get_settings
        settings = get_settings()
        history = []
        if settings.MASSIVE_API_KEY:
            from app.data_sources import massive_api
            history = massive_api.fetch_history(ticker_sym, period="3mo")
        if not history:
            from app.data_sources.yahoo_finance import fetch_history
            history = fetch_history(ticker_sym, period="3mo")
        if len(history) < period:
            return None
        import pandas as pd
        closes = pd.Series([h["close"] for h in history])
        log_returns = np.log(closes / closes.shift(1)).dropna()
        hv = float(log_returns.tail(period).std() * np.sqrt(252))
        return round(hv, 4)
    except Exception:
        return None


def _compare_iv_hv(iv: float | None, hv: float | None) -> dict:
    """Compare IV vs HV and flag opportunities."""
    if iv is None or hv is None or hv == 0:
        return {"signal": "N/A", "opportunity": "Insufficient volatility data"}

    ratio = iv / hv
    if ratio > 1.2:
        return {
            "signal": "IV_ELEVATED",
            "opportunity": "IV exceeds HV — options are expensive. Consider selling covered calls or credit spreads.",
        }
    elif ratio < 0.8:
        return {
            "signal": "IV_DEPRESSED",
            "opportunity": "IV below HV — options are cheap. Consider buying protective puts or debit spreads.",
        }
    return {
        "signal": "IV_NORMAL",
        "opportunity": "IV roughly in line with HV — no clear volatility edge.",
    }


def _safe(val) -> float | None:
    if val is None or _is_nan(val):
        return None
    return round(float(val), 4)


def _is_nan(val) -> bool:
    try:
        return val is None or (isinstance(val, float) and np.isnan(val))
    except (TypeError, ValueError):
        return False
