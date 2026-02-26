import logging
from typing import BinaryIO
from sqlalchemy.orm import Session
from app.models.portfolio import Portfolio, Holding
from app.schemas.portfolio import PortfolioCreate, PortfolioUpdate, HoldingCreate, HoldingUpdate
from app.utils.file_parser import parse_portfolio_file

logger = logging.getLogger(__name__)


def list_portfolios(db: Session) -> list[Portfolio]:
    return db.query(Portfolio).order_by(Portfolio.updated_at.desc()).all()


def get_portfolio(db: Session, portfolio_id: int) -> Portfolio | None:
    return db.query(Portfolio).filter(Portfolio.id == portfolio_id).first()


def create_portfolio(db: Session, data: PortfolioCreate) -> Portfolio:
    portfolio = Portfolio(
        name=data.name,
        description=data.description,
        client_name=data.client_name,
        category=data.category or "balanced",
    )
    db.add(portfolio)
    db.commit()
    db.refresh(portfolio)
    return portfolio


def update_portfolio(db: Session, portfolio_id: int, data: PortfolioUpdate) -> Portfolio | None:
    portfolio = get_portfolio(db, portfolio_id)
    if not portfolio:
        return None
    if data.name is not None:
        portfolio.name = data.name
    if data.description is not None:
        portfolio.description = data.description
    if data.client_name is not None:
        portfolio.client_name = data.client_name
    if data.category is not None:
        portfolio.category = data.category
    db.commit()
    db.refresh(portfolio)
    return portfolio


def delete_portfolio(db: Session, portfolio_id: int) -> bool:
    portfolio = get_portfolio(db, portfolio_id)
    if not portfolio:
        return False
    db.delete(portfolio)
    db.commit()
    return True


def add_holding(db: Session, portfolio_id: int, data: HoldingCreate) -> Holding | None:
    portfolio = get_portfolio(db, portfolio_id)
    if not portfolio:
        return None
    holding = Holding(
        portfolio_id=portfolio_id,
        ticker=data.ticker.upper().strip(),
        shares=data.shares,
        cost_basis=data.cost_basis,
        asset_type=data.asset_type,
        notes=data.notes,
    )
    db.add(holding)
    db.commit()
    db.refresh(holding)
    return holding


def update_holding(db: Session, holding_id: int, data: HoldingUpdate) -> Holding | None:
    holding = db.query(Holding).filter(Holding.id == holding_id).first()
    if not holding:
        return None
    if data.ticker is not None:
        holding.ticker = data.ticker.upper().strip()
    if data.shares is not None:
        holding.shares = data.shares
    if data.cost_basis is not None:
        holding.cost_basis = data.cost_basis
    if data.asset_type is not None:
        holding.asset_type = data.asset_type
    if data.notes is not None:
        holding.notes = data.notes
    db.commit()
    db.refresh(holding)
    return holding


def delete_holding(db: Session, holding_id: int) -> bool:
    holding = db.query(Holding).filter(Holding.id == holding_id).first()
    if not holding:
        return False
    db.delete(holding)
    db.commit()
    return True


def import_portfolio_from_file(
    db: Session,
    name: str,
    file: BinaryIO,
    filename: str,
    description: str | None = None,
    client_name: str | None = None,
    category: str | None = None,
) -> Portfolio:
    """Parse an uploaded file and create a portfolio with all holdings."""
    holdings_data = parse_portfolio_file(file, filename)
    portfolio = Portfolio(
        name=name,
        description=description,
        client_name=client_name,
        category=category or "balanced",
    )
    db.add(portfolio)
    db.flush()

    for h in holdings_data:
        holding = Holding(
            portfolio_id=portfolio.id,
            ticker=h["ticker"],
            shares=h["shares"],
            cost_basis=h.get("cost_basis"),
            asset_type=h.get("asset_type", "equity"),
            notes=h.get("notes"),
        )
        db.add(holding)

    db.commit()
    db.refresh(portfolio)
    return portfolio


# ─── Dashboard Overview ────────────────────────────────────────────────


