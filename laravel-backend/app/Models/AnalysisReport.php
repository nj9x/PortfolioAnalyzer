<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class AnalysisReport extends Model
{
    public $timestamps = false;

    protected $table = 'analysis_reports';

    protected $fillable = [
        'portfolio_id',
        'summary',
        'risk_score',
        'market_outlook',
        'raw_response',
        'context_snapshot',
        'model_used',
        'technical_summary',
        'fundamental_summary',
        'risk_analysis',
        'options_summary',
    ];

    protected $casts = [
        'risk_score' => 'integer',
        'created_at' => 'datetime',
    ];

    public function portfolio(): BelongsTo
    {
        return $this->belongsTo(Portfolio::class);
    }

    public function recommendations(): HasMany
    {
        return $this->hasMany(Recommendation::class, 'report_id');
    }
}
