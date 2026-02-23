"""Massive.com (formerly Polygon.io) — centralized REST client singleton.

Provides a single shared RESTClient instance used by all data source modules.
The API key is read from the MASSIVE_API_KEY environment variable (set in
Railway or .env locally).

Massive is the PRIORITY data source for all real-time market data.
"""

import logging
from functools import lru_cache
from massive import RESTClient
from app.config import get_settings

logger = logging.getLogger(__name__)

# Track whether the Massive API has been validated at startup
_api_validated: bool = False
_api_status: str = "unchecked"


@lru_cache
def get_client() -> RESTClient:
    """Return a shared Massive RESTClient (created once, reused everywhere)."""
    settings = get_settings()
    key = settings.MASSIVE_API_KEY
    if not key:
        logger.error(
            "MASSIVE_API_KEY not configured — real-time market data will be unavailable. "
            "Set MASSIVE_API_KEY in your .env or Railway environment variables."
        )
    return RESTClient(api_key=key)


def validate_api() -> dict:
    """Validate Massive API connectivity and key.

    Called at startup and by the health endpoint to confirm real-time data
    is available. Returns a status dict.
    """
    global _api_validated, _api_status

    settings = get_settings()
    if not settings.MASSIVE_API_KEY:
        _api_validated = False
        _api_status = "missing_key"
        return {
            "status": "error",
            "provider": "massive",
            "message": "MASSIVE_API_KEY not configured",
        }

    try:
        client = get_client()
        # Lightweight call: fetch AAPL snapshot to verify credentials
        snap = client.get_previous_close_agg("AAPL")
        if snap and snap.close:
            _api_validated = True
            _api_status = "connected"
            logger.info(
                "Massive API validated — real-time market data active (AAPL last close: $%.2f)",
                snap.close,
            )
            return {
                "status": "ok",
                "provider": "massive",
                "message": "API key valid, real-time data active",
                "sample_price": round(snap.close, 2),
            }
        else:
            _api_validated = False
            _api_status = "no_data"
            return {
                "status": "degraded",
                "provider": "massive",
                "message": "API responded but returned no data",
            }
    except Exception as e:
        _api_validated = False
        _api_status = f"error: {e}"
        logger.error("Massive API validation failed: %s", e)
        return {
            "status": "error",
            "provider": "massive",
            "message": str(e),
        }


def is_available() -> bool:
    """Return True if the Massive API has been validated and is ready."""
    return _api_validated


def get_api_status() -> str:
    """Return the current Massive API status string."""
    return _api_status
