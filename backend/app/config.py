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
    STOCK_CACHE_TTL: int = 300
    NEWS_CACHE_TTL: int = 900
    POLYMARKET_CACHE_TTL: int = 600
    FRED_CACHE_TTL: int = 86400
    TECHNICAL_CACHE_TTL: int = 300
    FUNDAMENTALS_CACHE_TTL: int = 3600
    OPTIONS_CACHE_TTL: int = 300
    RISK_CACHE_TTL: int = 300
    ALPHA_VANTAGE_CACHE_TTL: int = 86400  # 24 hours for company overview

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()
