from typing import BinaryIO
from sqlalchemy.orm import Session
from app.models.portfolio import Portfolio, Holding
from app.schemas.portfolio import PortfolioCreate, PortfolioUpdate, HoldingCreate, HoldingUpdate
from app.utils.file_parser import parse_portfolio_file


def list_portfolios(db: Session) -> list[Portfolio]:
    return db.query(Portfolio).order_by(Portfolio.updated_at.desc()).all()


def get_portfolio(db: Session, portfolio_id: int) -> Portfolio | None:
    return db.query(Portfolio).filter(Portfolio.id == portfolio_id).first()


def create_portfolio(db: Session, data: PortfolioCreate) -> Portfolio:
    portfolio = Portfolio(name=data.name, description=data.description)
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
    db: Session, name: str, file: BinaryIO, filename: str, description: str | None = None
) -> Portfolio:
    """Parse an uploaded file and create a portfolio with all holdings."""
    holdings_data = parse_portfolio_file(file, filename)
    portfolio = Portfolio(name=name, description=description)
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
