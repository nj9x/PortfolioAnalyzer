"""Market data orchestration — Massive API is the priority data source.

All real-time market data (quotes, history, fundamentals, options, technicals)
flows through Massive.  Supplemental sources (FRED, NewsAPI, Polymarket)
provide data that Massive does not cover.

Loading order in get_full_market_context():
  1. Massive-backed data first (quotes, technicals, fundamentals, options)
  2. Supplemental sources in parallel (news, economic indicators, predictions)
  3. Derived data last (risk metrics, which depend on quotes)
"""

import asyncio
import logging
from app.services.cache_service import cache
from app.config import get_settings
from app.data_sources import yahoo_finance, polymarket, news_api, fred
from app.data_sources import technical_analysis, fundamentals, options_data
from app.data_sources.massive_client import is_available as massive_available
from app.services import risk_service

logger = logging.getLogger(__name__)


def get_quotes_for_tickers(tickers: list[str]) -> dict:
    """Fetch stock quotes via Massive (priority source), using cache where available."""
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
        if not massive_available():
            logger.warning(
                "Massive API unavailable — quote data may be stale or empty"
            )
        fresh = yahoo_finance.fetch_quotes(uncached)
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
    """Fetch technical analysis indicators (Massive-backed), cached."""
    settings = get_settings()
    cache_key = f"technicals:{','.join(sorted(tickers))}"
    cached_data = cache.get(cache_key)
    if cached_data:
        return cached_data

    result = technical_analysis.compute_all_technicals(tickers)
    cache.set(cache_key, result, settings.TECHNICAL_CACHE_TTL)
    return result


def get_fundamentals(tickers: list[str]) -> dict:
    """Fetch fundamental metrics (Massive-backed), cached (1hr TTL)."""
    settings = get_settings()
    cache_key = f"fundamentals:{','.join(sorted(tickers))}"
    cached_data = cache.get(cache_key)
    if cached_data:
        return cached_data

    result = fundamentals.fetch_fundamentals(tickers)
    cache.set(cache_key, result, settings.FUNDAMENTALS_CACHE_TTL)
    return result


def get_options_data(tickers: list[str]) -> dict:
    """Fetch options chain data (Massive-backed), cached."""
    settings = get_settings()
    cache_key = f"options:{','.join(sorted(tickers))}"
    cached_data = cache.get(cache_key)
    if cached_data:
        return cached_data

    result = options_data.fetch_options_data(tickers)
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
    """Fetch all market data sources for analysis context.

    Loading priority:
      Phase 1 — Massive-backed real-time data (quotes, technicals, fundamentals, options)
      Phase 2 — Supplemental sources (news, economic, predictions) in parallel
      Phase 3 — Derived data (risk) that depends on Phase 1 results
    """
    loop = asyncio.get_event_loop()

    if not massive_available():
        logger.warning(
            "Massive API not available — market context will be incomplete. "
            "Check MASSIVE_API_KEY configuration."
        )

    # Phase 1: Massive-backed real-time data (PRIORITY — loaded first)
    quotes_future = loop.run_in_executor(None, get_quotes_for_tickers, tickers)
    technicals_future = loop.run_in_executor(None, get_technical_indicators, tickers)
    fundamentals_future = loop.run_in_executor(None, get_fundamentals, tickers)
    options_future = loop.run_in_executor(None, get_options_data, tickers)

    # Phase 2: Supplemental sources (loaded in parallel with Phase 1)
    economic_future = loop.run_in_executor(None, get_economic_indicators)
    news_future = get_news(tickers)
    predictions_future = get_predictions()

    # Await all — Massive data is listed first for clarity, but all run concurrently
    quotes, technicals, fundas, options, economic, articles, predictions = await asyncio.gather(
        quotes_future, technicals_future, fundamentals_future, options_future,
        economic_future, news_future, predictions_future,
    )

    context = {
        # Massive-backed (priority real-time data)
        "quotes": quotes,
        "technicals": technicals,
        "fundamentals": fundas,
        "options": options,
        # Supplemental sources
        "news": articles,
        "economic": economic,
        "predictions": predictions,
        # Data source status
        "data_source": {
            "primary": "massive",
            "massive_available": massive_available(),
        },
    }

    # Phase 3: Risk metrics (derived — needs quotes + holdings from Phase 1)
    if holdings:
        risk = await loop.run_in_executor(None, get_portfolio_risk, holdings, quotes)
        context["risk"] = risk
    else:
        context["risk"] = {}

    return context
