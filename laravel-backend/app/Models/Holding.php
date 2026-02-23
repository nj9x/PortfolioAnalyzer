<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Holding extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'portfolio_id',
        'ticker',
        'shares',
        'cost_basis',
        'asset_type',
        'notes',
    ];

    protected $casts = [
        'shares' => 'double',
        'cost_basis' => 'double',
        'added_at' => 'datetime',
    ];

    public function portfolio(): BelongsTo
    {
        return $this->belongsTo(Portfolio::class);
    }
}
