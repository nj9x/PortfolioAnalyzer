from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.dcf_valuation import (
    DCFFinancialsResponse,
    DCFListResponse,
    DCFResultResponse,
    DCFRunRequest,
)
from app.services import dcf_service

router = APIRouter()


@router.get("/financials/{ticker}", response_model=DCFFinancialsResponse)
def fetch_financials(ticker: str):
    """Fetch financial data for a ticker to pre-fill DCF inputs."""
    try:
        data = dcf_service.fetch_dcf_financials(ticker.upper())
        if not data.get("free_cashflow") and not data.get("current_price"):
            raise HTTPException(
                status_code=404,
                detail=f"Could not find financial data for {ticker}",
            )
        return data
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/calculate", response_model=DCFResultResponse, status_code=201)
def run_dcf(request: DCFRunRequest, db: Session = Depends(get_db)):
    """Run a DCF calculation with the provided inputs."""
    try:
        result = dcf_service.run_dcf_calculation(db, request)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/history", response_model=list[DCFListResponse])
def get_history(
    ticker: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    """Get DCF valuation history, optionally filtered by ticker."""
    return dcf_service.get_valuation_history(db, ticker=ticker, limit=limit)


@router.get("/{valuation_id}", response_model=DCFResultResponse)
def get_valuation(valuation_id: int, db: Session = Depends(get_db)):
    """Get a specific DCF valuation by ID."""
    result = dcf_service.get_valuation_by_id(db, valuation_id)
    if not result:
        raise HTTPException(status_code=404, detail="DCF valuation not found")
    return result


@router.delete("/{valuation_id}", status_code=204)
def delete_valuation(valuation_id: int, db: Session = Depends(get_db)):
    """Delete a DCF valuation."""
    if not dcf_service.delete_valuation(db, valuation_id):
        raise HTTPException(status_code=404, detail="DCF valuation not found")
