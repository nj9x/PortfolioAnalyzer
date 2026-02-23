from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.schemas.analysis import AnalysisReportResponse, AnalysisReportListResponse
from app.services import analysis_service

router = APIRouter()


@router.post("/{portfolio_id}/analyze", response_model=AnalysisReportResponse)
async def trigger_analysis(portfolio_id: int, db: Session = Depends(get_db)):
    """Trigger a new AI analysis for a portfolio."""
    try:
        report = await analysis_service.run_analysis(db, portfolio_id)
        return report
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


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
