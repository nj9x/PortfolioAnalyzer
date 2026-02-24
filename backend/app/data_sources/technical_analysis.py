"""Technical analysis indicators computed from OHLCV data via pandas/numpy."""

import numpy as np
import pandas as pd
from app.data_sources import massive


def compute_all_technicals(tickers: list[str]) -> dict:
    """Compute technical indicators for all tickers."""
    results = {}
    for ticker in tickers:
        history = massive.fetch_history(ticker, period="1y")
        if len(history) < 30:
            results[ticker] = {"error": f"Insufficient history for {ticker} ({len(history)} days)"}
            continue
        try:
            results[ticker] = _compute_indicators(history, ticker)
        except Exception as e:
            results[ticker] = {"error": str(e)}
    return results


def _compute_indicators(history: list[dict], ticker: str) -> dict:
    """Compute all indicators for a single ticker from OHLCV history."""
    df = pd.DataFrame(history)
    closes = df["close"].astype(float)
    highs = df["high"].astype(float)
    lows = df["low"].astype(float)
    volumes = df["volume"].astype(float)

    rsi = _compute_rsi(closes)
    macd = _compute_macd(closes)
    bollinger = _compute_bollinger_bands(closes)
    mas = _compute_moving_averages(closes)
    sr = _compute_support_resistance(highs, lows, closes)
    vol = _compute_volume_analysis(volumes)

    indicators = {
        "ticker": ticker,
        "rsi": rsi,
        "macd": macd,
        "bollinger": bollinger,
        "moving_averages": mas,
        "support_resistance": sr,
        "volume": vol,
    }
    indicators["overall_signal"] = _determine_overall_signal(indicators)
    return indicators


def _compute_rsi(closes: pd.Series, period: int = 14) -> dict:
    """RSI via Wilder's smoothing."""
    delta = closes.diff()
    gain = delta.where(delta > 0, 0.0)
    loss = -delta.where(delta < 0, 0.0)
    avg_gain = gain.ewm(alpha=1 / period, min_periods=period).mean()
    avg_loss = loss.ewm(alpha=1 / period, min_periods=period).mean()
    rs = avg_gain / avg_loss
    rsi = 100 - (100 / (1 + rs))
    value = round(float(rsi.iloc[-1]), 1) if not rsi.empty else None

    if value is None:
        signal = "NEUTRAL"
    elif value > 70:
        signal = "OVERBOUGHT"
    elif value < 30:
        signal = "OVERSOLD"
    else:
        signal = "NEUTRAL"

    return {"value": value, "signal": signal}


def _compute_macd(
    closes: pd.Series, fast: int = 12, slow: int = 26, signal_period: int = 9
) -> dict:
    """MACD line, signal line, histogram."""
    ema_fast = closes.ewm(span=fast, adjust=False).mean()
    ema_slow = closes.ewm(span=slow, adjust=False).mean()
    macd_line = ema_fast - ema_slow
    signal_line = macd_line.ewm(span=signal_period, adjust=False).mean()
    histogram = macd_line - signal_line

    macd_val = round(float(macd_line.iloc[-1]), 4)
    signal_val = round(float(signal_line.iloc[-1]), 4)
    hist_val = round(float(histogram.iloc[-1]), 4)

    # Crossover detection
    if len(histogram) >= 2:
        prev_hist = float(histogram.iloc[-2])
        if hist_val > 0 and prev_hist <= 0:
            signal = "BULLISH"
        elif hist_val < 0 and prev_hist >= 0:
            signal = "BEARISH"
        elif hist_val > 0:
            signal = "BULLISH"
        else:
            signal = "BEARISH"
    else:
        signal = "NEUTRAL"

    return {
        "macd_line": macd_val,
        "signal_line": signal_val,
        "histogram": hist_val,
        "signal": signal,
    }


def _compute_bollinger_bands(
    closes: pd.Series, period: int = 20, std_dev: float = 2.0
) -> dict:
    """Bollinger Bands with squeeze detection."""
    sma = closes.rolling(period).mean()
    std = closes.rolling(period).std()
    upper = sma + std_dev * std
    lower = sma - std_dev * std

    upper_val = float(upper.iloc[-1])
    lower_val = float(lower.iloc[-1])
    middle_val = float(sma.iloc[-1])
    price = float(closes.iloc[-1])

    band_width = upper_val - lower_val
    position = (price - lower_val) / band_width if band_width > 0 else 0.5

    # Squeeze: current bandwidth below 6-month average bandwidth
    bandwidth_series = (upper - lower) / sma
    avg_bandwidth = float(bandwidth_series.rolling(120).mean().iloc[-1]) if len(bandwidth_series) >= 120 else float(bandwidth_series.mean())
    current_bandwidth = float(bandwidth_series.iloc[-1])
    squeeze = current_bandwidth < avg_bandwidth * 0.75

    if position > 0.8:
        signal = "OVERBOUGHT"
    elif position < 0.2:
        signal = "OVERSOLD"
    else:
        signal = "NEUTRAL"

    return {
        "upper": round(upper_val, 2),
        "middle": round(middle_val, 2),
        "lower": round(lower_val, 2),
        "bandwidth": round(current_bandwidth, 4),
        "position": round(position, 3),
        "squeeze": squeeze,
        "signal": signal,
    }


