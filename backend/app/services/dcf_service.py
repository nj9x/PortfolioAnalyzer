import json
import logging
from sqlalchemy.orm import Session

from app.data_sources.massive import fetch_info, fetch_financial_statements, fetch_ticker_overview, fetch_ratios
from app.data_sources.fred import fetch_risk_free_rate
from app.models.dcf_valuation import DCFValuation
from app.schemas.dcf_valuation import DCFRunRequest, WACCInputs

logger = logging.getLogger(__name__)


# ─── Fetch financials for ticker ─────────────────────────────────────


def fetch_dcf_financials(ticker: str) -> dict:
    """Gather all data needed to pre-fill the DCF form for a given ticker."""
    info = fetch_info(ticker)
    financials = fetch_financial_statements(ticker)
    overview = fetch_ticker_overview(ticker)
    ratios = fetch_ratios(ticker)
    risk_free_rate = fetch_risk_free_rate() or 0.042

    free_cashflow = info.get("freeCashflow") or financials.get("free_cashflow")
    total_debt = info.get("totalDebt") or financials.get("total_debt") or 0
    total_cash = info.get("totalCash") or financials.get("total_cash") or 0
    shares_outstanding = info.get("sharesOutstanding") or overview.get("shares_outstanding")
    beta = info.get("beta") or 1.0
    market_cap = info.get("marketCap") or overview.get("market_cap")
    ebitda = info.get("ebitda")
    current_price = info.get("currentPrice") or info.get("regularMarketPrice")

    wacc_inputs = _compute_wacc_inputs(
        beta=beta,
        total_debt=total_debt,
        market_cap=market_cap,
        risk_free_rate=risk_free_rate,
    )
    suggested_wacc = _calculate_wacc(wacc_inputs)

    return {
        "ticker": ticker.upper(),
        "company_name": info.get("longName") or info.get("shortName") or overview.get("name"),
        "current_price": current_price,
        "free_cashflow": free_cashflow,
        "revenue": None,  # populated from income statement if needed
        "ebitda": ebitda,
        "net_income": info.get("netIncomeToCommon") or financials.get("net_income"),
        "total_debt": total_debt,
        "total_cash": total_cash,
        "shares_outstanding": shares_outstanding,
        "beta": beta,
        "market_cap": market_cap,
        "enterprise_value": info.get("enterpriseValue") or ratios.get("enterprise_value"),
        "revenue_growth": info.get("revenueGrowth"),
        "earnings_growth": info.get("earningsGrowth"),
        "profit_margins": info.get("profitMargins"),
        "debt_to_equity": info.get("debtToEquity"),
        "ev_to_ebitda": ratios.get("ev_to_ebitda"),
        "risk_free_rate": risk_free_rate,
        "suggested_wacc": suggested_wacc,
        "wacc_inputs": {
            "risk_free_rate": wacc_inputs.risk_free_rate,
            "equity_risk_premium": wacc_inputs.equity_risk_premium,
            "beta": wacc_inputs.beta,
            "cost_of_debt": wacc_inputs.cost_of_debt,
            "tax_rate": wacc_inputs.tax_rate,
            "debt_weight": wacc_inputs.debt_weight,
            "equity_weight": wacc_inputs.equity_weight,
        },
    }


# ─── WACC calculation ────────────────────────────────────────────────


def _compute_wacc_inputs(
    beta: float,
    total_debt: float,
    market_cap: float | None,
    risk_free_rate: float,
) -> WACCInputs:
    """Derive WACC component inputs from available financial data."""
    equity_risk_premium = 0.055
    cost_of_debt = risk_free_rate + 0.015
    tax_rate = 0.21

    if market_cap and market_cap > 0:
        total_capital = market_cap + (total_debt or 0)
        debt_weight = (total_debt or 0) / total_capital if total_capital > 0 else 0
        equity_weight = 1.0 - debt_weight
    else:
        debt_weight = 0.0
        equity_weight = 1.0

    return WACCInputs(
        risk_free_rate=round(risk_free_rate, 4),
        equity_risk_premium=equity_risk_premium,
        beta=round(beta, 2),
        cost_of_debt=round(cost_of_debt, 4),
        tax_rate=tax_rate,
        debt_weight=round(debt_weight, 4),
        equity_weight=round(equity_weight, 4),
    )


