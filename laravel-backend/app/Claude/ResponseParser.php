<?php

namespace App\Claude;

class ResponseParser
{
    public static function parseAnalysisResponse(string $rawResponse): array
    {
        // Try to find JSON in code blocks first
        if (preg_match('/```(?:json)?\s*(\{.*\})\s*```/s', $rawResponse, $matches)) {
            $decoded = json_decode($matches[1], true);
            if ($decoded !== null) {
                return $decoded;
            }
        }

        // Try parsing the entire response as JSON
        $decoded = json_decode($rawResponse, true);
        if ($decoded !== null) {
            return $decoded;
        }

        // Try to find any JSON object in the response
        if (preg_match('/\{.*\}/s', $rawResponse, $matches)) {
            $decoded = json_decode($matches[0], true);
            if ($decoded !== null) {
                return $decoded;
            }
        }

        // Try to repair truncated JSON
        $repaired = self::tryRepairJson($rawResponse);
        if ($repaired !== null) {
            $repaired['_truncated'] = true;
            return $repaired;
        }

        // Fallback
        return [
            'summary' => $rawResponse,
            'risk_score' => null,
            'market_outlook' => 'neutral',
            'recommendations' => [],
            'general_advice' => [],
            '_parse_error' => true,
        ];
    }

    private static function tryRepairJson(string $text): ?array
    {
        // Strip markdown fences
        $text = preg_replace('/^```(?:json)?\s*/m', '', trim($text));
        $text = preg_replace('/\s*```$/m', '', trim($text));

        // Remove trailing comma
        $text = rtrim(rtrim($text), ',');

        // Count open/close braces and brackets
        $openBraces = substr_count($text, '{') - substr_count($text, '}');
        $openBrackets = substr_count($text, '[') - substr_count($text, ']');

        if ($openBraces <= 0 && $openBrackets <= 0) {
            return null;
        }

        // Try to close at a reasonable boundary
        $lastChar = substr(rtrim($text), -1);
        if (! in_array($lastChar, ['}', ']', '"', 'e', 'l'])) {
            $trimPos = max(
                strrpos($text, ','),
                strrpos($text, ':'),
                strrpos($text, '['),
                strrpos($text, '{'),
            );
            if ($trimPos > strlen($text) / 2) {
                $text = substr($text, 0, $trimPos);
                $text = rtrim(rtrim($text), ',');
                $openBraces = substr_count($text, '{') - substr_count($text, '}');
                $openBrackets = substr_count($text, '[') - substr_count($text, ']');
            }
        }

        $text .= str_repeat(']', max(0, $openBrackets));
        $text .= str_repeat('}', max(0, $openBraces));

        $decoded = json_decode($text, true);
        return is_array($decoded) ? $decoded : null;
    }
}
