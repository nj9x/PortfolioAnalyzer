<?php

namespace App\DataSources;

/**
 * Technical analysis indicators computed from OHLCV data.
 */
class TechnicalAnalysis
{
    private YahooFinance $yahooFinance;

    public function __construct(YahooFinance $yahooFinance)
    {
        $this->yahooFinance = $yahooFinance;
    }

    public function computeAllTechnicals(array $tickers): array
    {
        $results = [];
        foreach ($tickers as $ticker) {
            $history = $this->yahooFinance->fetchHistory($ticker, '1y');
            if (count($history) < 30) {
                $results[$ticker] = ['error' => "Insufficient history for {$ticker} (" . count($history) . ' days)'];
                continue;
            }
            try {
                $results[$ticker] = $this->computeIndicators($history, $ticker);
            } catch (\Throwable $e) {
                $results[$ticker] = ['error' => $e->getMessage()];
            }
        }
        return $results;
    }

    private function computeIndicators(array $history, string $ticker): array
    {
        $closes = array_map(fn($h) => (float) $h['close'], $history);
        $highs = array_map(fn($h) => (float) $h['high'], $history);
        $lows = array_map(fn($h) => (float) $h['low'], $history);
        $volumes = array_map(fn($h) => (float) $h['volume'], $history);

        $rsi = $this->computeRsi($closes);
        $macd = $this->computeMacd($closes);
        $bollinger = $this->computeBollingerBands($closes);
        $mas = $this->computeMovingAverages($closes);
        $sr = $this->computeSupportResistance($highs, $lows, $closes);
        $vol = $this->computeVolumeAnalysis($volumes);

        $indicators = [
            'ticker' => $ticker,
            'rsi' => $rsi,
            'macd' => $macd,
            'bollinger' => $bollinger,
            'moving_averages' => $mas,
            'support_resistance' => $sr,
            'volume' => $vol,
        ];
        $indicators['overall_signal'] = $this->determineOverallSignal($indicators);

        return $indicators;
    }

    private function computeRsi(array $closes, int $period = 14): array
    {
        $n = count($closes);
        if ($n < $period + 1) {
            return ['value' => null, 'signal' => 'NEUTRAL'];
        }

        $gains = [];
        $losses = [];
        for ($i = 1; $i < $n; $i++) {
            $change = $closes[$i] - $closes[$i - 1];
            $gains[] = $change > 0 ? $change : 0;
            $losses[] = $change < 0 ? abs($change) : 0;
        }

        // Wilder's smoothing (EMA with alpha = 1/period)
        $avgGain = array_sum(array_slice($gains, 0, $period)) / $period;
        $avgLoss = array_sum(array_slice($losses, 0, $period)) / $period;

        for ($i = $period; $i < count($gains); $i++) {
            $avgGain = ($avgGain * ($period - 1) + $gains[$i]) / $period;
            $avgLoss = ($avgLoss * ($period - 1) + $losses[$i]) / $period;
        }

        $rs = $avgLoss > 0 ? $avgGain / $avgLoss : 100;
        $value = round(100 - (100 / (1 + $rs)), 1);

        $signal = 'NEUTRAL';
        if ($value > 70) {
            $signal = 'OVERBOUGHT';
        } elseif ($value < 30) {
            $signal = 'OVERSOLD';
        }

        return ['value' => $value, 'signal' => $signal];
    }

    private function computeMacd(array $closes, int $fast = 12, int $slow = 26, int $signalPeriod = 9): array
    {
        $emaFast = $this->ema($closes, $fast);
        $emaSlow = $this->ema($closes, $slow);

        $n = count($closes);
        $macdLine = [];
        for ($i = 0; $i < $n; $i++) {
            $macdLine[] = $emaFast[$i] - $emaSlow[$i];
        }

        $signalLine = $this->ema($macdLine, $signalPeriod);
        $histogram = [];
        for ($i = 0; $i < $n; $i++) {
            $histogram[] = $macdLine[$i] - $signalLine[$i];
        }

        $macdVal = round(end($macdLine), 4);
        $signalVal = round(end($signalLine), 4);
        $histVal = round(end($histogram), 4);

        $signal = 'NEUTRAL';
        if (count($histogram) >= 2) {
            $prevHist = $histogram[count($histogram) - 2];
            if ($histVal > 0 && $prevHist <= 0) {
                $signal = 'BULLISH';
            } elseif ($histVal < 0 && $prevHist >= 0) {
                $signal = 'BEARISH';
            } elseif ($histVal > 0) {
                $signal = 'BULLISH';
            } else {
                $signal = 'BEARISH';
            }
        }

        return [
            'macd_line' => $macdVal,
            'signal_line' => $signalVal,
            'histogram' => $histVal,
            'signal' => $signal,
        ];
    }

