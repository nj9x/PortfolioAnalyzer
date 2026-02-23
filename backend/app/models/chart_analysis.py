from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Text, DateTime
from app.database import Base


class ChartAnalysis(Base):
    __tablename__ = "chart_analyses"

    id = Column(Integer, primary_key=True, index=True)

    # Image storage
    image_path = Column(String(500), nullable=False)
    original_filename = Column(String(255), nullable=True)

    # Extracted / user-provided metadata
    ticker = Column(String(20), nullable=True)
    timeframe = Column(String(50), nullable=True)
    analysis_type = Column(String(50), default="technical")

    # Claude response storage
    raw_response = Column(Text, nullable=True)
    parsed_results = Column(Text, nullable=True)
    model_used = Column(String(100), nullable=True)

    # Top-level extracted fields for quick access
    trend = Column(String(20), nullable=True)
    overall_bias = Column(String(20), nullable=True)

    created_at = Column(
        DateTime, default=lambda: datetime.now(timezone.utc), index=True
    )
