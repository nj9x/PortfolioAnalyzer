<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('dcf_valuations', function (Blueprint $table) {
            $table->id();
            $table->string('ticker', 20)->nullable()->index();
            $table->string('company_name', 255)->nullable();

            // Core inputs
            $table->double('base_fcf');
            $table->integer('projection_years')->default(5);
            $table->double('growth_rate_phase1');
            $table->double('growth_rate_phase2');
            $table->double('discount_rate');
            $table->string('terminal_method', 20)->default('gordon');
            $table->double('terminal_multiple')->nullable();

            // WACC components
            $table->double('risk_free_rate')->nullable();
            $table->double('equity_risk_premium')->nullable();
            $table->double('beta')->nullable();
            $table->double('cost_of_equity')->nullable();
            $table->double('cost_of_debt')->nullable();
            $table->double('tax_rate')->nullable();
            $table->double('debt_weight')->nullable();
            $table->double('equity_weight')->nullable();

            // Balance sheet adjustments
            $table->double('total_debt')->nullable();
            $table->double('total_cash')->nullable();
            $table->double('shares_outstanding')->nullable();
            $table->double('current_price')->nullable();

            // Computed results
            $table->double('enterprise_value')->nullable();
            $table->double('equity_value')->nullable();
            $table->double('intrinsic_value_per_share')->nullable();
            $table->double('upside_downside_pct')->nullable();
            $table->double('margin_of_safety')->nullable();
            $table->double('terminal_value')->nullable();

            // JSON blobs
            $table->longText('projected_fcfs')->nullable();
            $table->longText('sensitivity_table')->nullable();
            $table->string('valuation_verdict', 30)->nullable();

            $table->timestamp('created_at')->useCurrent()->index();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('dcf_valuations');
    }
};
