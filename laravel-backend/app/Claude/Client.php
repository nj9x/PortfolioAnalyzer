<?php

namespace App\Claude;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class Client
{
    private const API_URL = 'https://api.anthropic.com/v1/messages';

    public function analyzePortfolio(string $userMessage): string
    {
        $response = $this->sendMessage(Prompts::SYSTEM_PROMPT, $userMessage);
        return $response;
    }

    public function analyzeChartImage(string $imageBase64, string $mediaType, string $userNotes = ''): string
    {
        $content = [
            [
                'type' => 'image',
                'source' => [
                    'type' => 'base64',
                    'media_type' => $mediaType,
                    'data' => $imageBase64,
                ],
            ],
            [
                'type' => 'text',
                'text' => 'Analyze this TradingView chart screenshot. '
                    . 'Identify all key levels, patterns, and provide trading suggestions. '
                    . 'Respond ONLY with valid JSON matching the structure specified in your instructions.'
                    . ($userNotes ? "\n\nAdditional context from user: {$userNotes}" : ''),
            ],
        ];

        return $this->sendMessageWithContent(ChartPrompts::SYSTEM_PROMPT, $content);
    }

    private function sendMessage(string $systemPrompt, string $userMessage): string
    {
        $apiKey = config('portfolio.anthropic_api_key');
        $model = config('portfolio.claude_model');
        $maxTokens = config('portfolio.claude_max_tokens', 16384);

        $response = Http::timeout(120)
            ->withHeaders([
                'x-api-key' => $apiKey,
                'anthropic-version' => '2023-06-01',
                'content-type' => 'application/json',
            ])
            ->post(self::API_URL, [
                'model' => $model,
                'max_tokens' => $maxTokens,
                'system' => $systemPrompt,
                'messages' => [
                    ['role' => 'user', 'content' => $userMessage],
                ],
            ]);

        if (! $response->successful()) {
            Log::error('Claude API request failed', [
                'status' => $response->status(),
                'body' => $response->body(),
            ]);
            throw new \RuntimeException("Claude API request failed: {$response->status()}");
        }

        $data = $response->json();

        if (($data['stop_reason'] ?? '') === 'max_tokens') {
            Log::warning("Claude response was truncated (hit max_tokens={$maxTokens}).");
        }

        return $data['content'][0]['text'] ?? '';
    }

    private function sendMessageWithContent(string $systemPrompt, array $content): string
    {
        $apiKey = config('portfolio.anthropic_api_key');
        $model = config('portfolio.claude_model');
        $maxTokens = config('portfolio.claude_max_tokens', 16384);

        $response = Http::timeout(120)
            ->withHeaders([
                'x-api-key' => $apiKey,
                'anthropic-version' => '2023-06-01',
                'content-type' => 'application/json',
            ])
            ->post(self::API_URL, [
                'model' => $model,
                'max_tokens' => $maxTokens,
                'system' => $systemPrompt,
                'messages' => [
                    ['role' => 'user', 'content' => $content],
                ],
            ]);

        if (! $response->successful()) {
            Log::error('Claude API request failed', [
                'status' => $response->status(),
                'body' => $response->body(),
            ]);
            throw new \RuntimeException("Claude API request failed: {$response->status()}");
        }

        $data = $response->json();

        if (($data['stop_reason'] ?? '') === 'max_tokens') {
            Log::warning("Claude chart analysis response was truncated (hit max_tokens={$maxTokens}).");
        }

        return $data['content'][0]['text'] ?? '';
    }
}
