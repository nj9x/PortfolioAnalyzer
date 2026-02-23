import json
from datetime import datetime
from typing import Optional, Any
from pydantic import BaseModel, model_validator


class RecommendationResponse(BaseModel):
    id: int
    ticker: str
    action: str
    confidence: Optional[str] = None
    reasoning: str
    target_price: Optional[float] = None
    time_horizon: Optional[str] = None
    priority: int = 0

    model_config = {"from_attributes": True}


# --- Nested models for advanced analysis sections ---

class TechnicalIndicator(BaseModel):
    ticker: str
    rsi: Optional[dict] = None
    macd: Optional[dict] = None
    bollinger: Optional[dict] = None
    moving_averages: Optional[dict] = None
    support_resistance: Optional[dict] = None
    volume: Optional[dict] = None
    overall_signal: Optional[str] = None
    error: Optional[str] = None


class FundamentalMetrics(BaseModel):
    ticker: str
    valuation: Optional[dict] = None
    quality: Optional[dict] = None
    growth: Optional[dict] = None
    health: Optional[dict] = None
    valuation_flag: Optional[str] = None
    flag_reasoning: Optional[str] = None
    error: Optional[str] = None


class PortfolioRiskMetrics(BaseModel):
    portfolio_beta: Optional[dict] = None
    sector_concentration: Optional[dict] = None
    position_sizing: Optional[dict] = None
    correlation: Optional[dict] = None
    drawdowns: Optional[dict] = None
    stop_loss_alerts: Optional[list] = None


class OptionsData(BaseModel):
    ticker: str
    has_options: bool = False
    expiration: Optional[str] = None
    days_to_expiry: Optional[int] = None
    atm_strike: Optional[float] = None
    call: Optional[dict] = None
    put: Optional[dict] = None
    volatility: Optional[dict] = None
    error: Optional[str] = None


class TechnicalAnalysisSection(BaseModel):
    commentary: Optional[str] = None
    indicators: dict[str, Any] = {}


class FundamentalAnalysisSection(BaseModel):
    commentary: Optional[str] = None
    metrics: dict[str, Any] = {}


class RiskManagementSection(BaseModel):
    commentary: Optional[str] = None
    metrics: Optional[dict] = None


class OptionsAnalysisSection(BaseModel):
    commentary: Optional[str] = None
    data: dict[str, Any] = {}


# --- Response models ---

class AnalysisReportResponse(BaseModel):
    id: int
    portfolio_id: int
    summary: str
    risk_score: Optional[int] = None
    market_outlook: Optional[str] = None
    model_used: Optional[str] = None
    created_at: datetime
    recommendations: list[RecommendationResponse] = []
    technical_analysis: Optional[TechnicalAnalysisSection] = None
    fundamental_analysis: Optional[FundamentalAnalysisSection] = None
    risk_management: Optional[RiskManagementSection] = None
    options_analysis: Optional[OptionsAnalysisSection] = None

    model_config = {"from_attributes": True}

    @model_validator(mode="before")
    @classmethod
    def deserialize_json_columns(cls, data):
        """Deserialize JSON text columns from the ORM model."""
        if hasattr(data, "__dict__"):
            # ORM model — convert to dict
            obj = {}
            for field in [
                "id", "portfolio_id", "summary", "risk_score",
                "market_outlook", "model_used", "created_at",
                "recommendations",
            ]:
                obj[field] = getattr(data, field, None)

            # Deserialize the 4 JSON text columns
            for db_col, schema_key in [
                ("technical_summary", "technical_analysis"),
                ("fundamental_summary", "fundamental_analysis"),
                ("risk_analysis", "risk_management"),
                ("options_summary", "options_analysis"),
            ]:
                raw = getattr(data, db_col, None)
                if raw:
                    try:
                        obj[schema_key] = json.loads(raw)
                    except (json.JSONDecodeError, TypeError):
                        obj[schema_key] = None
                else:
                    obj[schema_key] = None

            return obj
        return data


class AnalysisReportListResponse(BaseModel):
    id: int
    portfolio_id: int
    summary: str
    risk_score: Optional[int] = None
    market_outlook: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}
