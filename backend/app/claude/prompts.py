SYSTEM_PROMPT = """You are a senior financial advisor AI assistant analyzing client portfolios.
You provide actionable, specific investment recommendations based on current market data,
economic indicators, technical analysis, fundamental screening, risk metrics, and options data.

IMPORTANT RULES:
- Always provide specific, actionable recommendations for each holding
- Assign a confidence level (high/medium/low) to each recommendation
- Consider macroeconomic conditions from the FRED data provided
- Factor in prediction market probabilities as forward-looking sentiment indicators
- Consider news sentiment and its potential impact on holdings
- Integrate technical signals (RSI, MACD, Bollinger, MAs) into your analysis
- Use fundamental metrics (P/E, ROIC, FCF yield) to assess valuation
- Evaluate portfolio risk (beta, concentration, correlation, drawdowns)
- Consider options data (IV vs HV, Greeks) for hedging recommendations
- Identify concentration risk, sector imbalance, and missing diversification
- Always include a risk assessment score from 1 (very low risk) to 10 (very high risk)
- Provide a time horizon for each recommendation
- This is for a financial advisory firm - be professional and precise
- Always caveat that these are AI-generated suggestions, not financial advice

OUTPUT FORMAT (you MUST follow this JSON structure exactly):
{
    "summary": "2-3 paragraph overall analysis of the portfolio",
    "risk_score": <1-10 integer>,
    "market_outlook": "bullish" | "bearish" | "neutral",
    "recommendations": [
        {
            "ticker": "AAPL",
            "action": "HOLD",
            "confidence": "high",
            "reasoning": "Detailed reasoning for this recommendation",
            "target_price": 185.00,
            "time_horizon": "1-3 months",
            "priority": 1
        }
    ],
    "general_advice": [
        "Portfolio-level suggestions here"
    ],
    "technical_analysis": {
        "commentary": "2-3 paragraph analysis of technical signals across the portfolio",
        "per_ticker": {
            "AAPL": "Brief technical assessment for this ticker"
        }
    },
    "fundamental_analysis": {
        "commentary": "2-3 paragraph analysis of fundamental valuations across the portfolio",
        "per_ticker": {
            "AAPL": "Brief fundamental assessment for this ticker"
        }
    },
    "risk_management": {
        "commentary": "2-3 paragraph risk analysis with specific action items",
        "key_risks": ["Risk 1", "Risk 2"],
        "hedging_suggestions": ["Suggestion 1"]
    },
    "options_analysis": {
        "commentary": "2-3 paragraph analysis of options landscape and volatility",
        "per_ticker": {
            "AAPL": "Brief options/volatility assessment for this ticker"
        }
    }
}"""


