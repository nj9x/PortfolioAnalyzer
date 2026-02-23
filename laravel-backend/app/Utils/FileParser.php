<?php

namespace App\Utils;

class FileParser
{
    private const COLUMN_MAPPINGS = [
        'ticker' => ['ticker', 'symbol', 'stock', 'stock_symbol', 'security'],
        'shares' => ['shares', 'quantity', 'qty', 'units', 'amount'],
        'cost_basis' => ['cost_basis', 'cost', 'purchase_price', 'avg_cost', 'average_cost', 'price_paid', 'buy_price'],
        'asset_type' => ['asset_type', 'type', 'asset_class', 'category', 'security_type'],
        'notes' => ['notes', 'note', 'comments', 'description'],
    ];

    /**
     * Parse a CSV or Excel file into a list of holding arrays.
     */
    public static function parsePortfolioFile($file, string $filename): array
    {
        if ($file instanceof \Illuminate\Http\UploadedFile) {
            $content = $file->getContent();
            $filename = $file->getClientOriginalName();
        } else {
            $content = is_string($file) ? $file : stream_get_contents($file);
        }

        $ext = strtolower(pathinfo($filename, PATHINFO_EXTENSION));

        if (in_array($ext, ['xlsx', 'xls'])) {
            $rows = self::parseExcel($content, $ext);
        } else {
            $rows = self::parseCsv($content);
        }

        if (empty($rows)) {
            throw new \InvalidArgumentException('No valid holdings found in file');
        }

        return $rows;
    }

    private static function parseCsv(string $content): array
    {
        $lines = explode("\n", trim($content));
        if (count($lines) < 2) {
            throw new \InvalidArgumentException('File must have a header row and at least one data row');
        }

        $header = str_getcsv(array_shift($lines));
        $header = array_map(fn($h) => strtolower(trim(str_replace(' ', '_', $h))), $header);
        $columnMap = self::buildColumnMap($header);

        if (! isset($columnMap['ticker'])) {
            throw new \InvalidArgumentException(
                "File must contain a 'ticker' or 'symbol' column. Found columns: " . implode(', ', $header)
            );
        }
        if (! isset($columnMap['shares'])) {
            throw new \InvalidArgumentException(
                "File must contain a 'shares' or 'quantity' column. Found columns: " . implode(', ', $header)
            );
        }

        $holdings = [];
        foreach ($lines as $line) {
            $line = trim($line);
            if (empty($line)) continue;

            $row = str_getcsv($line);
            $ticker = strtoupper(trim($row[$columnMap['ticker']] ?? ''));
            if (empty($ticker) || $ticker === 'NAN') continue;

            $shares = (float) ($row[$columnMap['shares']] ?? 0);
            $costBasis = isset($columnMap['cost_basis']) && isset($row[$columnMap['cost_basis']])
                ? (is_numeric($row[$columnMap['cost_basis']]) ? (float) $row[$columnMap['cost_basis']] : null)
                : null;
            $assetType = isset($columnMap['asset_type']) && isset($row[$columnMap['asset_type']])
                ? strtolower(trim($row[$columnMap['asset_type']]))
                : 'equity';
            $notes = isset($columnMap['notes']) && isset($row[$columnMap['notes']])
                ? trim($row[$columnMap['notes']])
                : null;

            $holdings[] = [
                'ticker' => $ticker,
                'shares' => $shares,
                'cost_basis' => $costBasis,
                'asset_type' => $assetType,
                'notes' => $notes ?: null,
            ];
        }

        if (empty($holdings)) {
            throw new \InvalidArgumentException('No valid holdings found in file');
        }

        return $holdings;
    }

    private static function parseExcel(string $content, string $ext): array
    {
        // Write to temp file for Excel parsing
        $tmpFile = tempnam(sys_get_temp_dir(), 'portfolio_') . '.' . $ext;
        file_put_contents($tmpFile, $content);

        try {
            // Use PhpSpreadsheet if available, otherwise try CSV conversion
            if (class_exists(\PhpOffice\PhpSpreadsheet\IOFactory::class)) {
                $spreadsheet = \PhpOffice\PhpSpreadsheet\IOFactory::load($tmpFile);
                $sheet = $spreadsheet->getActiveSheet();
                $data = $sheet->toArray();

                if (count($data) < 2) {
                    throw new \InvalidArgumentException('File must have a header row and at least one data row');
                }

                $header = array_map(fn($h) => strtolower(trim(str_replace(' ', '_', (string) $h))), $data[0]);
                $columnMap = self::buildColumnMap($header);

                if (! isset($columnMap['ticker']) || ! isset($columnMap['shares'])) {
                    throw new \InvalidArgumentException('File must contain ticker and shares columns');
                }

                $holdings = [];
                for ($i = 1; $i < count($data); $i++) {
                    $row = $data[$i];
                    $ticker = strtoupper(trim((string) ($row[$columnMap['ticker']] ?? '')));
                    if (empty($ticker) || $ticker === 'NAN') continue;

                    $holdings[] = [
                        'ticker' => $ticker,
                        'shares' => (float) ($row[$columnMap['shares']] ?? 0),
                        'cost_basis' => isset($columnMap['cost_basis']) && is_numeric($row[$columnMap['cost_basis']] ?? null)
                            ? (float) $row[$columnMap['cost_basis']] : null,
                        'asset_type' => isset($columnMap['asset_type'])
                            ? strtolower(trim((string) ($row[$columnMap['asset_type']] ?? 'equity'))) : 'equity',
                        'notes' => isset($columnMap['notes'])
                            ? (trim((string) ($row[$columnMap['notes']] ?? '')) ?: null) : null,
                    ];
                }

                return $holdings;
            }

            throw new \InvalidArgumentException('Excel file parsing requires PhpSpreadsheet. Please upload a CSV file instead.');
        } finally {
            @unlink($tmpFile);
        }
    }

    private static function buildColumnMap(array $header): array
    {
        $map = [];
        foreach (self::COLUMN_MAPPINGS as $standardName => $variations) {
            foreach ($header as $idx => $col) {
                if (in_array($col, $variations) && ! isset($map[$standardName])) {
                    $map[$standardName] = $idx;
                    break;
                }
            }
        }
        return $map;
    }
}
