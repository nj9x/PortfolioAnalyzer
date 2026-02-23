<?php

namespace App\Services;

use App\DataSources\AlphaVantage;
use App\DataSources\Fred;
use App\DataSources\YahooFinance;
use App\Models\DCFValuation;
use Illuminate\Support\Facades\Log;

class DCFService
{
    private YahooFinance $yahooFinance;
    private AlphaVantage $alphaVantage;
    private Fred $fred;

    public function __construct(YahooFinance $yahooFinance, AlphaVantage $alphaVantage, Fred $fred)
    {
        $this->yahooFinance = $yahooFinance;
        $this->alphaVantage = $alphaVantage;
        $this->fred = $fred;
    }

    public function fetchDcfFinancials(string $ticker): array
    {
        $info = $this->yahooFinance->fetchInfoSafe($ticker);
        $avFinancials = $this->alphaVantage->fetchFinancialStatements($ticker);
        $avOverview = $this->alphaVantage->getCompanyOverview($ticker);
        $riskFreeRate = $this->fred->fetchRiskFreeRate() ?? 0.042;

        $freeCashflow = $info['freeCashflow'] ?? $avFinancials['free_cashflow'] ?? null;
        $totalDebt = $info['totalDebt'] ?? $avFinancials['total_debt'] ?? 0;
        $totalCash = $info['totalCash'] ?? $avFinancials['total_cash'] ?? 0;
        $sharesOutstanding = $info['sharesOutstanding'] ?? $avOverview['shares_outstanding'] ?? null;
        $beta = $info['beta'] ?? $avOverview['beta'] ?? 1.0;
        $marketCap = $info['marketCap'] ?? $avOverview['market_cap'] ?? null;
        $ebitda = $info['ebitda'] ?? $avOverview['ebitda'] ?? null;
        $currentPrice = $info['currentPrice'] ?? $info['regularMarketPrice'] ?? null;

        $waccInputs = $this->computeWaccInputs($beta, $totalDebt, $marketCap, $riskFreeRate);
        $suggestedWacc = $this->calculateWacc($waccInputs);

        return [
            'ticker' => strtoupper($ticker),
            'company_name' => $info['longName'] ?? $info['shortName'] ?? $avOverview['name'] ?? null,
            'current_price' => $currentPrice,
            'free_cashflow' => $freeCashflow,
            'revenue' => $avOverview['revenue'] ?? null,
            'ebitda' => $ebitda,
            'net_income' => $info['netIncomeToCommon'] ?? $avFinancials['net_income'] ?? null,
            'total_debt' => $totalDebt,
            'total_cash' => $totalCash,
            'shares_outstanding' => $sharesOutstanding,
            'beta' => $beta,
            'market_cap' => $marketCap,
            'enterprise_value' => $info['enterpriseValue'] ?? $avOverview['enterprise_value'] ?? null,
            'revenue_growth' => $info['revenueGrowth'] ?? $avOverview['revenue_growth'] ?? null,
            'earnings_growth' => $info['earningsGrowth'] ?? $avOverview['earnings_growth'] ?? null,
            'profit_margins' => $info['profitMargins'] ?? $avOverview['profit_margin'] ?? null,
            'debt_to_equity' => $info['debtToEquity'] ?? null,
            'ev_to_ebitda' => $avOverview['ev_to_ebitda'] ?? null,
            'risk_free_rate' => $riskFreeRate,
            'suggested_wacc' => $suggestedWacc,
            'wacc_inputs' => $waccInputs,
        ];
    }

    private function computeWaccInputs(float $beta, float $totalDebt, ?float $marketCap, float $riskFreeRate): array
    {
        $equityRiskPremium = 0.055;
        $costOfDebt = $riskFreeRate + 0.015;
        $taxRate = 0.21;

        if ($marketCap && $marketCap > 0) {
            $totalCapital = $marketCap + ($totalDebt ?? 0);
            $debtWeight = $totalCapital > 0 ? ($totalDebt ?? 0) / $totalCapital : 0;
            $equityWeight = 1.0 - $debtWeight;
        } else {
            $debtWeight = 0.0;
            $equityWeight = 1.0;
        }

        return [
            'risk_free_rate' => round($riskFreeRate, 4),
            'equity_risk_premium' => $equityRiskPremium,
            'beta' => round($beta, 2),
            'cost_of_debt' => round($costOfDebt, 4),
            'tax_rate' => $taxRate,
            'debt_weight' => round($debtWeight, 4),
            'equity_weight' => round($equityWeight, 4),
        ];
    }

