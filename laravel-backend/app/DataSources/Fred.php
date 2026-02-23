<?php

namespace App\DataSources;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class Fred
{
    private const INDICATORS = [
        'DFF' => 'Federal Funds Rate',
        'CPIAUCSL' => 'Consumer Price Index',
        'UNRATE' => 'Unemployment Rate',
        'GDP' => 'Gross Domestic Product',
        'T10Y2Y' => '10Y-2Y Treasury Spread',
        'VIXCLS' => 'VIX Volatility Index',
        'DGS10' => '10-Year Treasury Rate',
    ];

    private const BASE_URL = 'https://api.stlouisfed.org/fred';

    public function fetchIndicators(): array
    {
        $apiKey = config('portfolio.fred_api_key');
        if (empty($apiKey)) {
            return [];
        }

        $results = [];
        foreach (self::INDICATORS as $seriesId => $name) {
            try {
                $response = Http::timeout(10)->get(self::BASE_URL . '/series/observations', [
                    'series_id' => $seriesId,
                    'api_key' => $apiKey,
                    'file_type' => 'json',
                    'sort_order' => 'desc',
                    'limit' => 5,
                ]);

                if ($response->successful()) {
                    $observations = $response->json('observations', []);
                    foreach ($observations as $obs) {
                        if ($obs['value'] !== '.' && is_numeric($obs['value'])) {
                            $results[$seriesId] = [
                                'name' => $name,
                                'value' => round((float) $obs['value'], 4),
                                'date' => $obs['date'],
                            ];
                            break;
                        }
                    }
                }
            } catch (\Throwable $e) {
                continue;
            }
        }

        return $results;
    }

    public function fetchRiskFreeRate(): ?float
    {
        $apiKey = config('portfolio.fred_api_key');
        if (empty($apiKey)) {
            return null;
        }

        try {
            $response = Http::timeout(10)->get(self::BASE_URL . '/series/observations', [
                'series_id' => 'DGS10',
                'api_key' => $apiKey,
                'file_type' => 'json',
                'sort_order' => 'desc',
                'limit' => 5,
            ]);

            if ($response->successful()) {
                $observations = $response->json('observations', []);
                foreach ($observations as $obs) {
                    if ($obs['value'] !== '.' && is_numeric($obs['value'])) {
                        return round((float) $obs['value'] / 100, 4);
                    }
                }
            }
        } catch (\Throwable $e) {
            // Silently fail
        }

        return null;
    }
}
