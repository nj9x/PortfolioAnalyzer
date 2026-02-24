"""Options chain data and Greeks from Massive API."""

import logging
import numpy as np
from datetime import datetime
from app.data_sources import massive

logger = logging.getLogger(__name__)


def fetch_options_data(tickers: list[str]) -> dict:
    """Fetch ATM options with Greeks for each ticker."""
    results = {}
    for ticker_sym in tickers:
        try:
            snap = massive.fetch_snapshot(ticker_sym)
            current_price = snap.get("current_price") if snap else None
            if not current_price:
                results[ticker_sym] = {"has_options": False, "ticker": ticker_sym, "error": "No price"}
                continue

            chain_data = massive.fetch_options_chain(ticker_sym)
            if not chain_data.get("has_options"):
                results[ticker_sym] = {"has_options": False, "ticker": ticker_sym}
                continue

            contracts = chain_data.get("contracts", [])
            if not contracts:
                results[ticker_sym] = {"has_options": False, "ticker": ticker_sym}
                continue

            # Group by expiration, find nearest 7-45 days out
            expirations = set()
            for c in contracts:
                exp = c.get("expiration_date")
                if exp:
                    expirations.add(exp)

            expiry = _find_nearest_expiration(sorted(expirations))
            if not expiry:
                results[ticker_sym] = {"has_options": False, "ticker": ticker_sym}
                continue

            # Filter contracts for this expiration
            exp_contracts = [c for c in contracts if c.get("expiration_date") == expiry]
            calls = [c for c in exp_contracts if c.get("contract_type") == "call"]
            puts = [c for c in exp_contracts if c.get("contract_type") == "put"]

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

            exp_date = datetime.strptime(expiry, "%Y-%m-%d") if len(expiry) == 10 else datetime.fromisoformat(expiry)
            days_to_expiry = (exp_date - datetime.now()).days

            results[ticker_sym] = {
                "ticker": ticker_sym,
                "has_options": True,
                "expiration": expiry[:10],
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


def _find_nearest_expiration(expirations: list[str], min_days: int = 7, max_days: int = 45) -> str | None:
    """Find nearest expiration in the 7-45 day window."""
    now = datetime.now()
    best = None
    best_diff = float("inf")

    for exp_str in expirations:
        try:
            exp_date = datetime.strptime(exp_str[:10], "%Y-%m-%d")
        except ValueError:
            continue
        days = (exp_date - now).days
        if min_days <= days <= max_days and days < best_diff:
            best = exp_str
            best_diff = days

    if best is None:
        for exp_str in expirations:
            try:
                exp_date = datetime.strptime(exp_str[:10], "%Y-%m-%d")
            except ValueError:
                continue
            days = (exp_date - now).days
            if days > 0 and days < best_diff:
                best = exp_str
                best_diff = days

    return best


def _find_atm_options(calls: list[dict], puts: list[dict], current_price: float) -> dict:
    """Find nearest ATM call and put."""
    if not calls and not puts:
        return {"strike": None, "call": {}, "put": {}}

    all_strikes = [c.get("strike_price", 0) for c in calls] + [p.get("strike_price", 0) for p in puts]
    if not all_strikes:
        return {"strike": None, "call": {}, "put": {}}

    strikes = np.array(all_strikes)
    atm_strike = float(strikes[np.argmin(np.abs(strikes - current_price))])

    call_row = next((c for c in calls if c.get("strike_price") == atm_strike), None)
    put_row = next((p for p in puts if p.get("strike_price") == atm_strike), None)

    def _extract(row) -> dict:
        if row is None:
            return {}
        return {
            "strike": row.get("strike_price"),
            "last_price": _safe(row.get("last_price")),
            "bid": _safe(row.get("bid")),
            "ask": _safe(row.get("ask")),
            "implied_volatility": _safe(row.get("implied_volatility")),
            "open_interest": int(row.get("open_interest") or 0),
            "volume": int(row.get("volume") or 0),
            "delta": _safe(row.get("delta")),
            "gamma": _safe(row.get("gamma")),
            "theta": _safe(row.get("theta")),
            "vega": _safe(row.get("vega")),
        }

    return {
        "strike": atm_strike,
        "call": _extract(call_row),
        "put": _extract(put_row),
    }


def _compute_historical_volatility(ticker_sym: str, period: int = 30) -> float | None:
    """Compute 30-day annualized historical volatility."""
    try:
        import pandas as pd
        history = massive.fetch_history(ticker_sym, period="3mo")
        if len(history) < period:
            return None
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
    if val is None:
        return None
    try:
        f = float(val)
        return None if np.isnan(f) else round(f, 4)
    except (TypeError, ValueError):
        return None
