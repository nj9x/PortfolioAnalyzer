<?php

namespace App\Claude;

class Prompts
{
    public const SYSTEM_PROMPT = <<<'PROMPT'
You are a senior financial advisor AI assistant analyzing client portfolios.
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
}
PROMPT;

    public static function buildUserMessage(
        string $portfolioName,
        array $holdings,
        array $quotes,
        array $news,
        array $predictions,
        array $economic,
        ?array $technicals = null,
        ?array $fundamentalsData = null,
        ?array $riskData = null,
        ?array $options = null,
    ): string {
        $sections = ["# Portfolio Analysis Request: {$portfolioName}\n"];

        // Section 1: Portfolio Holdings
        $sections[] = '## PORTFOLIO HOLDINGS';
        $totalValue = 0;
        foreach ($holdings as $h) {
            $ticker = $h['ticker'];
            $quote = $quotes[$ticker] ?? [];
            $currentPrice = $quote['current_price'] ?? null;
            $costBasis = $h['cost_basis'] ?? null;
            $shares = $h['shares'];

            $positionValue = ($currentPrice) ? $shares * $currentPrice : null;
            if ($positionValue) {
                $totalValue += $positionValue;
            }

            $gainLoss = '';
            if ($costBasis && $currentPrice) {
                $pct = (($currentPrice - $costBasis) / $costBasis) * 100;
                $gainLoss = sprintf(', Gain/Loss: %+.1f%%', $pct);
            }

            $valueStr = $positionValue ? '$' . number_format($positionValue, 2) : 'N/A';
            $sections[] = sprintf(
                '- %s: %s shares, Cost Basis: $%s, Current: $%s, Value: %s, Type: %s%s',
                $ticker, $shares,
                $costBasis ?? 'N/A',
                $currentPrice ?? 'N/A',
                $valueStr,
                $h['asset_type'] ?? 'equity',
                $gainLoss,
            );
        }
        $sections[] = sprintf("\nTotal Portfolio Value: $%s\n", number_format($totalValue, 2));

        // Section 2: Market Data
        $sections[] = '## CURRENT MARKET DATA';
        foreach ($quotes as $ticker => $quote) {
            if (isset($quote['error'])) {
                $sections[] = "- {$ticker}: Data unavailable";
                continue;
            }
            $sections[] = sprintf(
                '- %s (%s): $%s, Day: %s%%, P/E: %s, 52wk: $%s-$%s, Sector: %s',
                $ticker,
                $quote['name'] ?? 'N/A',
                $quote['current_price'] ?? 'N/A',
                $quote['day_change_pct'] ?? 'N/A',
                $quote['pe_ratio'] ?? 'N/A',
                $quote['fifty_two_week_low'] ?? '?',
                $quote['fifty_two_week_high'] ?? '?',
                $quote['sector'] ?? 'N/A',
            );
        }

        // Section 3: Technical Analysis
        if ($technicals) {
            $sections[] = "\n## TECHNICAL ANALYSIS INDICATORS";
            foreach ($technicals as $ticker => $data) {
                if (isset($data['error'])) {
                    $sections[] = "- {$ticker}: {$data['error']}";
                    continue;
                }
                $rsi = $data['rsi'] ?? [];
                $macd = $data['macd'] ?? [];
                $bb = $data['bollinger'] ?? [];
                $mas = $data['moving_averages'] ?? [];
                $sr = $data['support_resistance'] ?? [];
                $vol = $data['volume'] ?? [];
                $overall = $data['overall_signal'] ?? 'N/A';

                $sections[] = "\n### {$ticker} (Overall: {$overall})";
                $sections[] = sprintf('  RSI: %s (%s)', $rsi['value'] ?? 'N/A', $rsi['signal'] ?? 'N/A');
                $sections[] = sprintf('  MACD: line=%s, signal=%s, histogram=%s (%s)',
                    $macd['macd_line'] ?? 'N/A', $macd['signal_line'] ?? 'N/A',
                    $macd['histogram'] ?? 'N/A', $macd['signal'] ?? 'N/A');
                $sections[] = sprintf('  Bollinger: upper=%s, mid=%s, lower=%s, position=%s, squeeze=%s (%s)',
                    $bb['upper'] ?? 'N/A', $bb['middle'] ?? 'N/A', $bb['lower'] ?? 'N/A',
                    $bb['position'] ?? 'N/A', ($bb['squeeze'] ?? false) ? 'YES' : 'NO',
                    $bb['signal'] ?? 'N/A');
                $sections[] = sprintf('  MAs: SMA20=%s, SMA50=%s, SMA200=%s, vs200: %s',
                    $mas['sma_20'] ?? 'N/A', $mas['sma_50'] ?? 'N/A',
                    $mas['sma_200'] ?? 'N/A', $mas['price_vs_sma200'] ?? 'N/A');
                if ($mas['golden_cross'] ?? false) $sections[] = '  ** GOLDEN CROSS detected **';
                if ($mas['death_cross'] ?? false) $sections[] = '  ** DEATH CROSS detected **';
                $sections[] = sprintf('  Support: %s (%s%%), Resistance: %s (%s%%)',
                    $sr['nearest_support'] ?? 'N/A', $sr['support_distance_pct'] ?? 'N/A',
                    $sr['nearest_resistance'] ?? 'N/A', $sr['resistance_distance_pct'] ?? 'N/A');
                $sections[] = sprintf('  Volume: %sx avg (%s)', $vol['ratio'] ?? 'N/A', $vol['signal'] ?? 'N/A');
            }
        }

        // Section 4: Fundamental Screening
        if ($fundamentalsData) {
            $sections[] = "\n## FUNDAMENTAL SCREENING";
            foreach ($fundamentalsData as $ticker => $data) {
                if (isset($data['error'])) {
                    $sections[] = "- {$ticker}: {$data['error']}";
                    continue;
                }
                $val = $data['valuation'] ?? [];
                $qual = $data['quality'] ?? [];
                $grow = $data['growth'] ?? [];
                $health = $data['health'] ?? [];
                $flag = $data['valuation_flag'] ?? 'N/A';
                $reason = $data['flag_reasoning'] ?? '';

                $sections[] = "\n### {$ticker} — {$flag}";
                $sections[] = "  Reasoning: {$reason}";
                $sections[] = sprintf('  Valuation: P/E=%s, Fwd P/E=%s, EV/EBIT=%s, Earnings Yield=%s%%, FCF Yield=%s%%, P/B=%s',
                    $val['pe_ratio'] ?? 'N/A', $val['forward_pe'] ?? 'N/A', $val['ev_ebit'] ?? 'N/A',
                    $val['earnings_yield'] ?? 'N/A', $val['fcf_yield'] ?? 'N/A', $val['price_to_book'] ?? 'N/A');
                $sections[] = sprintf('  Quality: ROIC=%s%%, ROE=%s%%, Margin=%s%%',
                    $qual['roic'] ?? 'N/A', $qual['roe'] ?? 'N/A', $qual['profit_margin'] ?? 'N/A');
                $sections[] = sprintf('  Growth: Rev=%s%%, Earnings=%s%%, Quarterly=%s%%',
                    $grow['revenue_growth'] ?? 'N/A', $grow['earnings_growth'] ?? 'N/A',
                    $grow['earnings_quarterly_growth'] ?? 'N/A');
                $sections[] = sprintf('  Health: D/E=%s, Current=%s, Quick=%s',
                    $health['debt_to_equity'] ?? 'N/A', $health['current_ratio'] ?? 'N/A',
                    $health['quick_ratio'] ?? 'N/A');
            }
        }

        // Section 5: Portfolio Risk
        if ($riskData) {
            $sections[] = "\n## PORTFOLIO RISK METRICS";
            $betaData = $riskData['portfolio_beta'] ?? [];
            $sections[] = sprintf('Portfolio Beta: %s — %s',
                $betaData['value'] ?? 'N/A', $betaData['interpretation'] ?? '');

            $sector = $riskData['sector_concentration'] ?? [];
            if (! empty($sector['sectors'])) {
                $sectorParts = array_map(fn($s, $p) => "{$s}: {$p}%", array_keys($sector['sectors']), $sector['sectors']);
                $sections[] = 'Sector Allocation: ' . implode(', ', $sectorParts);
            }

            foreach ($riskData['stop_loss_alerts'] ?? [] as $sa) {
                $sections[] = sprintf("  %s: %s — current \$%s, stop \$%s (from high \$%s)",
                    $sa['ticker'], $sa['status'], $sa['current'], $sa['stop_level'], $sa['from_high']);
            }
        }

        // Section 6: Options Data
        if ($options) {
            $sections[] = "\n## OPTIONS & VOLATILITY DATA";
            foreach ($options as $ticker => $data) {
                if (! ($data['has_options'] ?? false)) {
                    $sections[] = "- {$ticker}: No options data available";
                    continue;
                }
                $vol = $data['volatility'] ?? [];
                $call = $data['call'] ?? [];
                $put = $data['put'] ?? [];

                $sections[] = sprintf("\n### %s — Exp: %s (%sd), ATM Strike: %s",
                    $ticker, $data['expiration'] ?? 'N/A', $data['days_to_expiry'] ?? '?',
                    $data['atm_strike'] ?? 'N/A');
                $sections[] = sprintf('  IV: call=%s, put=%s, avg=%s',
                    $vol['iv_call'] ?? 'N/A', $vol['iv_put'] ?? 'N/A', $vol['iv_avg'] ?? 'N/A');
                $sections[] = sprintf('  HV(30d): %s, IV/HV Ratio: %s',
                    $vol['hv_30d'] ?? 'N/A', $vol['iv_hv_ratio'] ?? 'N/A');
                $sections[] = sprintf('  Signal: %s — %s', $vol['signal'] ?? 'N/A', $vol['opportunity'] ?? '');
            }
        }

        // Section 7: News
        if (! empty($news)) {
            $sections[] = "\n## RECENT FINANCIAL NEWS";
            foreach (array_slice($news, 0, 10) as $article) {
                $sections[] = sprintf('- [%s] %s (%s)',
                    $article['source'] ?? 'Unknown',
                    $article['title'] ?? 'N/A',
                    substr($article['published_at'] ?? '', 0, 10));
            }
        }

        // Section 8: Prediction Markets
        if (! empty($predictions)) {
            $sections[] = "\n## PREDICTION MARKET SIGNALS (Polymarket)";
            foreach (array_slice($predictions, 0, 10) as $event) {
                $prob = $event['probability'] ?? null;
                $probStr = $prob !== null ? "{$prob}%" : 'N/A';
                $sections[] = sprintf('- %s: %s probability', $event['title'] ?? 'N/A', $probStr);
            }
        }

        // Section 9: Economic Indicators
        if (! empty($economic)) {
            $sections[] = "\n## KEY ECONOMIC INDICATORS (FRED)";
            foreach ($economic as $id => $data) {
                $sections[] = sprintf('- %s: %s (as of %s)', $data['name'], $data['value'], $data['date']);
            }
        }

        $sections[] = "\n## INSTRUCTIONS\n"
            . "Analyze this portfolio considering ALL the data above — market quotes, technical indicators, "
            . "fundamental metrics, portfolio risk, options/volatility, news, predictions, and economic data. "
            . "Cross-reference signals (e.g., technically overbought + fundamentally overvalued = stronger sell signal). "
            . "Provide specific recommendations for each holding and overall portfolio strategy. "
            . "Include dedicated commentary sections for technical analysis, fundamental analysis, "
            . "risk management, and options analysis. "
            . "Respond ONLY with valid JSON matching the structure specified in your instructions.";

        return implode("\n", $sections);
    }
}
