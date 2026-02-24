import asyncio
import time
import logging
from concurrent.futures import ThreadPoolExecutor
from app.services.cache_service import cache
from app.config import get_settings
from app.data_sources import massive, polymarket, news_api, fred
from app.data_sources import technical_analysis, fundamentals, options_data
from app.services import risk_service

logger = logging.getLogger(__name__)

# Dedicated executor for Massive API calls — separate from the default pool
# so that rate-limiter sleeps don't starve the Claude API call.
_data_executor = ThreadPoolExecutor(max_workers=3, thread_name_prefix="massive-data")

# Hard time budget for the entire data fetching phase (seconds).
# If we exceed this, we proceed with whatever data we have.
_DATA_FETCH_BUDGET = 90


def get_quotes_for_tickers(tickers: list[str]) -> dict:
    """Fetch stock quotes, using cache where available."""
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
        fresh = massive.fetch_quotes(uncached)
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
    """Fetch options chain data, cached."""
    settings = get_settings()
    cache_key = f"options:{','.join(sorted(tickers))}"
    cached_data = cache.get(cache_key)
    if cached_data:
        return cached_data

    result = options_data.fetch_options_data(tickers)
    cache.set(cache_key, result, settings.OPTIONS_CACHE_TTL)
    return result


def get_sparklines(tickers: list[str], days: int = 7) -> dict:
    """Fetch mini sparkline data (last N daily closes) for each ticker.

    Returns: { "AAPL": [{"date": "2026-02-16", "close": 185.3}, ...], ... }
    """
    settings = get_settings()
    result = {}
    for t in tickers:
        cache_key = f"sparkline:{t}:{days}"
        cached = cache.get(cache_key)
        if cached is not None:
            result[t] = cached
            continue

        history = massive.fetch_history_days(t, days=days)
        points = [{"date": h["date"], "close": h["close"]} for h in history] if history else []
        cache.set(cache_key, points, 300)  # 5 min cache
        result[t] = points
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


async def _run_with_timeout(coro_or_future, timeout: float, label: str, default):
    """Run an awaitable with a timeout. Returns default on timeout or error."""
    try:
        return await asyncio.wait_for(asyncio.ensure_future(coro_or_future), timeout=timeout)
    except asyncio.TimeoutError:
        logger.warning("%s timed out after %.0fs — skipping", label, timeout)
        return default
    except Exception as e:
        logger.error("%s failed: %s — skipping", label, e)
        return default


async def get_full_market_context(tickers: list[str], holdings: list[dict] | None = None) -> dict:
    """Fetch all market data sources for analysis context.

    Uses a hard time budget (_DATA_FETCH_BUDGET). If Phase 1 takes too long,
    Phase 2 is skipped. The analysis can still proceed with partial data —
    Claude will work with whatever context is available.
    """
    loop = asyncio.get_running_loop()
    t0 = time.time()

    # ── Phase 1: Essential data (quotes + news + economic) ────────────
    # These are the lightest calls and most important for any analysis.
    logger.info("Phase 1: fetching quotes, news, economic, predictions for %d tickers...", len(tickers))

    phase1_timeout = min(45, _DATA_FETCH_BUDGET * 0.5)
    quotes, economic, articles, predictions = await asyncio.gather(
        _run_with_timeout(
            loop.run_in_executor(_data_executor, get_quotes_for_tickers, tickers),
            phase1_timeout, "Quotes", {}
        ),
        _run_with_timeout(
            loop.run_in_executor(_data_executor, get_economic_indicators),
            phase1_timeout, "Economic", {}
        ),
        _run_with_timeout(get_news(tickers), phase1_timeout, "News", []),
        _run_with_timeout(get_predictions(), phase1_timeout, "Predictions", []),
    )

    elapsed = time.time() - t0
    logger.info("Phase 1 done in %.1fs. Quotes: %d tickers.", elapsed, len(quotes) if isinstance(quotes, dict) else 0)

    # ── Phase 2: Advanced data (technicals, fundamentals, options) ────
    # Only attempt if we have time budget remaining.
    remaining = _DATA_FETCH_BUDGET - elapsed
    technicals = {}
    fundas = {}
    options = {}
    risk = {}

    if remaining > 15:
        logger.info("Phase 2: %.0fs remaining — fetching technicals, fundamentals...", remaining)
        phase2_timeout = min(remaining - 5, 60)  # Leave 5s buffer

        technicals, fundas, options = await asyncio.gather(
            _run_with_timeout(
                loop.run_in_executor(_data_executor, get_technical_indicators, tickers),
                phase2_timeout, "Technicals", {}
            ),
            _run_with_timeout(
                loop.run_in_executor(_data_executor, get_fundamentals, tickers),
                phase2_timeout, "Fundamentals", {}
            ),
            _run_with_timeout(
                loop.run_in_executor(_data_executor, get_options_data, tickers),
                phase2_timeout, "Options", {}
            ),
        )

        elapsed2 = time.time() - t0
        logger.info("Phase 2 done in %.1fs total.", elapsed2)

        # Risk metrics if we still have time
        remaining2 = _DATA_FETCH_BUDGET - elapsed2
        if holdings and remaining2 > 10:
            risk = await _run_with_timeout(
                loop.run_in_executor(_data_executor, get_portfolio_risk, holdings, quotes),
                min(remaining2 - 5, 30), "Risk", {}
            )
    else:
        logger.warning("Skipping Phase 2 — only %.0fs remaining (budget: %ds)", remaining, _DATA_FETCH_BUDGET)

    total = time.time() - t0
    logger.info("Data fetching complete in %.1fs", total)

    return {
        "quotes": quotes,
        "news": articles,
        "predictions": predictions,
        "economic": economic,
        "technicals": technicals,
        "fundamentals": fundas,
        "options": options,
        "risk": risk,
    }
