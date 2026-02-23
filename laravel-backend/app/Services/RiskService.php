<?php

namespace App\Services;

use App\DataSources\AlphaVantage;
use App\DataSources\YahooFinance;
use Illuminate\Support\Facades\Log;

/**
 * Portfolio-level risk computations.
 */
class RiskService
{
    private YahooFinance $yahooFinance;
    private AlphaVantage $alphaVantage;

    public function __construct(YahooFinance $yahooFinance, AlphaVantage $alphaVantage)
    {
        $this->yahooFinance = $yahooFinance;
        $this->alphaVantage = $alphaVantage;
    }

    public function computePortfolioRisk(array $holdings, array $quotes): array
    {
        $weights = $this->computePositionWeights($holdings, $quotes);
        $tickers = array_map(fn($h) => $h['ticker'], $holdings);

        return [
            'portfolio_beta' => $this->computePortfolioBeta($weights, $tickers),
            'sector_concentration' => $this->computeSectorConcentration($weights, $quotes),
            'position_sizing' => $this->computePositionSizingAlerts($weights),
            'correlation' => $this->computeCorrelationMatrix($tickers),
            'drawdowns' => $this->computeDrawdownAnalysis($tickers, $quotes),
            'stop_loss_alerts' => $this->computeStopLossAlerts($tickers, $quotes),
        ];
    }

    private function computePositionWeights(array $holdings, array $quotes): array
    {
        $positions = [];
        $total = 0;

        foreach ($holdings as $h) {
            $ticker = $h['ticker'];
            $price = $quotes[$ticker]['current_price'] ?? null;
            $shares = $h['shares'];
            $value = $price ? $shares * $price : 0;
            $total += $value;
            $positions[$ticker] = ['value' => $value, 'shares' => $shares];
        }

        foreach ($positions as $ticker => &$pos) {
            $pos['weight_pct'] = $total > 0 ? round($pos['value'] / $total * 100, 2) : 0;
        }

        return $positions;
    }

    private function computePortfolioBeta(array $weights, array $tickers): array
    {
        $betas = [];
        foreach ($tickers as $t) {
            try {
                $info = $this->yahooFinance->fetchInfoSafe($t);
                $beta = $info['beta'] ?? null;
                $betas[$t] = $beta ? round((float) $beta, 2) : 1.0;
            } catch (\Throwable $e) {
                $betas[$t] = 1.0;
            }
        }

        $totalWeight = array_sum(array_column($weights, 'weight_pct'));
        if ($totalWeight == 0) {
            return ['value' => 1.0, 'interpretation' => 'No position data', 'individual' => $betas];
        }

        $portfolioBeta = 0;
        foreach ($tickers as $t) {
            $portfolioBeta += ($betas[$t] ?? 1.0) * ($weights[$t]['weight_pct'] ?? 0) / $totalWeight;
        }
        $portfolioBeta = round($portfolioBeta, 2);

        if ($portfolioBeta > 1.2) {
            $pct = (int) (($portfolioBeta - 1) * 100);
            $interp = "Aggressive — portfolio moves ~{$pct}% more than the market";
        } elseif ($portfolioBeta < 0.8) {
            $pct = (int) ((1 - $portfolioBeta) * 100);
            $interp = "Defensive — portfolio moves ~{$pct}% less than the market";
        } else {
            $interp = 'Moderate — portfolio roughly tracks the market';
        }

        return ['value' => $portfolioBeta, 'interpretation' => $interp, 'individual' => $betas];
    }

    private function computeSectorConcentration(array $weights, array $quotes): array
    {
        $sectors = [];
        foreach ($weights as $ticker => $w) {
            $sector = $quotes[$ticker]['sector'] ?? 'Unknown';
            $sectors[$sector] = ($sectors[$sector] ?? 0) + $w['weight_pct'];
        }

        arsort($sectors);
        $sectors = array_map(fn($v) => round($v, 1), $sectors);

        $warnings = [];
        foreach ($sectors as $sector => $pct) {
            if ($pct > 40) {
                $warnings[] = "{$sector} at {$pct}% — high concentration risk";
            }
        }

        return ['sectors' => $sectors, 'warnings' => $warnings];
    }

    private function computePositionSizingAlerts(array $weights, float $threshold = 20.0): array
    {
        $alerts = [];
        $maxPos = ['ticker' => null, 'weight_pct' => 0];

        foreach ($weights as $ticker => $w) {
            if ($w['weight_pct'] > $maxPos['weight_pct']) {
                $maxPos = ['ticker' => $ticker, 'weight_pct' => $w['weight_pct']];
            }
            if ($w['weight_pct'] > $threshold) {
                $alerts[] = [
                    'ticker' => $ticker,
                    'weight_pct' => $w['weight_pct'],
                    'alert' => "Position exceeds {$threshold}% threshold",
                ];
            }
        }

        return [
            'alerts' => $alerts,
            'max_position' => $maxPos,
            'position_count' => count($weights),
        ];
    }

