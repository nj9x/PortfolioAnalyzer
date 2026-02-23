<?php

namespace App\Utils;

class RateLimiter
{
    private int $maxRequests;
    private int $timeWindow;
    private array $requests = [];

    public function __construct(int $maxRequests, int $timeWindowSeconds)
    {
        $this->maxRequests = $maxRequests;
        $this->timeWindow = $timeWindowSeconds;
    }

    public function acquire(): void
    {
        $now = microtime(true);
        $this->requests = array_filter($this->requests, fn($t) => $now - $t < $this->timeWindow);

        if (count($this->requests) >= $this->maxRequests) {
            $sleepTime = $this->timeWindow - ($now - $this->requests[0]);
            if ($sleepTime > 0) {
                usleep((int) ($sleepTime * 1_000_000));
            }
        }

        $this->requests[] = microtime(true);
    }
}