    private function calculateWacc(array $inputs): float
    {
        $costOfEquity = $inputs['risk_free_rate'] + $inputs['beta'] * $inputs['equity_risk_premium'];
        $afterTaxCostOfDebt = $inputs['cost_of_debt'] * (1 - $inputs['tax_rate']);
        $wacc = $inputs['equity_weight'] * $costOfEquity + $inputs['debt_weight'] * $afterTaxCostOfDebt;
        return round($wacc, 4);
    }

    public function runDcfCalculation(array $request): DCFValuation
    {
        // Determine discount rate
        $waccInputs = $request['wacc_inputs'] ?? [
            'risk_free_rate' => 0.042,
            'equity_risk_premium' => 0.055,
            'beta' => 1.0,
            'cost_of_debt' => 0.05,
            'tax_rate' => 0.21,
            'debt_weight' => 0.0,
            'equity_weight' => 1.0,
        ];

        if (isset($request['discount_rate']) && $request['discount_rate'] !== null) {
            $discountRate = $request['discount_rate'];
        } else {
            $discountRate = $this->calculateWacc($waccInputs);
        }

        $baseFcf = $request['base_fcf'];
        $projectionYears = $request['projection_years'] ?? 5;
        $growthRatePhase1 = $request['growth_rate_phase1'] ?? 0.10;
        $growthRatePhase2 = $request['growth_rate_phase2'] ?? 0.03;
        $terminalMethod = $request['terminal_method'] ?? 'gordon';
        $terminalMultiple = $request['terminal_multiple'] ?? null;

        // Phase 1: Project FCFs
        $projectedFcfs = [];
        $currentFcf = $baseFcf;
        $totalPvFcfs = 0.0;

        for ($year = 1; $year <= $projectionYears; $year++) {
            $currentFcf = $currentFcf * (1 + $growthRatePhase1);
            $discountFactor = (1 + $discountRate) ** $year;
            $pvFcf = $currentFcf / $discountFactor;
            $totalPvFcfs += $pvFcf;
            $projectedFcfs[] = [
                'year' => $year,
                'fcf' => round($currentFcf, 2),
                'pv_fcf' => round($pvFcf, 2),
                'growth_rate' => round($growthRatePhase1, 4),
            ];
        }

        // Phase 2: Terminal value
        $lastProjectedFcf = $currentFcf;

        if ($terminalMethod === 'gordon') {
            $terminalFcf = $lastProjectedFcf * (1 + $growthRatePhase2);
            $effectiveTg = min($growthRatePhase2, $discountRate - 0.005);
            $terminalValue = ($discountRate > $effectiveTg)
                ? $terminalFcf / ($discountRate - $effectiveTg)
                : 0;
        } else {
            $ebitda = $request['latest_ebitda'] ?? $lastProjectedFcf;
            $terminalValue = $ebitda * ($terminalMultiple ?? 12.0);
        }

        $pvTerminalValue = $terminalValue / ((1 + $discountRate) ** $projectionYears);

        // Enterprise Value -> Equity Bridge
        $enterpriseValue = $totalPvFcfs + $pvTerminalValue;
        $totalDebt = $request['total_debt'] ?? 0;
        $totalCash = $request['total_cash'] ?? 0;
        $sharesOutstanding = $request['shares_outstanding'] ?? 1;
        $equityValue = $enterpriseValue - $totalDebt + $totalCash;
        $intrinsicValue = $sharesOutstanding > 0 ? $equityValue / $sharesOutstanding : 0;

        // Upside / verdict
        $currentPrice = $request['current_price'] ?? null;
        $upsideDownsidePct = null;
        $marginOfSafety = null;
        $valuationVerdict = 'FAIR_VALUE';

        if ($currentPrice && $currentPrice > 0) {
            $upsideDownsidePct = round((($intrinsicValue - $currentPrice) / $currentPrice) * 100, 2);
            if ($intrinsicValue > 0) {
                $marginOfSafety = round((($intrinsicValue - $currentPrice) / $intrinsicValue) * 100, 2);
            }
            if ($upsideDownsidePct > 20) {
                $valuationVerdict = 'UNDERVALUED';
            } elseif ($upsideDownsidePct < -20) {
                $valuationVerdict = 'OVERVALUED';
            }
        }

        // Sensitivity analysis
        $sensitivityTable = $this->buildSensitivityTable(
            $baseFcf, $projectionYears, $growthRatePhase1, $discountRate, $growthRatePhase2,
            $terminalMethod, $terminalMultiple, $request['latest_ebitda'] ?? null,
            $totalDebt, $totalCash, $sharesOutstanding,
        );

        $costOfEquity = $waccInputs['risk_free_rate'] + $waccInputs['beta'] * $waccInputs['equity_risk_premium'];

        $attrs = [
            'ticker' => $request['ticker'] ?? null,
            'company_name' => $request['company_name'] ?? null,
            'base_fcf' => $baseFcf,
            'projection_years' => $projectionYears,
            'growth_rate_phase1' => $growthRatePhase1,
            'growth_rate_phase2' => $growthRatePhase2,
            'discount_rate' => $discountRate,
            'terminal_method' => $terminalMethod,
            'terminal_multiple' => $terminalMultiple,
            'risk_free_rate' => $waccInputs['risk_free_rate'],
            'equity_risk_premium' => $waccInputs['equity_risk_premium'],
            'beta' => $waccInputs['beta'],
            'cost_of_equity' => $costOfEquity,
            'cost_of_debt' => $waccInputs['cost_of_debt'],
            'tax_rate' => $waccInputs['tax_rate'],
            'debt_weight' => $waccInputs['debt_weight'],
            'equity_weight' => $waccInputs['equity_weight'],
            'total_debt' => $totalDebt,
            'total_cash' => $totalCash,
            'shares_outstanding' => $sharesOutstanding,
            'current_price' => $currentPrice,
            'enterprise_value' => round($enterpriseValue, 2),
            'equity_value' => round($equityValue, 2),
            'intrinsic_value_per_share' => round($intrinsicValue, 2),
            'upside_downside_pct' => $upsideDownsidePct,
            'margin_of_safety' => $marginOfSafety,
            'terminal_value' => round($terminalValue, 2),
            'projected_fcfs' => json_encode($projectedFcfs),
            'sensitivity_table' => json_encode($sensitivityTable),
            'valuation_verdict' => $valuationVerdict,
        ];

        $save = $request['save'] ?? true;
        if ($save) {
            return DCFValuation::create($attrs);
        }

        return new DCFValuation($attrs);
    }

