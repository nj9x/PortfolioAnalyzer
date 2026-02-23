"""Options chain data and Greeks from Massive Options Chain Snapshot API.

Endpoint: GET /v3/snapshot/options/{underlyingAsset}
Returns contracts with pricing, greeks (delta, gamma, theta, vega),
implied volatility, quotes, and open interest.
"""

import logging
import numpy as np
from datetime import datetime, timedelta

import random

from app.data_sources.massive_client import _get, _limiter, _is_mock_mode, fetch_history

logger = logging.getLogger(__name__)


def fetch_options_data(tickers: list[str]) -> dict:
    """Fetch ATM options with Greeks for each ticker."""
    results = {}
    for ticker_sym in tickers:
        try:
            results[ticker_sym] = _fetch_single_ticker_options(ticker_sym)
        except Exception as e:
            results[ticker_sym] = {"has_options": False, "ticker": ticker_sym, "error": str(e)}
    return results


def _mock_options(ticker_sym: str) -> dict:
    """Generate mock options data for development/demo."""
    from app.data_sources.massive_client import _MOCK_TICKERS, _MOCK_DEFAULT
    m = _MOCK_TICKERS.get(ticker_sym, _MOCK_DEFAULT)
    price = m["price"]
    strike = round(price / 5) * 5  # nearest $5 strike
    iv = round(random.uniform(0.18, 0.55), 4)
    hv = round(random.uniform(0.15, 0.45), 4)
    exp = (datetime.now() + timedelta(days=random.randint(14, 35))).strftime("%Y-%m-%d")
    days_to_exp = (datetime.strptime(exp, "%Y-%m-%d") - datetime.now()).days

    def _mock_contract(is_call: bool) -> dict:
        delta = round(random.uniform(0.35, 0.65), 4) if is_call else round(random.uniform(-0.65, -0.35), 4)
        return {
            "strike": strike,
            "last_price": round(price * random.uniform(0.01, 0.04), 2),
            "bid": round(price * random.uniform(0.008, 0.035), 2),
            "ask": round(price * random.uniform(0.012, 0.045), 2),
            "implied_volatility": iv,
            "open_interest": random.randint(500, 15000),
            "volume": random.randint(100, 8000),
            "delta": delta,
            "gamma": round(random.uniform(0.005, 0.04), 4),
            "theta": round(random.uniform(-0.15, -0.02), 4),
            "vega": round(random.uniform(0.05, 0.40), 4),
        }

    iv_call = iv
    iv_put = round(iv + random.uniform(-0.03, 0.03), 4)
    iv_avg = round((iv_call + iv_put) / 2, 4)
    ratio = iv_avg / hv if hv > 0 else 1.0

    if ratio > 1.2:
        vol_signal = {"signal": "IV_ELEVATED", "opportunity": "IV exceeds HV — options are expensive. Consider selling covered calls or credit spreads."}
    elif ratio < 0.8:
        vol_signal = {"signal": "IV_DEPRESSED", "opportunity": "IV below HV — options are cheap. Consider buying protective puts or debit spreads."}
    else:
        vol_signal = {"signal": "IV_NORMAL", "opportunity": "IV roughly in line with HV — no clear volatility edge."}

    return {
        "ticker": ticker_sym,
        "has_options": True,
        "expiration": exp,
        "days_to_expiry": days_to_exp,
        "atm_strike": strike,
        "call": _mock_contract(True),
        "put": _mock_contract(False),
        "volatility": {
            "iv_call": iv_call,
            "iv_put": iv_put,
            "iv_avg": iv_avg,
            "hv_30d": hv,
            "iv_hv_ratio": round(ratio, 2),
            **vol_signal,
        },
    }


