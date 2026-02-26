"""Portfolio analytics: P&L, Sharpe, VaR, max drawdown, benchmark comparison,
performance attribution, asset allocation, drift detection, cash metrics."""

import json
import logging
from datetime import datetime, timedelta

import numpy as np
import pandas as pd
from app.data_sources.massive import fetch_history_days
from app.data_sources.fred import fetch_risk_free_rate

logger = logging.getLogger(__name__)

# Cap tickers for heavy history operations to avoid timeouts
_MAX_TICKERS_HISTORY = 15


def compute_portfolio_analytics(portfolio, holdings: list[dict], quotes: dict) -> dict:
    """Main entry point — returns all analytics for a single portfolio."""
    benchmark_ticker = getattr(portfolio, "benchmark", None) or "SPY"
    cash_balance = getattr(portfolio, "cash_balance", None) or 0.0

    raw_target = getattr(portfolio, "target_allocation", None)
    if isinstance(raw_target, str):
        try:
            target_allocation = json.loads(raw_target)
        except (json.JSONDecodeError, TypeError):
            target_allocation = None
    else:
        target_allocation = raw_target

    # Core computations
    pnl = _compute_pnl(holdings, quotes)
    allocation = _compute_asset_allocation(holdings, quotes, cash_balance)
    risk_metrics = _compute_advanced_risk_metrics(holdings, quotes)
    benchmark = _compute_benchmark_comparison(holdings, quotes, benchmark_ticker)
    attribution = _compute_performance_attribution(holdings, quotes)
    drift = _compute_drift_alerts(holdings, quotes, target_allocation, cash_balance)
    cash = _compute_cash_metrics(holdings, quotes, cash_balance)

    return {
        "pnl": pnl,
        "asset_allocation": allocation,
        "risk_metrics": risk_metrics,
        "benchmark": benchmark,
        "attribution": attribution,
        "drift": drift,
        "cash": cash,
    }


# ─── 1. P&L (Daily / MTD / YTD) ──────────────────────────────────────


def _compute_pnl(holdings: list[dict], quotes: dict) -> dict:
    """Compute daily, MTD, and YTD P&L."""
    now = datetime.now()
    current_value = 0.0
    daily_pnl = 0.0

    for h in holdings:
        q = quotes.get(h["ticker"], {})
        price = q.get("current_price")
        day_change = q.get("day_change")
        if price:
            current_value += h["shares"] * price
        if day_change:
            daily_pnl += day_change * h["shares"]

    daily_pnl_pct = (daily_pnl / (current_value - daily_pnl) * 100) if current_value > abs(daily_pnl) else 0.0

    # MTD: first trading day of current month
    mtd = _compute_period_pnl(holdings, quotes, now.replace(day=1), current_value)

    # YTD: first trading day of current year
    ytd = _compute_period_pnl(holdings, quotes, now.replace(month=1, day=1), current_value)

    return {
        "current_value": round(current_value, 2),
        "daily": {"dollar": round(daily_pnl, 2), "pct": round(daily_pnl_pct, 2)},
        "mtd": mtd,
        "ytd": ytd,
    }


def _compute_period_pnl(holdings: list[dict], quotes: dict, start_date: datetime, current_value: float) -> dict:
    """Compute P&L from start_date to now using historical close prices."""
    try:
        days_back = (datetime.now() - start_date).days + 5  # buffer for weekends
        if days_back < 2:
            return {"dollar": 0.0, "pct": 0.0}

        start_str = start_date.strftime("%Y-%m-%d")
        start_value = 0.0
        tickers_found = 0

        for h in holdings[:_MAX_TICKERS_HISTORY]:
            history = fetch_history_days(h["ticker"], days=days_back)
            if not history:
                # Fall back to cost basis if no history
                if h.get("cost_basis"):
                    start_value += h["shares"] * h["cost_basis"]
                continue

            # Find closest price to start_date
            start_price = None
            for bar in history:
                if bar["date"] >= start_str:
                    start_price = bar["close"]
                    break
            if start_price is None and history:
                start_price = history[0]["close"]

            if start_price:
                start_value += h["shares"] * start_price
                tickers_found += 1

        if start_value <= 0 or tickers_found == 0:
            return {"dollar": 0.0, "pct": 0.0}

        pnl_dollar = current_value - start_value
        pnl_pct = (pnl_dollar / start_value) * 100

        return {"dollar": round(pnl_dollar, 2), "pct": round(pnl_pct, 2)}

    except Exception as e:
        logger.warning("Period P&L computation failed: %s", e)
        return {"dollar": 0.0, "pct": 0.0}


