import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.database import get_db
from app.config import get_settings
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


@router.get("/sparklines")
def get_sparklines(
    portfolio_id: int | None = Query(None),
    tickers: str | None = Query(None),
    days: int = Query(7, ge=1, le=30),
    db: Session = Depends(get_db),
):
    """Get mini sparkline data (last N daily closes) for portfolio or tickers."""
    ticker_list = _resolve_tickers(portfolio_id, tickers, db)
    data = market_data_service.get_sparklines(ticker_list, days=days)
    return {"sparklines": data}


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


@router.get("/history")
def get_history(
    ticker: str = Query(..., description="Single ticker symbol"),
    period: str = Query("1y", description="Period: 1mo, 3mo, 6mo, 1y, 2y, 5y"),
):
    """Get historical OHLCV bars for a single ticker."""
    from app.data_sources.massive import fetch_history
    data = fetch_history(ticker.strip().upper(), period=period)
    return {"ticker": ticker.upper(), "period": period, "bars": data}


@router.get("/ticker-risk")
def get_ticker_risk(
    ticker: str = Query(..., description="Single ticker symbol for risk analysis"),
):
    """Get per-ticker risk metrics: alpha, beta, Sharpe ratio, Monte Carlo simulation."""
    ticker = ticker.strip().upper()

    cache_key = f"ticker_risk:{ticker}"
    cached = cache.get(cache_key)
    if cached:
        return {"risk": cached}

    from app.services.risk_service import compute_ticker_risk
    result = compute_ticker_risk(ticker)

    if "error" not in result:
        cache.set(cache_key, result, 300)

    return {"risk": result}


@router.post("/refresh")
def refresh_cache():
    """Clear all cached market data to force fresh fetches."""
    cache.clear()
    return {"status": "Cache cleared"}


@router.get("/debug")
def debug_api():
    """Diagnostic: test Massive API connectivity and key validity."""
    settings = get_settings()
    key = settings.MASSIVE_API_KEY
    result = {
        "key_configured": bool(key),
        "key_prefix": key[:8] + "..." if key else None,
    }

    if not key:
        result["error"] = "MASSIVE_API_KEY not set in environment"
        return result

    # Test with a simple AAPL snapshot call
    test_url = "https://api.massive.com/v2/snapshot/locale/us/markets/stocks/tickers/AAPL"
    try:
        resp = httpx.get(test_url, params={"apiKey": key}, timeout=10)
        result["status_code"] = resp.status_code
        result["response_preview"] = resp.text[:500]
        if resp.status_code == 200:
            data = resp.json()
            ticker_data = data.get("ticker", {})
            day = ticker_data.get("day", {})
            result["aapl_price"] = day.get("c")
            result["api_status"] = data.get("status")
            result["success"] = True
        else:
            result["success"] = False
    except Exception as e:
        result["success"] = False
        result["error"] = str(e)

    return result
