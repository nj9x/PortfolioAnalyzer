from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from app.database import get_db
from app.schemas.portfolio import (
    PortfolioCreate,
    PortfolioUpdate,
    PortfolioResponse,
    PortfolioListResponse,
    HoldingCreate,
    HoldingUpdate,
    HoldingResponse,
)
from app.services import portfolio_service

router = APIRouter()


@router.get("/", response_model=list[PortfolioListResponse])
def list_portfolios(db: Session = Depends(get_db)):
    portfolios = portfolio_service.list_portfolios(db)
    result = []
    for p in portfolios:
        data = PortfolioListResponse.model_validate(p)
        data.holdings_count = len(p.holdings)
        result.append(data)
    return result


@router.post("/", response_model=PortfolioResponse, status_code=201)
def create_portfolio(data: PortfolioCreate, db: Session = Depends(get_db)):
    return portfolio_service.create_portfolio(db, data)


@router.get("/dashboard-overview")
def dashboard_overview(db: Session = Depends(get_db)):
    """Get all portfolios with performance metrics and alerts for the dashboard."""
    return portfolio_service.get_dashboard_overview(db)


@router.get("/{portfolio_id}", response_model=PortfolioResponse)
def get_portfolio(portfolio_id: int, db: Session = Depends(get_db)):
    portfolio = portfolio_service.get_portfolio(db, portfolio_id)
    if not portfolio:
        raise HTTPException(status_code=404, detail="Portfolio not found")
    return portfolio


@router.put("/{portfolio_id}", response_model=PortfolioResponse)
def update_portfolio(portfolio_id: int, data: PortfolioUpdate, db: Session = Depends(get_db)):
    portfolio = portfolio_service.update_portfolio(db, portfolio_id, data)
    if not portfolio:
        raise HTTPException(status_code=404, detail="Portfolio not found")
    return portfolio


@router.delete("/{portfolio_id}", status_code=204)
def delete_portfolio(portfolio_id: int, db: Session = Depends(get_db)):
    if not portfolio_service.delete_portfolio(db, portfolio_id):
        raise HTTPException(status_code=404, detail="Portfolio not found")


@router.post("/{portfolio_id}/holdings", response_model=HoldingResponse, status_code=201)
def add_holding(portfolio_id: int, data: HoldingCreate, db: Session = Depends(get_db)):
    holding = portfolio_service.add_holding(db, portfolio_id, data)
    if not holding:
        raise HTTPException(status_code=404, detail="Portfolio not found")
    return holding


@router.put("/{portfolio_id}/holdings/{holding_id}", response_model=HoldingResponse)
def update_holding(
    portfolio_id: int, holding_id: int, data: HoldingUpdate, db: Session = Depends(get_db)
):
    holding = portfolio_service.update_holding(db, holding_id, data)
    if not holding:
        raise HTTPException(status_code=404, detail="Holding not found")
    return holding


@router.delete("/{portfolio_id}/holdings/{holding_id}", status_code=204)
def delete_holding(portfolio_id: int, holding_id: int, db: Session = Depends(get_db)):
    if not portfolio_service.delete_holding(db, holding_id):
        raise HTTPException(status_code=404, detail="Holding not found")


@router.post("/upload", response_model=PortfolioResponse, status_code=201)
def upload_portfolio(
    name: str = Form(...),
    description: str = Form(None),
    client_name: str = Form(None),
    category: str = Form("balanced"),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")
    if not file.filename.endswith((".csv", ".xlsx", ".xls")):
        raise HTTPException(status_code=400, detail="File must be CSV or Excel (.xlsx/.xls)")

    try:
        portfolio = portfolio_service.import_portfolio_from_file(
            db,
            name=name,
            file=file.file,
            filename=file.filename,
            description=description,
            client_name=client_name,
            category=category,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return portfolio
