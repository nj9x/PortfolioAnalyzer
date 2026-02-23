from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Float, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from app.database import Base


class AnalysisReport(Base):
    __tablename__ = "analysis_reports"

    id = Column(Integer, primary_key=True, index=True)
    portfolio_id = Column(Integer, ForeignKey("portfolios.id"), nullable=False)
    summary = Column(Text, nullable=False)
    risk_score = Column(Integer, nullable=True)
    market_outlook = Column(String(50), nullable=True)
    raw_response = Column(Text, nullable=True)
    context_snapshot = Column(Text, nullable=True)
    model_used = Column(String(100), nullable=True)
    technical_summary = Column(Text, nullable=True)
    fundamental_summary = Column(Text, nullable=True)
    risk_analysis = Column(Text, nullable=True)
    options_summary = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)

    portfolio = relationship("Portfolio", back_populates="reports")
    recommendations = relationship(
        "Recommendation", back_populates="report", cascade="all, delete-orphan"
    )


class Recommendation(Base):
    __tablename__ = "recommendations"

    id = Column(Integer, primary_key=True, index=True)
    report_id = Column(Integer, ForeignKey("analysis_reports.id"), nullable=False)
    ticker = Column(String(20), nullable=False)
    action = Column(String(20), nullable=False)
    confidence = Column(String(20), nullable=True)
    reasoning = Column(Text, nullable=False)
    target_price = Column(Float, nullable=True)
    time_horizon = Column(String(50), nullable=True)
    priority = Column(Integer, default=0)

    report = relationship("AnalysisReport", back_populates="recommendations")
