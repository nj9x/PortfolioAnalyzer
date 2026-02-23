<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('recommendations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('report_id')->constrained('analysis_reports')->cascadeOnDelete();
            $table->string('ticker', 20);
            $table->string('action', 20);
            $table->string('confidence', 20)->nullable();
            $table->text('reasoning');
            $table->double('target_price')->nullable();
            $table->string('time_horizon', 50)->nullable();
            $table->integer('priority')->default(0);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('recommendations');
    }
};
