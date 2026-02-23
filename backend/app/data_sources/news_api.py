import httpx
from app.config import get_settings

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
    """Fetch financial news articles. Optionally filter by tickers."""
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
                }
                for article in data.get("articles", [])
            ]
    except Exception:
        return []
