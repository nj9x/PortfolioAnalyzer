<?php

namespace App\DataSources;

use Illuminate\Support\Facades\Log;

/**
 * Greenblatt-style fundamental screening via Massive.com data.
 */
class Fundamentals
{
    private YahooFinance $yahooFinance;

    public function __construct(YahooFinance $yahooFinance)
    {
        $this->yahooFinance = $yahooFinance;
    }

    public function fetchFundamentals(array $tickers): array
    {
        $results = [];
        foreach ($tickers as $ticker) {
            try {
                $info = $this->yahooFinance->fetchInfoSafe($ticker);
                $results[$ticker] = $this->extractFundamentals($info, $ticker);
            } catch (\Throwable $e) {
                Log::warning("Fundamentals failed for {$ticker}: {$e->getMessage()}");
                $results[$ticker] = ['error' => $e->getMessage()];
            }
        }
        return $results;
    }

    private function extractFundamentals(array $info, string $ticker): array
    {
        $valuation = $this->computeValuation($info);
        $quality = $this->computeQuality($info);
        $growth = $this->computeGrowth($info);
        $health = $this->computeHealth($info);
        [$flag, $reasoning] = $this->generateValuationFlag($valuation, $quality, $growth, $health);

        return [
            'ticker' => $ticker,
            'valuation' => $valuation,
            'quality' => $quality,
            'growth' => $growth,
            'health' => $health,
            'valuation_flag' => $flag,
            'flag_reasoning' => $reasoning,
        ];
    }

    private function computeValuation(array $info): array
    {
        $pe = $info['trailingPE'] ?? null;
        $forwardPe = $info['forwardPE'] ?? null;
        $ev = $info['enterpriseValue'] ?? null;
        $ebitda = $info['ebitda'] ?? null;
        $marketCap = $info['marketCap'] ?? null;
        $fcf = $info['freeCashflow'] ?? null;
        $priceToBook = $info['priceToBook'] ?? null;

        $evEbit = ($ev && $ebitda && $ebitda > 0) ? round($ev / $ebitda, 2) : null;
        $earningsYield = ($pe && $pe > 0) ? round(1 / $pe * 100, 2) : null;
        $fcfYield = ($fcf && $marketCap && $marketCap > 0) ? round($fcf / $marketCap * 100, 2) : null;

        return [
            'pe_ratio' => $pe ? round($pe, 2) : null,
            'forward_pe' => $forwardPe ? round($forwardPe, 2) : null,
            'ev_ebit' => $evEbit,
            'earnings_yield' => $earningsYield,
            'fcf_yield' => $fcfYield,
            'price_to_book' => $priceToBook ? round($priceToBook, 2) : null,
        ];
    }

    private function computeQuality(array $info): array
    {
        $roe = $info['returnOnEquity'] ?? null;
        $profitMargin = $info['profitMargins'] ?? null;

        $netIncome = $info['netIncomeToCommon'] ?? null;
        $totalDebt = $info['totalDebt'] ?? 0;
        $totalCash = $info['totalCash'] ?? 0;
        $bookValue = $info['bookValue'] ?? null;
        $shares = $info['sharesOutstanding'] ?? null;

        $roic = null;
        if ($netIncome && $bookValue && $shares) {
            $totalEquity = $bookValue * $shares;
            $investedCapital = $totalEquity + ($totalDebt ?? 0) - ($totalCash ?? 0);
            if ($investedCapital > 0) {
                $roic = round($netIncome / $investedCapital * 100, 2);
            }
        }

        return [
            'roic' => $roic,
            'roe' => $roe ? round($roe * 100, 2) : null,
            'profit_margin' => $profitMargin ? round($profitMargin * 100, 2) : null,
        ];
    }

    private function computeGrowth(array $info): array
    {
        return [
            'revenue_growth' => $this->pct($info['revenueGrowth'] ?? null),
            'earnings_growth' => $this->pct($info['earningsGrowth'] ?? null),
            'earnings_quarterly_growth' => $this->pct($info['earningsQuarterlyGrowth'] ?? null),
        ];
    }

    private function computeHealth(array $info): array
    {
        $de = $info['debtToEquity'] ?? null;
        return [
            'debt_to_equity' => $de ? round($de / 100, 2) : null,
            'current_ratio' => isset($info['currentRatio']) ? round($info['currentRatio'], 2) : null,
            'quick_ratio' => isset($info['quickRatio']) ? round($info['quickRatio'], 2) : null,
        ];
    }

    private function generateValuationFlag(array $valuation, array $quality, array $growth, array $health): array
    {
        $score = 0;
        $reasons = [];

        $evEbit = $valuation['ev_ebit'] ?? null;
        if ($evEbit !== null) {
            if ($evEbit < 10) {
                $score += 2;
                $reasons[] = "Low EV/EBIT ({$evEbit}x)";
            } elseif ($evEbit < 15) {
                $score += 1;
            } elseif ($evEbit > 35) {
                $score -= 2;
                $reasons[] = "Very high EV/EBIT ({$evEbit}x)";
            } elseif ($evEbit > 25) {
                $score -= 1;
                $reasons[] = "High EV/EBIT ({$evEbit}x)";
            }
        }

        $roic = $quality['roic'] ?? null;
        if ($roic !== null) {
            if ($roic > 20) {
                $score += 2;
                $reasons[] = "Strong ROIC ({$roic}%)";
            } elseif ($roic > 12) {
                $score += 1;
            } elseif ($roic < 5) {
                $score -= 1;
                $reasons[] = "Weak ROIC ({$roic}%)";
            }
        }

        $fcfYield = $valuation['fcf_yield'] ?? null;
        if ($fcfYield !== null) {
            if ($fcfYield > 8) {
                $score += 1;
                $reasons[] = "High FCF yield ({$fcfYield}%)";
            } elseif ($fcfYield < 0) {
                $score -= 1;
                $reasons[] = "Negative FCF yield ({$fcfYield}%)";
            }
        }

        $eg = $growth['earnings_growth'] ?? null;
        if ($eg !== null) {
            if ($eg > 15) $score += 1;
            elseif ($eg < -10) $score -= 1;
        }

        $de = $health['debt_to_equity'] ?? null;
        if ($de !== null && $de > 2.0) {
            $score -= 1;
            $reasons[] = "High leverage (D/E {$de})";
        }

        if ($score >= 3) {
            $flag = 'UNDERVALUED_OPPORTUNITY';
        } elseif ($score <= -2) {
            $flag = 'OVERVALUATION_WARNING';
        } else {
            $flag = 'FAIRLY_VALUED';
        }

        $reasoning = ! empty($reasons) ? implode('; ', $reasons) : 'Mixed signals across metrics';
        return [$flag, $reasoning];
    }

    private function pct(?float $val): ?float
    {
        return $val !== null ? round($val * 100, 2) : null;
    }
}
