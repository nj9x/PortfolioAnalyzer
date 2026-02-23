"""Options chain data and Greeks from Massive.com REST API."""

import logging
import numpy as np
from datetime import datetime, timedelta

from app.data_sources.massive_client import get_client

logger = logging.getLogger(__name__)


def fetch_options_data(tickers: list[str]) -> dict:
    """Fetch ATM options with Greeks for each ticker."""
    results = {}
    client = get_client()

    for ticker_sym in tickers:
        try:
            # Get current price from previous close
            from app.data_sources import alpha_vantage
            av_quote = alpha_vantage.fetch_quote(ticker_sym)
            current_price = av_quote.get("current_price") if av_quote else None

            if not current_price:
                results[ticker_sym] = {"has_options": False, "ticker": ticker_sym, "error": "No price"}
                continue

            # Fetch options chain snapshot — filter to near-term expirations
            target_date = datetime.now() + timedelta(days=30)
            min_date = (datetime.now() + timedelta(days=7)).strftime("%Y-%m-%d")
            max_date = (datetime.now() + timedelta(days=45)).strftime("%Y-%m-%d")

            options = list(client.list_snapshot_options_chain(
                ticker_sym,
                params={
                    "expiration_date.gte": min_date,
                    "expiration_date.lte": max_date,
                    "strike_price.gte": current_price * 0.95,
                    "strike_price.lte": current_price * 1.05,
                },
            ))

            if not options:
                # Widen the search if no results in tight window
                options = list(client.list_snapshot_options_chain(
                    ticker_sym,
                    params={
                        "expiration_date.gte": min_date,
                        "strike_price.gte": current_price * 0.90,
                        "strike_price.lte": current_price * 1.10,
                    },
                ))

            if not options:
                results[ticker_sym] = {"has_options": False, "ticker": ticker_sym}
                continue

            # Separate calls and puts
            calls = [o for o in options if o.details and o.details.contract_type == "call"]
            puts = [o for o in options if o.details and o.details.contract_type == "put"]

            if not calls and not puts:
                results[ticker_sym] = {"has_options": False, "ticker": ticker_sym}
                continue

            # Find ATM options (closest strike to current price)
            atm_call = _find_atm(calls, current_price)
            atm_put = _find_atm(puts, current_price)

            atm_option = atm_call or atm_put
            strike = atm_option.details.strike_price if atm_option and atm_option.details else None
            expiry = atm_option.details.expiration_date if atm_option and atm_option.details else None
            days_to_expiry = (
                (datetime.strptime(expiry, "%Y-%m-%d") - datetime.now()).days
                if expiry else 0
            )

            call_data = _extract_option(atm_call) if atm_call else {}
            put_data = _extract_option(atm_put) if atm_put else {}

            # IV from ATM options
            iv_call = call_data.get("implied_volatility")
            iv_put = put_data.get("implied_volatility")
            iv_avg = None
            if iv_call is not None and iv_put is not None:
                iv_avg = round((iv_call + iv_put) / 2, 4)
            elif iv_call is not None:
                iv_avg = iv_call
            elif iv_put is not None:
                iv_avg = iv_put

            # Historical volatility from price history
            hv = _compute_historical_volatility(ticker_sym)
            vol_comparison = _compare_iv_hv(iv_avg, hv)

            results[ticker_sym] = {
                "ticker": ticker_sym,
                "has_options": True,
                "expiration": expiry,
                "days_to_expiry": max(days_to_expiry, 0),
                "atm_strike": strike,
                "call": call_data,
                "put": put_data,
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
            logger.error(f"Options data failed for {ticker_sym}: {e}")
            results[ticker_sym] = {"has_options": False, "ticker": ticker_sym, "error": str(e)}

    return results


def _find_atm(options: list, current_price: float):
    """Find the option contract closest to ATM."""
    if not options:
        return None
    return min(
        options,
        key=lambda o: abs((o.details.strike_price or 0) - current_price)
        if o.details else float("inf"),
    )


def _extract_option(option) -> dict:
    """Extract standardized option data from Massive OptionContractSnapshot."""
    result = {}
    if option.details:
        result["strike"] = option.details.strike_price

    if option.day:
        result["last_price"] = _safe(option.day.close)
    if option.last_quote:
        result["bid"] = _safe(option.last_quote.bid)
        result["ask"] = _safe(option.last_quote.ask)

    result["implied_volatility"] = _safe(option.implied_volatility)
    result["open_interest"] = int(option.open_interest) if option.open_interest else 0
    result["volume"] = int(option.day.volume) if option.day and option.day.volume else 0

    if option.greeks:
        result["delta"] = _safe(option.greeks.delta)
        result["gamma"] = _safe(option.greeks.gamma)
        result["theta"] = _safe(option.greeks.theta)
        result["vega"] = _safe(option.greeks.vega)
    else:
        result["delta"] = None
        result["gamma"] = None
        result["theta"] = None
        result["vega"] = None

    return result


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
    if val is None:
        return None
    try:
        f = float(val)
        return None if np.isnan(f) else round(f, 4)
    except (TypeError, ValueError):
        return None
