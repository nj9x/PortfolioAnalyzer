<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('chart_analyses', function (Blueprint $table) {
            $table->id();
            $table->string('image_path', 500);
            $table->string('original_filename', 255)->nullable();
            $table->string('ticker', 20)->nullable();
            $table->string('timeframe', 50)->nullable();
            $table->string('analysis_type', 50)->default('technical');
            $table->longText('raw_response')->nullable();
            $table->longText('parsed_results')->nullable();
            $table->string('model_used', 100)->nullable();
            $table->string('trend', 20)->nullable();
            $table->string('overall_bias', 20)->nullable();
            $table->timestamp('created_at')->useCurrent()->index();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('chart_analyses');
    }
};
