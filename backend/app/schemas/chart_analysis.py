import json
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, model_validator


class EntryPoint(BaseModel):
    price: float
    type: str
    reasoning: str = ""
    stop_loss: Optional[float] = None
    take_profit: Optional[float] = None
    risk_reward_ratio: Optional[float] = None


class PriceLevel(BaseModel):
    price: float
    strength: Optional[str] = None
    notes: Optional[str] = None


class BreakRetestLevel(BaseModel):
    price: float
    direction: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None


class ChartPattern(BaseModel):
    name: str
    status: Optional[str] = None
    implications: Optional[str] = None
    target_price: Optional[float] = None


class TradeSuggestion(BaseModel):
    direction: str
    entry: Optional[float] = None
    stop_loss: Optional[float] = None
    take_profit_1: Optional[float] = None
    take_profit_2: Optional[float] = None
    risk_reward: Optional[float] = None
    position_size_suggestion: Optional[str] = None
    reasoning: str = ""
    timeframe: Optional[str] = None


class RiskRewardAnalysis(BaseModel):
    best_rr_setup: Optional[str] = None
    overall_risk_level: Optional[str] = None
    key_invalidation: Optional[str] = None


class IndicatorsVisible(BaseModel):
    moving_averages: list[str] = []
    oscillators: list[str] = []
    volume: bool = False
    other: list[str] = []


class ChartAnalysisParsed(BaseModel):
    """Full parsed results from Claude's chart analysis."""

    ticker: Optional[str] = None
    timeframe: Optional[str] = None
    trend: Optional[str] = None
    overall_bias: Optional[str] = None
    confidence: Optional[str] = None
    summary: Optional[str] = None
    entry_points: list[EntryPoint] = []
    support_levels: list[PriceLevel] = []
    resistance_levels: list[PriceLevel] = []
    break_retest_levels: list[BreakRetestLevel] = []
    patterns: list[ChartPattern] = []
    trade_suggestions: list[TradeSuggestion] = []
    risk_reward_analysis: Optional[RiskRewardAnalysis] = None
    key_observations: list[str] = []
    indicators_visible: Optional[IndicatorsVisible] = None


class ChartAnalysisResponse(BaseModel):
    id: int
    image_path: str
    original_filename: Optional[str] = None
    ticker: Optional[str] = None
    timeframe: Optional[str] = None
    analysis_type: Optional[str] = None
    trend: Optional[str] = None
    overall_bias: Optional[str] = None
    model_used: Optional[str] = None
    created_at: datetime
    results: Optional[ChartAnalysisParsed] = None

    model_config = {"from_attributes": True}

    @model_validator(mode="before")
    @classmethod
    def deserialize_parsed_results(cls, data):
        if hasattr(data, "__dict__"):
            obj = {}
            for field in [
                "id", "image_path", "original_filename", "ticker",
                "timeframe", "analysis_type", "trend", "overall_bias",
                "model_used", "created_at",
            ]:
                obj[field] = getattr(data, field, None)
            raw = getattr(data, "parsed_results", None)
            if raw:
                try:
                    obj["results"] = json.loads(raw)
                except (json.JSONDecodeError, TypeError):
                    obj["results"] = None
            else:
                obj["results"] = None
            return obj
        return data


class ChartAnalysisListResponse(BaseModel):
    id: int
    ticker: Optional[str] = None
    timeframe: Optional[str] = None
    trend: Optional[str] = None
    overall_bias: Optional[str] = None
    original_filename: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}
