"""Portfolio-level risk computations."""

import logging
from datetime import datetime, timedelta

import numpy as np
import pandas as pd
from app.data_sources.massive import fetch_info, fetch_history_days
from app.data_sources.fred import fetch_risk_free_rate

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


def compute_ticker_risk(ticker: str) -> dict:
    """Compute per-ticker risk metrics: alpha, beta, Sharpe ratio, Monte Carlo."""
    ticker_history = fetch_history_days(ticker, 365)
    spy_history = fetch_history_days("SPY", 365)

    if len(ticker_history) < 30 or len(spy_history) < 30:
        return {"error": f"Insufficient history for {ticker}"}

    # Align by date
    spy_map = {h["date"]: h["close"] for h in spy_history}
    aligned_dates = []
    aligned_ticker_prices = []
    aligned_spy_prices = []
    for h in ticker_history:
        if h["date"] in spy_map:
            aligned_dates.append(h["date"])
            aligned_ticker_prices.append(h["close"])
            aligned_spy_prices.append(spy_map[h["date"]])

    if len(aligned_ticker_prices) < 30:
        return {"error": f"Insufficient aligned data for {ticker}"}

    t_prices = np.array(aligned_ticker_prices)
    s_prices = np.array(aligned_spy_prices)

    # Daily returns
    t_returns = np.diff(t_prices) / t_prices[:-1]
    s_returns = np.diff(s_prices) / s_prices[:-1]

    # Risk-free rate
    rf = fetch_risk_free_rate()
    if rf is None:
        rf = 0.043
    daily_rf = rf / 252

    # Beta
    cov_matrix = np.cov(t_returns, s_returns)
    beta = float(cov_matrix[0][1] / cov_matrix[1][1]) if cov_matrix[1][1] != 0 else 1.0

    # Annualized return & volatility
    ticker_ann_return = float(np.mean(t_returns) * 252)
    market_ann_return = float(np.mean(s_returns) * 252)
    ticker_ann_std = float(np.std(t_returns, ddof=1) * np.sqrt(252))

    # Jensen's Alpha
    alpha = ticker_ann_return - (rf + beta * (market_ann_return - rf))

    # Sharpe Ratio
    sharpe = (ticker_ann_return - rf) / ticker_ann_std if ticker_ann_std != 0 else 0.0

    # Monte Carlo Simulation (GBM)
    num_sims = 1000
    num_days = 126  # ~6 months
    last_price = float(t_prices[-1])
    mu = ticker_ann_return
    sigma = ticker_ann_std
    dt = 1 / 252

    rng = np.random.default_rng(42)
    Z = rng.standard_normal((num_sims, num_days))
    daily_log_returns = (mu - 0.5 * sigma**2) * dt + sigma * np.sqrt(dt) * Z
    cumulative = np.cumsum(daily_log_returns, axis=1)
    price_paths = last_price * np.exp(cumulative)

    start_col = np.full((num_sims, 1), last_price)
    price_paths = np.hstack([start_col, price_paths])

    # Percentile bands
    bands = {}
    for p in [5, 25, 50, 75, 95]:
        bands[f"p{p}"] = [round(v, 2) for v in np.percentile(price_paths, p, axis=0).tolist()]

    # Projection dates (skip weekends)
    last_date = datetime.strptime(aligned_dates[-1], "%Y-%m-%d")
    projection_dates = []
    current = last_date
    for _ in range(num_days + 1):
        projection_dates.append(current.strftime("%Y-%m-%d"))
        current += timedelta(days=1)
        while current.weekday() >= 5:
            current += timedelta(days=1)

    # Interpretations
    beta_interp = (
        "High volatility vs market" if beta > 1.3
        else "Low volatility vs market" if beta < 0.7
        else "Roughly tracks the market"
    )
    alpha_interp = (
        "Outperforming risk-adjusted expectations" if alpha > 0.02
        else "Underperforming risk-adjusted expectations" if alpha < -0.02
        else "Performing near risk-adjusted expectations"
    )
    sharpe_interp = (
        "Excellent risk-adjusted return" if sharpe > 1.0
        else "Good risk-adjusted return" if sharpe > 0.5
        else "Moderate risk-adjusted return" if sharpe > 0
        else "Poor risk-adjusted return"
    )

    return {
        "ticker": ticker,
        "period": "1y",
        "risk_free_rate": round(rf, 4),
        "beta": {"value": round(beta, 3), "interpretation": beta_interp},
        "alpha": {
            "value": round(alpha, 4),
            "annualized_pct": round(alpha * 100, 2),
            "interpretation": alpha_interp,
        },
        "sharpe_ratio": {"value": round(sharpe, 3), "interpretation": sharpe_interp},
        "annualized_return": round(ticker_ann_return * 100, 2),
        "annualized_volatility": round(ticker_ann_std * 100, 2),
        "monte_carlo": {
            "dates": projection_dates,
            "bands": bands,
            "num_simulations": num_sims,
            "num_days": num_days,
            "start_price": round(last_price, 2),
        },
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
    """Weighted-average beta."""
    betas = {}
    for t in tickers:
        try:
            info = fetch_info(t)
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
        period_days = {"3mo": 66, "6mo": 130, "1y": 252}.get(period, 130)

        closes_dict = {}
        for t in tickers:
            history = fetch_history_days(t, days=period_days)
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
