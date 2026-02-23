"""Portfolio-level risk computations."""

import logging
import numpy as np
import pandas as pd
from app.data_sources.yahoo_finance import fetch_info_safe

logger = logging.getLogger(__name__)


def compute_portfolio_risk(holdings: list[dict], quotes: dict) -> dict:
    """Compute comprehensive portfolio risk metrics."""
    weights = _compute_position_weights(holdings, quotes)
    tickers = [h["ticker"] for h in holdings]

    beta = _compute_portfolio_beta(weights, tickers)
    sectors = _compute_sector_concentration(weights, quotes)
    sizing = _compute_position_sizing_alerts(weights)
    correlation = _compute_correlation_matrix(tickers)
    drawdowns = _compute_drawdown_analysis(tickers, quotes)
    stop_loss = _compute_stop_loss_alerts(tickers, quotes)

    return {
        "portfolio_beta": beta,
        "sector_concentration": sectors,
        "position_sizing": sizing,
        "correlation": correlation,
        "drawdowns": drawdowns,
        "stop_loss_alerts": stop_loss,
    }


def _compute_position_weights(holdings: list[dict], quotes: dict) -> dict:
    """Compute $ value and % weight for each position."""
    positions = {}
    total = 0

    for h in holdings:
        ticker = h["ticker"]
        price = quotes.get(ticker, {}).get("current_price")
        shares = h["shares"]
        value = shares * price if price else 0
        total += value
        positions[ticker] = {"value": value, "shares": shares}

    for ticker in positions:
        positions[ticker]["weight_pct"] = (
            round(positions[ticker]["value"] / total * 100, 2) if total > 0 else 0
        )

    return positions


def _compute_portfolio_beta(weights: dict, tickers: list[str]) -> dict:
    """Weighted-average beta from yfinance."""
    betas = {}
    for t in tickers:
        try:
            info = fetch_info_safe(t)
            beta = info.get("beta")
            betas[t] = round(beta, 2) if beta else 1.0
        except Exception:
            betas[t] = 1.0

    total_weight = sum(w["weight_pct"] for w in weights.values())
    if total_weight == 0:
        return {"value": 1.0, "interpretation": "No position data", "individual": betas}

    portfolio_beta = sum(
        betas.get(t, 1.0) * weights[t]["weight_pct"] / total_weight for t in tickers
    )
    portfolio_beta = round(portfolio_beta, 2)

    if portfolio_beta > 1.2:
        interp = f"Aggressive — portfolio moves ~{int((portfolio_beta - 1) * 100)}% more than the market"
    elif portfolio_beta < 0.8:
        interp = f"Defensive — portfolio moves ~{int((1 - portfolio_beta) * 100)}% less than the market"
    else:
        interp = "Moderate — portfolio roughly tracks the market"

    return {"value": portfolio_beta, "interpretation": interp, "individual": betas}


def _compute_sector_concentration(weights: dict, quotes: dict) -> dict:
    """Sector allocation with warnings."""
    sectors = {}
    for ticker, w in weights.items():
        sector = quotes.get(ticker, {}).get("sector", "Unknown")
        sectors[sector] = sectors.get(sector, 0) + w["weight_pct"]

    sectors = {k: round(v, 1) for k, v in sorted(sectors.items(), key=lambda x: -x[1])}
    warnings = [
        f"{sector} at {pct}% — high concentration risk"
        for sector, pct in sectors.items()
        if pct > 40
    ]

    return {"sectors": sectors, "warnings": warnings}


def _compute_position_sizing_alerts(weights: dict, threshold: float = 20.0) -> dict:
    """Flag positions exceeding threshold."""
    alerts = []
    max_pos = {"ticker": None, "weight_pct": 0}

    for ticker, w in weights.items():
        if w["weight_pct"] > max_pos["weight_pct"]:
            max_pos = {"ticker": ticker, "weight_pct": w["weight_pct"]}
        if w["weight_pct"] > threshold:
            alerts.append({
                "ticker": ticker,
                "weight_pct": w["weight_pct"],
                "alert": f"Position exceeds {threshold}% threshold",
            })

    return {
        "alerts": alerts,
        "max_position": max_pos,
        "position_count": len(weights),
    }


