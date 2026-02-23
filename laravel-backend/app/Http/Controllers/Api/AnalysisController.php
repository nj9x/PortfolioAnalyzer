<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\AnalysisService;
use Illuminate\Http\JsonResponse;

class AnalysisController extends Controller
{
    private AnalysisService $service;

    public function __construct(AnalysisService $service)
    {
        $this->service = $service;
    }

    public function analyze(int $portfolioId): JsonResponse
    {
        try {
            $report = $this->service->runAnalysis($portfolioId);
            return response()->json($this->formatReport($report));
        } catch (\InvalidArgumentException $e) {
            return response()->json(['detail' => $e->getMessage()], 400);
        }
    }

    public function latest(int $portfolioId): JsonResponse
    {
        $report = $this->service->getLatestReport($portfolioId);
        if (! $report) {
            return response()->json(['detail' => 'No analysis found for this portfolio'], 404);
        }
        return response()->json($this->formatReport($report));
    }

    public function history(int $portfolioId): JsonResponse
    {
        $reports = $this->service->getReportHistory($portfolioId);
        return response()->json($reports->map(fn($r) => [
            'id' => $r->id,
            'portfolio_id' => $r->portfolio_id,
            'summary' => $r->summary,
            'risk_score' => $r->risk_score,
            'market_outlook' => $r->market_outlook,
            'created_at' => $r->created_at,
        ]));
    }

    public function show(int $reportId): JsonResponse
    {
        $report = $this->service->getReportById($reportId);
        if (! $report) {
            return response()->json(['detail' => 'Report not found'], 404);
        }
        return response()->json($this->formatReport($report));
    }

    private function formatReport($report): array
    {
        $data = [
            'id' => $report->id,
            'portfolio_id' => $report->portfolio_id,
            'summary' => $report->summary,
            'risk_score' => $report->risk_score,
            'market_outlook' => $report->market_outlook,
            'model_used' => $report->model_used,
            'created_at' => $report->created_at,
            'recommendations' => $report->recommendations->map(fn($r) => [
                'id' => $r->id,
                'ticker' => $r->ticker,
                'action' => $r->action,
                'confidence' => $r->confidence,
                'reasoning' => $r->reasoning,
                'target_price' => $r->target_price,
                'time_horizon' => $r->time_horizon,
                'priority' => $r->priority,
            ])->toArray(),
            'technical_analysis' => $report->technical_summary ? json_decode($report->technical_summary, true) : null,
            'fundamental_analysis' => $report->fundamental_summary ? json_decode($report->fundamental_summary, true) : null,
            'risk_management' => $report->risk_analysis ? json_decode($report->risk_analysis, true) : null,
            'options_analysis' => $report->options_summary ? json_decode($report->options_summary, true) : null,
        ];
        return $data;
    }
}
