from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.config import get_settings
from app.database import engine, Base
from app.routers import portfolios, market_data, analysis, chart_analysis, dcf


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)

    # Validate Massive API at startup — it is the priority data source
    from app.data_sources.massive_client import validate_api
    massive_status = validate_api()
    if massive_status["status"] != "ok":
        import logging
        logging.getLogger(__name__).warning(
            "Massive API not fully available at startup: %s — "
            "real-time market data may be degraded",
            massive_status.get("message"),
        )

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


@app.get("/api/v1/health")
def health_check():
    from app.data_sources.massive_client import is_available, get_api_status
    massive_ok = is_available()
    return {
        "status": "ok" if massive_ok else "degraded",
        "massive_api": {
            "available": massive_ok,
            "status": get_api_status(),
            "priority": True,
        },
    }


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
