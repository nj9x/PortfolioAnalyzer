from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.config import get_settings
from app.database import get_db
from app.services import market_data_service, portfolio_service
from app.services.cache_service import cache

router = APIRouter()


def _resolve_tickers(portfolio_id: int | None, tickers: str | None, db: Session) -> list[str]:
    """Resolve ticker list from portfolio or comma-separated string."""
    if portfolio_id:
        portfolio = portfolio_service.get_portfolio(db, portfolio_id)
        if not portfolio:
            raise HTTPException(status_code=404, detail="Portfolio not found")
        return [h.ticker for h in portfolio.holdings]
    elif tickers:
        return [t.strip().upper() for t in tickers.split(",")]
    else:
        raise HTTPException(status_code=400, detail="Provide portfolio_id or tickers")


@router.get("/quotes")
async def get_quotes(
    portfolio_id: int | None = Query(None, description="Filter quotes by portfolio holdings"),
    tickers: str | None = Query(None, description="Comma-separated tickers"),
    db: Session = Depends(get_db),
):
    """Get stock quotes for portfolio holdings or specific tickers."""
    ticker_list = _resolve_tickers(portfolio_id, tickers, db)
    quotes = market_data_service.get_quotes_for_tickers(ticker_list)
    return {"quotes": quotes}


@router.get("/news")
async def get_news(
    portfolio_id: int | None = Query(None),
    db: Session = Depends(get_db),
):
    """Get financial news, optionally filtered by portfolio holdings."""
    tickers = None
    if portfolio_id:
        portfolio = portfolio_service.get_portfolio(db, portfolio_id)
        if portfolio:
            tickers = [h.ticker for h in portfolio.holdings]

    articles = await market_data_service.get_news(tickers)
    return {"articles": articles}


@router.get("/predictions")
async def get_predictions():
    """Get Polymarket prediction market events."""
    events = await market_data_service.get_predictions()
    return {"events": events}


@router.get("/economic")
def get_economic_indicators():
    """Get key FRED economic indicators."""
    indicators = market_data_service.get_economic_indicators()
    return {"indicators": indicators}


@router.get("/technicals")
def get_technicals(
    portfolio_id: int | None = Query(None),
    tickers: str | None = Query(None),
    db: Session = Depends(get_db),
):
    """Get technical analysis indicators (RSI, MACD, Bollinger, MAs, etc.)."""
    ticker_list = _resolve_tickers(portfolio_id, tickers, db)
    data = market_data_service.get_technical_indicators(ticker_list)
    return {"technicals": data}


@router.get("/fundamentals")
def get_fundamentals(
    portfolio_id: int | None = Query(None),
    tickers: str | None = Query(None),
    db: Session = Depends(get_db),
):
    """Get fundamental screening metrics (P/E, ROIC, valuation flags, etc.)."""
    ticker_list = _resolve_tickers(portfolio_id, tickers, db)
    data = market_data_service.get_fundamentals(ticker_list)
    return {"fundamentals": data}


@router.get("/options")
def get_options(
    portfolio_id: int | None = Query(None),
    tickers: str | None = Query(None),
    db: Session = Depends(get_db),
):
    """Get ATM options data with Greeks and IV/HV comparison."""
    ticker_list = _resolve_tickers(portfolio_id, tickers, db)
    data = market_data_service.get_options_data(ticker_list)
    return {"options": data}


@router.get("/risk")
def get_portfolio_risk(
    portfolio_id: int = Query(..., description="Portfolio ID for risk analysis"),
    db: Session = Depends(get_db),
):
    """Get portfolio-level risk metrics (beta, sector, correlation, drawdowns)."""
    portfolio = portfolio_service.get_portfolio(db, portfolio_id)
    if not portfolio:
        raise HTTPException(status_code=404, detail="Portfolio not found")

    holdings = [
        {"ticker": h.ticker, "shares": h.shares, "cost_basis": h.cost_basis}
        for h in portfolio.holdings
    ]
    tickers = [h.ticker for h in portfolio.holdings]
    quotes = market_data_service.get_quotes_for_tickers(tickers)
    data = market_data_service.get_portfolio_risk(holdings, quotes)
    return {"risk": data}


@router.get("/status")
def data_source_status():
    """Check status of all data sources — Massive API is the priority provider."""
    from app.data_sources.massive_client import is_available, get_api_status, validate_api
    settings = get_settings()
    return {
        "primary_source": "massive",
        "massive": {
            "available": is_available(),
            "status": get_api_status(),
            "key_configured": bool(settings.MASSIVE_API_KEY),
        },
        "supplemental": {
            "newsapi": {"key_configured": bool(settings.NEWS_API_KEY)},
            "fred": {"key_configured": bool(settings.FRED_API_KEY)},
            "polymarket": {"available": True},
        },
    }


@router.post("/refresh")
def refresh_cache():
    """Clear all cached market data to force fresh fetches from Massive."""
    from app.data_sources.massive_client import validate_api
    cache.clear()
    massive_status = validate_api()
    return {
        "status": "Cache cleared — fresh data will be fetched from Massive",
        "massive_api": massive_status,
    }