    private function computeBollingerBands(array $closes, int $period = 20, float $stdDev = 2.0): array
    {
        $n = count($closes);
        $slice = array_slice($closes, -$period);
        $sma = array_sum($slice) / $period;
        $std = $this->stdDev($slice);

        $upper = $sma + $stdDev * $std;
        $lower = $sma - $stdDev * $std;
        $price = end($closes);

        $bandWidth = $upper - $lower;
        $position = $bandWidth > 0 ? ($price - $lower) / $bandWidth : 0.5;

        $squeeze = false;
        if ($n >= 120) {
            $currentBandwidth = $bandWidth / $sma;
            // Approximate average bandwidth
            $bws = [];
            for ($i = $period; $i <= $n; $i++) {
                $s = array_slice($closes, $i - $period, $period);
                $m = array_sum($s) / $period;
                $sd = $this->stdDev($s);
                if ($m > 0) {
                    $bws[] = (2 * $stdDev * $sd) / $m;
                }
            }
            $avgBw = ! empty($bws) ? array_sum($bws) / count($bws) : $currentBandwidth;
            $squeeze = $currentBandwidth < $avgBw * 0.75;
        }

        $signal = 'NEUTRAL';
        if ($position > 0.8) {
            $signal = 'OVERBOUGHT';
        } elseif ($position < 0.2) {
            $signal = 'OVERSOLD';
        }

        return [
            'upper' => round($upper, 2),
            'middle' => round($sma, 2),
            'lower' => round($lower, 2),
            'bandwidth' => round($bandWidth / ($sma ?: 1), 4),
            'position' => round($position, 3),
            'squeeze' => $squeeze,
            'signal' => $signal,
        ];
    }

    private function computeMovingAverages(array $closes): array
    {
        $n = count($closes);
        $price = end($closes);

        $sma20 = $n >= 20 ? round(array_sum(array_slice($closes, -20)) / 20, 2) : null;
        $sma50 = $n >= 50 ? round(array_sum(array_slice($closes, -50)) / 50, 2) : null;
        $sma200 = $n >= 200 ? round(array_sum(array_slice($closes, -200)) / 200, 2) : null;

        $goldenCross = false;
        $deathCross = false;

        if ($sma50 !== null && $sma200 !== null && $n >= 201) {
            $prevSma50 = array_sum(array_slice($closes, -51, 50)) / 50;
            $prevSma200 = array_sum(array_slice($closes, -201, 200)) / 200;
            $diffNow = $sma50 - $sma200;
            $diffPrev = $prevSma50 - $prevSma200;
            if ($diffNow > 0 && $diffPrev <= 0) {
                $goldenCross = true;
            } elseif ($diffNow < 0 && $diffPrev >= 0) {
                $deathCross = true;
            }
        }

        $priceVsSma200 = 'N/A';
        if ($sma200 !== null) {
            $priceVsSma200 = $price > $sma200 ? 'ABOVE' : 'BELOW';
        }

        return [
            'sma_20' => $sma20,
            'sma_50' => $sma50,
            'sma_200' => $sma200,
            'golden_cross' => $goldenCross,
            'death_cross' => $deathCross,
            'price_vs_sma200' => $priceVsSma200,
        ];
    }