    private function buildSensitivityTable(
        float $baseFcf, int $projectionYears, float $growthRatePhase1,
        float $baseWacc, float $baseTerminalGrowth, string $terminalMethod,
        ?float $terminalMultiple, ?float $latestEbitda,
        float $totalDebt, float $totalCash, float $sharesOutstanding,
    ): array {
        $waccSteps = array_map(fn($d) => $baseWacc + $d / 100, [-2, -1, 0, 1, 2]);
        $tgSteps = array_map(fn($d) => $baseTerminalGrowth + $d / 100, [-1.0, -0.5, 0, 0.5, 1.0]);

        $table = [];
        foreach ($waccSteps as $wacc) {
            $row = [];
            foreach ($tgSteps as $tg) {
                $iv = $this->quickDcf(
                    $baseFcf, $projectionYears, $growthRatePhase1, $wacc, $tg,
                    $terminalMethod, $terminalMultiple, $latestEbitda,
                    $totalDebt, $totalCash, $sharesOutstanding,
                );
                $row[] = [
                    'wacc' => round($wacc, 4),
                    'terminal_growth' => round($tg, 4),
                    'intrinsic_value' => round($iv, 2),
                ];
            }
            $table[] = $row;
        }
        return $table;
    }

    private function quickDcf(
        float $baseFcf, int $years, float $g1, float $wacc, float $g2,
        string $terminalMethod, ?float $terminalMultiple, ?float $latestEbitda,
        float $totalDebt, float $totalCash, float $sharesOutstanding,
    ): float {
        if ($wacc <= 0) return 0;

        $fcf = $baseFcf;
        $totalPv = 0.0;
        for ($y = 1; $y <= $years; $y++) {
            $fcf = $fcf * (1 + $g1);
            $totalPv += $fcf / ((1 + $wacc) ** $y);
        }

        if ($terminalMethod === 'gordon') {
            $effectiveG2 = min($g2, $wacc - 0.005);
            $terminalFcf = $fcf * (1 + $effectiveG2);
            $tv = ($wacc > $effectiveG2) ? $terminalFcf / ($wacc - $effectiveG2) : 0;
        } else {
            $ebitda = $latestEbitda ?? $fcf;
            $tv = $ebitda * ($terminalMultiple ?? 12.0);
        }

        $pvTv = $tv / ((1 + $wacc) ** $years);
        $ev = $totalPv + $pvTv;
        $equity = $ev - $totalDebt + $totalCash;

        return $sharesOutstanding > 0 ? $equity / $sharesOutstanding : 0;
    }

    public function getValuationById(int $id): ?DCFValuation
    {
        return DCFValuation::find($id);
    }

    public function getValuationHistory(?string $ticker = null, int $limit = 50): \Illuminate\Database\Eloquent\Collection
    {
        $query = DCFValuation::query();
        if ($ticker) {
            $query->where('ticker', strtoupper($ticker));
        }
        return $query->orderByDesc('created_at')->limit($limit)->get();
    }

    public function deleteValuation(int $id): bool
    {
        $record = DCFValuation::find($id);
        if (! $record) {
            return false;
        }
        $record->delete();
        return true;
    }
}
