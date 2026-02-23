<?php

namespace App\DataSources;

use Illuminate\Support\Facades\Http;

class Polymarket
{
    private const GAMMA_BASE_URL = 'https://gamma-api.polymarket.com';

    public function fetchEvents(int $limit = 20): array
    {
        try {
            $response = Http::timeout(15)->get(self::GAMMA_BASE_URL . '/events', [
                'limit' => $limit,
                'active' => 'true',
                'closed' => 'false',
            ]);

            if (! $response->successful()) {
                return [];
            }

            $events = $response->json();
            $results = [];

            foreach ($events as $event) {
                $markets = $event['markets'] ?? [];
                foreach ($markets as $market) {
                    $outcomePrices = $market['outcomePrices'] ?? '';
                    $probability = null;

                    if ($outcomePrices) {
                        $prices = json_decode($outcomePrices, true);
                        if (! empty($prices)) {
                            $probability = round((float) $prices[0] * 100, 1);
                        }
                    }

                    $results[] = [
                        'id' => $market['id'] ?? null,
                        'title' => $market['question'] ?? $event['title'] ?? null,
                        'description' => $event['description'] ?? '',
                        'probability' => $probability,
                        'volume' => $market['volume'] ?? null,
                        'end_date' => $market['endDate'] ?? null,
                    ];
                }
            }

            return $results;
        } catch (\Throwable $e) {
            return [];
        }
    }

    public function searchMarkets(string $query, int $limit = 10): array
    {
        try {
            $response = Http::timeout(15)->get(self::GAMMA_BASE_URL . '/markets', [
                'tag' => $query,
                'limit' => $limit,
                'active' => 'true',
                'closed' => 'false',
            ]);

            if (! $response->successful()) {
                return [];
            }

            return array_map(fn($m) => [
                'id' => $m['id'] ?? null,
                'title' => $m['question'] ?? null,
                'probability' => null,
                'volume' => $m['volume'] ?? null,
            ], $response->json());
        } catch (\Throwable $e) {
            return [];
        }
    }
}
