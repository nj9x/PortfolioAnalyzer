<?php

namespace App\Services;

use App\Claude\Client as ClaudeClient;
use App\Claude\ResponseParser;
use App\Models\ChartAnalysis;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class ChartAnalysisService
{
    private const ALLOWED_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp'];

    private const MEDIA_TYPES = [
        'png' => 'image/png',
        'jpg' => 'image/jpeg',
        'jpeg' => 'image/jpeg',
        'webp' => 'image/webp',
    ];

    private ClaudeClient $claudeClient;

    public function __construct(ClaudeClient $claudeClient)
    {
        $this->claudeClient = $claudeClient;
    }

    public function analyzeChart(
        UploadedFile $file,
        string $analysisType = 'technical',
        string $userNotes = '',
    ): ChartAnalysis {
        if (empty(config('portfolio.anthropic_api_key'))) {
            throw new \InvalidArgumentException('ANTHROPIC_API_KEY is not configured');
        }

        $ext = strtolower($file->getClientOriginalExtension());
        if (! in_array($ext, self::ALLOWED_EXTENSIONS)) {
            throw new \InvalidArgumentException(
                'File must be an image (' . implode(', ', self::ALLOWED_EXTENSIONS) . ')'
            );
        }

        $imageBytes = $file->getContent();
        if (strlen($imageBytes) > 20 * 1024 * 1024) {
            throw new \InvalidArgumentException('Image file is too large (max 20MB)');
        }

        // Save to disk
        $uniqueName = Str::uuid()->toString() . '.' . $ext;
        $path = "charts/{$uniqueName}";
        Storage::disk('local')->put($path, $imageBytes);

        // Convert to base64
        $imageBase64 = base64_encode($imageBytes);
        $mediaType = self::MEDIA_TYPES[$ext] ?? 'image/png';

        // Call Claude vision API
        $rawResponse = $this->claudeClient->analyzeChartImage($imageBase64, $mediaType, $userNotes);

        // Parse response
        $parsed = ResponseParser::parseAnalysisResponse($rawResponse);

        // Persist
        return ChartAnalysis::create([
            'image_path' => $path,
            'original_filename' => $file->getClientOriginalName(),
            'ticker' => $parsed['ticker'] ?? null,
            'timeframe' => $parsed['timeframe'] ?? null,
            'analysis_type' => $analysisType,
            'raw_response' => $rawResponse,
            'parsed_results' => json_encode($parsed),
            'model_used' => config('portfolio.claude_model'),
            'trend' => $parsed['trend'] ?? null,
            'overall_bias' => $parsed['overall_bias'] ?? null,
        ]);
    }

    public function getAnalysisById(int $id): ?ChartAnalysis
    {
        return ChartAnalysis::find($id);
    }

    public function getAnalysisHistory(int $limit = 50): \Illuminate\Database\Eloquent\Collection
    {
        return ChartAnalysis::orderByDesc('created_at')
            ->limit($limit)
            ->get();
    }

    public function deleteAnalysis(int $id): bool
    {
        $record = ChartAnalysis::find($id);
        if (! $record) {
            return false;
        }

        // Delete file from disk
        if ($record->image_path && Storage::disk('local')->exists($record->image_path)) {
            Storage::disk('local')->delete($record->image_path);
        }

        $record->delete();
        return true;
    }
}
