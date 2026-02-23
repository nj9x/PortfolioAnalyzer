"""Greenblatt-style fundamental screening via yfinance data."""

import logging
from app.data_sources.yahoo_finance import fetch_info_safe

logger = logging.getLogger(__name__)


def fetch_fundamentals(tickers: list[str]) -> dict:
    """Fetch fundamental metrics for a list of tickers.

    yfinance .info already provides all needed fields:
    freeCashflow, netIncomeToCommon, totalDebt, totalCash, enterpriseValue, etc.
    """
    results = {}
    for ticker_sym in tickers:
        try:
            info = fetch_info_safe(ticker_sym)
            results[ticker_sym] = _extract_fundamentals(info, ticker_sym)
        except Exception as e:
            logger.warning(f"Fundamentals failed for {ticker_sym}: {e}")
            results[ticker_sym] = {"error": str(e)}
    return results


def _extract_fundamentals(info: dict, ticker: str) -> dict:
    """Extract all fundamental metrics from yfinance info dict."""
    valuation = _compute_valuation(info)
    quality = _compute_quality(info)
    growth = _compute_growth(info)
    health = _compute_health(info)
    flag, reasoning = _generate_valuation_flag(valuation, quality, growth, health)

    return {
        "ticker": ticker,
        "valuation": valuation,
        "quality": quality,
        "growth": growth,
        "health": health,
        "valuation_flag": flag,
        "flag_reasoning": reasoning,
    }


def _compute_valuation(info: dict) -> dict:
    """P/E, EV/EBIT, earnings yield, FCF yield."""
    pe = info.get("trailingPE")
    forward_pe = info.get("forwardPE")
    ev = info.get("enterpriseValue")
    ebitda = info.get("ebitda")
    market_cap = info.get("marketCap")
    fcf = info.get("freeCashflow")

    ev_ebit = round(ev / ebitda, 2) if ev and ebitda and ebitda > 0 else None
    earnings_yield = round(1 / pe * 100, 2) if pe and pe > 0 else None
    fcf_yield = round(fcf / market_cap * 100, 2) if fcf and market_cap and market_cap > 0 else None
    price_to_book = info.get("priceToBook")

    return {
        "pe_ratio": round(pe, 2) if pe else None,
        "forward_pe": round(forward_pe, 2) if forward_pe else None,
        "ev_ebit": ev_ebit,
        "earnings_yield": earnings_yield,
        "fcf_yield": fcf_yield,
        "price_to_book": round(price_to_book, 2) if price_to_book else None,
    }


def _compute_quality(info: dict) -> dict:
    """ROIC, ROE, profit margin."""
    roe = info.get("returnOnEquity")
    profit_margin = info.get("profitMargins")

    # Approximate ROIC: net income / (total equity + total debt - cash)
    net_income = info.get("netIncomeToCommon")
    total_debt = info.get("totalDebt", 0)
    total_cash = info.get("totalCash", 0)
    book_value = info.get("bookValue")
    shares = info.get("sharesOutstanding")

    roic = None
    if net_income and book_value and shares:
        total_equity = book_value * shares
        invested_capital = total_equity + (total_debt or 0) - (total_cash or 0)
        if invested_capital > 0:
            roic = round(net_income / invested_capital * 100, 2)

    return {
        "roic": roic,
        "roe": round(roe * 100, 2) if roe else None,
        "profit_margin": round(profit_margin * 100, 2) if profit_margin else None,
    }


def _compute_growth(info: dict) -> dict:
    """Revenue and earnings growth."""
    return {
        "revenue_growth": _pct(info.get("revenueGrowth")),
        "earnings_growth": _pct(info.get("earningsGrowth")),
        "earnings_quarterly_growth": _pct(info.get("earningsQuarterlyGrowth")),
    }


def _compute_health(info: dict) -> dict:
    """Debt/Equity, current ratio."""
    de = info.get("debtToEquity")
    return {
        "debt_to_equity": round(de / 100, 2) if de else None,  # yfinance returns as percentage
        "current_ratio": _safe_round(info.get("currentRatio")),
        "quick_ratio": _safe_round(info.get("quickRatio")),
    }


def _generate_valuation_flag(
    valuation: dict, quality: dict, growth: dict, health: dict
) -> tuple[str, str]:
    """Greenblatt-style scoring for valuation flag."""
    score = 0
    reasons = []

    # Low EV/EBIT is attractive
    ev_ebit = valuation.get("ev_ebit")
    if ev_ebit is not None:
        if ev_ebit < 10:
            score += 2
            reasons.append(f"Low EV/EBIT ({ev_ebit}x)")
        elif ev_ebit < 15:
            score += 1
        elif ev_ebit > 25:
            score -= 1
            reasons.append(f"High EV/EBIT ({ev_ebit}x)")
        elif ev_ebit > 35:
            score -= 2
            reasons.append(f"Very high EV/EBIT ({ev_ebit}x)")

    # High ROIC is quality
    roic = quality.get("roic")
    if roic is not None:
        if roic > 20:
            score += 2
            reasons.append(f"Strong ROIC ({roic}%)")
        elif roic > 12:
            score += 1
        elif roic < 5:
            score -= 1
            reasons.append(f"Weak ROIC ({roic}%)")

    # FCF yield
    fcf_yield = valuation.get("fcf_yield")
    if fcf_yield is not None:
        if fcf_yield > 8:
            score += 1
            reasons.append(f"High FCF yield ({fcf_yield}%)")
        elif fcf_yield < 0:
            score -= 1
            reasons.append(f"Negative FCF yield ({fcf_yield}%)")

    # Earnings growth
    eg = growth.get("earnings_growth")
    if eg is not None:
        if eg > 15:
            score += 1
        elif eg < -10:
            score -= 1

    # Debt check
    de = health.get("debt_to_equity")
    if de is not None and de > 2.0:
        score -= 1
        reasons.append(f"High leverage (D/E {de})")

    if score >= 3:
        flag = "UNDERVALUED_OPPORTUNITY"
    elif score <= -2:
        flag = "OVERVALUATION_WARNING"
    else:
        flag = "FAIRLY_VALUED"

    reasoning = "; ".join(reasons) if reasons else "Mixed signals across metrics"
    return flag, reasoning


def _pct(val) -> float | None:
    return round(val * 100, 2) if val is not None else None


def _safe_round(val, digits=2) -> float | None:
    return round(val, digits) if val is not None else None
