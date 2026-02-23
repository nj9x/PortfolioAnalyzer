import os
from pathlib import Path
from dotenv import load_dotenv
from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache

# Load .env BEFORE pydantic reads env vars, with override=True so that
# .env values take precedence over empty shell variables (e.g. Claude Code
# sets ANTHROPIC_API_KEY="" in the shell environment).
_env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(_env_path, override=True)


class Settings(BaseSettings):
    DATABASE_URL: str = "sqlite:///./portfolio_analyzer.db"
    ANTHROPIC_API_KEY: str = ""
    NEWS_API_KEY: str = ""
    FRED_API_KEY: str = ""
    ALPHA_VANTAGE_API_KEY: str = ""
    MASSIVE_API_KEY: str = ""

    # Deployment settings
    PORT: int = 8000
    CORS_ORIGINS: str = "http://localhost:5173,http://localhost:3000"
    FRONTEND_DIR: str = ""  # path to built frontend dist; empty = don't serve

    # Rate limits
    YAHOO_REQUESTS_PER_MINUTE: int = 30
    NEWS_API_REQUESTS_PER_DAY: int = 100

    # Claude settings
    CLAUDE_MODEL: str = "claude-sonnet-4-5-20250929"
    CLAUDE_MAX_TOKENS: int = 16384

    # Cache TTLs (seconds)
    # Massive-backed real-time data — shorter TTLs for fresher market data
    STOCK_CACHE_TTL: int = 60           # quotes refresh every 60s
    TECHNICAL_CACHE_TTL: int = 120      # technicals refresh every 2 min
    OPTIONS_CACHE_TTL: int = 120        # options refresh every 2 min
    RISK_CACHE_TTL: int = 120           # risk refresh every 2 min
    FUNDAMENTALS_CACHE_TTL: int = 1800  # fundamentals refresh every 30 min
    ALPHA_VANTAGE_CACHE_TTL: int = 3600  # company overview refresh every 1 hr
    # Supplemental sources — longer TTLs (data changes less frequently)
    NEWS_CACHE_TTL: int = 900
    POLYMARKET_CACHE_TTL: int = 600
    FRED_CACHE_TTL: int = 86400

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()
