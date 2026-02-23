<?php

namespace App\DataSources;

use Carbon\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;

/**
 * Stock data via Massive.com REST API — the priority real-time data source.
 *
 * Provides quotes, history, company info, and financial statement data.
 */
class YahooFinance
{
    private MassiveClient $client;

    public function __construct(MassiveClient $client)
    {
        $this->client = $client;
    }

    /**
     * Fetch current quotes for a list of tickers via Massive snapshot.
     */
    public function fetchQuotes(array $tickers): array
    {
        $data = [];

        try {
            $snapshots = $this->client->getSnapshotAll($tickers);
        } catch (\Throwable $e) {
            Log::error("Massive snapshot_all failed: {$e->getMessage()}");
            $snapshots = [];
        }

        $snapshotMap = [];
        foreach ($snapshots as $snap) {
            if (isset($snap['ticker'])) {
                $snapshotMap[$snap['ticker']] = $snap;
            }
        }

        foreach ($tickers as $t) {
            $snap = $snapshotMap[$t] ?? null;

            if (! $snap || ! isset($snap['day'])) {
                $data[$t] = ['current_price' => null, 'error' => "No data for {$t}"];
                continue;
            }

            try {
                $currentPrice = $snap['day']['c'] ?? null;
                $previousClose = $snap['prevDay']['c'] ?? null;

                $dayChangePct = null;
                if ($currentPrice && $previousClose && $previousClose != 0) {
                    $dayChangePct = round((($currentPrice - $previousClose) / $previousClose) * 100, 2);
                }

                $details = $this->getTickerDetailsCached($t);

                $data[$t] = [
                    'current_price' => $currentPrice ? round($currentPrice, 2) : null,
                    'previous_close' => $previousClose ? round($previousClose, 2) : null,
                    'market_cap' => $details['market_cap'] ?? null,
                    'pe_ratio' => $details['pe_ratio'] ?? null,
                    'fifty_two_week_high' => $details['fifty_two_week_high'] ?? null,
                    'fifty_two_week_low' => $details['fifty_two_week_low'] ?? null,
                    'sector' => $details['sector'] ?? null,
                    'name' => $details['name'] ?? $t,
                    'day_change_pct' => $dayChangePct,
                ];
            } catch (\Throwable $e) {
                Log::error("Failed to process quote for {$t}: {$e->getMessage()}");
                $data[$t] = ['current_price' => null, 'error' => "Failed to fetch data for {$t}"];
            }
        }

        return $data;
    }

    /**
     * Fetch historical OHLCV data via Massive aggregates.
     */
    public function fetchHistory(string $ticker, string $period = '1mo'): array
    {
        $cacheKey = "massive_history:{$ticker}:{$period}";
        $cached = Cache::get($cacheKey);
        if ($cached) {
            return $cached;
        }

        $periodDays = [
            '1mo' => 30, '3mo' => 90, '6mo' => 180,
            '1y' => 365, '2y' => 730, '5y' => 1825,
        ][$period] ?? 30;

        $toDate = Carbon::now()->format('Y-m-d');
        $fromDate = Carbon::now()->subDays($periodDays)->format('Y-m-d');

        try {
            $aggs = $this->client->getAggs($ticker, 1, 'day', $fromDate, $toDate);

            if (empty($aggs)) {
                return [];
            }

            $rows = [];
            foreach ($aggs as $agg) {
                if (isset($agg['t'])) {
                    $dt = Carbon::createFromTimestampMs($agg['t']);
                    $rows[] = [
                        'date' => $dt->format('Y-m-d'),
                        'open' => (float) ($agg['o'] ?? 0),
                        'high' => (float) ($agg['h'] ?? 0),
                        'low' => (float) ($agg['l'] ?? 0),
                        'close' => (float) ($agg['c'] ?? 0),
                        'volume' => (int) ($agg['v'] ?? 0),
                    ];
                }
            }

            $ttl = in_array($period, ['1y', '2y', '5y']) ? 1800 : 120;
            Cache::put($cacheKey, $rows, $ttl);

            return $rows;
        } catch (\Throwable $e) {
            Log::error("Failed to fetch history for {$ticker}: {$e->getMessage()}");
            return [];
        }
    }