def _compute_correlation_matrix(tickers: list[str], period: str = "6mo") -> dict:
    """Correlation matrix from daily returns. Limited to top 10 tickers."""
    tickers = tickers[:10]  # Cap for performance
    if len(tickers) < 2:
        return {"high_pairs": [], "avg_correlation": 0}

    try:
        # Use Alpha Vantage daily history for each ticker
        from app.data_sources import alpha_vantage

        period_days = {"3mo": 66, "6mo": 130, "1y": 252}.get(period, 130)

        closes_dict = {}
        for t in tickers:
            history = alpha_vantage.fetch_history(t, days=period_days)
            if history:
                closes_dict[t] = pd.Series(
                    [h["close"] for h in history],
                    index=pd.to_datetime([h["date"] for h in history]),
                )

        if len(closes_dict) < 2:
            return {"high_pairs": [], "avg_correlation": 0}

        prices = pd.DataFrame(closes_dict).dropna()
        returns = prices.pct_change().dropna()
        corr = returns.corr()

        # Find highly correlated pairs
        high_pairs = []
        seen = set()
        for i, t1 in enumerate(corr.columns):
            for j, t2 in enumerate(corr.columns):
                if i >= j:
                    continue
                pair_key = tuple(sorted([t1, t2]))
                if pair_key in seen:
                    continue
                seen.add(pair_key)
                c = float(corr.loc[t1, t2])
                if abs(c) > 0.8:
                    high_pairs.append({
                        "pair": [t1, t2],
                        "correlation": round(c, 3),
                        "risk": "High co-movement — limited diversification benefit",
                    })

        # Average correlation (excluding diagonal)
        mask = np.triu(np.ones(corr.shape), k=1).astype(bool)
        avg = float(corr.values[mask].mean()) if mask.any() else 0

        return {"high_pairs": high_pairs, "avg_correlation": round(avg, 3)}

    except Exception:
        return {"high_pairs": [], "avg_correlation": 0}


def _compute_drawdown_analysis(tickers: list[str], quotes: dict) -> dict:
    """Drawdown from 52-week high per holding."""
    drawdowns = {}
    worst = {"ticker": None, "drawdown_pct": 0}

    for t in tickers:
        q = quotes.get(t, {})
        high = q.get("fifty_two_week_high")
        current = q.get("current_price")
        if high and current and high > 0:
            dd = round(((current - high) / high) * 100, 2)
            drawdowns[t] = {"drawdown_pct": dd, "from_high": high, "current": current}
            if dd < worst.get("drawdown_pct", 0):
                worst = {"ticker": t, "drawdown_pct": dd}
        else:
            drawdowns[t] = {"drawdown_pct": None, "from_high": high, "current": current}

    return {**drawdowns, "_worst": worst}


def _compute_stop_loss_alerts(
    tickers: list[str], quotes: dict, default_stop_pct: float = 0.15
) -> list[dict]:
    """Check positions vs trailing stop-loss level (15% from 52wk high)."""
    alerts = []
    for t in tickers:
        q = quotes.get(t, {})
        high = q.get("fifty_two_week_high")
        current = q.get("current_price")
        if not high or not current:
            continue
        stop_level = round(high * (1 - default_stop_pct), 2)
        if current < stop_level:
            alerts.append({
                "ticker": t,
                "current": current,
                "stop_level": stop_level,
                "from_high": high,
                "status": "BELOW_STOP_LOSS",
            })
        elif current < stop_level * 1.05:
            alerts.append({
                "ticker": t,
                "current": current,
                "stop_level": stop_level,
                "from_high": high,
                "status": "NEAR_STOP_LOSS",
            })
    return alerts
