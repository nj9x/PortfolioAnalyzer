<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\PortfolioService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PortfolioController extends Controller
{
    private PortfolioService $service;

    public function __construct(PortfolioService $service)
    {
        $this->service = $service;
    }

    public function index(): JsonResponse
    {
        $portfolios = $this->service->listPortfolios();
        $result = $portfolios->map(fn($p) => [
            'id' => $p->id,
            'name' => $p->name,
            'description' => $p->description,
            'created_at' => $p->created_at,
            'updated_at' => $p->updated_at,
            'holdings_count' => $p->holdings->count(),
        ]);
        return response()->json($result);
    }

    public function store(Request $request): JsonResponse
    {
        $request->validate([
            'name' => 'required|string|max:255',
            'description' => 'nullable|string',
        ]);

        $portfolio = $this->service->createPortfolio($request->only('name', 'description'));
        return response()->json($portfolio->load('holdings'), 201);
    }

    public function show(int $id): JsonResponse
    {
        $portfolio = $this->service->getPortfolio($id);
        if (! $portfolio) {
            return response()->json(['detail' => 'Portfolio not found'], 404);
        }
        return response()->json($portfolio);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $request->validate([
            'name' => 'nullable|string|max:255',
            'description' => 'nullable|string',
        ]);

        $portfolio = $this->service->updatePortfolio($id, $request->only('name', 'description'));
        if (! $portfolio) {
            return response()->json(['detail' => 'Portfolio not found'], 404);
        }
        return response()->json($portfolio);
    }

    public function destroy(int $id): JsonResponse
    {
        if (! $this->service->deletePortfolio($id)) {
            return response()->json(['detail' => 'Portfolio not found'], 404);
        }
        return response()->json(null, 204);
    }

    public function addHolding(Request $request, int $portfolioId): JsonResponse
    {
        $request->validate([
            'ticker' => 'required|string|max:20',
            'shares' => 'required|numeric',
            'cost_basis' => 'nullable|numeric',
            'asset_type' => 'nullable|string|max:50',
            'notes' => 'nullable|string',
        ]);

        $holding = $this->service->addHolding($portfolioId, $request->all());
        if (! $holding) {
            return response()->json(['detail' => 'Portfolio not found'], 404);
        }
        return response()->json($holding, 201);
    }

    public function updateHolding(Request $request, int $portfolioId, int $holdingId): JsonResponse
    {
        $request->validate([
            'ticker' => 'nullable|string|max:20',
            'shares' => 'nullable|numeric',
            'cost_basis' => 'nullable|numeric',
            'asset_type' => 'nullable|string|max:50',
            'notes' => 'nullable|string',
        ]);

        $holding = $this->service->updateHolding($holdingId, $request->all());
        if (! $holding) {
            return response()->json(['detail' => 'Holding not found'], 404);
        }
        return response()->json($holding);
    }

    public function deleteHolding(int $portfolioId, int $holdingId): JsonResponse
    {
        if (! $this->service->deleteHolding($holdingId)) {
            return response()->json(['detail' => 'Holding not found'], 404);
        }
        return response()->json(null, 204);
    }

    public function upload(Request $request): JsonResponse
    {
        $request->validate([
            'name' => 'required|string|max:255',
            'description' => 'nullable|string',
            'file' => 'required|file|mimes:csv,xlsx,xls,txt',
        ]);

        $file = $request->file('file');
        if (! $file) {
            return response()->json(['detail' => 'No file provided'], 400);
        }

        $ext = strtolower($file->getClientOriginalExtension());
        if (! in_array($ext, ['csv', 'xlsx', 'xls'])) {
            return response()->json(['detail' => 'File must be CSV or Excel (.xlsx/.xls)'], 400);
        }

        try {
            $portfolio = $this->service->importFromFile(
                $request->input('name'),
                $file,
                $file->getClientOriginalName(),
                $request->input('description'),
            );
            return response()->json($portfolio, 201);
        } catch (\InvalidArgumentException $e) {
            return response()->json(['detail' => $e->getMessage()], 400);
        }
    }
}
