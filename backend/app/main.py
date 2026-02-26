import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text

from app.config import get_settings
from app.database import engine, Base
from app.routers import portfolios, market_data, analysis, chart_analysis, dcf, sec_filings

logger = logging.getLogger(__name__)


def _run_migrations(engine):
    """Add new columns to existing tables (safe for fresh and existing databases)."""
    migrations = [
        ("portfolios", "client_name", "VARCHAR(255)"),
        ("portfolios", "category", "VARCHAR(20) DEFAULT 'balanced'"),
        ("portfolios", "benchmark", "VARCHAR(50) DEFAULT 'SPY'"),
        ("portfolios", "target_allocation", "TEXT"),
        ("portfolios", "risk_tolerance", "VARCHAR(20) DEFAULT 'moderate'"),
        ("portfolios", "cash_balance", "FLOAT DEFAULT 0"),
    ]
    with engine.connect() as conn:
        for table, column, col_type in migrations:
            try:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {col_type}"))
                conn.commit()
                logger.info("Migration: added %s.%s", table, column)
            except Exception:
                conn.rollback()  # Column already exists — safe to ignore


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    _run_migrations(engine)
    yield


app = FastAPI(
    title="Portfolio Analyzer",
    description="AI-powered portfolio analysis for financial advisors",
    version="1.0.0",
    lifespan=lifespan,
)

# --- CORS (dynamic from settings) ---
settings = get_settings()
origins = [o.strip() for o in settings.CORS_ORIGINS.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- API Routers (registered FIRST, before static files) ---
app.include_router(portfolios.router, prefix="/api/v1/portfolios", tags=["Portfolios"])
app.include_router(market_data.router, prefix="/api/v1/market-data", tags=["Market Data"])
app.include_router(analysis.router, prefix="/api/v1/analysis", tags=["Analysis"])
app.include_router(chart_analysis.router, prefix="/api/v1/chart-analysis", tags=["Chart Analysis"])
app.include_router(dcf.router, prefix="/api/v1/dcf", tags=["DCF Valuation"])
app.include_router(sec_filings.router, prefix="/api/v1/sec-filings", tags=["SEC Filings"])


@app.get("/api/v1/health")
def health_check():
    return {"status": "ok"}


# --- Static frontend serving (production only) ---
_frontend_dir = settings.FRONTEND_DIR
if _frontend_dir and Path(_frontend_dir).is_dir():
    # Mount static assets (JS, CSS, images) efficiently
    _assets_dir = Path(_frontend_dir) / "assets"
    if _assets_dir.is_dir():
        app.mount("/assets", StaticFiles(directory=str(_assets_dir)), name="static-assets")

    # SPA catch-all: any non-API route returns index.html
    @app.get("/{full_path:path}")
    async def serve_spa(request: Request, full_path: str):
        # Never intercept API routes
        if full_path.startswith("api/"):
            return
        # Serve actual files if they exist (favicon, etc.)
        file_path = Path(_frontend_dir) / full_path
        if full_path and file_path.is_file():
            return FileResponse(str(file_path))
        # Otherwise serve index.html for SPA client-side routing
        return FileResponse(str(Path(_frontend_dir) / "index.html"))
