<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ChartAnalysis extends Model
{
    public $timestamps = false;

    protected $table = 'chart_analyses';

    protected $fillable = [
        'image_path',
        'original_filename',
        'ticker',
        'timeframe',
        'analysis_type',
        'raw_response',
        'parsed_results',
        'model_used',
        'trend',
        'overall_bias',
    ];

    protected $casts = [
        'created_at' => 'datetime',
    ];
}
