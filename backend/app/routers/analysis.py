import asyncio
import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.schemas.analysis import AnalysisReportResponse, AnalysisReportListResponse
from app.services import analysis_service

logger = logging.getLogger(__name__)
router = APIRouter()

# Overall timeout for the entire analysis pipeline (5 minutes).
# The Claude call has its own 180s timeout inside analysis_service,
# so this is a safety net for the full pipeline.
_ANALYSIS_TIMEOUT = 300


@router.post("/{portfolio_id}/analyze", response_model=AnalysisReportResponse)
async def trigger_analysis(portfolio_id: int, db: Session = Depends(get_db)):
    """Trigger a new AI analysis for a portfolio."""
    try:
        report = await asyncio.wait_for(
            analysis_service.run_analysis(db, portfolio_id),
            timeout=_ANALYSIS_TIMEOUT,
        )
        return report
    except asyncio.TimeoutError:
        logger.error("Analysis pipeline timed out after %ds for portfolio %d", _ANALYSIS_TIMEOUT, portfolio_id)
        raise HTTPException(
            status_code=504,
            detail=f"Analysis timed out after {_ANALYSIS_TIMEOUT}s. Please try again.",
        )
    except ValueError as e:
        # Claude timeout, config errors, or data errors bubble up as ValueError
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error("Unexpected analysis error for portfolio %d: %s", portfolio_id, e, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Analysis failed unexpectedly: {e}")


@router.get("/{portfolio_id}/latest", response_model=AnalysisReportResponse | None)
def get_latest_analysis(portfolio_id: int, db: Session = Depends(get_db)):
    """Get the most recent analysis for a portfolio."""
    report = analysis_service.get_latest_report(db, portfolio_id)
    if not report:
        raise HTTPException(status_code=404, detail="No analysis found for this portfolio")
    return report


@router.get("/{portfolio_id}/history", response_model=list[AnalysisReportListResponse])
def get_analysis_history(portfolio_id: int, db: Session = Depends(get_db)):
    """Get analysis history for a portfolio."""
    return analysis_service.get_report_history(db, portfolio_id)


@router.get("/report/{report_id}", response_model=AnalysisReportResponse)
def get_report(report_id: int, db: Session = Depends(get_db)):
    """Get a specific analysis report."""
    report = analysis_service.get_report_by_id(db, report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    return report
