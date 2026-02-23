import logging
import asyncio
from app.services.cache_service import cache
from app.config import get_settings
from app.data_sources import yahoo_finance, polymarket, news_api, fred
from app.data_sources import technical_analysis, fundamentals, options_data
from app.data_sources import massive_api
from app.services import risk_service

logger = logging.getLogger(__name__)


def get_quotes_for_tickers(tickers: list[str]) -> dict:
    """Fetch stock quotes, using cache where available.

    Uses Massive as primary source, falls back to yfinance.
    """
    settings = get_settings()
    uncached = []
    result = {}

    for t in tickers:
        cached = cache.get(f"quote:{t}")
        if cached:
            result[t] = cached
        else:
            uncached.append(t)

    if uncached:
        # Try Massive first
        fresh = {}
        if settings.MASSIVE_API_KEY:
            fresh = massive_api.fetch_quotes(uncached)

        # Fall back to yfinance for any tickers that Massive missed
        missing = [
            t for t in uncached
            if t not in fresh or not fresh[t].get("current_price")
        ]
        if missing:
            yf_data = yahoo_finance.fetch_quotes(missing)
            fresh.update(yf_data)

        for t, data in fresh.items():
            cache.set(f"quote:{t}", data, settings.STOCK_CACHE_TTL)
            result[t] = data

    return result


async def get_news(tickers: list[str] | None = None) -> list[dict]:
    """Fetch financial news, cached."""
    settings = get_settings()
    cache_key = f"news:{','.join(sorted(tickers)) if tickers else 'general'}"
    cached = cache.get(cache_key)
    if cached:
        return cached

    articles = await news_api.fetch_financial_news(tickers)
    cache.set(cache_key, articles, settings.NEWS_CACHE_TTL)
    return articles


async def get_predictions() -> list[dict]:
    """Fetch Polymarket prediction events, cached."""
    settings = get_settings()
    cached = cache.get("polymarket:events")
    if cached:
        return cached

    events = await polymarket.fetch_events(limit=20)
    cache.set("polymarket:events", events, settings.POLYMARKET_CACHE_TTL)
    return events


def get_economic_indicators() -> dict:
    """Fetch FRED economic indicators, cached."""
    settings = get_settings()
    cached = cache.get("fred:indicators")
    if cached:
        return cached

    indicators = fred.fetch_indicators()
    if indicators:
        cache.set("fred:indicators", indicators, settings.FRED_CACHE_TTL)
    return indicators


def get_technical_indicators(tickers: list[str]) -> dict:
    """Fetch technical analysis indicators, cached."""
    settings = get_settings()
    cache_key = f"technicals:{','.join(sorted(tickers))}"
    cached_data = cache.get(cache_key)
    if cached_data:
        return cached_data

    result = technical_analysis.compute_all_technicals(tickers)
    cache.set(cache_key, result, settings.TECHNICAL_CACHE_TTL)
    return result


def get_fundamentals(tickers: list[str]) -> dict:
    """Fetch fundamental metrics, cached (1hr TTL)."""
    settings = get_settings()
    cache_key = f"fundamentals:{','.join(sorted(tickers))}"
    cached_data = cache.get(cache_key)
    if cached_data:
        return cached_data

    result = fundamentals.fetch_fundamentals(tickers)
    cache.set(cache_key, result, settings.FUNDAMENTALS_CACHE_TTL)
    return result


def get_options_data(tickers: list[str]) -> dict:
    """Fetch options chain data, cached.

    Uses Massive as primary source, falls back to yfinance.
    """
    settings = get_settings()
    cache_key = f"options:{','.join(sorted(tickers))}"
    cached_data = cache.get(cache_key)
    if cached_data:
        return cached_data

    result = {}
    if settings.MASSIVE_API_KEY:
        result = massive_api.fetch_options_chain(tickers)

    # Fall back to yfinance for tickers Massive missed
    missing = [
        t for t in tickers
        if t not in result or not result[t].get("has_options")
    ]
    if missing:
        yf_options = options_data.fetch_options_data(missing)
        result.update(yf_options)

    cache.set(cache_key, result, settings.OPTIONS_CACHE_TTL)
    return result


def get_portfolio_risk(holdings: list[dict], quotes: dict) -> dict:
    """Compute portfolio risk metrics, cached."""
    settings = get_settings()
    tickers = sorted([h["ticker"] for h in holdings])
    cache_key = f"risk:{','.join(tickers)}"
    cached_data = cache.get(cache_key)
    if cached_data:
        return cached_data

    result = risk_service.compute_portfolio_risk(holdings, quotes)
    cache.set(cache_key, result, settings.RISK_CACHE_TTL)
    return result


async def get_full_market_context(tickers: list[str], holdings: list[dict] | None = None) -> dict:
    """Fetch all market data sources for analysis context."""
    loop = asyncio.get_event_loop()

    # Core data (always needed)
    quotes_future = loop.run_in_executor(None, get_quotes_for_tickers, tickers)
    economic_future = loop.run_in_executor(None, get_economic_indicators)
    news_future = get_news(tickers)
    predictions_future = get_predictions()

    # Advanced data
    technicals_future = loop.run_in_executor(None, get_technical_indicators, tickers)
    fundamentals_future = loop.run_in_executor(None, get_fundamentals, tickers)
    options_future = loop.run_in_executor(None, get_options_data, tickers)

    quotes, economic, articles, predictions, technicals, fundas, options = await asyncio.gather(
        quotes_future, economic_future, news_future, predictions_future,
        technicals_future, fundamentals_future, options_future,
    )

    context = {
        "quotes": quotes,
        "news": articles,
        "predictions": predictions,
        "economic": economic,
        "technicals": technicals,
        "fundamentals": fundas,
        "options": options,
    }

    # Risk metrics need quotes + holdings
    if holdings:
        risk = await loop.run_in_executor(None, get_portfolio_risk, holdings, quotes)
        context["risk"] = risk
    else:
        context["risk"] = {}

    return context
