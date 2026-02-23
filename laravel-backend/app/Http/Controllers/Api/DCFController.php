<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\DCFService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DCFController extends Controller
{
    private DCFService $service;

    public function __construct(DCFService $service)
    {
        $this->service = $service;
    }

    public function financials(string $ticker): JsonResponse
    {
        try {
            $data = $this->service->fetchDcfFinancials(strtoupper($ticker));
            if (empty($data['free_cashflow']) && empty($data['current_price'])) {
                return response()->json(['detail' => "Could not find financial data for {$ticker}"], 404);
            }
            return response()->json($data);
        } catch (\Throwable $e) {
            return response()->json(['detail' => $e->getMessage()], 500);
        }
    }

    public function calculate(Request $request): JsonResponse
    {
        $request->validate([
            'base_fcf' => 'required|numeric',
            'projection_years' => 'nullable|integer|min:1|max:30',
            'growth_rate_phase1' => 'nullable|numeric',
            'growth_rate_phase2' => 'nullable|numeric',
            'discount_rate' => 'nullable|numeric',
            'terminal_method' => 'nullable|string|in:gordon,exit_multiple',
            'terminal_multiple' => 'nullable|numeric',
            'shares_outstanding' => 'nullable|numeric|min:0.001',
            'total_debt' => 'nullable|numeric',
            'total_cash' => 'nullable|numeric',
            'current_price' => 'nullable|numeric',
            'save' => 'nullable|boolean',
        ]);

        try {
            $result = $this->service->runDcfCalculation($request->all());
            return response()->json($this->formatValuation($result), 201);
        } catch (\InvalidArgumentException $e) {
            return response()->json(['detail' => $e->getMessage()], 400);
        }
    }

    public function history(Request $request): JsonResponse
    {
        $ticker = $request->query('ticker');
        $limit = $request->query('limit', 50);
        $valuations = $this->service->getValuationHistory($ticker, (int) $limit);

        return response()->json($valuations->map(fn($v) => [
            'id' => $v->id,
            'ticker' => $v->ticker,
            'company_name' => $v->company_name,
            'intrinsic_value_per_share' => $v->intrinsic_value_per_share,
            'current_price' => $v->current_price,
            'upside_downside_pct' => $v->upside_downside_pct,
            'valuation_verdict' => $v->valuation_verdict,
            'created_at' => $v->created_at,
        ]));
    }

    public function show(int $id): JsonResponse
    {
        $result = $this->service->getValuationById($id);
        if (! $result) {
            return response()->json(['detail' => 'DCF valuation not found'], 404);
        }
        return response()->json($this->formatValuation($result));
    }

    public function destroy(int $id): JsonResponse
    {
        if (! $this->service->deleteValuation($id)) {
            return response()->json(['detail' => 'DCF valuation not found'], 404);
        }
        return response()->json(null, 204);
    }

    private function formatValuation($v): array
    {
        return [
            'id' => $v->id,
            'ticker' => $v->ticker,
            'company_name' => $v->company_name,
            'intrinsic_value_per_share' => $v->intrinsic_value_per_share,
            'current_price' => $v->current_price,
            'upside_downside_pct' => $v->upside_downside_pct,
            'margin_of_safety' => $v->margin_of_safety,
            'valuation_verdict' => $v->valuation_verdict,
            'enterprise_value' => $v->enterprise_value,
            'equity_value' => $v->equity_value,
            'terminal_value' => $v->terminal_value,
            'discount_rate' => $v->discount_rate,
            'projected_fcfs' => json_decode($v->projected_fcfs, true) ?? [],
            'sensitivity_table' => json_decode($v->sensitivity_table, true) ?? [],
            'base_fcf' => $v->base_fcf,
            'projection_years' => $v->projection_years,
            'growth_rate_phase1' => $v->growth_rate_phase1,
            'growth_rate_phase2' => $v->growth_rate_phase2,
            'terminal_method' => $v->terminal_method,
            'terminal_multiple' => $v->terminal_multiple,
            'shares_outstanding' => $v->shares_outstanding,
            'total_debt' => $v->total_debt,
            'total_cash' => $v->total_cash,
            'created_at' => $v->created_at,
        ];
    }
}
