<?php

use App\Http\Controllers\Api\AnalysisController;
use App\Http\Controllers\Api\ChartAnalysisController;
use App\Http\Controllers\Api\DCFController;
use App\Http\Controllers\Api\MarketDataController;
use App\Http\Controllers\Api\PortfolioController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| API Routes — /api/v1
|--------------------------------------------------------------------------
|
| All routes match the original FastAPI endpoints one-to-one:
|   - /api/v1/portfolios   (CRUD + holdings + upload)
|   - /api/v1/market-data  (quotes, news, predictions, economic, technicals, etc.)
|   - /api/v1/analysis     (AI analysis trigger + history)
|   - /api/v1/chart-analysis (chart upload + vision analysis)
|   - /api/v1/dcf          (DCF calculator)
|   - /api/v1/health       (health check)
|
*/

Route::prefix('v1')->group(function () {

    // Health check
    Route::get('/health', function () {
        $massive = app(\App\DataSources\MassiveClient::class);
        $massiveOk = $massive->isAvailable();
        return response()->json([
            'status' => $massiveOk ? 'ok' : 'degraded',
            'massive_api' => [
                'available' => $massiveOk,
                'status' => $massive->getStatus(),
                'priority' => true,
            ],
        ]);
    });

    // Portfolios
    Route::prefix('portfolios')->group(function () {
        Route::get('/', [PortfolioController::class, 'index']);
        Route::post('/', [PortfolioController::class, 'store']);
        Route::post('/upload', [PortfolioController::class, 'upload']);
        Route::get('/{id}', [PortfolioController::class, 'show']);
        Route::put('/{id}', [PortfolioController::class, 'update']);
        Route::delete('/{id}', [PortfolioController::class, 'destroy']);
        Route::post('/{portfolioId}/holdings', [PortfolioController::class, 'addHolding']);
        Route::put('/{portfolioId}/holdings/{holdingId}', [PortfolioController::class, 'updateHolding']);
        Route::delete('/{portfolioId}/holdings/{holdingId}', [PortfolioController::class, 'deleteHolding']);
    });

    // Market Data
    Route::prefix('market-data')->group(function () {
        Route::get('/quotes', [MarketDataController::class, 'quotes']);
        Route::get('/news', [MarketDataController::class, 'news']);
        Route::get('/predictions', [MarketDataController::class, 'predictions']);
        Route::get('/economic', [MarketDataController::class, 'economic']);
        Route::get('/technicals', [MarketDataController::class, 'technicals']);
        Route::get('/fundamentals', [MarketDataController::class, 'fundamentals']);
        Route::get('/options', [MarketDataController::class, 'options']);
        Route::get('/risk', [MarketDataController::class, 'risk']);
        Route::get('/status', [MarketDataController::class, 'status']);
        Route::post('/refresh', [MarketDataController::class, 'refresh']);
    });

    // Analysis
    Route::prefix('analysis')->group(function () {
        Route::post('/{portfolioId}/analyze', [AnalysisController::class, 'analyze']);
        Route::get('/{portfolioId}/latest', [AnalysisController::class, 'latest']);
        Route::get('/{portfolioId}/history', [AnalysisController::class, 'history']);
        Route::get('/report/{reportId}', [AnalysisController::class, 'show']);
    });

    // Chart Analysis
    Route::prefix('chart-analysis')->group(function () {
        Route::post('/analyze', [ChartAnalysisController::class, 'analyze']);
        Route::get('/history', [ChartAnalysisController::class, 'history']);
        Route::get('/image/{id}', [ChartAnalysisController::class, 'image']);
        Route::get('/{id}', [ChartAnalysisController::class, 'show']);
        Route::delete('/{id}', [ChartAnalysisController::class, 'destroy']);
    });

    // DCF Valuation
    Route::prefix('dcf')->group(function () {
        Route::get('/financials/{ticker}', [DCFController::class, 'financials']);
        Route::post('/calculate', [DCFController::class, 'calculate']);
        Route::get('/history', [DCFController::class, 'history']);
        Route::get('/{id}', [DCFController::class, 'show']);
        Route::delete('/{id}', [DCFController::class, 'destroy']);
    });
});