def get_dashboard_overview(db: Session) -> dict:
    """Compute overview of all portfolios with performance metrics and alerts."""
    from app.services import market_data_service

    portfolios = list_portfolios(db)
    if not portfolios:
        return {"portfolios": [], "categories": {}, "total_aum": 0, "alert_summary": {}}

    # Collect all unique tickers across every portfolio
    all_tickers = list(set(h.ticker for p in portfolios for h in p.holdings))

    # Batch fetch market data (cached, graceful failures)
    quotes = {}
    technicals = {}
    fundas = {}

    if all_tickers:
        try:
            quotes = market_data_service.get_quotes_for_tickers(all_tickers)
        except Exception as e:
            logger.warning("Dashboard: failed to fetch quotes: %s", e)

        try:
            technicals = market_data_service.get_technical_indicators(all_tickers)
        except Exception as e:
            logger.warning("Dashboard: failed to fetch technicals: %s", e)

        try:
            fundas = market_data_service.get_fundamentals(all_tickers)
        except Exception as e:
            logger.warning("Dashboard: failed to fetch fundamentals: %s", e)

    # Build portfolio overviews
    results = []
    categories = {"conservative": [], "balanced": [], "high-growth": []}
    total_aum = 0.0
    alert_counts = {"trim_opportunity": 0, "entry_point": 0, "review_needed": 0}

    for p in portfolios:
        holdings_overview = []
        portfolio_value = 0.0
        portfolio_cost = 0.0
        weighted_day_change = 0.0

        for h in p.holdings:
            q = quotes.get(h.ticker, {})
            price = q.get("current_price")
            day_pct = q.get("day_change_pct")

            market_val = (h.shares * price) if price else 0.0
            gain_pct = None
            if price and h.cost_basis and h.cost_basis > 0:
                gain_pct = ((price - h.cost_basis) / h.cost_basis) * 100
            cost_total = (h.shares * h.cost_basis) if h.cost_basis else 0.0

            portfolio_value += market_val
            portfolio_cost += cost_total
            if day_pct and market_val:
                weighted_day_change += day_pct * market_val

            # Holding-level alerts
            alerts = []
            tech = technicals.get(h.ticker, {})
            funda = fundas.get(h.ticker, {})
            tech_signal = tech.get("overall_signal")
            val_flag = funda.get("valuation_flag")

            if gain_pct is not None and gain_pct > 10:
                alerts.append({
                    "ticker": h.ticker,
                    "alert_type": "trim_opportunity",
                    "message": f"{h.ticker} is up {gain_pct:.1f}% from cost basis. Consider trimming.",
                    "gain_loss_pct": round(gain_pct, 2),
                })
                alert_counts["trim_opportunity"] += 1

            if gain_pct is not None and gain_pct < -15:
                alerts.append({
                    "ticker": h.ticker,
                    "alert_type": "review_needed",
                    "message": f"{h.ticker} is down {abs(gain_pct):.1f}% from cost basis. Review position.",
                    "gain_loss_pct": round(gain_pct, 2),
                })
                alert_counts["review_needed"] += 1

            if tech_signal == "BULLISH" and val_flag == "UNDERVALUED_OPPORTUNITY":
                alerts.append({
                    "ticker": h.ticker,
                    "alert_type": "entry_point",
                    "message": f"{h.ticker} shows bullish technicals + undervalued. Good entry point.",
                    "technical_signal": tech_signal,
                    "valuation_flag": val_flag,
                })
                alert_counts["entry_point"] += 1

            holdings_overview.append({
                "ticker": h.ticker,
                "shares": h.shares,
                "cost_basis": h.cost_basis,
                "current_price": price,
                "market_value": round(market_val, 2) if market_val else 0,
                "gain_loss_pct": round(gain_pct, 2) if gain_pct is not None else None,
                "day_change_pct": day_pct,
                "alerts": alerts,
            })

        total_return_pct = None
        if portfolio_cost > 0:
            total_return_pct = ((portfolio_value - portfolio_cost) / portfolio_cost) * 100

        avg_day_change = None
        if portfolio_value > 0:
            avg_day_change = weighted_day_change / portfolio_value

        is_underperforming = total_return_pct is not None and total_return_pct < -5

        all_alerts = [a for ho in holdings_overview for a in ho["alerts"]]

        cat = p.category or "balanced"
        overview = {
            "id": p.id,
            "name": p.name,
            "client_name": p.client_name,
            "category": cat,
            "description": p.description,
            "holdings_count": len(p.holdings),
            "total_value": round(portfolio_value, 2),
            "total_cost": round(portfolio_cost, 2),
            "total_return_pct": round(total_return_pct, 2) if total_return_pct is not None else None,
            "day_change_pct": round(avg_day_change, 2) if avg_day_change is not None else None,
            "is_underperforming": is_underperforming,
            "underperformance_reason": f"Portfolio down {abs(total_return_pct):.1f}%" if is_underperforming else None,
            "holdings": holdings_overview,
            "alerts": all_alerts,
        }
        results.append(overview)
        total_aum += portfolio_value

        if cat in categories:
            categories[cat].append(p.id)

    return {
        "portfolios": results,
        "categories": categories,
        "total_aum": round(total_aum, 2),
        "alert_summary": alert_counts,
    }
