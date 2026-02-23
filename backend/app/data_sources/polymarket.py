import httpx

GAMMA_BASE_URL = "https://gamma-api.polymarket.com"


async def fetch_events(limit: int = 20) -> list[dict]:
    """Fetch active prediction market events from Polymarket."""
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.get(
                f"{GAMMA_BASE_URL}/events",
                params={"limit": limit, "active": "true", "closed": "false"},
            )
            response.raise_for_status()
            events = response.json()

            results = []
            for event in events:
                markets = event.get("markets", [])
                for market in markets:
                    outcome_prices = market.get("outcomePrices", "")
                    probability = None
                    if outcome_prices:
                        try:
                            # outcomePrices is a JSON string like "[0.65, 0.35]"
                            import json
                            prices = json.loads(outcome_prices)
                            if prices:
                                probability = round(float(prices[0]) * 100, 1)
                        except (json.JSONDecodeError, IndexError, ValueError):
                            pass

                    results.append({
                        "id": market.get("id"),
                        "title": market.get("question") or event.get("title"),
                        "description": event.get("description", ""),
                        "probability": probability,
                        "volume": market.get("volume"),
                        "end_date": market.get("endDate"),
                    })

            return results
    except Exception:
        return []


async def search_markets(query: str, limit: int = 10) -> list[dict]:
    """Search for prediction markets relevant to a query."""
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.get(
                f"{GAMMA_BASE_URL}/markets",
                params={"tag": query, "limit": limit, "active": "true", "closed": "false"},
            )
            response.raise_for_status()
            markets = response.json()

            return [
                {
                    "id": m.get("id"),
                    "title": m.get("question"),
                    "probability": None,
                    "volume": m.get("volume"),
                }
                for m in markets
            ]
    except Exception:
        return []
