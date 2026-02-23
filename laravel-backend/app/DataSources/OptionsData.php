<?php

namespace App\DataSources;

use Carbon\Carbon;
use Illuminate\Support\Facades\Log;

/**
 * Options chain data and Greeks from Massive.com REST API.
 */
class OptionsData
{
    private MassiveClient $massiveClient;
    private AlphaVantage $alphaVantage;
    private YahooFinance $yahooFinance;

    public function __construct(MassiveClient $massiveClient, AlphaVantage $alphaVantage, YahooFinance $yahooFinance)
    {
        $this->massiveClient = $massiveClient;
        $this->alphaVantage = $alphaVantage;
        $this->yahooFinance = $yahooFinance;
    }

    public function fetchOptionsData(array $tickers): array
    {
        $results = [];

        foreach ($tickers as $ticker) {
            try {
                $avQuote = $this->alphaVantage->fetchQuote($ticker);
                $currentPrice = $avQuote['current_price'] ?? null;

                if (! $currentPrice) {
                    $results[$ticker] = ['has_options' => false, 'ticker' => $ticker, 'error' => 'No price'];
                    continue;
                }

                $minDate = Carbon::now()->addDays(7)->format('Y-m-d');
                $maxDate = Carbon::now()->addDays(45)->format('Y-m-d');

                $options = $this->massiveClient->getOptionsChain($ticker, [
                    'expiration_date.gte' => $minDate,
                    'expiration_date.lte' => $maxDate,
                    'strike_price.gte' => $currentPrice * 0.95,
                    'strike_price.lte' => $currentPrice * 1.05,
                ]);

                if (empty($options)) {
                    $options = $this->massiveClient->getOptionsChain($ticker, [
                        'expiration_date.gte' => $minDate,
                        'strike_price.gte' => $currentPrice * 0.90,
                        'strike_price.lte' => $currentPrice * 1.10,
                    ]);
                }

                if (empty($options)) {
                    $results[$ticker] = ['has_options' => false, 'ticker' => $ticker];
                    continue;
                }

                $calls = array_filter($options, fn($o) =>
                    ($o['details']['contract_type'] ?? '') === 'call'
                );
                $puts = array_filter($options, fn($o) =>
                    ($o['details']['contract_type'] ?? '') === 'put'
                );

                if (empty($calls) && empty($puts)) {
                    $results[$ticker] = ['has_options' => false, 'ticker' => $ticker];
                    continue;
                }

                $atmCall = $this->findAtm(array_values($calls), $currentPrice);
                $atmPut = $this->findAtm(array_values($puts), $currentPrice);

                $atmOption = $atmCall ?? $atmPut;
                $strike = $atmOption['details']['strike_price'] ?? null;
                $expiry = $atmOption['details']['expiration_date'] ?? null;
                $daysToExpiry = $expiry
                    ? max(0, Carbon::parse($expiry)->diffInDays(Carbon::now()))
                    : 0;

                $callData = $atmCall ? $this->extractOption($atmCall) : [];
                $putData = $atmPut ? $this->extractOption($atmPut) : [];

                $ivCall = $callData['implied_volatility'] ?? null;
                $ivPut = $putData['implied_volatility'] ?? null;
                $ivAvg = null;
                if ($ivCall !== null && $ivPut !== null) {
                    $ivAvg = round(($ivCall + $ivPut) / 2, 4);
                } elseif ($ivCall !== null) {
                    $ivAvg = $ivCall;
                } elseif ($ivPut !== null) {
                    $ivAvg = $ivPut;
                }

                $hv = $this->computeHistoricalVolatility($ticker);
                $volComparison = $this->compareIvHv($ivAvg, $hv);

                $results[$ticker] = [
                    'ticker' => $ticker,
                    'has_options' => true,
                    'expiration' => $expiry,
                    'days_to_expiry' => $daysToExpiry,
                    'atm_strike' => $strike,
                    'call' => $callData,
                    'put' => $putData,
                    'volatility' => array_merge([
                        'iv_call' => $ivCall,
                        'iv_put' => $ivPut,
                        'iv_avg' => $ivAvg,
                        'hv_30d' => $hv,
                        'iv_hv_ratio' => ($ivAvg && $hv && $hv > 0) ? round($ivAvg / $hv, 2) : null,
                    ], $volComparison),
                ];
            } catch (\Throwable $e) {
                Log::error("Options data failed for {$ticker}: {$e->getMessage()}");
                $results[$ticker] = ['has_options' => false, 'ticker' => $ticker, 'error' => $e->getMessage()];
            }
        }

        return $results;
    }

