<?php

namespace App\Services;

use App\Claude\Client as ClaudeClient;
use App\Claude\Prompts;
use App\Claude\ResponseParser;
use App\Models\AnalysisReport;
use App\Models\Portfolio;
use App\Models\Recommendation;

class AnalysisService
{
    private MarketDataService $marketDataService;
    private ClaudeClient $claudeClient;

    public function __construct(MarketDataService $marketDataService, ClaudeClient $claudeClient)
    {
        $this->marketDataService = $marketDataService;
        $this->claudeClient = $claudeClient;
    }

    public function runAnalysis(int $portfolioId): AnalysisReport
    {
        $portfolio = Portfolio::with('holdings')->find($portfolioId);
        if (! $portfolio) {
            throw new \InvalidArgumentException('Portfolio not found');
        }

        if ($portfolio->holdings->isEmpty()) {
            throw new \InvalidArgumentException('Portfolio has no holdings to analyze');
        }

        if (empty(config('portfolio.anthropic_api_key'))) {
            throw new \InvalidArgumentException('ANTHROPIC_API_KEY is not configured');
        }

        $tickers = $portfolio->holdings->pluck('ticker')->toArray();
        $holdingsData = $portfolio->holdings->map(fn($h) => [
            'ticker' => $h->ticker,
            'shares' => $h->shares,
            'cost_basis' => $h->cost_basis,
            'asset_type' => $h->asset_type,
        ])->toArray();

        // Fetch all market context
        $context = $this->marketDataService->getFullMarketContext($tickers, $holdingsData);

        // Build the prompt
        $userMessage = Prompts::buildUserMessage(
            portfolioName: $portfolio->name,
            holdings: $holdingsData,
            quotes: $context['quotes'],
            news: $context['news'],
            predictions: $context['predictions'],
            economic: $context['economic'],
            technicals: $context['technicals'] ?? null,
            fundamentalsData: $context['fundamentals'] ?? null,
            riskData: $context['risk'] ?? null,
            options: $context['options'] ?? null,
        );

        // Call Claude
        $rawResponse = $this->claudeClient->analyzePortfolio($userMessage);

        // Parse response
        $parsed = ResponseParser::parseAnalysisResponse($rawResponse);

        // Store report
        $report = AnalysisReport::create([
            'portfolio_id' => $portfolioId,
            'summary' => $parsed['summary'] ?? 'Analysis completed',
            'risk_score' => $parsed['risk_score'] ?? null,
            'market_outlook' => $parsed['market_outlook'] ?? null,
            'raw_response' => $rawResponse,
            'context_snapshot' => json_encode($context),
            'model_used' => config('portfolio.claude_model'),
            'technical_summary' => isset($parsed['technical_analysis']) ? json_encode($parsed['technical_analysis']) : null,
            'fundamental_summary' => isset($parsed['fundamental_analysis']) ? json_encode($parsed['fundamental_analysis']) : null,
            'risk_analysis' => isset($parsed['risk_management']) ? json_encode($parsed['risk_management']) : null,
            'options_summary' => isset($parsed['options_analysis']) ? json_encode($parsed['options_analysis']) : null,
        ]);

        // Store recommendations
        foreach ($parsed['recommendations'] ?? [] as $rec) {
            Recommendation::create([
                'report_id' => $report->id,
                'ticker' => $rec['ticker'] ?? '',
                'action' => $rec['action'] ?? 'HOLD',
                'confidence' => $rec['confidence'] ?? null,
                'reasoning' => $rec['reasoning'] ?? '',
                'target_price' => $rec['target_price'] ?? null,
                'time_horizon' => $rec['time_horizon'] ?? null,
                'priority' => $rec['priority'] ?? 0,
            ]);
        }

        return $report->fresh('recommendations');
    }

    public function getLatestReport(int $portfolioId): ?AnalysisReport
    {
        return AnalysisReport::with('recommendations')
            ->where('portfolio_id', $portfolioId)
            ->orderByDesc('created_at')
            ->first();
    }

    public function getReportHistory(int $portfolioId, int $limit = 20): \Illuminate\Database\Eloquent\Collection
    {
        return AnalysisReport::where('portfolio_id', $portfolioId)
            ->orderByDesc('created_at')
            ->limit($limit)
            ->get();
    }

    public function getReportById(int $reportId): ?AnalysisReport
    {
        return AnalysisReport::with('recommendations')->find($reportId);
    }
}
