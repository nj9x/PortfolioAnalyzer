<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Portfolio extends Model
{
    protected $fillable = ['name', 'description'];

    public function holdings(): HasMany
    {
        return $this->hasMany(Holding::class);
    }

    public function reports(): HasMany
    {
        return $this->hasMany(AnalysisReport::class);
    }
}
