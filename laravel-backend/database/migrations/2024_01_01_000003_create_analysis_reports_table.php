<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('analysis_reports', function (Blueprint $table) {
            $table->id();
            $table->foreignId('portfolio_id')->constrained()->cascadeOnDelete();
            $table->text('summary');
            $table->integer('risk_score')->nullable();
            $table->string('market_outlook', 50)->nullable();
            $table->longText('raw_response')->nullable();
            $table->longText('context_snapshot')->nullable();
            $table->string('model_used', 100)->nullable();
            $table->longText('technical_summary')->nullable();
            $table->longText('fundamental_summary')->nullable();
            $table->longText('risk_analysis')->nullable();
            $table->longText('options_summary')->nullable();
            $table->timestamp('created_at')->useCurrent()->index();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('analysis_reports');
    }
};