    private function computeCorrelationMatrix(array $tickers, int $periodDays = 130): array
    {
        $tickers = array_slice($tickers, 0, 10);
        if (count($tickers) < 2) {
            return ['high_pairs' => [], 'avg_correlation' => 0];
        }

        try {
            $closesDict = [];
            foreach ($tickers as $t) {
                $history = $this->alphaVantage->fetchHistory($t, $periodDays);
                if (! empty($history)) {
                    $closesDict[$t] = array_column($history, 'close');
                }
            }

            if (count($closesDict) < 2) {
                return ['high_pairs' => [], 'avg_correlation' => 0];
            }

            // Compute returns
            $returns = [];
            foreach ($closesDict as $t => $closes) {
                $ret = [];
                for ($i = 1; $i < count($closes); $i++) {
                    $ret[] = $closes[$i - 1] > 0 ? ($closes[$i] - $closes[$i - 1]) / $closes[$i - 1] : 0;
                }
                $returns[$t] = $ret;
            }

            // Compute correlation for each pair
            $tickerKeys = array_keys($returns);
            $highPairs = [];
            $allCorrs = [];

            for ($i = 0; $i < count($tickerKeys); $i++) {
                for ($j = $i + 1; $j < count($tickerKeys); $j++) {
                    $t1 = $tickerKeys[$i];
                    $t2 = $tickerKeys[$j];
                    $corr = $this->correlation($returns[$t1], $returns[$t2]);
                    $allCorrs[] = $corr;

                    if (abs($corr) > 0.8) {
                        $highPairs[] = [
                            'pair' => [$t1, $t2],
                            'correlation' => round($corr, 3),
                            'risk' => 'High co-movement — limited diversification benefit',
                        ];
                    }
                }
            }

            $avg = ! empty($allCorrs) ? round(array_sum($allCorrs) / count($allCorrs), 3) : 0;

            return ['high_pairs' => $highPairs, 'avg_correlation' => $avg];
        } catch (\Throwable $e) {
            return ['high_pairs' => [], 'avg_correlation' => 0];
        }
    }

    private function computeDrawdownAnalysis(array $tickers, array $quotes): array
    {
        $drawdowns = [];
        $worst = ['ticker' => null, 'drawdown_pct' => 0];

        foreach ($tickers as $t) {
            $q = $quotes[$t] ?? [];
            $high = $q['fifty_two_week_high'] ?? null;
            $current = $q['current_price'] ?? null;

            if ($high && $current && $high > 0) {
                $dd = round((($current - $high) / $high) * 100, 2);
                $drawdowns[$t] = ['drawdown_pct' => $dd, 'from_high' => $high, 'current' => $current];
                if ($dd < ($worst['drawdown_pct'] ?? 0)) {
                    $worst = ['ticker' => $t, 'drawdown_pct' => $dd];
                }
            } else {
                $drawdowns[$t] = ['drawdown_pct' => null, 'from_high' => $high, 'current' => $current];
            }
        }

        $drawdowns['_worst'] = $worst;
        return $drawdowns;
    }

    private function computeStopLossAlerts(array $tickers, array $quotes, float $defaultStopPct = 0.15): array
    {
        $alerts = [];
        foreach ($tickers as $t) {
            $q = $quotes[$t] ?? [];
            $high = $q['fifty_two_week_high'] ?? null;
            $current = $q['current_price'] ?? null;
            if (! $high || ! $current) {
                continue;
            }

            $stopLevel = round($high * (1 - $defaultStopPct), 2);
            if ($current < $stopLevel) {
                $alerts[] = [
                    'ticker' => $t,
                    'current' => $current,
                    'stop_level' => $stopLevel,
                    'from_high' => $high,
                    'status' => 'BELOW_STOP_LOSS',
                ];
            } elseif ($current < $stopLevel * 1.05) {
                $alerts[] = [
                    'ticker' => $t,
                    'current' => $current,
                    'stop_level' => $stopLevel,
                    'from_high' => $high,
                    'status' => 'NEAR_STOP_LOSS',
                ];
            }
        }
        return $alerts;
    }

    private function correlation(array $x, array $y): float
    {
        $n = min(count($x), count($y));
        if ($n < 2) return 0;

        $x = array_slice($x, 0, $n);
        $y = array_slice($y, 0, $n);

        $meanX = array_sum($x) / $n;
        $meanY = array_sum($y) / $n;

        $cov = 0;
        $varX = 0;
        $varY = 0;

        for ($i = 0; $i < $n; $i++) {
            $dx = $x[$i] - $meanX;
            $dy = $y[$i] - $meanY;
            $cov += $dx * $dy;
            $varX += $dx * $dx;
            $varY += $dy * $dy;
        }

        $denom = sqrt($varX * $varY);
        return $denom > 0 ? $cov / $denom : 0;
    }
}
