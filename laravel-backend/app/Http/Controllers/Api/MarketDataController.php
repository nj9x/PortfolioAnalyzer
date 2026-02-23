<?php

namespace App\Http\Controllers\Api;

use App\DataSources\MassiveClient;
use App\Http\Controllers\Controller;
use App\Services\MarketDataService;
use App\Services\PortfolioService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

class MarketDataController extends Controller
{
    private MarketDataService $marketDataService;
    private PortfolioService $portfolioService;

    public function __construct(MarketDataService $marketDataService, PortfolioService $portfolioService)
    {
        $this->marketDataService = $marketDataService;
        $this->portfolioService = $portfolioService;
    }

    public function quotes(Request $request): JsonResponse
    {
        $tickers = $this->resolveTickers($request);
        $quotes = $this->marketDataService->getQuotesForTickers($tickers);
        return response()->json(['quotes' => $quotes]);
    }

    public function news(Request $request): JsonResponse
    {
        $tickers = null;
        $portfolioId = $request->query('portfolio_id');
        if ($portfolioId) {
            $portfolio = $this->portfolioService->getPortfolio((int) $portfolioId);
            if ($portfolio) {
                $tickers = $portfolio->holdings->pluck('ticker')->toArray();
            }
        }

        $articles = $this->marketDataService->getNews($tickers);
        return response()->json(['articles' => $articles]);
    }

    public function predictions(): JsonResponse
    {
        $events = $this->marketDataService->getPredictions();
        return response()->json(['events' => $events]);
    }

    public function economic(): JsonResponse
    {
        $indicators = $this->marketDataService->getEconomicIndicators();
        return response()->json(['indicators' => $indicators]);
    }

    public function technicals(Request $request): JsonResponse
    {
        $tickers = $this->resolveTickers($request);
        $data = $this->marketDataService->getTechnicalIndicators($tickers);
        return response()->json(['technicals' => $data]);
    }

    public function fundamentals(Request $request): JsonResponse
    {
        $tickers = $this->resolveTickers($request);
        $data = $this->marketDataService->getFundamentals($tickers);
        return response()->json(['fundamentals' => $data]);
    }

    public function options(Request $request): JsonResponse
    {
        $tickers = $this->resolveTickers($request);
        $data = $this->marketDataService->getOptionsData($tickers);
        return response()->json(['options' => $data]);
    }

    public function risk(Request $request): JsonResponse
    {
        $portfolioId = $request->query('portfolio_id');
        if (! $portfolioId) {
            return response()->json(['detail' => 'portfolio_id is required'], 400);
        }

        $portfolio = $this->portfolioService->getPortfolio((int) $portfolioId);
        if (! $portfolio) {
            return response()->json(['detail' => 'Portfolio not found'], 404);
        }

        $holdings = $portfolio->holdings->map(fn($h) => [
            'ticker' => $h->ticker,
            'shares' => $h->shares,
            'cost_basis' => $h->cost_basis,
        ])->toArray();

        $tickers = $portfolio->holdings->pluck('ticker')->toArray();
        $quotes = $this->marketDataService->getQuotesForTickers($tickers);
        $data = $this->marketDataService->getPortfolioRisk($holdings, $quotes);

        return response()->json(['risk' => $data]);
    }

    public function status(MassiveClient $massive): JsonResponse
    {
        return response()->json([
            'primary_source' => 'massive',
            'massive' => [
                'available' => $massive->isAvailable(),
                'status' => $massive->getStatus(),
                'key_configured' => ! empty(config('portfolio.massive_api_key')),
            ],
            'supplemental' => [
                'newsapi' => ['key_configured' => ! empty(config('portfolio.news_api_key'))],
                'fred' => ['key_configured' => ! empty(config('portfolio.fred_api_key'))],
                'polymarket' => ['available' => true],
            ],
        ]);
    }

    public function refresh(MassiveClient $massive): JsonResponse
    {
        Cache::flush();
        $massiveStatus = $massive->validateApi();
        return response()->json([
            'status' => 'Cache cleared — fresh data will be fetched from Massive',
            'massive_api' => $massiveStatus,
        ]);
    }

    private function resolveTickers(Request $request): array
    {
        $portfolioId = $request->query('portfolio_id');
        $tickers = $request->query('tickers');

        if ($portfolioId) {
            $portfolio = $this->portfolioService->getPortfolio((int) $portfolioId);
            if (! $portfolio) {
                abort(404, 'Portfolio not found');
            }
            return $portfolio->holdings->pluck('ticker')->toArray();
        } elseif ($tickers) {
            return array_map(fn($t) => strtoupper(trim($t)), explode(',', $tickers));
        }

        abort(400, 'Provide portfolio_id or tickers');
    }
}
