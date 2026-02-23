"""Options chain data and Greeks via Massive.com REST API."""

import logging
import numpy as np
from datetime import datetime, timedelta

from app.data_sources.massive_client import get_client
from app.services.cache_service import cache

logger = logging.getLogger(__name__)


def fetch_options_data(tickers: list[str]) -> dict:
    """Fetch ATM options with Greeks for each ticker via Massive."""
    results = {}
    for ticker_sym in tickers:
        try:
            # Get current price from Massive (reuse cached quote)
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

            # Fetch options chain snapshots from Massive
            client = get_client()
            try:
                chain = list(client.list_snapshot_options_chain(ticker_sym, limit=250))
            except Exception as e:
                logger.error(f"Massive options chain failed for {ticker_sym}: {e}")
                results[ticker_sym] = {"has_options": False, "ticker": ticker_sym, "error": str(e)}
                continue

            if not chain:
                results[ticker_sym] = {"has_options": False, "ticker": ticker_sym}
                continue

            # Find nearest expiration in 7-45 day window
            expiry = _find_nearest_expiration(chain)
            if not expiry:
                results[ticker_sym] = {"has_options": False, "ticker": ticker_sym}
                continue

            # Filter to target expiration and find ATM strike
            expiry_chain = [
                c for c in chain
                if c.details and c.details.expiration_date == expiry
            ]
            atm = _find_atm_options(expiry_chain, current_price)

            # Historical volatility (from price history)
            hv = _compute_historical_volatility(ticker_sym)

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


def _find_nearest_expiration(chain, min_days: int = 7, max_days: int = 45) -> str | None:
    """Find nearest expiration date in the 7-45 day window from chain snapshots."""
    now = datetime.now()
    expirations = set()
    for contract in chain:
        if contract.details and contract.details.expiration_date:
            expirations.add(contract.details.expiration_date)

    best = None
    best_diff = float("inf")
    for exp_str in expirations:
        exp_date = datetime.strptime(exp_str, "%Y-%m-%d")
        days = (exp_date - now).days
        if min_days <= days <= max_days and days < best_diff:
            best = exp_str
            best_diff = days

    # If nothing in window, take nearest future expiration
    if best is None:
        for exp_str in expirations:
            exp_date = datetime.strptime(exp_str, "%Y-%m-%d")
            days = (exp_date - now).days
            if days > 0 and days < best_diff:
                best = exp_str
                best_diff = days

    return best


def _find_atm_options(expiry_chain, current_price: float) -> dict:
    """Find nearest ATM call and put from chain snapshots, extract data."""
    calls = [c for c in expiry_chain if c.details and c.details.contract_type == "call"]
    puts = [c for c in expiry_chain if c.details and c.details.contract_type == "put"]

    if not calls and not puts:
        return {"strike": None, "call": {}, "put": {}}

    # Find ATM strike
    all_contracts = calls or puts
    strikes = [c.details.strike_price for c in all_contracts if c.details and c.details.strike_price]
    if not strikes:
        return {"strike": None, "call": {}, "put": {}}

    atm_strike = min(strikes, key=lambda s: abs(s - current_price))

    atm_call = next((c for c in calls if c.details and c.details.strike_price == atm_strike), None)
    atm_put = next((c for c in puts if c.details and c.details.strike_price == atm_strike), None)

    def _extract(contract) -> dict:
        if contract is None:
            return {}
        details = contract.details
        greeks = getattr(contract, "greeks", None)
        day = getattr(contract, "day", None)
        last_quote = getattr(contract, "last_quote", None)
        return {
            "strike": float(getattr(details, "strike_price", 0) or 0),
            "last_price": _safe(getattr(day, "close", None) if day else None),
            "bid": _safe(getattr(last_quote, "bid", None) if last_quote else None),
            "ask": _safe(getattr(last_quote, "ask", None) if last_quote else None),
            "implied_volatility": _safe(getattr(contract, "implied_volatility", None)),
            "open_interest": int(contract.open_interest) if getattr(contract, "open_interest", None) else 0,
            "volume": int(day.volume) if day and getattr(day, "volume", None) else 0,
            "delta": _safe(getattr(greeks, "delta", None) if greeks else None),
            "gamma": _safe(getattr(greeks, "gamma", None) if greeks else None),
            "theta": _safe(getattr(greeks, "theta", None) if greeks else None),
            "vega": _safe(getattr(greeks, "vega", None) if greeks else None),
        }

    return {
        "strike": atm_strike,
        "call": _extract(atm_call),
        "put": _extract(atm_put),
    }


def _compute_historical_volatility(ticker_sym: str, period: int = 30) -> float | None:
    """Compute 30-day annualized historical volatility."""
    from app.data_sources.yahoo_finance import fetch_history
    try:
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
