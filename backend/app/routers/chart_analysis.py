from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.chart_analysis import (
    ChartAnalysisListResponse,
    ChartAnalysisResponse,
)
from app.services import chart_analysis_service

router = APIRouter()

UPLOAD_BASE = Path(__file__).resolve().parent.parent.parent / "uploads"


@router.post("/analyze", response_model=ChartAnalysisResponse, status_code=201)
async def analyze_chart(
    file: UploadFile = File(...),
    analysis_type: str = Form("technical"),
    user_notes: str = Form(""),
    db: Session = Depends(get_db),
):
    """Upload a TradingView chart screenshot and get AI analysis."""
    try:
        result = await chart_analysis_service.analyze_chart(
            db, file, analysis_type, user_notes
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/history", response_model=list[ChartAnalysisListResponse])
def get_history(limit: int = 50, db: Session = Depends(get_db)):
    """Get chart analysis history."""
    return chart_analysis_service.get_analysis_history(db, limit)


@router.get("/{analysis_id}", response_model=ChartAnalysisResponse)
def get_analysis(analysis_id: int, db: Session = Depends(get_db)):
    """Get a specific chart analysis."""
    result = chart_analysis_service.get_analysis_by_id(db, analysis_id)
    if not result:
        raise HTTPException(status_code=404, detail="Chart analysis not found")
    return result


@router.delete("/{analysis_id}", status_code=204)
def delete_analysis(analysis_id: int, db: Session = Depends(get_db)):
    """Delete a chart analysis."""
    if not chart_analysis_service.delete_analysis(db, analysis_id):
        raise HTTPException(status_code=404, detail="Chart analysis not found")


@router.get("/image/{analysis_id}")
def get_chart_image(analysis_id: int, db: Session = Depends(get_db)):
    """Serve the uploaded chart image."""
    result = chart_analysis_service.get_analysis_by_id(db, analysis_id)
    if not result:
        raise HTTPException(status_code=404, detail="Chart analysis not found")
    file_path = UPLOAD_BASE / result.image_path
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Image file not found")
    return FileResponse(file_path)