    private function findAtm(array $options, float $currentPrice): ?array
    {
        if (empty($options)) {
            return null;
        }

        return collect($options)->sortBy(function ($o) use ($currentPrice) {
            return abs(($o['details']['strike_price'] ?? 0) - $currentPrice);
        })->first();
    }

    private function extractOption(array $option): array
    {
        $result = [];
        $result['strike'] = $option['details']['strike_price'] ?? null;
        $result['last_price'] = $option['day']['close'] ?? null;
        $result['bid'] = $option['last_quote']['bid'] ?? null;
        $result['ask'] = $option['last_quote']['ask'] ?? null;
        $result['implied_volatility'] = $this->safe($option['implied_volatility'] ?? null);
        $result['open_interest'] = (int) ($option['open_interest'] ?? 0);
        $result['volume'] = (int) ($option['day']['volume'] ?? 0);

        $greeks = $option['greeks'] ?? [];
        $result['delta'] = $this->safe($greeks['delta'] ?? null);
        $result['gamma'] = $this->safe($greeks['gamma'] ?? null);
        $result['theta'] = $this->safe($greeks['theta'] ?? null);
        $result['vega'] = $this->safe($greeks['vega'] ?? null);

        return $result;
    }

    private function computeHistoricalVolatility(string $ticker, int $period = 30): ?float
    {
        try {
            $history = $this->yahooFinance->fetchHistory($ticker, '3mo');
            if (count($history) < $period) {
                return null;
            }

            $closes = array_column($history, 'close');
            $logReturns = [];
            for ($i = 1; $i < count($closes); $i++) {
                if ($closes[$i - 1] > 0) {
                    $logReturns[] = log($closes[$i] / $closes[$i - 1]);
                }
            }

            $recent = array_slice($logReturns, -$period);
            if (count($recent) < 2) {
                return null;
            }

            $mean = array_sum($recent) / count($recent);
            $sumSquares = array_sum(array_map(fn($x) => ($x - $mean) ** 2, $recent));
            $std = sqrt($sumSquares / (count($recent) - 1));
            $hv = $std * sqrt(252);

            return round($hv, 4);
        } catch (\Throwable $e) {
            return null;
        }
    }

    private function compareIvHv(?float $iv, ?float $hv): array
    {
        if ($iv === null || $hv === null || $hv == 0) {
            return ['signal' => 'N/A', 'opportunity' => 'Insufficient volatility data'];
        }

        $ratio = $iv / $hv;
        if ($ratio > 1.2) {
            return [
                'signal' => 'IV_ELEVATED',
                'opportunity' => 'IV exceeds HV — options are expensive. Consider selling covered calls or credit spreads.',
            ];
        } elseif ($ratio < 0.8) {
            return [
                'signal' => 'IV_DEPRESSED',
                'opportunity' => 'IV below HV — options are cheap. Consider buying protective puts or debit spreads.',
            ];
        }

        return [
            'signal' => 'IV_NORMAL',
            'opportunity' => 'IV roughly in line with HV — no clear volatility edge.',
        ];
    }

    private function safe(mixed $val): ?float
    {
        if ($val === null) {
            return null;
        }
        $f = (float) $val;
        return is_nan($f) ? null : round($f, 4);
    }
}
