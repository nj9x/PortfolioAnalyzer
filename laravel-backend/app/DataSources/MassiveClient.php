<?php

namespace App\DataSources;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Massive.com (formerly Polygon.io) — centralized REST client.
 *
 * Massive is the PRIORITY data source for all real-time market data.
 */
class MassiveClient
{
    private string $apiKey;
    private string $baseUrl;
    private bool $validated = false;
    private string $status = 'unchecked';

    public function __construct()
    {
        $this->apiKey = config('portfolio.massive_api_key', '');
        $this->baseUrl = config('portfolio.massive_base_url', 'https://api.massive.com');
    }

    public function isAvailable(): bool
    {
        return $this->validated;
    }

    public function getStatus(): string
    {
        return $this->status;
    }

    public function validateApi(): array
    {
        if (empty($this->apiKey)) {
            $this->validated = false;
            $this->status = 'missing_key';
            return [
                'status' => 'error',
                'provider' => 'massive',
                'message' => 'MASSIVE_API_KEY not configured',
            ];
        }

        try {
            $response = $this->get("/v2/aggs/ticker/AAPL/prev");
            if ($response && isset($response['results'][0]['c'])) {
                $this->validated = true;
                $this->status = 'connected';
                return [
                    'status' => 'ok',
                    'provider' => 'massive',
                    'message' => 'API key valid, real-time data active',
                    'sample_price' => round($response['results'][0]['c'], 2),
                ];
            }

            $this->validated = false;
            $this->status = 'no_data';
            return [
                'status' => 'degraded',
                'provider' => 'massive',
                'message' => 'API responded but returned no data',
            ];
        } catch (\Throwable $e) {
            $this->validated = false;
            $this->status = "error: {$e->getMessage()}";
            Log::error("Massive API validation failed: {$e->getMessage()}");
            return [
                'status' => 'error',
                'provider' => 'massive',
                'message' => $e->getMessage(),
            ];
        }
    }

    /**
     * Make a GET request to the Massive API.
     */
    public function get(string $endpoint, array $params = []): ?array
    {
        $params['apiKey'] = $this->apiKey;

        $response = Http::timeout(15)
            ->get("{$this->baseUrl}{$endpoint}", $params);

        if ($response->successful()) {
            return $response->json();
        }

        Log::warning("Massive API request failed: {$endpoint}", [
            'status' => $response->status(),
            'body' => $response->body(),
        ]);

        return null;
    }

    /**
     * Fetch aggregates (OHLCV bars).
     */
    public function getAggs(string $ticker, int $multiplier, string $timespan, string $from, string $to, array $extra = []): array
    {
        $params = array_merge([
            'adjusted' => 'true',
            'limit' => 50000,
        ], $extra);

        $data = $this->get("/v2/aggs/ticker/{$ticker}/range/{$multiplier}/{$timespan}/{$from}/{$to}", $params);

        return $data['results'] ?? [];
    }

    /**
     * Fetch previous close aggregate.
     */
    public function getPreviousClose(string $ticker): ?array
    {
        $data = $this->get("/v2/aggs/ticker/{$ticker}/prev");
        return $data['results'][0] ?? null;
    }

    /**
     * Fetch snapshot for multiple tickers.
     */
    public function getSnapshotAll(array $tickers): array
    {
        $params = ['tickers' => implode(',', $tickers)];
        $data = $this->get("/v2/snapshot/locale/us/markets/stocks/tickers", $params);
        return $data['tickers'] ?? [];
    }

    /**
     * Fetch ticker details.
     */
    public function getTickerDetails(string $ticker): ?array
    {
        $data = $this->get("/v3/reference/tickers/{$ticker}");
        return $data['results'] ?? null;
    }

    /**
     * Fetch financial ratios.
     */
    public function getFinancialRatios(string $ticker, int $limit = 1): array
    {
        $data = $this->get("/vX/reference/financials", [
            'ticker' => $ticker,
            'limit' => $limit,
            'type' => 'ratios',
        ]);
        return $data['results'] ?? [];
    }

    /**
     * Fetch income statements.
     */
    public function getIncomeStatements(string $ticker, string $timeframe = 'annual', int $limit = 1): array
    {
        $data = $this->get("/vX/reference/financials", [
            'ticker' => $ticker,
            'timeframe' => $timeframe,
            'limit' => $limit,
        ]);
        return $data['results'] ?? [];
    }

    /**
     * Fetch ticker news.
     */
    public function getTickerNews(string $ticker, int $limit = 10): array
    {
        $data = $this->get("/v2/reference/news", [
            'ticker' => $ticker,
            'limit' => $limit,
        ]);
        return $data['results'] ?? [];
    }

    /**
     * Fetch options chain snapshot.
     */
    public function getOptionsChain(string $ticker, array $params = []): array
    {
        $data = $this->get("/v3/snapshot/options/{$ticker}", $params);
        return $data['results'] ?? [];
    }
}
