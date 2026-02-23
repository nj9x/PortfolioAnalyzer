from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
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


@router.post("/refresh")
def refresh_cache():
    """Clear all cached market data to force fresh fetches."""
    cache.clear()
    return {"status": "Cache cleared"}


@router.get("/debug-massive")
def debug_massive(ticker: str = Query("AAPL", description="Ticker to test")):
    """Diagnostic endpoint: test Massive API connectivity and response shape."""
    from app.config import get_settings

    settings = get_settings()
    key = settings.MASSIVE_API_KEY
    result = {
        "api_key_configured": bool(key),
        "api_key_preview": f"{key[:4]}...{key[-4:]}" if key and len(key) >= 8 else "too_short_or_empty",
    }

    if not key:
        result["error"] = "MASSIVE_API_KEY is empty — check backend/.env file"
        return result

    try:
        from massive import RESTClient

        client = RESTClient(api_key=key)

        # Test 1: Snapshot
        try:
            snapshot = client.get_snapshot_ticker("stocks", ticker)
            result["snapshot_type"] = type(snapshot).__name__
            result["snapshot_ticker"] = getattr(snapshot, "ticker", None)
            result["snapshot_updated"] = getattr(snapshot, "updated", None)
            result["todays_change_percent"] = getattr(snapshot, "todays_change_percent", None)

            # Day bar
            day = snapshot.day if snapshot else None
            result["day"] = {
                "open": getattr(day, "open", None),
                "high": getattr(day, "high", None),
                "low": getattr(day, "low", None),
                "close": getattr(day, "close", None),
                "volume": getattr(day, "volume", None),
            } if day else None

            # Prev day bar
            prev = snapshot.prev_day if snapshot else None
            result["prev_day"] = {
                "open": getattr(prev, "open", None),
                "close": getattr(prev, "close", None),
                "volume": getattr(prev, "volume", None),
            } if prev else None

            # Last trade
            lt = snapshot.last_trade if snapshot else None
            result["last_trade"] = {
                "price": getattr(lt, "price", None),
                "size": getattr(lt, "size", None),
            } if lt else None

            # Last quote
            lq = snapshot.last_quote if snapshot else None
            result["last_quote"] = {
                "bid_price": getattr(lq, "bid_price", None),
                "ask_price": getattr(lq, "ask_price", None),
            } if lq else None

        except Exception as e:
            result["snapshot_error"] = f"{type(e).__name__}: {e}"

        # Test 2: Previous close (simpler endpoint)
        try:
            prev_close = client.get_previous_close_agg(ticker)
            result["prev_close_agg"] = {
                "type": type(prev_close).__name__,
                "open": getattr(prev_close, "open", None),
                "close": getattr(prev_close, "close", None),
            }
        except Exception as e:
            result["prev_close_error"] = f"{type(e).__name__}: {e}"

        # Test 3: Ticker details
        try:
            details = client.get_ticker_details(ticker)
            result["ticker_details"] = {
                "name": getattr(details, "name", None),
                "market_cap": getattr(details, "market_cap", None),
                "sic_description": getattr(details, "sic_description", None),
            }
        except Exception as e:
            result["details_error"] = f"{type(e).__name__}: {e}"

    except Exception as e:
        result["client_error"] = f"{type(e).__name__}: {e}"

    return result
