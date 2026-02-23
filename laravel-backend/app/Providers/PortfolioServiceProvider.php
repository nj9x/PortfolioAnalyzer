<?php

namespace App\Providers;

use App\Claude\Client as ClaudeClient;
use App\DataSources\AlphaVantage;
use App\DataSources\Fred;
use App\DataSources\Fundamentals;
use App\DataSources\MassiveClient;
use App\DataSources\NewsApi;
use App\DataSources\OptionsData;
use App\DataSources\Polymarket;
use App\DataSources\TechnicalAnalysis;
use App\DataSources\YahooFinance;
use App\Services\AnalysisService;
use App\Services\ChartAnalysisService;
use App\Services\DCFService;
use App\Services\MarketDataService;
use App\Services\PortfolioService;
use App\Services\RiskService;
use Illuminate\Support\ServiceProvider;

class PortfolioServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        // Singleton data sources
        $this->app->singleton(MassiveClient::class, function () {
            $client = new MassiveClient();
            $client->validateApi();
            return $client;
        });

        $this->app->singleton(YahooFinance::class, function ($app) {
            return new YahooFinance($app->make(MassiveClient::class));
        });

        $this->app->singleton(AlphaVantage::class, function ($app) {
            return new AlphaVantage(
                $app->make(MassiveClient::class),
                $app->make(YahooFinance::class),
            );
        });

        $this->app->singleton(NewsApi::class, function ($app) {
            return new NewsApi($app->make(MassiveClient::class));
        });

        $this->app->singleton(Polymarket::class);
        $this->app->singleton(Fred::class);
        $this->app->singleton(ClaudeClient::class);

        $this->app->singleton(TechnicalAnalysis::class, function ($app) {
            return new TechnicalAnalysis($app->make(YahooFinance::class));
        });

        $this->app->singleton(Fundamentals::class, function ($app) {
            return new Fundamentals($app->make(YahooFinance::class));
        });

        $this->app->singleton(OptionsData::class, function ($app) {
            return new OptionsData(
                $app->make(MassiveClient::class),
                $app->make(AlphaVantage::class),
                $app->make(YahooFinance::class),
            );
        });

        // Services
        $this->app->singleton(RiskService::class, function ($app) {
            return new RiskService(
                $app->make(YahooFinance::class),
                $app->make(AlphaVantage::class),
            );
        });

        $this->app->singleton(MarketDataService::class, function ($app) {
            return new MarketDataService(
                $app->make(YahooFinance::class),
                $app->make(NewsApi::class),
                $app->make(Polymarket::class),
                $app->make(Fred::class),
                $app->make(TechnicalAnalysis::class),
                $app->make(Fundamentals::class),
                $app->make(OptionsData::class),
                $app->make(RiskService::class),
                $app->make(MassiveClient::class),
            );
        });

        $this->app->singleton(PortfolioService::class);

        $this->app->singleton(AnalysisService::class, function ($app) {
            return new AnalysisService(
                $app->make(MarketDataService::class),
                $app->make(ClaudeClient::class),
            );
        });

        $this->app->singleton(ChartAnalysisService::class, function ($app) {
            return new ChartAnalysisService($app->make(ClaudeClient::class));
        });

        $this->app->singleton(DCFService::class, function ($app) {
            return new DCFService(
                $app->make(YahooFinance::class),
                $app->make(AlphaVantage::class),
                $app->make(Fred::class),
            );
        });
    }

    public function boot(): void
    {
        //
    }
}