# ─── 2. Asset Allocation ──────────────────────────────────────────────


def _compute_asset_allocation(holdings: list[dict], quotes: dict, cash_balance: float) -> dict:
    """Group holdings by asset_type and compute allocation weights."""
    buckets = {}
    total = 0.0

    for h in holdings:
        asset_type = h.get("asset_type", "equity")
        q = quotes.get(h["ticker"], {})
        price = q.get("current_price")
        value = h["shares"] * price if price else 0.0
        total += value

        if asset_type not in buckets:
            buckets[asset_type] = {"value": 0.0, "count": 0}
        buckets[asset_type]["value"] += value
        buckets[asset_type]["count"] += 1

    # Add cash bucket
    if cash_balance > 0:
        total += cash_balance
        if "cash" not in buckets:
            buckets["cash"] = {"value": 0.0, "count": 0}
        buckets["cash"]["value"] += cash_balance

    # Compute weights
    result = []
    for asset_type, data in sorted(buckets.items(), key=lambda x: -x[1]["value"]):
        weight = (data["value"] / total * 100) if total > 0 else 0
        result.append({
            "type": asset_type,
            "value": round(data["value"], 2),
            "weight_pct": round(weight, 1),
            "count": data["count"],
        })

    return {"buckets": result, "total": round(total, 2)}


# ─── 3. Advanced Risk Metrics (Sharpe, Max Drawdown, VaR) ────────────


def _compute_advanced_risk_metrics(holdings: list[dict], quotes: dict) -> dict:
    """Portfolio-level Sharpe ratio, max drawdown, and Value at Risk."""
    result = {
        "sharpe": {"value": None, "interpretation": "Insufficient data"},
        "max_drawdown": {"value_pct": None, "peak_date": None, "trough_date": None},
        "var_95": {"dollar": None, "pct": None},
    }

    tickers = [h["ticker"] for h in holdings[:_MAX_TICKERS_HISTORY]]
    if not tickers:
        return result

    try:
        # Build portfolio value time series from 1y daily history
        portfolio_series = _build_portfolio_value_series(holdings[:_MAX_TICKERS_HISTORY], 365)
        if portfolio_series is None or len(portfolio_series) < 30:
            return result

        values = portfolio_series["value"].values
        dates = portfolio_series["date"].values

        # Daily returns
        daily_returns = np.diff(values) / values[:-1]
        daily_returns = daily_returns[np.isfinite(daily_returns)]
        if len(daily_returns) < 20:
            return result

        # Risk-free rate
        rf = fetch_risk_free_rate()
        if rf is None:
            rf = 0.043
        daily_rf = rf / 252

        # Sharpe Ratio (annualized)
        excess_returns = daily_returns - daily_rf
        ann_mean = float(np.mean(excess_returns) * 252)
        ann_std = float(np.std(daily_returns, ddof=1) * np.sqrt(252))
        sharpe = ann_mean / ann_std if ann_std > 0 else 0.0

        sharpe_interp = (
            "Excellent risk-adjusted return" if sharpe > 1.0
            else "Good risk-adjusted return" if sharpe > 0.5
            else "Moderate risk-adjusted return" if sharpe > 0
            else "Poor risk-adjusted return"
        )
        result["sharpe"] = {"value": round(sharpe, 3), "interpretation": sharpe_interp}

        # Max Drawdown
        cummax = np.maximum.accumulate(values)
        drawdowns = (values - cummax) / cummax
        max_dd_idx = np.argmin(drawdowns)
        peak_idx = np.argmax(values[:max_dd_idx + 1]) if max_dd_idx > 0 else 0

        result["max_drawdown"] = {
            "value_pct": round(float(drawdowns[max_dd_idx]) * 100, 2),
            "peak_date": str(dates[peak_idx])[:10] if peak_idx < len(dates) else None,
            "trough_date": str(dates[max_dd_idx])[:10] if max_dd_idx < len(dates) else None,
        }

        # VaR (95%, 1-day) — Historical simulation
        current_value = float(values[-1])
        var_pct = float(np.percentile(daily_returns, 5))
        var_dollar = current_value * abs(var_pct)

        result["var_95"] = {
            "dollar": round(var_dollar, 2),
            "pct": round(abs(var_pct) * 100, 2),
        }

    except Exception as e:
        logger.warning("Advanced risk metrics failed: %s", e)

    return result