def _calculate_wacc(inputs: WACCInputs) -> float:
    """WACC = E/(D+E) * Ke + D/(D+E) * Kd * (1 - t)"""
    cost_of_equity = inputs.risk_free_rate + inputs.beta * inputs.equity_risk_premium
    after_tax_cost_of_debt = inputs.cost_of_debt * (1 - inputs.tax_rate)
    wacc = (
        inputs.equity_weight * cost_of_equity
        + inputs.debt_weight * after_tax_cost_of_debt
    )
    return round(wacc, 4)


# ─── Core DCF calculation ────────────────────────────────────────────


def run_dcf_calculation(db: Session, request: DCFRunRequest) -> DCFValuation:
    """Execute the full DCF model and persist the result."""
    # Determine discount rate
    if request.discount_rate is not None:
        discount_rate = request.discount_rate
        wacc_inputs = request.wacc_inputs or WACCInputs()
    elif request.wacc_inputs is not None:
        wacc_inputs = request.wacc_inputs
        discount_rate = _calculate_wacc(wacc_inputs)
    else:
        wacc_inputs = WACCInputs()
        discount_rate = _calculate_wacc(wacc_inputs)

    # Phase 1: Project FCFs
    projected_fcfs = []
    current_fcf = request.base_fcf
    total_pv_fcfs = 0.0

    for year in range(1, request.projection_years + 1):
        current_fcf = current_fcf * (1 + request.growth_rate_phase1)
        discount_factor = (1 + discount_rate) ** year
        pv_fcf = current_fcf / discount_factor
        total_pv_fcfs += pv_fcf
        projected_fcfs.append(
            {
                "year": year,
                "fcf": round(current_fcf, 2),
                "pv_fcf": round(pv_fcf, 2),
                "growth_rate": round(request.growth_rate_phase1, 4),
            }
        )

    # Phase 2: Terminal value
    last_projected_fcf = current_fcf

    if request.terminal_method == "gordon":
        terminal_fcf = last_projected_fcf * (1 + request.growth_rate_phase2)
        effective_tg = min(request.growth_rate_phase2, discount_rate - 0.005)
        terminal_value = (
            terminal_fcf / (discount_rate - effective_tg)
            if discount_rate > effective_tg
            else 0
        )
    else:
        ebitda = request.latest_ebitda or last_projected_fcf
        terminal_value = ebitda * (request.terminal_multiple or 12.0)

    pv_terminal_value = terminal_value / (
        (1 + discount_rate) ** request.projection_years
    )

    # Enterprise Value → Equity Bridge
    enterprise_value = total_pv_fcfs + pv_terminal_value
    equity_value = enterprise_value - (request.total_debt or 0) + (request.total_cash or 0)
    intrinsic_value = (
        equity_value / request.shares_outstanding
        if request.shares_outstanding > 0
        else 0
    )

    # Upside / verdict
    upside_downside_pct = None
    margin_of_safety = None
    valuation_verdict = "FAIR_VALUE"

    if request.current_price and request.current_price > 0:
        upside_downside_pct = round(
            ((intrinsic_value - request.current_price) / request.current_price) * 100,
            2,
        )
        if intrinsic_value > 0:
            margin_of_safety = round(
                ((intrinsic_value - request.current_price) / intrinsic_value) * 100,
                2,
            )
        if upside_downside_pct > 20:
            valuation_verdict = "UNDERVALUED"
        elif upside_downside_pct < -20:
            valuation_verdict = "OVERVALUED"

    # Sensitivity analysis
    sensitivity_table = _build_sensitivity_table(
        base_fcf=request.base_fcf,
        projection_years=request.projection_years,
        growth_rate_phase1=request.growth_rate_phase1,
        base_wacc=discount_rate,
        base_terminal_growth=request.growth_rate_phase2,
        terminal_method=request.terminal_method,
        terminal_multiple=request.terminal_multiple,
        latest_ebitda=request.latest_ebitda,
        total_debt=request.total_debt,
        total_cash=request.total_cash,
        shares_outstanding=request.shares_outstanding,
    )

    # Persist
    valuation = DCFValuation(
        ticker=request.ticker,
        company_name=request.company_name,
        base_fcf=request.base_fcf,
        projection_years=request.projection_years,
        growth_rate_phase1=request.growth_rate_phase1,
        growth_rate_phase2=request.growth_rate_phase2,
        discount_rate=discount_rate,
        terminal_method=request.terminal_method,
        terminal_multiple=request.terminal_multiple,
        risk_free_rate=wacc_inputs.risk_free_rate,
        equity_risk_premium=wacc_inputs.equity_risk_premium,
        beta=wacc_inputs.beta,
        cost_of_equity=wacc_inputs.risk_free_rate
        + wacc_inputs.beta * wacc_inputs.equity_risk_premium,
        cost_of_debt=wacc_inputs.cost_of_debt,
        tax_rate=wacc_inputs.tax_rate,
        debt_weight=wacc_inputs.debt_weight,
        equity_weight=wacc_inputs.equity_weight,
        total_debt=request.total_debt,
        total_cash=request.total_cash,
        shares_outstanding=request.shares_outstanding,
        current_price=request.current_price,
        enterprise_value=round(enterprise_value, 2),
        equity_value=round(equity_value, 2),
        intrinsic_value_per_share=round(intrinsic_value, 2),
        upside_downside_pct=upside_downside_pct,
        margin_of_safety=margin_of_safety,
        terminal_value=round(terminal_value, 2),
        projected_fcfs=json.dumps(projected_fcfs),
        sensitivity_table=json.dumps(sensitivity_table),
        valuation_verdict=valuation_verdict,
    )

    if request.save:
        db.add(valuation)
        db.commit()
        db.refresh(valuation)

    return valuation


