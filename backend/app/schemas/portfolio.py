from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class HoldingBase(BaseModel):
    ticker: str
    shares: float
    cost_basis: Optional[float] = None
    asset_type: str = "equity"
    notes: Optional[str] = None


class HoldingCreate(HoldingBase):
    pass


class HoldingUpdate(BaseModel):
    ticker: Optional[str] = None
    shares: Optional[float] = None
    cost_basis: Optional[float] = None
    asset_type: Optional[str] = None
    notes: Optional[str] = None


class HoldingResponse(HoldingBase):
    id: int
    portfolio_id: int
    added_at: datetime

    model_config = {"from_attributes": True}


class PortfolioBase(BaseModel):
    name: str
    description: Optional[str] = None


class PortfolioCreate(PortfolioBase):
    pass


class PortfolioUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


class PortfolioResponse(PortfolioBase):
    id: int
    created_at: datetime
    updated_at: datetime
    holdings: list[HoldingResponse] = []

    model_config = {"from_attributes": True}


class PortfolioListResponse(PortfolioBase):
    id: int
    created_at: datetime
    updated_at: datetime
    holdings_count: int = 0

    model_config = {"from_attributes": True}