def _build_portfolio_value_series(holdings: list[dict], days: int = 365) -> pd.DataFrame | None:
    """Build a daily portfolio value time series from individual ticker histories."""
    try:
        all_series = {}
        for h in holdings:
            history = fetch_history_days(h["ticker"], days=days)
            if not history:
                continue
            series = pd.Series(
                [bar["close"] * h["shares"] for bar in history],
                index=pd.to_datetime([bar["date"] for bar in history]),
                name=h["ticker"],
            )
            all_series[h["ticker"]] = series

        if not all_series:
            return None

        df = pd.DataFrame(all_series)
        # Forward-fill missing dates (some tickers may have different trading days)
        df = df.ffill().bfill()
        portfolio_value = df.sum(axis=1)

        result = pd.DataFrame({
            "date": portfolio_value.index,
            "value": portfolio_value.values,
        })
        return result.dropna()

    except Exception as e:
        logger.warning("Failed to build portfolio value series: %s", e)
        return None


# ─── 4. Benchmark Comparison ─────────────────────────────────────────


def _compute_benchmark_comparison(holdings: list[dict], quotes: dict, benchmark_ticker: str, days: int = 365) -> dict:
    """Compare portfolio performance vs benchmark."""
    result = {
        "benchmark_ticker": benchmark_ticker,
        "dates": [],
        "portfolio_index": [],
        "benchmark_index": [],
        "portfolio_return_pct": None,
        "benchmark_return_pct": None,
        "excess_return_pct": None,
    }

    try:
        # Portfolio value series
        portfolio_series = _build_portfolio_value_series(holdings[:_MAX_TICKERS_HISTORY], days)
        if portfolio_series is None or len(portfolio_series) < 10:
            return result

        # Benchmark history
        benchmark_history = fetch_history_days(benchmark_ticker, days=days)
        if not benchmark_history or len(benchmark_history) < 10:
            return result

        bench_series = pd.Series(
            [bar["close"] for bar in benchmark_history],
            index=pd.to_datetime([bar["date"] for bar in benchmark_history]),
            name="benchmark",
        )

        # Align dates
        port_series = pd.Series(
            portfolio_series["value"].values,
            index=portfolio_series["date"],
        )

        # Merge on common dates
        merged = pd.DataFrame({"portfolio": port_series, "benchmark": bench_series}).dropna()
        if len(merged) < 10:
            return result

        # Normalize to 100
        port_start = float(merged["portfolio"].iloc[0])
        bench_start = float(merged["benchmark"].iloc[0])
        if port_start <= 0 or bench_start <= 0:
            return result

        port_normalized = (merged["portfolio"] / port_start * 100).round(2)
        bench_normalized = (merged["benchmark"] / bench_start * 100).round(2)

        port_return = float((merged["portfolio"].iloc[-1] / port_start - 1) * 100)
        bench_return = float((merged["benchmark"].iloc[-1] / bench_start - 1) * 100)

        result["dates"] = [d.strftime("%Y-%m-%d") for d in merged.index]
        result["portfolio_index"] = port_normalized.tolist()
        result["benchmark_index"] = bench_normalized.tolist()
        result["portfolio_return_pct"] = round(port_return, 2)
        result["benchmark_return_pct"] = round(bench_return, 2)
        result["excess_return_pct"] = round(port_return - bench_return, 2)

    except Exception as e:
        logger.warning("Benchmark comparison failed: %s", e)

    return result


