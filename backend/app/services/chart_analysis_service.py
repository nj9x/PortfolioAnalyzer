import base64
import json
import os
import uuid
from pathlib import Path

from fastapi import UploadFile
from sqlalchemy.orm import Session

from app.claude.client import analyze_chart_image, analyze_ticker_data
from app.claude.response_parser import parse_analysis_response
from app.config import get_settings
from app.models.chart_analysis import ChartAnalysis

UPLOAD_DIR = Path(__file__).resolve().parent.parent.parent / "uploads" / "charts"

ALLOWED_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}
MEDIA_TYPES = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
}


def _ensure_upload_dir():
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


async def analyze_chart(
    db: Session,
    file: UploadFile,
    analysis_type: str = "technical",
    user_notes: str = "",
) -> ChartAnalysis:
    """Save uploaded chart image, send to Claude for analysis, persist results."""
    settings = get_settings()
    if not settings.ANTHROPIC_API_KEY:
        raise ValueError("ANTHROPIC_API_KEY is not configured")

    # Validate file
    if not file.filename:
        raise ValueError("No file provided")
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise ValueError(
            f"File must be an image ({', '.join(ALLOWED_EXTENSIONS)})"
        )

    # Read file bytes
    image_bytes = await file.read()
    if len(image_bytes) > 20 * 1024 * 1024:
        raise ValueError("Image file is too large (max 20MB)")

    # Save to disk
    _ensure_upload_dir()
    unique_name = f"{uuid.uuid4().hex}{ext}"
    file_path = UPLOAD_DIR / unique_name
    file_path.write_bytes(image_bytes)

    # Convert to base64 for Claude
    image_base64 = base64.b64encode(image_bytes).decode("utf-8")
    media_type = MEDIA_TYPES[ext]

    # Call Claude vision API
    raw_response = analyze_chart_image(image_base64, media_type, user_notes)

    # Parse response (reuses existing JSON parser)
    parsed = parse_analysis_response(raw_response)

    # Persist to database
    chart_analysis = ChartAnalysis(
        image_path=f"charts/{unique_name}",
        original_filename=file.filename,
        ticker=parsed.get("ticker"),
        timeframe=parsed.get("timeframe"),
        analysis_type=analysis_type,
        raw_response=raw_response,
        parsed_results=json.dumps(parsed),
        model_used=settings.CLAUDE_MODEL,
        trend=parsed.get("trend"),
        overall_bias=parsed.get("overall_bias"),
    )
    db.add(chart_analysis)
    db.commit()
    db.refresh(chart_analysis)
    return chart_analysis


def get_analysis_by_id(db: Session, analysis_id: int) -> ChartAnalysis | None:
    return (
        db.query(ChartAnalysis).filter(ChartAnalysis.id == analysis_id).first()
    )


def get_analysis_history(
    db: Session, limit: int = 50
) -> list[ChartAnalysis]:
    return (
        db.query(ChartAnalysis)
        .order_by(ChartAnalysis.created_at.desc())
        .limit(limit)
        .all()
    )


def delete_analysis(db: Session, analysis_id: int) -> bool:
    record = (
        db.query(ChartAnalysis).filter(ChartAnalysis.id == analysis_id).first()
    )
    if not record:
        return False
    # Delete file from disk
    full_path = UPLOAD_DIR / os.path.basename(record.image_path)
    if full_path.exists():
        full_path.unlink()
    db.delete(record)
    db.commit()
    return True


def analyze_ticker(
    db: Session,
    ticker: str,
    user_notes: str = "",
) -> ChartAnalysis:
    """Fetch OHLCV data for a ticker and run Claude technical analysis."""
    from app.data_sources.massive import fetch_history

    settings = get_settings()
    if not settings.ANTHROPIC_API_KEY:
        raise ValueError("ANTHROPIC_API_KEY is not configured")

    ticker = ticker.strip().upper()

    # Fetch 6 months of daily data
    bars = fetch_history(ticker, period="6mo")
    if not bars or len(bars) < 10:
        raise ValueError(f"Insufficient price data for {ticker}")

    # Format OHLCV as text table for Claude
    lines = [f"Ticker: {ticker}", f"Period: 6 months daily", f"Bars: {len(bars)}", ""]
    lines.append("Date       | Open     | High     | Low      | Close    | Volume")
    lines.append("-" * 75)
    for bar in bars:
        lines.append(
            f"{bar['date']}  | {bar['open']:>8.2f} | {bar['high']:>8.2f} | "
            f"{bar['low']:>8.2f} | {bar['close']:>8.2f} | {bar['volume']:>10,}"
        )
    ohlcv_text = "\n".join(lines)

    # Call Claude
    raw_response = analyze_ticker_data(ticker, ohlcv_text, user_notes)

    # Parse response
    parsed = parse_analysis_response(raw_response)
    # Ensure ticker is set
    if not parsed.get("ticker"):
        parsed["ticker"] = ticker

    # Persist to database
    chart_analysis = ChartAnalysis(
        image_path="",
        original_filename=f"{ticker}_data_analysis",
        ticker=parsed.get("ticker", ticker),
        timeframe=parsed.get("timeframe", "1D"),
        analysis_type="technical",
        raw_response=raw_response,
        parsed_results=json.dumps(parsed),
        model_used=settings.CLAUDE_MODEL,
        trend=parsed.get("trend"),
        overall_bias=parsed.get("overall_bias"),
    )
    db.add(chart_analysis)
    db.commit()
    db.refresh(chart_analysis)
    return chart_analysis