def _fetch_single_ticker_options(ticker_sym: str) -> dict:
    """Fetch options data for a single ticker via Massive."""
    # Get current price from snapshot
    from app.data_sources.massive_client import _get_ticker_snapshot

    snap = _get_ticker_snapshot(ticker_sym)
    day = snap.get("day", {})
    current_price = day.get("c")

    if not current_price and _is_mock_mode():
        return _mock_options(ticker_sym)

    if not current_price:
        return {"has_options": False, "ticker": ticker_sym, "error": "No price"}

    # Find target expiration 7-45 days out
    now = datetime.now()
    min_exp = (now + timedelta(days=7)).strftime("%Y-%m-%d")
    max_exp = (now + timedelta(days=45)).strftime("%Y-%m-%d")

    # Fetch options chain snapshot with expiration filter
    _limiter.acquire_sync()
    data = _get(
        f"/v3/snapshot/options/{ticker_sym}",
        params={
            "expiration_date.gte": min_exp,
            "expiration_date.lte": max_exp,
            "limit": "250",
        },
    )

    contracts = data.get("results", [])

    # If no contracts in 7-45 day window, try broader range
    if not contracts:
        broader_max = (now + timedelta(days=90)).strftime("%Y-%m-%d")
        _limiter.acquire_sync()
        data = _get(
            f"/v3/snapshot/options/{ticker_sym}",
            params={
                "expiration_date.gte": min_exp,
                "expiration_date.lte": broader_max,
                "limit": "250",
            },
        )
        contracts = data.get("results", [])

    if not contracts:
        return {"has_options": False, "ticker": ticker_sym}

    # Group by expiration and find the nearest one
    expirations = set()
    for c in contracts:
        exp = c.get("details", {}).get("expiration_date")
        if exp:
            expirations.add(exp)

    if not expirations:
        return {"has_options": False, "ticker": ticker_sym}

    nearest_exp = min(expirations, key=lambda e: abs((datetime.strptime(e, "%Y-%m-%d") - now).days))

    # Filter contracts for nearest expiration
    exp_contracts = [
        c for c in contracts
        if c.get("details", {}).get("expiration_date") == nearest_exp
    ]

    # Separate calls and puts
    calls = [c for c in exp_contracts if c.get("details", {}).get("contract_type") == "call"]
    puts = [c for c in exp_contracts if c.get("details", {}).get("contract_type") == "put"]

    # Find ATM strike (closest to current price)
    atm = _find_atm_options(calls, puts, current_price)

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

    days_to_expiry = (datetime.strptime(nearest_exp, "%Y-%m-%d") - now).days

    return {
        "ticker": ticker_sym,
        "has_options": True,
        "expiration": nearest_exp,
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


def _find_atm_options(calls: list[dict], puts: list[dict], current_price: float) -> dict:
    """Find nearest ATM call and put from Massive options chain snapshot."""
    if not calls and not puts:
        return {"strike": None, "call": {}, "put": {}}

    # Get all strikes
    all_contracts = calls + puts
    strikes = list({c.get("details", {}).get("strike_price") for c in all_contracts if c.get("details", {}).get("strike_price")})
    if not strikes:
        return {"strike": None, "call": {}, "put": {}}

    # Find strike closest to current price
    atm_strike = min(strikes, key=lambda s: abs(s - current_price))

    # Find the call and put at that strike
    atm_call = next((c for c in calls if c.get("details", {}).get("strike_price") == atm_strike), None)
    atm_put = next((c for c in puts if c.get("details", {}).get("strike_price") == atm_strike), None)

    return {
        "strike": atm_strike,
        "call": _extract_contract(atm_call),
        "put": _extract_contract(atm_put),
    }


def _extract_contract(contract: dict | None) -> dict:
    """Extract standardized data from a Massive options contract snapshot."""
    if contract is None:
        return {}

    details = contract.get("details", {})
    greeks = contract.get("greeks", {})
    last_quote = contract.get("last_quote", {})
    day_data = contract.get("day", {})

    return {
        "strike": details.get("strike_price"),
        "last_price": day_data.get("close"),
        "bid": last_quote.get("bid"),
        "ask": last_quote.get("ask"),
        "implied_volatility": _safe(contract.get("implied_volatility")),
        "open_interest": contract.get("open_interest", 0) or 0,
        "volume": day_data.get("volume", 0) or 0,
        "delta": _safe(greeks.get("delta")),
        "gamma": _safe(greeks.get("gamma")),
        "theta": _safe(greeks.get("theta")),
        "vega": _safe(greeks.get("vega")),
    }


def _compute_historical_volatility(ticker_sym: str, period: int = 30) -> float | None:
    """Compute 30-day annualized historical volatility."""
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