# ─── 5. Performance Attribution ───────────────────────────────────────


def _compute_performance_attribution(holdings: list[dict], quotes: dict) -> list[dict]:
    """Compute how much each holding contributed to total portfolio return."""
    total_value = 0.0
    total_cost = 0.0

    enriched = []
    for h in holdings:
        q = quotes.get(h["ticker"], {})
        price = q.get("current_price")
        cost = h.get("cost_basis")
        if not price:
            continue
        value = h["shares"] * price
        invested = h["shares"] * cost if cost else value
        total_value += value
        total_cost += invested
        enriched.append({
            "ticker": h["ticker"],
            "value": value,
            "invested": invested,
            "return_pct": ((price - cost) / cost * 100) if cost and cost > 0 else 0.0,
        })

    if total_value <= 0:
        return []

    result = []
    for e in enriched:
        weight = e["value"] / total_value
        contribution = weight * e["return_pct"] / 100
        result.append({
            "ticker": e["ticker"],
            "weight_pct": round(weight * 100, 1),
            "return_pct": round(e["return_pct"], 2),
            "contribution_pct": round(contribution * 100, 2),
            "market_value": round(e["value"], 2),
        })

    result.sort(key=lambda x: abs(x["contribution_pct"]), reverse=True)
    return result


# ─── 6. Drift Alerts ─────────────────────────────────────────────────


def _compute_drift_alerts(holdings: list[dict], quotes: dict, target_allocation: dict | None, cash_balance: float) -> dict:
    """Compare current asset allocation to target and flag drifts."""
    if not target_allocation:
        return {"current": {}, "target": {}, "drifts": [], "has_target": False}

    # Compute current allocation
    alloc = _compute_asset_allocation(holdings, quotes, cash_balance)
    current = {}
    for bucket in alloc["buckets"]:
        current[bucket["type"]] = bucket["weight_pct"]

    # Check for drift
    drifts = []
    all_types = set(list(target_allocation.keys()) + list(current.keys()))
    for asset_type in all_types:
        current_pct = current.get(asset_type, 0.0)
        target_pct = target_allocation.get(asset_type, 0.0)
        drift_pct = current_pct - target_pct

        if abs(drift_pct) > 5:
            severity = "high" if abs(drift_pct) > 15 else "medium" if abs(drift_pct) > 10 else "low"
            drifts.append({
                "asset_type": asset_type,
                "current_pct": round(current_pct, 1),
                "target_pct": round(target_pct, 1),
                "drift_pct": round(drift_pct, 1),
                "severity": severity,
                "message": f"{asset_type.replace('_', ' ').title()} is {'over' if drift_pct > 0 else 'under'}weight by {abs(drift_pct):.1f}%",
            })

    drifts.sort(key=lambda x: abs(x["drift_pct"]), reverse=True)

    return {
        "current": {k: round(v, 1) for k, v in current.items()},
        "target": target_allocation,
        "drifts": drifts,
        "has_target": True,
    }


# ─── 7. Cash Metrics ─────────────────────────────────────────────────


def _compute_cash_metrics(holdings: list[dict], quotes: dict, cash_balance: float) -> dict:
    """Compute cash position and deployment rate."""
    total_invested = 0.0
    for h in holdings:
        q = quotes.get(h["ticker"], {})
        price = q.get("current_price")
        if price:
            total_invested += h["shares"] * price

    total_assets = total_invested + cash_balance
    deployment_rate = (total_invested / total_assets * 100) if total_assets > 0 else 0.0

    return {
        "cash_balance": round(cash_balance, 2),
        "total_invested": round(total_invested, 2),
        "total_assets": round(total_assets, 2),
        "deployment_rate_pct": round(deployment_rate, 1),
    }
