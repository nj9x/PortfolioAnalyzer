"""Financial news — Massive API (priority) with NewsAPI fallback.

Massive provides ticker-specific news directly from the market data API.
NewsAPI is used as a supplemental source when Massive news is unavailable
or for general market news queries.
"""

import logging
import httpx
from app.config import get_settings
from app.data_sources.massive_client import get_client, is_available as massive_available
from app.services.cache_service import cache

logger = logging.getLogger(__name__)

BASE_URL = "https://newsapi.org/v2"

# Restrict to reputable financial/business news sources
FINANCIAL_DOMAINS = ",".join([
    "reuters.com",
    "bloomberg.com",
    "cnbc.com",
    "wsj.com",
    "ft.com",
    "marketwatch.com",
    "finance.yahoo.com",
    "barrons.com",
    "seekingalpha.com",
    "investopedia.com",
    "thestreet.com",
    "fool.com",
    "businessinsider.com",
    "forbes.com",
])


async def fetch_financial_news(tickers: list[str] | None = None, page_size: int = 10) -> list[dict]:
    """Fetch financial news — tries Massive first, falls back to NewsAPI.

    When tickers are provided, Massive's ticker news endpoint is used as the
    priority source since it returns highly relevant, ticker-specific articles.
    """
    articles = []

    # Priority: Try Massive ticker news first
    if tickers and massive_available():
        articles = _fetch_massive_news(tickers, limit=page_size)
        if articles:
            return articles

    # Fallback: NewsAPI
    newsapi_articles = await _fetch_newsapi(tickers, page_size)
    if newsapi_articles:
        return newsapi_articles

    return articles


def _fetch_massive_news(tickers: list[str], limit: int = 10) -> list[dict]:
    """Fetch ticker-specific news via Massive API."""
    cache_key = f"massive_news:{','.join(sorted(tickers[:5]))}"
    cached = cache.get(cache_key)
    if cached:
        return cached

    try:
        client = get_client()
        all_articles = []

        for ticker in tickers[:5]:
            try:
                news_items = list(client.list_ticker_news(
                    ticker=ticker,
                    limit=limit,
                ))
                for item in news_items:
                    all_articles.append({
                        "title": item.title or "",
                        "source": (
                            item.publisher.name
                            if hasattr(item, "publisher") and item.publisher
                            else ""
                        ),
                        "url": item.article_url or "",
                        "published_at": item.published_utc or "",
                        "description": item.description or "",
                        "tickers": [
                            t.ticker for t in (item.tickers or [])
                            if hasattr(t, "ticker")
                        ] if hasattr(item, "tickers") else [],
                        "source_api": "massive",
                    })
            except Exception as e:
                logger.warning(f"Massive news failed for {ticker}: {e}")
                continue

        # Deduplicate by title
        seen_titles = set()
        unique = []
        for a in all_articles:
            if a["title"] and a["title"] not in seen_titles:
                seen_titles.add(a["title"])
                unique.append(a)

        # Sort by published date (newest first) and limit
        unique.sort(key=lambda x: x.get("published_at", ""), reverse=True)
        result = unique[:limit]

        if result:
            cache.set(cache_key, result, 120)  # cache for 2 min
        return result

    except Exception as e:
        logger.error(f"Massive news fetch failed: {e}")
        return []


async def _fetch_newsapi(tickers: list[str] | None = None, page_size: int = 10) -> list[dict]:
    """Fetch financial news from NewsAPI (fallback source)."""
    settings = get_settings()
    if not settings.NEWS_API_KEY:
        return []

    # Build a query that targets financial context, not just raw ticker symbols
    if tickers:
        ticker_queries = [f'"{t}" stock' for t in tickers[:5]]
        query = " OR ".join(ticker_queries)
    else:
        query = "stock market OR economy OR federal reserve OR earnings"

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.get(
                f"{BASE_URL}/everything",
                params={
                    "q": query,
                    "language": "en",
                    "sortBy": "publishedAt",
                    "pageSize": page_size,
                    "domains": FINANCIAL_DOMAINS,
                },
                headers={"X-Api-Key": settings.NEWS_API_KEY},
            )
            response.raise_for_status()
            data = response.json()

            return [
                {
                    "title": article.get("title", ""),
                    "source": article.get("source", {}).get("name", ""),
                    "url": article.get("url", ""),
                    "published_at": article.get("publishedAt", ""),
                    "description": article.get("description", ""),
                    "source_api": "newsapi",
                }
                for article in data.get("articles", [])
            ]
    except Exception:
        return []
