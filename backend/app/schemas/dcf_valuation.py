import json
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, model_validator


class ProjectedFCF(BaseModel):
    year: int
    fcf: float
    pv_fcf: float
    growth_rate: float


class SensitivityCell(BaseModel):
    wacc: float
    terminal_growth: float
    intrinsic_value: float


class WACCInputs(BaseModel):
    risk_free_rate: float = 0.042
    equity_risk_premium: float = 0.055
    beta: float = 1.0
    cost_of_debt: float = 0.05
    tax_rate: float = 0.21
    debt_weight: float = 0.0
    equity_weight: float = 1.0


# --- Request schemas ---


class DCFRunRequest(BaseModel):
    """All inputs for running a DCF calculation."""
    ticker: Optional[str] = None
    company_name: Optional[str] = None

    base_fcf: float
    projection_years: int = 5
    growth_rate_phase1: float = 0.10
    growth_rate_phase2: float = 0.03
    discount_rate: Optional[float] = None
    terminal_method: str = "gordon"
    terminal_multiple: Optional[float] = None
    latest_ebitda: Optional[float] = None

    wacc_inputs: Optional[WACCInputs] = None

    total_debt: float = 0.0
    total_cash: float = 0.0
    shares_outstanding: float = 1.0
    current_price: Optional[float] = None

    save: bool = True


# --- Response schemas ---


class DCFFinancialsResponse(BaseModel):
    ticker: str
    company_name: Optional[str] = None
    current_price: Optional[float] = None
    free_cashflow: Optional[float] = None
    revenue: Optional[float] = None
    ebitda: Optional[float] = None
    net_income: Optional[float] = None
    total_debt: Optional[float] = None
    total_cash: Optional[float] = None
    shares_outstanding: Optional[float] = None
    beta: Optional[float] = None
    market_cap: Optional[float] = None
    enterprise_value: Optional[float] = None
    revenue_growth: Optional[float] = None
    earnings_growth: Optional[float] = None
    profit_margins: Optional[float] = None
    debt_to_equity: Optional[float] = None
    ev_to_ebitda: Optional[float] = None
    risk_free_rate: Optional[float] = None
    suggested_wacc: Optional[float] = None
    wacc_inputs: Optional[WACCInputs] = None


class DCFResultResponse(BaseModel):
    id: Optional[int] = None
    ticker: Optional[str] = None
    company_name: Optional[str] = None

    intrinsic_value_per_share: float
    current_price: Optional[float] = None
    upside_downside_pct: Optional[float] = None
    margin_of_safety: Optional[float] = None
    valuation_verdict: str

    enterprise_value: float
    equity_value: float
    terminal_value: float
    discount_rate: float

    projected_fcfs: list[ProjectedFCF] = []
    sensitivity_table: list[list[SensitivityCell]] = []

    base_fcf: float
    projection_years: int
    growth_rate_phase1: float
    growth_rate_phase2: float
    terminal_method: str
    terminal_multiple: Optional[float] = None
    shares_outstanding: float
    total_debt: float
    total_cash: float

    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}

    @model_validator(mode="before")
    @classmethod
    def deserialize_json_fields(cls, data):
        if hasattr(data, "__dict__"):
            obj = {}
            for field in cls.model_fields:
                obj[field] = getattr(data, field, None)
            for json_field in ["projected_fcfs", "sensitivity_table"]:
                raw = getattr(data, json_field, None)
                if isinstance(raw, str):
                    try:
                        obj[json_field] = json.loads(raw)
                    except (json.JSONDecodeError, TypeError):
                        obj[json_field] = []
            return obj
        return data


class DCFListResponse(BaseModel):
    id: int
    ticker: Optional[str] = None
    company_name: Optional[str] = None
    intrinsic_value_per_share: Optional[float] = None
    current_price: Optional[float] = None
    upside_downside_pct: Optional[float] = None
    valuation_verdict: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}