def _build_sensitivity_table(
    base_fcf,
    projection_years,
    growth_rate_phase1,
    base_wacc,
    base_terminal_growth,
    terminal_method,
    terminal_multiple,
    latest_ebitda,
    total_debt,
    total_cash,
    shares_outstanding,
) -> list[list[dict]]:
    """Build a 5x5 sensitivity grid: WACC (rows) x terminal growth (columns)."""
    wacc_steps = [base_wacc + d / 100 for d in [-2, -1, 0, 1, 2]]
    tg_steps = [base_terminal_growth + d / 100 for d in [-1.0, -0.5, 0, 0.5, 1.0]]

    table = []
    for wacc in wacc_steps:
        row = []
        for tg in tg_steps:
            iv = _quick_dcf(
                base_fcf,
                projection_years,
                growth_rate_phase1,
                wacc,
                tg,
                terminal_method,
                terminal_multiple,
                latest_ebitda,
                total_debt,
                total_cash,
                shares_outstanding,
            )
            row.append(
                {
                    "wacc": round(wacc, 4),
                    "terminal_growth": round(tg, 4),
                    "intrinsic_value": round(iv, 2),
                }
            )
        table.append(row)
    return table


def _quick_dcf(
    base_fcf, years, g1, wacc, g2, terminal_method, terminal_multiple,
    latest_ebitda, total_debt, total_cash, shares_outstanding,
) -> float:
    """Lightweight DCF for sensitivity table cells."""
    if wacc <= 0:
        return 0
    fcf = base_fcf
    total_pv = 0.0
    for y in range(1, years + 1):
        fcf = fcf * (1 + g1)
        total_pv += fcf / ((1 + wacc) ** y)

    if terminal_method == "gordon":
        effective_g2 = min(g2, wacc - 0.005)
        terminal_fcf = fcf * (1 + effective_g2)
        tv = terminal_fcf / (wacc - effective_g2) if wacc > effective_g2 else 0
    else:
        ebitda = latest_ebitda or fcf
        tv = ebitda * (terminal_multiple or 12.0)

    pv_tv = tv / ((1 + wacc) ** years)
    ev = total_pv + pv_tv
    equity = ev - (total_debt or 0) + (total_cash or 0)
    return equity / shares_outstanding if shares_outstanding > 0 else 0


# ─── CRUD ─────────────────────────────────────────────────────────────


def get_valuation_by_id(db: Session, valuation_id: int) -> DCFValuation | None:
    return (
        db.query(DCFValuation).filter(DCFValuation.id == valuation_id).first()
    )


def get_valuation_history(
    db: Session, ticker: str | None = None, limit: int = 50
) -> list[DCFValuation]:
    query = db.query(DCFValuation)
    if ticker:
        query = query.filter(DCFValuation.ticker == ticker.upper())
    return query.order_by(DCFValuation.created_at.desc()).limit(limit).all()


def delete_valuation(db: Session, valuation_id: int) -> bool:
    record = (
        db.query(DCFValuation).filter(DCFValuation.id == valuation_id).first()
    )
    if not record:
        return False
    db.delete(record)
    db.commit()
    return True
