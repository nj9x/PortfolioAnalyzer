<?php

namespace App\Services;

use App\Models\Holding;
use App\Models\Portfolio;
use App\Utils\FileParser;

class PortfolioService
{
    public function listPortfolios(): \Illuminate\Database\Eloquent\Collection
    {
        return Portfolio::with('holdings')
            ->orderByDesc('updated_at')
            ->get();
    }

    public function getPortfolio(int $id): ?Portfolio
    {
        return Portfolio::with('holdings')->find($id);
    }

    public function createPortfolio(array $data): Portfolio
    {
        return Portfolio::create([
            'name' => $data['name'],
            'description' => $data['description'] ?? null,
        ]);
    }

    public function updatePortfolio(int $id, array $data): ?Portfolio
    {
        $portfolio = Portfolio::find($id);
        if (! $portfolio) {
            return null;
        }

        if (isset($data['name'])) {
            $portfolio->name = $data['name'];
        }
        if (array_key_exists('description', $data)) {
            $portfolio->description = $data['description'];
        }
        $portfolio->save();

        return $portfolio->fresh('holdings');
    }

    public function deletePortfolio(int $id): bool
    {
        $portfolio = Portfolio::find($id);
        if (! $portfolio) {
            return false;
        }
        $portfolio->delete();
        return true;
    }

    public function addHolding(int $portfolioId, array $data): ?Holding
    {
        $portfolio = Portfolio::find($portfolioId);
        if (! $portfolio) {
            return null;
        }

        return Holding::create([
            'portfolio_id' => $portfolioId,
            'ticker' => strtoupper(trim($data['ticker'])),
            'shares' => $data['shares'],
            'cost_basis' => $data['cost_basis'] ?? null,
            'asset_type' => $data['asset_type'] ?? 'equity',
            'notes' => $data['notes'] ?? null,
        ]);
    }

    public function updateHolding(int $holdingId, array $data): ?Holding
    {
        $holding = Holding::find($holdingId);
        if (! $holding) {
            return null;
        }

        if (isset($data['ticker'])) {
            $holding->ticker = strtoupper(trim($data['ticker']));
        }
        if (isset($data['shares'])) {
            $holding->shares = $data['shares'];
        }
        if (array_key_exists('cost_basis', $data)) {
            $holding->cost_basis = $data['cost_basis'];
        }
        if (isset($data['asset_type'])) {
            $holding->asset_type = $data['asset_type'];
        }
        if (array_key_exists('notes', $data)) {
            $holding->notes = $data['notes'];
        }
        $holding->save();

        return $holding;
    }

    public function deleteHolding(int $holdingId): bool
    {
        $holding = Holding::find($holdingId);
        if (! $holding) {
            return false;
        }
        $holding->delete();
        return true;
    }

    public function importFromFile(string $name, $file, string $filename, ?string $description = null): Portfolio
    {
        $holdingsData = FileParser::parsePortfolioFile($file, $filename);

        $portfolio = Portfolio::create([
            'name' => $name,
            'description' => $description,
        ]);

        foreach ($holdingsData as $h) {
            Holding::create([
                'portfolio_id' => $portfolio->id,
                'ticker' => $h['ticker'],
                'shares' => $h['shares'],
                'cost_basis' => $h['cost_basis'] ?? null,
                'asset_type' => $h['asset_type'] ?? 'equity',
                'notes' => $h['notes'] ?? null,
            ]);
        }

        return $portfolio->fresh('holdings');
    }
}
