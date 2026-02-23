<?php

return [
    // API Keys
    'anthropic_api_key' => env('ANTHROPIC_API_KEY', ''),
    'massive_api_key' => env('MASSIVE_API_KEY', ''),
    'news_api_key' => env('NEWS_API_KEY', ''),
    'fred_api_key' => env('FRED_API_KEY', ''),
    'alpha_vantage_api_key' => env('ALPHA_VANTAGE_API_KEY', ''),

    // Claude settings
    'claude_model' => env('CLAUDE_MODEL', 'claude-sonnet-4-5-20250929'),
    'claude_max_tokens' => (int) env('CLAUDE_MAX_TOKENS', 16384),

    // Rate limits
    'yahoo_requests_per_minute' => (int) env('YAHOO_REQUESTS_PER_MINUTE', 30),
    'news_api_requests_per_day' => (int) env('NEWS_API_REQUESTS_PER_DAY', 100),

    // Cache TTLs (seconds)
    'stock_cache_ttl' => (int) env('STOCK_CACHE_TTL', 60),
    'technical_cache_ttl' => (int) env('TECHNICAL_CACHE_TTL', 120),
    'options_cache_ttl' => (int) env('OPTIONS_CACHE_TTL', 120),
    'risk_cache_ttl' => (int) env('RISK_CACHE_TTL', 120),
    'fundamentals_cache_ttl' => (int) env('FUNDAMENTALS_CACHE_TTL', 1800),
    'alpha_vantage_cache_ttl' => (int) env('ALPHA_VANTAGE_CACHE_TTL', 3600),
    'news_cache_ttl' => (int) env('NEWS_CACHE_TTL', 900),
    'polymarket_cache_ttl' => (int) env('POLYMARKET_CACHE_TTL', 600),
    'fred_cache_ttl' => (int) env('FRED_CACHE_TTL', 86400),

    // Massive API base URL
    'massive_base_url' => env('MASSIVE_BASE_URL', 'https://api.massive.com'),
];
