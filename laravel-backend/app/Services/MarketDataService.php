<?php

namespace App\Services;

use App\DataSources\Fundamentals;
use App\DataSources\Fred;
use App\DataSources\MassiveClient;
use App\DataSources\NewsApi;
use App\DataSources\OptionsData;
use App\DataSources\Polymarket;
use App\DataSources\TechnicalAnalysis;
use App\DataSources\YahooFinance;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;

/**
 * Market data orchestration — Massive API is the priority data source.
 */
class MarketDataService
{
    public function __construct(
        private YahooFinance $yahooFinance,
        private NewsApi $newsApi,
        private Polymarket $polymarket,
        private Fred $fred,
        private TechnicalAnalysis $technicalAnalysis,
        private Fundamentals $fundamentals,
        private OptionsData $optionsData,
        private RiskService $riskService,
        private MassiveClient $massiveClient,
    ) {}

    public function getQuotesForTickers(array $tickers): array
    {
        $uncached = [];
        $result = [];

        foreach ($tickers as $t) {
            $cached = Cache::get("quote:{$t}");
            if ($cached) {
                $result[$t] = $cached;
            } else {
                $uncached[] = $t;
            }
        }

        if (! empty($uncached)) {
            if (! $this->massiveClient->isAvailable()) {
                Log::warning('Massive API unavailable — quote data may be stale or empty');
            }
            $fresh = $this->yahooFinance->fetchQuotes($uncached);
            $ttl = config('portfolio.stock_cache_ttl', 60);
            foreach ($fresh as $t => $data) {
                Cache::put("quote:{$t}", $data, $ttl);
                $result[$t] = $data;
            }
        }

        return $result;
    }

    public function getNews(?array $tickers = null): array
    {
        $cacheKey = 'news:' . ($tickers ? implode(',', collect($tickers)->sort()->toArray()) : 'general');
        $cached = Cache::get($cacheKey);
        if ($cached) {
            return $cached;
        }

        $articles = $this->newsApi->fetchFinancialNews($tickers);
        Cache::put($cacheKey, $articles, config('portfolio.news_cache_ttl', 900));
        return $articles;
    }

    public function getPredictions(): array
    {
        $cached = Cache::get('polymarket:events');
        if ($cached) {
            return $cached;
        }

        $events = $this->polymarket->fetchEvents(20);
        Cache::put('polymarket:events', $events, config('portfolio.polymarket_cache_ttl', 600));
        return $events;
    }

    public function getEconomicIndicators(): array
    {
        $cached = Cache::get('fred:indicators');
        if ($cached) {
            return $cached;
        }

        $indicators = $this->fred->fetchIndicators();
        if (! empty($indicators)) {
            Cache::put('fred:indicators', $indicators, config('portfolio.fred_cache_ttl', 86400));
        }
        return $indicators;
    }

    public function getTechnicalIndicators(array $tickers): array
    {
        $cacheKey = 'technicals:' . implode(',', collect($tickers)->sort()->toArray());
        $cached = Cache::get($cacheKey);
        if ($cached) {
            return $cached;
        }

        $result = $this->technicalAnalysis->computeAllTechnicals($tickers);
        Cache::put($cacheKey, $result, config('portfolio.technical_cache_ttl', 120));
        return $result;
    }

    public function getFundamentals(array $tickers): array
    {
        $cacheKey = 'fundamentals:' . implode(',', collect($tickers)->sort()->toArray());
        $cached = Cache::get($cacheKey);
        if ($cached) {
            return $cached;
        }

        $result = $this->fundamentals->fetchFundamentals($tickers);
        Cache::put($cacheKey, $result, config('portfolio.fundamentals_cache_ttl', 1800));
        return $result;
    }

    public function getOptionsData(array $tickers): array
    {
        $cacheKey = 'options:' . implode(',', collect($tickers)->sort()->toArray());
        $cached = Cache::get($cacheKey);
        if ($cached) {
            return $cached;
        }

        $result = $this->optionsData->fetchOptionsData($tickers);
        Cache::put($cacheKey, $result, config('portfolio.options_cache_ttl', 120));
        return $result;
    }

    public function getPortfolioRisk(array $holdings, array $quotes): array
    {
        $tickers = collect($holdings)->pluck('ticker')->sort()->toArray();
        $cacheKey = 'risk:' . implode(',', $tickers);
        $cached = Cache::get($cacheKey);
        if ($cached) {
            return $cached;
        }

        $result = $this->riskService->computePortfolioRisk($holdings, $quotes);
        Cache::put($cacheKey, $result, config('portfolio.risk_cache_ttl', 120));
        return $result;
    }

    /**
     * Fetch all market data sources for analysis context.
     */
    public function getFullMarketContext(array $tickers, ?array $holdings = null): array
    {
        if (! $this->massiveClient->isAvailable()) {
            Log::warning('Massive API not available — market context will be incomplete.');
        }

        // Phase 1 & 2: Fetch all data concurrently (in PHP we do sequential)
        $quotes = $this->getQuotesForTickers($tickers);
        $technicals = $this->getTechnicalIndicators($tickers);
        $fundamentalsData = $this->getFundamentals($tickers);
        $options = $this->getOptionsData($tickers);
        $economic = $this->getEconomicIndicators();
        $articles = $this->getNews($tickers);
        $predictions = $this->getPredictions();

        $context = [
            'quotes' => $quotes,
            'technicals' => $technicals,
            'fundamentals' => $fundamentalsData,
            'options' => $options,
            'news' => $articles,
            'economic' => $economic,
            'predictions' => $predictions,
            'data_source' => [
                'primary' => 'massive',
                'massive_available' => $this->massiveClient->isAvailable(),
            ],
        ];

        // Phase 3: Risk metrics
        if ($holdings) {
            $context['risk'] = $this->getPortfolioRisk($holdings, $quotes);
        } else {
            $context['risk'] = [];
        }

        return $context;
    }
}
