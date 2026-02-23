<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class DCFValuation extends Model
{
    public $timestamps = false;

    protected $table = 'dcf_valuations';

    protected $fillable = [
        'ticker',
        'company_name',
        'base_fcf',
        'projection_years',
        'growth_rate_phase1',
        'growth_rate_phase2',
        'discount_rate',
        'terminal_method',
        'terminal_multiple',
        'risk_free_rate',
        'equity_risk_premium',
        'beta',
        'cost_of_equity',
        'cost_of_debt',
        'tax_rate',
        'debt_weight',
        'equity_weight',
        'total_debt',
        'total_cash',
        'shares_outstanding',
        'current_price',
        'enterprise_value',
        'equity_value',
        'intrinsic_value_per_share',
        'upside_downside_pct',
        'margin_of_safety',
        'terminal_value',
        'projected_fcfs',
        'sensitivity_table',
        'valuation_verdict',
    ];

    protected $casts = [
        'base_fcf' => 'double',
        'growth_rate_phase1' => 'double',
        'growth_rate_phase2' => 'double',
        'discount_rate' => 'double',
        'terminal_multiple' => 'double',
        'risk_free_rate' => 'double',
        'equity_risk_premium' => 'double',
        'beta' => 'double',
        'cost_of_equity' => 'double',
        'cost_of_debt' => 'double',
        'tax_rate' => 'double',
        'debt_weight' => 'double',
        'equity_weight' => 'double',
        'total_debt' => 'double',
        'total_cash' => 'double',
        'shares_outstanding' => 'double',
        'current_price' => 'double',
        'enterprise_value' => 'double',
        'equity_value' => 'double',
        'intrinsic_value_per_share' => 'double',
        'upside_downside_pct' => 'double',
        'margin_of_safety' => 'double',
        'terminal_value' => 'double',
        'created_at' => 'datetime',
    ];

    public function getProjectedFcfsArrayAttribute(): array
    {
        return json_decode($this->projected_fcfs, true) ?? [];
    }

    public function getSensitivityTableArrayAttribute(): array
    {
        return json_decode($this->sensitivity_table, true) ?? [];
    }
}