    private function computeSupportResistance(array $highs, array $lows, array $closes, int $lookback = 60): array
    {
        $price = end($closes);
        $n = count($highs);
        $start = max(0, $n - $lookback);

        $recentHighs = array_slice($highs, $start);
        $recentLows = array_slice($lows, $start);
        $window = 5;

        $resistanceLevels = [];
        $supportLevels = [];

        $rLen = count($recentHighs);
        for ($i = $window; $i < $rLen - $window; $i++) {
            $localMax = max(array_slice($recentHighs, $i - $window, $window * 2 + 1));
            if ($recentHighs[$i] == $localMax) {
                $resistanceLevels[] = $recentHighs[$i];
            }
            $localMin = min(array_slice($recentLows, $i - $window, $window * 2 + 1));
            if ($recentLows[$i] == $localMin) {
                $supportLevels[] = $recentLows[$i];
            }
        }

        $supportsBelow = array_filter($supportLevels, fn($s) => $s < $price);
        $resistancesAbove = array_filter($resistanceLevels, fn($r) => $r > $price);

        $nearestSupport = ! empty($supportsBelow) ? max($supportsBelow) : min($recentLows);
        $nearestResistance = ! empty($resistancesAbove) ? min($resistancesAbove) : max($recentHighs);

        return [
            'nearest_support' => round($nearestSupport, 2),
            'nearest_resistance' => round($nearestResistance, 2),
            'support_distance_pct' => $price > 0 ? round((($price - $nearestSupport) / $price) * -100, 2) : 0,
            'resistance_distance_pct' => $price > 0 ? round((($nearestResistance - $price) / $price) * 100, 2) : 0,
        ];
    }

    private function computeVolumeAnalysis(array $volumes): array
    {
        $current = end($volumes);
        $n = count($volumes);
        $avg20d = $n >= 20
            ? array_sum(array_slice($volumes, -20)) / 20
            : $current;

        $ratio = $avg20d > 0 ? round($current / $avg20d, 2) : 1.0;

        $signal = 'NORMAL';
        if ($ratio > 1.5) {
            $signal = 'HIGH';
        } elseif ($ratio < 0.5) {
            $signal = 'LOW';
        }

        return [
            'current' => (int) $current,
            'avg_20d' => (int) $avg20d,
            'ratio' => $ratio,
            'signal' => $signal,
        ];
    }

    private function determineOverallSignal(array $indicators): string
    {
        $score = 0;

        $rsiSignal = $indicators['rsi']['signal'] ?? 'NEUTRAL';
        if ($rsiSignal === 'OVERSOLD') $score++;
        elseif ($rsiSignal === 'OVERBOUGHT') $score--;

        $macdSignal = $indicators['macd']['signal'] ?? 'NEUTRAL';
        if ($macdSignal === 'BULLISH') $score++;
        elseif ($macdSignal === 'BEARISH') $score--;

        $smaPos = $indicators['moving_averages']['price_vs_sma200'] ?? 'N/A';
        if ($smaPos === 'ABOVE') $score++;
        elseif ($smaPos === 'BELOW') $score--;

        $bbPos = $indicators['bollinger']['position'] ?? 0.5;
        if ($bbPos < 0.2) $score++;
        elseif ($bbPos > 0.8) $score--;

        if ($indicators['moving_averages']['golden_cross'] ?? false) $score++;
        if ($indicators['moving_averages']['death_cross'] ?? false) $score--;

        if ($score >= 2) return 'BULLISH';
        if ($score <= -2) return 'BEARISH';
        return 'NEUTRAL';
    }

    private function ema(array $data, int $period): array
    {
        $n = count($data);
        $result = array_fill(0, $n, 0.0);
        $multiplier = 2.0 / ($period + 1);

        // Initialize with SMA
        $result[0] = $data[0];
        for ($i = 1; $i < $n; $i++) {
            $result[$i] = ($data[$i] - $result[$i - 1]) * $multiplier + $result[$i - 1];
        }

        return $result;
    }

    private function stdDev(array $data): float
    {
        $n = count($data);
        if ($n < 2) return 0;
        $mean = array_sum($data) / $n;
        $sumSquares = array_sum(array_map(fn($x) => ($x - $mean) ** 2, $data));
        return sqrt($sumSquares / ($n - 1));
    }
}
