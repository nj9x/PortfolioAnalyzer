import json
from datetime import datetime
from typing import Optional, Literal
from pydantic import BaseModel, field_validator


PORTFOLIO_CATEGORIES = Literal["conservative", "balanced", "high-growth"]


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
    client_name: Optional[str] = None
    category: Optional[PORTFOLIO_CATEGORIES] = "balanced"
    benchmark: Optional[str] = "SPY"
    target_allocation: Optional[dict] = None
    risk_tolerance: Optional[str] = "moderate"
    cash_balance: Optional[float] = 0.0


class PortfolioCreate(PortfolioBase):
    pass


class PortfolioUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    client_name: Optional[str] = None
    category: Optional[PORTFOLIO_CATEGORIES] = None
    benchmark: Optional[str] = None
    target_allocation: Optional[dict] = None
    risk_tolerance: Optional[str] = None
    cash_balance: Optional[float] = None


class PortfolioResponse(PortfolioBase):
    id: int
    created_at: datetime
    updated_at: datetime
    holdings: list[HoldingResponse] = []

    model_config = {"from_attributes": True}

    @field_validator("target_allocation", mode="before")
    @classmethod
    def parse_target_allocation(cls, v):
        if isinstance(v, str):
            try:
                return json.loads(v)
            except (json.JSONDecodeError, TypeError):
                return None
        return v


class PortfolioListResponse(PortfolioBase):
    id: int
    created_at: datetime
    updated_at: datetime
    holdings_count: int = 0

    model_config = {"from_attributes": True}

    @field_validator("target_allocation", mode="before")
    @classmethod
    def parse_target_allocation(cls, v):
        if isinstance(v, str):
            try:
                return json.loads(v)
            except (json.JSONDecodeError, TypeError):
                return None
        return v


# ─── Dashboard Overview Response Models ────────────────────────────────


class HoldingAlert(BaseModel):
    ticker: str
    alert_type: str  # "trim_opportunity" | "entry_point" | "review_needed"
    message: str
    gain_loss_pct: Optional[float] = None
    technical_signal: Optional[str] = None
    valuation_flag: Optional[str] = None


class HoldingOverview(BaseModel):
    ticker: str
    shares: float
    cost_basis: Optional[float] = None
    current_price: Optional[float] = None
    market_value: Optional[float] = None
    gain_loss_pct: Optional[float] = None
    day_change_pct: Optional[float] = None
    alerts: list[HoldingAlert] = []


class PortfolioOverview(BaseModel):
    id: int
    name: str
    client_name: Optional[str] = None
    category: Optional[str] = None
    description: Optional[str] = None
    holdings_count: int = 0
    total_value: float = 0.0
    total_cost: float = 0.0
    total_return_pct: Optional[float] = None
    day_change_pct: Optional[float] = None
    is_underperforming: bool = False
    underperformance_reason: Optional[str] = None
    holdings: list[HoldingOverview] = []
    alerts: list[HoldingAlert] = []


class DashboardOverviewResponse(BaseModel):
    portfolios: list[PortfolioOverview] = []
    categories: dict[str, list[int]] = {}
    total_aum: float = 0.0
    alert_summary: dict[str, int] = {}
