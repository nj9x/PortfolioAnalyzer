<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Recommendation extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'report_id',
        'ticker',
        'action',
        'confidence',
        'reasoning',
        'target_price',
        'time_horizon',
        'priority',
    ];

    protected $casts = [
        'target_price' => 'double',
        'priority' => 'integer',
    ];

    public function report(): BelongsTo
    {
        return $this->belongsTo(AnalysisReport::class, 'report_id');
    }
}