    /**
     * Fetch company info via Massive ticker details + financial ratios.
     */
    public function fetchInfoSafe(string $ticker): array
    {
        $cacheKey = "massive_info:{$ticker}";
        $cached = Cache::get($cacheKey);
        if ($cached) {
            return $cached;
        }

        $info = [];

        // Ticker details
        try {
            $details = $this->client->getTickerDetails($ticker);
            if ($details) {
                $info['longName'] = $details['name'] ?? null;
                $info['shortName'] = $details['name'] ?? null;
                $info['sector'] = $details['sic_description'] ?? null;
                $info['marketCap'] = isset($details['market_cap']) ? (int) $details['market_cap'] : null;
                $info['sharesOutstanding'] = $details['weighted_shares_outstanding']
                    ?? $details['share_class_shares_outstanding'] ?? null;
            }
        } catch (\Throwable $e) {
            Log::warning("Massive ticker details failed for {$ticker}: {$e->getMessage()}");
        }

        // Financial ratios
        try {
            $ratios = $this->client->getFinancialRatios($ticker, 1);
            if (! empty($ratios)) {
                $r = $ratios[0]['financials'] ?? $ratios[0] ?? [];
                $info['trailingPE'] = $this->safeFloat($r['price_to_earnings'] ?? null);
                $info['forwardPE'] = null;
                $info['beta'] = null;
                $info['priceToBook'] = $this->safeFloat($r['price_to_book'] ?? null);
                $info['returnOnEquity'] = $this->safeFloat($r['return_on_equity'] ?? null);
                $info['returnOnAssets'] = $this->safeFloat($r['return_on_assets'] ?? null);
                $de = $this->safeFloat($r['debt_to_equity'] ?? null);
                $info['debtToEquity'] = $de !== null ? $de * 100 : null;
                $info['currentRatio'] = $this->safeFloat($r['current'] ?? null);
                $info['quickRatio'] = $this->safeFloat($r['quick'] ?? null);
                $info['freeCashflow'] = isset($r['free_cash_flow']) ? (int) $r['free_cash_flow'] : null;
                $info['enterpriseValue'] = isset($r['enterprise_value']) ? (int) $r['enterprise_value'] : null;
                $info['currentPrice'] = $this->safeFloat($r['price'] ?? null);
                $info['dividendYield'] = $this->safeFloat($r['dividend_yield'] ?? null);
                $info['earningsPerShare'] = $this->safeFloat($r['earnings_per_share'] ?? null);
            }
        } catch (\Throwable $e) {
            Log::warning("Massive financial ratios failed for {$ticker}: {$e->getMessage()}");
        }

        // Previous close for current price
        try {
            $prev = $this->client->getPreviousClose($ticker);
            if ($prev) {
                $info['previousClose'] = $prev['c'] ?? null;
                $info['regularMarketPreviousClose'] = $prev['c'] ?? null;
                if (empty($info['currentPrice'])) {
                    $info['currentPrice'] = $prev['c'] ?? null;
                    $info['regularMarketPrice'] = $prev['c'] ?? null;
                }
            }
        } catch (\Throwable $e) {
            Log::warning("Massive previous close failed for {$ticker}: {$e->getMessage()}");
        }

        // 52-week high/low from 1-year history
        try {
            $history = $this->fetchHistory($ticker, '1y');
            if (! empty($history)) {
                $highs = array_filter(array_column($history, 'high'));
                $lows = array_filter(array_column($history, 'low'));
                if (! empty($highs)) {
                    $info['fiftyTwoWeekHigh'] = max($highs);
                }
                if (! empty($lows)) {
                    $info['fiftyTwoWeekLow'] = min($lows);
                }
            }
        } catch (\Throwable $e) {
            // Silently ignore
        }

        if (! empty($info['currentPrice']) || ! empty($info['marketCap'])) {
            Cache::put($cacheKey, $info, 120);
        }

        return $info;
    }

    /**
     * Fetch financial statement data via Massive.
     */
    public function fetchFinancials(string $ticker): array
    {
        $cacheKey = "massive_financials:{$ticker}";
        $cached = Cache::get($cacheKey);
        if ($cached) {
            return $cached;
        }

        $result = [
            'net_income' => null,
            'total_debt' => null,
            'total_cash' => null,
            'free_cashflow' => null,
        ];

        try {
            $stmts = $this->client->getIncomeStatements($ticker, 'annual', 1);
            if (! empty($stmts)) {
                $stmt = $stmts[0]['financials']['income_statement'] ?? [];
                $ni = $stmt['net_income_loss']['value'] ?? null;
                $result['net_income'] = $ni !== null ? (int) $ni : null;
            }
        } catch (\Throwable $e) {
            Log::warning("Massive income statement failed for {$ticker}: {$e->getMessage()}");
        }

        Cache::put($cacheKey, $result, 86400);
        return $result;
    }

    /**
     * Get ticker details with caching.
     */
    private function getTickerDetailsCached(string $ticker): array
    {
        $cacheKey = "massive_details:{$ticker}";
        $cached = Cache::get($cacheKey);
        if ($cached) {
            return $cached;
        }

        $result = [
            'name' => $ticker,
            'sector' => null,
            'market_cap' => null,
            'pe_ratio' => null,
            'fifty_two_week_high' => null,
            'fifty_two_week_low' => null,
        ];

        try {
            $details = $this->client->getTickerDetails($ticker);
            if ($details) {
                $result['name'] = $details['name'] ?? $ticker;
                $result['sector'] = $details['sic_description'] ?? null;
                $result['market_cap'] = isset($details['market_cap']) ? (int) $details['market_cap'] : null;
            }
        } catch (\Throwable $e) {
            Log::warning("Ticker details failed for {$ticker}: {$e->getMessage()}");
        }

        // 52-week range from history
        try {
            $history = $this->fetchHistory($ticker, '1y');
            if (! empty($history)) {
                $highs = array_filter(array_column($history, 'high'));
                $lows = array_filter(array_column($history, 'low'));
                if (! empty($highs)) {
                    $result['fifty_two_week_high'] = max($highs);
                }
                if (! empty($lows)) {
                    $result['fifty_two_week_low'] = min($lows);
                }
            }
        } catch (\Throwable $e) {
            // Silently ignore
        }

        Cache::put($cacheKey, $result, 600);
        return $result;
    }

    private function safeFloat(mixed $val): ?float
    {
        if ($val === null) {
            return null;
        }
        $f = (float) $val;
        return $f != 0 ? round($f, 4) : null;
    }
}
