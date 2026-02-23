<?php

namespace App\DataSources;

use Carbon\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;

/**
 * Company overview and financial statements via Massive.com REST API.
 *
 * Previously used Alpha Vantage — now backed by Massive for all data.
 */
class AlphaVantage
{
    private MassiveClient $client;
    private YahooFinance $yahooFinance;

    public function __construct(MassiveClient $client, YahooFinance $yahooFinance)
    {
        $this->client = $client;
        $this->yahooFinance = $yahooFinance;
    }

    /**
     * Get historical OHLCV data.
     */
    public function fetchHistory(string $ticker, int $days = 365): array
    {
        $cacheKey = "massive_av_history:{$ticker}:{$days}";
        $cached = Cache::get($cacheKey);
        if ($cached) {
            return $cached;
        }

        $toDate = Carbon::now()->format('Y-m-d');
        $fromDate = Carbon::now()->subDays($days + 30)->format('Y-m-d');

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

            $rows = array_slice($rows, -$days);
            $ttl = $days >= 252 ? 1800 : 120;
            Cache::put($cacheKey, $rows, $ttl);

            return $rows;
        } catch (\Throwable $e) {
            Log::error("Failed to fetch history for {$ticker}: {$e->getMessage()}");
            return [];
        }
    }

    /**
     * Get current quote using Massive previous close aggregate.
     */
    public function fetchQuote(string $ticker): array
    {
        $cacheKey = "massive_av_quote:{$ticker}";
        $cached = Cache::get($cacheKey);
        if ($cached) {
            return $cached;
        }

        try {
            $toDate = Carbon::now()->format('Y-m-d');
            $fromDate = Carbon::now()->subDays(7)->format('Y-m-d');

            $aggs = $this->client->getAggs($ticker, 1, 'day', $fromDate, $toDate, ['limit' => 5]);

            if (empty($aggs)) {
                return [];
            }

            $latest = end($aggs);
            $prev = count($aggs) >= 2 ? $aggs[count($aggs) - 2] : null;

            $currentPrice = isset($latest['c']) ? (float) $latest['c'] : null;
            $previousClose = ($prev && isset($prev['c'])) ? (float) $prev['c'] : null;

            $dayChangePct = null;
            if ($currentPrice && $previousClose && $previousClose != 0) {
                $dayChangePct = round((($currentPrice - $previousClose) / $previousClose) * 100, 2);
            }

            $result = [
                'current_price' => $currentPrice ? round($currentPrice, 2) : null,
                'previous_close' => $previousClose ? round($previousClose, 2) : null,
                'day_change_pct' => $dayChangePct,
                'open' => isset($latest['o']) ? (float) $latest['o'] : null,
                'high' => isset($latest['h']) ? (float) $latest['h'] : null,
                'low' => isset($latest['l']) ? (float) $latest['l'] : null,
                'volume' => isset($latest['v']) ? (int) $latest['v'] : null,
            ];

            Cache::put($cacheKey, $result, 60);
            return $result;
        } catch (\Throwable $e) {
            Log::error("Failed to fetch quote for {$ticker}: {$e->getMessage()}");
            return [];
        }
    }

    /**
     * Fetch company overview via Massive ticker details + ratios.
     */
    public function getCompanyOverview(string $ticker): array
    {
        $cacheKey = "massive_overview:{$ticker}";
        $cached = Cache::get($cacheKey);
        if ($cached) {
            return $cached;
        }

        $result = [];

        try {
            $details = $this->client->getTickerDetails($ticker);
            if ($details) {
                $result['name'] = $details['name'] ?? $ticker;
                $result['sector'] = $details['sic_description'] ?? null;
                $result['industry'] = $details['sic_description'] ?? null;
                $result['market_cap'] = isset($details['market_cap']) ? (int) $details['market_cap'] : null;
                $result['shares_outstanding'] = $details['weighted_shares_outstanding']
                    ?? $details['share_class_shares_outstanding'] ?? null;
            }
        } catch (\Throwable $e) {
            Log::warning("Massive ticker details failed for {$ticker}: {$e->getMessage()}");
        }

        // Income statement for revenue, EBITDA
        try {
            $stmts = $this->client->getIncomeStatements($ticker, 'annual', 2);
            if (! empty($stmts)) {
                $latest = $stmts[0]['financials']['income_statement'] ?? [];
                $result['revenue'] = isset($latest['revenues']['value']) ? (int) $latest['revenues']['value'] : null;
                $result['ebitda'] = isset($latest['ebitda']['value']) ? (int) $latest['ebitda']['value'] : null;

                if (count($stmts) >= 2) {
                    $prior = $stmts[1]['financials']['income_statement'] ?? [];
                    $latestRev = $latest['revenues']['value'] ?? null;
                    $priorRev = $prior['revenues']['value'] ?? null;
                    if ($latestRev && $priorRev && $priorRev != 0) {
                        $result['revenue_growth'] = round(($latestRev - $priorRev) / abs($priorRev), 4);
                    }
                }
            }
        } catch (\Throwable $e) {
            Log::warning("Massive income stmt failed for {$ticker}: {$e->getMessage()}");
        }

        // 52-week range
        try {
            $history = $this->yahooFinance->fetchHistory($ticker, '1y');
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

        Cache::put($cacheKey, $result, config('portfolio.alpha_vantage_cache_ttl', 3600));
        return $result;
    }

    /**
     * Fetch financial statements via Massive.
     */
    public function fetchFinancialStatements(string $ticker): array
    {
        return $this->yahooFinance->fetchFinancials($ticker);
    }
}
