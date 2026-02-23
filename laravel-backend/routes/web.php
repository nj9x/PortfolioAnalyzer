<?php

use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Web Routes — SPA frontend
|--------------------------------------------------------------------------
|
| Serve the React SPA from the frontend-dist directory.
| All non-API routes fall through to the SPA index.html.
|
*/

$frontendDir = env('FRONTEND_DIR', base_path('../frontend/dist'));

Route::get('/{any?}', function () use ($frontendDir) {
    $indexPath = $frontendDir . '/index.html';
    if (file_exists($indexPath)) {
        return response()->file($indexPath);
    }
    return response()->json([
        'app' => 'PortfolioAnalyzer',
        'version' => '1.0.0',
        'docs' => '/api/v1/health',
        'note' => 'Frontend not built. Run "npm run build" in the frontend directory.',
    ]);
})->where('any', '^(?!api).*$');
