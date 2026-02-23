from app.config import get_settings

INDICATORS = {
    "DFF": "Federal Funds Rate",
    "CPIAUCSL": "Consumer Price Index",
    "UNRATE": "Unemployment Rate",
    "GDP": "Gross Domestic Product",
    "T10Y2Y": "10Y-2Y Treasury Spread",
    "VIXCLS": "VIX Volatility Index",
    "DGS10": "10-Year Treasury Rate",
}


def fetch_indicators() -> dict:
    """Fetch key economic indicators from FRED."""
    settings = get_settings()
    if not settings.FRED_API_KEY:
        return {}

    try:
        from fredapi import Fred

        fred = Fred(api_key=settings.FRED_API_KEY)
        results = {}
        for series_id, name in INDICATORS.items():
            try:
                series = fred.get_series(series_id)
                latest = series.dropna().iloc[-1]
                results[series_id] = {
                    "name": name,
                    "value": round(float(latest), 4),
                    "date": str(series.dropna().index[-1].date()),
                }
            except Exception:
                continue
        return results
    except Exception:
        return {}


def fetch_risk_free_rate() -> float | None:
    """Fetch the latest 10-Year Treasury rate from FRED (series DGS10).

    Returns rate as a decimal (e.g., 0.042 for 4.2%), or None if unavailable.
    """
    settings = get_settings()
    if not settings.FRED_API_KEY:
        return None
    try:
        from fredapi import Fred

        fred = Fred(api_key=settings.FRED_API_KEY)
        series = fred.get_series("DGS10")
        latest = series.dropna().iloc[-1]
        return round(float(latest) / 100, 4)
    except Exception:
        return None
