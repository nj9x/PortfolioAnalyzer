<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\ChartAnalysisService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class ChartAnalysisController extends Controller
{
    private ChartAnalysisService $service;

    public function __construct(ChartAnalysisService $service)
    {
        $this->service = $service;
    }

    public function analyze(Request $request): JsonResponse
    {
        $request->validate([
            'file' => 'required|file|mimes:png,jpg,jpeg,webp',
            'analysis_type' => 'nullable|string',
            'user_notes' => 'nullable|string',
        ]);

        try {
            $result = $this->service->analyzeChart(
                $request->file('file'),
                $request->input('analysis_type', 'technical'),
                $request->input('user_notes', ''),
            );

            return response()->json($this->formatAnalysis($result), 201);
        } catch (\InvalidArgumentException $e) {
            return response()->json(['detail' => $e->getMessage()], 400);
        }
    }

    public function history(Request $request): JsonResponse
    {
        $limit = $request->query('limit', 50);
        $analyses = $this->service->getAnalysisHistory((int) $limit);

        return response()->json($analyses->map(fn($a) => [
            'id' => $a->id,
            'ticker' => $a->ticker,
            'timeframe' => $a->timeframe,
            'trend' => $a->trend,
            'overall_bias' => $a->overall_bias,
            'original_filename' => $a->original_filename,
            'created_at' => $a->created_at,
        ]));
    }

    public function show(int $id): JsonResponse
    {
        $result = $this->service->getAnalysisById($id);
        if (! $result) {
            return response()->json(['detail' => 'Chart analysis not found'], 404);
        }
        return response()->json($this->formatAnalysis($result));
    }

    public function destroy(int $id): JsonResponse
    {
        if (! $this->service->deleteAnalysis($id)) {
            return response()->json(['detail' => 'Chart analysis not found'], 404);
        }
        return response()->json(null, 204);
    }

    public function image(int $id): \Symfony\Component\HttpFoundation\Response
    {
        $result = $this->service->getAnalysisById($id);
        if (! $result) {
            return response()->json(['detail' => 'Chart analysis not found'], 404);
        }

        $path = $result->image_path;
        if (! Storage::disk('local')->exists($path)) {
            return response()->json(['detail' => 'Image file not found'], 404);
        }

        return response()->file(Storage::disk('local')->path($path));
    }

    private function formatAnalysis($analysis): array
    {
        return [
            'id' => $analysis->id,
            'image_path' => $analysis->image_path,
            'original_filename' => $analysis->original_filename,
            'ticker' => $analysis->ticker,
            'timeframe' => $analysis->timeframe,
            'analysis_type' => $analysis->analysis_type,
            'trend' => $analysis->trend,
            'overall_bias' => $analysis->overall_bias,
            'model_used' => $analysis->model_used,
            'created_at' => $analysis->created_at,
            'results' => $analysis->parsed_results ? json_decode($analysis->parsed_results, true) : null,
        ];
    }
}
