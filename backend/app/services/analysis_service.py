import json
import time
import asyncio
import logging
from concurrent.futures import ThreadPoolExecutor
from sqlalchemy.orm import Session
from app.models.portfolio import Portfolio
from app.models.analysis import AnalysisReport, Recommendation
from app.services.market_data_service import get_full_market_context
from app.claude.client import analyze_portfolio
from app.claude.prompts import build_user_message
from app.claude.response_parser import parse_analysis_response
from app.config import get_settings

logger = logging.getLogger(__name__)

# Dedicated executor for the Claude API call — guaranteed never starved
# by Massive API rate-limiter sleeps (those use _data_executor in market_data_service).
_claude_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="claude")

# Claude-specific timeout — backup for the SDK's own 120s timeout.
_CLAUDE_TIMEOUT = 150


async def run_analysis(db: Session, portfolio_id: int) -> AnalysisReport:
    """Run a full AI analysis on a portfolio."""
    t0 = time.time()
    portfolio = db.query(Portfolio).filter(Portfolio.id == portfolio_id).first()
    if not portfolio:
        raise ValueError("Portfolio not found")

    if not portfolio.holdings:
        raise ValueError("Portfolio has no holdings to analyze")

    settings = get_settings()
    if not settings.ANTHROPIC_API_KEY:
        raise ValueError("ANTHROPIC_API_KEY is not configured")

    # Gather tickers
    tickers = [h.ticker for h in portfolio.holdings]
    holdings_data = [
        {
            "ticker": h.ticker,
            "shares": h.shares,
            "cost_basis": h.cost_basis,
            "asset_type": h.asset_type,
        }
        for h in portfolio.holdings
    ]

    # ── Phase 1: Fetch market data (has its own internal time budget) ──
    logger.info("=== ANALYSIS START === portfolio=%d, tickers=%s", portfolio_id, tickers)
    try:
        context = await get_full_market_context(tickers, holdings=holdings_data)
    except Exception as e:
        logger.error("Market data fetch failed entirely: %s", e)
        # Proceed with empty context — Claude can still analyze holdings
        context = {
            "quotes": {}, "news": [], "predictions": [],
            "economic": {}, "technicals": {}, "fundamentals": {},
            "options": {}, "risk": {},
        }

    t1 = time.time()
    logger.info("Market data collected in %.1fs", t1 - t0)

    # Build the prompt with all data sections
    user_message = build_user_message(
        portfolio_name=portfolio.name,
        holdings=holdings_data,
        quotes=context["quotes"],
        news=context["news"],
        predictions=context["predictions"],
        economic=context["economic"],
        technicals=context.get("technicals"),
        fundamentals_data=context.get("fundamentals"),
        risk_data=context.get("risk"),
        options=context.get("options"),
    )
    logger.info("Prompt built: %d chars. Calling Claude...", len(user_message))

    # ── Phase 2: Call Claude on its own dedicated executor ─────────────
    loop = asyncio.get_running_loop()
    try:
        raw_response = await asyncio.wait_for(
            loop.run_in_executor(_claude_executor, analyze_portfolio, user_message),
            timeout=_CLAUDE_TIMEOUT,
        )
    except asyncio.TimeoutError:
        logger.error("Claude API call timed out after %ds", _CLAUDE_TIMEOUT)
        raise ValueError(
            f"AI generation timed out after {_CLAUDE_TIMEOUT}s. "
            "The model may be overloaded — please try again in a moment."
        )
    except Exception as e:
        logger.error("Claude API call failed: %s", e)
        raise ValueError(f"AI generation failed: {e}")

    t2 = time.time()
    logger.info("Claude responded in %.1fs (%d chars)", t2 - t1, len(raw_response))

    # Parse response
    parsed = parse_analysis_response(raw_response)

    # Store report with new analysis sections
    report = AnalysisReport(
        portfolio_id=portfolio_id,
        summary=parsed.get("summary", "Analysis completed"),
        risk_score=parsed.get("risk_score"),
        market_outlook=parsed.get("market_outlook"),
        raw_response=raw_response,
        context_snapshot=json.dumps(context, default=str),
        model_used=settings.CLAUDE_MODEL,
        technical_summary=json.dumps(parsed.get("technical_analysis")) if parsed.get("technical_analysis") else None,
        fundamental_summary=json.dumps(parsed.get("fundamental_analysis")) if parsed.get("fundamental_analysis") else None,
        risk_analysis=json.dumps(parsed.get("risk_management")) if parsed.get("risk_management") else None,
        options_summary=json.dumps(parsed.get("options_analysis")) if parsed.get("options_analysis") else None,
    )
    db.add(report)
    db.flush()

    # Store recommendations
    for rec in parsed.get("recommendations", []):
        recommendation = Recommendation(
            report_id=report.id,
            ticker=rec.get("ticker", ""),
            action=rec.get("action", "HOLD"),
            confidence=rec.get("confidence"),
            reasoning=rec.get("reasoning", ""),
            target_price=rec.get("target_price"),
            time_horizon=rec.get("time_horizon"),
            priority=rec.get("priority", 0),
        )
        db.add(recommendation)

    db.commit()
    db.refresh(report)
    total = time.time() - t0
    logger.info("=== ANALYSIS COMPLETE === portfolio=%d, total=%.1fs", portfolio_id, total)
    return report


def get_latest_report(db: Session, portfolio_id: int) -> AnalysisReport | None:
    return (
        db.query(AnalysisReport)
        .filter(AnalysisReport.portfolio_id == portfolio_id)
        .order_by(AnalysisReport.created_at.desc())
        .first()
    )


def get_report_history(db: Session, portfolio_id: int, limit: int = 20) -> list[AnalysisReport]:
    return (
        db.query(AnalysisReport)
        .filter(AnalysisReport.portfolio_id == portfolio_id)
        .order_by(AnalysisReport.created_at.desc())
        .limit(limit)
        .all()
    )


def get_report_by_id(db: Session, report_id: int) -> AnalysisReport | None:
    return db.query(AnalysisReport).filter(AnalysisReport.id == report_id).first()
