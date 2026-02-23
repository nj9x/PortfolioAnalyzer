"""Massive.com (formerly Polygon.io) — centralized REST client singleton.

Provides a single shared RESTClient instance used by all data source modules.
The API key is read from the MASSIVE_API_KEY environment variable (set in
Railway or .env locally).
"""

import logging
from functools import lru_cache
from massive import RESTClient
from app.config import get_settings

logger = logging.getLogger(__name__)


@lru_cache
def get_client() -> RESTClient:
    """Return a shared Massive RESTClient (created once, reused everywhere)."""
    settings = get_settings()
    key = settings.MASSIVE_API_KEY
    if not key:
        logger.warning("MASSIVE_API_KEY not configured — market data calls will fail")
    return RESTClient(api_key=key)