def build_user_message(
    portfolio_name: str,
    holdings: list[dict],
    quotes: dict,
    news: list[dict],
    predictions: list[dict],
    economic: dict,
    technicals: dict | None = None,
    fundamentals_data: dict | None = None,
    risk_data: dict | None = None,
    options: dict | None = None,
) -> str:
    """Assemble all market context into a structured prompt for Claude."""
    sections = [f"# Portfolio Analysis Request: {portfolio_name}\n"]

    # Section 1: Portfolio Holdings
    sections.append("## PORTFOLIO HOLDINGS")
    total_value = 0
    for h in holdings:
        ticker = h["ticker"]
        quote = quotes.get(ticker, {})
        current_price = quote.get("current_price")
        cost_basis = h.get("cost_basis")
        shares = h["shares"]

        position_value = shares * current_price if current_price else None
        if position_value:
            total_value += position_value

        gain_loss = ""
        if cost_basis and current_price:
            pct = ((current_price - cost_basis) / cost_basis) * 100
            gain_loss = f", Gain/Loss: {pct:+.1f}%"

        value_str = f"${position_value:,.2f}" if position_value else "N/A"
        sections.append(
            f"- {ticker}: {shares} shares, "
            f"Cost Basis: ${cost_basis or 'N/A'}, "
            f"Current: ${current_price or 'N/A'}, "
            f"Value: {value_str}, "
            f"Type: {h.get('asset_type', 'equity')}{gain_loss}"
        )
    sections.append(f"\nTotal Portfolio Value: ${total_value:,.2f}\n")

    # Section 2: Market Data
    sections.append("## CURRENT MARKET DATA")
    for ticker, quote in quotes.items():
        if quote.get("error"):
            sections.append(f"- {ticker}: Data unavailable")
            continue
        sections.append(
            f"- {ticker} ({quote.get('name', 'N/A')}): "
            f"${quote.get('current_price', 'N/A')}, "
            f"Day: {quote.get('day_change_pct', 'N/A')}%, "
            f"P/E: {quote.get('pe_ratio', 'N/A')}, "
            f"52wk: ${quote.get('fifty_two_week_low', '?')}-${quote.get('fifty_two_week_high', '?')}, "
            f"Sector: {quote.get('sector', 'N/A')}"
        )

    # Section 3: Technical Analysis
    if technicals:
        sections.append("\n## TECHNICAL ANALYSIS INDICATORS")
        for ticker, data in technicals.items():
            if data.get("error"):
                sections.append(f"- {ticker}: {data['error']}")
                continue
            rsi = data.get("rsi", {})
            macd = data.get("macd", {})
            bb = data.get("bollinger", {})
            mas = data.get("moving_averages", {})
            sr = data.get("support_resistance", {})
            vol = data.get("volume", {})
            overall = data.get("overall_signal", "N/A")

            sections.append(f"\n### {ticker} (Overall: {overall})")
            sections.append(
                f"  RSI: {rsi.get('value', 'N/A')} ({rsi.get('signal', 'N/A')})"
            )
            sections.append(
                f"  MACD: line={macd.get('macd_line', 'N/A')}, "
                f"signal={macd.get('signal_line', 'N/A')}, "
                f"histogram={macd.get('histogram', 'N/A')} ({macd.get('signal', 'N/A')})"
            )
            sections.append(
                f"  Bollinger: upper={bb.get('upper', 'N/A')}, "
                f"mid={bb.get('middle', 'N/A')}, "
                f"lower={bb.get('lower', 'N/A')}, "
                f"position={bb.get('position', 'N/A')}, "
                f"squeeze={'YES' if bb.get('squeeze') else 'NO'} ({bb.get('signal', 'N/A')})"
            )
            sections.append(
                f"  MAs: SMA20={mas.get('sma_20', 'N/A')}, "
                f"SMA50={mas.get('sma_50', 'N/A')}, "
                f"SMA200={mas.get('sma_200', 'N/A')}, "
                f"vs200: {mas.get('price_vs_sma200', 'N/A')}"
            )
            if mas.get("golden_cross"):
                sections.append("  ** GOLDEN CROSS detected **")
            if mas.get("death_cross"):
                sections.append("  ** DEATH CROSS detected **")
            sections.append(
                f"  Support: {sr.get('nearest_support', 'N/A')} ({sr.get('support_distance_pct', 'N/A')}%), "
                f"Resistance: {sr.get('nearest_resistance', 'N/A')} ({sr.get('resistance_distance_pct', 'N/A')}%)"
            )
            sections.append(
                f"  Volume: {vol.get('ratio', 'N/A')}x avg ({vol.get('signal', 'N/A')})"
            )

    # Section 4: Fundamental Screening
    if fundamentals_data:
        sections.append("\n## FUNDAMENTAL SCREENING")
        for ticker, data in fundamentals_data.items():
            if data.get("error"):
                sections.append(f"- {ticker}: {data['error']}")
                continue
            val = data.get("valuation", {})
            qual = data.get("quality", {})
            grow = data.get("growth", {})
            health = data.get("health", {})
            flag = data.get("valuation_flag", "N/A")
            reason = data.get("flag_reasoning", "")

            sections.append(f"\n### {ticker} — {flag}")
            sections.append(f"  Reasoning: {reason}")
            sections.append(
                f"  Valuation: P/E={val.get('pe_ratio', 'N/A')}, "
                f"Fwd P/E={val.get('forward_pe', 'N/A')}, "
                f"EV/EBIT={val.get('ev_ebit', 'N/A')}, "
                f"Earnings Yield={val.get('earnings_yield', 'N/A')}%, "
                f"FCF Yield={val.get('fcf_yield', 'N/A')}%, "
                f"P/B={val.get('price_to_book', 'N/A')}"
            )
            sections.append(
                f"  Quality: ROIC={qual.get('roic', 'N/A')}%, "
                f"ROE={qual.get('roe', 'N/A')}%, "
                f"Margin={qual.get('profit_margin', 'N/A')}%"
            )
            sections.append(
                f"  Growth: Rev={grow.get('revenue_growth', 'N/A')}%, "
                f"Earnings={grow.get('earnings_growth', 'N/A')}%, "
                f"Quarterly={grow.get('earnings_quarterly_growth', 'N/A')}%"
            )
            sections.append(
                f"  Health: D/E={health.get('debt_to_equity', 'N/A')}, "
                f"Current={health.get('current_ratio', 'N/A')}, "
                f"Quick={health.get('quick_ratio', 'N/A')}"
            )

    # Section 5: Portfolio Risk
    if risk_data:
        sections.append("\n## PORTFOLIO RISK METRICS")
        beta_data = risk_data.get("portfolio_beta", {})
        sections.append(
            f"Portfolio Beta: {beta_data.get('value', 'N/A')} — {beta_data.get('interpretation', '')}"
        )
        if beta_data.get("individual"):
            beta_parts = [f"{t}={b}" for t, b in beta_data["individual"].items()]
            sections.append(f"  Individual betas: {', '.join(beta_parts)}")

        sector = risk_data.get("sector_concentration", {})
        if sector.get("sectors"):
            sector_parts = [f"{s}: {p}%" for s, p in sector["sectors"].items()]
            sections.append(f"Sector Allocation: {', '.join(sector_parts)}")
        if sector.get("warnings"):
            for w in sector["warnings"]:
                sections.append(f"  ⚠ {w}")

        sizing = risk_data.get("position_sizing", {})
        if sizing.get("alerts"):
            for alert in sizing["alerts"]:
                sections.append(
                    f"  ⚠ {alert['ticker']} at {alert['weight_pct']}% — {alert['alert']}"
                )

        corr = risk_data.get("correlation", {})
        if corr.get("high_pairs"):
            sections.append(f"Avg Correlation: {corr.get('avg_correlation', 'N/A')}")
            for pair in corr["high_pairs"]:
                sections.append(
                    f"  High correlation: {pair['pair'][0]}/{pair['pair'][1]} = {pair['correlation']}"
                )

        stop_alerts = risk_data.get("stop_loss_alerts", [])
        if stop_alerts:
            sections.append("Stop-Loss Alerts:")
            for sa in stop_alerts:
                sections.append(
                    f"  {sa['ticker']}: {sa['status']} — current ${sa['current']}, "
                    f"stop ${sa['stop_level']} (from high ${sa['from_high']})"
                )

    # Section 6: Options Data
    if options:
        sections.append("\n## OPTIONS & VOLATILITY DATA")
        for ticker, data in options.items():
            if not data.get("has_options"):
                sections.append(f"- {ticker}: No options data available")
                continue
            vol = data.get("volatility", {})
            call = data.get("call", {})
            put = data.get("put", {})

            sections.append(
                f"\n### {ticker} — Exp: {data.get('expiration', 'N/A')} "
                f"({data.get('days_to_expiry', '?')}d), ATM Strike: {data.get('atm_strike', 'N/A')}"
            )
            sections.append(
                f"  IV: call={vol.get('iv_call', 'N/A')}, put={vol.get('iv_put', 'N/A')}, "
                f"avg={vol.get('iv_avg', 'N/A')}"
            )
            sections.append(
                f"  HV(30d): {vol.get('hv_30d', 'N/A')}, IV/HV Ratio: {vol.get('iv_hv_ratio', 'N/A')}"
            )
            sections.append(
                f"  Signal: {vol.get('signal', 'N/A')} — {vol.get('opportunity', '')}"
            )
            sections.append(
                f"  Call: price={call.get('last_price', 'N/A')}, "
                f"delta={call.get('delta', 'N/A')}, gamma={call.get('gamma', 'N/A')}, "
                f"theta={call.get('theta', 'N/A')}, vega={call.get('vega', 'N/A')}"
            )
            sections.append(
                f"  Put: price={put.get('last_price', 'N/A')}, "
                f"delta={put.get('delta', 'N/A')}, gamma={put.get('gamma', 'N/A')}, "
                f"theta={put.get('theta', 'N/A')}, vega={put.get('vega', 'N/A')}"
            )

    # Section 7: News
    if news:
        sections.append("\n## RECENT FINANCIAL NEWS")
        for article in news[:10]:
            sections.append(
                f"- [{article.get('source', 'Unknown')}] {article.get('title', 'N/A')} "
                f"({article.get('published_at', '')[:10]})"
            )

    # Section 8: Prediction Markets
    if predictions:
        sections.append("\n## PREDICTION MARKET SIGNALS (Polymarket)")
        for event in predictions[:10]:
            prob = event.get("probability")
            prob_str = f"{prob}%" if prob is not None else "N/A"
            sections.append(f"- {event.get('title', 'N/A')}: {prob_str} probability")

    # Section 9: Economic Indicators
    if economic:
        sections.append("\n## KEY ECONOMIC INDICATORS (FRED)")
        for indicator_id, data in economic.items():
            sections.append(f"- {data['name']}: {data['value']} (as of {data['date']})")

    sections.append(
        "\n## INSTRUCTIONS\n"
        "Analyze this portfolio considering ALL the data above — market quotes, technical indicators, "
        "fundamental metrics, portfolio risk, options/volatility, news, predictions, and economic data. "
        "Cross-reference signals (e.g., technically overbought + fundamentally overvalued = stronger sell signal). "
        "Provide specific recommendations for each holding and overall portfolio strategy. "
        "Include dedicated commentary sections for technical analysis, fundamental analysis, "
        "risk management, and options analysis. "
        "Respond ONLY with valid JSON matching the structure specified in your instructions."
    )

    return "\n".join(sections)
