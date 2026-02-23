<?php

namespace App\DataSources;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Financial news — Massive API (priority) with NewsAPI fallback.
 */
class NewsApi
{
    private const BASE_URL = 'https://newsapi.org/v2';

    private const FINANCIAL_DOMAINS = 'reuters.com,bloomberg.com,cnbc.com,wsj.com,ft.com,marketwatch.com,finance.yahoo.com,barrons.com,seekingalpha.com,investopedia.com,thestreet.com,fool.com,businessinsider.com,forbes.com';

    private MassiveClient $massiveClient;

    public function __construct(MassiveClient $massiveClient)
    {
        $this->massiveClient = $massiveClient;
    }

    /**
     * Fetch financial news — tries Massive first, falls back to NewsAPI.
     */
    public function fetchFinancialNews(?array $tickers = null, int $pageSize = 10): array
    {
        // Priority: Massive ticker news
        if ($tickers && $this->massiveClient->isAvailable()) {
            $articles = $this->fetchMassiveNews($tickers, $pageSize);
            if (! empty($articles)) {
                return $articles;
            }
        }

        // Fallback: NewsAPI
        return $this->fetchNewsApi($tickers, $pageSize);
    }

    private function fetchMassiveNews(array $tickers, int $limit = 10): array
    {
        $cacheKey = 'massive_news:' . implode(',', array_slice(sort($tickers) ?: $tickers, 0, 5));
        $cached = Cache::get($cacheKey);
        if ($cached) {
            return $cached;
        }

        try {
            $allArticles = [];
            foreach (array_slice($tickers, 0, 5) as $ticker) {
                try {
                    $items = $this->massiveClient->getTickerNews($ticker, $limit);
                    foreach ($items as $item) {
                        $allArticles[] = [
                            'title' => $item['title'] ?? '',
                            'source' => $item['publisher']['name'] ?? '',
                            'url' => $item['article_url'] ?? '',
                            'published_at' => $item['published_utc'] ?? '',
                            'description' => $item['description'] ?? '',
                            'tickers' => array_map(
                                fn($t) => $t['ticker'] ?? $t,
                                $item['tickers'] ?? []
                            ),
                            'source_api' => 'massive',
                        ];
                    }
                } catch (\Throwable $e) {
                    Log::warning("Massive news failed for {$ticker}: {$e->getMessage()}");
                }
            }

            // Deduplicate by title
            $seen = [];
            $unique = [];
            foreach ($allArticles as $a) {
                if (! empty($a['title']) && ! isset($seen[$a['title']])) {
                    $seen[$a['title']] = true;
                    $unique[] = $a;
                }
            }

            // Sort by published date
            usort($unique, fn($a, $b) => ($b['published_at'] ?? '') <=> ($a['published_at'] ?? ''));
            $result = array_slice($unique, 0, $limit);

            if (! empty($result)) {
                Cache::put($cacheKey, $result, 120);
            }

            return $result;
        } catch (\Throwable $e) {
            Log::error("Massive news fetch failed: {$e->getMessage()}");
            return [];
        }
    }

    private function fetchNewsApi(?array $tickers = null, int $pageSize = 10): array
    {
        $apiKey = config('portfolio.news_api_key');
        if (empty($apiKey)) {
            return [];
        }

        if ($tickers) {
            $tickerQueries = array_map(fn($t) => "\"{$t}\" stock", array_slice($tickers, 0, 5));
            $query = implode(' OR ', $tickerQueries);
        } else {
            $query = 'stock market OR economy OR federal reserve OR earnings';
        }

        try {
            $response = Http::timeout(15)
                ->withHeaders(['X-Api-Key' => $apiKey])
                ->get(self::BASE_URL . '/everything', [
                    'q' => $query,
                    'language' => 'en',
                    'sortBy' => 'publishedAt',
                    'pageSize' => $pageSize,
                    'domains' => self::FINANCIAL_DOMAINS,
                ]);

            if (! $response->successful()) {
                return [];
            }

            $data = $response->json();
            return array_map(fn($article) => [
                'title' => $article['title'] ?? '',
                'source' => $article['source']['name'] ?? '',
                'url' => $article['url'] ?? '',
                'published_at' => $article['publishedAt'] ?? '',
                'description' => $article['description'] ?? '',
                'source_api' => 'newsapi',
            ], $data['articles'] ?? []);
        } catch (\Throwable $e) {
            return [];
        }
    }
}
