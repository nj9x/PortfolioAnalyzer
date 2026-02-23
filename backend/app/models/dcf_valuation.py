from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Float, Text, DateTime
from app.database import Base


class DCFValuation(Base):
    __tablename__ = "dcf_valuations"

    id = Column(Integer, primary_key=True, index=True)

    # Identification
    ticker = Column(String(20), nullable=True, index=True)
    company_name = Column(String(255), nullable=True)

    # Core inputs
    base_fcf = Column(Float, nullable=False)
    projection_years = Column(Integer, default=5)
    growth_rate_phase1 = Column(Float, nullable=False)
    growth_rate_phase2 = Column(Float, nullable=False)
    discount_rate = Column(Float, nullable=False)
    terminal_method = Column(String(20), default="gordon")
    terminal_multiple = Column(Float, nullable=True)

    # WACC components
    risk_free_rate = Column(Float, nullable=True)
    equity_risk_premium = Column(Float, nullable=True)
    beta = Column(Float, nullable=True)
    cost_of_equity = Column(Float, nullable=True)
    cost_of_debt = Column(Float, nullable=True)
    tax_rate = Column(Float, nullable=True)
    debt_weight = Column(Float, nullable=True)
    equity_weight = Column(Float, nullable=True)

    # Balance sheet adjustments
    total_debt = Column(Float, nullable=True)
    total_cash = Column(Float, nullable=True)
    shares_outstanding = Column(Float, nullable=True)
    current_price = Column(Float, nullable=True)

    # Computed results
    enterprise_value = Column(Float, nullable=True)
    equity_value = Column(Float, nullable=True)
    intrinsic_value_per_share = Column(Float, nullable=True)
    upside_downside_pct = Column(Float, nullable=True)
    margin_of_safety = Column(Float, nullable=True)
    terminal_value = Column(Float, nullable=True)

    # JSON blobs
    projected_fcfs = Column(Text, nullable=True)
    sensitivity_table = Column(Text, nullable=True)
    valuation_verdict = Column(String(30), nullable=True)

    created_at = Column(
        DateTime, default=lambda: datetime.now(timezone.utc), index=True
    )