def _compute_moving_averages(closes: pd.Series) -> dict:
    """SMA 20/50/200 with golden/death cross detection."""
    price = float(closes.iloc[-1])
    sma_20 = float(closes.rolling(20).mean().iloc[-1]) if len(closes) >= 20 else None
    sma_50 = float(closes.rolling(50).mean().iloc[-1]) if len(closes) >= 50 else None
    sma_200 = float(closes.rolling(200).mean().iloc[-1]) if len(closes) >= 200 else None

    # Golden/death cross: SMA50 crossing SMA200
    golden_cross = False
    death_cross = False
    if sma_50 is not None and sma_200 is not None and len(closes) >= 201:
        sma50_series = closes.rolling(50).mean()
        sma200_series = closes.rolling(200).mean()
        diff_now = sma50_series.iloc[-1] - sma200_series.iloc[-1]
        diff_prev = sma50_series.iloc[-2] - sma200_series.iloc[-2]
        if diff_now > 0 and diff_prev <= 0:
            golden_cross = True
        elif diff_now < 0 and diff_prev >= 0:
            death_cross = True

    price_vs_sma200 = "ABOVE" if sma_200 and price > sma_200 else "BELOW" if sma_200 else "N/A"

    return {
        "sma_20": round(sma_20, 2) if sma_20 else None,
        "sma_50": round(sma_50, 2) if sma_50 else None,
        "sma_200": round(sma_200, 2) if sma_200 else None,
        "golden_cross": golden_cross,
        "death_cross": death_cross,
        "price_vs_sma200": price_vs_sma200,
    }


def _compute_support_resistance(
    highs: pd.Series, lows: pd.Series, closes: pd.Series, lookback: int = 60
) -> dict:
    """Identify support/resistance from recent price pivots."""
    price = float(closes.iloc[-1])
    recent_highs = highs.tail(lookback)
    recent_lows = lows.tail(lookback)

    # Find local maxima and minima using rolling windows
    window = 5
    resistance_levels = []
    support_levels = []

    for i in range(window, len(recent_highs) - window):
        if recent_highs.iloc[i] == recent_highs.iloc[i - window : i + window + 1].max():
            resistance_levels.append(float(recent_highs.iloc[i]))
        if recent_lows.iloc[i] == recent_lows.iloc[i - window : i + window + 1].min():
            support_levels.append(float(recent_lows.iloc[i]))

    # Find nearest support below price and resistance above price
    supports_below = [s for s in support_levels if s < price]
    resistances_above = [r for r in resistance_levels if r > price]

    nearest_support = max(supports_below) if supports_below else float(recent_lows.min())
    nearest_resistance = min(resistances_above) if resistances_above else float(recent_highs.max())

    support_dist = round(((price - nearest_support) / price) * -100, 2)
    resistance_dist = round(((nearest_resistance - price) / price) * 100, 2)

    return {
        "nearest_support": round(nearest_support, 2),
        "nearest_resistance": round(nearest_resistance, 2),
        "support_distance_pct": support_dist,
        "resistance_distance_pct": resistance_dist,
    }


def _compute_volume_analysis(volumes: pd.Series) -> dict:
    """Current volume vs 20-day average."""
    current = float(volumes.iloc[-1])
    avg_20d = float(volumes.rolling(20).mean().iloc[-1]) if len(volumes) >= 20 else current
    ratio = round(current / avg_20d, 2) if avg_20d > 0 else 1.0

    if ratio > 1.5:
        signal = "HIGH"
    elif ratio < 0.5:
        signal = "LOW"
    else:
        signal = "NORMAL"

    return {
        "current": int(current),
        "avg_20d": int(avg_20d),
        "ratio": ratio,
        "signal": signal,
    }


def _determine_overall_signal(indicators: dict) -> str:
    """Score-based aggregate signal."""
    score = 0

    # RSI
    rsi_signal = indicators.get("rsi", {}).get("signal", "NEUTRAL")
    if rsi_signal == "OVERSOLD":
        score += 1
    elif rsi_signal == "OVERBOUGHT":
        score -= 1

    # MACD
    macd_signal = indicators.get("macd", {}).get("signal", "NEUTRAL")
    if macd_signal == "BULLISH":
        score += 1
    elif macd_signal == "BEARISH":
        score -= 1

    # Price vs SMA200
    sma_pos = indicators.get("moving_averages", {}).get("price_vs_sma200", "N/A")
    if sma_pos == "ABOVE":
        score += 1
    elif sma_pos == "BELOW":
        score -= 1

    # Bollinger position
    bb_pos = indicators.get("bollinger", {}).get("position", 0.5)
    if bb_pos < 0.2:
        score += 1
    elif bb_pos > 0.8:
        score -= 1

    # Golden/Death cross
    if indicators.get("moving_averages", {}).get("golden_cross"):
        score += 1
    if indicators.get("moving_averages", {}).get("death_cross"):
        score -= 1

    if score >= 2:
        return "BULLISH"
    elif score <= -2:
        return "BEARISH"
    return "NEUTRAL"
